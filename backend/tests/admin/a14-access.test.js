'use strict';

// 문 1(클라우드플레어 Access 표) 요청 시험: 표 없음·틀림 403, 맞으면 로그인 단계까지, 공개키 서버가 죽었을 때·느릴 때·모르는 kid
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-037~043 (DB 없음, 돌리기: node --env-file=.env.test --test)
// 모델이 DB에 안 붙게 닿지 않는 주소로 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const { startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { createAccessKeys, makeKeyPair } = require('./helpers/accessKeys');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { gateEnv } = require('./a14-gate-helpers');

let server = null;
test.before(async () => {
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    await require('../../models').sequelize.close();
});

// 시험마다 새 공개키 서버 (주소가 달라 서버 쪽 공개키 보관본도 새로 시작)
const freshKeys = async (t) => {
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    t.after(gateEnv({ ADMIN_ACCESS_MODE: undefined, ...keys.env }));
    return keys;
};

const getMembers = (accessToken) => createAgent({ url: server.url, ip: randomIp(), accessToken }).get('/admin-api/members');

test('A14-B-037 Access 표 없음 → 403 ADMIN_ACCESS_REQUIRED', async (t) => {
    await freshKeys(t);
    const res = await getMembers(null);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED');
});

test('A14-B-038 틀린 표(다른 열쇠 서명) → 403 ADMIN_ACCESS_REQUIRED', async (t) => {
    const keys = await freshKeys(t);
    const res = await getMembers(keys.sign({}, { privateKey: keys.otherKey().privateKey }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED');
});

test('A14-B-039 맞는 표 → 다음 단계 401 ADMIN_LOGIN_REQUIRED까지 감', async (t) => {
    const keys = await freshKeys(t);
    const res = await getMembers(keys.sign());
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
});

test('A14-B-040 공개키 서버 안 됨 + 보관본 없음 → 503 ADMIN_ACCESS_UNAVAILABLE', async (t) => {
    const keys = await freshKeys(t);
    keys.failNext(100);
    const res = await getMembers(keys.sign());
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ADMIN_ACCESS_UNAVAILABLE');
});

test('A14-B-041 보관본 있으면 공개키 서버가 죽어도 통과', async (t) => {
    const keys = await freshKeys(t);
    const token = keys.sign();
    assert.equal((await getMembers(token)).status, 401, '처음 한 번으로 공개키 보관');
    await keys.close();
    const res = await getMembers(token);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
});

test('A14-B-042 모르는 kid 표 두 번 → 공개키 다시 받기는 1분에 1번', async (t) => {
    // 서버 시계를 가짜로 (1분 넘김을 기다리지 않게), 공개키 서버는 진짜
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const keys = await freshKeys(t);
    assert.equal((await getMembers(keys.sign())).status, 401);
    assert.equal(keys.requestCount(), 1, '처음 받기 1번');
    t.mock.timers.tick(61 * 1000);
    const stranger = makeKeyPair('a14-gate-unknown-kid');
    const unknown = keys.sign({}, { privateKey: stranger.privateKey, kid: 'a14-gate-unknown-kid' });
    assert.equal((await getMembers(unknown)).status, 403);
    assert.equal((await getMembers(unknown)).status, 403);
    assert.equal(keys.requestCount(), 2, '모르는 kid 두 번에 다시 받기는 1번');
});

test('A14-B-043 공개키 서버가 3초 넘게 답 없음 → 503 ADMIN_ACCESS_UNAVAILABLE', async (t) => {
    // 받기만 하고 답을 안 하는 공개키 서버
    const hang = http.createServer(() => {});
    const { url } = await listenOnFetchablePort(hang);
    t.after(() => new Promise((resolve) => { hang.closeAllConnections(); hang.close(resolve); }));
    const key = makeKeyPair('a14-gate-hang-kid');
    const team = 'a14-gate-hang.cloudflareaccess.com';
    const aud = 'a14-gate-hang-aud';
    t.after(gateEnv({
        ADMIN_ACCESS_MODE: undefined, ADMIN_ACCESS_TEAM_DOMAIN: team, ADMIN_ACCESS_AUD: aud, ADMIN_ACCESS_CERTS_URL: `${url}/cdn-cgi/access/certs`,
    }));
    const token = jwt.sign({ email: 'boss@example.test' }, key.privateKey, {
        algorithm: 'RS256', keyid: key.kid, issuer: `https://${team}`, audience: [aud], expiresIn: '1h',
    });
    const started = Date.now();
    const res = await getMembers(token);
    const took = Date.now() - started;
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ADMIN_ACCESS_UNAVAILABLE');
    assert.ok(took >= 2900 && took < 10000, `걸린 시간 ${took}ms`);
});

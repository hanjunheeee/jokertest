'use strict';

// 관리자 페이지 꺼짐 시험: OTP 잠금 열쇠가 없거나 모양이 틀리면 /admin-api 전체 404, 운영에선 시험용 끄기 값이 안 먹음
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-031~036 (DB 없음, 돌리기: node --env-file=.env.test --test)
// 모델이 DB에 안 붙게 닿지 않는 주소로 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { createAccessKeys, TEAM_DOMAIN } = require('./helpers/accessKeys');
const { gateEnv, FAKE_TOTP_KEY } = require('./a14-gate-helpers');

let server = null;
test.before(async () => {
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    await require('../../models').sequelize.close();
});

const agent = (options = {}) => createAgent({ url: server.url, ip: randomIp(), ...options });

// 404 몸 모양: 칸 이름·값 그대로, 개발 모드에만 붙는 스택 글(error)은 첫 줄만 (지나온 길이 달라 줄이 다름)
const shapeOf = (body) => (body && typeof body.error === 'string' ? { ...body, error: body.error.split('\n')[0] } : body);

// 없는 경로 404 몸 모양 (비교 기준)
const plainNotFound = async () => {
    const res = await agent().get('/a14-gate-no-such-path');
    assert.equal(res.status, 404);
    return shapeOf(res.body);
};

// 열쇠 모양마다 /auth/me·/members 둘 다 없는 경로와 같은 404
const OFF_KEYS = [
    ['031', 'ADMIN_TOTP_KEY 없음', undefined],
    ['032', 'ADMIN_TOTP_KEY 16진수 63자', 'ab'.repeat(31) + 'a'],
];
for (const [no, label, key] of OFF_KEYS) {
    test(`A14-B-${no} ${label} → /admin-api/auth/me·/admin-api/members 모두 404, 없는 경로 404와 같은 모양`, async (t) => {
        t.after(gateEnv({ ADMIN_TOTP_KEY: key }));
        const expected = await plainNotFound();
        for (const path of ['/admin-api/auth/me', '/admin-api/members']) {
            const res = await agent().get(path);
            assert.equal(res.status, 404, path);
            assert.deepEqual(shapeOf(res.body), expected, path);
        }
    });
}

test('A14-B-033 ADMIN_TOTP_KEY 16진수 64자 → /admin-api/members 401 (켜짐)', async (t) => {
    t.after(gateEnv({ ADMIN_TOTP_KEY: FAKE_TOTP_KEY }));
    const res = await agent().get('/admin-api/members');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
});

// 운영 팀 주소로 가는 공개키 받기를 가로챔 (진짜 클라우드플레어로 안 나가게) → 물어본 주소 목록
const interceptTeamFetch = (t, answer) => {
    const realFetch = globalThis.fetch;
    const asked = [];
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        const url = String(input?.url ?? input);
        if (url.startsWith(`https://${TEAM_DOMAIN}/`)) {
            asked.push(url);
            return answer(realFetch, init);
        }
        return realFetch(input, init);
    });
    return asked;
};

test('A14-B-034 운영 + ADMIN_ACCESS_MODE=off → Access 표 없으면 403 ADMIN_ACCESS_REQUIRED', async (t) => {
    t.after(gateEnv({
        NODE_ENV: 'production', ADMIN_ACCESS_MODE: 'off', ADMIN_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ADMIN_ACCESS_AUD: 'a14-gate-fake-aud',
    }));
    const res = await agent().get('/admin-api/members');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED');
});

test('A14-B-035 운영 + ADMIN_ACCESS_CERTS_URL 시험 주소 → 무시, 공개키는 팀 주소에서만 받음', async (t) => {
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    t.after(gateEnv({ NODE_ENV: 'production', ADMIN_ACCESS_MODE: undefined, ...keys.env }));
    // 팀 주소는 닿지 않는 것으로 (진짜 서버 대신)
    const asked = interceptTeamFetch(t, async () => new Response('', { status: 500 }));
    const res = await agent({ accessToken: keys.sign() }).get('/admin-api/members');
    assert.equal(keys.requestCount(), 0, '시험 공개키 주소는 안 물어봄');
    assert.ok(asked.length >= 1, '팀 주소 공개키를 물어봄');
    assert.ok(asked.every((url) => url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`), asked.join(','));
    assert.notEqual(res.status, 401, '시험 열쇠로 서명한 표가 통과하면 안 됨');
});

test('A14-B-036 운영 + 팀 이름·AUD 없음 → /admin-api/members 404', async (t) => {
    t.after(gateEnv({ NODE_ENV: 'production', ADMIN_ACCESS_MODE: undefined }));
    const expected = await plainNotFound();
    const res = await agent().get('/admin-api/members');
    assert.equal(res.status, 404);
    assert.deepEqual(shapeOf(res.body), expected);
});

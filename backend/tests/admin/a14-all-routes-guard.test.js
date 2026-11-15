'use strict';

// 로그인 없으면 관리자 전 경로가 막히는지 시험: 영역 경로 42개 하나씩·플레이어 토큰(role=ADMIN·USER)·지어낸 관리자 쿠키 → 모두 401
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-044~106 (DB 없음, 돌리기: node --env-file=.env.test --test)
// 모델이 DB에 안 붙게 닿지 않는 주소로 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { createAccessKeys } = require('./helpers/accessKeys');
const { listAdminRoutes, fillPath, dummyValues } = require('./helpers/adminRoutes');
const { gateEnv } = require('./a14-gate-helpers');
const { generateToken } = require('../../utils/auth/credentials');

// 경로 표는 라우터에서 읽음 (손으로 안 적음) — 영역 경로만, auth 3개 뺌
const AREA_ROUTES = listAdminRoutes().filter((route) => !route.isAuth);
const AREA_COUNT = 42;
// 영역 붙는 자리 19곳마다 첫 경로
const MOUNT_FIRST = [...new Map(AREA_ROUTES.map((route) => [route.mount, route])).values()]
    .map((route) => AREA_ROUTES.find((r) => r.mount === route.mount));
const MOUNT_COUNT = 19;

let server = null;
let keys = null;
let restoreEnv = null;
test.before(async () => {
    keys = await createAccessKeys();
    restoreEnv = gateEnv({ ADMIN_ACCESS_MODE: undefined, ...keys.env });
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    if (keys) await keys.close();
    if (restoreEnv) restoreEnv();
    await require('../../models').sequelize.close();
});

// 맞는 Access 표를 단 요청 도구 (관리자 쿠키 없음)
const accessAgent = () => createAgent({ url: server.url, ip: randomIp(), accessToken: keys.sign() });
const send = (agent, route, headers) => agent.request(route.method, fillPath(route, dummyValues()), {
    body: route.isWrite ? {} : undefined, headers,
});

// ── A14-B-044~085: 영역 경로 42개 (목록 기준 수) ──
// 마지막 번호(085)가 42번째 뒤에 남은 경로까지 보고 나서 경로 수를 맞춰 봄 → 수가 다르면 "목록 바뀜"으로 실패
const expectBlocked = async (route) => {
    const res = await send(accessAgent(), route);
    assert.equal(res.status, 401, route.key);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED', route.key);
    assert.equal(res.headers.get('cache-control'), 'no-store', route.key);
};
for (let i = 0; i < AREA_COUNT; i += 1) {
    const last = i === AREA_COUNT - 1;
    const route = AREA_ROUTES[i];
    const no = String(44 + i).padStart(3, '0');
    const label = last ? `${route ? route.key : '(경로 없음)'} 와 남은 경로 + 경로 수 ${AREA_COUNT}` : (route ? route.key : '(경로 없음)');
    test(`A14-B-${no} 로그인 없음 ${label} → 401 ADMIN_LOGIN_REQUIRED·no-store`, async () => {
        assert.ok(route, `목록 바뀜: 영역 경로 ${AREA_ROUTES.length}개`);
        for (const each of last ? AREA_ROUTES.slice(i) : [route]) await expectBlocked(each);
        if (last) assert.equal(AREA_ROUTES.length, AREA_COUNT, `목록 바뀜: 영역 경로 ${AREA_ROUTES.length}개`);
    });
}

// 플레이어 로그인 토큰 (플레이어 로그인이 만드는 모양 그대로: uuid·role·sessionId)
const playerToken = (role) => generateToken({ uuid: crypto.randomUUID(), role, sessionId: crypto.randomUUID() });
const playerHeaders = (role) => {
    const token = playerToken(role);
    return { cookie: `accessToken=${token}`, authorization: `Bearer ${token}` };
};

// ── A14-B-086~104: 플레이어 토큰(role=ADMIN) + 맞는 Access 표, 붙는 자리 19곳 첫 경로 ──
for (let i = 0; i < MOUNT_COUNT; i += 1) {
    const route = MOUNT_FIRST[i];
    const no = String(86 + i).padStart(3, '0');
    test(`A14-B-${no} 플레이어 토큰(role=ADMIN) ${route ? route.key : '(자리 없음)'} → 401`, async () => {
        assert.equal(MOUNT_FIRST.length, MOUNT_COUNT, `목록 바뀜: 붙는 자리 ${MOUNT_FIRST.length}곳`);
        const res = await send(accessAgent(), route, playerHeaders('ADMIN'));
        assert.equal(res.status, 401);
    });
}

test('A14-B-105 플레이어 토큰(role=USER) → GET /admin-api/members 401', async () => {
    const res = await accessAgent().get('/admin-api/members', { headers: playerHeaders('USER') });
    assert.equal(res.status, 401);
});

test('A14-B-106 지어낸 관리자 쿠키(아무 64자) → 401 ADMIN_LOGIN_REQUIRED', async () => {
    const fake = crypto.randomBytes(32).toString('hex');
    const res = await accessAgent().get('/admin-api/members', { headers: { cookie: `mmc_admin_sid=${fake}` } });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
});

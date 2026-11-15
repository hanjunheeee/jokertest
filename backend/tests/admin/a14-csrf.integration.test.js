'use strict';

// 관리자 쓰기 확인(CSRF) 시험: 로그인한 관리자라도 쓰기 확인값·Origin이 틀리면 쓰기 경로 전부 403이고 DB는 그대로, 읽기는 확인값 없이 됨
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-140~163 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const db = require('../../models');
const { prepareAdminDb, startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { listAdminRoutes, fillPath } = require('./helpers/adminRoutes');
const G = require('./a14-gate-helpers');

// 쓰기 경로 표는 라우터에서 읽음 (손으로 안 적음) — auth 빼고
const WRITE_ROUTES = listAdminRoutes().filter((route) => route.isWrite && !route.isAuth);
const WRITE_COUNT = 20;

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

let prepared = null;
let server = null;
let restoreEnv = null;
let boss = null;
let memberUuid = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    restoreEnv = G.gateEnv();
    prepared = await prepareAdminDb();
    server = await startAdminServer();
    boss = await loggedIn('csrf');
    memberUuid = await createMember();
});
test.after(async () => {
    if (server) await server.close();
    if (restoreEnv) restoreEnv();
    if (prepared) await prepared.close();
    else await db.sequelize.close();
});

// 로그인한 관리자 → { admin, agent } (agent.csrfToken = 받은 쓰기 확인값)
async function loggedIn(tag) {
    const admin = await G.makeAdmin(tag);
    const agent = createAgent({ url: server.url, ip: randomIp() });
    const res = await G.goodLogin(agent, admin);
    assert.equal(res.status, 200, `로그인 ${res.status} ${res.body?.code}`);
    agent.csrfToken = res.body.csrfToken;
    return { admin, agent };
}

// 시험 회원 하나 (정지 대상)
async function createMember() {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid, password_hash: 'not-a-real-hash', nickname: `g14a${uuid.slice(0, 6)}`, email: `${G.NAME_PREFIX}-${uuid}@example.test`,
    });
    return uuid;
}

// 표마다 내용 검사값 (줄 수·값이 바뀌면 달라짐), 세션 표는 활동 시각이 바뀔 수 있어 뺌
let tableNames = null;
async function tableChecksums() {
    if (!tableNames) {
        const rows = await db.sequelize.query('SHOW TABLES', { type: db.Sequelize.QueryTypes.SELECT });
        tableNames = rows.map((row) => Object.values(row)[0]).filter((name) => name !== 'admin_sessions');
    }
    const sums = await db.sequelize.query(`CHECKSUM TABLE ${tableNames.map((name) => `\`${name}\``).join(', ')}`, { type: db.Sequelize.QueryTypes.SELECT });
    return Object.fromEntries(sums.map((row) => [row.Table, String(row.Checksum)]));
}

// 바뀐 표 이름만
const changedTables = (before, after) => Object.keys(before).filter((name) => before[name] !== after[name]);

const pathValues = () => ({ uuid: memberUuid, banId: 1, id: 1, orderId: 'ord-a14-gate', productId: 'a14-gate-product' });

// ── A14-B-140~159: 쓰기 경로 20개, X-Admin-Csrf 없음 ──
// 마지막 번호(159)가 20번째 뒤에 남은 경로까지 보고 나서 경로 수를 맞춰 봄
const expectCsrfBlocked = async (route) => {
    const before = await tableChecksums();
    const res = await boss.agent.request(route.method, fillPath(route, pathValues()), { body: {}, headers: { 'x-admin-csrf': undefined } });
    assert.equal(res.status, 403, `${route.key} 상태 ${res.status} ${res.body?.code}`);
    assert.equal(res.body.code, 'ADMIN_CSRF_FAILED', route.key);
    assert.deepEqual(changedTables(before, await tableChecksums()), [], `${route.key} 바뀐 표`);
};
for (let i = 0; i < WRITE_COUNT; i += 1) {
    const last = i === WRITE_COUNT - 1;
    const route = WRITE_ROUTES[i];
    const no = String(140 + i).padStart(3, '0');
    const label = `${route ? route.key : '(경로 없음)'}${last ? ' 와 남은 경로 + 경로 수 20' : ''}`;
    test(`A14-B-${no} 확인값 없음 ${label} → 403 ADMIN_CSRF_FAILED, 기록·표 그대로`, async (t) => {
        if (noDb(t)) return;
        assert.ok(route, `목록 바뀜: 쓰기 경로 ${WRITE_ROUTES.length}개`);
        for (const each of last ? WRITE_ROUTES.slice(i) : [route]) await expectCsrfBlocked(each);
        if (last) assert.equal(WRITE_ROUTES.length, WRITE_COUNT, `목록 바뀜: 쓰기 경로 ${WRITE_ROUTES.length}개`);
    });
}

const goldRows = () => db.GameSetting.findAll({ order: [['key', 'ASC']], raw: true });

test('A14-B-160 X-Admin-Csrf = 다른 세션 값 → PUT /game-settings 403, 값 그대로', async (t) => {
    if (noDb(t)) return;
    const other = await loggedIn('csrf2');
    assert.notEqual(other.agent.csrfToken, boss.agent.csrfToken);
    const before = await goldRows();
    const res = await boss.agent.request('PUT', '/admin-api/game-settings', {
        body: { goldReward: 7 }, headers: { 'x-admin-csrf': other.agent.csrfToken },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_CSRF_FAILED');
    assert.deepEqual(await goldRows(), before);
});

// 정지 요청 몸 (맞는 모양: 1일 정지)
const BAN_BODY = { kind: 'PERIOD', days: 1, reason: 'a14 쓰기 확인 시험' };
const ORIGIN_CASES = [
    ['161', 'Origin = 다른 사이트', 'http://other-site.test'],
    ['162', 'Origin 없음', undefined],
];
for (const [no, label, origin] of ORIGIN_CASES) {
    test(`A14-B-${no} ${label} + 맞는 확인값 → POST /members/:uuid/bans 403, 정지 줄 없음`, async (t) => {
        if (noDb(t)) return;
        const res = await boss.agent.request('POST', `/admin-api/members/${memberUuid}/bans`, { body: BAN_BODY, headers: { origin } });
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'ADMIN_CSRF_FAILED');
        assert.equal(await db.UserBan.count({ where: { user_id: memberUuid } }), 0);
    });
}

test('A14-B-163 세션 있음 + 확인값 머리글 없음 → GET /members?q=… 200', async (t) => {
    if (noDb(t)) return;
    const res = await boss.agent.get(`/admin-api/members?q=${encodeURIComponent(memberUuid)}`, { headers: { 'x-admin-csrf': undefined } });
    assert.equal(res.status, 200, `상태 ${res.status} ${res.body?.code}`);
});

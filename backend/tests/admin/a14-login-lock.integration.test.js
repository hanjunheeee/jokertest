'use strict';

// 관리자 로그인 잠깐 막기 시험: 같은 아이디 15분 안 5번·같은 IP 15분 안 20번 틀리면 15분 막힘, 막힌 동안 시도는 시간을 안 늘림, 서버 두 대도 같은 셈, 로그인 1분 10번
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-117~128 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
// 시간은 시도 줄(admin_login_attempts) 시각을 앞으로 당겨 흐른 것처럼 함 (기다리지 않음)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fork } = require('node:child_process');

const db = require('../../models');
const { prepareAdminDb, startAdminServer, createAgent, randomIp, otpNow } = require('./helpers/adminTestApp');
const G = require('./a14-gate-helpers');

const { MINUTE } = G;

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

let prepared = null;
let server = null;
let restoreEnv = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    restoreEnv = G.gateEnv();
    prepared = await prepareAdminDb();
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    if (restoreEnv) restoreEnv();
    if (prepared) await prepared.close();
    else await db.sequelize.close();
});

// 요청마다 새 IP (로그인 1분 10번 제한에 안 걸리게, IP 셈 시험만 같은 IP)
const newAgent = (ip = randomIp(), url = server.url) => createAgent({ url, ip });

// 틀림 n번 (같은 요청 도구)
const failTimes = async (agent, admin, n) => {
    for (let i = 0; i < n; i += 1) {
        const res = await G.failLogin(agent, admin);
        assert.equal(res.status, 401, `틀림 ${i + 1}번째 ${res.status} ${res.body?.code}`);
    }
};

// 이 아이디 시도 줄 시각 시계 (기준 = 지금 가장 새 시도 줄, DB 값 그대로)
const loginIdClock = async (loginId) => {
    const newest = await db.AdminLoginAttempt.max('created_at', { where: { login_id: loginId } });
    return G.virtualClock({
        anchorMs: new Date(newest).getTime(),
        shift: (sec) => G.shiftColumns(db.sequelize, 'admin_login_attempts', ['created_at'], 'login_id = :loginId', { loginId }, sec),
    });
};

const assertLocked = (res) => {
    assert.equal(res.status, 429, `상태 ${res.status} ${res.body?.code}`);
    assert.equal(res.body.code, 'ADMIN_LOGIN_LOCKED');
};

// ── A14-B-117~122: 같은 아이디 ──

test('A14-B-117 같은 아이디 4번 틀림 → 맞으면 200', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lk4');
    await failTimes(newAgent(), admin, 4);
    assert.equal((await G.goodLogin(newAgent(), admin)).status, 200);
});

test('A14-B-118 같은 아이디 5번 틀림 → 맞아도 429 ADMIN_LOGIN_LOCKED, retryAfterSec 900 안팎', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lk5');
    await failTimes(newAgent(), admin, 5);
    const res = await G.goodLogin(newAgent(), admin);
    assertLocked(res);
    assert.ok(res.body.retryAfterSec >= 890 && res.body.retryAfterSec <= 901, `retryAfterSec ${res.body.retryAfterSec}`);
});

test('A14-B-119 5번째 틀림 14분 59초 뒤 → 아직 429', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lk1459');
    await failTimes(newAgent(), admin, 5);
    const clock = await loginIdClock(admin.loginId);
    await clock.to(14 * MINUTE + 59 * 1000, 'atMost');
    assertLocked(await G.goodLogin(newAgent(), admin));
});

test('A14-B-120 5번째 틀림 15분 뒤 → 200', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lk15');
    await failTimes(newAgent(), admin, 5);
    const clock = await loginIdClock(admin.loginId);
    await clock.to(15 * MINUTE, 'atLeast');
    assert.equal((await G.goodLogin(newAgent(), admin)).status, 200);
});

test('A14-B-121 5번 틀림이 15분 1초에 걸쳐 흩어짐 → 안 막힘', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lkspread');
    await failTimes(newAgent(), admin, 1);
    // 첫 틀림을 15분 1초 앞으로 → 그 뒤 4번은 지금
    const clock = await loginIdClock(admin.loginId);
    await clock.to(15 * MINUTE + 1000, 'atLeast');
    await failTimes(newAgent(), admin, 4);
    assert.equal((await G.goodLogin(newAgent(), admin)).status, 200);
});

test('A14-B-122 3번 틀림 → 성공 → 다시 4번 틀림 → 안 막힘 (성공이 셈을 끊음)', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lkreset');
    await failTimes(newAgent(), admin, 3);
    assert.equal((await G.goodLogin(newAgent(), admin)).status, 200);
    await failTimes(newAgent(), admin, 4);
    // 같은 OTP 번호는 다시 못 써서 다음 칸 번호로 (앞뒤 한 칸 허용 안)
    const res = await G.goodLogin(newAgent(), admin, otpNow(admin.totpSecret, Date.now() + 30 * 1000));
    assert.equal(res.status, 200, `상태 ${res.status} ${res.body?.code}`);
});

test('A14-B-123 잠김 뒤 10분 동안 5번 더 시도 → 처음 잠근 때로부터 15분에 풀림', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('lkextra');
    await failTimes(newAgent(), admin, 5);
    const clock = await loginIdClock(admin.loginId);
    for (const minute of [2, 4, 6, 8, 10]) {
        await clock.to(minute * MINUTE, 'atMost');
        assertLocked(await G.goodLogin(newAgent(), admin));
    }
    await clock.to(15 * MINUTE, 'atLeast');
    const res = await G.goodLogin(newAgent(), admin);
    assert.equal(res.status, 200, `상태 ${res.status} ${res.body?.code}`);
});

// ── A14-B-124~126: 같은 IP ──
// 로그인 요청은 IP마다 1분 10번이라 요청으로는 19번을 못 보냄 → 그 IP 틀림 줄을 DB에 미리 넣음 (로그인이 남기는 줄과 같은 모양)
const seedIpFailures = async (ip, n) => {
    const now = Date.now();
    const rows = Array.from({ length: n }, (_, i) => ({
        login_id: G.gateName('ipx'), admin_id: null, ip, access_email: null, ok: false,
        failure_code: 'BAD_CREDENTIALS', created_at: new Date(now - (n - i) * 1000),
    }));
    await db.AdminLoginAttempt.bulkCreate(rows);
};

test('A14-B-124 한 IP에서 아이디 여럿으로 19번 틀림 → 20번째 아이디 맞으면 200', async (t) => {
    if (noDb(t)) return;
    const ip = randomIp();
    await seedIpFailures(ip, 19);
    const admin = await G.makeAdmin('ip19');
    assert.equal((await G.goodLogin(newAgent(ip), admin)).status, 200);
});

test('A14-B-125 한 IP에서 20번 틀림 → 다른 아이디 맞아도 429', async (t) => {
    if (noDb(t)) return;
    const ip = randomIp();
    await seedIpFailures(ip, 20);
    const admin = await G.makeAdmin('ip20');
    assertLocked(await G.goodLogin(newAgent(ip), admin));
});

test('A14-B-126 IP는 성공해도 셈이 안 끊김 (19번 틀림 → 성공 → 1번 틀림 → 다른 아이디 맞아도 429)', async (t) => {
    if (noDb(t)) return;
    const ip = randomIp();
    await seedIpFailures(ip, 19);
    const first = await G.makeAdmin('ipok');
    const second = await G.makeAdmin('ipok2');
    const agent = newAgent(ip);
    assert.equal((await G.goodLogin(agent, first)).status, 200);
    const miss = await agent.post('/admin-api/auth/login', { loginId: G.gateName('ipmiss'), password: G.FAKE_PASSWORD, otp: '123456' });
    assert.equal(miss.status, 401);
    assertLocked(await G.goodLogin(newAgent(ip), second));
});

// ── A14-B-127: 서버 두 대 ──

// 따로 뜬 프로세스에 두 번째 관리자 서버 → { url, close }
const startSecondNode = (t) => new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = fork(path.join(__dirname, 'a14-gate-node.js'), [], { env, execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    t.after(() => child.kill());
    const timer = setTimeout(() => reject(new Error('두 번째 서버가 20초 안에 안 뜸')), 20_000);
    child.once('message', (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error)); else resolve(message.url);
    });
    child.once('exit', (code) => reject(new Error(`두 번째 서버 끝남 ${code}`)));
});

test('A14-B-127 같은 DB를 쓰는 서버 ㄱ에서 3번 + 서버 ㄴ에서 2번 틀림 → ㄱ에서 맞아도 429', async (t) => {
    if (noDb(t)) return;
    const secondUrl = await startSecondNode(t);
    const admin = await G.makeAdmin('two');
    await failTimes(newAgent(), admin, 3);
    await failTimes(newAgent(randomIp(), secondUrl), admin, 2);
    assertLocked(await G.goodLogin(newAgent(), admin));
});

// ── A14-B-128: 로그인 요청 수 ──

test('A14-B-128 한 IP 1분에 로그인 11번째 → 429 RATE_LIMITED (10번째까지는 401·200)', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('rate');
    const agent = newAgent();
    for (let i = 0; i < 9; i += 1) {
        const res = await agent.post('/admin-api/auth/login', { loginId: G.gateName('rt'), password: G.FAKE_PASSWORD, otp: '123456' });
        assert.equal(res.status, 401, `${i + 1}번째`);
    }
    assert.equal((await G.goodLogin(agent, admin)).status, 200, '10번째');
    const eleventh = await G.goodLogin(agent, admin, otpNow(admin.totpSecret, Date.now() + 30 * 1000));
    assert.equal(eleventh.status, 429);
    assert.equal(eleventh.body.code, 'RATE_LIMITED');
});

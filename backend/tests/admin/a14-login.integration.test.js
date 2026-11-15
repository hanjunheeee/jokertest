'use strict';

// 관리자 로그인(문 2) 시험: 셋 다 맞으면 세션·쿠키·기록, 틀리면 어느 칸인지 안 알려 줌, OTP 다시 못 씀, 두 문 이메일, 꺼진 계정, 몸 검사
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-108~116·129~131 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../models');
const { prepareAdminDb, startAdminServer, createAgent, randomIp, otpNow } = require('./helpers/adminTestApp');
const { createAccessKeys, TEAM_DOMAIN } = require('./helpers/accessKeys');
const G = require('./a14-gate-helpers');

const LOGIN = '/admin-api/auth/login';

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

const newAgent = (options = {}) => createAgent({ url: server.url, ip: randomIp(), ...options });
const attemptsOf = (loginId) => db.AdminLoginAttempt.findAll({ where: { login_id: loginId }, order: [['id', 'ASC']], raw: true });
const cookieLine = (res) => res.setCookies.find((line) => line.startsWith('mmc_admin_sid='));
const cookieValue = (line) => line.split(';')[0].slice('mmc_admin_sid='.length);

// 지금 번호와 다른 6자리 (앞뒤 칸 번호와 겹칠 일은 거의 없음)
const wrongOtp = (secret) => String((Number(otpNow(secret)) + 1) % 1_000_000).padStart(6, '0');

// 틀림 문구 기준 (없는 아이디로 한 번)
let referenceMessage = null;
const failedMessage = async () => {
    if (referenceMessage) return referenceMessage;
    const res = await newAgent().post(LOGIN, { loginId: G.gateName('ref'), password: G.FAKE_PASSWORD, otp: '000000' });
    referenceMessage = res.body.message;
    return referenceMessage;
};

// 401 ADMIN_LOGIN_FAILED + 같은 글 + 시도 줄 하나 (failure_code)
const assertFailed = async (res, loginId, failureCode) => {
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_FAILED');
    assert.equal(res.body.message, await failedMessage());
    const rows = await attemptsOf(loginId);
    assert.equal(rows.length, 1);
    assert.equal(Boolean(rows[0].ok), false);
    assert.equal(rows[0].failure_code, failureCode);
};

// 운영 팀 주소 공개키 받기를 시험 공개키 서버로 돌림 (진짜 클라우드플레어로 안 나가게)
const routeTeamCerts = (t, keys) => {
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (input, init) => {
        const url = String(input?.url ?? input);
        return url.startsWith(`https://${TEAM_DOMAIN}/`) ? realFetch(keys.certsUrl, init) : realFetch(input, init);
    });
};

test('A14-B-108 아이디·비번·OTP 다 맞음 → 200 { admin, csrfToken, idleExpiresAt }, HttpOnly·SameSite=Strict·Path=/ 쿠키, 세션 줄(id = 쿠키 sha256), 기록 ADMIN_LOGIN', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('in');
    const res = await G.goodLogin(newAgent(), admin);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.admin, { id: admin.id, loginId: admin.loginId, email: admin.email });
    assert.match(res.body.csrfToken, /^[0-9a-f]{64}$/);
    assert.ok(!Number.isNaN(Date.parse(res.body.idleExpiresAt)), 'idleExpiresAt 시각');
    const line = cookieLine(res);
    assert.ok(line, '관리자 쿠키');
    assert.match(line, /;\s*HttpOnly/i);
    assert.match(line, /;\s*SameSite=Strict/i);
    assert.match(line, /;\s*Path=\//i);
    const raw = cookieValue(line);
    const sessions = await db.AdminSession.findAll({ where: { admin_id: admin.id }, raw: true });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, G.sessionIdOf(raw));
    assert.ok(!JSON.stringify(sessions[0]).includes(raw), '쿠키 원문은 DB에 없음');
    const logs = await db.AdminAuditLog.findAll({ where: { admin_id: admin.id, action: 'ADMIN_LOGIN' }, raw: true });
    assert.equal(logs.length, 1);
});

test('A14-B-109 운영(시험 Access 키) → 쿠키에 Secure', async (t) => {
    if (noDb(t)) return;
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    const admin = await G.makeAdmin('sec');
    t.after(G.gateEnv({ NODE_ENV: 'production', ADMIN_ACCESS_MODE: undefined, ...keys.env }));
    routeTeamCerts(t, keys);
    const res = await G.goodLogin(newAgent({ accessToken: keys.sign({ email: admin.email }) }), admin);
    assert.equal(res.status, 200, `로그인 ${res.status} ${res.body?.code}`);
    assert.match(cookieLine(res), /;\s*Secure/i);
});

test('A14-B-110 없는 아이디 → 401 ADMIN_LOGIN_FAILED·같은 글, 시도 줄 BAD_CREDENTIALS', async (t) => {
    if (noDb(t)) return;
    const loginId = G.gateName('nx');
    const res = await newAgent().post(LOGIN, { loginId, password: G.FAKE_PASSWORD, otp: '123456' });
    await assertFailed(res, loginId, 'BAD_CREDENTIALS');
});

test('A14-B-111 비번 틀림 → 401 ADMIN_LOGIN_FAILED·같은 글, 시도 줄 BAD_CREDENTIALS', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('pw');
    const res = await G.failLogin(newAgent(), admin);
    await assertFailed(res, admin.loginId, 'BAD_CREDENTIALS');
});

test('A14-B-112 OTP 틀림 → 401 ADMIN_LOGIN_FAILED·같은 글, 시도 줄 BAD_CREDENTIALS', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('otp');
    const res = await G.goodLogin(newAgent(), admin, wrongOtp(admin.totpSecret));
    await assertFailed(res, admin.loginId, 'BAD_CREDENTIALS');
});

test('A14-B-113 로그인 → 로그아웃 → 같은 30초 칸 같은 OTP 번호로 다시 → 401', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('replay');
    const code = otpNow(admin.totpSecret);
    const agent = newAgent();
    assert.equal((await G.goodLogin(agent, admin, code)).status, 200);
    assert.equal((await agent.post('/admin-api/auth/logout', {})).status, 200);
    const again = await G.goodLogin(agent, admin, code);
    assert.equal(again.status, 401);
    assert.equal(again.body.code, 'ADMIN_LOGIN_FAILED');
});

test('A14-B-114 Access 이메일 ≠ 관리자 이메일 → 403 ADMIN_EMAIL_MISMATCH, 시도 줄 EMAIL_MISMATCH', async (t) => {
    if (noDb(t)) return;
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    t.after(G.gateEnv({ ADMIN_ACCESS_MODE: undefined, ...keys.env }));
    const admin = await G.makeAdmin('mis');
    const res = await G.goodLogin(newAgent({ accessToken: keys.sign({ email: `${G.gateName('other')}@example.test` }) }), admin);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_EMAIL_MISMATCH');
    const rows = await attemptsOf(admin.loginId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].failure_code, 'EMAIL_MISMATCH');
});

test('A14-B-115 Access 꺼진 개발 모드 → 이메일 안 맞춰도 들어감', async (t) => {
    if (noDb(t)) return;
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    // 끔 + 다른 이메일 표를 붙여 보냄 (꺼져 있으면 안 봄)
    t.after(G.gateEnv({ ADMIN_ACCESS_MODE: 'off', ...keys.env }));
    const admin = await G.makeAdmin('devoff');
    const res = await G.goodLogin(newAgent({ accessToken: keys.sign({ email: `${G.gateName('other')}@example.test` }) }), admin);
    assert.equal(res.status, 200);
});

test('A14-B-116 꺼진 관리자 계정, 셋 다 맞음 → 같은 401, 시도 줄 DISABLED', async (t) => {
    if (noDb(t)) return;
    const admin = await G.makeAdmin('dis', { active: false });
    const res = await G.goodLogin(newAgent(), admin);
    await assertFailed(res, admin.loginId, 'DISABLED');
});

// ── A14-B-129~131: 몸 검사 ──
const BODY_CASES = [
    ['129', 'loginId 빈 글', (admin) => ({ loginId: '', password: admin.password, otp: otpNow(admin.totpSecret) }), ''],
    ['130', 'OTP 5자리', (admin) => ({ loginId: admin.loginId, password: admin.password, otp: '12345' }), null],
    ['131', 'OTP에 글자', (admin) => ({ loginId: admin.loginId, password: admin.password, otp: '12a456' }), null],
];
for (const [no, label, bodyOf, fixedLoginId] of BODY_CASES) {
    test(`A14-B-${no} 로그인 몸 ${label} → 400 INVALID_INPUT, 시도 줄 없음`, async (t) => {
        if (noDb(t)) return;
        const admin = await G.makeAdmin('body');
        const loginId = fixedLoginId ?? admin.loginId;
        const before = (await attemptsOf(loginId)).length;
        const res = await newAgent().post(LOGIN, bodyOf(admin));
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_INPUT');
        assert.equal((await attemptsOf(loginId)).length, before);
    });
}

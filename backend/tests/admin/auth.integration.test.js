'use strict';

// 관리자 로그인·세션 통합 시험 (AD-017·018·019·023·024·025·026·027·028·029·032), 진짜 시험 DB + 관리자 라우터
// npm run test:with-db -- tests/admin/auth.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-auth-integration-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const {
    prepareAdminDb, adminTestApp, createTestAdmin, createAgent, startAdminServer, randomIp, otpNow, setEnv,
    TEST_TOTP_KEY, TEST_ORIGIN,
} = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const attemptsOf = (loginId) => db().AdminLoginAttempt.findAll({ where: { login_id: loginId }, order: [['id', 'ASC']], raw: true });

// 문 1 꺼진 시험 서버 + 새 IP 요청 도구 (로그인 전)
const bareAgent = async (t) => {
    const restore = setEnv({ ADMIN_TOTP_KEY: TEST_TOTP_KEY, ADMIN_ORIGIN: TEST_ORIGIN, ADMIN_ACCESS_MODE: 'off' });
    const server = await startAdminServer();
    t.after(async () => { await server.close(); restore(); });
    return createAgent({ url: server.url, ip: randomIp() });
};

test('AD-017: 맞는 아이디·비번·OTP → 200, 쿠키 HttpOnly·SameSite=Strict, 세션 줄·성공 시도·기록 ADMIN_LOGIN', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const admin = await createTestAdmin();
    const res = await agent.login(admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.admin, { id: admin.id, loginId: admin.loginId, email: admin.email });
    assert.ok(!Number.isNaN(Date.parse(res.body.idleExpiresAt)));

    const cookieLine = res.setCookies.find((line) => line.startsWith('mmc_admin_sid='));
    assert.ok(cookieLine, '세션 쿠키');
    assert.match(cookieLine, /HttpOnly/i);
    assert.match(cookieLine, /SameSite=Strict/i);
    assert.match(cookieLine, /Path=\//);
    assert.doesNotMatch(cookieLine, /Domain=/i);
    const raw = agent.jar.get('mmc_admin_sid');
    assert.equal(res.body.csrfToken, sha256(`csrf:${raw}`));

    const session = await db().AdminSession.findByPk(sha256(raw), { raw: true });
    assert.ok(session, '세션 줄 (id = 쿠키 sha256)');
    assert.equal(session.admin_id, admin.id);
    assert.equal(new Date(session.expires_at) - new Date(session.created_at), 12 * 60 * 60 * 1000);
    const sessions = await db().AdminSession.findAll({ raw: true });
    assert.ok(sessions.every((row) => row.id !== raw), '쿠키 원문은 DB에 없음');

    const attempts = await attemptsOf(admin.loginId);
    assert.equal(attempts.length, 1);
    assert.equal(Boolean(attempts[0].ok), true);
    assert.equal(attempts[0].ip, agent.ip);

    const logs = await db().AdminAuditLog.findAll({ where: { admin_id: admin.id, action: 'ADMIN_LOGIN' }, raw: true });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].ip, agent.ip);

    const me = await agent.get('/admin-api/auth/me');
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.admin, res.body.admin);
    assert.equal(me.body.csrfToken, res.body.csrfToken);
    assert.equal(me.headers.get('cache-control'), 'no-store');
});

test('AD-017: 운영에선 쿠키에 Secure', () => {
    const { cookieOptions } = require('../../admin/services/core/session');
    assert.equal(cookieOptions({ NODE_ENV: 'production' }).secure, true);
    assert.equal(cookieOptions({ NODE_ENV: 'test' }).secure, false);
    assert.equal(cookieOptions({ NODE_ENV: 'production' }).sameSite, 'strict');
});

test('AD-018: 비번 틀림·OTP 틀림·없는 아이디 → 같은 401 ADMIN_LOGIN_FAILED, 시도 표에 실패 줄', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const admin = await createTestAdmin();
    const wrongOtp = String((Number(otpNow(admin.totpSecret)) + 1) % 1_000_000).padStart(6, '0');
    const tries = [
        { loginId: admin.loginId, password: 'wrong-password-123', otp: otpNow(admin.totpSecret) },
        { loginId: admin.loginId, password: admin.password, otp: wrongOtp },
        { loginId: 'nobody-here', password: admin.password, otp: otpNow(admin.totpSecret) },
    ];
    const bodies = [];
    for (const body of tries) {
        const res = await agent.post('/admin-api/auth/login', body);
        assert.equal(res.status, 401);
        bodies.push(res.body);
    }
    assert.equal(bodies[0].code, 'ADMIN_LOGIN_FAILED');
    assert.deepEqual(bodies[1], bodies[0], '어느 칸이 틀렸는지 안 알려 줌');
    assert.deepEqual(bodies[2], bodies[0]);
    assert.equal(agent.jar.has('mmc_admin_sid'), false);

    const mine = await attemptsOf(admin.loginId);
    assert.deepEqual(mine.map((row) => [Boolean(row.ok), row.failure_code]), [[false, 'BAD_CREDENTIALS'], [false, 'BAD_CREDENTIALS']]);
    const nobody = await attemptsOf('nobody-here');
    assert.equal(nobody[0].failure_code, 'BAD_CREDENTIALS');
    assert.equal(nobody[0].admin_id, null);
});

test('AD-018: 칸 빠짐·모르는 칸·OTP 모양 틀림 → 400 INVALID_INPUT { field }', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const cases = [
        [{ loginId: 'a', password: 'b' }, 'otp'],
        [{ loginId: 'a', password: 'b', otp: '123456', role: 'SUPER' }, 'role'],
        [{ loginId: 'a', password: 'b', otp: '12345a' }, 'otp'],
        [{ loginId: 5, password: 'b', otp: '123456' }, 'loginId'],
    ];
    for (const [body, field] of cases) {
        const res = await agent.post('/admin-api/auth/login', body);
        assert.equal(res.status, 400, field);
        assert.equal(res.body.code, 'INVALID_INPUT');
        assert.equal(res.body.field, field);
    }
});

test('AD-019: 같은 OTP 번호 두 번 → 두 번째 401', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const admin = await createTestAdmin();
    const otp = otpNow(admin.totpSecret);
    assert.equal((await agent.login(admin, { otp })).status, 200);
    // 1초 넘게 띄움: 같은 초면 DB가 "바뀐 줄 0"을 돌려줘 막는 장치가 없어도 우연히 막힘
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const other = createAgent({ url: agent.url, ip: randomIp() });
    const again = await other.login(admin, { otp });
    assert.equal(again.status, 401);
    assert.equal(again.body.code, 'ADMIN_LOGIN_FAILED');
    const last = (await attemptsOf(admin.loginId)).at(-1);
    assert.equal(last.failure_code, 'BAD_CREDENTIALS');
});

test('AD-023: Access 이메일 ≠ 관리자 이메일 → 403 ADMIN_EMAIL_MISMATCH, 시도 표 EMAIL_MISMATCH', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ accessMode: 'required', t });
    assert.equal((await app.agent.get('/admin-api/auth/me')).status, 200, '같은 이메일이면 통과');

    const admin = await createTestAdmin();
    const stranger = createAgent({ url: app.url, ip: randomIp(), accessToken: app.keys.sign({ email: 'someone-else@example.com' }) });
    const res = await stranger.login(admin);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_EMAIL_MISMATCH');
    assert.equal(stranger.jar.has('mmc_admin_sid'), false);
    const last = (await attemptsOf(admin.loginId)).at(-1);
    assert.equal(last.failure_code, 'EMAIL_MISMATCH');
    assert.equal(last.access_email, 'someone-else@example.com');

    // 세션도 Access 이메일이 다르면 못 씀
    const borrowed = createAgent({ url: app.url, ip: randomIp(), accessToken: app.keys.sign({ email: 'someone-else@example.com' }) });
    borrowed.jar.set('mmc_admin_sid', app.agent.jar.get('mmc_admin_sid'));
    assert.equal((await borrowed.get('/admin-api/auth/me')).status, 401);
});

test('AD-024: 비활성 관리자 → 같은 401, 시도 표 DISABLED', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const admin = await createTestAdmin({ active: false });
    const res = await agent.login(admin);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_FAILED');
    assert.equal((await attemptsOf(admin.loginId)).at(-1).failure_code, 'DISABLED');
});

test('AD-024: 로그인 중 비활성되면 세션도 바로 못 씀', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    await db().AdminUser.update({ is_active: false }, { where: { id: app.admin.id } });
    const res = await app.agent.get('/admin-api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
});

// 이 관리자 세션 줄 시각 바꾸기 (시계 대신 DB 시각을 당김)
const shiftSession = (adminId, fields) => db().AdminSession.update(fields, { where: { admin_id: adminId } });
const sessionRow = (adminId) => db().AdminSession.findOne({ where: { admin_id: adminId }, raw: true });

test('AD-025: 가만히 30분 → 401 ADMIN_SESSION_EXPIRED, 백그라운드 요청은 활동으로 안 셈', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

    await shiftSession(app.admin.id, { last_seen_at: minutesAgo(20) });
    const background = await app.agent.get('/admin-api/auth/me', { headers: { 'x-admin-background': '1' } });
    assert.equal(background.status, 200);
    const afterBackground = await sessionRow(app.admin.id);
    assert.ok(Date.now() - new Date(afterBackground.last_seen_at) > 19 * 60 * 1000, '백그라운드는 안 늘림');

    const active = await app.agent.get('/admin-api/auth/me');
    assert.equal(active.status, 200);
    const afterActive = await sessionRow(app.admin.id);
    assert.ok(Date.now() - new Date(afterActive.last_seen_at) < 60 * 1000, '보통 요청은 늘림');
    assert.ok(Date.parse(active.body.idleExpiresAt) - Date.now() > 29 * 60 * 1000);

    await shiftSession(app.admin.id, { last_seen_at: minutesAgo(31) });
    const expired = await app.agent.get('/admin-api/auth/me');
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, 'ADMIN_SESSION_EXPIRED');
    const area = await app.agent.get('/admin-api/members');
    assert.equal(area.status, 401, '영역 경로도 막힘');
});

test('AD-025: 로그인 뒤 12시간 넘으면 활동 중이어도 401 ADMIN_SESSION_EXPIRED', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    await shiftSession(app.admin.id, { expires_at: new Date(Date.now() - 1000), last_seen_at: new Date() });
    const res = await app.agent.get('/admin-api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_SESSION_EXPIRED');
});

test('AD-025: ADMIN_SESSION_IDLE_MIN으로 자동 로그아웃 분 바꿈', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const restore = setEnv({ ADMIN_SESSION_IDLE_MIN: '5' });
    t.after(restore);
    await shiftSession(app.admin.id, { last_seen_at: new Date(Date.now() - 6 * 60 * 1000) });
    assert.equal((await app.agent.get('/admin-api/auth/me')).body.code, 'ADMIN_SESSION_EXPIRED');
});

test('AD-026: 로그아웃 → 쿠키 지움·세션 끝, 같은 쿠키 401, 기록 ADMIN_LOGOUT', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const raw = app.agent.jar.get('mmc_admin_sid');
    const res = await app.agent.post('/admin-api/auth/logout');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.ok(res.setCookies.some((line) => line.startsWith('mmc_admin_sid=;')), '쿠키 지움');
    const row = await db().AdminSession.findByPk(sha256(raw), { raw: true });
    assert.ok(row.revoked_at, '세션 끊김');

    const replay = createAgent({ url: app.url, ip: randomIp() });
    replay.jar.set('mmc_admin_sid', raw);
    const me = await replay.get('/admin-api/auth/me');
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'ADMIN_LOGIN_REQUIRED');

    const logs = await db().AdminAuditLog.findAll({ where: { admin_id: app.admin.id, action: 'ADMIN_LOGOUT' }, raw: true });
    assert.equal(logs.length, 1);
    // 로그인 안 된 채 로그아웃해도 200
    assert.equal((await replay.post('/admin-api/auth/logout')).status, 200);
});

test('AD-026·027: 로그인·로그아웃은 다른 Origin이면 403 ADMIN_CSRF_FAILED', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const admin = await createTestAdmin();
    const foreign = createAgent({ url: app.url, ip: randomIp(), origin: 'http://player.test' });
    const login = await foreign.login(admin);
    assert.equal(login.status, 403);
    assert.equal(login.body.code, 'ADMIN_CSRF_FAILED');
    const logout = await app.agent.post('/admin-api/auth/logout', undefined, { headers: { origin: 'http://player.test' } });
    assert.equal(logout.status, 403);
    assert.equal((await app.agent.get('/admin-api/auth/me')).status, 200, '세션 그대로');
});

test('AD-027: 영역 쓰기 — CSRF 머리글 없거나 틀리면 403, 맞으면 쓰기 확인 통과(빈 라우터 404)', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const none = await app.agent.post('/admin-api/members', {}, { headers: { 'x-admin-csrf': undefined } });
    assert.equal(none.status, 403);
    assert.equal(none.body.code, 'ADMIN_CSRF_FAILED');
    const wrong = await app.agent.post('/admin-api/members', {}, { headers: { 'x-admin-csrf': sha256('csrf:nope') } });
    assert.equal(wrong.status, 403);
    const ok = await app.agent.post('/admin-api/members', {});
    assert.equal(ok.status, 404);
    const read = await app.agent.get('/admin-api/members', { headers: { 'x-admin-csrf': undefined } });
    assert.equal(read.status, 404, '읽기는 머리글 없어도 쓰기 확인 통과');
});

test('AD-028: 플레이어 accessToken(role=ADMIN 포함)으로 /admin-api → 401', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    const token = jwt.sign({ uuid: crypto.randomUUID(), role: 'ADMIN', sid: 'x' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    agent.jar.set('accessToken', token);
    for (const path of ['/admin-api/auth/me', '/admin-api/members', '/admin-api/dashboard', '/admin-api/audit-logs']) {
        const res = await agent.get(path, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(res.status, 401, path);
        assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED', path);
    }
    const write = await agent.post('/admin-api/members', {}, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(write.status, 401);
});

test('AD-029: 관리자 쿠키로 플레이어 내 정보(/auth/me·/user/me/profile) → 401', async (t) => {
    if (skipWithoutDb(t)) return;
    const app = await adminTestApp({ t });
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
    const player = express();
    player.use(cookieParser());
    player.use('/auth', require('../../routes/auth.routes'));
    player.use('/user', require('../../routes/user.routes'));
    player.use(notFoundHandler);
    player.use(globalErrorHandler);
    const server = http.createServer(player);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    // 플레이어 '내 정보' 경로 둘 (/auth/me · /user/me/profile)
    for (const path of ['/auth/me', '/user/me/profile']) {
        const res = await fetch(`${url}${path}`, { headers: { cookie: `mmc_admin_sid=${app.agent.jar.get('mmc_admin_sid')}` } });
        assert.equal(res.status, 401, path);
    }
});

test('AD-032: 로그인 IP 1분 10번 넘음 → 429 RATE_LIMITED', async (t) => {
    if (skipWithoutDb(t)) return;
    const agent = await bareAgent(t);
    for (let i = 0; i < 10; i += 1) {
        const res = await agent.post('/admin-api/auth/login', { loginId: `rate-${i}`, password: 'x'.repeat(12), otp: '000000' });
        assert.equal(res.status, 401, `${i + 1}번째`);
    }
    const blocked = await agent.post('/admin-api/auth/login', { loginId: 'rate-x', password: 'x'.repeat(12), otp: '000000' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'RATE_LIMITED');
    // 다른 IP는 그대로
    agent.ip = randomIp();
    assert.equal((await agent.post('/admin-api/auth/login', { loginId: 'rate-y', password: 'x'.repeat(12), otp: '000000' })).status, 401);
});

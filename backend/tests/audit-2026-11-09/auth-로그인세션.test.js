'use strict';

// 인증 시험: 로그인·잠금·정지 · 세션 발급 · 로그아웃 · refresh 회전 · 세션 확인 · 비번 바꾸기 (DB 안 씀, 가짜 저장소·가짜 시계)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-auth-login-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const authService = require('../../services/auth/account');
const passwordService = require('../../services/auth/account/password');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const { authenticateRequest } = require('../../middlewares/auth.middleware');
const { REFRESH_TOKEN_GRACE_MS, PERSISTENT_SESSION_MAX_AGE_MS } = require('../../utils/auth/cookieOptions');
const { useAuthStore } = require('./authFakes');

const PASSWORD = 'correct-horse-9';
const REQ_INFO = { ip: '10.0.0.7', userAgent: 'audit-agent', deviceType: 'PC' };
const START = new Date('2026-11-09T09:00:00.000Z');
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

let cachedHash;
const passwordHash = async () => { cachedHash ??= await bcrypt.hash(PASSWORD, 4); return cachedHash; };

// 가짜 시계(Date만) + 가짜 저장소 + 계정 하나
const setUp = async (t, userExtra = {}) => {
    t.mock.timers.enable({ apis: ['Date'], now: START });
    const store = useAuthStore(t);
    const user = {
        uuid: 'u-1', email: 'player@example.com', nickname: '탐정', role: 'USER', status: 'ACTIVE',
        password_hash: await passwordHash(), failed_login_count: 0, locked_until: null, ...userExtra,
    };
    store.data.users.push(user);
    return { store, user };
};

const login = (body) => authService.login({ email: 'player@example.com', password: PASSWORD, ...body }, REQ_INFO);

// ── 로그인 ──

test('로그인: 가입 안 된 이메일은 401이고 로그인 기록을 남기지 않는다', async (t) => {
    const { store } = await setUp(t);
    await assert.rejects(login({ email: 'nobody@example.com' }), (e) => e.status === 401 && /가입되지 않은/.test(e.message));
    assert.equal(store.data.history.length, 0);
});

test('로그인: 이메일 앞뒤 공백은 다듬어서 찾는다', async (t) => {
    await setUp(t);
    const result = await login({ email: '  player@example.com  ' });
    assert.equal(result.user.uuid, 'u-1');
});

test('로그인: 공백뿐인 이메일·빈 비번·본문 없음은 DB 가기 전에 400', async (t) => {
    const { store } = await setUp(t);
    await assert.rejects(login({ email: '   ' }), (e) => e.status === 400);
    await assert.rejects(login({ password: '' }), (e) => e.status === 400);
    await assert.rejects(authService.login(undefined, REQ_INFO), (e) => e.status === 400);
    await assert.rejects(authService.login(null, REQ_INFO), (e) => e.status === 400);
    assert.deepEqual(store.names(), []);
});

test('로그인: 잠금 시간 안이면 비번이 맞아도 423이고 비번 비교·기록을 하지 않는다', async (t) => {
    const { store } = await setUp(t, { failed_login_count: 5, locked_until: new Date(START.getTime() + 60_000) });
    await assert.rejects(login(), (e) => e.status === 423);
    assert.equal(store.names().includes('createLoginHistory'), false);
    assert.equal(store.data.sessions.length, 0);
});

test('로그인: 잠금 끝나는 시각과 지금이 같으면 잠김이 아니다 (경계)', async (t) => {
    const { user } = await setUp(t, { failed_login_count: 5, locked_until: new Date(START) });
    const result = await login();
    assert.equal(result.user.uuid, 'u-1');
    assert.equal(user.failed_login_count, 0);
    assert.equal(user.locked_until, null);
});

test('로그인: 틀리면 실패 기록(ip·브라우저 정보)이 남고 거절돼도 되돌아가지 않는다', async (t) => {
    const { store } = await setUp(t);
    await assert.rejects(login({ password: 'wrong-pass' }), (e) => e.status === 401);
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].success, false);
    assert.equal(store.data.history[0].ip_address, '10.0.0.7');
    assert.equal(store.data.history[0].user_agent, 'audit-agent');
});

test('로그인: 두 번째로 틀리면 문구에 2/5', async (t) => {
    await setUp(t, { failed_login_count: 1 });
    await assert.rejects(login({ password: 'wrong-pass' }), (e) => e.status === 401 && /2\/5/.test(e.message));
});

test('로그인: 4번 틀린 뒤 5번째로 틀리면 423이고 지금부터 15분 잠긴다', async (t) => {
    const { user } = await setUp(t, { failed_login_count: 4 });
    await assert.rejects(login({ password: 'wrong-pass' }), (e) => e.status === 423 && /15분/.test(e.message));
    assert.equal(user.failed_login_count, 5);
    assert.equal(user.locked_until.getTime(), START.getTime() + 15 * 60 * 1000);
});

test('로그인: 잠긴 뒤 14분 59초에는 423, 15분 지나면 맞는 비번으로 들어간다', async (t) => {
    const { user } = await setUp(t, { failed_login_count: 4 });
    await assert.rejects(login({ password: 'wrong-pass' }), (e) => e.status === 423);
    t.mock.timers.tick(15 * 60 * 1000 - 1000);
    await assert.rejects(login(), (e) => e.status === 423);
    t.mock.timers.tick(1000);
    const result = await login();
    assert.equal(result.user.uuid, 'u-1');
    assert.equal(user.failed_login_count, 0);
});

test('로그인: 성공하면 실패 횟수 0·잠금 없음·마지막 로그인 시각이 지금', async (t) => {
    const { user } = await setUp(t, { failed_login_count: 3 });
    await login();
    assert.equal(user.failed_login_count, 0);
    assert.equal(user.locked_until, null);
    assert.equal(user.last_login_at.getTime(), START.getTime());
});

test('로그인: 성공하면 성공 기록 하나가 남는다', async (t) => {
    const { store } = await setUp(t);
    await login();
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].success, true);
});

test('로그인: 다시 로그인하면 앞 세션은 끊기고 살아 있는 세션은 하나', async (t) => {
    const { store } = await setUp(t);
    await login();
    await login();
    const online = store.data.sessions.filter((s) => s.is_online);
    assert.equal(store.data.sessions.length, 2);
    assert.equal(online.length, 1);
    assert.ok(store.data.sessions[0].revoked_at);
});

test('로그인: 로그인 유지 아니면 refresh 없이 access 하루, 세션 행에 refresh 해시 없음', async (t) => {
    const { store } = await setUp(t);
    const result = await login();
    assert.equal(result.refreshToken, null);
    assert.equal(result.refreshTokenExpiresAt, null);
    const decoded = jwt.decode(result.token);
    assert.equal(decoded.exp - decoded.iat, 24 * 60 * 60);
    assert.equal(store.data.sessions[0].refresh_token_hash, null);
});

test('로그인: 로그인 유지면 refresh 30일·access 15분, 세션 행엔 refresh 해시만 저장', async (t) => {
    const { store } = await setUp(t);
    const result = await login({ rememberMe: true });
    assert.equal(typeof result.refreshToken, 'string');
    assert.equal(result.refreshTokenExpiresAt.getTime(), START.getTime() + PERSISTENT_SESSION_MAX_AGE_MS);
    const decoded = jwt.decode(result.token);
    assert.equal(decoded.exp - decoded.iat, 15 * 60);
    assert.equal(store.data.sessions[0].refresh_token_hash, sha256(result.refreshToken));
    assert.notEqual(store.data.sessions[0].refresh_token_hash, result.refreshToken);
});

test('로그인: rememberMe가 문자열 "true"면 로그인 유지로 안 본다', async (t) => {
    await setUp(t);
    const result = await login({ rememberMe: 'true' });
    assert.equal(result.refreshToken, null);
});

test('로그인: access 토큰에 uuid·역할·세션 id가 들어가고 세션 행 id와 같다', async (t) => {
    const { store } = await setUp(t, { role: 'ADMIN' });
    const result = await login();
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(decoded.uuid, 'u-1');
    assert.equal(decoded.role, 'ADMIN');
    assert.equal(decoded.sessionId, store.data.sessions[0].id);
});

test('로그인: 비번 맞고 정지면 남은 세션도 끊고 403, 성공 기록은 남는다', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 'old-s', user_id: 'u-1', is_online: true, revoked_at: null });
    store.data.bans.push({ user_id: 'u-1', reason: '도배' });
    await assert.rejects(login(), (e) => e.status === 403 && /도배/.test(e.message));
    assert.equal(store.data.sessions.find((s) => s.id === 'old-s').is_online, false);
    assert.equal(store.data.sessions.length, 1);
    assert.equal(store.data.history[0].success, true);
});

test('로그인: 정지 사유가 비면 "운영정책 위반"으로 적는다', async (t) => {
    const { store } = await setUp(t);
    store.data.bans.push({ user_id: 'u-1', reason: '' });
    await assert.rejects(login(), (e) => e.status === 403 && /운영정책 위반/.test(e.message));
});

test('로그인: 정지 계정은 실패 횟수를 0으로 되돌리지 않는다 (세션 주기 전 거절)', async (t) => {
    const { store, user } = await setUp(t, { failed_login_count: 2 });
    store.data.bans.push({ user_id: 'u-1', reason: '도배' });
    await assert.rejects(login(), (e) => e.status === 403);
    assert.equal(user.failed_login_count, 2);
});

// ── 세션 발급 ──

test('세션 발급: 세션 행에 접속 ip·접속 중 표시가 들어간다', async (t) => {
    const { store, user } = await setUp(t);
    await authService.issueSessionForUser(user, {}, { ip: '1.2.3.4' });
    assert.equal(store.data.sessions[0].ip_address, '1.2.3.4');
    assert.equal(store.data.sessions[0].is_online, true);
});

test('세션 발급: 두 번 발급하면 세션 id가 서로 다르고 refresh 값도 다르다', async (t) => {
    const { user } = await setUp(t);
    const a = await authService.issueSessionForUser(user, { rememberMe: true }, {});
    const b = await authService.issueSessionForUser(user, { rememberMe: true }, {});
    assert.notEqual(jwt.decode(a.token).sessionId, jwt.decode(b.token).sessionId);
    assert.notEqual(a.refreshToken, b.refreshToken);
});

// ── 로그아웃 ──

test('로그아웃: refresh 쿠키가 글자가 아니거나 비면 아무것도 안 한다', async (t) => {
    const { store } = await setUp(t);
    await authService.logoutByRefreshToken(undefined);
    await authService.logoutByRefreshToken('');
    await authService.logoutByRefreshToken(['a']);
    assert.deepEqual(store.names(), []);
});

test('로그아웃: 모르는 refresh는 세션을 건드리지 않는다', async (t) => {
    const { store } = await setUp(t);
    await authService.logoutByRefreshToken('unknown-refresh');
    assert.equal(store.names().includes('recordLogout'), false);
});

test('로그아웃: 이미 폐기된 세션의 refresh면 기록을 닫지 않는다', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-x', user_id: 'u-1', is_online: false, revoked_at: START, refresh_token_hash: sha256('r-x') });
    await authService.logoutByRefreshToken('r-x');
    assert.equal(store.names().includes('recordLogout'), false);
});

test('로그아웃: 살아 있는 refresh면 그 세션을 끊고 마지막 성공 기록에 로그아웃 시각', async (t) => {
    const { store } = await setUp(t);
    const result = await login({ rememberMe: true });
    t.mock.timers.tick(5000);
    await authService.logoutByRefreshToken(result.refreshToken);
    assert.equal(store.data.sessions[0].is_online, false);
    assert.equal(store.data.history[0].logout_at.getTime(), START.getTime() + 5000);
});

test('로그아웃: uuid·세션 id로 그 세션만 끊는다', async (t) => {
    const { store } = await setUp(t);
    const result = await login();
    const { sessionId } = jwt.decode(result.token);
    await authService.logout({ uuid: 'u-1', sessionId });
    assert.deepEqual(store.argsOf('recordLogout'), ['u-1', sessionId]);
    assert.equal(store.data.sessions[0].is_online, false);
});

// ── refresh ──

const loginRemembered = async (t, extra) => {
    const ctx = await setUp(t, extra);
    const result = await login({ rememberMe: true });
    return { ...ctx, result };
};

test('refresh: 회전해서 받은 새 토큰으로 다시 refresh하면 또 회전된다 (연속 2번)', async (t) => {
    const { result } = await loginRemembered(t);
    const first = await authService.refresh(result.refreshToken);
    t.mock.timers.tick(REFRESH_TOKEN_GRACE_MS + 1000);
    const second = await authService.refresh(first.refreshToken);
    assert.notEqual(second.refreshToken, first.refreshToken);
    assert.notEqual(second.refreshToken, result.refreshToken);
});

test('refresh: 두 번 밀려난 옛 토큰을 쓰면 재사용으로 보고 그 사람 세션을 전부 끊는다', async (t) => {
    const { store, result } = await loginRemembered(t);
    const first = await authService.refresh(result.refreshToken);
    t.mock.timers.tick(REFRESH_TOKEN_GRACE_MS + 1000);
    await authService.refresh(first.refreshToken);
    await assert.rejects(authService.refresh(result.refreshToken), (e) => e.status === 401 && /재사용/.test(e.message));
    assert.equal(store.data.sessions.every((s) => s.is_online === false), true);
});

test('refresh: 유예 시간 안의 직전 토큰은 회전 없이 같은 새 토큰을 돌려준다', async (t) => {
    const { store, result } = await loginRemembered(t);
    const first = await authService.refresh(result.refreshToken);
    t.mock.timers.tick(REFRESH_TOKEN_GRACE_MS - 1000);
    const retry = await authService.refresh(result.refreshToken);
    assert.equal(retry.refreshToken, first.refreshToken);
    assert.equal(store.callsOf('applyRefreshRotation').length, 1);
});

test('refresh: 새 access 역할은 지금 계정 값 (로그인 뒤 역할이 바뀌면 바뀐 값)', async (t) => {
    const { user, result } = await loginRemembered(t);
    user.role = 'QA';
    const refreshed = await authService.refresh(result.refreshToken);
    assert.equal(jwt.decode(refreshed.accessToken).role, 'QA');
});

test('refresh: 로그인 유지 기간이 정확히 끝나는 순간에는 만료로 401', async (t) => {
    const { result } = await loginRemembered(t);
    t.mock.timers.tick(PERSISTENT_SESSION_MAX_AGE_MS);
    await assert.rejects(authService.refresh(result.refreshToken), (e) => e.status === 401 && /만료/.test(e.message));
});

test('refresh: 만료 시각 칸이 비어 있는 세션은 만료로 401', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-n', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_hash: sha256('r-n'), refresh_token_expires_at: null });
    await assert.rejects(authService.refresh('r-n'), (e) => e.status === 401 && /만료/.test(e.message));
});

test('refresh: 정지 중이면 403이고 정지 사유가 비면 "운영정책 위반"', async (t) => {
    const { store, result } = await loginRemembered(t);
    store.data.bans.push({ user_id: 'u-1', reason: null });
    await assert.rejects(authService.refresh(result.refreshToken), (e) => e.status === 403 && /운영정책 위반/.test(e.message));
    assert.equal(store.data.sessions[0].is_online, false);
});

test('refresh: 로그아웃한 세션의 refresh는 폐기로 401', async (t) => {
    const { result } = await loginRemembered(t);
    await authService.logoutByRefreshToken(result.refreshToken);
    await assert.rejects(authService.refresh(result.refreshToken), (e) => e.status === 401 && /폐기/.test(e.message));
});

test('refresh: 새 access 유효 시간은 남은 로그인 유지 시간을 넘지 않는다 (10분 남음 → 600초)', async (t) => {
    const { result } = await loginRemembered(t);
    t.mock.timers.tick(PERSISTENT_SESSION_MAX_AGE_MS - 10 * 60 * 1000);
    const refreshed = await authService.refresh(result.refreshToken);
    const decoded = jwt.decode(refreshed.accessToken);
    assert.equal(decoded.exp - decoded.iat, 600);
});

// ── 세션 확인 ──

test('세션 확인: 토큰 내용이 없으면(null) DB 없이 401', async (t) => {
    const { store } = await setUp(t);
    const result = await sessionLifecycle.resolveSession(null);
    assert.equal(result.status, 401);
    assert.deepEqual(store.names(), []);
});

test('세션 확인: 로그인 유지 기간이 지난 세션은 access가 남아도 401', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_expires_at: new Date(START.getTime() - 1) });
    const result = await sessionLifecycle.resolveSession({ uuid: 'u-1', sessionId: 's-1' });
    assert.equal(result.status, 401);
    assert.match(result.message, /로그인 유지 기간/);
});

test('세션 확인: 다른 사람 uuid로 남의 세션 id를 들고 오면 401', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_expires_at: null });
    const result = await sessionLifecycle.resolveSession({ uuid: 'u-2', sessionId: 's-1' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
});

test('세션 확인: 정지 사유가 없으면 "운영정책 위반" 403이고 그 사람 세션을 끊는다', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_expires_at: null });
    store.data.bans.push({ user_id: 'u-1' });
    const result = await sessionLifecycle.resolveSession({ uuid: 'u-1', sessionId: 's-1' });
    assert.equal(result.status, 403);
    assert.match(result.message, /운영정책 위반/);
    assert.equal(store.data.sessions[0].is_online, false);
});

test('토큰 풀기: ignoreExpiration이면 만료된 토큰도 풀린다, 아니면 TokenExpiredError', async (t) => {
    await setUp(t);
    const token = jwt.sign({ uuid: 'u-1', sessionId: 's-1' }, process.env.JWT_SECRET, { expiresIn: 60 });
    t.mock.timers.tick(61_000);
    assert.equal(sessionLifecycle.verifyAccessToken(token, { ignoreExpiration: true }).uuid, 'u-1');
    assert.throws(() => sessionLifecycle.verifyAccessToken(token), { name: 'TokenExpiredError' });
});

// ── 응답 없는 로그인 확인 (디스코드 연결·로그아웃이 씀) ──

const reqWith = (token) => ({ cookies: token ? { accessToken: token } : {} });
const signAccess = (payload, expiresIn = 60) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

test('로그인 확인(응답 없음): 쿠키 없으면 NO_TOKEN, 쿠키 객체가 없어도 던지지 않는다', async (t) => {
    await setUp(t);
    assert.deepEqual(await authenticateRequest(reqWith()), { ok: false, reason: 'NO_TOKEN' });
    assert.deepEqual(await authenticateRequest({}), { ok: false, reason: 'NO_TOKEN' });
});

test('로그인 확인(응답 없음): 만료면 TOKEN_EXPIRED, 서명 틀리면 TOKEN_INVALID', async (t) => {
    await setUp(t);
    const expired = signAccess({ uuid: 'u-1', sessionId: 's-1' }, 1);
    t.mock.timers.tick(2000);
    assert.equal((await authenticateRequest(reqWith(expired))).reason, 'TOKEN_EXPIRED');
    const forged = jwt.sign({ uuid: 'u-1', sessionId: 's-1' }, 'other-secret');
    assert.equal((await authenticateRequest(reqWith(forged))).reason, 'TOKEN_INVALID');
});

test('로그인 확인(응답 없음): allowExpired면 만료된 access라도 세션이 살아 있으면 통과', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_expires_at: null });
    const expired = signAccess({ uuid: 'u-1', sessionId: 's-1' }, 1);
    t.mock.timers.tick(2000);
    const result = await authenticateRequest(reqWith(expired), { allowExpired: true });
    assert.equal(result.ok, true);
    assert.equal(result.user.uuid, 'u-1');
});

test('로그인 확인(응답 없음): 끊긴 세션은 SESSION_ENDED, 정지면 BANNED', async (t) => {
    const { store } = await setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null, refresh_token_expires_at: null });
    const token = signAccess({ uuid: 'u-1', sessionId: 's-1' });
    assert.equal((await authenticateRequest(reqWith(signAccess({ uuid: 'u-1', sessionId: 's-zz' })))).reason, 'SESSION_ENDED');
    store.data.bans.push({ user_id: 'u-1', reason: 'x' });
    assert.equal((await authenticateRequest(reqWith(token))).reason, 'BANNED');
});

// ── 비번 바꾸기 (서비스) ──

const changeWith = (now, currentPassword, uuid = 'u-1') => passwordService.changePassword(
    { uuid, currentPassword, newPassword: 'brand-new-pass-1' }, { now },
);

test('비번 바꾸기: 맞으면 새 해시로 바뀌고 지금 세션 포함 전부 끊긴다', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const { store, user } = await setUp(t);
    await login();
    const before = user.password_hash;
    const result = await changeWith(() => START.getTime(), PASSWORD);
    assert.deepEqual(result, { ok: true });
    assert.notEqual(user.password_hash, before);
    assert.equal(await bcrypt.compare('brand-new-pass-1', user.password_hash), true);
    assert.equal(store.data.sessions.every((s) => !s.is_online), true);
});

test('비번 바꾸기: 틀리면 해시·세션 그대로이고 { ok: false }', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const { store, user } = await setUp(t);
    await login();
    const before = user.password_hash;
    const result = await changeWith(() => START.getTime(), 'wrong-pass');
    assert.deepEqual(result, { ok: false });
    assert.equal(user.password_hash, before);
    assert.equal(store.data.sessions[0].is_online, true);
});

test('비번 바꾸기: 4번 틀린 뒤 맞히면 성공하고 틀린 횟수는 지워진다 (다시 5번 틀려야 잠김)', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    await setUp(t);
    const now = () => START.getTime();
    for (let i = 0; i < 4; i += 1) await changeWith(now, 'wrong-pass');
    assert.equal((await changeWith(now, PASSWORD)).ok, true);
    for (let i = 0; i < 4; i += 1) assert.equal((await changeWith(now, 'wrong-pass')).locked, undefined);
});

test('비번 바꾸기: 5번 틀리면 6번째는 계정을 읽지도 않고 locked', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const { store } = await setUp(t);
    const now = () => START.getTime();
    for (let i = 0; i < 5; i += 1) await changeWith(now, 'wrong-pass');
    const before = store.callsOf('findByUuid').length;
    assert.deepEqual(await changeWith(now, PASSWORD), { ok: false, locked: true });
    assert.equal(store.callsOf('findByUuid').length, before);
});

test('비번 바꾸기: 첫 실패부터 15분이 지나면 잠금이 풀려 다시 바꿀 수 있다', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    await setUp(t);
    let nowMs = START.getTime();
    const now = () => nowMs;
    for (let i = 0; i < 5; i += 1) await changeWith(now, 'wrong-pass');
    nowMs += 15 * 60 * 1000 - 1;
    assert.equal((await changeWith(now, PASSWORD)).locked, true);
    nowMs += 1;
    assert.equal((await changeWith(now, PASSWORD)).ok, true);
});

test('비번 바꾸기: 한 계정의 틀린 횟수는 다른 계정 잠금에 안 섞인다', async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const { store } = await setUp(t);
    store.data.users.push({ uuid: 'u-2', email: 'b@example.com', password_hash: await passwordHash() });
    const now = () => START.getTime();
    for (let i = 0; i < 5; i += 1) await changeWith(now, 'wrong-pass', 'u-1');
    assert.equal((await changeWith(now, PASSWORD, 'u-2')).ok, true);
});

test('이메일 중복 확인: 배열·숫자는 400', async (t) => {
    await setUp(t);
    await assert.rejects(authService.checkEmailAvailability(['a@b.com']), (e) => e.status === 400);
    await assert.rejects(authService.checkEmailAvailability(5), (e) => e.status === 400);
});

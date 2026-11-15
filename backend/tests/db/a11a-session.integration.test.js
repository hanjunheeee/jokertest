'use strict';

// 세션·토큰 시험(시험 DB): refresh 회전·30일 끝 그대로·직전 토큰 30초 봐줌·재사용 감지·거절 종류, 정지·쓸 수 없는 계정, 매 요청 세션 확인, 로그아웃
// 목록 A11-B-297~314 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const h = require('./a11a-auth-db-helpers');

const { db } = h;
const MIN_MS = 60 * 1000;
const REUSE_MESSAGE = '갱신 자격 재사용이 감지되어 모든 세션이 종료되었습니다. 다시 로그인해주세요.';
const REVOKED_MESSAGE = '세션이 폐기되었습니다. 다시 로그인해주세요.';

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

// ── 이 파일 안 작은 도우미 ──
const refresh = (refreshToken) => h.request(app.base, 'POST', '/auth/refresh', { cookies: { refreshToken } });
const me = (accessToken) => h.request(app.base, 'GET', '/auth/me', { cookies: { accessToken } });
const logout = (cookies) => h.request(app.base, 'POST', '/auth/logout', { cookies });
// 로그인 유지 켜고 로그인 → { user, cookies, sessionId }
async function rememberLogin(label, extra = {}) {
    const user = await h.createUser({ label, ...extra });
    const { res, cookies, sessionId } = await h.loginOverHttp(app.base, { email: user.email, password: user.password, rememberMe: true });
    assert.equal(res.status, 200, `준비: 로그인 ${res.status}`);
    return { user, cookies, sessionId };
}
const sessionRow = (id) => db.UserSession.findByPk(id, { raw: true });
const isAlive = (row) => Boolean(row.is_online) && row.revoked_at === null;
const ban = (uuid) => db.UserBan.create({ user_id: uuid, reason: '시험 정지', is_permanent: true, start_at: new Date(Date.now() - MIN_MS) });
// 두 쿠키 다 지웠나
const assertBothCleared = (res) => {
    assert.ok(h.isCleared(res.cookies.accessToken), 'accessToken 지우는 Set-Cookie 없음');
    assert.ok(h.isCleared(res.cookies.refreshToken), 'refreshToken 지우는 Set-Cookie 없음');
};

test('A11-B-297 refresh 회전 → 200, 새 refresh 쿠키 다름, 세션 해시 바뀜, 새 access로 /auth/me 200', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b297');
    const hashBefore = (await sessionRow(sessionId)).refresh_token_hash;
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true });
    assert.ok(res.cookies.refreshToken?.value, '새 refresh 쿠키 없음');
    assert.notEqual(res.cookies.refreshToken.value, cookies.refreshToken);
    assert.notEqual((await sessionRow(sessionId)).refresh_token_hash, hashBefore);
    assert.equal((await me(res.cookies.accessToken.value)).status, 200);
});

test('A11-B-298 회전해도 30일 끝 그대로, refresh 쿠키 수명 ≤ 남은 시간', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b298');
    const endBefore = new Date((await sessionRow(sessionId)).refresh_token_expires_at).getTime();
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 200);
    const endAfter = new Date((await sessionRow(sessionId)).refresh_token_expires_at).getTime();
    assert.equal(endAfter, endBefore);
    const maxAgeSeconds = Number(res.cookies.refreshToken.attrs['max-age']);
    assert.ok(maxAgeSeconds <= Math.ceil((endBefore - Date.now()) / 1000) + 1, `쿠키 수명 ${maxAgeSeconds}초가 남은 시간보다 김`);
    assert.ok(maxAgeSeconds < 30 * 24 * 60 * 60, '쿠키 수명이 30일로 다시 채워짐');
});

// 직전 토큰 봐주는 끝 칸을 DB로 옮김 (초 단위로 맞춰 반올림에 안 흔들림)
test('A11-B-299 회전 뒤 앞 토큰 (봐주는 끝까지 1초 남음) → 200 같은 새 토큰, 세션 살아 있음', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b299');
    const first = await refresh(cookies.refreshToken);
    await db.UserSession.update({ refresh_previous_expires_at: h.secondsFromNow(1) }, { where: { id: sessionId } });
    const again = await refresh(cookies.refreshToken);
    assert.equal(again.status, 200);
    assert.equal(again.cookies.refreshToken.value, first.cookies.refreshToken.value);
    assert.ok(isAlive(await sessionRow(sessionId)), '세션이 끊김');
});

test('A11-B-300 회전 뒤 앞 토큰 (봐주는 끝 1초 지남) → 401 재사용 + 세션 전부 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies, sessionId } = await rememberLogin('b300');
    await refresh(cookies.refreshToken);
    await db.UserSession.update({ refresh_previous_expires_at: h.secondsFromNow(-1) }, { where: { id: sessionId } });
    const again = await refresh(cookies.refreshToken);
    assert.equal(again.status, 401);
    assert.equal(again.body.message, REUSE_MESSAGE);
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-301 두 번 회전 뒤 처음 토큰 → 401 재사용 + 세션 전부 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies } = await rememberLogin('b301');
    const first = await refresh(cookies.refreshToken);
    const second = await refresh(first.cookies.refreshToken.value);
    assert.equal(second.status, 200, '준비: 두 번째 회전 실패');
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, REUSE_MESSAGE);
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-302 같은 토큰 동시 refresh 3개 → 3개 다 200, 세션 살아 있음', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b302');
    const results = await Promise.all([1, 2, 3].map(() => refresh(cookies.refreshToken)));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
    assert.ok(isAlive(await sessionRow(sessionId)), '세션이 끊김');
});

test('A11-B-303 모르는 토큰 → 401 유효하지 않음, 다른 세션 그대로, 두 쿠키 지움', async (t) => {
    if (h.noDb(t)) return;
    const { sessionId } = await rememberLogin('b303');
    const res = await refresh('a11a-not-a-real-refresh-token');
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '유효하지 않은 갱신 자격입니다. 다시 로그인해주세요.');
    assertBothCleared(res);
    assert.ok(isAlive(await sessionRow(sessionId)), '남의 세션이 끊김');
});

test('A11-B-304 로그아웃한 세션 refresh → 401 세션 폐기, 두 쿠키 지움', async (t) => {
    if (h.noDb(t)) return;
    const { cookies } = await rememberLogin('b304');
    assert.equal((await logout(cookies)).status, 200);
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, REVOKED_MESSAGE);
    assertBothCleared(res);
});

test('A11-B-305 30일 지남 → 401 유지 기간 만료, 두 쿠키 지움', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b305');
    await db.UserSession.update({ refresh_token_expires_at: new Date(Date.now() - MIN_MS) }, { where: { id: sessionId } });
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요.');
    assertBothCleared(res);
});

test('A11-B-306 정지 → refresh 403 정지 문구 + 세션 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies } = await rememberLogin('b306');
    await ban(user.uuid);
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '정지된 계정입니다. 사유: 시험 정지');
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-307 정지 풀린 뒤 그 옛 refresh → 401', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies } = await rememberLogin('b307');
    const row = await ban(user.uuid);
    assert.equal((await refresh(cookies.refreshToken)).status, 403, '준비: 정지 refresh가 403 아님');
    const liftedAt = new Date();
    await row.update({ is_permanent: false, end_at: liftedAt, lifted_at: liftedAt, lift_reason: '시험 해제' });
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 401);
});

test('A11-B-308 status ACTIVE 아님 → refresh 403 ACCOUNT_INACTIVE + 세션 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies } = await rememberLogin('b308');
    await db.User.update({ status: 'INACTIVE' }, { where: { uuid: user.uuid } });
    const res = await refresh(cookies.refreshToken);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_INACTIVE');
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-309 로그인 중 정지 → 다음 /auth/me 403 + 세션 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, cookies } = await rememberLogin('b309');
    await ban(user.uuid);
    const res = await me(cookies.accessToken);
    assert.equal(res.status, 403);
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-310 로그아웃한 세션의 access → /auth/me 401', async (t) => {
    if (h.noDb(t)) return;
    const { cookies } = await rememberLogin('b310');
    await logout({ accessToken: cookies.accessToken });
    const res = await me(cookies.accessToken);
    assert.equal(res.status, 401);
});

test('A11-B-311 access 있는 로그아웃 → 200, 세션 끊김, 두 쿠키 지움', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b311');
    const res = await logout({ accessToken: cookies.accessToken });
    assert.equal(res.status, 200);
    assertBothCleared(res);
    assert.equal(isAlive(await sessionRow(sessionId)), false);
});

// 만료된 access = 같은 키·같은 세션 id로 지난 시각 토큰
test('A11-B-312 access 만료된 로그아웃 → 토큰 속 세션 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { user, sessionId } = await rememberLogin('b312');
    const expired = jwt.sign({ uuid: user.uuid, role: 'USER', sessionId, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const res = await logout({ accessToken: expired });
    assert.equal(res.status, 200);
    assert.equal(isAlive(await sessionRow(sessionId)), false);
});

test('A11-B-313 access 없이 refresh 쿠키만 로그아웃 → 그 세션 끊김', async (t) => {
    if (h.noDb(t)) return;
    const { cookies, sessionId } = await rememberLogin('b313');
    const res = await logout({ refreshToken: cookies.refreshToken });
    assert.equal(res.status, 200);
    assert.equal(isAlive(await sessionRow(sessionId)), false);
});

test('A11-B-314 A 로그인 → B 로그인 → A 로그아웃 → B /auth/me 200', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b314' });
    const deviceA = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    const deviceB = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    await logout({ accessToken: deviceA.cookies.accessToken });
    const res = await me(deviceB.cookies.accessToken);
    assert.equal(res.status, 200);
});

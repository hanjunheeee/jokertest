'use strict';

// 로그인 시험(시험 DB): 성공 답·로그인 유지 켬/끔, 틀림 횟수·15분 잠금·잠금 경계, 정지·쓸 수 없는 계정·탈퇴 계정, 다른 기기 새 로그인
// 목록 A11-B-261~290 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a11a-auth-db-helpers');

const { db } = h;
const FAIL_MESSAGE = '이메일 또는 비밀번호가 일치하지 않습니다.';
const LOCKING_MESSAGE = '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.';
const LOCKED_MESSAGE = '비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.';
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

// ── 이 파일 안 작은 도우미 ──
const login = (body, options = {}) => h.request(app.base, 'POST', '/auth/login', { body, ...options });
const loginAs = (user, options) => h.loginOverHttp(app.base, { email: user.email, password: user.password, ...options });
const wrong = (user, options) => login({ email: user.email, password: `${user.password}-x` }, options);
const me = (accessToken) => h.request(app.base, 'GET', '/auth/me', { cookies: { accessToken } });
// n번 틀림 → 마지막 답
async function wrongTimes(user, n, options) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await wrong(user, options);
    return res;
}
// 정지 줄 (영구 또는 끝 시각), 관리자가 거는 모양
const ban = (uuid, { reason = '시험 정지 사유', permanent = false, endAt = new Date(Date.now() + DAY_MS) } = {}) => db.UserBan.create({
    user_id: uuid, reason, is_permanent: permanent, start_at: new Date(Date.now() - MIN_MS), end_at: permanent ? null : endAt,
});

test('A11-B-261 로그인 성공 → 200, user는 uuid·닉네임·role만, 토큰은 쿠키로만', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b261' });
    const { res, cookies } = await loginAs(user);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data.user).sort(), ['nickname', 'role', 'uuid']);
    assert.equal(res.body.data.user.uuid, user.uuid);
    assert.equal(res.body.data.user.nickname, user.nickname);
    assert.ok(cookies.accessToken, 'accessToken 쿠키 없음');
    assert.equal(res.text.includes(cookies.accessToken), false);
    assert.equal(/password|hash|token/i.test(res.text), false);
});

test('A11-B-262 로그인 유지 켬 → refresh 쿠키, access 15분, 세션 끝 = 지금+30일', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b262' });
    const before = Date.now();
    const { res, cookies, sessionId } = await loginAs(user, { rememberMe: true });
    assert.equal(res.status, 200);
    assert.ok(cookies.refreshToken, 'refreshToken 쿠키 없음');
    const token = h.decodeJwt(cookies.accessToken);
    assert.equal(token.exp - token.iat, 15 * 60);
    const session = await db.UserSession.findByPk(sessionId, { raw: true });
    const end = new Date(session.refresh_token_expires_at).getTime();
    assert.ok(Math.abs(end - (before + 30 * DAY_MS)) <= 5000, `세션 끝이 30일 뒤 아님: ${new Date(end).toISOString()}`);
});

test('A11-B-263 로그인 유지 끔 → refresh 쿠키 지움, access 쿠키 수명 없음, 토큰 1일', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b263' });
    const { res } = await loginAs(user);
    assert.equal(res.status, 200);
    assert.ok(h.isCleared(res.cookies.refreshToken), 'refreshToken 지우는 Set-Cookie 없음');
    const access = res.cookies.accessToken;
    assert.equal(access.attrs['max-age'], undefined);
    assert.equal(access.attrs.expires, undefined);
    const token = h.decodeJwt(access.value);
    assert.equal(token.exp - token.iat, 24 * 60 * 60);
});

test('A11-B-264 없는 이메일 → 401 같은 문구', async (t) => {
    if (h.noDb(t)) return;
    const res = await login({ email: h.emailOf('b264'), password: 'pass1234' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, FAIL_MESSAGE);
});

test('A11-B-265 있는 이메일 틀린 비번 → 401, 없는 이메일과 본문 같음', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b265' });
    const missing = await login({ email: h.emailOf('b265m'), password: 'pass1234' });
    const res = await wrong(user);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, missing.body);
    assert.equal(res.body.message, FAIL_MESSAGE);
});

// 틀림 n번째 = 401 같은 문구 + 실패 횟수 n
for (const n of [1, 2, 3, 4]) {
    const id = `A11-B-${265 + n}`;
    test(`${id} 틀림 ${n}번째 → 401, 실패 횟수 ${n}`, async (t) => {
        if (h.noDb(t)) return;
        const user = await h.createUser({ label: `b${265 + n}` });
        const res = await wrongTimes(user, n);
        assert.equal(res.status, 401);
        assert.equal(res.body.message, FAIL_MESSAGE);
        assert.equal((await h.userRow(user.uuid)).failed_login_count, n);
    });
}

test('A11-B-270 5번째 틀림 → 423 잠금 문구, 잠금 끝 = 지금+15분', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b270' });
    await wrongTimes(user, 4);
    const at = Date.now();
    const res = await wrong(user);
    assert.equal(res.status, 423);
    assert.equal(res.body.message, LOCKING_MESSAGE);
    const lockedUntil = new Date((await h.userRow(user.uuid)).locked_until).getTime();
    assert.ok(Math.abs(lockedUntil - (at + 15 * MIN_MS)) <= 2000, `잠금 끝이 15분 뒤 아님: ${new Date(lockedUntil).toISOString()}`);
});

test('A11-B-271 잠긴 동안 맞는 비번 → 423 잠김 문구', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b271' });
    await wrongTimes(user, 5);
    const { res } = await loginAs(user);
    assert.equal(res.status, 423);
    assert.equal(res.body.message, LOCKED_MESSAGE);
});

test('A11-B-272 잠긴 동안 틀린 비번 3번 → 423, 실패 횟수·로그인 기록 그대로', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b272' });
    await wrongTimes(user, 5);
    const countBefore = (await h.userRow(user.uuid)).failed_login_count;
    const historyBefore = (await h.historyOf(user.uuid)).length;
    for (let i = 0; i < 3; i += 1) {
        const res = await wrong(user);
        assert.equal(res.status, 423);
    }
    assert.equal((await h.userRow(user.uuid)).failed_login_count, countBefore);
    assert.equal((await h.historyOf(user.uuid)).length, historyBefore);
});

// 잠금 끝 칸을 DB로 옮김 (초 단위로 맞춰 반올림에 안 흔들림)
test('A11-B-273 잠금 1초 남음 → 맞는 비번 423', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b273' });
    await wrongTimes(user, 5);
    await db.User.update({ locked_until: h.secondsFromNow(1) }, { where: { uuid: user.uuid } });
    const { res } = await loginAs(user);
    assert.equal(res.status, 423);
});

test('A11-B-274 잠금 1초 지남 → 맞는 비번 200', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b274' });
    await wrongTimes(user, 5);
    await db.User.update({ locked_until: h.secondsFromNow(-1) }, { where: { uuid: user.uuid } });
    const { res } = await loginAs(user);
    assert.equal(res.status, 200);
});

test('A11-B-275 잠금 끝난 뒤 한 번 틀림 → 401 (다시 안 잠김), 실패 횟수 1', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b275' });
    await wrongTimes(user, 5);
    await db.User.update({ locked_until: h.secondsFromNow(-1) }, { where: { uuid: user.uuid } });
    const res = await wrong(user);
    assert.equal(res.status, 401);
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 1);
});

test('A11-B-276 4번 틀린 뒤 맞으면 셈 0 → 다시 틀림 401·횟수 1', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b276' });
    await wrongTimes(user, 4);
    const { res } = await loginAs(user);
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 0);
    const again = await wrong(user);
    assert.equal(again.status, 401);
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 1);
});

test('A11-B-277 IP A로 5번 틀림 → IP B에서 맞는 비번 423 (계정 단위 잠금)', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b277' });
    await wrongTimes(user, 5, { ip: h.nextIp() });
    const { res } = await loginAs(user, { ip: h.nextIp() });
    assert.equal(res.status, 423);
});

test('A11-B-278 틀린 비번 5개 동시 → 실패 횟수 5·잠금 걸림', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b278' });
    await Promise.all(Array.from({ length: 5 }, () => wrong(user)));
    const row = await h.userRow(user.uuid);
    assert.equal(row.failed_login_count, 5);
    assert.ok(row.locked_until && new Date(row.locked_until).getTime() > Date.now(), '잠금 안 걸림');
});

// 앞 빈칸 든 비번으로 진짜 가입 (가입이 빈칸을 안 자르는지와 로그인 비교가 같은지 같이 봄)
test('A11-B-279 " pass1234"로 가입 → "pass1234" 로그인 401', async (t) => {
    if (h.noDb(t)) return;
    const account = await h.signupOverHttp(app.base, { label: 'b279', password: ' pass1234' });
    const res = await login({ email: account.email, password: 'pass1234' });
    assert.equal(res.status, 401);
});

test('A11-B-280 " pass1234"로 가입 → " pass1234" 로그인 200', async (t) => {
    if (h.noDb(t)) return;
    const account = await h.signupOverHttp(app.base, { label: 'b280', password: ' pass1234' });
    const res = await login({ email: account.email, password: ' pass1234' });
    assert.equal(res.status, 200);
});

test('A11-B-281 정지 계정 틀린 비번 → 401 보통 문구(사유 없음)', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b281' });
    await ban(user.uuid, { reason: 'b281 사유 글' });
    const res = await wrong(user);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, FAIL_MESSAGE);
    assert.equal(res.text.includes('b281 사유 글'), false);
});

test('A11-B-282 정지 계정 맞는 비번 → 403 사유 문구 + 그 사람 세션 전부 끊김', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b282' });
    assert.equal((await loginAs(user)).res.status, 200);
    await ban(user.uuid, { reason: 'b282 사유' });
    const { res } = await loginAs(user);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '정지된 계정입니다. 사유: b282 사유');
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0);
});

test('A11-B-283 끝 없는(영구) 정지 → 403', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b283' });
    await ban(user.uuid, { permanent: true });
    const { res } = await loginAs(user);
    assert.equal(res.status, 403);
});

// 관리자 풀기가 남기는 모양 그대로: 해제 시각·해제한 사람·까닭 + 영구 끔·끝 = 푼 시각
test('A11-B-284 풀린 정지(lifted_at 있음) → 200', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b284' });
    const row = await ban(user.uuid, { permanent: true });
    const liftedAt = new Date(Date.now() - MIN_MS);
    await row.update({ is_permanent: false, end_at: liftedAt, lifted_at: liftedAt, lift_reason: '시험 해제' });
    const { res } = await loginAs(user);
    assert.equal(res.status, 200);
});

test('A11-B-285 정지 계정 틀린 비번 5번 → 5번째 423 (정지 사유 안 보임)', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b285' });
    await ban(user.uuid, { reason: 'b285 사유 글' });
    const res = await wrongTimes(user, 5);
    assert.equal(res.status, 423);
    assert.equal(res.text.includes('b285 사유 글'), false);
});

test('A11-B-286 status ACTIVE 아님 + 맞는 비번 → 403 ACCOUNT_INACTIVE', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b286', status: 'INACTIVE' });
    const { res } = await loginAs(user);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_INACTIVE');
    assert.equal(res.body.message, '이용할 수 없는 계정입니다.');
});

test('A11-B-287 탈퇴한 사람의 옛 이메일·비번 → 401 같은 문구', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b287' });
    const { withdrawAccount } = require('../../services/auth/account/withdraw');
    await withdrawAccount({ uuid: user.uuid, password: user.password });
    const { res } = await loginAs(user);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, FAIL_MESSAGE);
});

test('A11-B-288 기기 A 로그인 → 기기 B 로그인 → A access로 /auth/me 401 세션 만료', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b288' });
    const deviceA = await loginAs(user, { ip: h.nextIp() });
    await loginAs(user, { ip: h.nextIp() });
    const res = await me(deviceA.cookies.accessToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '세션이 만료되었습니다. 다시 로그인해주세요.');
});

test('A11-B-289 기기 A(유지) → 기기 B 로그인 → A refresh 401 세션 폐기', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b289' });
    const deviceA = await loginAs(user, { rememberMe: true, ip: h.nextIp() });
    await loginAs(user, { rememberMe: true, ip: h.nextIp() });
    const res = await h.request(app.base, 'POST', '/auth/refresh', { cookies: { refreshToken: deviceA.cookies.refreshToken } });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '세션이 폐기되었습니다. 다시 로그인해주세요.');
});

test('A11-B-290 같은 계정 맞는 비번 둘 동시 → 살아 있는 세션 1줄', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b290' });
    const results = await Promise.all([loginAs(user), loginAs(user)]);
    assert.ok(results.some(({ res }) => res.status === 200), `로그인 답: ${results.map(({ res }) => res.status)}`);
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 1);
});

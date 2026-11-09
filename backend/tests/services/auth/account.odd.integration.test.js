'use strict';

// 계정 이상한 순서·동시 시험 파일, 한 계정에 로그인·로그아웃·refresh·탈퇴·비번 바꾸기·재설정이 같은 순간 겹칠 때
// 진짜 시험 DB, 끝마다 "살아 있는 세션이 맞는지"를 세션 확인(resolveSession) 그대로 봄, 메일은 메모리 가짜
// npm run test:with-db -- tests/services/auth/account.odd.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'account-odd-test-secret';
process.env.PASSWORD_RESET_APP_URL = 'http://app.test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb } = require('../../admin/helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../../models');
const account = () => require('../../../services/auth/account');
const lifecycle = () => require('../../../services/auth/sessionLifecycle');
const PASSWORD = 'old-password-1234';
const NEW_PASSWORD = 'new-password-5678';
const REQ_INFO = { ip: '10.0.0.2', userAgent: 'odd', deviceType: 'PC' };

// 로그인할 수 있는 회원 하나
const makeUser = async () => {
    const { hashPassword } = require('../../../utils/auth/credentials');
    const tag = crypto.randomBytes(3).toString('hex');
    const user = await db().User.create({
        uuid: crypto.randomUUID(), password_hash: await hashPassword(PASSWORD), nickname: `계정${tag}`, email: `odd-acc-${tag}@example.com`,
    });
    await db().UserStats.create({ user_id: user.uuid });
    return user;
};

// 약속 하나를 { ok, value | status, code } 로 (던짐도 결과로 모음)
const settle = (promise) => promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, status: error.status ?? 500, code: error.code ?? null, message: error.message }),
);

const login = (user, { password = PASSWORD, rememberMe = false } = {}) => settle(
    account().login({ email: user.email, password, rememberMe }, REQ_INFO),
);

// 토큰 세션이 지금 쓸 수 있는지 (세션 확인 그대로)
const sessionOk = async (token) => (await lifecycle().resolveSession(lifecycle().verifyAccessToken(token))).ok;
const sessionIdOf = (token) => lifecycle().verifyAccessToken(token).sessionId;
const aliveSessions = (uuid) => db().UserSession.count({ where: { user_id: uuid, is_online: true, revoked_at: null } });

// ── 로그인 ──

test('[동시] 같은 계정에 틀린 비번 8번이 같은 순간 → 401 넷·423 넷, 실패 기록 다섯, 횟수 5에서 잠김', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const results = await Promise.all(Array.from({ length: 8 }, () => login(user, { password: 'wrong-password-0' })));
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [401, 401, 401, 401, 423, 423, 423, 423], JSON.stringify(results));
    const row = await db().User.findByPk(user.uuid, { raw: true });
    assert.equal(row.failed_login_count, 5);
    assert.ok(row.locked_until && new Date(row.locked_until) > new Date(), '잠금 시각이 있어야 함');
    assert.equal(await db().LoginHistory.count({ where: { user_id: user.uuid, success: false } }), 5, '잠긴 뒤 시도는 기록 안 남음');
});

test('[동시] 틀린 비번 4번과 맞는 비번 1번이 같은 순간 → 맞는 쪽 200, 잠기지 않음, 살아 있는 세션 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const [good, ...bad] = await Promise.all([
        login(user),
        ...Array.from({ length: 4 }, () => login(user, { password: 'wrong-password-0' })),
    ]);
    assert.equal(good.ok, true, good.message);
    for (const result of bad) assert.equal(result.status, 401);
    const row = await db().User.findByPk(user.uuid, { raw: true });
    assert.equal(row.locked_until, null);
    assert.ok(row.failed_login_count < 5);
    assert.equal(await sessionOk(good.value.token), true);
    assert.equal(await aliveSessions(user.uuid), 1);
});

test('[동시] 두 기기가 로그인 유지로 같은 순간 로그인 → 하나만 살아 있음, 진 쪽 refresh는 401이고 이긴 쪽 세션은 안 끊음', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const [first, second] = await Promise.all([login(user, { rememberMe: true }), login(user, { rememberMe: true })]);
    assert.equal(first.ok && second.ok, true, JSON.stringify([first, second]));
    const okFlags = [await sessionOk(first.value.token), await sessionOk(second.value.token)];
    assert.deepEqual(okFlags.sort(), [false, true], '살아 있는 세션은 정확히 하나');
    const winner = (await sessionOk(first.value.token)) ? first.value : second.value;
    const loser = winner === first.value ? second.value : first.value;
    const refreshed = await settle(account().refresh(loser.refreshToken));
    assert.equal(refreshed.ok, false);
    assert.equal(refreshed.status, 401);
    assert.equal(await sessionOk(winner.token), true, '진 쪽 refresh가 이긴 쪽 세션까지 끊으면 안 됨');
    const winnerRefresh = await settle(account().refresh(winner.refreshToken));
    assert.equal(winnerRefresh.ok, true, winnerRefresh.message);
});

test('[동시] 로그아웃과 refresh가 같은 순간 → 끝엔 세션 폐기, refresh가 준 새 토큰도 401, access도 못 씀', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const { value } = await login(user, { rememberMe: true });
    const [refreshed] = await Promise.all([
        settle(account().refresh(value.refreshToken)),
        settle(account().logout({ uuid: user.uuid, sessionId: sessionIdOf(value.token) })),
    ]);
    assert.ok(refreshed.ok || refreshed.status === 401, JSON.stringify(refreshed));
    assert.equal(await sessionOk(value.token), false);
    if (refreshed.ok) {
        assert.equal(await sessionOk(refreshed.value.accessToken), false, 'refresh로 받은 access도 못 씀');
        const again = await settle(account().refresh(refreshed.value.refreshToken));
        assert.equal(again.status, 401, '로그아웃 뒤 새 refresh로 세션 되살리면 안 됨');
    }
    assert.equal(await aliveSessions(user.uuid), 0);
});

test('[따닥+동시] 로그인 유지 refresh 세 번(따닥)이 도는 중 다른 곳에서 새 로그인 → 새 세션은 살아 있음, 500 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const { value: old } = await login(user, { rememberMe: true });
    const [r1, r2, r3, fresh] = await Promise.all([
        settle(account().refresh(old.refreshToken)),
        settle(account().refresh(old.refreshToken)),
        settle(account().refresh(old.refreshToken)),
        login(user, { rememberMe: true }),
    ]);
    for (const result of [r1, r2, r3]) assert.ok(result.ok || result.status === 401, JSON.stringify(result));
    assert.equal(fresh.ok, true, fresh.message);
    assert.equal(await sessionOk(fresh.value.token), true, '옛 세션 refresh가 새 로그인 세션을 끊으면 안 됨');
    assert.equal(await sessionOk(old.token), false);
    assert.equal(await aliveSessions(user.uuid), 1);
});

// ── 탈퇴 ──

test('[따닥] 탈퇴 버튼 두 번이 같은 순간 → 하나만 ok, 다른 쪽 404 USER_NOT_FOUND (500 아님), 계정 닫힘', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const results = await Promise.all([1, 2].map(() => settle(account().withdrawAccount({ uuid: user.uuid, password: PASSWORD }))));
    assert.equal(results.filter((result) => result.ok).length, 1, JSON.stringify(results));
    const lost = results.find((result) => !result.ok);
    assert.equal(lost.status, 404, JSON.stringify(lost));
    assert.equal(lost.code, 'USER_NOT_FOUND');
    const row = await db().User.findOne({ where: { uuid: user.uuid }, paranoid: false, raw: true });
    assert.equal(row.status, 'WITHDRAWN');
});

test('[동시] 탈퇴와 다른 곳 로그인이 같은 순간 → 탈퇴 ok, 로그인이 이겼어도 그 세션은 못 씀', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const [withdraw, loggedIn] = await Promise.all([
        settle(account().withdrawAccount({ uuid: user.uuid, password: PASSWORD })),
        login(user),
    ]);
    assert.equal(withdraw.ok, true, withdraw.message);
    assert.ok(loggedIn.ok || loggedIn.status === 401, JSON.stringify(loggedIn));
    if (loggedIn.ok) assert.equal(await sessionOk(loggedIn.value.token), false, '탈퇴 뒤 살아 있는 세션');
    assert.equal(await aliveSessions(user.uuid), 0);
    assert.equal((await login(user)).status, 401);
});

// ── 비번 바꾸기·재설정 ──

test('[동시] 비번 바꾸기와 다른 곳 옛 비번 로그인이 같은 순간 → 끝엔 살아 있는 세션 없음, 옛 비번 401·새 비번 200', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const [change, loggedIn] = await Promise.all([
        settle(account().changePassword({ uuid: user.uuid, currentPassword: PASSWORD, newPassword: NEW_PASSWORD })),
        login(user),
    ]);
    assert.equal(change.ok && change.value.ok, true, JSON.stringify(change));
    assert.ok(loggedIn.ok || loggedIn.status === 401, JSON.stringify(loggedIn));
    if (loggedIn.ok) assert.equal(await sessionOk(loggedIn.value.token), false, '옛 비번으로 받은 세션이 살아 있음');
    assert.equal(await aliveSessions(user.uuid), 0);
    assert.equal((await login(user)).status, 401);
    assert.equal((await login(user, { password: NEW_PASSWORD })).ok, true);
});

// 재설정 메일을 메모리로 받아 링크 속 토큰 꺼냄
const requestResetToken = async (user) => {
    const mail = require('../../../utils/adapters/mail').createMemoryMailAdapter();
    const reset = require('../../../services/auth/passwordReset');
    await reset.requestPasswordReset({ email: user.email }, { mailAdapter: mail });
    const sent = mail.outbox.at(-1);
    assert.equal(sent?.template, 'PASSWORD_RESET');
    return new URL(sent.params.resetUrl).searchParams.get('token');
};

test('[동시] 비번 재설정 확인과 옛 비번 로그인이 같은 순간 → 확인 ok, 끝엔 살아 있는 세션 없음, 같은 링크 두 번째는 USED', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const reset = require('../../../services/auth/passwordReset');
    const token = await requestResetToken(user);
    const [confirm, loggedIn] = await Promise.all([
        reset.confirmPasswordReset(token, NEW_PASSWORD),
        login(user),
    ]);
    assert.deepEqual(confirm, { ok: true });
    if (loggedIn.ok) assert.equal(await sessionOk(loggedIn.value.token), false, '옛 비번 세션이 재설정 뒤 살아 있음');
    assert.equal(await aliveSessions(user.uuid), 0);
    const again = await reset.confirmPasswordReset(token, 'another-password-9');
    assert.equal(again.code, 'USED');
    assert.equal((await login(user, { password: NEW_PASSWORD })).ok, true);
});

test('[따닥] 비번 찾기 요청 세 번이 같은 순간 → 열린 토큰 하나, 메일로 간 링크 중 마지막 하나만 VALID', async (t) => {
    if (skipWithoutDb(t)) return;
    const user = await makeUser();
    const mail = require('../../../utils/adapters/mail').createMemoryMailAdapter();
    const reset = require('../../../services/auth/passwordReset');
    const results = await Promise.all([1, 2, 3].map(() => reset.requestPasswordReset({ email: user.email }, { mailAdapter: mail })));
    assert.deepEqual(results, [{ ok: true }, { ok: true }, { ok: true }]);
    const open = await db().sequelize.query(
        'SELECT id FROM password_reset_tokens WHERE user_id = :uuid AND used = 0 AND revoked_at IS NULL',
        { replacements: { uuid: user.uuid }, type: db().Sequelize.QueryTypes.SELECT },
    );
    assert.equal(open.length, 1, '열린 토큰은 하나');
    const tokens = mail.outbox.map((sent) => new URL(sent.params.resetUrl).searchParams.get('token'));
    assert.equal(tokens.length, 3);
    const verdicts = await Promise.all(tokens.map((token) => reset.verifyPasswordReset(token)));
    assert.equal(verdicts.filter((verdict) => verdict.ok).length, 1, JSON.stringify(verdicts));
});

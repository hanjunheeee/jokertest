'use strict';

// 정지 뒤 http 요청 시험(시험 DB) — 세션이 이미 끊겼어도 정지 중이면 403 ACCOUNT_BANNED + 정지 글, 정지 끝나면 401, 충전 경로도 정지 code
// 목록 A11-B-392~394·398 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md "세션 끊김 까닭으로 더한 것"), 돌리기: with-lock.sh testdb
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a11a-auth-db-helpers');
const { createError } = require('../../utils/appError');
const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

const { db } = h;
const MIN_MS = 60 * 1000;
const BANNED = { code: 'ACCOUNT_BANNED', message: '정지된 계정입니다. 사유: 시험 정지' };

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

const me = (accessToken) => h.request(app.base, 'GET', '/auth/me', { cookies: { accessToken } });
// 로그인 → access 토큰
async function loggedIn(label) {
    const user = await h.createUser({ label });
    const { res, cookies } = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    assert.equal(res.status, 200, `준비: 로그인 ${res.status}`);
    return { user, accessToken: cookies.accessToken };
}
const ban = (uuid) => db.UserBan.create({ user_id: uuid, reason: '시험 정지', is_permanent: true, start_at: new Date(Date.now() - MIN_MS) });
// 답 본문에서 정지 칸만
const banPart = (res) => ({ code: res.body.code, message: res.body.message });

test('A11-B-392 정지 첫 요청이 세션을 끊은 뒤 같은 토큰 다음 요청 → 401 아닌 403 ACCOUNT_BANNED + 정지 글', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken } = await loggedIn('b392');
    await ban(user.uuid);
    const first = await me(accessToken);
    assert.equal(first.status, 403, '준비: 첫 요청');
    assert.equal((await h.liveSessionsOf(user.uuid)).length, 0, '준비: 세션 안 끊김');
    const second = await me(accessToken);
    assert.equal(second.status, 403);
    assert.deepEqual(banPart(second), BANNED);
});

test('A11-B-393 정지 첫 요청 답에 code ACCOUNT_BANNED (화면이 정지로 알아봄)', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken } = await loggedIn('b393');
    await ban(user.uuid);
    const res = await me(accessToken);
    assert.equal(res.status, 403);
    assert.deepEqual(banPart(res), BANNED);
});

test('A11-B-394 정지로 세션 끊긴 뒤 정지 끝남 → 같은 토큰 401 세션 만료 (정지 글 안 나옴)', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken } = await loggedIn('b394');
    await ban(user.uuid);
    assert.equal((await me(accessToken)).status, 403, '준비: 정지 요청');
    await db.UserBan.update({ is_permanent: false, end_at: new Date(Date.now() - 1000) }, { where: { user_id: user.uuid } });
    const res = await me(accessToken);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, undefined);
    assert.equal(res.body.message, '세션이 만료되었습니다. 다시 로그인해주세요.');
});

// 충전 경로는 오류 처리기가 정한 code·글만 내보냄 → 정지 code가 500으로 바뀌면 안 됨 (사유는 전처럼 안 실음)
test('A11-B-398 충전 경로 정지 거절(code ACCOUNT_BANNED) → 403 정지 code + 사유 없는 글', () => {
    let status = null;
    let body = null;
    const res = {
        headersSent: false,
        set() { return res; },
        status(code) { status = code; return res; },
        json(value) { body = value; return res; },
    };
    const req = { originalUrl: '/economy/topup/orders', method: 'POST' };
    globalErrorHandler(createError(BANNED.message, 403, 'ACCOUNT_BANNED'), req, res, () => {});
    assert.equal(status, 403);
    assert.deepEqual(body, { success: false, code: 'ACCOUNT_BANNED', message: '정지된 계정입니다.' });
});

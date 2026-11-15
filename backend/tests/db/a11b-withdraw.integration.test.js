'use strict';

// 회원 탈퇴 요청 시험(시험 DB, 진짜 경로 POST /user/me/withdraw) — 비번 계정·세션 끊김·옛 이메일 로그인·비번 빈칸/틀림·15분 5번·경로 15분 10번·소셜 본인 확인·판 중 거절·로그인 안 함
// 목록 A11-B-731~750 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { noDb } = h;
const PATH = '/user/me/withdraw';
const WRONG = 'Wrong-pass-1';

test.before(h.prepareDb);
test.after(h.closeDb);

// 비번 계정 + 로그인 세션
async function loggedIn(t, { clock = false, prefix = 'w', social = false } = {}) {
    const app = await h.startApp(t, { clock });
    const user = social ? await h.createSocialUser({ prefix }) : await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const withdraw = (app, session, body) => app.post(PATH, body, { cookie: session.cookie });

// 계정 줄이 탈퇴 전 그대로인지 (상태·이메일·닉네임·지운 시각)
async function assertAccountKept(user) {
    const row = await h.userRow(user.uuid);
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.email, user.email);
    assert.equal(row.nickname, user.nickname);
    assert.equal(row.deleted_at, null);
}

test('A11-B-731 비번 계정 맞는 비번 → 200 "회원 탈퇴가 완료되었습니다.", 세션 쿠키 지우는 Set-Cookie', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await withdraw(app, session, { password: user.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '회원 탈퇴가 완료되었습니다.');
    const cleared = res.setCookies.find((line) => line.startsWith('accessToken='));
    assert.ok(cleared, 'accessToken 지우는 Set-Cookie 없음');
    assert.match(cleared, /^accessToken=;/);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
});

test('A11-B-732 탈퇴 뒤 같은 쿠키로 보호 경로 → 401', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    assert.equal((await withdraw(app, session, { password: user.password })).status, 200, '준비: 탈퇴');
    const res = await app.get('/user/me/profile', { cookie: session.cookie });
    assert.equal(res.status, 401);
});

test('A11-B-733 탈퇴 전 이메일·비번 로그인 → 없는 계정과 같은 401·같은 문구', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    assert.equal((await withdraw(app, session, { password: user.password })).status, 200, '준비: 탈퇴');
    const withdrawn = await h.login(app, user.email, user.password);
    const nobody = await h.login(app, `a11b-none-${h.tail()}@example.com`, user.password);
    assert.equal(withdrawn.status, 401);
    assert.equal(nobody.status, 401);
    assert.deepEqual(withdrawn.body, nobody.body);
});

test('A11-B-734 비번 계정 + 빈 비번 → 400 WITHDRAW_PASSWORD_REQUIRED, 계정 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await withdraw(app, session, { password: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'WITHDRAW_PASSWORD_REQUIRED');
    await assertAccountKept(user);
});

test('A11-B-735 틀린 비번 → 400 WITHDRAW_PASSWORD_INVALID "비밀번호가 올바르지 않습니다.", 계정 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await withdraw(app, session, { password: WRONG });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'WITHDRAW_PASSWORD_INVALID');
    assert.equal(res.body.message, '비밀번호가 올바르지 않습니다.');
    await assertAccountKept(user);
});

// ── 비번 15분 5번 (736~738) ──

async function wrongTimes(app, session, n) {
    for (let i = 0; i < n; i += 1) {
        assert.equal((await withdraw(app, session, { password: WRONG })).status, 400, `준비: ${i + 1}번째 틀림은 400`);
    }
}

test('A11-B-736 5번 틀린 뒤 6번째는 맞는 비번이어도 429 WITHDRAW_LOCKED, 계정 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await wrongTimes(app, session, 5);
    const res = await withdraw(app, session, { password: user.password });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'WITHDRAW_LOCKED');
    await assertAccountKept(user);
});

test('A11-B-737 4번 틀린 뒤 맞으면 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await wrongTimes(app, session, 4);
    const res = await withdraw(app, session, { password: user.password });
    assert.equal(res.status, 200);
});

test('A11-B-738 5번 틀린 뒤 가짜 시계 15분 지나 맞으면 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    await wrongTimes(app, session, 5);
    app.clock.tick(15 * 60 * 1000);
    const res = await withdraw(app, session, { password: user.password });
    assert.equal(res.status, 200);
});

// ── 경로 15분 10번 (739~740): 빈 비번(틀림 셈 안 오름)으로 채움 ──

async function emptyTimes(app, session, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await withdraw(app, session, { password: '' });
    return res;
}

test('A11-B-739 탈퇴 경로 10번째 요청 → 처리됨 (요청 수 제한 아님)', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const res = await emptyTimes(app, session, 10);
    assert.notEqual(res.status, 429);
    assert.equal(res.body.code, 'WITHDRAW_PASSWORD_REQUIRED');
});

test('A11-B-740 탈퇴 경로 11번째 → 내용과 상관없이 429 "요청이 너무 많습니다…"', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await emptyTimes(app, session, 10);
    // 11번째는 맞는 비번
    const res = await withdraw(app, session, { password: user.password });
    assert.equal(res.status, 429);
    assert.match(res.body.message, /^요청이 너무 많습니다/);
    await assertAccountKept(user);
});

// ── 소셜 전용 계정 본인 확인 (741~744) ──

test('A11-B-741 소셜 전용 confirmEmail = 계정 이메일 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { social: true, prefix: 'ws' });
    const res = await withdraw(app, session, { confirmEmail: user.email });
    assert.equal(res.status, 200);
});

test('A11-B-742 소셜 전용 다른 이메일 → 400 WITHDRAW_CONFIRM_MISMATCH', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { social: true, prefix: 'ws' });
    const res = await withdraw(app, session, { confirmEmail: `other-${h.tail()}@example.com` });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'WITHDRAW_CONFIRM_MISMATCH');
    await assertAccountKept(user);
});

test('A11-B-743 소셜 전용 빈 글자 → 400 WITHDRAW_CONFIRM_MISMATCH', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { social: true, prefix: 'ws' });
    const res = await withdraw(app, session, { confirmEmail: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'WITHDRAW_CONFIRM_MISMATCH');
    await assertAccountKept(user);
});

test('A11-B-744 [지금 동작] 소셜 전용 이메일 대문자 섞고 앞뒤 빈칸 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { social: true, prefix: 'ws' });
    const res = await withdraw(app, session, { confirmEmail: `  ${user.email.toUpperCase()}  ` });
    assert.equal(res.status, 200);
});

// ── 판 중 산 사람은 거절 (745~749) ──

const IN_GAME = [
    ['A11-B-745', 5],
    ['A11-B-746', 6],
    ['A11-B-747', 7],
    ['A11-B-748', 8],
    ['A11-B-749', 10],
];

for (const [id, n] of IN_GAME) {
    test(`${id} ${n}명 판 도는 중 산 사람이 탈퇴 → 409 WITHDRAW_IN_GAME, 계정·판 자리 그대로`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t, { prefix: 'wg' });
        t.after(h.resetGames);
        const game = h.seatInGame(user.uuid, n, `${id}-${h.tail()}`);
        assert.equal(game.players.size, n, '준비: 판 인원');
        assert.equal(game.players.get(user.uuid).alive, true, '준비: 산 사람');
        const res = await withdraw(app, session, { password: user.password });
        assert.equal(res.status, 409);
        assert.equal(res.body.code, 'WITHDRAW_IN_GAME');
        assert.equal(res.body.message, '진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.');
        await assertAccountKept(user);
        assert.equal(game.players.get(user.uuid)?.alive, true, '판 자리가 바뀜');
        assert.equal((await app.get('/user/me/profile', { cookie: session.cookie })).status, 200, '세션이 끊김');
    });
}

test('A11-B-750 쿠키 없이 탈퇴 → 401', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await app.post(PATH, { password: 'whatever-1' });
    assert.equal(res.status, 401);
});

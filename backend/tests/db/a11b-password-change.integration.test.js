'use strict';

// 비번 바꾸기 시험(시험 DB, 진짜 경로 PATCH /user/me/password) — 빈 칸·새 비번 규칙·현재 비번 틀림(로그아웃 안 됨)·15분 5번·로그인은 안 잠김·성공 뒤 세션 전부 끊김·로그인 안 함·로컬 비번 표시 그대로
// 목록 A11-B-701~719·874 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { noDb } = h;
const PATH = '/user/me/password';
const NEW_PW = 'Changed-2026';
const WRONG = 'Wrong-pass-1';

test.before(h.prepareDb);
test.after(h.closeDb);

// 비번 계정 + 로그인 세션 하나 (가짜 시계 시험은 앱을 먼저 차려야 해서 앱을 받음)
async function loggedIn(t, { clock = false, prefix = 'p' } = {}) {
    const app = await h.startApp(t, { clock });
    const user = await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const change = (app, session, body) => app.patch(PATH, body, { cookie: session.cookie });

// ── 빈 칸 (701~702) ──

const EMPTY_TEXT = '현재 비밀번호와 새 비밀번호를 입력해주세요.';

test('A11-B-701 현재 비번 빈 글자 → 400 빈 칸 문구, 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const before = await h.hashOf(user.uuid);
    const res = await change(app, session, { currentPassword: '', newPassword: NEW_PW });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, EMPTY_TEXT);
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-702 새 비번 빈 글자 → 400 빈 칸 문구, 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const before = await h.hashOf(user.uuid);
    const res = await change(app, session, { currentPassword: user.password, newPassword: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, EMPTY_TEXT);
    assert.equal(await h.hashOf(user.uuid), before);
});

// ── 새 비번 규칙 (703~707) ──

const RULE_TEXTS = ['비밀번호는 8~64자여야 합니다.', '비밀번호는 72바이트를 넘을 수 없습니다.'];

const RULE_REJECTED = [
    ['A11-B-703', '7자', 'Pass123'],
    // 길이·바이트 값은 영문+숫자를 넣어 그 까닭 하나로만 걸리게 함
    ['A11-B-704', '65자', `${'p'.repeat(64)}1`],
    ['A11-B-705', '한글 24자 + a1b(75바이트)', `${'가'.repeat(24)}a1b`],
];

for (const [id, name, pw] of RULE_REJECTED) {
    test(`${id} 새 비번 ${name} → 400 + 규칙 문구, 비번 그대로`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const before = await h.hashOf(user.uuid);
        const res = await change(app, session, { currentPassword: user.password, newPassword: pw });
        assert.equal(res.status, 400);
        assert.ok(RULE_TEXTS.includes(res.body.message), `규칙 문구 아님: ${res.body.message}`);
        assert.equal(await h.hashOf(user.uuid), before);
    });
}

const RULE_ACCEPTED = [
    ['A11-B-706', '8자', 'Pass1234'],
    ['A11-B-707', '64자', `${'q'.repeat(63)}1`],
];

for (const [id, name, pw] of RULE_ACCEPTED) {
    test(`${id} 새 비번 ${name} → 200`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const res = await change(app, session, { currentPassword: user.password, newPassword: pw });
        assert.equal(res.status, 200);
    });
}

// ── 현재 비번 틀림 (708~709) ──

test('A11-B-708 틀린 현재 비번 → 400 CURRENT_PASSWORD_INVALID "현재 비밀번호가 올바르지 않습니다.", 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const before = await h.hashOf(user.uuid);
    const res = await change(app, session, { currentPassword: WRONG, newPassword: NEW_PW });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CURRENT_PASSWORD_INVALID');
    assert.equal(res.body.message, '현재 비밀번호가 올바르지 않습니다.');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-709 현재 비번 틀린 뒤 같은 세션으로 GET /user/me/profile → 200 (로그아웃 안 됨)', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    assert.equal((await change(app, session, { currentPassword: WRONG, newPassword: NEW_PW })).status, 400, '준비: 틀림');
    const res = await app.get('/user/me/profile', { cookie: session.cookie });
    assert.equal(res.status, 200);
});

// ── 현재 비번 15분 5번 (710~713) ──

async function wrongTimes(app, session, n) {
    for (let i = 0; i < n; i += 1) {
        const r = await change(app, session, { currentPassword: WRONG, newPassword: NEW_PW });
        assert.equal(r.status, 400, `준비: ${i + 1}번째 틀림은 400`);
    }
}

test('A11-B-710 4번 틀린 뒤 맞으면 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await wrongTimes(app, session, 4);
    const res = await change(app, session, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 200);
});

test('A11-B-711 5번 틀린 뒤 6번째는 맞는 비번이어도 429 PASSWORD_CHANGE_LOCKED', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await wrongTimes(app, session, 5);
    const res = await change(app, session, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'PASSWORD_CHANGE_LOCKED');
});

test('A11-B-712 막힌 동안 비번 해시 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const before = await h.hashOf(user.uuid);
    await wrongTimes(app, session, 5);
    assert.equal((await change(app, session, { currentPassword: user.password, newPassword: NEW_PW })).status, 429, '준비: 막힘');
    assert.equal(await h.hashOf(user.uuid), before);
    assert.equal((await h.login(app, user.email, user.password)).status, 200, '옛 비번이 안 됨');
});

test('A11-B-713 5번 틀린 뒤 가짜 시계 15분 → 맞는 비번 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    await wrongTimes(app, session, 5);
    app.clock.tick(15 * 60 * 1000);
    const res = await change(app, session, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 200);
});

test('A11-B-714 비번 바꾸기 5번 틀림 → 맞는 비번으로 로그인 200 (로그인은 안 잠김)', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await wrongTimes(app, session, 5);
    const res = await h.login(app, user.email, user.password);
    assert.equal(res.status, 200);
});

test('A11-B-715 맞음 → 200 { success:true, reloginRequired:true } "비밀번호가 변경되었습니다."', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await change(app, session, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.reloginRequired, true);
    assert.equal(res.body.message, '비밀번호가 변경되었습니다.');
});

// ── 바꾼 뒤 (716~718) ──

async function changedWithTwoSessions(t, prefix) {
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix });
    const here = await h.sessionFor(user.uuid, { rememberMe: true });
    const other = await h.otherDeviceSession(user.uuid);
    const res = await change(app, here, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 200, '준비: 바꿈');
    return { app, user, here, other };
}

test('A11-B-716 바꾼 뒤 새 비번 로그인 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user } = await changedWithTwoSessions(t, 'pn');
    assert.equal((await h.login(app, user.email, NEW_PW)).status, 200);
});

test('A11-B-717 바꾼 뒤 옛 비번 로그인 → 401', async (t) => {
    if (noDb(t)) return;
    const { app, user } = await changedWithTwoSessions(t, 'po');
    assert.equal((await h.login(app, user.email, user.password)).status, 401);
});

test('A11-B-718 바꾼 뒤 이 세션·다른 세션 보호 경로 401, refresh 401', async (t) => {
    if (noDb(t)) return;
    const { app, here, other } = await changedWithTwoSessions(t, 'ps');
    for (const [name, s] of [['이 세션', here], ['다른 세션', other]]) {
        assert.equal((await app.get('/user/me/profile', { cookie: s.cookie })).status, 401, `${name} 보호 경로가 열림`);
        assert.equal((await h.refreshWith(app, s)).status, 401, `${name} refresh가 됨`);
    }
});

test('A11-B-719 쿠키 없이 → 401, 아무 계정 비번도 안 바뀜', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'px' });
    const before = await h.hashOf(user.uuid);
    const res = await app.patch(PATH, { currentPassword: user.password, newPassword: NEW_PW });
    assert.equal(res.status, 401);
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-874 비번 바꾸기 성공 → has_local_password = true 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    assert.equal(Boolean((await h.userRow(user.uuid)).has_local_password), true, '준비: 비번 있는 계정');
    assert.equal((await change(app, session, { currentPassword: user.password, newPassword: NEW_PW })).status, 200, '준비: 바꿈');
    assert.equal(Boolean((await h.userRow(user.uuid)).has_local_password), true);
});

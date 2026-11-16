'use strict';

// 비번 영문+숫자 규칙(가입·비번 바꾸기·재설정)과 재설정 메일 "다시 보내기" 1분 기다림·밀려난 링크 답 시험(시험 DB, 진짜 경로)
// 목록 A11-B-389~391 (A11a), A11-B-944~962 (A11b) — docs/게임_의도_2026-11-15/시험목록/, 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { prepareSignupProof } = require('../helpers/signupProof');

const { db, noDb, mailsTo, tokenOf } = h;
const REQUEST_PATH = '/auth/password-reset/request';
const CONFIRM_PATH = '/auth/password-reset/confirm';
const PASSWORD_PATH = '/user/me/password';
const MIX_MESSAGE = '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
const SAME_OK = JSON.stringify({ ok: true });
const MINUTE = 60 * 1000;

test.before(h.prepareDb);
test.after(h.closeDb);

// 길이·바이트는 다 맞고 글자 종류만 다른 값 (거절 3 · 통과 3)
const REJECTED = [
    ['영문만 8자', 'abcdefgh'],
    ['숫자만 8자', '12345678'],
    ['한글만 8자', '가면무도회살인사'],
];
const ACCEPTED = [
    ['영문+숫자 8자', 'abcdefg1'],
    ['영문+숫자+기호', 'Mask-2026!'],
    ['한글+영문 1+숫자 1', '가면무도회살a1'],
];

const verify = (app, token) => app.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
const confirm = (app, token, newPassword) => app.post(CONFIRM_PATH, { token, newPassword });
const tokenRows = (uuid) => db.PasswordResetToken.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });

// 재설정 요청 → 그 주소로 온 마지막 링크 토큰
async function requestToken(app, user) {
    const res = await app.post(REQUEST_PATH, { email: user.email });
    assert.equal(res.status, 200, '준비: 재설정 요청');
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일이 옴');
    return tokenOf(sent);
}

// ── 가입: 영문+숫자가 있으면 됨 (A11a 389~391, 거절 글은 flow/a11e-signup-reject-text B-386~388) ──

const SIGNUP_IDS = ['A11-B-389', 'A11-B-390', 'A11-B-391'];
ACCEPTED.forEach(([name, pw], i) => {
    test(`${SIGNUP_IDS[i]} 가입 비번 ${name} → 200, 그 비번으로 로그인 200`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const end = h.tail();
        const email = `a11e-mix-${end}@example.com`;
        const { signupProof } = await prepareSignupProof(email);
        const res = await app.post('/auth/signup', {
            email, password: pw, passwordConfirm: pw, nickname: `mx${end}`.slice(0, 8),
            birthDate: '1995-05-05', signupProof, ageConfirmed: true, agreedTermsVersionIds: [],
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal((await h.login(app, email, pw)).status, 200);
    });
});

// ── 비번 바꾸기 (944~949) ──

async function loggedIn(t) {
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'mc' });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const CHANGE_REJECT_IDS = ['A11-B-944', 'A11-B-945', 'A11-B-946'];
REJECTED.forEach(([name, pw], i) => {
    test(`${CHANGE_REJECT_IDS[i]} 비번 바꾸기 새 비번 ${name} → 400 "${MIX_MESSAGE}", 비번 그대로`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const before = await h.hashOf(user.uuid);
        const res = await app.patch(PASSWORD_PATH, { currentPassword: user.password, newPassword: pw }, { cookie: session.cookie });
        assert.equal(res.status, 400);
        assert.equal(res.body.message, MIX_MESSAGE);
        assert.equal(await h.hashOf(user.uuid), before);
    });
});

const CHANGE_ACCEPT_IDS = ['A11-B-947', 'A11-B-948', 'A11-B-949'];
ACCEPTED.forEach(([name, pw], i) => {
    test(`${CHANGE_ACCEPT_IDS[i]} 비번 바꾸기 새 비번 ${name} → 200, 새 비번 로그인 200`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const res = await app.patch(PASSWORD_PATH, { currentPassword: user.password, newPassword: pw }, { cookie: session.cookie });
        assert.equal(res.status, 200);
        assert.equal((await h.login(app, user.email, pw)).status, 200);
    });
});

// ── 재설정 저장 (950~955) ──

const RESET_REJECT_IDS = ['A11-B-950', 'A11-B-951', 'A11-B-952'];
REJECTED.forEach(([name, pw], i) => {
    test(`${RESET_REJECT_IDS[i]} 재설정 새 비번 ${name} → 400 INVALID_PASSWORD + 글, 비번 그대로, 토큰 안 씀`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const user = await h.createLocalUser({ prefix: 'mr' });
        const token = await requestToken(app, user);
        const before = await h.hashOf(user.uuid);
        const res = await confirm(app, token, pw);
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { ok: false, code: 'INVALID_PASSWORD', message: MIX_MESSAGE });
        assert.equal(await h.hashOf(user.uuid), before);
        assert.deepEqual((await verify(app, token)).body, { ok: true, status: 'VALID' });
    });
});

const RESET_ACCEPT_IDS = ['A11-B-953', 'A11-B-954', 'A11-B-955'];
ACCEPTED.forEach(([name, pw], i) => {
    test(`${RESET_ACCEPT_IDS[i]} 재설정 새 비번 ${name} → 200, 새 비번 로그인 200`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const user = await h.createLocalUser({ prefix: 'ma' });
        const token = await requestToken(app, user);
        assert.equal((await confirm(app, token, pw)).status, 200);
        assert.equal((await h.login(app, user.email, pw)).status, 200);
    });
});

// ── 다시 보내기 1분 기다림 (956~962) ──

test('A11-B-956 1분 안(59초) 다시 요청 → 200 같은 답, 메일 1통뿐, 앞 링크 살아 있음(VALID), 토큰 줄 1개', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const user = await h.createLocalUser({ prefix: 'w1' });
    const first = await requestToken(app, user);
    app.clock.tick(MINUTE - 1000);
    const again = await app.post(REQUEST_PATH, { email: user.email });
    assert.equal(again.status, 200);
    assert.equal(again.text, SAME_OK);
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 1);
    assert.deepEqual((await verify(app, first)).body, { ok: true, status: 'VALID' });
    assert.equal((await tokenRows(user.uuid)).length, 1);
});

test('A11-B-957 1분(60초) 뒤 다시 요청 → 메일 2통, 새 링크 VALID', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const user = await h.createLocalUser({ prefix: 'w2' });
    const first = await requestToken(app, user);
    app.clock.tick(MINUTE);
    const second = await requestToken(app, user);
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 2);
    assert.notEqual(second, first);
    assert.deepEqual((await verify(app, second)).body, { ok: true, status: 'VALID' });
});

// 1분 뒤 다시 받아 앞 링크가 밀려난 상태 → { app, user, first, second }
async function superseded(t, prefix) {
    const app = await h.startApp(t, { clock: true });
    const user = await h.createLocalUser({ prefix });
    const first = await requestToken(app, user);
    app.clock.tick(MINUTE);
    const second = await requestToken(app, user);
    return { app, user, first, second };
}

test('A11-B-958 밀려난 앞 링크 확인(verify) → 200 { ok:false, code:"SUPERSEDED" }', async (t) => {
    if (noDb(t)) return;
    const { app, first } = await superseded(t, 'w3');
    const res = await verify(app, first);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: false, code: 'SUPERSEDED' });
});

test('A11-B-959 밀려난 앞 링크로 저장(confirm) → 400 SUPERSEDED, 비번 그대로, 새 링크는 그대로 VALID', async (t) => {
    if (noDb(t)) return;
    const { app, user, first, second } = await superseded(t, 'w4');
    const before = await h.hashOf(user.uuid);
    const res = await confirm(app, first, 'Changed-2026');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: 'SUPERSEDED' });
    assert.equal(await h.hashOf(user.uuid), before);
    assert.deepEqual((await verify(app, second)).body, { ok: true, status: 'VALID' });
});

// 1분 안 두 번째 답이 계정이 있든 없든 같음 (가입 여부 숨김)
const SECOND_KINDS = [
    ['A11-B-960', '있는 주소', async () => (await h.createLocalUser({ prefix: 'w5' })).email],
    ['A11-B-961', '없는 주소', async () => `a11e-none-${h.tail()}@example.com`],
];
for (const [id, name, makeEmail] of SECOND_KINDS) {
    test(`${id} 1분 안 두 번째 요청(${name}) → 200 { ok:true }, 본문 바이트까지 같음`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t, { clock: true });
        const email = await makeEmail();
        assert.equal((await app.post(REQUEST_PATH, { email })).text, SAME_OK, '준비: 첫 요청');
        app.clock.tick(10 * 1000);
        const res = await app.post(REQUEST_PATH, { email });
        assert.equal(res.status, 200);
        assert.equal(res.text, SAME_OK);
    });
}

test('A11-B-962 1분 안에 건너뛴 요청도 같은 주소 1시간 3번에 셈 → 있는 주소 4번째 429, 메일 1통', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const user = await h.createLocalUser({ prefix: 'w6' });
    let res = null;
    for (let i = 0; i < 4; i += 1) {
        res = await app.post(REQUEST_PATH, { email: user.email });
        app.clock.tick(5 * 1000);
    }
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 1);
});

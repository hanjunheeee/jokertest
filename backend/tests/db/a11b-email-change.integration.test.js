'use strict';

// 이메일 바꾸기 시험(시험 DB, 진짜 경로 POST /user/me/email/code·verify) — 번호 보내기·본인 확인·주소 모양·다시 보내기 1분·메일 실패·요청 수 제한·확인·옛 주소 알림·바꾼 뒤 로그인/재설정·틀리기 5번·번호 규칙·DB 줄
// 목록 A11-B-761~791·868~870 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, noDb, mail, mailsTo } = h;
const { getSignupEmailConfig } = require('../../config/signupEmailVerification');

const CODE_PATH = '/user/me/email/code';
const VERIFY_PATH = '/user/me/email/verify';
const MINUTE = 60 * 1000;

test.before(h.prepareDb);
test.after(h.closeDb);

const newAddress = (label = 'n') => `a11b-new-${label}-${h.tail()}@example.com`;

// 계정 + 로그인 세션 (가짜 시계 시험은 앱을 먼저)
async function loggedIn(t, { clock = false, prefix = 'e', social = false } = {}) {
    const app = await h.startApp(t, { clock });
    const user = social ? await h.createSocialUser({ prefix }) : await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const sendCode = (app, session, body) => app.post(CODE_PATH, body, { cookie: session.cookie });
const verifyCode = (app, session, body) => app.post(VERIFY_PATH, body, { cookie: session.cookie });
// 그 주소로 온 마지막 번호
const lastCode = (address) => mailsTo(address, 'EMAIL_CHANGE_CODE').at(-1)?.params.code;
// 받은 번호와 다른 같은 자리 수 번호
const otherCode = (code) => String((Number(code) + 1) % 10 ** code.length).padStart(code.length, '0');

// 번호 받기까지 (비번 계정) → 받은 번호
async function codeSent(app, user, session, address) {
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 200, `준비: 번호 보내기 ${res.body?.code}`);
    const code = lastCode(address);
    assert.ok(code, '준비: 번호 메일이 옴');
    return code;
}

// ── 번호 보내기 (761~773) ──

test('A11-B-761 비번 계정 + 맞는 현재 비번 + 새 주소 → 200 data.resendAfterSec = 60, 새 주소로 EMAIL_CHANGE_CODE 1통', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress();
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.resendAfterSec, 60);
    assert.equal(mailsTo(address).length, 1);
    assert.equal(mailsTo(address, 'EMAIL_CHANGE_CODE').length, 1);
});

test('A11-B-762 틀린 현재 비번 → 400 CURRENT_PASSWORD_INVALID, 메일 0통', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const address = newAddress();
    const res = await sendCode(app, session, { newEmail: address, currentPassword: 'Wrong-pass-1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CURRENT_PASSWORD_INVALID');
    assert.equal(mailsTo(address).length, 0);
});

test('A11-B-763 비번 계정 + 비번 없이 → 400 CURRENT_PASSWORD_INVALID, 메일 0통', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const address = newAddress();
    const res = await sendCode(app, session, { newEmail: address });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CURRENT_PASSWORD_INVALID');
    assert.equal(mailsTo(address).length, 0);
});

test('A11-B-764 소셜 전용 + 비번 없이 → 200, 메일 1통', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t, { social: true, prefix: 'es' });
    const address = newAddress('s');
    const res = await sendCode(app, session, { newEmail: address });
    assert.equal(res.status, 200);
    assert.equal(mailsTo(address, 'EMAIL_CHANGE_CODE').length, 1);
});

const BAD_ADDRESSES = [
    ['A11-B-765', 'abc', 'abc'],
    ['A11-B-766', '쉼표 두 주소', 'a11b-x@example.com,a11b-y@example.com'],
];

for (const [id, name, address] of BAD_ADDRESSES) {
    test(`${id} 새 주소 ${name} → 400 INVALID_INPUT, 메일 0통`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const before = mail.outbox.length;
        const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_INPUT');
        assert.equal(mail.outbox.length, before);
    });
}

test('A11-B-767 [지금 동작] 지금 주소를 대문자만 바꿔 보냄 → 400 EMAIL_SAME, 메일 0통', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const before = mail.outbox.length;
    const res = await sendCode(app, session, { newEmail: user.email.toUpperCase(), currentPassword: user.password });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'EMAIL_SAME');
    assert.equal(mail.outbox.length, before);
});

test('A11-B-768 다른 계정 주소 → 409 EMAIL_IN_USE, 메일 0통', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const other = await h.createLocalUser({ prefix: 'eo' });
    const res = await sendCode(app, session, { newEmail: other.email, currentPassword: user.password });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_IN_USE');
    assert.equal(mailsTo(other.email, 'EMAIL_CHANGE_CODE').length, 0);
});

test('A11-B-769 다시 보내기 가짜 시계 59초 뒤 → 429 RESEND_TOO_SOON + resendAfterSec: 1', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const address = newAddress();
    await codeSent(app, user, session, address);
    app.clock.tick(59 * 1000);
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RESEND_TOO_SOON');
    assert.equal(res.body.resendAfterSec, 1);
});

test('A11-B-770 다시 보내기 가짜 시계 60초 뒤 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const address = newAddress();
    await codeSent(app, user, session, address);
    app.clock.tick(60 * 1000);
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 200);
    assert.equal(mailsTo(address, 'EMAIL_CHANGE_CODE').length, 2);
});

test('A11-B-771 발송기 실패 → 503 MAIL_SEND_FAILED', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    mail.failNextWithResult();
    const res = await sendCode(app, session, { newEmail: newAddress(), currentPassword: user.password });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'MAIL_SEND_FAILED');
});

// 1분씩 띄워 n번 보냄 (다시 보내기 기다림에 안 걸리게) → 마지막 응답
async function sendEveryMinute(app, user, session, address, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) {
        if (i > 0) app.clock.tick(MINUTE);
        res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
        if (i < n - 1) assert.equal(res.status, 200, `준비: ${i + 1}번째 보내기`);
    }
    return res;
}

test('A11-B-772 번호 요청 1시간 5번: 5번째 → 처리됨(200)', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const res = await sendEveryMinute(app, user, session, newAddress(), 5);
    assert.equal(res.status, 200);
});

test('A11-B-773 번호 요청 1시간 5번: 6번째 → 429', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const res = await sendEveryMinute(app, user, session, newAddress(), 6);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

// ── 확인 (774~778) ──

test('A11-B-774 받은 번호 → 200 data.email = 새 주소 "이메일이 변경되었습니다."', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    const res = await verifyCode(app, session, { newEmail: address, code });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, address);
    assert.equal(res.body.message, '이메일이 변경되었습니다.');
});

test('A11-B-775 확인 뒤 옛 주소로 EMAIL_CHANGED 1통, 메일 값에 새 주소 원문 없음', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    assert.equal((await verifyCode(app, session, { newEmail: address, code })).status, 200, '준비: 확인');
    const notices = mailsTo(user.email, 'EMAIL_CHANGED');
    assert.equal(notices.length, 1);
    assert.ok(!JSON.stringify(notices[0].params).includes(address), '알림 값에 새 주소 원문이 있음');
});

// 바꾼 뒤 상태 (776~778)
async function changed(t, prefix) {
    const { app, user, session } = await loggedIn(t, { prefix });
    const address = newAddress(prefix);
    const code = await codeSent(app, user, session, address);
    assert.equal((await verifyCode(app, session, { newEmail: address, code })).status, 200, '준비: 확인');
    return { app, user, address };
}

test('A11-B-776 바꾼 뒤 새 주소 + 비번 로그인 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, address } = await changed(t, 'el');
    assert.equal((await h.login(app, address, user.password)).status, 200);
});

test('A11-B-777 바꾼 뒤 옛 주소 + 비번 로그인 → 401', async (t) => {
    if (noDb(t)) return;
    const { app, user } = await changed(t, 'eo');
    assert.equal((await h.login(app, user.email, user.password)).status, 401);
});

test('A11-B-778 바꾼 뒤 새 주소로 재설정 요청 → 새 주소로 링크 1통, 옛 주소로 0통', async (t) => {
    if (noDb(t)) return;
    const { app, user, address } = await changed(t, 'er');
    assert.equal((await app.post('/auth/password-reset/request', { email: address })).status, 200);
    assert.equal(mailsTo(address, 'PASSWORD_RESET').length, 1);
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 0);
});

// ── 번호 틀리기 5번 (779~782) ──

async function wrongTries(t, n) {
    const { app, user, session } = await loggedIn(t, { prefix: 'ew' });
    const address = newAddress('w');
    const code = await codeSent(app, user, session, address);
    let res = null;
    for (let i = 0; i < n; i += 1) res = await verifyCode(app, session, { newEmail: address, code: otherCode(code) });
    return { app, user, session, address, code, res };
}

test('A11-B-779 1번째 틀림 → 400 CODE_INVALID + attemptsRemaining: 4', async (t) => {
    if (noDb(t)) return;
    const { res } = await wrongTries(t, 1);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
    assert.equal(res.body.attemptsRemaining, 4);
});

test('A11-B-780 4번째 틀림 → attemptsRemaining: 1', async (t) => {
    if (noDb(t)) return;
    const { res } = await wrongTries(t, 4);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
    assert.equal(res.body.attemptsRemaining, 1);
});

test('A11-B-781 5번째 틀림 → 400 TOO_MANY_ATTEMPTS', async (t) => {
    if (noDb(t)) return;
    const { res } = await wrongTries(t, 5);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TOO_MANY_ATTEMPTS');
});

test('A11-B-782 5번 틀린 뒤 맞는 번호도 TOO_MANY_ATTEMPTS, 이메일 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session, address, code } = await wrongTries(t, 5);
    const res = await verifyCode(app, session, { newEmail: address, code });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TOO_MANY_ATTEMPTS');
    assert.equal((await h.userRow(user.uuid)).email, user.email);
});

test('A11-B-783 [지금 동작] 성공한 번호로 다시 확인 → 400 CODE_INVALID', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    assert.equal((await verifyCode(app, session, { newEmail: address, code })).status, 200, '준비: 확인');
    const res = await verifyCode(app, session, { newEmail: address, code });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
});

test('A11-B-784 [지금 동작] 가짜 시계 번호 유효 시간(가입 인증 설정 값) 뒤 → 400 CODE_EXPIRED', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    app.clock.tick(getSignupEmailConfig(process.env).codeTtlMs + 1000);
    const res = await verifyCode(app, session, { newEmail: address, code });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_EXPIRED');
});

test('A11-B-785 [지금 동작] 1분 뒤 다시 받으면 첫 번호로 확인 → 400 CODE_INVALID', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { clock: true });
    const address = newAddress();
    const first = await codeSent(app, user, session, address);
    app.clock.tick(MINUTE);
    const second = await codeSent(app, user, session, address);
    // 두 번호가 우연히 같으면 이 시험은 아무것도 못 봄
    assert.notEqual(first, second, '준비: 두 번호가 같음(우연)');
    const res = await verifyCode(app, session, { newEmail: address, code: first });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
});

test('A11-B-786 A·B가 같은 새 주소로 번호 받음 → A가 B의 번호를 넣음 → 400 CODE_INVALID, A 이메일 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const a = await h.createLocalUser({ prefix: 'ea' });
    const b = await h.createLocalUser({ prefix: 'eb' });
    const sa = await h.sessionFor(a.uuid);
    const sb = await h.sessionFor(b.uuid);
    const address = newAddress('ab');
    await codeSent(app, a, sa, address);
    app.clock.tick(MINUTE);
    const codeB = await codeSent(app, b, sb, address);
    const res = await verifyCode(app, sa, { newEmail: address, code: codeB });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
    assert.equal((await h.userRow(a.uuid)).email, a.email);
});

test('A11-B-787 번호 받은 뒤 남이 그 주소로 가입 → 확인 → 409 EMAIL_IN_USE', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress('taken');
    const code = await codeSent(app, user, session, address);
    await h.createLocalUser({ email: address, prefix: 'et' });
    const res = await verifyCode(app, session, { newEmail: address, code });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_IN_USE');
});

const BAD_CODES = [
    ['A11-B-788', '5자리 번호', '12345'],
    ['A11-B-789', '글자 섞인 6자', '12a456'],
];

for (const [id, name, code] of BAD_CODES) {
    test(`${id} [지금 동작] 번호 모양 ${name} → 400 INVALID_INPUT`, async (t) => {
        if (noDb(t)) return;
        const { app, user, session } = await loggedIn(t);
        const address = newAddress();
        await codeSent(app, user, session, address);
        const res = await verifyCode(app, session, { newEmail: address, code });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_INPUT');
    });
}

// ── 확인 15분 20번 (790~791): 모양 틀린 번호로 채움 ──

async function verifyTimes(app, session, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await verifyCode(app, session, { newEmail: 'a11b-v@example.com', code: 'x' });
    return res;
}

test('A11-B-790 확인 20번째 → 처리됨 (요청 수 제한 아님)', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const res = await verifyTimes(app, session, 20);
    assert.notEqual(res.status, 429);
    assert.equal(res.body.code, 'INVALID_INPUT');
});

test('A11-B-791 확인 21번째 → 429', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const res = await verifyTimes(app, session, 21);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

// ── DB 줄 (868~870) ──

test('A11-B-868 번호 확인 뒤 users.email = 새 주소, email_verified = true', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    // 바뀌는 것을 보려고 인증 표시를 먼저 내려 둠
    await db.User.update({ email_verified: false }, { where: { uuid: user.uuid } });
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    assert.equal((await verifyCode(app, session, { newEmail: address, code })).status, 200, '준비: 확인');
    const row = await h.userRow(user.uuid);
    assert.equal(row.email, address);
    assert.equal(Boolean(row.email_verified), true);
});

test('A11-B-869 번호 보내기 뒤 인증 줄에 번호 원문 없음, 목적 EMAIL_CHANGE', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const address = newAddress();
    const code = await codeSent(app, user, session, address);
    const rows = await db.SignupEmailVerification.findAll({ where: { email: address }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].purpose, 'EMAIL_CHANGE');
    assert.ok(rows[0].code_hash, '번호 해시가 없음');
    for (const [column, value] of Object.entries(rows[0])) {
        assert.notEqual(String(value), code, `${column} 칸이 번호 원문`);
        if (typeof value === 'string') assert.ok(!value.includes(code), `${column} 칸에 번호 원문이 있음`);
    }
});

test('A11-B-870 A·B가 각자 번호로 같은 주소를 동시에 확인 → 그 주소 가진 계정 1개, 다른 하나 409', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const a = await h.createLocalUser({ prefix: 'ec' });
    const b = await h.createLocalUser({ prefix: 'ed' });
    const sa = await h.sessionFor(a.uuid);
    const sb = await h.sessionFor(b.uuid);
    const address = newAddress('race');
    const codeA = await codeSent(app, a, sa, address);
    app.clock.tick(MINUTE);
    const codeB = await codeSent(app, b, sb, address);
    const results = await Promise.all([
        verifyCode(app, sa, { newEmail: address, code: codeA }),
        verifyCode(app, sb, { newEmail: address, code: codeB }),
    ]);
    assert.equal(await db.User.count({ where: { email: address } }), 1);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409], `응답: ${JSON.stringify(results.map((r) => [r.status, r.body?.code]))}`);
});

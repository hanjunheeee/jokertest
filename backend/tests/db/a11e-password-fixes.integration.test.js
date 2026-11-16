'use strict';

// 비밀번호 쪽 고친 것 시험(시험 DB, 진짜 경로) — 재설정 뒤 로그인 잠금 풀림·재설정 요청 기록·메일 실패 로그·재설정 규칙 거절 글·소셜 전용 계정 비번 바꾸기/비번 로그인·이메일 바꾸기 틀림 셈
// 목록 A11-B-921~938 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, noDb, mail, mailsTo, tokenOf } = h;
const REQUEST_PATH = '/auth/password-reset/request';
const CONFIRM_PATH = '/auth/password-reset/confirm';
const PASSWORD_PATH = '/user/me/password';
const EMAIL_CODE_PATH = '/user/me/email/code';
const NEW_PW = 'Changed-2026';
const WRONG = 'Wrong-pass-1';
const LOGIN_FAILED = '이메일 또는 비밀번호가 일치하지 않습니다.';

test.before(h.prepareDb);
test.after(h.closeDb);

// ── 이 파일 안 작은 도우미 ──

// 틀린 비번으로 로그인 n번 → 마지막 답
async function wrongLogins(app, email, n) {
    let res = null;
    for (let i = 0; i < n; i += 1) res = await h.login(app, email, WRONG);
    return res;
}

// 재설정 메일 요청 → 메일에서 토큰 꺼냄
async function resetToken(app, user) {
    const res = await app.post(REQUEST_PATH, { email: user.email });
    assert.equal(res.status, 200, '준비: 재설정 요청');
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일이 옴');
    return tokenOf(sent);
}

// 조회 기록 표에서 이 시험이 만든 줄만 (시작할 때 가장 큰 id 뒤)
async function findRequestsAfter(run) {
    const lastId = (await db.AccountFindRequest.max('id')) ?? 0;
    await run();
    return db.AccountFindRequest.findAll({ where: { id: { [db.Sequelize.Op.gt]: lastId } }, raw: true });
}

// 서버 오류 로그(console.error) 줄을 모음, 시험 끝에 되돌림
function captureErrorLog(t) {
    const lines = [];
    const saved = console.error;
    console.error = (...args) => { lines.push(args.map(String).join(' ')); };
    t.after(() => { console.error = saved; });
    return lines;
}

// 앱 주소 설정을 지워 두고 시험 끝에 되돌림
function withoutAppUrl(t) {
    const saved = process.env.PASSWORD_RESET_APP_URL;
    delete process.env.PASSWORD_RESET_APP_URL;
    t.after(() => {
        if (saved === undefined) delete process.env.PASSWORD_RESET_APP_URL;
        else process.env.PASSWORD_RESET_APP_URL = saved;
    });
}

// ── 재설정이 끝나면 로그인 잠금이 풀림 (921~922, 점검 P-S1·#24) ──

test('A11-B-921 5번 틀려 잠긴 계정 → 재설정 저장 → 새 비번으로 바로 로그인 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'ul' });
    assert.equal((await wrongLogins(app, user.email, 5)).status, 423, '준비: 5번째에 잠김');
    assert.equal((await h.login(app, user.email, user.password)).status, 423, '준비: 잠긴 동안 맞는 비번도 거절');
    const token = await resetToken(app, user);
    assert.equal((await app.post(CONFIRM_PATH, { token, newPassword: NEW_PW })).status, 200, '준비: 새 비번 저장');
    assert.equal((await h.login(app, user.email, NEW_PW)).status, 200);
});

test('A11-B-922 4번 틀린 계정 → 재설정 저장 → 실패 횟수 0·잠금 시각 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'uc' });
    assert.equal((await wrongLogins(app, user.email, 4)).status, 401, '준비: 4번 틀림');
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 4, '준비: 실패 횟수 4');
    const token = await resetToken(app, user);
    assert.equal((await app.post(CONFIRM_PATH, { token, newPassword: NEW_PW })).status, 200, '준비: 새 비번 저장');
    const row = await h.userRow(user.uuid);
    assert.equal(row.failed_login_count, 0);
    assert.equal(row.locked_until, null);
});

// ── 재설정 요청이 조회 기록 표에 남음 (923~925, 점검 P-B2·#29) ──

test('A11-B-923 있는 이메일로 재설정 요청 → 조회 기록 표에 PASSWORD_RESET 줄 1개, 이메일 칸은 비어 있음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'fr' });
    const rows = await findRequestsAfter(() => app.post(REQUEST_PATH, { email: user.email }));
    assert.deepEqual(rows.map((r) => r.request_type), ['PASSWORD_RESET']);
    assert.equal(rows[0].email, null);
    assert.ok(typeof rows[0].ip_address === 'string' && rows[0].ip_address.length > 0, 'ip가 안 남음');
});

test('A11-B-924 없는 이메일로 재설정 요청 → 똑같이 PASSWORD_RESET 줄 1개 (가입 여부로 안 갈림)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const rows = await findRequestsAfter(() => app.post(REQUEST_PATH, { email: `a11e-none-${h.tail()}@example.com` }));
    assert.deepEqual(rows.map((r) => r.request_type), ['PASSWORD_RESET']);
    assert.equal(rows[0].email, null);
});

test('A11-B-925 모양 틀린 주소(400)로 재설정 요청 → 조회 기록 표에 줄 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    let status = null;
    const rows = await findRequestsAfter(async () => { status = (await app.post(REQUEST_PATH, { email: 'not-an-address' })).status; });
    assert.equal(status, 400, '준비: 모양 거절');
    assert.equal(rows.length, 0);
});

// ── 재설정 메일이 안 나가면 서버 로그에 한 줄, 응답은 그대로 (926~929, 점검 P-S2·#25) ──

const MAIL_TROUBLES = [
    ['A11-B-926', '발송기가 { ok:false } 돌려줌', () => mail.failNextWithResult()],
    ['A11-B-927', '발송기가 던짐', () => mail.failNextWithThrow()],
    ['A11-B-928', '앱 주소 설정 없음', (t) => withoutAppUrl(t)],
];

for (const [id, name, breakMail] of MAIL_TROUBLES) {
    test(`${id} 재설정 메일 실패(${name}) → 200 { ok:true } + 서버 로그 "[재설정 메일 실패]" 한 줄, 그 줄에 주소·토큰 없음`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const user = await h.createLocalUser({ prefix: 'ml' });
        breakMail(t);
        const lines = captureErrorLog(t);
        const res = await app.post(REQUEST_PATH, { email: user.email });
        assert.equal(res.status, 200);
        assert.equal(res.text, JSON.stringify({ ok: true }));
        const failLines = lines.filter((line) => line.includes('[재설정 메일 실패]'));
        assert.equal(failLines.length, 1, `로그 줄 수: ${failLines.length}`);
        assert.ok(!failLines[0].includes(user.email), '로그에 이메일이 남음');
        assert.ok(!failLines[0].includes(user.email.split('@')[0]), '로그에 이메일 앞부분이 남음');
        assert.ok(!/[A-Za-z0-9_-]{43}/.test(failLines[0]), '로그에 토큰 모양 글자가 남음');
    });
}

test('A11-B-929 재설정 메일이 잘 나감 → 서버 로그에 "[재설정 메일 실패]" 줄 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'mo' });
    const lines = captureErrorLog(t);
    assert.equal((await app.post(REQUEST_PATH, { email: user.email })).status, 200);
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 1, '준비: 메일 1통');
    assert.equal(lines.filter((line) => line.includes('[재설정 메일 실패]')).length, 0);
});

// ── 재설정 서버가 비번 규칙으로 거절하면 안내 글도 옴 (930, 점검 P-B3) ──

test('A11-B-930 재설정 새 비번 7자 → 400 INVALID_PASSWORD + "비밀번호는 8~64자여야 합니다."', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'rp' });
    const token = await resetToken(app, user);
    const res = await app.post(CONFIRM_PATH, { token, newPassword: 'Pass123' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_PASSWORD', message: '비밀번호는 8~64자여야 합니다.' });
});

// ── 소셜로만 가입한 계정의 비번 바꾸기 (931~932, 점검 P-B1·#35) ──

test('A11-B-931 소셜 전용 계정 비번 바꾸기 → 400 SOCIAL_ONLY "소셜 로그인 계정은 비밀번호가 없습니다.", 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createSocialUser({ prefix: 'so' });
    const session = await h.sessionFor(user.uuid);
    const before = await h.hashOf(user.uuid);
    const res = await app.patch(PASSWORD_PATH, { currentPassword: WRONG, newPassword: NEW_PW }, { cookie: session.cookie });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SOCIAL_ONLY');
    assert.equal(res.body.message, '소셜 로그인 계정은 비밀번호가 없습니다.');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-932 소셜 전용 계정 비번 바꾸기 6번 → 6번째도 400 SOCIAL_ONLY (틀림 셈이 안 올라 429 아님)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createSocialUser({ prefix: 'sx' });
    const session = await h.sessionFor(user.uuid);
    let res = null;
    for (let i = 0; i < 6; i += 1) {
        res = await app.patch(PASSWORD_PATH, { currentPassword: WRONG, newPassword: NEW_PW }, { cookie: session.cookie });
    }
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SOCIAL_ONLY');
});

// ── 소셜로만 가입한 계정에 비번 로그인 (933~934, 점검 P-S6·#12) ──

test('A11-B-933 소셜 전용 계정에 비번 로그인 5번 → 5번 다 401 보통 문구, 실패 횟수 0·잠금 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createSocialUser({ prefix: 'sl' });
    for (let i = 1; i <= 5; i += 1) {
        const res = await h.login(app, user.email, WRONG);
        assert.equal(res.status, 401, `${i}번째`);
        assert.equal(res.body.message, LOGIN_FAILED, `${i}번째`);
    }
    const row = await h.userRow(user.uuid);
    assert.equal(row.failed_login_count, 0);
    assert.equal(row.locked_until, null);
});

test('A11-B-934 비번 있는 계정은 그대로: 5번째 틀림 → 423 잠금 (소셜 전용만 셈에서 빠짐)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'll' });
    assert.equal((await wrongLogins(app, user.email, 5)).status, 423);
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 5);
});

// ── 이메일 바꾸기의 현재 비번 틀림 셈 (935~938, 점검 P-X3) ──

const sendCode = (app, session, body) => app.post(EMAIL_CODE_PATH, body, { cookie: session.cookie });
const newAddress = () => `a11e-new-${h.tail()}@example.com`;

// 비번 계정 + 세션 + 요청 수 제한에 안 걸리게 새 앱 (이메일 번호 보내기는 한 시간 5번 제한이 따로 있음)
async function loggedIn(t, prefix) {
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

test('A11-B-935 이메일 바꾸기에서 현재 비번 3번 + 비번 바꾸기에서 2번 틀림 → 다음 이메일 바꾸기는 맞는 비번이어도 429 EMAIL_CHANGE_LOCKED, 메일 0통', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'ea');
    for (let i = 0; i < 3; i += 1) {
        const res = await sendCode(app, session, { newEmail: newAddress(), currentPassword: WRONG });
        assert.equal(res.body.code, 'CURRENT_PASSWORD_INVALID', `준비: 이메일 바꾸기 틀림 ${i + 1}`);
    }
    for (let i = 0; i < 2; i += 1) {
        const res = await app.patch(PASSWORD_PATH, { currentPassword: WRONG, newPassword: NEW_PW }, { cookie: session.cookie });
        assert.equal(res.body.code, 'CURRENT_PASSWORD_INVALID', `준비: 비번 바꾸기 틀림 ${i + 1}`);
    }
    const address = newAddress();
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'EMAIL_CHANGE_LOCKED');
    assert.equal(mailsTo(address).length, 0);
});

test('A11-B-936 이메일 바꾸기에서 현재 비번 3번 + 비번 바꾸기에서 2번 틀림 → 비번 바꾸기도 맞는 비번이어도 429 PASSWORD_CHANGE_LOCKED (같이 셈)', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'eb');
    for (let i = 0; i < 3; i += 1) await sendCode(app, session, { newEmail: newAddress(), currentPassword: WRONG });
    for (let i = 0; i < 2; i += 1) {
        await app.patch(PASSWORD_PATH, { currentPassword: WRONG, newPassword: NEW_PW }, { cookie: session.cookie });
    }
    const before = await h.hashOf(user.uuid);
    const res = await app.patch(PASSWORD_PATH, { currentPassword: user.password, newPassword: NEW_PW }, { cookie: session.cookie });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'PASSWORD_CHANGE_LOCKED');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-937 이메일 바꾸기에서 현재 비번 4번 틀린 뒤 맞음 → 200 번호 메일 1통 (4번까지는 안 막힘)', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'ec');
    for (let i = 0; i < 4; i += 1) await sendCode(app, session, { newEmail: newAddress(), currentPassword: WRONG });
    const address = newAddress();
    const res = await sendCode(app, session, { newEmail: address, currentPassword: user.password });
    assert.equal(res.status, 200);
    assert.equal(mailsTo(address, 'EMAIL_CHANGE_CODE').length, 1);
});

test('A11-B-938 이메일 바꾸기 현재 비번을 아무리 틀려도 로그인은 안 잠김 → 맞는 비번 로그인 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'ed');
    for (let i = 0; i < 5; i += 1) await sendCode(app, session, { newEmail: newAddress(), currentPassword: WRONG });
    assert.equal((await h.login(app, user.email, user.password)).status, 200);
    assert.equal((await h.userRow(user.uuid)).failed_login_count, 0);
});

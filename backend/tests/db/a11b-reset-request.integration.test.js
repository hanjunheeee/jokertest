'use strict';

// 비번 재설정 메일 요청 시험(시험 DB, 진짜 경로) — 가입 여부 안 드러남·계정 종류대로 메일·모양 거절·메일 장애·캐시·요청 수 제한·링크 모양
// 목록 A11-B-601~623 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, noDb, mail, mailsTo, tokenOf } = h;
const PATH = '/auth/password-reset/request';
// 모든 경우 같은 응답 본문 (F29 2-1)
const SAME_OK = JSON.stringify({ ok: true });

test.before(h.prepareDb);
test.after(h.closeDb);

// 없는 주소 (가입 안 함)
const nobody = () => `a11b-none-${h.tail()}@example.com`;
// 그 계정 재설정 토큰 줄 수
const tokenRows = (uuid) => db.PasswordResetToken.count({ where: { user_id: uuid } });

// 앱 주소 바꿔 두고 시험 끝에 되돌림
function withAppUrl(t, value) {
    const saved = process.env.PASSWORD_RESET_APP_URL;
    if (value === undefined) delete process.env.PASSWORD_RESET_APP_URL;
    else process.env.PASSWORD_RESET_APP_URL = value;
    t.after(() => {
        if (saved === undefined) delete process.env.PASSWORD_RESET_APP_URL;
        else process.env.PASSWORD_RESET_APP_URL = saved;
    });
}

// ── 계정이 있는지 응답으로 안 드러남 (601~603) ──

const KINDS = [
    ['A11-B-601', '있는 이메일', async () => (await h.createLocalUser({ prefix: 'rq' })).email],
    ['A11-B-602', '없는 이메일', async () => nobody()],
    ['A11-B-603', '소셜 전용 이메일', async () => (await h.createSocialUser({ prefix: 'rqs' })).email],
];

for (const [id, name, makeEmail] of KINDS) {
    test(`${id} 재설정 요청 ${name} → 200 { ok: true }, 본문 바이트까지 같음`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const res = await app.post(PATH, { email: await makeEmail() });
        assert.equal(res.status, 200);
        assert.equal(res.text, SAME_OK);
    });
}

// ── 메일은 계정 종류대로만 (604~606) ──

test('A11-B-604 있는 이메일 → PASSWORD_RESET 메일 1통', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'rm' });
    await app.post(PATH, { email: user.email });
    assert.equal(mailsTo(user.email).length, 1);
    assert.equal(mailsTo(user.email, 'PASSWORD_RESET').length, 1);
});

test('A11-B-605 없는 이메일 → 메일 0통', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const email = nobody();
    const before = mail.outbox.length;
    await app.post(PATH, { email });
    assert.equal(mailsTo(email).length, 0);
    assert.equal(mail.outbox.length, before);
});

test('A11-B-606 소셜 전용 → SOCIAL_LOGIN_GUIDE 1통 + 토큰 줄 0', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createSocialUser({ prefix: 'rms' });
    await app.post(PATH, { email: user.email });
    assert.equal(mailsTo(user.email).length, 1);
    assert.equal(mailsTo(user.email, 'SOCIAL_LOGIN_GUIDE').length, 1);
    assert.equal(await tokenRows(user.uuid), 0);
});

// ── 모양 틀린 요청 거절 (607~609) ──

const BAD_BODIES = [
    ['A11-B-607', '본문이 배열', ['user@example.com']],
    ['A11-B-608', 'email이 배열', { email: ['user@example.com'] }],
    ['A11-B-609', 'email이 숫자', { email: 12345 }],
];

for (const [id, name, body] of BAD_BODIES) {
    test(`${id} 재설정 요청 ${name} → 400 INVALID_INPUT, 메일 0통`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const before = mail.outbox.length;
        const res = await app.post(PATH, body);
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
        assert.equal(mail.outbox.length, before);
    });
}

// ── 메일 장애여도 응답 같음 (610~612) ──

const MAIL_TROUBLES = [
    ['A11-B-610', '발송기가 { ok:false } 돌려줌', () => mail.failNextWithResult()],
    ['A11-B-611', '발송기가 던짐', () => mail.failNextWithThrow()],
    ['A11-B-612', '앱 주소 설정 없음', (t) => withAppUrl(t, undefined)],
];

for (const [id, name, breakMail] of MAIL_TROUBLES) {
    test(`${id} 메일 장애(${name})여도 200 { ok:true }, 정상 때와 같은 본문`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const user = await h.createLocalUser({ prefix: 'rf' });
        breakMail(t);
        const res = await app.post(PATH, { email: user.email });
        assert.equal(res.status, 200);
        assert.equal(res.text, SAME_OK);
        // 정말로 메일이 안 나갔음 (장애가 걸렸는지 확인)
        assert.equal(mailsTo(user.email).length, 0);
    });
}

// ── 캐시·비밀 (613~614) ──

test('A11-B-613 재설정 요청 응답 Cache-Control: no-store', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await app.post(PATH, { email: nobody() });
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('A11-B-614 있는 이메일 요청 → 응답 본문에 토큰·이메일·uuid 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'rs' });
    const res = await app.post(PATH, { email: user.email });
    const [sent] = mailsTo(user.email, 'PASSWORD_RESET');
    assert.ok(sent, '준비: 메일이 나감');
    const token = tokenOf(sent);
    for (const secret of [token, user.email, user.uuid]) {
        assert.ok(!res.text.includes(secret), `응답에 비밀이 실림: ${secret}`);
    }
    assert.ok(!res.text.toLowerCase().includes('token'), '응답에 토큰 칸이 있음');
});

// ── 같은 주소 1시간 3번 (615~618) ──

// 같은 주소로 n번 보내고 마지막 응답
async function sendTimes(app, emails) {
    let res = null;
    for (const email of emails) res = await app.post(PATH, { email });
    return res;
}

test('A11-B-615 같은 주소 3번째 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const email = nobody();
    const res = await sendTimes(app, [email, email, email]);
    assert.equal(res.status, 200);
});

test('A11-B-616 같은 주소 4번째 → 429 RATE_LIMITED', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const email = nobody();
    const res = await sendTimes(app, [email, email, email, email]);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-617 USER@·user@ 섞어 4번째 → 429 (대소문자 같은 주소로 셈)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const lower = nobody();
    const upper = lower.toUpperCase();
    const res = await sendTimes(app, [upper, lower, upper, lower]);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-618 같은 주소 막힌 뒤 가짜 시계 1시간 → 다시 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const email = nobody();
    const blocked = await sendTimes(app, [email, email, email, email]);
    assert.equal(blocked.status, 429, '준비: 4번째가 막힘');
    app.clock.tick(60 * 60 * 1000);
    const res = await app.post(PATH, { email });
    assert.equal(res.status, 200);
    assert.equal(res.text, SAME_OK);
});

// ── 같은 ip 1시간 10번 (619~621) ──

test('A11-B-619 같은 ip 서로 다른 주소 10번째 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await sendTimes(app, Array.from({ length: 10 }, nobody));
    assert.equal(res.status, 200);
});

test('A11-B-620 같은 ip 서로 다른 주소 11번째 → 429', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await sendTimes(app, Array.from({ length: 11 }, nobody));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-621 없는 주소만 11번 → 11번째 429 (계정 유무와 무관하게 셈)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const emails = Array.from({ length: 11 }, nobody);
    const res = await sendTimes(app, emails);
    assert.equal(res.status, 429);
    // 정말 없는 주소만 보냈음
    assert.equal(await db.User.count({ where: { email: emails } }), 0);
});

// ── 링크 모양 (622~623) ──

test('A11-B-622 앱 주소 http://localhost:5173 → 링크 http://localhost:5173/password-reset?token=<43자>', async (t) => {
    if (noDb(t)) return;
    withAppUrl(t, 'http://localhost:5173');
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'rl' });
    await app.post(PATH, { email: user.email });
    const [sent] = mailsTo(user.email, 'PASSWORD_RESET');
    assert.ok(sent, '메일이 안 나감');
    assert.match(sent.params.resetUrl, /^http:\/\/localhost:5173\/password-reset\?token=[A-Za-z0-9_-]{43}$/);
});

test('A11-B-623 앱 주소가 화면 주소(/password-reset)여도 링크에 /password-reset 한 번만', async (t) => {
    if (noDb(t)) return;
    withAppUrl(t, 'http://localhost:5173/password-reset');
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix: 'rl' });
    await app.post(PATH, { email: user.email });
    const [sent] = mailsTo(user.email, 'PASSWORD_RESET');
    assert.ok(sent, '메일이 안 나감');
    assert.equal(sent.params.resetUrl.split('/password-reset').length - 1, 1);
    assert.match(sent.params.resetUrl, /^http:\/\/localhost:5173\/password-reset\?token=[A-Za-z0-9_-]{43}$/);
});

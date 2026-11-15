'use strict';

// 가입 이메일 인증번호 시험(시험 DB): 받기·다시 보내기 60초·틀린 횟수 5번·10분 만료·주소 한도·이미 가입한 주소도 같은 답
// 목록 A11-B-201~229 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a11a-auth-db-helpers');
const verificationService = require('../../services/auth/signupEmailVerification');

const { db } = h;
const CODE_PATH = '/auth/signup/email-code';
const VERIFY_PATH = '/auth/signup/email-code/verify';

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

// ── 이 파일 안 작은 도우미 ──
const askCode = (email, options = {}) => h.request(app.base, 'POST', CODE_PATH, { body: { email }, ...options });
const verify = (email, code, options = {}) => h.request(app.base, 'POST', VERIFY_PATH, { body: { email, code }, ...options });
const lastCode = (email) => h.mailsTo(email).at(-1)?.params.code;
// 받은 번호와 다른 6자리 (끝을 하나 올림) 예: "123456" → "123457"
const wrongOf = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const rowOf = (email) => db.SignupEmailVerification.findOne({ where: { email, purpose: 'SIGNUP' }, raw: true });

// 서비스에 시각 넣어 보내기·확인 (초 단위 시각만 써서 DB 반올림에 안 흔들림)
const alignedNow = (offsetSeconds = 0) => Math.floor(Date.now() / 1000) * 1000 + offsetSeconds * 1000;
const askAt = (email, ms) => verificationService.requestSignupCode({ email }, { mailAdapter: h.mailbox, now: () => new Date(ms) });
const verifyAt = (email, code, ms) => verificationService.verifySignupCode({ email, code }, { now: () => new Date(ms) });

// 인증 행의 보낸 시각을 뒤로 밀기 (다시 보내기 대기를 지난 것으로 만듦)
const pushSentAtBack = (email, seconds) => db.SignupEmailVerification.update(
    { sent_at: new Date(Math.floor(Date.now() / 1000) * 1000 - seconds * 1000) },
    { where: { email, purpose: 'SIGNUP' } },
);

test('A11-B-201 첫 인증번호 요청 → 200 + 메일 1통 6자리 숫자', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b201');
    const res = await askCode(email);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
    const mails = h.mailsTo(email);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].template, 'SIGNUP_CODE');
    assert.match(mails[0].params.code, /^\d{6}$/);
});

test('A11-B-202 번호 원문은 DB 줄·응답 어디에도 없음', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b202');
    const res = await askCode(email);
    const code = lastCode(email);
    assert.ok(!res.text.includes(code), '응답 본문에 번호가 있음');
    const row = await rowOf(email);
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    for (const [column, value] of Object.entries(row)) {
        assert.ok(!String(value ?? '').includes(code), `${column} 칸에 번호 원문이 있음`);
    }
});

test('A11-B-203 요청·확인 답 모두 Cache-Control no-store [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b203');
    const sent = await askCode(email);
    const checked = await verify(email, lastCode(email));
    assert.equal(sent.headers.get('cache-control'), 'no-store');
    assert.equal(checked.headers.get('cache-control'), 'no-store');
});

// 가입 여부 숨김: 같은 답, 메일은 안 감
test('A11-B-204 이미 가입한 이메일 → 같은 200 답, 메일 0통', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b204' });
    const res = await askCode(user.email);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
    assert.equal(h.mailsTo(user.email).length, 0);
});

test('A11-B-205 첫 요청 30초 뒤 → 429 RESEND_TOO_SOON, 남은 30초', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b205');
    const t0 = alignedNow();
    assert.equal((await askAt(email, t0)).ok, true);
    // 진짜 경로 답 모양 (바로 다시 = 대기 중)
    const http = await askCode(email);
    assert.equal(http.status, 429);
    assert.equal(http.body.code, 'RESEND_TOO_SOON');
    assert.deepEqual(await askAt(email, t0 + 30_000), { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: 30 });
});

test('A11-B-206 첫 요청 59초 뒤 → RESEND_TOO_SOON, 남은 1초', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b206');
    const t0 = alignedNow();
    await askAt(email, t0);
    assert.deepEqual(await askAt(email, t0 + 59_000), { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: 1 });
});

test('A11-B-207 첫 요청 60초 뒤 → 다시 받기 됨', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b207');
    const t0 = alignedNow();
    await askAt(email, t0);
    const again = await askAt(email, t0 + 60_000);
    assert.equal(again.ok, true);
    assert.equal(h.mailsTo(email).length, 2);
});

test('A11-B-208 이미 가입한 이메일도 30초 뒤 → 429 RESEND_TOO_SOON, 남은 30초', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b208' });
    const t0 = alignedNow();
    assert.equal((await askAt(user.email, t0)).ok, true);
    const http = await askCode(user.email);
    assert.equal(http.status, 429);
    assert.equal(http.body.code, 'RESEND_TOO_SOON');
    assert.deepEqual(await askAt(user.email, t0 + 30_000), { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: 30 });
});

// 다시 받으면 세대가 올라 옛 번호는 안 맞음
test('A11-B-209 번호 A → 60초 뒤 번호 B → A 확인 400 CODE_INVALID → B 확인 200', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b209');
    const t0 = alignedNow(-120);
    await askAt(email, t0);
    const codeA = lastCode(email);
    await askAt(email, t0 + 60_000);
    const codeB = lastCode(email);
    const withA = await verify(email, codeA);
    assert.equal(withA.status, 400);
    assert.equal(withA.body.code, 'CODE_INVALID');
    const withB = await verify(email, codeB);
    assert.equal(withB.status, 200);
    assert.equal(withB.body.ok, true);
});

test('A11-B-210 4번 틀림 → 다시 받기 → 새 번호로 1번 틀림 → 남은 4번', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b210');
    const t0 = alignedNow(-120);
    await askAt(email, t0);
    const first = lastCode(email);
    for (let i = 0; i < 4; i += 1) await verify(email, wrongOf(first));
    await askAt(email, t0 + 60_000);
    const res = await verify(email, wrongOf(lastCode(email)));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
    assert.equal(res.body.attemptsRemaining, 4);
});

test('A11-B-211 맞는 번호 → 200 가입 증명, DB엔 증명 해시만', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b211');
    await askCode(email);
    const res = await verify(email, lastCode(email));
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.signupProof, 'string');
    assert.ok(res.body.signupProof.length > 0);
    const row = await rowOf(email);
    assert.match(row.proof_hash, /^[0-9a-f]{64}$/);
    for (const [column, value] of Object.entries(row)) {
        assert.ok(!String(value ?? '').includes(res.body.signupProof), `${column} 칸에 증명 원문이 있음`);
    }
});

// 틀린 번호 n번째 답 (1~4 = 400 남은 횟수, 5 = 429)
const wrongCases = [
    { id: 'A11-B-212', n: 1, status: 400, code: 'CODE_INVALID', remaining: 4 },
    { id: 'A11-B-213', n: 2, status: 400, code: 'CODE_INVALID', remaining: 3 },
    { id: 'A11-B-214', n: 3, status: 400, code: 'CODE_INVALID', remaining: 2 },
    { id: 'A11-B-215', n: 4, status: 400, code: 'CODE_INVALID', remaining: 1 },
    { id: 'A11-B-216', n: 5, status: 429, code: 'TOO_MANY_ATTEMPTS' },
];
for (const { id, n, status, code, remaining } of wrongCases) {
    test(`${id} 틀린 번호 ${n}번째 → ${status} ${code}${remaining ? ` 남은 ${remaining}` : ''}`, async (t) => {
        if (h.noDb(t)) return;
        const email = h.emailOf(id.slice(-3));
        await askCode(email);
        const wrong = wrongOf(lastCode(email));
        let res = null;
        for (let i = 0; i < n; i += 1) res = await verify(email, wrong);
        assert.equal(res.status, status);
        assert.equal(res.body.code, code);
        if (remaining !== undefined) assert.equal(res.body.attemptsRemaining, remaining);
    });
}

test('A11-B-217 5번 틀린 뒤 맞는 번호 → 429 TOO_MANY_ATTEMPTS', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b217');
    await askCode(email);
    const code = lastCode(email);
    for (let i = 0; i < 5; i += 1) await verify(email, wrongOf(code));
    const res = await verify(email, code);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'TOO_MANY_ATTEMPTS');
});

// 번호 10분: 9분 59초까지 됨, 10분 정각부터 만료
const expiryCases = [
    { id: 'A11-B-218', after: 599, label: '9분 59초', ok: true },
    { id: 'A11-B-219', after: 600, label: '10분 정각', ok: false },
    { id: 'A11-B-220', after: 601, label: '10분 1초', ok: false },
];
for (const { id, after, label, ok } of expiryCases) {
    test(`${id} 받은 뒤 ${label} 맞는 번호 → ${ok ? '확인 됨' : 'CODE_EXPIRED'}`, async (t) => {
        if (h.noDb(t)) return;
        const email = h.emailOf(id.slice(-3));
        const t0 = alignedNow();
        await askAt(email, t0);
        const result = await verifyAt(email, lastCode(email), t0 + after * 1000);
        if (ok) {
            assert.equal(result.ok, true);
        } else {
            assert.deepEqual(result, { ok: false, code: 'CODE_EXPIRED' });
        }
    });
}

test('A11-B-221 이미 쓴 번호 다시 → 400 CODE_INVALID', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b221');
    await askCode(email);
    const code = lastCode(email);
    assert.equal((await verify(email, code)).status, 200);
    const again = await verify(email, code);
    assert.equal(again.status, 400);
    assert.equal(again.body.code, 'CODE_INVALID');
});

test('A11-B-222 이미 가입한 주소(번호 안 만듦)에 아무 6자리 → 400 CODE_INVALID', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b222' });
    await askCode(user.email);
    const res = await verify(user.email, '123456');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_INVALID');
});

test('A11-B-223 " User@Example.com "로 받고 소문자로 확인 → 200', async (t) => {
    if (h.noDb(t)) return;
    const lower = h.emailOf('b223');
    const messy = ` ${lower.replace('a11a-', 'A11A-').replace('example.com', 'Example.com')} `;
    assert.equal((await askCode(messy)).status, 200);
    const res = await verify(lower, lastCode(lower));
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
});

// 주소 1시간 5번: 다시 보내기 대기를 1ms로 줄이고, DB 시각 칸 반올림(최대 0.5초)을 넘게 보낸 시각을 2초씩 뒤로 밈
async function askManyTimes(t, email, n, base = app.base) {
    h.withEnv(t, { SIGNUP_EMAIL_RESEND_COOLDOWN_MS: '1' });
    const ip = h.nextIp();
    let res = null;
    for (let i = 0; i < n; i += 1) {
        res = await h.request(base, 'POST', CODE_PATH, { body: { email }, ip });
        await pushSentAtBack(email, 2);
    }
    return res;
}

test('A11-B-224 같은 주소 1시간 4번째 → 200', async (t) => {
    if (h.noDb(t)) return;
    const res = await askManyTimes(t, h.emailOf('b224'), 4);
    assert.equal(res.status, 200);
});
test('A11-B-225 같은 주소 1시간 5번째 → 200', async (t) => {
    if (h.noDb(t)) return;
    const res = await askManyTimes(t, h.emailOf('b225'), 5);
    assert.equal(res.status, 200);
});
test('A11-B-226 같은 주소 1시간 6번째 → 429 RATE_LIMITED', async (t) => {
    if (h.noDb(t)) return;
    const res = await askManyTimes(t, h.emailOf('b226'), 6);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

// 하루 10번: 1시간 한도를 넓힌 서버 따로 (한도는 경로 파일 불러올 때 읽음)
test('A11-B-227 1시간 한도 넓힌 뒤 같은 주소 10번째 → 200', async (t) => {
    if (h.noDb(t)) return;
    const wide = await h.startApp({ SIGNUP_EMAIL_HOUR_MAX: '100' });
    t.after(() => wide.close());
    const res = await askManyTimes(t, h.emailOf('b227'), 10, wide.base);
    assert.equal(res.status, 200);
});
test('A11-B-228 1시간 한도 넓힌 뒤 같은 주소 11번째 → 429', async (t) => {
    if (h.noDb(t)) return;
    const wide = await h.startApp({ SIGNUP_EMAIL_HOUR_MAX: '100' });
    t.after(() => wide.close());
    const res = await askManyTimes(t, h.emailOf('b228'), 11, wide.base);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('A11-B-229 메일 보내기가 실패해도 같은 200 답 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    h.failNextMail();
    const res = await askCode(h.emailOf('b229'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
});

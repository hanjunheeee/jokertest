'use strict';

// 보안 시험: 이메일 주소 한 곳 검사 (받는 사람 하나·@ 하나·머리말 끼워 넣기 글자·길이)
// 검사 함수 · 가입 인증·비번 재설정·이메일 바꾸기 입력 · 메일 발송기 셋 · HTTP 경로 (DB 안 씀, 메일은 가짜)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-email-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isSingleEmailAddress } = require('../../utils/auth/emailAddress');
const { validateEmailFormat } = require('../../validations/auth/signupEmailVerification');
const { validateResetEmail } = require('../../validations/auth/passwordReset');
const { parseNewEmail } = require('../../services/auth/emailChange/codes');
const mail = require('../../utils/adapters/mail');
const { startAuthServer, send, json } = require('./securityHttp');

const CODE_MAIL = { template: 'SIGNUP_CODE', params: { code: '482913', expiresInSec: 600 } };

// 여러 곳 보내기·머리말 끼워 넣기 모양 (nodemailer가 받는 사람 여럿으로 읽거나 머리말로 읽는 것)
const MULTI_OR_INJECTED = [
    'victim@example.com,attacker@example.org',
    'victim@example.com;attacker@example.org',
    'victim@example.com attacker@example.org',
    'a@b@example.com',
    'Name <victim@example.com>',
    '<victim@example.com>',
    '"a,b"@example.com',
    'victim@example.com\r\nBcc: spy@example.org',
    'victim@example.com\nBcc: spy@example.org',
    'victim@example.com\tx',
    'victim(comment)@example.com',
    'victim@example.com,',
    'victim@[127.0.0.1]',
];

test('주소 검사: 보통 주소는 통과 (점·+·_·%·-·작은따옴표·하위 도메인·국제 도메인)', () => {
    for (const email of ['a@b.co', 'first.last+tag@sub.example.com', "o'brien@example.io", 'x_y%z-1@mail.example.kr', 'k@xn--3e0b707e.kr']) {
        assert.equal(isSingleEmailAddress(email), true, email);
    }
});

test('주소 검사: 쉼표·세미콜론·빈칸·@ 두 개·꺾쇠·따옴표·괄호·줄바꿈·탭·IP 꼴은 거절', () => {
    for (const email of MULTI_OR_INJECTED) assert.equal(isSingleEmailAddress(email), false, JSON.stringify(email));
    // 줄 나눔 글자(U+2028)도 다듬기 전 값이면 거절 (입력 검사는 앞뒤를 다듬은 뒤 봄)
    assert.equal(isSingleEmailAddress('victim@example.com '), false);
});

test('주소 검사: 점으로 시작·끝·잇단 점, 도메인 점 없음·- 앞뒤·숫자뿐 끝 칸은 거절', () => {
    for (const email of ['.a@b.co', 'a.@b.co', 'a..b@b.co', 'a@b', 'a@-b.co', 'a@b-.co', 'a@b.123', 'a@b..co', 'a@.b.co', '@b.co', 'a@']) {
        assert.equal(isSingleEmailAddress(email), false, email);
    }
});

test('주소 검사: 길이 — 전체 254자, @ 앞 64자, 도메인 한 칸 63자까지', () => {
    assert.equal(isSingleEmailAddress(`${'a'.repeat(64)}@b.co`), true);
    assert.equal(isSingleEmailAddress(`${'a'.repeat(65)}@b.co`), false);
    assert.equal(isSingleEmailAddress(`a@${'b'.repeat(63)}.co`), true);
    assert.equal(isSingleEmailAddress(`a@${'b'.repeat(64)}.co`), false);
    const domainOf = (last) => `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(last)}.io`;
    assert.equal(isSingleEmailAddress(`${'a'.repeat(64)}@${domainOf(58)}`), true);
    assert.equal(isSingleEmailAddress(`${'a'.repeat(64)}@${domainOf(59)}`), false);
});

test('주소 검사: maxLength로 칸마다 더 짧게 자름, 글자 아닌 값·빈 값·한글 @ 앞은 거절', () => {
    assert.equal(isSingleEmailAddress('abcdef@b.co', { maxLength: 10 }), false);
    assert.equal(isSingleEmailAddress('abcd@b.co', { maxLength: 10 }), true);
    for (const value of [undefined, null, 1, ['a@b.co'], { email: 'a@b.co' }, '', '조커@b.co']) {
        assert.equal(isSingleEmailAddress(value), false, String(value));
    }
});

test('가입 인증 주소 검사: 앞뒤 빈칸은 다듬어 통과, 여러 곳·끼워 넣기 모양은 거절', () => {
    assert.equal(validateEmailFormat('  Join@Example.com  '), true);
    for (const email of MULTI_OR_INJECTED) assert.equal(validateEmailFormat(email), false, JSON.stringify(email));
});

test('비번 재설정 주소 검사: 같은 규칙 (다듬은 값 돌려줌, 여러 곳·끼워 넣기 거절)', () => {
    assert.deepEqual(validateResetEmail(' a@b.co '), { ok: true, value: 'a@b.co' });
    for (const email of MULTI_OR_INJECTED) assert.equal(validateResetEmail(email).ok, false, JSON.stringify(email));
});

test('이메일 바꾸기 새 주소: 소문자로 맞춰 통과, 여러 곳·끼워 넣기 모양은 null', () => {
    assert.equal(parseNewEmail(' New@Example.COM '), 'new@example.com');
    for (const email of MULTI_OR_INJECTED) assert.equal(parseNewEmail(email), null, JSON.stringify(email));
});

test('메일 발송기(게이트웨이): 여러 곳 주소면 보내기 요청 자체를 안 함', async () => {
    const calls = [];
    const adapter = mail.createGatewayMailAdapter({
        gatewayUrl: 'https://mail.example.test/emails', gatewayToken: 'tok', from: 'no-reply@example.test',
        transport: async (target, request) => { calls.push(request); return { status: 200, bodyText: '{"id":"m"}' }; },
    });
    for (const to of MULTI_OR_INJECTED.slice(0, 6)) assert.deepEqual(await adapter.sendMail({ ...CODE_MAIL, to }), { ok: false });
    assert.equal(calls.length, 0);
    assert.equal((await adapter.sendMail({ ...CODE_MAIL, to: 'one@example.test' })).ok, true);
});

test('메일 발송기(SMTP): 세미콜론·꺾쇠 주소면 연결도 안 만듦', async () => {
    const created = [];
    const adapter = mail.createSmtpMailAdapter({
        host: 'smtp.example.test', port: '465', user: 'u@example.test', pass: 'p', from: 'u@example.test',
        createTransport: (options) => { created.push(options); return { sendMail: async (m) => ({ accepted: [m.to], rejected: [] }), close() {} }; },
    });
    for (const to of ['a@x.io;b@y.io', 'Name <a@x.io>', 'a@x.io\r\nBcc: c@y.io']) {
        assert.deepEqual(await adapter.sendMail({ ...CODE_MAIL, to }), { ok: false });
    }
    assert.equal(created.length, 0);
});

test('메일 발송기(메모리): 진짜처럼 여러 곳 주소는 { ok: false }, 안 쌓음', async () => {
    const memory = mail.createMemoryMailAdapter();
    assert.deepEqual(await memory.sendMail({ ...CODE_MAIL, to: 'a@x.io,b@y.io' }), { ok: false });
    assert.equal(memory.outbox.length, 0);
    assert.equal((await memory.sendMail({ ...CODE_MAIL, to: 'a@x.io' })).ok, true);
});

test('HTTP 가입 인증번호: 세미콜론·꺾쇠·줄바꿈 주소는 400 INVALID_INPUT, 메일 없음', async (t) => {
    const { base, mail: outbox } = await startAuthServer(t);
    for (const email of ['a@x.io;b@y.io', 'Name <a@x.io>', 'a@x.io\r\nBcc: c@y.io', `${'a'.repeat(95)}@x.io`]) {
        const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email } }));
        assert.equal(res.status, 400, JSON.stringify(email));
        assert.equal(res.body.code, 'INVALID_INPUT');
    }
    assert.equal(outbox.outbox.length, 0);
});

test('HTTP 비번 재설정 요청: 쉼표로 이은 주소는 400 INVALID_INPUT (재설정 메일 없음)', async (t) => {
    const { base, mail: outbox } = await startAuthServer(t);
    const res = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'a@x.io,b@y.io' } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
    assert.equal(outbox.outbox.length, 0);
});

test('HTTP 인증번호 확인: 여러 곳 주소는 번호 맞히기 전에 400 INVALID_INPUT', async (t) => {
    const { base } = await startAuthServer(t);
    const res = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'a@x.io,b@y.io', code: '123456' } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
});

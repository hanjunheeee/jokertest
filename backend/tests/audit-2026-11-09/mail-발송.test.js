'use strict';

// 이메일 시험: 메일 문구 · 받는 주소·시간 값 확인 · HTTPS 게이트웨이 · Gmail SMTP · 메모리 발송기 · 서비스에서 발송기 고르기까지
// 기본은 가짜 전송·가짜 SMTP 연결, DB 안 씀 (가짜 저장소)
// 실제 Gmail 발송은 RUN_LIVE_MAIL=1일 때만 minsang580@gmail.com 한 곳으로 1통 (기본 skip, 비밀번호 출력·기록 안 함)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-mail-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mail = require('../../utils/adapters/mail');
const templates = require('../../utils/adapters/mailSenders/templates');
const { readPort } = require('../../utils/adapters/mailSenders/smtp');
const verification = require('../../services/auth/signupEmailVerification');
const passwordReset = require('../../services/auth/passwordReset');
const { useAuthStore } = require('./authFakes');

const GATEWAY = { gatewayUrl: 'https://mail.example.test/emails', gatewayToken: 'tok_audit_value', from: '가면무도회 <no-reply@example.test>' };
const SMTP = { host: 'smtp.gmail.com', port: '465', user: 'sender@example.test', pass: 'abcd efgh ijkl mnop', from: '가면무도회 <sender@example.test>' };
const CODE_MAIL = { to: 'player@example.test', template: 'SIGNUP_CODE', params: { code: '482913', expiresInSec: 600 } };
const MAIL_ENV_KEYS = ['MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASS', 'PASSWORD_RESET_MAIL_FROM',
    'PASSWORD_RESET_MAIL_GATEWAY_URL', 'PASSWORD_RESET_MAIL_GATEWAY_TOKEN', 'PASSWORD_RESET_MAIL_TIMEOUT_MS', 'PASSWORD_RESET_APP_URL',
    'SIGNUP_EMAIL_HMAC_SECRET'];

// 메일 관련 환경값은 시험마다 비우고 시작 (진짜 .env 값이 섞여 실제로 나가지 않게)
const withEnv = (t, values = {}) => {
    const saved = Object.fromEntries(MAIL_ENV_KEYS.concat(Object.keys(values)).map((key) => [key, process.env[key]]));
    for (const key of MAIL_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

const recordingTransport = (response = { status: 200, bodyText: '{"id":"msg_1"}' }) => {
    const calls = [];
    const transport = async (target, request) => {
        calls.push({ target: target.toString(), ...request });
        return typeof response === 'function' ? response() : response;
    };
    return { calls, transport };
};

const fakeSmtp = (sendImpl = async (message) => ({ accepted: [message.to], rejected: [] })) => {
    const created = [];
    const createTransport = (options) => {
        const record = { options, sent: [], closed: false };
        created.push(record);
        return {
            sendMail: async (message) => { record.sent.push(message); return sendImpl(message); },
            close: () => { record.closed = true; },
        };
    };
    return { created, createTransport };
};

// ── 문구 ──

test('문구: 가입 인증번호 제목·본문 (번호 그대로, 600초는 10분)', () => {
    const rendered = templates.renderTemplate('SIGNUP_CODE', { code: '000123', expiresInSec: 600 });
    assert.equal(rendered.subject, '[가면무도회 살인사건] 가입 인증번호');
    assert.match(rendered.text, /\n000123\n/);
    assert.match(rendered.text, /10분 이내/);
});

test('문구: 남은 시간은 분 단위 내림, 1분보다 적거나 없으면 1분으로 적는다', () => {
    const minutesOf = (expiresInSec) => /(\d+)분 이내/.exec(templates.renderTemplate('SIGNUP_CODE', { code: '1', expiresInSec }).text)[1];
    assert.equal(minutesOf(125), '2');
    assert.equal(minutesOf(59), '1');
    assert.equal(minutesOf(undefined), '1');
    assert.equal(minutesOf(0), '1');
});

test('문구: 비번 재설정 메일은 링크를 그대로 한 줄로 싣고 제목은 "[가면무도회 살인사건] 비밀번호 재설정 안내"', () => {
    const url = 'https://play.example.com/password-reset?token=AbC_-123';
    const rendered = templates.renderTemplate('PASSWORD_RESET', { resetUrl: url });
    assert.equal(rendered.subject, '[가면무도회 살인사건] 비밀번호 재설정 안내');
    assert.ok(rendered.text.split('\n').includes(url));
});

test('문구: 소셜 전용 안내 메일 제목은 "[가면무도회 살인사건] 계정 안내"이고 본문에 링크·번호가 없다', () => {
    const rendered = templates.renderTemplate('SOCIAL_LOGIN_GUIDE', {});
    assert.equal(rendered.subject, '[가면무도회 살인사건] 계정 안내');
    assert.doesNotMatch(rendered.text, /https?:\/\//);
    assert.match(rendered.text, /소셜 로그인/);
});

test('문구 준비: 모르는 목적은 던지고, params가 null이라 문구를 못 만들면 null', () => {
    assert.throws(() => templates.prepareMail('WELCOME', {}), /알 수 없는 메일 목적/);
    assert.equal(templates.prepareMail('SIGNUP_CODE', null), null);
    assert.equal(templates.prepareMail('PASSWORD_RESET', null), null);
});

test('받는 주소: 254자까지·@ 있음·줄바꿈 없음만 통과', () => {
    // @ 앞은 64자까지라 도메인을 늘려 254자 만듦 (도메인 한 칸 63자까지)
    const domainOf = (last) => `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(last)}.io`;
    const local = 'a'.repeat(64);
    assert.equal(`${local}@${domainOf(58)}`.length, 254);
    assert.equal(templates.isMailAddress(`${local}@${domainOf(58)}`), true);
    assert.equal(templates.isMailAddress(`${local}@${domainOf(59)}`), false);
    assert.equal(templates.isMailAddress('a@b.io\nBcc: c@d.io'), false);
    assert.equal(templates.isMailAddress('a@b.io\r'), false);
    assert.equal(templates.isMailAddress('ab.io'), false);
    assert.equal(templates.isMailAddress(['a@b.io']), false);
    assert.equal(templates.isMailAddress(''), false);
});

test('기다리는 시간: 양의 정수만, 0·음수·소수·글자·빈 값은 기본값', () => {
    assert.equal(templates.readTimeoutMs('2500', 5000), 2500);
    for (const raw of ['0', '-1', '1.5', 'abc', '', undefined]) assert.equal(templates.readTimeoutMs(raw, 5000), 5000);
});

test('발송기 고르기: MAIL_SMTP_HOST가 공백뿐이면 게이트웨이', () => {
    assert.equal(mail.pickSender({ MAIL_SMTP_HOST: '   ' }), 'gateway');
    assert.equal(mail.pickSender({ MAIL_SMTP_HOST: ' smtp.gmail.com ' }), 'smtp');
    assert.equal(mail.pickSender({}), 'gateway');
});

// ── HTTPS 게이트웨이 ──

test('게이트웨이: 주소·키·보내는 사람 앞뒤 공백은 다듬어 보낸다', async () => {
    const fake = recordingTransport();
    const adapter = mail.createGatewayMailAdapter({
        gatewayUrl: '  https://mail.example.test/emails ', gatewayToken: ' tok_audit_value ', from: ' no-reply@example.test ', transport: fake.transport,
    });
    assert.deepEqual(await adapter.sendMail(CODE_MAIL), { ok: true, id: 'msg_1' });
    assert.equal(fake.calls[0].target, 'https://mail.example.test/emails');
    assert.equal(fake.calls[0].headers.authorization, 'Bearer tok_audit_value');
    assert.equal(JSON.parse(fake.calls[0].body).from, 'no-reply@example.test');
});

test('게이트웨이: 본문은 from·to·subject·text 넷뿐이고 인증번호가 text에 있다', async () => {
    const fake = recordingTransport();
    await mail.createGatewayMailAdapter({ ...GATEWAY, transport: fake.transport }).sendMail(CODE_MAIL);
    const body = JSON.parse(fake.calls[0].body);
    assert.deepEqual(Object.keys(body).sort(), ['from', 'subject', 'text', 'to']);
    assert.equal(body.to, 'player@example.test');
    assert.match(body.text, /482913/);
    assert.equal(Number(fake.calls[0].headers['content-length']), Buffer.byteLength(fake.calls[0].body));
});

test('게이트웨이: 2xx 경계 (204·299 성공, 300 실패), 성공 본문이 JSON 아니면 id 없이 성공', async () => {
    const send = async (response) => mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport(response).transport }).sendMail(CODE_MAIL);
    assert.deepEqual(await send({ status: 204, bodyText: '' }), { ok: true });
    assert.deepEqual(await send({ status: 299, bodyText: 'accepted' }), { ok: true });
    assert.deepEqual(await send({ status: 300, bodyText: '{"id":"x"}' }), { ok: false });
});

test('게이트웨이: 메일 id가 200자를 넘거나 글자가 아니면 id를 싣지 않는다', async () => {
    const send = async (bodyText) => mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport({ status: 200, bodyText }).transport }).sendMail(CODE_MAIL);
    assert.deepEqual(await send(JSON.stringify({ id: 'x'.repeat(201) })), { ok: true });
    assert.deepEqual(await send(JSON.stringify({ id: 42 })), { ok: true });
    assert.deepEqual(await send(JSON.stringify({ id: 'x'.repeat(200) })), { ok: true, id: 'x'.repeat(200) });
});

test('게이트웨이: 기다리는 시간은 만들 때 PASSWORD_RESET_MAIL_TIMEOUT_MS, 틀린 값이면 5000', async (t) => {
    withEnv(t, { PASSWORD_RESET_MAIL_TIMEOUT_MS: '1500' });
    const fast = recordingTransport();
    await mail.createGatewayMailAdapter({ ...GATEWAY, transport: fast.transport }).sendMail(CODE_MAIL);
    process.env.PASSWORD_RESET_MAIL_TIMEOUT_MS = 'soon';
    const fallback = recordingTransport();
    await mail.createGatewayMailAdapter({ ...GATEWAY, transport: fallback.transport }).sendMail(CODE_MAIL);
    assert.deepEqual([fast.calls[0].timeoutMs, fallback.calls[0].timeoutMs], [1500, 5000]);
});

test('게이트웨이: 응답 상태가 정수가 아니면(글자 "200") 실패', async () => {
    const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport({ status: '200', bodyText: '{}' }).transport });
    assert.deepEqual(await adapter.sendMail(CODE_MAIL), { ok: false });
});

test('게이트웨이: 실패 결과에 키·받는 주소·응답 원문이 안 실린다', async () => {
    const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport({ status: 401, bodyText: '{"message":"bad tok_audit_value"}' }).transport });
    const result = await adapter.sendMail(CODE_MAIL);
    assert.deepEqual(result, { ok: false });
});

test('게이트웨이: params가 null이면 전송 없이 실패', async () => {
    const fake = recordingTransport();
    const result = await mail.createGatewayMailAdapter({ ...GATEWAY, transport: fake.transport }).sendMail({ ...CODE_MAIL, params: null });
    assert.deepEqual(result, { ok: false });
    assert.equal(fake.calls.length, 0);
});

// ── Gmail SMTP ──

test('SMTP: Gmail 주소는 대소문자·공백 상관없이 앱 비밀번호 빈칸을 빼고, 다른 서버 비밀번호는 그대로', async () => {
    const gmail = fakeSmtp();
    await mail.createSmtpMailAdapter({ ...SMTP, host: ' SMTP.Gmail.com ', createTransport: gmail.createTransport }).sendMail(CODE_MAIL);
    assert.equal(gmail.created[0].options.auth.pass, 'abcdefghijklmnop');
    assert.equal(gmail.created[0].options.host, 'SMTP.Gmail.com');
    const other = fakeSmtp();
    await mail.createSmtpMailAdapter({ ...SMTP, host: 'mail.example.test', createTransport: other.createTransport }).sendMail(CODE_MAIL);
    assert.equal(other.created[0].options.auth.pass, 'abcd efgh ijkl mnop');
});

test('SMTP: 보내는 편지는 보내는 사람·받는 사람·제목·본문만, 사용자 이름은 다듬음', async () => {
    const smtp = fakeSmtp();
    await mail.createSmtpMailAdapter({ ...SMTP, user: ' sender@example.test ', from: ' 가면무도회 <sender@example.test> ', createTransport: smtp.createTransport }).sendMail(CODE_MAIL);
    const message = smtp.created[0].sent[0];
    assert.deepEqual(Object.keys(message).sort(), ['from', 'subject', 'text', 'to']);
    assert.equal(message.from, '가면무도회 <sender@example.test>');
    assert.equal(message.subject, '[가면무도회 살인사건] 가입 인증번호');
    assert.equal(smtp.created[0].options.auth.user, 'sender@example.test');
});

test('SMTP: 연결·인사·소켓 기다리는 시간은 모두 정한 값, 로그·디버그는 끔', async (t) => {
    withEnv(t, { PASSWORD_RESET_MAIL_TIMEOUT_MS: '3000' });
    const smtp = fakeSmtp();
    await mail.createSmtpMailAdapter({ ...SMTP, createTransport: smtp.createTransport }).sendMail(CODE_MAIL);
    const { options } = smtp.created[0];
    assert.deepEqual([options.connectionTimeout, options.greetingTimeout, options.socketTimeout], [3000, 3000, 3000]);
    assert.deepEqual([options.logger, options.debug], [false, false]);
});

test('SMTP 포트: 앞뒤 공백 숫자는 읽고, 0·65536·소수·글자는 null', () => {
    assert.equal(readPort(' 587 '), 587);
    assert.equal(readPort(465), 465);
    assert.equal(readPort('   '), 465);
    for (const raw of ['0', '65536', '587.5', 'smtp']) assert.equal(readPort(raw), null);
});

test('SMTP: 연결 만들기가 던지면 실패, 닫기가 던져도 성공 결과는 그대로', async () => {
    const throwing = mail.createSmtpMailAdapter({ ...SMTP, createTransport: () => { throw new Error('bad options'); } });
    assert.deepEqual(await throwing.sendMail(CODE_MAIL), { ok: false });
    const closingBadly = mail.createSmtpMailAdapter({
        ...SMTP,
        createTransport: () => ({ sendMail: async (m) => ({ accepted: [m.to], rejected: [] }), close: () => { throw new Error('close failed'); } }),
    });
    assert.deepEqual(await closingBadly.sendMail(CODE_MAIL), { ok: true });
});

test('SMTP: 결과에 accepted 칸이 없거나 일부만 거절돼도 실패', async () => {
    const noAccepted = mail.createSmtpMailAdapter({ ...SMTP, createTransport: fakeSmtp(async () => ({ messageId: 'x' })).createTransport });
    assert.deepEqual(await noAccepted.sendMail(CODE_MAIL), { ok: false });
    const partly = mail.createSmtpMailAdapter({ ...SMTP, createTransport: fakeSmtp(async (m) => ({ accepted: [m.to], rejected: ['other@x.io'] })).createTransport });
    assert.deepEqual(await partly.sendMail(CODE_MAIL), { ok: false });
});

test('SMTP: 받는 주소에 머리말 끼워 넣기(줄바꿈)가 있으면 연결도 안 만든다', async () => {
    const smtp = fakeSmtp();
    const result = await mail.createSmtpMailAdapter({ ...SMTP, createTransport: smtp.createTransport }).sendMail({ ...CODE_MAIL, to: 'p@x.io\r\nBcc: spy@x.io' });
    assert.deepEqual(result, { ok: false });
    assert.equal(smtp.created.length, 0);
});

test('nodemailer는 쉼표로 이은 주소를 받는 사람 여럿으로 나눈다 (아래 실패 시험의 근거)', async () => {
    const info = await require('nodemailer').createTransport({ jsonTransport: true })
        .sendMail({ from: 's@x.io', to: 'victim@x.io,other@y.io', subject: 's', text: 't' });
    assert.deepEqual(info.envelope.to, ['victim@x.io', 'other@y.io']);
});

// 발견한 버그: 받는 주소 확인이 쉼표를 막지 않아 한 통이 여러 곳으로 감
test('SMTP: 쉼표로 이은 여러 받는 주소는 연결도 안 만든다 (한 통이 여러 곳으로 가는 것 막기)', async () => {
    const smtp = fakeSmtp();
    const result = await mail.createSmtpMailAdapter({ ...SMTP, createTransport: smtp.createTransport })
        .sendMail({ ...CODE_MAIL, to: 'victim@x.io,other@y.io' });
    assert.deepEqual(result, { ok: false });
    assert.equal(smtp.created.length, 0);
});

test('SMTP: 실패 결과에 비밀번호가 안 실린다 (로그인 거절 오류여도)', async () => {
    const adapter = mail.createSmtpMailAdapter({ ...SMTP, createTransport: fakeSmtp(async () => { throw new Error('535 auth failed abcd efgh ijkl mnop'); }).createTransport });
    const result = await adapter.sendMail(CODE_MAIL);
    assert.deepEqual(result, { ok: false });
});

// ── 메모리 발송기 ──

test('메모리 발송기: 실패 넣기는 한 번만 먹고, 실패한 메일은 쌓지 않으며 id는 쌓인 순서', async () => {
    const memory = mail.createMemoryMailAdapter();
    memory.failNextWithResult();
    assert.deepEqual(await memory.sendMail(CODE_MAIL), { ok: false });
    assert.deepEqual(await memory.sendMail(CODE_MAIL), { ok: true, id: 'mem-1' });
    memory.failNextWithThrow();
    await assert.rejects(memory.sendMail(CODE_MAIL), /injected failure/);
    assert.deepEqual(await memory.sendMail(CODE_MAIL), { ok: true, id: 'mem-2' });
    assert.equal(memory.outbox.length, 2);
});

test('메모리 발송기: 모르는 목적은 실패 넣기보다 먼저 던진다 (넣은 실패는 남음)', async () => {
    const memory = mail.createMemoryMailAdapter();
    memory.failNextWithResult();
    await assert.rejects(memory.sendMail({ ...CODE_MAIL, template: 'NOPE' }), /알 수 없는 메일 목적/);
    assert.deepEqual(await memory.sendMail(CODE_MAIL), { ok: false });
});

// ── 서비스 + 진짜 발송기 ──

const swapNodemailer = (t, createTransport) => {
    const nodemailer = require('nodemailer');
    const original = nodemailer.createTransport;
    nodemailer.createTransport = createTransport;
    t.after(() => { nodemailer.createTransport = original; });
};

test('서비스+SMTP: 환경에 SMTP 설정이 있으면 가입 인증번호 메일이 nodemailer 연결로 나간다', async (t) => {
    withEnv(t, {
        MAIL_SMTP_HOST: 'smtp.gmail.com', MAIL_SMTP_PORT: '465', MAIL_SMTP_USER: 'sender@example.test', MAIL_SMTP_PASS: 'abcd efgh ijkl mnop',
        PASSWORD_RESET_MAIL_FROM: 'sender@example.test', SIGNUP_EMAIL_HMAC_SECRET: 'audit-mail-hmac-secret-0123456789',
    });
    useAuthStore(t);
    const smtp = fakeSmtp();
    swapNodemailer(t, smtp.createTransport);
    const result = await verification.requestSignupCode({ email: 'Joiner@Example.test' });
    assert.equal(result.ok, true);
    assert.equal(smtp.created.length, 1);
    assert.equal(smtp.created[0].options.secure, true);
    const message = smtp.created[0].sent[0];
    assert.equal(message.to, 'joiner@example.test');
    assert.equal(message.subject, '[가면무도회 살인사건] 가입 인증번호');
    assert.match(message.text, /\n\d{6}\n/);
    assert.equal(smtp.created[0].closed, true);
});

test('서비스+SMTP: SMTP가 받는 주소를 거절해도 가입 인증번호 요청은 같은 ok', async (t) => {
    withEnv(t, {
        MAIL_SMTP_HOST: 'smtp.gmail.com', MAIL_SMTP_USER: 'sender@example.test', MAIL_SMTP_PASS: 'pw', PASSWORD_RESET_MAIL_FROM: 'sender@example.test',
        SIGNUP_EMAIL_HMAC_SECRET: 'audit-mail-hmac-secret-0123456789',
    });
    useAuthStore(t);
    swapNodemailer(t, fakeSmtp(async (m) => ({ accepted: [], rejected: [m.to] })).createTransport);
    assert.deepEqual(await verification.requestSignupCode({ email: 'nobody@example.test' }), { ok: true, resendAfterSec: 60, expiresInSec: 600 });
});

test('서비스+SMTP: 비번 재설정 메일 본문 링크의 토큰 해시가 저장된 토큰 해시와 같다', async (t) => {
    withEnv(t, {
        MAIL_SMTP_HOST: 'smtp.gmail.com', MAIL_SMTP_USER: 'sender@example.test', MAIL_SMTP_PASS: 'pw', PASSWORD_RESET_MAIL_FROM: 'sender@example.test',
        PASSWORD_RESET_APP_URL: 'https://play.example.com/',
    });
    const store = useAuthStore(t);
    store.data.users.push({ uuid: 'u-1', email: 'me@example.test', has_local_password: true });
    const smtp = fakeSmtp();
    swapNodemailer(t, smtp.createTransport);
    await passwordReset.requestPasswordReset({ email: 'me@example.test' });
    const message = smtp.created[0].sent[0];
    const link = message.text.split('\n').find((line) => line.startsWith('https://'));
    const token = new URL(link).searchParams.get('token');
    const crypto = require('node:crypto');
    assert.equal(store.data.resetTokens[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'));
    assert.equal(message.subject, '[가면무도회 살인사건] 비밀번호 재설정 안내');
});

test('서비스+게이트웨이: SMTP 설정이 없고 게이트웨이 주소가 http면 안 보내지만 요청 응답은 같다', async (t) => {
    withEnv(t, {
        PASSWORD_RESET_MAIL_GATEWAY_URL: 'http://mail.example.test/emails', PASSWORD_RESET_MAIL_GATEWAY_TOKEN: 'tok', PASSWORD_RESET_MAIL_FROM: 'a@example.test',
        SIGNUP_EMAIL_HMAC_SECRET: 'audit-mail-hmac-secret-0123456789',
    });
    useAuthStore(t);
    let smtpUsed = false;
    swapNodemailer(t, () => { smtpUsed = true; throw new Error('SMTP를 쓰면 안 됨'); });
    assert.equal(mail.pickSender(), 'gateway');
    assert.equal((await verification.requestSignupCode({ email: 'g@example.test' })).ok, true);
    assert.equal(smtpUsed, false);
});

test('서비스+SMTP: 소셜 전용 계정 재설정 요청은 안내 메일 한 통, 링크 없음', async (t) => {
    withEnv(t, {
        MAIL_SMTP_HOST: 'smtp.gmail.com', MAIL_SMTP_USER: 'sender@example.test', MAIL_SMTP_PASS: 'pw', PASSWORD_RESET_MAIL_FROM: 'sender@example.test',
        PASSWORD_RESET_APP_URL: 'https://play.example.com',
    });
    const store = useAuthStore(t);
    store.data.users.push({ uuid: 'u-1', email: 'social@example.test', has_local_password: false });
    const smtp = fakeSmtp();
    swapNodemailer(t, smtp.createTransport);
    await passwordReset.requestPasswordReset({ email: 'social@example.test' });
    assert.equal(smtp.created.length, 1);
    assert.equal(smtp.created[0].sent[0].subject, '[가면무도회 살인사건] 계정 안내');
    assert.doesNotMatch(smtp.created[0].sent[0].text, /https?:\/\//);
});

// ── 실제 Gmail 발송 (RUN_LIVE_MAIL=1일 때만, 받는 곳 하나 고정) ──

const LIVE_MAIL_TO = 'minsang580@gmail.com';

// .env에서 메일 설정 줄만 읽음 (DB 주소 등은 안 읽음)
const readLiveMailEnv = () => {
    try {
        const text = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
        const env = {};
        for (const line of text.split(/\r?\n/)) {
            const match = /^\s*(MAIL_SMTP_HOST|MAIL_SMTP_PORT|MAIL_SMTP_USER|MAIL_SMTP_PASS|PASSWORD_RESET_MAIL_FROM)\s*=\s*(.*?)\s*$/.exec(line);
            if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
        return env.MAIL_SMTP_HOST && env.MAIL_SMTP_USER && env.MAIL_SMTP_PASS && env.PASSWORD_RESET_MAIL_FROM ? env : null;
    } catch {
        return null;
    }
};
const liveMailSkip = process.env.RUN_LIVE_MAIL !== '1'
    ? 'RUN_LIVE_MAIL=1일 때만 실제 메일 1통'
    : (readLiveMailEnv() ? false : '.env에 SMTP 설정이 없음');

test(`실제 Gmail: ${LIVE_MAIL_TO} 한 곳으로 가입 인증번호 메일 1통이 받아진다`, { skip: liveMailSkip, timeout: 30_000 }, async () => {
    const env = readLiveMailEnv();
    const adapter = mail.createSmtpMailAdapter({
        host: env.MAIL_SMTP_HOST, port: env.MAIL_SMTP_PORT, user: env.MAIL_SMTP_USER, pass: env.MAIL_SMTP_PASS,
        from: env.PASSWORD_RESET_MAIL_FROM, timeoutMs: 20_000,
    });
    const result = await adapter.sendMail({ to: LIVE_MAIL_TO, template: 'SIGNUP_CODE', params: { code: '000000', expiresInSec: 600 } });
    assert.equal(result.ok, true);
});

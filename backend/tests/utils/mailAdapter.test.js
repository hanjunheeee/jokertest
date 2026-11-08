'use strict';

// 메일 발송기 시험: 문구 이름 · 발송기 고르기 · 게이트웨이(성공·실패·시간 초과) · SMTP(성공·실패·시간 초과) · 메모리
// 진짜 메일은 안 보냄 (전송 바꿔 끼우기 + 로컬 https 서버만)
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const mail = require('../../utils/adapters/mail');
const { httpsTransport } = require('../../utils/adapters/mailSenders/gateway');
const { readPort } = require('../../utils/adapters/mailSenders/smtp');

const GATEWAY = { gatewayUrl: 'https://mail.example.test/emails', gatewayToken: 'tok_test_value', from: '가면무도회 <no-reply@example.test>' };
const SMTP = { host: 'smtp.gmail.com', port: '465', user: 'me@example.test', pass: 'abcd efgh ijkl mnop', from: '가면무도회 <me@example.test>' };
const RESET = { to: 'player@example.test', template: 'PASSWORD_RESET', params: { resetUrl: 'https://app.example.test/password-reset?token=abc' } };

// 부른 기록을 남기는 가짜 전송
const recordingTransport = (response) => {
    const calls = [];
    const transport = async (target, request) => {
        calls.push({ target: target.toString(), ...request });
        if (typeof response === 'function') return response();
        return response;
    };
    return { calls, transport };
};

// 가짜 SMTP 연결 (보낸 편지·닫기 기록)
const fakeSmtp = (sendImpl) => {
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

test('메일 제목은 게임 이름 [가면무도회 살인사건]으로 시작하고 옛 이름은 없다', () => {
    for (const template of mail.TEMPLATES) {
        const { subject } = mail.renderTemplate(template, { resetUrl: 'https://x.test/r', code: '123456', expiresInSec: 600 });
        assert.ok(subject.startsWith('[가면무도회 살인사건] '), subject);
        assert.ok(!subject.includes('Joker'));
    }
});

test('발송기 고르기: MAIL_SMTP_HOST가 비지 않았을 때만 SMTP', () => {
    assert.equal(mail.pickSender({}), 'gateway');
    assert.equal(mail.pickSender({ MAIL_SMTP_HOST: '   ' }), 'gateway');
    assert.equal(mail.pickSender({ MAIL_SMTP_HOST: 'smtp.gmail.com' }), 'smtp');
});

test('게이트웨이 성공: https 주소로 Bearer·User-Agent·JSON 본문을 보내고 메일 id를 돌려준다', async () => {
    const fake = recordingTransport({ status: 200, bodyText: '{"id":"msg_123"}' });
    const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, transport: fake.transport, timeoutMs: 1234 });

    assert.deepEqual(await adapter.sendMail(RESET), { ok: true, id: 'msg_123' });
    assert.equal(fake.calls.length, 1);
    const [call] = fake.calls;
    assert.equal(call.target, GATEWAY.gatewayUrl);
    assert.equal(call.timeoutMs, 1234);
    assert.equal(call.headers.authorization, `Bearer ${GATEWAY.gatewayToken}`);
    assert.equal(call.headers['content-type'], 'application/json');
    assert.ok(call.headers['user-agent']);
    const body = JSON.parse(call.body);
    assert.deepEqual(Object.keys(body).sort(), ['from', 'subject', 'text', 'to']);
    assert.equal(body.to, RESET.to);
    assert.equal(body.from, GATEWAY.from);
    assert.ok(body.text.includes(RESET.params.resetUrl));
});

test('게이트웨이 실패: 2xx 아님·전송 오류·이상한 응답은 { ok: false }만, 원인은 안 드러냄', async () => {
    for (const response of [{ status: 401, bodyText: '{"message":"bad key"}' }, { status: 500, bodyText: '' }, null, { status: 'x' }]) {
        const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport(response).transport });
        assert.deepEqual(await adapter.sendMail(RESET), { ok: false });
    }
    const throwing = mail.createGatewayMailAdapter({ ...GATEWAY, transport: async () => { throw new Error('secret detail'); } });
    assert.deepEqual(await throwing.sendMail(RESET), { ok: false });
    // 성공인데 id 없으면 ok만
    const noId = mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport({ status: 202, bodyText: 'accepted' }).transport });
    assert.deepEqual(await noId.sendMail(RESET), { ok: true });
});

test('게이트웨이: 설정 빠짐·http 주소·틀린 받는 주소면 전송을 부르지 않고, 모르는 목적은 던진다', async () => {
    const cases = [
        [{ ...GATEWAY, gatewayUrl: '' }, RESET],
        [{ ...GATEWAY, gatewayToken: undefined }, RESET],
        [{ ...GATEWAY, from: ' ' }, RESET],
        [{ ...GATEWAY, gatewayUrl: 'http://mail.example.test/emails' }, RESET],
        [{ ...GATEWAY, gatewayUrl: 'not a url' }, RESET],
        [GATEWAY, { ...RESET, to: '' }],
        [GATEWAY, { ...RESET, to: 'a@b.test\r\nBcc: x@y.test' }],
        [GATEWAY, { ...RESET, to: 'no-at-sign' }],
    ];
    for (const [options, message] of cases) {
        const fake = recordingTransport({ status: 200, bodyText: '{}' });
        const adapter = mail.createGatewayMailAdapter({ ...options, transport: fake.transport });
        assert.deepEqual(await adapter.sendMail(message), { ok: false });
        assert.equal(fake.calls.length, 0);
    }
    const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, transport: recordingTransport({ status: 200 }).transport });
    await assert.rejects(adapter.sendMail({ ...RESET, template: 'NOPE' }), /알 수 없는 메일 목적/);
});

test('게이트웨이 기본 전송: 연결만 받고 답이 없는 서버는 시간 초과로 { ok: false }', async () => {
    const sockets = new Set();
    const server = net.createServer((socket) => { sockets.add(socket); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const { port } = server.address();
        const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, gatewayUrl: `https://127.0.0.1:${port}/emails`, timeoutMs: 300 });
        const started = Date.now();
        assert.deepEqual(await adapter.sendMail(RESET), { ok: false });
        assert.ok(Date.now() - started < 3000, '시간 한도 안에 끝나야 함');
    } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => server.close(resolve));
    }
});

// 로컬 https 서버용 임시 인증서 (openssl 없으면 그 시험만 건너뜀)
const makeSelfSignedCert = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-gw-'));
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    const run = spawnSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
        '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    ], { encoding: 'utf8' });
    if (run.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; }
    const result = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
};

test('게이트웨이 기본 전송: 로컬 https 서버에 진짜로 POST하고 2xx·4xx를 구분한다', async (t) => {
    const pair = makeSelfSignedCert();
    if (!pair) { t.skip('openssl 없음'); return; }
    const received = [];
    let nextStatus = 200;
    const server = https.createServer(pair, (req, res) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
            res.writeHead(nextStatus, { 'content-type': 'application/json' });
            res.end(nextStatus === 200 ? '{"id":"local-1"}' : '{"message":"invalid"}');
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    // 이 시험 동안만 임시 인증서를 믿음
    const previousCa = https.globalAgent.options.ca;
    https.globalAgent.options.ca = pair.cert;
    try {
        const { port } = server.address();
        const adapter = mail.createGatewayMailAdapter({ ...GATEWAY, gatewayUrl: `https://127.0.0.1:${port}/emails`, timeoutMs: 3000 });
        assert.deepEqual(await adapter.sendMail(RESET), { ok: true, id: 'local-1' });
        nextStatus = 422;
        assert.deepEqual(await adapter.sendMail(RESET), { ok: false });
        assert.equal(received.length, 2);
        assert.equal(received[0].method, 'POST');
        assert.equal(received[0].url, '/emails');
        assert.equal(received[0].auth, `Bearer ${GATEWAY.gatewayToken}`);
        assert.equal(received[0].body.to, RESET.to);
    } finally {
        https.globalAgent.options.ca = previousCa;
        https.globalAgent.destroy();
        await new Promise((resolve) => server.close(resolve));
    }
});

test('httpsTransport: 연결 거절은 null', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    const result = await httpsTransport(new URL(`https://127.0.0.1:${port}/`), { headers: {}, body: '{}', timeoutMs: 2000 });
    assert.equal(result, null);
});

test('SMTP 성공: 465는 처음부터 암호화, Gmail 앱 비밀번호 빈칸은 빼고, 보낸 뒤 연결을 닫는다', async () => {
    const fake = fakeSmtp((message) => ({ accepted: [message.to], rejected: [] }));
    const adapter = mail.createSmtpMailAdapter({ ...SMTP, createTransport: fake.createTransport, timeoutMs: 2000 });

    assert.deepEqual(await adapter.sendMail(RESET), { ok: true });
    const [record] = fake.created;
    assert.equal(record.options.host, 'smtp.gmail.com');
    assert.equal(record.options.port, 465);
    assert.equal(record.options.secure, true);
    assert.equal(record.options.requireTLS, false);
    assert.deepEqual(record.options.auth, { user: SMTP.user, pass: 'abcdefghijklmnop' });
    assert.equal(record.options.connectionTimeout, 2000);
    assert.equal(record.sent.length, 1);
    assert.equal(record.sent[0].from, SMTP.from);
    assert.equal(record.sent[0].to, RESET.to);
    assert.ok(record.sent[0].subject.startsWith('[가면무도회 살인사건]'));
    assert.ok(record.closed);
});

test('SMTP 587은 STARTTLS 필수, 포트 비면 465, 이상한 포트는 안 보냄', async () => {
    const fake = fakeSmtp((message) => ({ accepted: [message.to], rejected: [] }));
    await mail.createSmtpMailAdapter({ ...SMTP, port: '587', createTransport: fake.createTransport }).sendMail(RESET);
    assert.equal(fake.created[0].options.secure, false);
    assert.equal(fake.created[0].options.requireTLS, true);
    assert.equal(readPort(undefined), 465);
    assert.equal(readPort(''), 465);
    assert.equal(readPort('abc'), null);
    assert.equal(readPort('70000'), null);
    const bad = fakeSmtp(() => ({ accepted: ['x'] }));
    assert.deepEqual(await mail.createSmtpMailAdapter({ ...SMTP, port: 'abc', createTransport: bad.createTransport }).sendMail(RESET), { ok: false });
    assert.equal(bad.created.length, 0);
});

test('SMTP 실패: 보내기 오류·받는 주소 거절·빈 결과는 { ok: false }, 연결은 닫는다', async () => {
    const impls = [
        () => { throw Object.assign(new Error('Invalid login: 535 secret'), { code: 'EAUTH' }); },
        (message) => ({ accepted: [], rejected: [message.to] }),
        () => null,
    ];
    for (const impl of impls) {
        const fake = fakeSmtp(impl);
        const result = await mail.createSmtpMailAdapter({ ...SMTP, createTransport: fake.createTransport }).sendMail(RESET);
        assert.deepEqual(result, { ok: false });
        assert.ok(fake.created[0].closed);
    }
    const throwingCreate = mail.createSmtpMailAdapter({ ...SMTP, createTransport: () => { throw new Error('bad options'); } });
    assert.deepEqual(await throwingCreate.sendMail(RESET), { ok: false });
});

test('SMTP 시간 초과: 답이 안 오면 한도 뒤 { ok: false }', async () => {
    const fake = fakeSmtp(() => new Promise(() => {}));
    const adapter = mail.createSmtpMailAdapter({ ...SMTP, createTransport: fake.createTransport, timeoutMs: 100 });
    const started = Date.now();
    assert.deepEqual(await adapter.sendMail(RESET), { ok: false });
    assert.ok(Date.now() - started < 2000);
    assert.ok(fake.created[0].closed);
});

test('SMTP: 설정 빠짐·틀린 받는 주소면 연결을 만들지 않고, 모르는 목적은 던진다', async () => {
    for (const [options, message] of [
        [{ ...SMTP, host: '' }, RESET], [{ ...SMTP, user: undefined }, RESET], [{ ...SMTP, pass: '' }, RESET],
        [{ ...SMTP, from: undefined }, RESET], [SMTP, { ...RESET, to: 'x\n@y' }],
    ]) {
        const fake = fakeSmtp(() => ({ accepted: ['x'] }));
        assert.deepEqual(await mail.createSmtpMailAdapter({ ...options, createTransport: fake.createTransport }).sendMail(message), { ok: false });
        assert.equal(fake.created.length, 0);
    }
    const fake = fakeSmtp(() => ({ accepted: ['x'] }));
    await assert.rejects(mail.createSmtpMailAdapter({ ...SMTP, createTransport: fake.createTransport }).sendMail({ ...RESET, template: 'NOPE' }));
});

test('SMTP: 진짜 nodemailer 연결 옵션으로 만들어지고 닫힌다 (보내지는 않음)', () => {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host: '127.0.0.1', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
    assert.equal(typeof transporter.sendMail, 'function');
    transporter.close();
});

test('createHttpMailAdapter: 환경에 MAIL_SMTP_HOST가 있으면 SMTP 발송기, 없으면 게이트웨이 발송기', async (t) => {
    const saved = process.env.MAIL_SMTP_HOST;
    t.after(() => { if (saved === undefined) delete process.env.MAIL_SMTP_HOST; else process.env.MAIL_SMTP_HOST = saved; });

    process.env.MAIL_SMTP_HOST = 'smtp.gmail.com';
    const smtpFake = fakeSmtp((message) => ({ accepted: [message.to], rejected: [] }));
    assert.deepEqual(await mail.createHttpMailAdapter({ ...SMTP, createTransport: smtpFake.createTransport }).sendMail(RESET), { ok: true });
    assert.equal(smtpFake.created.length, 1);

    delete process.env.MAIL_SMTP_HOST;
    const gatewayFake = recordingTransport({ status: 200, bodyText: '{"id":"g1"}' });
    assert.deepEqual(await mail.createHttpMailAdapter({ ...GATEWAY, transport: gatewayFake.transport }).sendMail(RESET), { ok: true, id: 'g1' });
    assert.equal(gatewayFake.calls.length, 1);
});

test('메모리 발송기: 보낸 메일을 쌓고 다음 한 번 실패를 넣을 수 있다', async () => {
    const memory = mail.createMemoryMailAdapter();
    assert.deepEqual(await memory.sendMail(RESET), { ok: true, id: 'mem-1' });
    memory.failNextWithResult();
    assert.deepEqual(await memory.sendMail(RESET), { ok: false });
    memory.failNextWithThrow();
    await assert.rejects(memory.sendMail(RESET));
    assert.equal(memory.outbox.length, 1);
    await assert.rejects(memory.sendMail({ ...RESET, template: 'NOPE' }));
});

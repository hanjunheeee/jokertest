'use strict';

// 관리자 인증 부품 시험 (AD-015·016·027·033), OTP 계산·OTP 비밀 잠금·쓰기 확인(CSRF)·관리자 조회 줄
// DB 안 씀, 함수·미들웨어를 바로 부름
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const totp = require('../../admin/services/core/totp');
const secretBox = require('../../admin/services/core/secretBox');

// RFC 6238 부록 B 시험 값 (SHA-1, 비밀 "12345678901234567890"), 8자리 값의 뒤 6자리
const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
];

test('AD-015: OTP — RFC 6238 시험 값 그대로', () => {
    for (const [seconds, code] of RFC_VECTORS) {
        assert.equal(totp.codeAt(RFC_SECRET, seconds * 1000), code, `T=${seconds}`);
    }
});

test('AD-015: OTP — 앞뒤 30초(한 칸)까지 받음, 60초 밖은 거절, 맞은 칸 번호 돌려줌', () => {
    const nowMs = 1_234_567_890_000;
    const step = Math.floor(nowMs / 30000);
    const at = (offsetSec) => totp.codeAt(RFC_SECRET, nowMs + offsetSec * 1000);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: at(0), nowMs }), step);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: at(-30), nowMs }), step - 1);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: at(30), nowMs }), step + 1);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: at(-60), nowMs }), null);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: at(60), nowMs }), null);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: '12345', nowMs }), null);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: 'abcdef', nowMs }), null);
});

test('AD-015: OTP — 이미 쓴 칸 번호 이하는 거절 (같은 번호 다시 못 씀)', () => {
    const nowMs = 1_700_000_000_000;
    const step = Math.floor(nowMs / 30000);
    const code = totp.codeAt(RFC_SECRET, nowMs);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code, nowMs, lastStep: step - 1 }), step);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code, nowMs, lastStep: step }), null);
    // 앞 칸 번호도 이미 지난 칸이면 거절
    const previous = totp.codeAt(RFC_SECRET, nowMs - 30000);
    assert.equal(totp.verifyTotp({ secret: RFC_SECRET, code: previous, nowMs, lastStep: step - 1 }), null);
});

test('AD-015: 새 비밀은 base32 32자, otpauth 주소에 비밀·발급자', () => {
    const secret = totp.generateSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(totp.base32Encode(totp.base32Decode(secret)), secret);
    const url = totp.otpauthUrl({ secret, account: 'boss', issuer: 'MMC 관리자' });
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.ok(url.includes(`secret=${secret}`));
    assert.ok(url.includes('issuer='));
});

const KEY = Buffer.from('c'.repeat(64), 'hex');

test('AD-016: OTP 비밀 잠금 → 풀기 같음, 모양 v1:iv:tag:암호문, 잠글 때마다 다름', () => {
    const sealed = secretBox.seal('JBSWY3DPEHPK3PXP', KEY);
    assert.match(sealed, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'));
    assert.notEqual(secretBox.seal('JBSWY3DPEHPK3PXP', KEY), sealed);
    assert.equal(secretBox.open(sealed, KEY), 'JBSWY3DPEHPK3PXP');
});

test('AD-016: 다른 열쇠·고친 암호문·고친 tag·모양 틀림 → 실패', () => {
    const sealed = secretBox.seal('JBSWY3DPEHPK3PXP', KEY);
    const otherKey = Buffer.from('d'.repeat(64), 'hex');
    assert.throws(() => secretBox.open(sealed, otherKey));
    const [v, iv, tag, body] = sealed.split(':');
    const flip = (text) => {
        const bytes = Buffer.from(text, 'base64url');
        bytes[0] ^= 1;
        return bytes.toString('base64url');
    };
    assert.throws(() => secretBox.open([v, iv, tag, flip(body)].join(':'), KEY));
    assert.throws(() => secretBox.open([v, iv, flip(tag), body].join(':'), KEY));
    assert.throws(() => secretBox.open(`v2:${iv}:${tag}:${body}`, KEY));
    assert.throws(() => secretBox.open('JBSWY3DPEHPK3PXP', KEY));
    assert.throws(() => secretBox.seal('x', Buffer.alloc(16)));
});

// CSRF 확인을 바로 부름 → 넘긴 오류(없으면 null)
const runCsrf = (request) => {
    const { requireCsrf } = require('../../admin/middlewares/csrf.middleware');
    const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const req = { method: request.method, cookies: request.cookies ?? {}, get: (name) => headers[name.toLowerCase()] };
    let passed;
    requireCsrf(req, {}, (error) => { passed = error ?? null; });
    return passed;
};

test('AD-027: 쓰기에 CSRF 머리글 없음·틀림 → 403, Origin 다름·없음 → 403, 맞으면 통과, GET은 머리글 없어도 됨', (t) => {
    const saved = process.env.ADMIN_ORIGIN;
    process.env.ADMIN_ORIGIN = 'https://admin.example.com';
    t.after(() => { if (saved === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = saved; });
    const { csrfTokenOf, SESSION_COOKIE } = require('../../admin/services/core/session');
    const raw = crypto.randomBytes(32).toString('base64url');
    const cookies = { [SESSION_COOKIE]: raw };
    const good = { 'X-Admin-Csrf': csrfTokenOf(raw), Origin: 'https://admin.example.com' };

    assert.equal(runCsrf({ method: 'POST', cookies, headers: good }), null);
    assert.equal(runCsrf({ method: 'GET', cookies, headers: {} }), null);

    const cases = {
        '머리글 없음': { ...good, 'X-Admin-Csrf': undefined },
        '머리글 틀림': { ...good, 'X-Admin-Csrf': csrfTokenOf('another-session') },
        'Origin 다름': { ...good, Origin: 'https://example.com' },
        'Origin 없음': { ...good, Origin: undefined },
    };
    for (const [label, headers] of Object.entries(cases)) {
        for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
            const error = runCsrf({ method, cookies, headers });
            assert.equal(error?.status, 403, `${label} ${method}`);
            assert.equal(error?.code, 'ADMIN_CSRF_FAILED', `${label} ${method}`);
        }
    }
    // 쿠키 없음
    assert.equal(runCsrf({ method: 'POST', cookies: {}, headers: good })?.code, 'ADMIN_CSRF_FAILED');
    // ADMIN_ORIGIN 안 넣으면 쓰기 전부 막힘
    delete process.env.ADMIN_ORIGIN;
    assert.equal(runCsrf({ method: 'POST', cookies, headers: good })?.code, 'ADMIN_CSRF_FAILED');
});

test('AD-033: 조회 줄 — 동시에 둘 넣어도 하나씩 차례로', async () => {
    const { createQueryQueue } = require('../../admin/services/core/queryQueue');
    const queue = createQueryQueue();
    let running = 0;
    let maxRunning = 0;
    const order = [];
    const job = (name, ms) => async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, ms));
        order.push(name);
        running -= 1;
        return name;
    };
    const results = await Promise.all([queue.run(job('a', 30)), queue.run(job('b', 5)), queue.run(job('c', 1))]);
    assert.deepEqual(results, ['a', 'b', 'c']);
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.equal(maxRunning, 1);
    // 앞 일이 실패해도 줄은 계속
    await assert.rejects(queue.run(async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await queue.run(async () => 'next'), 'next');
});

test('AD-033: 조회 줄 — 기다림이 한도 넘으면 503 ADMIN_BUSY (앞 일은 그대로 끝남)', async () => {
    const { createQueryQueue } = require('../../admin/services/core/queryQueue');
    const queue = createQueryQueue({ waitLimitMs: 30 });
    const slow = queue.run(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 120)));
    let ranLate = false;
    await assert.rejects(queue.run(async () => { ranLate = true; }), (error) => error.status === 503 && error.code === 'ADMIN_BUSY');
    assert.equal(await slow, 'slow');
    assert.equal(ranLate, false, '포기한 일은 안 돎');
    assert.equal(await queue.run(async () => 'after'), 'after');
});

test('AD-033: 기본 한도는 10초', () => {
    const { WAIT_LIMIT_MS } = require('../../admin/services/core/queryQueue');
    assert.equal(WAIT_LIMIT_MS, 10_000);
});

test('AD-033: 시간 제한 넘은 조회(MySQL 3024) → 503 ADMIN_QUERY_TIMEOUT, 다른 오류는 그대로', async () => {
    const { createQueryQueue, withTimeoutHint } = require('../../admin/services/core/queryQueue');
    const queue = createQueryQueue();
    const timeout = Object.assign(new Error('Query execution was interrupted'), { parent: { errno: 3024 } });
    await assert.rejects(queue.run(async () => { throw timeout; }), (error) => error.status === 503 && error.code === 'ADMIN_QUERY_TIMEOUT');
    await assert.rejects(queue.run(async () => { throw new Error('other'); }), /other/);

    assert.equal(withTimeoutHint('SELECT id FROM users'), 'SELECT /*+ MAX_EXECUTION_TIME(3000) */ id FROM users');
    assert.equal(withTimeoutHint('  select count(*) from game_results', 5000), 'SELECT /*+ MAX_EXECUTION_TIME(5000) */ count(*) from game_results');
    assert.throws(() => withTimeoutHint('UPDATE users SET x = 1'));
});

'use strict';

// 회원 기능 시험: 이메일 바꾸기 (번호 보내기 검사·본인 확인·중복·대기 · 확인 틀린 횟수·만료·남의 번호 · 바꿈·옛 주소 알림 · 메일 문구 · 요청 수 제한)
// DB 안 씀 (가짜 저장소), 메일은 메모리 발송기, 시각은 넘겨주는 가짜 시계
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-member-email-secret';
process.env.SIGNUP_EMAIL_HMAC_SECRET = 'audit-member-email-hmac-0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');

const emailChange = require('../../services/auth/emailChange');
const mailAdapter = require('../../utils/adapters/mail');
const { renderTemplate } = require('../../utils/adapters/mailSenders/templates');
const { hashPassword } = require('../../utils/auth/credentials');
const { useAuthStore, createClock } = require('./authFakes');

const PASSWORD = 'password-123';
let passwordHash;
test.before(async () => { passwordHash = await hashPassword(PASSWORD); });

const setUp = (t, user = {}) => {
    const store = useAuthStore(t);
    const clock = createClock('2026-11-09T00:00:00.000Z');
    const mailer = mailAdapter.createMemoryMailAdapter();
    const me = {
        uuid: 'me-uuid', email: 'old@example.com', nickname: '나', password_hash: passwordHash, has_local_password: true, ...user,
    };
    store.data.users.push(me, { uuid: 'other-uuid', email: 'taken@example.com', nickname: '남' });
    const options = { mailAdapter: mailer, now: clock.now };
    const request = (body) => emailChange.requestEmailChangeCode({ uuid: 'me-uuid', currentPassword: PASSWORD, ...body }, options);
    const confirm = (body) => emailChange.confirmEmailChange({ uuid: 'me-uuid', ...body }, options);
    const lastCode = () => mailer.outbox.filter((m) => m.template === 'EMAIL_CHANGE_CODE').at(-1)?.params.code;
    return { store, clock, mailer, me, request, confirm, lastCode };
};
const rejectsCode = (promise, code, status) => assert.rejects(promise, (e) => {
    assert.equal(e.code, code);
    if (status !== undefined) assert.equal(e.status, status);
    return true;
});

// ── 번호 보내기 ──

test('이메일 바꾸기: 새 주소 모양이 틀리거나 쉼표·@ 두 개면 400 INVALID_INPUT, 메일 없음', async (t) => {
    const { request, mailer } = setUp(t);
    for (const newEmail of ['nope', 'a@b.com,c@d.com', 'a@b@c.com', '']) {
        await rejectsCode(request({ newEmail }), 'INVALID_INPUT', 400);
    }
    assert.equal(mailer.outbox.length, 0);
});

test('이메일 바꾸기: 비번 있는 계정은 현재 비번이 틀리면 400 CURRENT_PASSWORD_INVALID', async (t) => {
    const { request } = setUp(t);
    await rejectsCode(request({ newEmail: 'new@example.com', currentPassword: 'wrong-pass' }), 'CURRENT_PASSWORD_INVALID', 400);
    await rejectsCode(request({ newEmail: 'new@example.com', currentPassword: undefined }), 'CURRENT_PASSWORD_INVALID', 400);
});

test('이메일 바꾸기: 지금 주소와 같으면 EMAIL_SAME, 남이 쓰면 409 EMAIL_IN_USE (대소문자 무시)', async (t) => {
    const { request } = setUp(t);
    await rejectsCode(request({ newEmail: 'OLD@example.com' }), 'EMAIL_SAME', 400);
    await rejectsCode(request({ newEmail: 'Taken@Example.com' }), 'EMAIL_IN_USE', 409);
});

test('이메일 바꾸기: 성공하면 새 주소(소문자)로 번호 메일 한 통, 1분 안 다시 요청은 429 RESEND_TOO_SOON + 남은 초', async (t) => {
    const { request, mailer, clock } = setUp(t);
    const result = await request({ newEmail: ' New@Example.com ' });
    assert.deepEqual(result, { ok: true, expiresInSec: 600, resendAfterSec: 60 });
    assert.equal(mailer.outbox.length, 1);
    assert.equal(mailer.outbox[0].to, 'new@example.com');
    assert.match(mailer.outbox[0].params.code, /^\d{6}$/);

    clock.advance(20 * 1000);
    await assert.rejects(request({ newEmail: 'new@example.com' }), (e) => e.code === 'RESEND_TOO_SOON' && e.status === 429 && e.resendAfterSec === 40);
    clock.advance(40 * 1000);
    await request({ newEmail: 'new@example.com' });
    assert.equal(mailer.outbox.length, 2);
});

test('이메일 바꾸기: 소셜 전용 계정은 비번 없이 번호만으로 진행 (사용자 결정)', async (t) => {
    const { request, mailer } = setUp(t, { has_local_password: false });
    await request({ newEmail: 'new@example.com', currentPassword: undefined });
    assert.equal(mailer.outbox.length, 1);
});

test('이메일 바꾸기: 메일 못 보내면 503 MAIL_SEND_FAILED', async (t) => {
    const { request, mailer } = setUp(t);
    mailer.failNextWithResult();
    await rejectsCode(request({ newEmail: 'new@example.com' }), 'MAIL_SEND_FAILED', 503);
});

// ── 확인 ──

test('이메일 바꾸기 확인: 맞는 번호면 이메일 바뀌고 옛 주소로 가린 새 주소 알림', async (t) => {
    const { request, confirm, lastCode, me, mailer } = setUp(t);
    await request({ newEmail: 'brandnew@example.com' });
    const result = await confirm({ newEmail: 'brandnew@example.com', code: lastCode() });
    assert.deepEqual(result, { ok: true, email: 'brandnew@example.com' });
    assert.equal(me.email, 'brandnew@example.com');
    const notice = mailer.outbox.find((m) => m.template === 'EMAIL_CHANGED');
    assert.equal(notice.to, 'old@example.com');
    assert.equal(notice.params.maskedNewEmail, 'br******@example.com');
});

test('이메일 바꾸기 확인: 같은 번호 두 번째는 CODE_INVALID (한 번만)', async (t) => {
    const { request, confirm, lastCode } = setUp(t);
    await request({ newEmail: 'new@example.com' });
    const code = lastCode();
    await confirm({ newEmail: 'new@example.com', code });
    await rejectsCode(confirm({ newEmail: 'new@example.com', code }), 'CODE_INVALID');
});

test('이메일 바꾸기 확인: 틀리면 남은 횟수, 5번째 틀리면 TOO_MANY_ATTEMPTS, 그 뒤 맞는 번호도 거절', async (t) => {
    const { request, confirm, lastCode, me } = setUp(t);
    await request({ newEmail: 'new@example.com' });
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    await assert.rejects(confirm({ newEmail: 'new@example.com', code: wrong }), (e) => e.code === 'CODE_INVALID' && e.attemptsRemaining === 4);
    for (let i = 0; i < 3; i += 1) await rejectsCode(confirm({ newEmail: 'new@example.com', code: wrong }), 'CODE_INVALID');
    await rejectsCode(confirm({ newEmail: 'new@example.com', code: wrong }), 'TOO_MANY_ATTEMPTS');
    await rejectsCode(confirm({ newEmail: 'new@example.com', code: right }), 'TOO_MANY_ATTEMPTS');
    assert.equal(me.email, 'old@example.com');
});

test('이메일 바꾸기 확인: 10분 지나면 CODE_EXPIRED', async (t) => {
    const { request, confirm, lastCode, clock } = setUp(t);
    await request({ newEmail: 'new@example.com' });
    clock.advance(10 * 60 * 1000);
    await rejectsCode(confirm({ newEmail: 'new@example.com', code: lastCode() }), 'CODE_EXPIRED');
});

test('이메일 바꾸기 확인: 같은 새 주소를 남이 받은 번호로는 내 이메일을 못 바꿈', async (t) => {
    const { request, lastCode, me } = setUp(t);
    await request({ newEmail: 'new@example.com' });
    const myCode = lastCode();
    // 다른 사람이 같은 주소로 번호를 받으면 세대가 바뀌어 내 번호는 무효, 남의 번호도 내 uuid로는 안 맞음
    await emailChange.confirmEmailChange({ uuid: 'other-uuid', newEmail: 'new@example.com', code: myCode }, { now: () => new Date('2026-11-09T00:00:10Z') })
        .then(() => assert.fail('남이 내 번호로 바꿈'), (e) => assert.equal(e.code, 'CODE_INVALID'));
    assert.equal(me.email, 'old@example.com');
});

test('이메일 바꾸기 확인: 번호 받은 사이 그 주소로 남이 가입했으면 409 EMAIL_IN_USE', async (t) => {
    const { request, confirm, lastCode, store, me } = setUp(t);
    await request({ newEmail: 'new@example.com' });
    store.data.users.push({ uuid: 'late-uuid', email: 'new@example.com', nickname: '늦게' });
    await rejectsCode(confirm({ newEmail: 'new@example.com', code: lastCode() }), 'EMAIL_IN_USE', 409);
    assert.equal(me.email, 'old@example.com');
});

test('이메일 바꾸기 확인: 번호 모양이 틀리면 DB 안 가고 INVALID_INPUT', async (t) => {
    const { confirm, store } = setUp(t);
    await rejectsCode(confirm({ newEmail: 'new@example.com', code: '12ab' }), 'INVALID_INPUT', 400);
    assert.equal(store.names().includes('withTransaction'), false);
});

// ── 메일 문구·요청 수 제한 ──

test('메일 문구: 이메일 바꾸기 번호·바뀜 알림 두 목적이 있고 번호·가린 주소가 들어감', () => {
    const code = renderTemplate('EMAIL_CHANGE_CODE', { code: '123456', expiresInSec: 600 });
    assert.match(code.subject, /이메일 변경 인증번호/);
    assert.match(code.text, /123456/);
    assert.match(code.text, /10분/);
    const changed = renderTemplate('EMAIL_CHANGED', { maskedNewEmail: 'ab**@x.com' });
    assert.match(changed.text, /ab\*\*@x\.com/);
    assert.equal(mailAdapter.TEMPLATES.has('EMAIL_CHANGED'), true);
});

test('이메일 바꾸기 경로: 번호 보내기는 한 사람 1시간 5번까지, 6번째는 429 (다른 사람은 따로 셈)', async () => {
    const routes = require('../../routes/user.routes');
    const layer = routes.stack.find((l) => l.route?.path === '/me/email/code');
    assert.ok(layer, '경로 있음');
    assert.equal(layer.route.stack[0].handle, require('../../middlewares/auth.middleware').verifyToken);
    const limiter = layer.route.stack[1].handle;
    const run = (uuid) => {
        let status = 200;
        let passed = false;
        const res = { status: (s) => { status = s; return res; }, json: () => res };
        limiter({ user: { uuid } }, res, () => { passed = true; });
        return passed ? 200 : status;
    };
    // 시험 uuid는 다른 시험과 안 겹치게 새로
    const statuses = Array.from({ length: 6 }, () => run('limit-me'));
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    assert.equal(run('limit-other'), 200);
});

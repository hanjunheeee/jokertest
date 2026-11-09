'use strict';

// 인증 시험: 가입 이메일 인증(번호 보내기·확인·증명 소비) · 이메일 가입 · 비번 재설정(요청·링크 확인·새 비번) · 아이디 찾기
// DB 안 씀 (가짜 저장소), 메일은 메모리 발송기, 시각은 넘겨주는 가짜 시계
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-auth-email-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const verification = require('../../services/auth/signupEmailVerification');
const passwordReset = require('../../services/auth/passwordReset');
const accountRecovery = require('../../services/auth/accountRecovery');
const authService = require('../../services/auth/account');
const economyService = require('../../services/economy');
const mailAdapter = require('../../utils/adapters/mail');
const { hashCode } = require('../../services/auth/signupEmailVerification/codes');
const { buildResetUrl } = require('../../services/auth/passwordReset/tokens');
const { getSignupEmailConfig } = require('../../config/signupEmailVerification');
const { useAuthStore, swap, createClock, uniqueError } = require('./authFakes');
// 약관 동의·만 14세 검사는 통과로 (그 검사는 member-약관 시험 몫)
require('../helpers/termsStub').passSignupTermsForFile();

const SECRET = 'audit-signup-hmac-secret-0123456789';
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const withEnv = (t, values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

const setUp = (t, env = {}) => {
    withEnv(t, {
        SIGNUP_EMAIL_HMAC_SECRET: SECRET, SIGNUP_EMAIL_CODE_LENGTH: undefined, SIGNUP_EMAIL_RESEND_COOLDOWN_MS: undefined,
        SIGNUP_EMAIL_CODE_TTL_MS: undefined, SIGNUP_EMAIL_MAX_ATTEMPTS: undefined, SIGNUP_EMAIL_PROOF_TTL_MS: undefined, ...env,
    });
    const clock = createClock('2026-11-09T03:00:00.000Z');
    const store = useAuthStore(t, { clock: clock.now });
    const mail = mailAdapter.createMemoryMailAdapter();
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    return { store, clock, mail };
};

const requestCode = (ctx, email = 'new@example.com') => verification.requestSignupCode({ email }, { mailAdapter: ctx.mail, now: ctx.clock.now });
const verifyCode = (ctx, code, email = 'new@example.com') => verification.verifySignupCode({ email, code }, { now: ctx.clock.now });
const lastCode = (ctx) => ctx.mail.outbox.at(-1).params.code;
const wrongCodeFor = (code) => (code === '000000' ? '111111' : '000000');

// ── 인증번호 보내기 ──

test('인증번호: HMAC 비밀키가 없거나 16자보다 짧으면 500 SIGNUP_EMAIL_CONFIG_INVALID, 메일 안 감', async (t) => {
    const ctx = setUp(t, { SIGNUP_EMAIL_HMAC_SECRET: 'short-secret-15c' .slice(0, 15) });
    await assert.rejects(requestCode(ctx), (e) => e.status === 500 && e.code === 'SIGNUP_EMAIL_CONFIG_INVALID');
    assert.equal(ctx.mail.outbox.length, 0);
    delete process.env.SIGNUP_EMAIL_HMAC_SECRET;
    await assert.rejects(requestCode(ctx), (e) => e.code === 'SIGNUP_EMAIL_CONFIG_INVALID');
});

test('인증번호: 첫 요청은 세대 1·6자리 번호 메일, 행엔 번호 해시만, 응답 60초·600초', async (t) => {
    const ctx = setUp(t);
    const result = await requestCode(ctx);
    assert.deepEqual(result, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
    const code = lastCode(ctx);
    assert.match(code, /^\d{6}$/);
    const row = ctx.store.data.verifications[0];
    assert.equal(row.generation, 1);
    assert.equal(row.code_hash, hashCode('new@example.com', 1, code, SECRET));
    assert.equal(JSON.stringify(row).includes(code), false);
    assert.equal(ctx.mail.outbox[0].template, 'SIGNUP_CODE');
    assert.equal(ctx.mail.outbox[0].params.expiresInSec, 600);
});

test('인증번호: 대문자·공백 섞인 주소도 소문자 주소 하나로 행·메일', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx, '  New@Example.COM ');
    assert.equal(ctx.store.data.verifications[0].email, 'new@example.com');
    assert.equal(ctx.mail.outbox[0].to, 'new@example.com');
});

test('인증번호: 60초 안에 다시 요청하면 RESEND_TOO_SOON과 남은 초 (30초 지남 → 30)', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    ctx.clock.advance(30_000);
    assert.deepEqual(await requestCode(ctx), { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: 30 });
    ctx.clock.advance(29_500);
    assert.equal((await requestCode(ctx)).resendAfterSec, 1);
    assert.equal(ctx.mail.outbox.length, 1);
});

test('인증번호: 60초 지나 다시 보내면 세대 2, 틀린 횟수 0, 옛 증명 지움', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    await verifyCode(ctx, wrongCodeFor(lastCode(ctx)));
    ctx.clock.advance(60_000);
    await requestCode(ctx);
    const row = ctx.store.data.verifications[0];
    assert.equal(row.generation, 2);
    assert.equal(row.attempts, 0);
    assert.equal(row.proof_hash, null);
    assert.equal(ctx.mail.outbox.length, 2);
});

test('인증번호: 이미 가입한 이메일은 같은 응답이지만 메일·번호가 없다 (가입 여부 숨김)', async (t) => {
    const ctx = setUp(t);
    ctx.store.data.users.push({ uuid: 'u-1', email: 'new@example.com' });
    const result = await requestCode(ctx);
    assert.deepEqual(result, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
    assert.equal(ctx.mail.outbox.length, 0);
    assert.equal(ctx.store.data.verifications[0].code_hash, null);
    ctx.clock.advance(10_000);
    assert.equal((await requestCode(ctx)).code, 'RESEND_TOO_SOON');
});

test('인증번호: 메일 결과 실패·던짐이어도 ok (응답이 가입 여부를 드러내지 않게)', async (t) => {
    const ctx = setUp(t);
    ctx.mail.failNextWithResult();
    assert.equal((await requestCode(ctx, 'a@example.com')).ok, true);
    ctx.mail.failNextWithThrow();
    assert.equal((await requestCode(ctx, 'b@example.com')).ok, true);
});

test('인증번호: 새 번호가 직전 번호와 같은 숫자로 뽑히면 다시 뽑는다', async (t) => {
    const ctx = setUp(t);
    const draws = [123456, 123456, 654321];
    swap(t, crypto, 'randomInt', () => draws.shift());
    await requestCode(ctx);
    ctx.clock.advance(60_000);
    await requestCode(ctx);
    assert.deepEqual(ctx.mail.outbox.map((m) => m.params.code), ['123456', '654321']);
});

test('인증번호: 앞자리가 0인 번호도 자리 수를 채워 보낸다', async (t) => {
    const ctx = setUp(t);
    swap(t, crypto, 'randomInt', () => 42);
    await requestCode(ctx);
    assert.equal(lastCode(ctx), '000042');
});

test('인증번호: 행을 동시에 만들다 유일 충돌이 나면 처음부터 다시 해서 한 통만 보낸다', async (t) => {
    const ctx = setUp(t);
    let first = true;
    ctx.store.hooks.createVerification = (row) => {
        if (!first) return;
        first = false;
        ctx.store.data.verifications.push({ id: 'ver-race', ...row, sent_at: null, code_hash: null });
        throw uniqueError('race');
    };
    const result = await requestCode(ctx);
    assert.equal(result.ok, true);
    assert.equal(ctx.mail.outbox.length, 1);
    assert.equal(ctx.store.data.verifications.length, 1);
});

test('인증번호: 자리 수 설정 8이면 8자리 번호', async (t) => {
    const ctx = setUp(t, { SIGNUP_EMAIL_CODE_LENGTH: '8' });
    await requestCode(ctx);
    assert.match(lastCode(ctx), /^\d{8}$/);
});

test('인증 설정: 자리 수 3·소수·글자 같은 틀린 값은 던지고, 빈 값은 기본값', () => {
    assert.throws(() => getSignupEmailConfig({ SIGNUP_EMAIL_CODE_LENGTH: '3' }));
    assert.throws(() => getSignupEmailConfig({ SIGNUP_EMAIL_MAX_ATTEMPTS: '1.5' }));
    assert.throws(() => getSignupEmailConfig({ SIGNUP_EMAIL_CODE_TTL_MS: 'ten' }));
    const config = getSignupEmailConfig({ SIGNUP_EMAIL_CODE_LENGTH: '' });
    assert.equal(config.codeLength, 6);
    assert.equal(config.hmacSecret, null);
});

// ── 인증번호 확인 ──

test('번호 확인: 보낸 적 없는 주소는 CODE_INVALID', async (t) => {
    const ctx = setUp(t);
    assert.deepEqual(await verifyCode(ctx, '123456', 'ghost@example.com'), { ok: false, code: 'CODE_INVALID' });
});

test('번호 확인: 틀리면 남은 횟수(4)를 알려 주고 횟수가 오른다', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    const result = await verifyCode(ctx, wrongCodeFor(lastCode(ctx)));
    assert.deepEqual(result, { ok: false, code: 'CODE_INVALID', attemptsRemaining: 4 });
    assert.equal(ctx.store.data.verifications[0].attempts, 1);
});

test('번호 확인: 5번째로 틀리면 TOO_MANY_ATTEMPTS, 그 뒤엔 맞는 번호도 거절', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    const code = lastCode(ctx);
    for (let i = 0; i < 4; i += 1) await verifyCode(ctx, wrongCodeFor(code));
    assert.equal((await verifyCode(ctx, wrongCodeFor(code))).code, 'TOO_MANY_ATTEMPTS');
    assert.equal((await verifyCode(ctx, code)).code, 'TOO_MANY_ATTEMPTS');
});

test('번호 확인: 10분이 정확히 지나면 CODE_EXPIRED (9분 59초는 통과)', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx, 'a@example.com');
    await requestCode(ctx, 'b@example.com');
    const codeA = ctx.mail.outbox[0].params.code;
    const codeB = ctx.mail.outbox[1].params.code;
    ctx.clock.advance(599_000);
    assert.equal((await verifyCode(ctx, codeA, 'a@example.com')).ok, true);
    ctx.clock.advance(1000);
    assert.equal((await verifyCode(ctx, codeB, 'b@example.com')).code, 'CODE_EXPIRED');
});

test('번호 확인: 맞으면 증명 하나, 같은 번호를 다시 넣으면 CODE_INVALID (한 번만)', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    const code = lastCode(ctx);
    const ok = await verifyCode(ctx, code);
    assert.equal(ok.ok, true);
    assert.equal(typeof ok.signupProof, 'string');
    assert.notEqual(ctx.store.data.verifications[0].proof_hash, ok.signupProof);
    assert.equal((await verifyCode(ctx, code)).code, 'CODE_INVALID');
});

test('번호 확인: 대문자 주소로 확인해도 같은 행으로 통과', async (t) => {
    const ctx = setUp(t);
    await requestCode(ctx);
    assert.equal((await verifyCode(ctx, lastCode(ctx), 'NEW@EXAMPLE.COM')).ok, true);
});

test('번호 확인: 새 번호를 받은 뒤 옛 번호는 CODE_INVALID', async (t) => {
    const ctx = setUp(t);
    swap(t, crypto, 'randomInt', (() => { const seq = [111111, 222222]; return () => seq.shift(); })());
    await requestCode(ctx);
    ctx.clock.advance(60_000);
    await requestCode(ctx);
    assert.equal((await verifyCode(ctx, '111111')).code, 'CODE_INVALID');
    assert.equal((await verifyCode(ctx, '222222')).ok, true);
});

// ── 가입 증명 소비 ──

const proofFor = async (ctx, email = 'new@example.com') => {
    await requestCode(ctx, email);
    return (await verifyCode(ctx, lastCode(ctx), email)).signupProof;
};
const consume = (ctx, signupProof, email = 'new@example.com') => verification.consumeSignupProof({ email, signupProof }, { now: ctx.clock.now });

test('증명 소비: 증명이 비었으면 DB 안 가고 SIGNUP_PROOF_INVALID', async (t) => {
    const ctx = setUp(t);
    assert.deepEqual(await consume(ctx, ''), { ok: false, code: 'SIGNUP_PROOF_INVALID' });
    assert.equal(ctx.store.names().includes('lockByEmail'), false);
});

test('증명 소비: 맞는 증명은 한 번만, 두 번째는 SIGNUP_PROOF_INVALID', async (t) => {
    const ctx = setUp(t);
    const proof = await proofFor(ctx);
    assert.deepEqual(await consume(ctx, proof), { ok: true });
    assert.equal((await consume(ctx, proof)).ok, false);
});

test('증명 소비: 증명은 10분 뒤 만료', async (t) => {
    const ctx = setUp(t);
    const proof = await proofFor(ctx);
    ctx.clock.advance(600_000);
    assert.equal((await consume(ctx, proof)).ok, false);
});

test('증명 소비: 다른 주소의 증명으로는 못 쓴다', async (t) => {
    const ctx = setUp(t);
    const proofA = await proofFor(ctx, 'a@example.com');
    await proofFor(ctx, 'b@example.com');
    assert.equal((await consume(ctx, proofA, 'b@example.com')).ok, false);
    assert.equal((await consume(ctx, proofA, 'a@example.com')).ok, true);
});

test('증명 소비: 증명 받은 뒤 새 번호를 요청하면 옛 증명은 무효', async (t) => {
    const ctx = setUp(t);
    const proof = await proofFor(ctx);
    ctx.clock.advance(60_000);
    await requestCode(ctx);
    assert.equal((await consume(ctx, proof)).ok, false);
});

// ── 이메일 가입 ──

const SIGNUP_BODY = { email: 'new@example.com', password: 'signup-pass-1', passwordConfirm: 'signup-pass-1', nickname: '새가면', birthDate: '2001-05-06' };

test('이메일 가입: 증명이 없으면 해시·트랜잭션 전에 401 SIGNUP_PROOF_REQUIRED', async (t) => {
    const ctx = setUp(t);
    await assert.rejects(authService.signup({ ...SIGNUP_BODY }), (e) => e.status === 401 && e.code === 'SIGNUP_PROOF_REQUIRED');
    assert.equal(ctx.store.names().includes('withTransaction'), false);
});

// 가입 서비스는 진짜 시계로 증명 만료를 봄 → 진짜 시계를 가짜 시계 시각에 맞춤 (안 맞추면 그날 03:30Z 넘어 돌리면 만료로 실패, 2026-11-09)
const pinRealClock = (t, ctx) => t.mock.timers.enable({ apis: ['Date'], now: ctx.clock.now().getTime() });

test('이메일 가입: 맞는 증명이면 이메일 인증된 계정과 기본 지급, 같은 증명으로 두 번째 가입은 거절', async (t) => {
    const ctx = setUp(t);
    pinRealClock(t, ctx);
    let grants = 0;
    swap(t, economyService, 'ensureDefaultEntitlements', async () => { grants += 1; });
    const signupProof = await proofFor(ctx);
    const user = await authService.signup({ ...SIGNUP_BODY, signupProof });
    assert.equal(user.email_verified, true);
    assert.equal(await bcrypt.compare('signup-pass-1', user.password_hash), true);
    assert.equal(grants, 1);
    await assert.rejects(authService.signup({ ...SIGNUP_BODY, nickname: '다른가면', signupProof }), (e) => e.code === 'SIGNUP_PROOF_INVALID');
});

test('이메일 가입: 이메일 중복 409면 증명 소비도 되돌아가 다시 쓸 수 있다', async (t) => {
    const ctx = setUp(t);
    pinRealClock(t, ctx);
    const signupProof = await proofFor(ctx);
    ctx.store.data.users.push({ uuid: 'u-dup', email: 'new@example.com', nickname: '먼저' });
    await assert.rejects(authService.signup({ ...SIGNUP_BODY, signupProof }), (e) => e.status === 409);
    assert.equal(ctx.store.data.verifications[0].proof_consumed_at, null);
});

// ── 비번 재설정 요청 ──

const resetSetUp = (t, env = {}) => {
    const ctx = setUp(t, { PASSWORD_RESET_APP_URL: 'https://play.example.com', ...env });
    ctx.store.data.users.push({ uuid: 'u-1', email: 'me@example.com', has_local_password: true, password_hash: 'old-hash' });
    return ctx;
};
const requestReset = (ctx, email = 'me@example.com') => passwordReset.requestPasswordReset({ email }, { mailAdapter: ctx.mail });
const tokenFromMail = (mail) => new URL(mail.params.resetUrl).searchParams.get('token');

test('재설정 요청: 없는 이메일은 토큰·메일 없이 같은 ok', async (t) => {
    const ctx = resetSetUp(t);
    assert.deepEqual(await requestReset(ctx, 'ghost@example.com'), { ok: true });
    assert.equal(ctx.store.data.resetTokens.length, 0);
    assert.equal(ctx.mail.outbox.length, 0);
});

test('재설정 요청: 토큰 해시만 저장(원래 칸 null)·30분 만료, 메일 링크의 토큰 해시와 같다', async (t) => {
    const ctx = resetSetUp(t);
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-09T03:00:00.000Z') });
    await requestReset(ctx);
    const row = ctx.store.data.resetTokens[0];
    const mail = ctx.mail.outbox[0];
    assert.equal(mail.template, 'PASSWORD_RESET');
    assert.equal(row.token, null);
    assert.equal(row.token_hash, sha256(tokenFromMail(mail)));
    assert.equal(row.expired_at.getTime(), new Date('2026-11-09T03:30:00.000Z').getTime());
    assert.match(mail.params.resetUrl, /^https:\/\/play\.example\.com\/password-reset\?token=/);
});

test('재설정 요청: 다시 요청하면 앞 토큰은 폐기, 열린 토큰은 하나', async (t) => {
    const ctx = resetSetUp(t);
    await requestReset(ctx);
    await requestReset(ctx);
    const open = ctx.store.data.resetTokens.filter((r) => !r.revoked_at && !r.used);
    assert.equal(ctx.store.data.resetTokens.length, 2);
    assert.equal(open.length, 1);
    assert.ok(ctx.store.data.resetTokens[0].revoked_at);
});

test('재설정 요청: 소셜 전용 계정은 토큰 없이 소셜 로그인 안내 메일', async (t) => {
    const ctx = resetSetUp(t);
    ctx.store.data.users[0].has_local_password = false;
    await requestReset(ctx);
    assert.equal(ctx.store.data.resetTokens.length, 0);
    assert.deepEqual(ctx.mail.outbox.map((m) => m.template), ['SOCIAL_LOGIN_GUIDE']);
});

test('재설정 요청: 앱 주소 설정이 없으면 토큰은 만들어도 메일은 안 보낸다', async (t) => {
    const ctx = resetSetUp(t, { PASSWORD_RESET_APP_URL: undefined });
    assert.deepEqual(await requestReset(ctx), { ok: true });
    assert.equal(ctx.store.data.resetTokens.length, 1);
    assert.equal(ctx.mail.outbox.length, 0);
});

test('재설정 요청: 메일이 던져도 ok (가입 여부 숨김)', async (t) => {
    const ctx = resetSetUp(t);
    ctx.mail.failNextWithThrow();
    assert.deepEqual(await requestReset(ctx), { ok: true });
});

test('재설정 요청: 데드락은 두 번까지 처음부터 다시, 세 번째도 데드락이면 던진다 (메일은 성공했을 때 한 통)', async (t) => {
    const ctx = resetSetUp(t);
    const deadlock = () => Object.assign(new Error('deadlock'), { name: 'SequelizeDeadlockError' });
    let failures = 2;
    ctx.store.hooks['before:withTransaction'] = () => { if (failures > 0) { failures -= 1; throw deadlock(); } };
    assert.deepEqual(await requestReset(ctx), { ok: true });
    assert.equal(ctx.mail.outbox.length, 1);
    failures = 3;
    await assert.rejects(requestReset(ctx), /deadlock/);
    assert.equal(ctx.mail.outbox.length, 1);
});

test('재설정 링크 주소: 끝 슬래시·이미 /password-reset·원래 쿼리는 다듬고, http(s) 아니면 null', (t) => {
    withEnv(t, { PASSWORD_RESET_APP_URL: 'https://a.example.com/app/' });
    assert.equal(buildResetUrl('TOK'), 'https://a.example.com/app/password-reset?token=TOK');
    process.env.PASSWORD_RESET_APP_URL = 'https://a.example.com/password-reset/?x=1';
    assert.equal(buildResetUrl('TOK'), 'https://a.example.com/password-reset?token=TOK');
    process.env.PASSWORD_RESET_APP_URL = 'ftp://a.example.com';
    assert.equal(buildResetUrl('TOK'), null);
    process.env.PASSWORD_RESET_APP_URL = 'not a url';
    assert.equal(buildResetUrl('TOK'), null);
});

// ── 재설정 링크 확인·새 비번 ──

const rawToken = () => crypto.randomBytes(32).toString('base64url');
const addResetToken = (ctx, extra = {}) => {
    const raw = rawToken();
    ctx.store.data.resetTokens.push({
        id: `reset-${ctx.store.data.resetTokens.length + 1}`, user_id: 'u-1', token: null, token_hash: sha256(raw),
        expired_at: new Date(Date.now() + 30 * 60 * 1000), used: false, revoked_at: null, ...extra,
    });
    return raw;
};

test('링크 확인: 모양 틀린 토큰은 DB 안 가고 INVALID', async (t) => {
    const ctx = resetSetUp(t);
    assert.deepEqual(await passwordReset.verifyPasswordReset('short'), { ok: false, code: 'INVALID' });
    assert.deepEqual(await passwordReset.verifyPasswordReset(undefined), { ok: false, code: 'INVALID' });
    assert.equal(ctx.store.names().includes('findByHash'), false);
});

test('링크 확인: 모르는·폐기 INVALID, 사용됨 USED, 만료 EXPIRED, 정상 VALID (토큰은 안 씀)', async (t) => {
    const ctx = resetSetUp(t);
    const revoked = addResetToken(ctx, { revoked_at: new Date() });
    const used = addResetToken(ctx, { used: true });
    const expired = addResetToken(ctx, { expired_at: new Date(Date.now() - 1) });
    const valid = addResetToken(ctx);
    assert.equal((await passwordReset.verifyPasswordReset(rawToken())).code, 'INVALID');
    assert.equal((await passwordReset.verifyPasswordReset(revoked)).code, 'INVALID');
    assert.equal((await passwordReset.verifyPasswordReset(used)).code, 'USED');
    assert.equal((await passwordReset.verifyPasswordReset(expired)).code, 'EXPIRED');
    assert.deepEqual(await passwordReset.verifyPasswordReset(valid), { ok: true, status: 'VALID' });
    assert.equal(ctx.store.data.resetTokens[3].used, false);
});

test('새 비번: 비번 규칙이 틀리면 DB 안 가고 400 INVALID_PASSWORD', async (t) => {
    const ctx = resetSetUp(t);
    const result = await passwordReset.confirmPasswordReset(addResetToken(ctx), 'short');
    assert.equal(result.code, 'INVALID_PASSWORD');
    assert.equal(result.status, 400);
    assert.equal(ctx.store.names().includes('lockByHash'), false);
});

test('새 비번: 성공하면 해시 바뀜·세션 전부 끊김·토큰 사용·다른 열린 토큰 폐기, 같은 링크 다시는 USED', async (t) => {
    const ctx = resetSetUp(t);
    ctx.store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null });
    const other = addResetToken(ctx);
    const token = addResetToken(ctx);
    assert.deepEqual(await passwordReset.confirmPasswordReset(token, 'reset-new-pass-1'), { ok: true });
    const user = ctx.store.data.users[0];
    assert.equal(await bcrypt.compare('reset-new-pass-1', user.password_hash), true);
    assert.equal(ctx.store.data.sessions[0].is_online, false);
    assert.equal(ctx.store.data.resetTokens[1].used, true);
    assert.ok(ctx.store.data.resetTokens[0].revoked_at);
    assert.equal((await passwordReset.confirmPasswordReset(token, 'reset-new-pass-2')).code, 'USED');
    assert.equal((await passwordReset.verifyPasswordReset(other)).code, 'INVALID');
});

test('새 비번: 소셜 전용 계정은 SOCIAL_ONLY이고 토큰을 쓰지 않는다', async (t) => {
    const ctx = resetSetUp(t);
    ctx.store.data.users[0].has_local_password = false;
    const token = addResetToken(ctx);
    assert.deepEqual(await passwordReset.confirmPasswordReset(token, 'reset-new-pass-1'), { ok: false, status: 400, code: 'SOCIAL_ONLY' });
    assert.equal(ctx.store.data.resetTokens[0].used, false);
});

test('새 비번: 계정이 없어졌으면 INVALID, 만료면 EXPIRED', async (t) => {
    const ctx = resetSetUp(t);
    const orphan = addResetToken(ctx, { user_id: 'gone' });
    const expired = addResetToken(ctx, { expired_at: new Date(Date.now() - 1) });
    assert.equal((await passwordReset.confirmPasswordReset(orphan, 'reset-new-pass-1')).code, 'INVALID');
    assert.equal((await passwordReset.confirmPasswordReset(expired, 'reset-new-pass-1')).code, 'EXPIRED');
});

// ── 아이디 찾기 ──

const findSetUp = (t, user) => {
    const ctx = setUp(t);
    ctx.store.data.users.push({ uuid: 'u-f', email: 'finder@example.com', nickname: '찾는이', birth_date: '2000-01-02', ...user });
    return ctx;
};
const find = (nickname = '찾는이', birthDate = new Date(Date.UTC(2000, 0, 2))) => accountRecovery.findId({ nickname, birthDate, ipAddress: '10.9.9.9' });

test('아이디 찾기: 닉네임·생일이 맞으면 가린 이메일만, 요청 IP를 기록한다', async (t) => {
    const ctx = findSetUp(t);
    const result = await find();
    assert.equal(result.ok, true);
    assert.notEqual(result.maskedEmail, 'finder@example.com');
    assert.match(result.maskedEmail, /\*/);
    assert.deepEqual(ctx.store.data.findRequests, [{ ip_address: '10.9.9.9' }]);
});

test('아이디 찾기: 생일이 하루 다르면 NOT_FOUND (그래도 IP는 기록)', async (t) => {
    const ctx = findSetUp(t);
    assert.deepEqual(await find('찾는이', new Date(Date.UTC(2000, 0, 3))), { ok: false, code: 'NOT_FOUND' });
    assert.equal(ctx.store.data.findRequests.length, 1);
});

test('아이디 찾기: 저장 생일이 비었거나 못 읽는 값이면 NOT_FOUND', async (t) => {
    findSetUp(t, { birth_date: null });
    assert.equal((await find()).ok, false);
});

test('아이디 찾기: 저장 생일이 못 읽는 글자면 NOT_FOUND', async (t) => {
    findSetUp(t, { birth_date: 'not-a-date' });
    assert.equal((await find()).ok, false);
});

test('아이디 찾기: 생일은 UTC 날짜만 비교 (저장값에 시각이 붙어도 같은 날이면 찾음)', async (t) => {
    findSetUp(t, { birth_date: '2000-01-02T23:30:00.000Z' });
    assert.equal((await find()).ok, true);
});

test('아이디 찾기: 없는 닉네임은 NOT_FOUND', async (t) => {
    findSetUp(t);
    assert.deepEqual(await find('없는이'), { ok: false, code: 'NOT_FOUND' });
});

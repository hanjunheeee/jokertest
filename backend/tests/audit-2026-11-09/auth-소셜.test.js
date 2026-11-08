'use strict';

// 인증 시험: 소셜 로그인 시도 표 · state 발급/소비 · 계정 찾기 · 소셜 가입 의도+시도 쿠키 · 소셜 가입 · 디스코드 연결 · 프런트 주소
// DB 안 씀 (가짜 저장소), 제공자 프로필 받기는 가짜로 갈아끼움, 시계는 Date만 가짜
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-auth-social-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const social = require('../../services/auth/social');
const { clientMark } = require('../../services/auth/social/attempt');
const googleOAuthService = require('../../services/auth/oauth/google');
const discordOAuthService = require('../../services/auth/oauth/discord');
const economyService = require('../../services/economy');
const signupEmailVerificationService = require('../../services/auth/signupEmailVerification');
const frontendOrigins = require('../../config/frontendOrigins');
const { useAuthStore, swap } = require('./authFakes');

const START = new Date('2026-11-09T12:00:00.000Z');
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const REQ_INFO = { ip: '10.1.1.1', userAgent: 'audit-social', deviceType: 'PC' };

const setUp = (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: START });
    const store = useAuthStore(t);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    return store;
};

const rejectsCode = (promise, code, status) => assert.rejects(promise, (e) => {
    assert.equal(e.code, code);
    if (status !== undefined) assert.equal(e.status, status);
    return true;
});

// 가입 의도 행 하나 넣고 원래 토큰 돌려줌
const addIntent = (store, extra = {}) => {
    const raw = `intent-${Math.random().toString(36).slice(2)}`;
    store.data.intents.push({
        id: `intent-row-${store.data.intents.length + 1}`, intent_token_hash: sha256(raw), provider: 'google', subject: 'g-sub-1',
        email: 'social@example.com', expires_at: new Date(START.getTime() + 30 * 60 * 1000), consumed_at: null, ...extra,
    });
    return raw;
};

// ── 시도 표 ──

test('시도 표: 서명한 값을 그대로 풀어 준다', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: START });
    const token = social.signOAuthAttempt({ fp: 'f', purpose: 'login', provider: 'google' }, 600);
    const decoded = social.verifyOAuthAttempt(token);
    assert.equal(decoded.fp, 'f');
    assert.equal(decoded.exp - decoded.iat, 600);
});

test('시도 표: 다른 비밀키 서명·만료·글자 아님은 던지지 않고 null', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: START });
    assert.equal(social.verifyOAuthAttempt(jwt.sign({ fp: 'f' }, 'other-secret')), null);
    const token = social.signOAuthAttempt({ fp: 'f' }, 60);
    t.mock.timers.tick(61_000);
    assert.equal(social.verifyOAuthAttempt(token), null);
    assert.equal(social.verifyOAuthAttempt(undefined), null);
    assert.equal(social.verifyOAuthAttempt(''), null);
    assert.equal(social.verifyOAuthAttempt({ fp: 'f' }), null);
});

test('가입 시도 표 판정: 가입 목적이고 같은 의도 토큰일 때만 참', () => {
    assert.equal(social.isSignupAttemptFor({ purpose: 'signup', intentToken: 'A' }, 'A'), true);
    assert.equal(social.isSignupAttemptFor({ purpose: 'login', intentToken: 'A' }, 'A'), false);
    assert.equal(social.isSignupAttemptFor({ purpose: 'signup', intentToken: 'A' }, 'B'), false);
    assert.equal(social.isSignupAttemptFor({ purpose: 'signup', intentToken: '' }, ''), false);
    assert.equal(social.isSignupAttemptFor(null, 'A'), false);
});

test('가입 로그인 유지: 같은 의도의 가입 시도 표에 rememberMe가 진짜 true일 때만', () => {
    assert.equal(social.rememberMeForSignup({ purpose: 'signup', intentToken: 'A', rememberMe: true }, 'A'), true);
    assert.equal(social.rememberMeForSignup({ purpose: 'signup', intentToken: 'A', rememberMe: 'true' }, 'A'), false);
    assert.equal(social.rememberMeForSignup({ purpose: 'signup', intentToken: 'B', rememberMe: true }, 'A'), false);
    assert.equal(social.rememberMeForSignup({ purpose: 'login', intentToken: 'A', rememberMe: true }, 'A'), false);
});

test('기기 표시: mobile만 client를 넣고 나머지는 빈 객체', () => {
    assert.deepEqual(clientMark('mobile'), { client: 'mobile' });
    assert.deepEqual(clientMark('desktop'), {});
    assert.deepEqual(clientMark('MOBILE'), {});
    assert.deepEqual(clientMark(undefined), {});
});

// ── state 발급 ──

test('state 발급: 로그인·연결 말고 다른 목적은 400', async (t) => {
    setUp(t);
    await assert.rejects(social.issueOAuthState({ purpose: 'signup', browserFingerprint: 'fp' }), (e) => e.status === 400);
});

test('state 발급: 연결 목적인데 로그인 정보가 없으면 400', async (t) => {
    setUp(t);
    await assert.rejects(social.issueOAuthState({ purpose: 'link', userId: 'u-1', browserFingerprint: 'fp' }), (e) => e.status === 400);
});

test('state 발급: 연결 목적인데 세션이 끊겼으면 401 SESSION_INVALID, 행 안 만듦', async (t) => {
    const store = setUp(t);
    await rejectsCode(social.issueOAuthState({ purpose: 'link', userId: 'u-1', sessionId: 's-dead', browserFingerprint: 'fp' }), 'SESSION_INVALID', 401);
    assert.equal(store.data.states.length, 0);
});

test('state 발급: 지문이 없으면 400', async (t) => {
    setUp(t);
    await assert.rejects(social.issueOAuthState({ purpose: 'login' }), (e) => e.status === 400);
    await assert.rejects(social.issueOAuthState({ purpose: 'login', browserFingerprint: '' }), (e) => e.status === 400);
});

test('state 발급: 행엔 state·지문 해시만, 10분 뒤 만료, 로그인 목적이면 계정·세션 칸 비움', async (t) => {
    const store = setUp(t);
    const { state, expiresAt } = await social.issueOAuthState({ purpose: 'login', userId: 'u-x', sessionId: 's-x', browserFingerprint: 'fp-raw' });
    const row = store.data.states[0];
    assert.equal(row.state_hash, sha256(state));
    assert.equal(row.browser_fingerprint_hash, sha256('fp-raw'));
    assert.equal(JSON.stringify(row).includes('fp-raw'), false);
    assert.equal(JSON.stringify(row).includes(state), false);
    assert.equal(expiresAt.getTime(), START.getTime() + 10 * 60 * 1000);
    assert.equal(row.user_id, null);
    assert.equal(row.session_id, null);
});

test('state 발급: 연결 목적이면 계정·세션 id를 기록한다', async (t) => {
    const store = setUp(t);
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null });
    await social.issueOAuthState({ purpose: 'link', userId: 'u-1', sessionId: 's-1', browserFingerprint: 'fp' });
    assert.equal(store.data.states[0].user_id, 'u-1');
    assert.equal(store.data.states[0].session_id, 's-1');
});

// ── state 소비 ──

const issue = (purpose = 'login', fp = 'fp-1') => social.issueOAuthState({ purpose, browserFingerprint: fp });

test('state 소비: state나 지문이 없으면 DB 안 가고 STATE_MISSING', async (t) => {
    const store = setUp(t);
    await rejectsCode(social.consumeOAuthState(undefined, { browserFingerprint: 'fp' }), 'STATE_MISSING', 400);
    await rejectsCode(social.consumeOAuthState('abc', {}), 'STATE_MISSING', 400);
    assert.equal(store.names().includes('findOAuthStateByHash'), false);
});

test('state 소비: 모르는 state는 STATE_INVALID', async (t) => {
    setUp(t);
    await rejectsCode(social.consumeOAuthState('nope', { browserFingerprint: 'fp' }), 'STATE_INVALID', 400);
});

test('state 소비: 정확히 10분이 지나면 STATE_EXPIRED (9분 59초는 통과)', async (t) => {
    setUp(t);
    const a = await issue();
    const b = await issue();
    t.mock.timers.tick(10 * 60 * 1000 - 1000);
    await social.consumeOAuthState(a.state, { browserFingerprint: 'fp-1', purpose: 'login' });
    t.mock.timers.tick(1000);
    await rejectsCode(social.consumeOAuthState(b.state, { browserFingerprint: 'fp-1', purpose: 'login' }), 'STATE_EXPIRED', 400);
});

test('state 소비: 지문이 다르면 거절하고 쓴 표시를 안 남겨 원래 브라우저는 쓸 수 있다', async (t) => {
    const store = setUp(t);
    const { state } = await issue();
    await rejectsCode(social.consumeOAuthState(state, { browserFingerprint: 'other-fp' }), 'STATE_FINGERPRINT_MISMATCH', 400);
    assert.equal(store.data.states[0].consumed_at, null);
    await social.consumeOAuthState(state, { browserFingerprint: 'fp-1' });
});

test('state 소비: 로그인 state를 연결로 쓰면 STATE_PURPOSE_MISMATCH', async (t) => {
    setUp(t);
    const { state } = await issue('login');
    await rejectsCode(social.consumeOAuthState(state, { browserFingerprint: 'fp-1', purpose: 'link' }), 'STATE_PURPOSE_MISMATCH', 400);
});

test('state 소비: 성공하면 쓴 표시, 두 번째는 409 STATE_REUSED', async (t) => {
    const store = setUp(t);
    const { state } = await issue();
    const result = await social.consumeOAuthState(state, { browserFingerprint: 'fp-1', purpose: 'login' });
    assert.equal(result.purpose, 'login');
    assert.ok(store.data.states[0].consumed_at);
    await rejectsCode(social.consumeOAuthState(state, { browserFingerprint: 'fp-1' }), 'STATE_REUSED', 409);
});

// ── 계정 찾기 ──

test('계정 찾기: 취소면 DB 안 가고 OAUTH_CANCELLED', async (t) => {
    const store = setUp(t);
    await rejectsCode(social.resolveOAuthAccount({ provider: 'google', subject: 's', cancelled: true }), 'OAUTH_CANCELLED', 400);
    assert.deepEqual(store.names(), []);
});

test('계정 찾기: 제공자·고유 id가 비거나 글자가 아니면 PROVIDER_INVALID', async (t) => {
    setUp(t);
    await rejectsCode(social.resolveOAuthAccount({ provider: '', subject: 's' }), 'PROVIDER_INVALID', 400);
    await rejectsCode(social.resolveOAuthAccount({ provider: 'google', subject: 123 }), 'PROVIDER_INVALID', 400);
});

test('계정 찾기: 연결은 있는데 계정 행이 없으면 404 LINKED_USER_MISSING', async (t) => {
    const store = setUp(t);
    store.data.identities.push({ provider: 'google', subject: 'g-1', user_id: 'gone' });
    await rejectsCode(social.resolveOAuthAccount({ provider: 'google', subject: 'g-1' }), 'LINKED_USER_MISSING', 404);
});

test('계정 찾기: 연결 계정이 ACTIVE가 아니면 403 ACCOUNT_INACTIVE, 세션·기록 없음', async (t) => {
    const store = setUp(t);
    store.data.users.push({ uuid: 'u-1', status: 'SUSPENDED' });
    store.data.identities.push({ provider: 'google', subject: 'g-1', user_id: 'u-1' });
    await rejectsCode(social.resolveOAuthAccount({ provider: 'google', subject: 'g-1' }), 'ACCOUNT_INACTIVE', 403);
    assert.equal(store.data.sessions.length, 0);
    assert.equal(store.data.history.length, 0);
});

test('계정 찾기: 연결 계정 로그인은 rememberMe가 진짜 true일 때만 refresh를 준다', async (t) => {
    const store = setUp(t);
    store.data.users.push({ uuid: 'u-1', status: 'ACTIVE', role: 'USER' });
    store.data.identities.push({ provider: 'discord', subject: 'd-1', user_id: 'u-1' });
    const loose = await social.resolveOAuthAccount({ provider: 'discord', subject: 'd-1', rememberMe: 'true', reqInfo: REQ_INFO });
    assert.equal(loose.status, 'LOGIN');
    assert.equal(loose.refreshToken, null);
    const strict = await social.resolveOAuthAccount({ provider: 'discord', subject: 'd-1', rememberMe: true, reqInfo: REQ_INFO });
    assert.equal(typeof strict.refreshToken, 'string');
    assert.equal(store.data.sessions.filter((s) => s.is_online).length, 1);
});

test('계정 찾기: 처음 보는 계정·이메일 없음이면 가입 의도(해시만 저장·30분)와 이메일 인증 필요 표시', async (t) => {
    const store = setUp(t);
    const result = await social.resolveOAuthAccount({ provider: 'discord', subject: 'd-new', email: null });
    assert.equal(result.status, 'SIGNUP_REQUIRED');
    assert.equal(result.emailVerificationRequired, true);
    assert.equal(store.data.intents[0].intent_token_hash, sha256(result.intentToken));
    assert.equal(store.data.intents[0].expires_at.getTime(), START.getTime() + 30 * 60 * 1000);
    assert.equal(store.data.intents[0].email, null);
});

test('계정 찾기: 제공자 이메일 앞뒤 공백은 다듬고, 공백뿐이면 없는 이메일로 본다', async (t) => {
    const store = setUp(t);
    const trimmed = await social.resolveOAuthAccount({ provider: 'google', subject: 'g-a', email: '  a@x.com ' });
    assert.equal(trimmed.email, 'a@x.com');
    assert.equal(trimmed.emailVerificationRequired, false);
    const blank = await social.resolveOAuthAccount({ provider: 'google', subject: 'g-b', email: '   ' });
    assert.equal(blank.email, null);
    assert.equal(store.data.intents[1].email, null);
});

// ── 가입 의도 확인 ──

test('가입 의도 확인: 없으면 INTENT_INVALID, 처리됨 409 INTENT_CONSUMED, 만료 INTENT_EXPIRED', async (t) => {
    const store = setUp(t);
    await rejectsCode(social.getSocialSignupIntent({ intentToken: 'none' }), 'INTENT_INVALID', 400);
    await rejectsCode(social.getSocialSignupIntent({}), 'INTENT_INVALID', 400);
    const used = addIntent(store, { consumed_at: START });
    await rejectsCode(social.getSocialSignupIntent({ intentToken: used }), 'INTENT_CONSUMED', 409);
    const old = addIntent(store, { expires_at: START });
    await rejectsCode(social.getSocialSignupIntent({ intentToken: old }), 'INTENT_EXPIRED', 400);
});

test('가입 의도 확인: 제공자 이메일 있으면 인증 불필요, 없으면 필요', async (t) => {
    const store = setUp(t);
    const withEmail = addIntent(store);
    const without = addIntent(store, { email: null });
    assert.deepEqual(await social.getSocialSignupIntent({ intentToken: withEmail }), { emailVerificationRequired: false });
    assert.deepEqual(await social.getSocialSignupIntent({ intentToken: without }), { emailVerificationRequired: true });
});

// ── 소셜 가입 마무리 ──

const completeSignup = (intentToken, extra = {}) => social.completeSocialSignup({
    intentToken, nickname: '가면', birthDate: '2000-01-02', reqInfo: REQ_INFO, ...extra,
});

test('소셜 가입: 의도 토큰·닉네임·생일이 틀리면 DB 안 가고 거절', async (t) => {
    const store = setUp(t);
    await rejectsCode(completeSignup(undefined), 'INTENT_INVALID', 400);
    await assert.rejects(completeSignup('x', { nickname: '가' }), (e) => e.status === 400);
    await assert.rejects(completeSignup('x', { birthDate: '2000/01/02' }), (e) => e.status === 400);
    assert.deepEqual(store.names(), []);
});

test('소셜 가입: 제공자 이메일 가입은 계정·외부 계정·의도 사용·로그인 기록·세션을 한 번에 만든다', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store);
    const result = await completeSignup(intent);
    const user = store.data.users[0];
    assert.equal(user.email, 'social@example.com');
    assert.equal(user.has_local_password, false);
    assert.equal(user.email_verified, true);
    assert.deepEqual(store.data.identities.map((i) => [i.provider, i.subject, i.user_id, i.email_snapshot]),
        [['google', 'g-sub-1', user.uuid, 'social@example.com']]);
    assert.ok(store.data.intents[0].consumed_at);
    assert.equal(store.data.history.length, 1);
    assert.equal(jwt.decode(result.token).uuid, user.uuid);
    assert.equal(result.refreshToken, null);
});

test('소셜 가입: 로컬 비번 칸은 무작위 해시라 빈 비번·의도 토큰으로는 안 맞는다', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store);
    await completeSignup(intent);
    const bcrypt = require('bcrypt');
    const hash = store.data.users[0].password_hash;
    assert.match(hash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare('', hash), false);
    assert.equal(await bcrypt.compare(intent, hash), false);
});

test('소셜 가입: 제공자 이메일 없으면 직접 넣은 이메일 형식부터 확인 (INVALID_INPUT)', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store, { email: null });
    await rejectsCode(completeSignup(intent, { email: 'not-an-email', signupProof: 'p' }), 'INVALID_INPUT', 400);
    assert.equal(store.data.users.length, 0);
});

test('소셜 가입: 제공자 이메일 없고 증명이 없으면 401 SIGNUP_PROOF_REQUIRED', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store, { email: null });
    await rejectsCode(completeSignup(intent, { email: 'me@example.com' }), 'SIGNUP_PROOF_REQUIRED', 401);
});

test('소셜 가입: 증명이 틀리면 401 SIGNUP_PROOF_INVALID이고 의도는 안 쓴 채로 남는다', async (t) => {
    const store = setUp(t);
    swap(t, signupEmailVerificationService, 'consumeSignupProof', async () => ({ ok: false, code: 'SIGNUP_PROOF_INVALID' }));
    const intent = addIntent(store, { email: null });
    await rejectsCode(completeSignup(intent, { email: 'me@example.com', signupProof: 'bad' }), 'SIGNUP_PROOF_INVALID', 401);
    assert.equal(store.data.intents[0].consumed_at, null);
    assert.equal(store.data.users.length, 0);
});

test('소셜 가입: 직접 넣은 이메일은 소문자·공백 다듬어 증명 소비와 계정에 쓰고, 외부 계정 기록 이메일은 비운다', async (t) => {
    const store = setUp(t);
    const seen = [];
    swap(t, signupEmailVerificationService, 'consumeSignupProof', async (args) => { seen.push(args); return { ok: true }; });
    const intent = addIntent(store, { email: null });
    await completeSignup(intent, { email: '  Me@Example.COM ', signupProof: 'good' });
    assert.deepEqual(seen.map((a) => [a.email, a.signupProof]), [['me@example.com', 'good']]);
    assert.equal(store.data.users[0].email, 'me@example.com');
    assert.equal(store.data.identities[0].email_snapshot, null);
});

test('소셜 가입: 직접 넣은 이메일로 이미 가입한 계정이 있으면 409 EMAIL_CONFLICT', async (t) => {
    const store = setUp(t);
    swap(t, signupEmailVerificationService, 'consumeSignupProof', async () => ({ ok: true }));
    store.data.users.push({ uuid: 'u-old', email: 'me@example.com', nickname: '원래' });
    const intent = addIntent(store, { email: null });
    await rejectsCode(completeSignup(intent, { email: 'me@example.com', signupProof: 'good' }), 'EMAIL_CONFLICT', 409);
});

test('소셜 가입: 닉네임 중복이면 409이고 의도·계정이 다 되돌아간다', async (t) => {
    const store = setUp(t);
    store.data.users.push({ uuid: 'u-old', email: 'old@example.com', nickname: '가면' });
    const intent = addIntent(store);
    await assert.rejects(completeSignup(intent), (e) => e.status === 409 && /닉네임/.test(e.message));
    assert.equal(store.data.intents[0].consumed_at, null);
    assert.equal(store.data.users.length, 1);
});

test('소셜 가입: 같은 의도로 두 번째 가입은 409 INTENT_CONSUMED', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store);
    await completeSignup(intent);
    await rejectsCode(completeSignup(intent, { nickname: '다른이름' }), 'INTENT_CONSUMED', 409);
    assert.equal(store.data.users.length, 1);
});

test('소셜 가입: 의도가 만료됐으면 INTENT_EXPIRED', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store);
    t.mock.timers.tick(30 * 60 * 1000);
    await rejectsCode(completeSignup(intent), 'INTENT_EXPIRED', 400);
});

test('소셜 가입: 기본 지급이 실패하면 계정·외부 계정·의도 사용·기록 전부 되돌아간다', async (t) => {
    const store = setUp(t);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => { throw new Error('지급 실패'); });
    const intent = addIntent(store);
    await assert.rejects(completeSignup(intent), /지급 실패/);
    assert.equal(store.data.users.length, 0);
    assert.equal(store.data.identities.length, 0);
    assert.equal(store.data.intents[0].consumed_at, null);
    assert.equal(store.data.history.length, 0);
});

test('소셜 가입: rememberMe가 true면 refresh도 준다', async (t) => {
    const store = setUp(t);
    const intent = addIntent(store);
    const result = await completeSignup(intent, { rememberMe: true });
    assert.equal(typeof result.refreshToken, 'string');
});

// ── 계정 연결 ──

const link = (extra = {}) => social.linkExternalIdentityForValidatedSession({
    userId: 'u-1', sessionId: 's-1', provider: 'discord', subject: 'd-1', email: 'd@x.com', ...extra,
});
const withLiveSession = (store) => {
    store.data.users.push({ uuid: 'u-1' });
    store.data.sessions.push({ id: 's-1', user_id: 'u-1', is_online: true, revoked_at: null });
};

test('계정 연결: 로그인 정보 없으면 401, 제공자 정보 없으면 PROVIDER_INVALID', async (t) => {
    setUp(t);
    await assert.rejects(link({ sessionId: null }), (e) => e.status === 401);
    await rejectsCode(link({ subject: '' }), 'PROVIDER_INVALID', 400);
});

test('계정 연결: 연결 시작 뒤 세션이 끊겼으면 401 SESSION_REVOKED', async (t) => {
    setUp(t);
    await rejectsCode(link(), 'SESSION_REVOKED', 401);
});

test('계정 연결: 남의 계정에 붙은 외부 계정이면 409 IDENTITY_ALREADY_LINKED', async (t) => {
    const store = setUp(t);
    withLiveSession(store);
    store.data.identities.push({ provider: 'discord', subject: 'd-1', user_id: 'u-other' });
    await rejectsCode(link(), 'IDENTITY_ALREADY_LINKED', 409);
});

test('계정 연결: 이미 내 계정에 붙어 있으면 새 행 없이 그대로 (두 번 눌러도 됨)', async (t) => {
    const store = setUp(t);
    withLiveSession(store);
    await link();
    await link();
    assert.equal(store.data.identities.length, 1);
});

test('계정 연결: 이메일 기록은 다듬고, 공백뿐이면 null', async (t) => {
    const store = setUp(t);
    withLiveSession(store);
    await link({ email: '  d@x.com  ' });
    await link({ subject: 'd-2', email: '   ' });
    assert.deepEqual(store.data.identities.map((i) => i.email_snapshot), ['d@x.com', null]);
});

test('계정 연결(state 포함): state를 발급한 세션과 다르면 STATE_USER_MISMATCH', async (t) => {
    const store = setUp(t);
    withLiveSession(store);
    store.data.sessions.push({ id: 's-2', user_id: 'u-1', is_online: true, revoked_at: null });
    const { state } = await social.issueOAuthState({ purpose: 'link', userId: 'u-1', sessionId: 's-1', browserFingerprint: 'fp' });
    await rejectsCode(social.linkExternalIdentity({
        userId: 'u-1', sessionId: 's-2', provider: 'discord', subject: 'd-1', rawState: state, browserFingerprint: 'fp',
    }), 'STATE_USER_MISMATCH', 400);
    assert.equal(store.data.identities.length, 0);
});

// ── 디스코드 연결 흐름 ──

const startLink = async (store) => {
    withLiveSession(store);
    const { state, attemptToken } = await social.startDiscordLink({ userId: 'u-1', sessionId: 's-1' });
    return { state, attempt: social.verifyOAuthAttempt(attemptToken) };
};

test('디스코드 연결 시작: 시도 표엔 지문·연결 목적·디스코드, state 행엔 지문 해시', async (t) => {
    const store = setUp(t);
    const { attempt } = await startLink(store);
    assert.equal(attempt.purpose, 'link');
    assert.equal(attempt.provider, 'discord');
    assert.equal(store.data.states[0].browser_fingerprint_hash, sha256(attempt.fp));
});

test('디스코드 연결 콜백: 구글 로그인 시도 표로 오면 지문을 안 믿어 STATE_MISSING', async (t) => {
    const store = setUp(t);
    const { state, attempt } = await startLink(store);
    const wrongAttempt = { ...attempt, purpose: 'login', provider: 'google' };
    await rejectsCode(social.completeDiscordLink({ attempt: wrongAttempt, query: { state, code: 'c' }, user: { uuid: 'u-1', sessionId: 's-1' } }), 'STATE_MISSING');
});

test('디스코드 연결 콜백: 다른 세션으로 오면 STATE_USER_MISMATCH이고 프로필을 안 받는다', async (t) => {
    const store = setUp(t);
    let profileCalls = 0;
    swap(t, discordOAuthService, 'exchangeCodeForProfile', async () => { profileCalls += 1; return { subject: 'd-1', email: null }; });
    const { state, attempt } = await startLink(store);
    await rejectsCode(social.completeDiscordLink({ attempt, query: { state, code: 'c' }, user: { uuid: 'u-1', sessionId: 's-9' } }), 'STATE_USER_MISMATCH', 400);
    assert.equal(profileCalls, 0);
});

test('디스코드 연결 콜백: 취소면 state는 써 버리고 OAUTH_CANCELLED, 프로필 안 받음', async (t) => {
    const store = setUp(t);
    let profileCalls = 0;
    swap(t, discordOAuthService, 'exchangeCodeForProfile', async () => { profileCalls += 1; return { subject: 'd-1' }; });
    const { state, attempt } = await startLink(store);
    await rejectsCode(social.completeDiscordLink({ attempt, query: { state, error: 'access_denied' }, user: { uuid: 'u-1', sessionId: 's-1' } }), 'OAUTH_CANCELLED', 400);
    assert.ok(store.data.states[0].consumed_at);
    assert.equal(profileCalls, 0);
});

test('디스코드 연결 콜백: 성공하면 연결용 주소로 코드 교환 뒤 그 프로필을 내 계정에 붙인다', async (t) => {
    const store = setUp(t);
    const seen = [];
    swap(t, discordOAuthService, 'exchangeCodeForProfile', async (code, opts) => { seen.push([code, opts]); return { subject: 'd-77', email: 'd77@x.com' }; });
    const { state, attempt } = await startLink(store);
    await social.completeDiscordLink({ attempt, query: { state, code: 'code-1' }, user: { uuid: 'u-1', sessionId: 's-1' } });
    assert.deepEqual(seen, [['code-1', { purpose: 'link' }]]);
    assert.deepEqual(store.data.identities.map((i) => [i.provider, i.subject, i.user_id]), [['discord', 'd-77', 'u-1']]);
});

// ── 구글 로그인 흐름 ──

test('구글 로그인 시작: 시도 표에 지문·rememberMe·로그인 목적·구글, 모바일이면 client 표시', async (t) => {
    const store = setUp(t);
    const { attemptToken } = await social.startGoogleLogin({ rememberMe: true, client: 'mobile' });
    const attempt = social.verifyOAuthAttempt(attemptToken);
    assert.equal(attempt.purpose, 'login');
    assert.equal(attempt.provider, 'google');
    assert.equal(attempt.rememberMe, true);
    assert.equal(attempt.client, 'mobile');
    assert.equal(attempt.exp - attempt.iat, 600);
    assert.equal(store.data.states[0].browser_fingerprint_hash, sha256(attempt.fp));
});

test('구글 로그인 콜백: 디스코드 시도 표로 오면 지문을 안 믿어 STATE_MISSING', async (t) => {
    setUp(t);
    const { state, attemptToken } = await social.startDiscordLogin({ rememberMe: false });
    const attempt = social.verifyOAuthAttempt(attemptToken);
    await rejectsCode(social.completeGoogleLogin({ attempt, query: { state, code: 'c' }, reqInfo: REQ_INFO }), 'STATE_MISSING');
});

test('구글 로그인 콜백: 취소면 state를 써 버린 뒤 OAUTH_CANCELLED (같은 state 다시 못 씀)', async (t) => {
    const store = setUp(t);
    const { state, attemptToken } = await social.startGoogleLogin({ rememberMe: false });
    const attempt = social.verifyOAuthAttempt(attemptToken);
    await rejectsCode(social.completeGoogleLogin({ attempt, query: { state, error: 'access_denied' }, reqInfo: REQ_INFO }), 'OAUTH_CANCELLED');
    assert.ok(store.data.states[0].consumed_at);
});

test('구글 로그인 콜백: 처음 보는 계정이면 가입 시도 표(가입 목적·의도 토큰·rememberMe, 30분)를 준다', async (t) => {
    setUp(t);
    swap(t, googleOAuthService, 'exchangeCodeForProfile', async () => ({ subject: 'g-new', email: 'new@x.com' }));
    const { state, attemptToken } = await social.startGoogleLogin({ rememberMe: true });
    const attempt = social.verifyOAuthAttempt(attemptToken);
    const { result, rememberMe, intentAttemptToken } = await social.completeGoogleLogin({ attempt, query: { state, code: 'c' }, reqInfo: REQ_INFO });
    assert.equal(result.status, 'SIGNUP_REQUIRED');
    assert.equal(rememberMe, true);
    const signupAttempt = social.verifyOAuthAttempt(intentAttemptToken);
    assert.equal(social.isSignupAttemptFor(signupAttempt, result.intentToken), true);
    assert.equal(social.rememberMeForSignup(signupAttempt, result.intentToken), true);
    assert.equal(signupAttempt.exp - signupAttempt.iat, 30 * 60);
});

test('구글 로그인 콜백: 이미 연결된 계정이면 가입 시도 표 없이 세션', async (t) => {
    const store = setUp(t);
    store.data.users.push({ uuid: 'u-1', status: 'ACTIVE', role: 'USER' });
    store.data.identities.push({ provider: 'google', subject: 'g-1', user_id: 'u-1' });
    swap(t, googleOAuthService, 'exchangeCodeForProfile', async () => ({ subject: 'g-1', email: null }));
    const { state, attemptToken } = await social.startGoogleLogin({ rememberMe: false });
    const out = await social.completeGoogleLogin({ attempt: social.verifyOAuthAttempt(attemptToken), query: { state, code: 'c' }, reqInfo: REQ_INFO });
    assert.equal(out.result.status, 'LOGIN');
    assert.equal(out.intentAttemptToken, null);
});

// ── 프런트 주소 ──

const withEnv = (t, values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
};

test('프런트 주소: client는 정확히 "mobile"만 모바일, 나머지는 데스크톱', () => {
    assert.equal(frontendOrigins.parseClient('mobile'), 'mobile');
    for (const value of ['Mobile', 'desktop', '', undefined, ['mobile']]) assert.equal(frontendOrigins.parseClient(value), 'desktop');
});

test('프런트 주소: 모바일 주소가 없으면 모바일 시작이어도 데스크톱 주소로 돌아간다', (t) => {
    withEnv(t, { FRONTEND_URL: 'https://play.example.com/', FRONTEND_MOBILE_URL: undefined });
    assert.equal(frontendOrigins.resolveFrontendBase('mobile'), 'https://play.example.com');
});

test('프런트 주소: 모바일 주소가 있으면 모바일 시작만 그 주소(공백·끝 슬래시 다듬음)', (t) => {
    withEnv(t, { FRONTEND_URL: 'https://play.example.com', FRONTEND_MOBILE_URL: '  https://m.example.com//  ' });
    assert.equal(frontendOrigins.resolveFrontendBase('mobile'), 'https://m.example.com');
    assert.equal(frontendOrigins.resolveFrontendBase('desktop'), 'https://play.example.com');
});

test('CORS 주소: 모바일 없으면 글자 하나, 있으면 두 주소 목록(빈 값 뺌)', (t) => {
    withEnv(t, { FRONTEND_URL: 'https://play.example.com/', FRONTEND_MOBILE_URL: undefined });
    assert.equal(frontendOrigins.getCorsOrigin(), 'https://play.example.com');
    assert.deepEqual(frontendOrigins.getAllowedOrigins(), ['https://play.example.com']);
    process.env.FRONTEND_MOBILE_URL = 'https://m.example.com/';
    assert.deepEqual(frontendOrigins.getCorsOrigin(), ['https://play.example.com', 'https://m.example.com']);
});

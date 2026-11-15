'use strict';

// 소셜 로그인 시험(시험 DB + 가짜 구글·디스코드): 시작 주소·시도 쿠키·state 줄, 처음 로그인 → 가입 의도, 연결된 계정 로그인, 정지·취소·state 거절, 탈퇴 뒤 다시
// 목록 A11-B-315~337 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const h = require('./a11a-auth-db-helpers');

const { db, FRONT } = h;
const MIN_MS = 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

let app = null;
let fake = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    fake = await h.startFakeProvider();
    h.useFakeProviderEnv(fake.url);
    app = await h.startApp();
});
test.after(async () => {
    if (fake) await fake.close();
    await h.closeAll(app);
});

// ── 이 파일 안 작은 도우미 ──
// 제공자마다 사람 모양 (구글 sub·email_verified / 디스코드 id·verified)
const googlePerson = (label, { email = h.emailOf(label), verified = true } = {}) => ({ sub: h.tag(`g-${label}-`), email, email_verified: verified });
const discordPerson = (label, { email = h.emailOf(label), verified = true } = {}) => ({ id: h.tag(`d-${label}-`), email, verified });
const subjectOf = (person) => person.sub ?? person.id;

// 시작 → 가짜 제공자 코드 → 콜백 (같은 브라우저 시도 쿠키)
async function socialFlow(provider, person, { rememberMe } = {}) {
    const started = await h.startSocial(app.base, provider, { rememberMe });
    const code = person ? fake.codeFor(person) : undefined;
    const back = await h.socialCallback(app.base, provider, { state: started.state, code, attempt: started.attempt });
    return { ...back, started };
}
// 화면 주소의 소셜 오류 code
const socialErrorOf = (back) => back.url?.searchParams.get('socialError');
const intentRowOf = (intentToken) => db.SocialSignupIntent.findOne({ where: { intent_token_hash: sha256(intentToken) }, raw: true });

// 연결된 계정 (외부 계정 줄까지)
async function linkedUser(label, provider = 'google', extra = {}) {
    const user = await h.createUser({ label, ...extra });
    const person = provider === 'google' ? googlePerson(label, { email: user.email }) : discordPerson(label, { email: user.email });
    await db.ExternalIdentity.create({ provider, subject: subjectOf(person), user_id: user.uuid, email_snapshot: user.email });
    return { user, person };
}

// 시작 답 공통: 302 제공자 인가 주소(state 실림), 시도 쿠키 httpOnly·Lax, state 줄은 해시만·끝 10분 뒤
async function assertStart(t, provider, authorizePath, query) {
    const before = Date.now();
    const { res, state, attempt } = await h.startSocial(app.base, provider, query);
    assert.equal(res.status, 302);
    assert.ok(res.location.startsWith(`${fake.url}${authorizePath}`), `인가 주소 아님: ${res.location}`);
    assert.ok(state, 'state 안 실림');
    const cookie = res.cookies.oauthAttempt;
    assert.ok(attempt, '시도 쿠키 없음');
    assert.equal(cookie.attrs.httponly, true);
    assert.equal(cookie.attrs.samesite, 'Lax');
    const rows = await db.OAuthState.findAll({ where: { state_hash: sha256(state) }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(await db.OAuthState.count({ where: { state_hash: state } }), 0, 'state 원문이 저장됨');
    const expiresAt = new Date(rows[0].expires_at).getTime();
    assert.ok(Math.abs(expiresAt - (before + 10 * MIN_MS)) <= 5000, `state 끝이 10분 뒤 아님: ${new Date(expiresAt).toISOString()}`);
}

test('A11-B-315 구글 로그인 시작 (로그인 유지) → 302 인가 주소, 시도 쿠키, state 줄 1개', async (t) => {
    if (h.noDb(t)) return;
    await assertStart(t, 'google', '/o/oauth2/v2/auth', { rememberMe: true });
});

test('A11-B-316 디스코드 로그인 시작 → 302 인가 주소, 시도 쿠키, state 줄 1개', async (t) => {
    if (h.noDb(t)) return;
    await assertStart(t, 'discord', '/api/oauth2/authorize', {});
});

test('A11-B-317 구글 키 없음 → 302 GOOGLE_OAUTH_NOT_CONFIGURED, 시도 쿠키 안 남음 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    h.withEnv(t, { GOOGLE_CLIENT_ID: undefined });
    const { res } = await h.startSocial(app.base, 'google', {});
    assert.equal(res.status, 302);
    assert.equal(res.location, `${FRONT}/login?socialError=GOOGLE_OAUTH_NOT_CONFIGURED`);
    assert.ok(!res.cookies.oauthAttempt?.value, '시도 쿠키가 남음');
});

// 처음 소셜 로그인 + 제공자가 확인한 이메일 → 가입 의도 (이메일 그대로, 30분)
const firstLoginCases = [
    { id: 'A11-B-318', provider: 'google', make: googlePerson },
    { id: 'A11-B-319', provider: 'discord', make: discordPerson },
];
for (const { id, provider, make } of firstLoginCases) {
    test(`${id} 처음 ${provider} 로그인 + 확인된 이메일 → 가입 의도 (이메일 = 제공자 이메일, 끝 30분)`, async (t) => {
        if (h.noDb(t)) return;
        const person = make(id.slice(-3));
        const before = Date.now();
        const back = await socialFlow(provider, person);
        assert.equal(back.res.status, 302);
        assert.equal(`${back.url.origin}${back.url.pathname}`, `${FRONT}/login`);
        const intentToken = back.url.searchParams.get('socialIntent');
        assert.ok(intentToken, 'socialIntent 없음');
        const intent = await intentRowOf(intentToken);
        assert.equal(intent.email, person.email);
        const expiresAt = new Date(intent.expires_at).getTime();
        assert.ok(Math.abs(expiresAt - (before + 30 * MIN_MS)) <= 5000, `의도 끝이 30분 뒤 아님: ${new Date(expiresAt).toISOString()}`);
    });
}

// 확인 안 된 이메일은 안 믿음 → 의도 이메일 없음 (가입 때 이메일 인증)
const unverifiedCases = [
    { id: 'A11-B-320', provider: 'google', person: () => googlePerson('b320', { verified: false }), label: '구글 email_verified false' },
    { id: 'A11-B-321', provider: 'discord', person: () => discordPerson('b321', { verified: false }), label: '디스코드 verified false' },
    { id: 'A11-B-322', provider: 'google', person: () => ({ sub: h.tag('g-b322-') }), label: '이메일 없음' },
];
for (const { id, provider, person, label } of unverifiedCases) {
    test(`${id} ${label} → 가입 의도 email 없음`, async (t) => {
        if (h.noDb(t)) return;
        const back = await socialFlow(provider, person());
        const intentToken = back.url?.searchParams.get('socialIntent');
        assert.ok(intentToken, `socialIntent 없음: ${back.res.location}`);
        assert.equal((await intentRowOf(intentToken)).email, null);
    });
}

test('A11-B-323 제공자 이메일 = 있는 계정 이메일 → EMAIL_CONFLICT, 의도·연결 줄 없음', async (t) => {
    if (h.noDb(t)) return;
    const existing = await h.createUser({ label: 'b323' });
    const person = googlePerson('b323', { email: existing.email });
    const back = await socialFlow('google', person);
    assert.equal(back.res.status, 302);
    assert.equal(socialErrorOf(back), 'EMAIL_CONFLICT');
    assert.equal(await db.SocialSignupIntent.count({ where: { subject: person.sub } }), 0);
    assert.equal(await db.ExternalIdentity.count({ where: { subject: person.sub } }), 0);
});

test('A11-B-324 연결된 구글 계정 + 로그인 유지 켬 → /lobby, access·refresh 쿠키', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b324');
    const back = await socialFlow('google', person, { rememberMe: true });
    assert.equal(back.res.location, `${FRONT}/lobby`);
    assert.ok(back.cookies.accessToken, 'access 쿠키 없음');
    assert.ok(back.cookies.refreshToken, 'refresh 쿠키 없음');
});

test('A11-B-325 연결된 구글 계정 + 로그인 유지 끔 → /lobby, refresh 쿠키 지움', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b325');
    const back = await socialFlow('google', person, { rememberMe: false });
    assert.equal(back.res.location, `${FRONT}/lobby`);
    assert.ok(back.cookies.accessToken, 'access 쿠키 없음');
    assert.ok(h.isCleared(back.res.cookies.refreshToken), 'refresh 지우는 Set-Cookie 없음');
});

test('A11-B-326 연결된 계정이 정지 → ACCOUNT_BANNED(사유 안 실음), 세션 줄 없음', async (t) => {
    if (h.noDb(t)) return;
    const { user, person } = await linkedUser('b326');
    await db.UserBan.create({ user_id: user.uuid, reason: 'b326 사유 글', is_permanent: true, start_at: new Date(Date.now() - MIN_MS) });
    const back = await socialFlow('google', person);
    assert.equal(socialErrorOf(back), 'ACCOUNT_BANNED');
    assert.equal(back.res.location.includes(encodeURIComponent('b326')), false);
    assert.equal((await h.sessionsOf(user.uuid)).length, 0);
});

test('A11-B-327 연결된 계정 status ACTIVE 아님 → ACCOUNT_INACTIVE', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b327', 'google', { status: 'INACTIVE' });
    const back = await socialFlow('google', person);
    assert.equal(socialErrorOf(back), 'ACCOUNT_INACTIVE');
});

test('A11-B-328 비번 5번 틀려 잠긴 계정 → 연결된 구글로 /lobby', async (t) => {
    if (h.noDb(t)) return;
    const { user, person } = await linkedUser('b328');
    const ip = h.nextIp();
    for (let i = 0; i < 5; i += 1) {
        await h.request(app.base, 'POST', '/auth/login', { body: { email: user.email, password: 'wrong-pass-1' }, ip });
    }
    assert.ok((await h.userRow(user.uuid)).locked_until, '준비: 잠금 안 걸림');
    const back = await socialFlow('google', person);
    assert.equal(back.res.location, `${FRONT}/lobby`);
});

test('A11-B-329 제공자 화면에서 취소 → OAUTH_CANCELLED', async (t) => {
    if (h.noDb(t)) return;
    const started = await h.startSocial(app.base, 'google', {});
    const back = await h.socialCallback(app.base, 'google', { state: started.state, error: 'access_denied', attempt: started.attempt });
    assert.equal(socialErrorOf(back), 'OAUTH_CANCELLED');
});

test('A11-B-330 취소 뒤 같은 state로 다시 → STATE_REUSED', async (t) => {
    if (h.noDb(t)) return;
    const started = await h.startSocial(app.base, 'google', {});
    await h.socialCallback(app.base, 'google', { state: started.state, error: 'access_denied', attempt: started.attempt });
    const again = await h.socialCallback(app.base, 'google', { state: started.state, error: 'access_denied', attempt: started.attempt });
    assert.equal(socialErrorOf(again), 'STATE_REUSED');
});

test('A11-B-331 시도 쿠키 없음 → STATE_MISSING', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b331');
    const started = await h.startSocial(app.base, 'google', {});
    const back = await h.socialCallback(app.base, 'google', { state: started.state, code: fake.codeFor(person) });
    assert.equal(socialErrorOf(back), 'STATE_MISSING');
});

test('A11-B-332 모르는 state → STATE_INVALID', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b332');
    const started = await h.startSocial(app.base, 'google', {});
    const back = await h.socialCallback(app.base, 'google', {
        state: crypto.randomBytes(32).toString('base64url'), code: fake.codeFor(person), attempt: started.attempt,
    });
    assert.equal(socialErrorOf(back), 'STATE_INVALID');
});

test('A11-B-333 이미 쓴 state → STATE_REUSED', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b333');
    const first = await socialFlow('google', person);
    assert.equal(first.res.location, `${FRONT}/lobby`, '준비: 첫 로그인 실패');
    const again = await h.socialCallback(app.base, 'google', {
        state: first.started.state, code: fake.codeFor(person), attempt: first.started.attempt,
    });
    assert.equal(socialErrorOf(again), 'STATE_REUSED');
});

test('A11-B-334 10분 지난 state (끝 시각 칸 앞당김) → STATE_EXPIRED', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b334');
    const started = await h.startSocial(app.base, 'google', {});
    await db.OAuthState.update({ expires_at: new Date(Date.now() - MIN_MS) }, { where: { state_hash: sha256(started.state) } });
    const back = await h.socialCallback(app.base, 'google', { state: started.state, code: fake.codeFor(person), attempt: started.attempt });
    assert.equal(socialErrorOf(back), 'STATE_EXPIRED');
});

test('A11-B-335 다른 브라우저 시도 쿠키 → STATE_FINGERPRINT_MISMATCH', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b335');
    const mine = await h.startSocial(app.base, 'google', {});
    const other = await h.startSocial(app.base, 'google', {});
    const back = await h.socialCallback(app.base, 'google', { state: mine.state, code: fake.codeFor(person), attempt: other.attempt });
    assert.equal(socialErrorOf(back), 'STATE_FINGERPRINT_MISMATCH');
});

test('A11-B-336 같은 state 콜백 둘 동시 → 하나만 로그인, 하나는 STATE_REUSED', async (t) => {
    if (h.noDb(t)) return;
    const { person } = await linkedUser('b336');
    const started = await h.startSocial(app.base, 'google', {});
    const backs = await Promise.all([1, 2].map(() => h.socialCallback(app.base, 'google', {
        state: started.state, code: fake.codeFor(person), attempt: started.attempt,
    })));
    const outcomes = backs.map((back) => (back.res.location === `${FRONT}/lobby` ? 'lobby' : socialErrorOf(back))).sort();
    assert.deepEqual(outcomes, ['STATE_REUSED', 'lobby']);
});

test('A11-B-337 소셜 가입 → 탈퇴 → 같은 구글로 로그인 → 새 가입 의도', async (t) => {
    if (h.noDb(t)) return;
    const person = googlePerson('b337');
    const first = await socialFlow('google', person);
    const intentToken = first.url.searchParams.get('socialIntent');
    const done = await h.request(app.base, 'POST', '/auth/social/signup/complete', {
        body: {
            intentToken, nickname: h.nicknameOf('b337'), birthDate: '2000-01-01',
            agreedTermsVersionIds: await h.currentTermIds(), ageConfirmed: true,
        },
        cookies: { oauthAttempt: first.cookies.oauthAttempt },
    });
    assert.equal(done.status, 200, `준비: 소셜 가입 ${done.status} ${JSON.stringify(done.body)}`);
    const { withdrawAccount } = require('../../services/auth/account/withdraw');
    await withdrawAccount({ uuid: done.body.data.user.uuid, confirmEmail: person.email });
    const again = await socialFlow('google', person);
    assert.equal(`${again.url.origin}${again.url.pathname}`, `${FRONT}/login`);
    const newIntent = again.url.searchParams.get('socialIntent');
    assert.ok(newIntent, `새 가입 의도 없음: ${again.res.location}`);
    assert.notEqual(newIntent, intentToken);
});

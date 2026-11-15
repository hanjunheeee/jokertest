'use strict';

// 소셜 가입 시험(시험 DB + 가짜 구글): 가입 의도 확인·이 브라우저 시도 쿠키만·지난·쓴 의도, 가입 마무리 줄, 이메일 없는 의도의 인증, 입력 거절, 동시 마무리
// 목록 A11-B-343~360 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const h = require('./a11a-auth-db-helpers');
const bannedWords = require('../../services/ops/bannedWords');
const { listDefaultGrantItems } = require('../../services/economy/catalog');

const { db } = h;
const MIN_MS = 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const INTENT_PATH = '/auth/social/signup/intent';
const COMPLETE_PATH = '/auth/social/signup/complete';

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
// 구글 사람 (email 없으면 이메일 없는 의도)
const googlePerson = (label, { withEmail = true } = {}) => ({
    sub: h.tag(`g-${label}-`), ...(withEmail ? { email: h.emailOf(label), email_verified: true } : {}),
});
// 처음 구글 로그인 → 가입 의도 { intentToken, attempt(가입 시도 쿠키 값), person }
async function intentFor(label, { withEmail = true, rememberMe } = {}) {
    const person = googlePerson(label, { withEmail });
    const started = await h.startSocial(app.base, 'google', { rememberMe });
    const back = await h.socialCallback(app.base, 'google', { state: started.state, code: fake.codeFor(person), attempt: started.attempt });
    const intentToken = back.url?.searchParams.get('socialIntent');
    assert.ok(intentToken, `준비: 가입 의도 없음 ${back.res.location}`);
    return { intentToken, attempt: back.cookies.oauthAttempt, person };
}
const askIntent = (intentToken, attempt) => h.request(app.base, 'POST', INTENT_PATH, {
    body: { intentToken }, cookies: attempt ? { oauthAttempt: attempt } : undefined,
});
// 가입 마무리 본문: 닉네임·생일·약관 전부·14세 확인 기본
const completeBody = async (intentToken, extra = {}) => ({
    intentToken, nickname: h.nicknameOf('ss'), birthDate: '2000-01-01',
    agreedTermsVersionIds: await h.currentTermIds(), ageConfirmed: true, ...extra,
});
const complete = async ({ intentToken, attempt }, extra = {}) => h.request(app.base, 'POST', COMPLETE_PATH, {
    body: await completeBody(intentToken, extra), cookies: { oauthAttempt: attempt },
});
const defaultGrantRows = async (uuid) => {
    const [rows] = await db.sequelize.query(
        "SELECT COUNT(*) AS n FROM economy_ledger_entries WHERE user_id = :uuid AND reason = 'DEFAULT_GRANT'",
        { replacements: { uuid } },
    );
    return Number(rows[0].n);
};

test('A11-B-343 가입 칸 열 때 의도 확인 (제공자 이메일 있음) → emailVerificationRequired false, no-store', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b343');
    const res = await askIntent(intent.intentToken, intent.attempt);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.emailVerificationRequired, false);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('A11-B-344 가입 칸 열 때 의도 확인 (제공자 이메일 없음) → emailVerificationRequired true, no-store', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b344', { withEmail: false });
    const res = await askIntent(intent.intentToken, intent.attempt);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.emailVerificationRequired, true);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('A11-B-345 시도 쿠키 없이 의도 확인 → 400 INTENT_EXPIRED', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b345');
    const res = await askIntent(intent.intentToken, null);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
});

test('A11-B-346 다른 의도의 시도 쿠키로 의도 확인 → 400 INTENT_EXPIRED', async (t) => {
    if (h.noDb(t)) return;
    const mine = await intentFor('b346');
    const other = await intentFor('b346o');
    const res = await askIntent(mine.intentToken, other.attempt);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
});

test('A11-B-347 30분 지난 의도 (끝 시각 칸 앞당김) → 400 INTENT_EXPIRED', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b347');
    await db.SocialSignupIntent.update({ expires_at: new Date(Date.now() - MIN_MS) }, { where: { intent_token_hash: sha256(intent.intentToken) } });
    const res = await askIntent(intent.intentToken, intent.attempt);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
});

test('A11-B-348 이미 가입에 쓴 의도 → 409 INTENT_CONSUMED', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b348');
    assert.equal((await complete(intent)).status, 200, '준비: 가입 마무리 실패');
    const res = await askIntent(intent.intentToken, intent.attempt);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INTENT_CONSUMED');
});

test('A11-B-349 소셜 가입 마무리 (확인된 이메일) → 200, 계정·연결·의도 쓴 표시·기본 지급·동의·세션 쿠키', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b349');
    const res = await complete(intent);
    assert.equal(res.status, 200);
    const uuid = res.body.data.user.uuid;
    const user = await h.userRow(uuid);
    assert.equal(user.email, intent.person.email);
    assert.equal(Boolean(user.email_verified), true);
    assert.equal(Boolean(user.has_local_password), false);
    const identities = await db.ExternalIdentity.findAll({ where: { user_id: uuid }, raw: true });
    assert.equal(identities.length, 1);
    assert.equal(identities[0].provider, 'google');
    assert.equal(identities[0].subject, intent.person.sub);
    const intentRow = await db.SocialSignupIntent.findOne({ where: { intent_token_hash: sha256(intent.intentToken) }, raw: true });
    assert.ok(intentRow.consumed_at, '의도 쓴 표시 없음');
    assert.equal(await defaultGrantRows(uuid), listDefaultGrantItems().length);
    const agreed = await db.UserTermsAgreement.count({ where: { user_id: uuid } });
    assert.equal(agreed, (await h.currentTermIds()).length);
    assert.ok(res.cookies.accessToken?.value, '세션 쿠키 없음');
});

// 소셜 계정은 무작위 비번 해시라 아무 비번으로도 안 들어감
test('A11-B-350 소셜 가입 계정 이메일 + 아무 비번 몇 개 → 전부 401', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b350');
    assert.equal((await complete(intent)).status, 200, '준비: 가입 마무리 실패');
    for (const password of ['pass1234', 'password', 'a11a-any-pw', intent.person.email]) {
        const res = await h.request(app.base, 'POST', '/auth/login', { body: { email: intent.person.email, password } });
        assert.equal(res.status, 401, `비번 "${password}" 답 ${res.status}`);
    }
});

// 이메일 없는 의도: 직접 넣은 이메일 + 그 주소 인증 증명
test('A11-B-351 이메일 없는 의도 + 이메일 + 그 주소 증명 → 200, 계정 이메일 = 입력 주소', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b351', { withEmail: false });
    const email = h.emailOf('b351e');
    const res = await complete(intent, { email, signupProof: await h.proofOverHttp(app.base, email) });
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(res.body.data.user.uuid)).email, email);
});

test('A11-B-352 이메일 없는 의도 + 증명 없음 → 401 SIGNUP_PROOF_REQUIRED', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b352', { withEmail: false });
    const res = await complete(intent, { email: h.emailOf('b352e') });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'SIGNUP_PROOF_REQUIRED');
});

test('A11-B-353 이메일 없는 의도 + 다른 주소 증명 → 401 SIGNUP_PROOF_INVALID', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b353', { withEmail: false });
    const otherProof = await h.proofOverHttp(app.base, h.emailOf('b353o'));
    const res = await complete(intent, { email: h.emailOf('b353e'), signupProof: otherProof });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'SIGNUP_PROOF_INVALID');
});

// 증명 받은 뒤 그 주소로 계정이 생긴 경우 (가입된 주소엔 번호가 안 나가서)
test('A11-B-354 이메일 없는 의도 + 이미 가입된 주소 → 409 EMAIL_CONFLICT', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b354', { withEmail: false });
    const email = h.emailOf('b354e');
    const signupProof = await h.proofOverHttp(app.base, email);
    await h.createUser({ label: 'b354x', email });
    const res = await complete(intent, { email, signupProof });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_CONFLICT');
});

test('A11-B-355 확인된 이메일 의도 → 그 이메일로 일반 가입 → 소셜 마무리 409 EMAIL_CONFLICT', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b355');
    await h.signupOverHttp(app.base, { email: intent.person.email });
    const res = await complete(intent);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EMAIL_CONFLICT');
});

test('A11-B-356 소셜 가입 있는 닉네임 → 409', async (t) => {
    if (h.noDb(t)) return;
    const taken = await h.createUser({ label: 'b356x' });
    const intent = await intentFor('b356');
    const res = await complete(intent, { nickname: taken.nickname });
    assert.equal(res.status, 409);
});

test('A11-B-357 소셜 가입 금지어 닉네임 → 400 NICKNAME_BANNED_WORD', async (t) => {
    if (h.noDb(t)) return;
    const row = await db.BannedWord.create({ word: '금지말', is_active: true });
    await bannedWords.reloadBannedWords({ db });
    t.after(async () => {
        await db.BannedWord.destroy({ where: { id: row.id } });
        await bannedWords.reloadBannedWords({ db });
    });
    const intent = await intentFor('b357');
    const res = await complete(intent, { nickname: '금지말77' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NICKNAME_BANNED_WORD');
});

test('A11-B-358 소셜 가입 만 14세 미만 → 400 AGE_UNDER_14', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b358');
    const year = new Date().getUTCFullYear() - 10;
    const res = await complete(intent, { birthDate: `${year}-01-01` });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'AGE_UNDER_14');
});

test('A11-B-359 같은 의도 동시 마무리 둘 → 200 하나·409 INTENT_CONSUMED 하나, 계정·연결 1줄씩', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b359');
    const results = await Promise.all([1, 2].map(() => complete(intent, { nickname: h.nicknameOf('b359') })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(results.find((r) => r.status === 409).body.code, 'INTENT_CONSUMED');
    assert.equal(await db.User.count({ where: { email: intent.person.email } }), 1);
    assert.equal(await db.ExternalIdentity.count({ where: { subject: intent.person.sub } }), 1);
});

test('A11-B-360 시도 쿠키 로그인 유지 끔 + 본문 rememberMe true → refresh 쿠키 없음 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const intent = await intentFor('b360', { rememberMe: false });
    const res = await complete(intent, { rememberMe: true });
    assert.equal(res.status, 200);
    assert.ok(!res.cookies.refreshToken?.value, 'refresh 쿠키가 생김');
});

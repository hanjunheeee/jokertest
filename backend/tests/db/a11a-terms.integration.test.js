'use strict';

// 가입 약관·만 14세 시험(시험 DB): 14세 확인 체크·한국 날짜 생일 경계, 필수 약관 빠짐, 선택 약관, 동의 기록, 로그인 전 약관 목록
// 목록 A11-B-251~260 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a11a-auth-db-helpers');

const { db } = h;
const DAY_MS = 24 * 60 * 60 * 1000;

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

// ── 이 파일 안 작은 도우미 ──
const signup = (body) => h.request(app.base, 'POST', '/auth/signup', { body });
const proof = (email) => h.proofOverHttp(app.base, email);
const listTerms = () => h.request(app.base, 'GET', '/auth/terms');

// 약관 판 한 줄 넣기 (시험 머리글자 버전), 끝나면 동의 줄·판 줄 지움
async function addTermsVersion(t, { kind, effectiveAt, required = true, url = null, label }) {
    const row = await db.TermsVersion.create({
        kind, version: h.tag(`a11a-${label}-`), title: `시험 ${label}`, body: null, url,
        effective_at: effectiveAt, is_required: required, created_at: new Date(),
    });
    t.after(async () => {
        await db.UserTermsAgreement.destroy({ where: { terms_version_id: row.id } });
        await db.TermsVersion.destroy({ where: { id: row.id } });
    });
    return row.id;
}

// 지금 약관 (종류·필수 같이) — 화면이 받는 모양 그대로
const currentTerms = async () => (await listTerms()).body.data.terms;

// 한국 날짜 기준 오늘에서 n년 m일 뺀 생일 글자 예: 한국 2026-11-16, 14년 → "2012-11-16"
const kstBirthDate = (years, extraDays = 0) => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const day = new Date(Date.UTC(kst.getUTCFullYear() - years, kst.getUTCMonth(), kst.getUTCDate() + extraDays));
    return day.toISOString().slice(0, 10);
};

test('A11-B-251 만 14세 확인 빠짐 → 400 AGE_CONFIRM_REQUIRED', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b251');
    const body = await h.signupBody({ email, signupProof: await proof(email), nickname: h.nicknameOf('b251') });
    delete body.ageConfirmed;
    const res = await signup(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'AGE_CONFIRM_REQUIRED');
    assert.equal(res.body.message, '만 14세 이상인지 확인해주세요.');
});

test('A11-B-252 오늘(한국)이 딱 만 14세 생일 → 200', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b252');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b252'), birthDate: kstBirthDate(14),
    }));
    assert.equal(res.status, 200);
});

test('A11-B-253 만 14세에 하루 모자람 → 400 AGE_UNDER_14', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b253');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b253'), birthDate: kstBirthDate(14, 1),
    }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'AGE_UNDER_14');
});

test('A11-B-254 필수 약관 둘 중 하나만 → 400 TERMS_AGREEMENT_REQUIRED', async (t) => {
    if (h.noDb(t)) return;
    const required = (await currentTerms()).filter((terms) => terms.required);
    assert.ok(required.length >= 2, '준비: 필수 약관이 둘 아래');
    const email = h.emailOf('b254');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b254'), agreedTermsVersionIds: [required[0].id],
    }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TERMS_AGREEMENT_REQUIRED');
});

// 지금 판보다 앞선 옛 판 (시행일 2020년)
const addOldVersions = (t, label) => Promise.all(['TERMS', 'PRIVACY'].map((kind) => addTermsVersion(t, {
    kind, effectiveAt: new Date('2020-01-01T00:00:00Z'), label: `${label}${kind[0]}`,
})));

test('A11-B-255 옛 버전 id만 → 400 TERMS_AGREEMENT_REQUIRED', async (t) => {
    if (h.noDb(t)) return;
    const oldIds = await addOldVersions(t, 'b255');
    const email = h.emailOf('b255');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b255'), agreedTermsVersionIds: oldIds,
    }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TERMS_AGREEMENT_REQUIRED');
});

test('A11-B-256 선택 약관 있어도 필수만 골라 200, 동의 기록에 선택 약관 없음', async (t) => {
    if (h.noDb(t)) return;
    const optionalId = await addTermsVersion(t, { kind: 'A11AOPT', effectiveAt: new Date(Date.now() - DAY_MS), required: false, label: 'b256' });
    const required = (await currentTerms()).filter((terms) => terms.required).map((terms) => terms.id);
    const email = h.emailOf('b256');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b256'), agreedTermsVersionIds: required,
    }));
    assert.equal(res.status, 200);
    const user = await db.User.findOne({ where: { email }, raw: true });
    const agreed = (await db.UserTermsAgreement.findAll({ where: { user_id: user.uuid }, raw: true })).map((row) => row.terms_version_id);
    assert.equal(agreed.includes(optionalId), false);
    assert.deepEqual([...agreed].sort(), [...required].sort());
});

test('A11-B-257 옛 버전 + 지금 버전 섞어 보냄 → 동의 기록엔 지금 버전만', async (t) => {
    if (h.noDb(t)) return;
    const oldIds = await addOldVersions(t, 'b257');
    const currentIds = (await currentTerms()).map((terms) => terms.id);
    const email = h.emailOf('b257');
    const res = await signup(await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b257'), agreedTermsVersionIds: [...oldIds, ...currentIds],
    }));
    assert.equal(res.status, 200);
    const user = await db.User.findOne({ where: { email }, raw: true });
    const agreed = (await db.UserTermsAgreement.findAll({ where: { user_id: user.uuid }, raw: true })).map((row) => row.terms_version_id);
    assert.deepEqual([...agreed].sort(), [...currentIds].sort());
});

test('A11-B-258 로그인 전 약관 목록 → 종류마다 시행일 지난 가장 늦은 판', async (t) => {
    if (h.noDb(t)) return;
    const newerId = await addTermsVersion(t, { kind: 'TERMS', effectiveAt: new Date(Date.now() - DAY_MS), label: 'b258' });
    const res = await listTerms();
    assert.equal(res.status, 200);
    const termsKind = res.body.data.terms.filter((terms) => terms.kind === 'TERMS');
    assert.equal(termsKind.length, 1);
    assert.equal(termsKind[0].id, newerId);
});

test('A11-B-259 시행일이 미래인 판은 목록에 안 나옴', async (t) => {
    if (h.noDb(t)) return;
    const futureId = await addTermsVersion(t, { kind: 'TERMS', effectiveAt: new Date(Date.now() + DAY_MS), label: 'b259' });
    const res = await listTerms();
    assert.equal(res.status, 200);
    assert.equal(res.body.data.terms.some((terms) => terms.id === futureId), false);
    assert.equal(res.body.data.terms.filter((terms) => terms.kind === 'TERMS').length, 1);
});

test('A11-B-260 약관 주소 javascript:alert(1) → 목록 답에 그 주소 없음', async (t) => {
    if (h.noDb(t)) return;
    const id = await addTermsVersion(t, {
        kind: 'A11AXSS', effectiveAt: new Date(Date.now() - DAY_MS), required: false, url: 'javascript:alert(1)', label: 'b260',
    });
    const res = await listTerms();
    assert.equal(res.status, 200);
    assert.ok(res.body.data.terms.some((terms) => terms.id === id), '준비: 시험 약관이 목록에 없음');
    assert.equal(res.text.includes('javascript:'), false);
});

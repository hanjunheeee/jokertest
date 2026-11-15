'use strict';

// 디스코드 계정 잇기 서버 흐름 시험(시험 DB + 가짜 디스코드): 시작은 로그인한 세션에 묶인 state, 콜백은 같은 세션만·만료 access도 받음
// 목록 A11-B-338~342 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const h = require('./a11a-auth-db-helpers');

const { db, FRONT } = h;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const LINK_PATH = '/auth/discord/link';
const CALLBACK_PATH = '/auth/discord/link/callback';

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
// 로그인한 사람 → { user, accessToken, sessionId }
async function loggedIn(label) {
    const user = await h.createUser({ label });
    const { res, cookies, sessionId } = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    assert.equal(res.status, 200, `준비: 로그인 ${res.status}`);
    return { user, accessToken: cookies.accessToken, sessionId };
}
const discordPerson = (label) => ({ id: h.tag(`d-${label}-`), email: h.emailOf(label), verified: true });
const startLink = (accessToken) => h.startSocial(app.base, 'discord', { path: LINK_PATH, cookies: accessToken ? { accessToken } : undefined });
const linkCallback = (started, person, accessToken) => h.socialCallback(app.base, 'discord', {
    path: CALLBACK_PATH, state: started.state, code: fake.codeFor(person), attempt: started.attempt, extraCookies: { accessToken },
});

test('A11-B-338 로그인한 채 연결 시작 → 302 디스코드 인가 주소, state 줄 목적 link·지금 세션', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken, sessionId } = await loggedIn('b338');
    const started = await startLink(accessToken);
    assert.equal(started.res.status, 302);
    assert.ok(started.res.location.startsWith(`${fake.url}/api/oauth2/authorize`), `인가 주소 아님: ${started.res.location}`);
    const row = await db.OAuthState.findOne({ where: { state_hash: sha256(started.state) }, raw: true });
    assert.equal(row.purpose, 'link');
    assert.equal(row.user_id, user.uuid);
    assert.equal(row.session_id, sessionId);
});

test('A11-B-339 로그인 안 하고 연결 시작 → 302 /account?socialLinkError=SESSION_EXPIRED', async (t) => {
    if (h.noDb(t)) return;
    const started = await startLink(null);
    assert.equal(started.res.status, 302);
    assert.equal(started.res.location, `${FRONT}/account?socialLinkError=SESSION_EXPIRED`);
});

test('A11-B-340 같은 세션 콜백 → 연결 줄 1개 → 그 디스코드로 로그인하면 이 계정으로 /lobby', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken } = await loggedIn('b340');
    const person = discordPerson('b340');
    const back = await linkCallback(await startLink(accessToken), person, accessToken);
    assert.equal(back.res.location, `${FRONT}/account?socialLinkSuccess=discord`);
    const rows = await db.ExternalIdentity.findAll({ where: { provider: 'discord', subject: person.id }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.uuid);
    // 연결된 디스코드로 소셜 로그인
    const login = await h.startSocial(app.base, 'discord', {});
    const loginBack = await h.socialCallback(app.base, 'discord', { state: login.state, code: fake.codeFor(person), attempt: login.attempt });
    assert.equal(loginBack.res.location, `${FRONT}/lobby`);
    assert.equal(h.decodeJwt(loginBack.cookies.accessToken).uuid, user.uuid);
});

test('A11-B-341 연결 시작 → 다시 로그인(새 세션) → 콜백 → STATE_USER_MISMATCH, 연결 줄 없음', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken } = await loggedIn('b341');
    const started = await startLink(accessToken);
    const relogin = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    const person = discordPerson('b341');
    const back = await linkCallback(started, person, relogin.cookies.accessToken);
    assert.equal(back.url.searchParams.get('socialLinkError'), 'STATE_USER_MISMATCH');
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject: person.id } }), 0);
});

// 만료된 access = 같은 키·같은 세션 id로 지난 시각 토큰 (세션은 살아 있음)
test('A11-B-342 연결 시작 → access 만료(세션 살아 있음) → 콜백 → 연결 됨', async (t) => {
    if (h.noDb(t)) return;
    const { user, accessToken, sessionId } = await loggedIn('b342');
    const started = await startLink(accessToken);
    const expired = jwt.sign({ uuid: user.uuid, role: 'USER', sessionId, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const person = discordPerson('b342');
    const back = await linkCallback(started, person, expired);
    assert.equal(back.res.location, `${FRONT}/account?socialLinkSuccess=discord`);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject: person.id, user_id: user.uuid } }), 1);
});

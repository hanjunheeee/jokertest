'use strict';

// 로그인 기록 시험(시험 DB + 가짜 구글): 성공·실패 기록 칸, 마지막 로그인 시각, 로그아웃이 기록 닫기, 소셜 로그인·가입 기록
// 목록 A11-B-291~296 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a11a-auth-db-helpers');

const { db } = h;
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

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
const logout = (accessToken) => h.request(app.base, 'POST', '/auth/logout', { cookies: { accessToken } });
// 기록 칸 셋이 다 찼는지 (ip·브라우저 정보·기기 종류)
const assertFilled = (row, ip) => {
    assert.equal(row.ip_address, ip);
    assert.equal(row.user_agent, PHONE_UA);
    assert.equal(row.device_type, 'MOBILE');
};

test('A11-B-291 로그인 성공 → 기록 success true + ip·user_agent·device_type', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b291' });
    const ip = h.nextIp();
    const { res } = await h.loginOverHttp(app.base, { email: user.email, password: user.password, ip, userAgent: PHONE_UA });
    assert.equal(res.status, 200);
    const rows = await h.historyOf(user.uuid);
    assert.equal(rows.length, 1);
    assert.equal(Boolean(rows[0].success), true);
    assertFilled(rows[0], ip);
});

test('A11-B-292 틀린 비번 → 기록 success false + ip·user_agent·device_type', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b292' });
    const ip = h.nextIp();
    const { res } = await h.loginOverHttp(app.base, { email: user.email, password: 'wrong-pass-9', ip, userAgent: PHONE_UA });
    assert.equal(res.status, 401);
    const rows = await h.historyOf(user.uuid);
    assert.equal(rows.length, 1);
    assert.equal(Boolean(rows[0].success), false);
    assertFilled(rows[0], ip);
});

test('A11-B-293 로그인 성공 → users.last_login_at 바뀜', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b293' });
    assert.equal((await h.userRow(user.uuid)).last_login_at, null);
    const before = Math.floor(Date.now() / 1000) * 1000;
    await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    const after = (await h.userRow(user.uuid)).last_login_at;
    assert.ok(after && new Date(after).getTime() >= before - 1000, `마지막 로그인 시각 안 바뀜: ${after}`);
});

test('A11-B-294 로그인 → 로그아웃 → 마지막 성공 기록 logout_at 채움', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b294' });
    const { cookies } = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    assert.equal((await logout(cookies.accessToken)).status, 200);
    const rows = await h.historyOf(user.uuid);
    assert.ok(rows.at(-1).logout_at, '로그아웃 시각 없음');
});

test('A11-B-295 이미 끊긴 옛 세션으로 로그아웃 → 새 기기 기록 logout_at 그대로', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser({ label: 'b295' });
    const deviceA = await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    await h.loginOverHttp(app.base, { email: user.email, password: user.password });
    await logout(deviceA.cookies.accessToken);
    const rows = await h.historyOf(user.uuid);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].logout_at, null);
});

test('A11-B-296 소셜 로그인 → 기록 success true + last_login_at / 소셜 가입 마무리 → 기록 1줄', async (t) => {
    if (h.noDb(t)) return;
    // 연결된 구글 계정으로 로그인
    const user = await h.createUser({ label: 'b296' });
    const person = { sub: h.tag('g-b296-'), email: user.email, email_verified: true };
    await db.ExternalIdentity.create({ provider: 'google', subject: person.sub, user_id: user.uuid, email_snapshot: user.email });
    const started = await h.startSocial(app.base, 'google', {});
    await h.socialCallback(app.base, 'google', { state: started.state, code: fake.codeFor(person), attempt: started.attempt });
    const rows = await h.historyOf(user.uuid);
    assert.equal(rows.length, 1);
    assert.equal(Boolean(rows[0].success), true);
    assert.ok((await h.userRow(user.uuid)).last_login_at, '마지막 로그인 시각 없음');
    // 처음 구글 → 가입 마무리
    const newcomer = { sub: h.tag('g-b296n-'), email: h.emailOf('b296n'), email_verified: true };
    const s2 = await h.startSocial(app.base, 'google', {});
    const back = await h.socialCallback(app.base, 'google', { state: s2.state, code: fake.codeFor(newcomer), attempt: s2.attempt });
    const done = await h.request(app.base, 'POST', '/auth/social/signup/complete', {
        body: {
            intentToken: back.url.searchParams.get('socialIntent'), nickname: h.nicknameOf('b296'), birthDate: '2000-01-01',
            agreedTermsVersionIds: await h.currentTermIds(), ageConfirmed: true,
        },
        cookies: { oauthAttempt: back.cookies.oauthAttempt },
    });
    assert.equal(done.status, 200, `준비: 소셜 가입 ${done.status}`);
    assert.equal((await h.historyOf(done.body.data.user.uuid)).length, 1);
});

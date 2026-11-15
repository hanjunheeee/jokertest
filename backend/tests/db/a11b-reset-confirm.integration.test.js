'use strict';

// 비번 재설정 새 비번 저장(confirm) 시험(시험 DB, 진짜 경로) — 성공·새 비번만·옛 세션 끊김·두 번·만료·규칙 경계·빈칸 안 자름·소셜 방어·정지 그대로·비밀·캐시
// 목록 A11-B-651~670 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb, mailsTo, tokenOf } = h;
const NEW_PW = 'NewPass-2026';

test.before(h.prepareDb);
test.after(h.closeDb);

const verify = (app, token) => app.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
const confirm = (app, token, newPassword = NEW_PW) => app.post('/auth/password-reset/confirm', { token, newPassword });

// 비번 계정 하나 + 재설정 요청 → 메일 링크 토큰
async function requested(app, prefix = 'c') {
    const user = await h.createLocalUser({ prefix });
    const res = await app.post('/auth/password-reset/request', { email: user.email });
    assert.equal(res.status, 200, '준비: 재설정 요청');
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일이 나감');
    return { user, token: tokenOf(sent) };
}

test('A11-B-651 맞는 토큰 + 새 비번 NewPass-2026 → 200 { ok:true }', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await confirm(app, token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
});

// ── 새 비번만 됨 (652~653) ──

test('A11-B-652 재설정 뒤 새 비번 로그인 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal((await confirm(app, token)).status, 200, '준비: 저장');
    assert.equal((await h.login(app, user.email, NEW_PW)).status, 200);
});

test('A11-B-653 재설정 뒤 옛 비번 로그인 → 401', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal((await confirm(app, token)).status, 200, '준비: 저장');
    assert.equal((await h.login(app, user.email, user.password)).status, 401);
});

// ── 옛 세션 끊김 (654~655): PC·폰 세션 둘 ──

async function twoDevices(t, prefix) {
    const app = await h.startApp(t);
    const { user, token } = await requested(app, prefix);
    const pc = await h.sessionFor(user.uuid, { rememberMe: true });
    const phone = await h.otherDeviceSession(user.uuid);
    return { app, user, token, pc, phone };
}

test('A11-B-654 PC·폰 세션 둘 있는 채 재설정 → 둘 다 보호 경로 401', async (t) => {
    if (noDb(t)) return;
    const { app, token, pc, phone } = await twoDevices(t, 'cs');
    for (const s of [pc, phone]) {
        assert.equal((await app.get('/user/me/profile', { cookie: s.cookie })).status, 200, '준비: 세션 살아 있음');
    }
    assert.equal((await confirm(app, token)).status, 200, '준비: 저장');
    for (const [name, s] of [['PC', pc], ['폰', phone]]) {
        assert.equal((await app.get('/user/me/profile', { cookie: s.cookie })).status, 401, `${name} 세션이 살아 있음`);
    }
});

test('A11-B-655 PC·폰 세션 둘 있는 채 재설정 → 둘 다 refresh 401', async (t) => {
    if (noDb(t)) return;
    const { app, token, pc, phone } = await twoDevices(t, 'cr');
    // 준비: 두 세션 다 refresh 됨 (새로 받은 refresh로 바꿔 둠)
    const fresh = [];
    for (const s of [pc, phone]) {
        const r = await h.refreshWith(app, s);
        assert.equal(r.status, 200, '준비: refresh 됨');
        fresh.push({ refresh: r.refresh });
    }
    assert.equal((await confirm(app, token)).status, 200, '준비: 저장');
    for (const [i, s] of fresh.entries()) {
        assert.equal((await h.refreshWith(app, s)).status, 401, `${i === 0 ? 'PC' : '폰'} refresh가 됨`);
    }
});

test('A11-B-656 성공한 토큰으로 다시 저장 → 400 USED, 비번은 첫 번째 값 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal((await confirm(app, token, 'FirstPass-2026')).status, 200, '준비: 첫 저장');
    const hashAfterFirst = await h.hashOf(user.uuid);
    const res = await confirm(app, token, 'SecondPass-2026');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'USED');
    assert.equal(await h.hashOf(user.uuid), hashAfterFirst);
    assert.equal((await h.login(app, user.email, 'FirstPass-2026')).status, 200);
});

test('A11-B-657 verify VALID → 가짜 시계 31분 → 저장 → 400 EXPIRED, 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const { user, token } = await requested(app);
    assert.deepEqual((await verify(app, token)).body, { ok: true, status: 'VALID' }, '준비: 링크 열림');
    const before = await h.hashOf(user.uuid);
    app.clock.tick(31 * 60 * 1000);
    const res = await confirm(app, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'EXPIRED');
    assert.equal(await h.hashOf(user.uuid), before);
});

// ── 새 비번 규칙 (658~663) ──

const REJECTED = [
    ['A11-B-658', '7자', 'Pass123'],
    ['A11-B-659', '65자', 'p'.repeat(65)],
    ['A11-B-660', '한글 25자(75바이트)', '가'.repeat(25)],
];

for (const [id, name, pw] of REJECTED) {
    test(`${id} 새 비번 ${name} → 400 INVALID_PASSWORD, 비번 그대로, 토큰 안 씀`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const { user, token } = await requested(app);
        const before = await h.hashOf(user.uuid);
        const res = await confirm(app, token, pw);
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_PASSWORD');
        assert.equal(await h.hashOf(user.uuid), before);
        assert.deepEqual((await verify(app, token)).body, { ok: true, status: 'VALID' });
    });
}

const ACCEPTED = [
    ['A11-B-661', '8자', 'Pass1234'],
    ['A11-B-662', '64자', 'q'.repeat(64)],
    ['A11-B-663', '한글 24자(72바이트)', '나'.repeat(24)],
];

for (const [id, name, pw] of ACCEPTED) {
    test(`${id} 새 비번 ${name} → 200, 그 비번으로 로그인 됨`, async (t) => {
        if (noDb(t)) return;
        const app = await h.startApp(t);
        const { user, token } = await requested(app);
        const res = await confirm(app, token, pw);
        assert.equal(res.status, 200);
        assert.equal((await h.login(app, user.email, pw)).status, 200);
    });
}

test('A11-B-664 새 비번 앞뒤 빈칸 안 자름 → 빈칸 붙인 값만 로그인 200, 뺀 값 401', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal((await confirm(app, token, ' Pass1234 ')).status, 200, '준비: 저장');
    assert.equal((await h.login(app, user.email, ' Pass1234 ')).status, 200);
    assert.equal((await h.login(app, user.email, 'Pass1234')).status, 401);
});

// ── 모양 틀린 토큰 (665~666) ──

test('A11-B-665 token 칸 없음 → 400 INVALID, 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user } = await requested(app);
    const before = await h.hashOf(user.uuid);
    const res = await app.post('/auth/password-reset/confirm', { newPassword: NEW_PW });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-666 토큰 42자 → 400 INVALID, 비번 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    const before = await h.hashOf(user.uuid);
    const res = await confirm(app, token.slice(0, 42));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-667 소셜 전용 계정 토큰 줄을 DB에 직접 넣고 저장 → 400 SOCIAL_ONLY, 비번 해시 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const user = await h.createSocialUser({ prefix: 'cso' });
    const raw = crypto.randomBytes(32).toString('base64url');
    await db.PasswordResetToken.create({
        user_id: user.uuid,
        token: null,
        token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
        expired_at: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
    });
    const before = await h.hashOf(user.uuid);
    const res = await confirm(app, raw);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SOCIAL_ONLY');
    assert.equal(await h.hashOf(user.uuid), before);
});

test('A11-B-668 정지 계정 재설정 → 200, status·role 그대로, 새 비번 로그인은 정지 403', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app, 'cb');
    await db.UserBan.create({ user_id: user.uuid, reason: '시험 정지', is_permanent: true });
    const before = await h.userRow(user.uuid);
    const res = await confirm(app, token);
    assert.equal(res.status, 200);
    const after = await h.userRow(user.uuid);
    assert.equal(after.status, before.status);
    assert.equal(after.role, before.role);
    assert.equal((await h.login(app, user.email, NEW_PW)).status, 403);
});

test('A11-B-669 저장 요청 → 응답 본문·서버 출력 줄에 토큰 원문·새 비번·이메일 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    // 저장하는 동안 서버가 찍는 줄 모으기 (원래 출력도 그대로 냄)
    const lines = [];
    for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[name];
        t.mock.method(console, name, (...args) => { lines.push(args.map(String).join(' ')); original.apply(console, args); });
    }
    const res = await confirm(app, token);
    for (const name of ['log', 'info', 'warn', 'error', 'debug']) console[name].mock.restore();
    assert.equal(res.status, 200, '준비: 저장');
    for (const secret of [token, NEW_PW, user.email]) {
        assert.ok(!res.text.includes(secret), `응답에 비밀이 실림: ${secret}`);
        assert.ok(!lines.some((line) => line.includes(secret)), `서버 출력에 비밀이 찍힘: ${secret}`);
    }
});

test('A11-B-670 저장 응답 Cache-Control: no-store', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await confirm(app, token);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

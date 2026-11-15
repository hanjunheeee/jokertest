'use strict';

// 비번 재설정 링크 확인(verify) 시험(시험 DB, 진짜 경로) — 쓸 수 있음·잘못됨·쓴 것·지난 것(30분 경계)·확인은 토큰을 안 씀·캐시·ip 제한(저장과 같이 셈)
// 목록 A11-B-631~645 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb, mailsTo, tokenOf } = h;
const MINUTE = 60 * 1000;

test.before(h.prepareDb);
test.after(h.closeDb);

const verify = (app, token) => app.get(`/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
const confirm = (app, token, newPassword = 'NewPass-2026') => app.post('/auth/password-reset/confirm', { token, newPassword });

// 비번 계정 하나 + 재설정 요청 → 메일 링크 토큰
async function requested(app, prefix = 'v') {
    const user = await h.createLocalUser({ prefix });
    const res = await app.post('/auth/password-reset/request', { email: user.email });
    assert.equal(res.status, 200, '준비: 재설정 요청');
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일이 나감');
    return { user, token: tokenOf(sent) };
}

const INVALID = { ok: false, code: 'INVALID' };

test('A11-B-631 방금 받은 토큰 → 200 { ok:true, status:VALID }', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await verify(app, token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: 'VALID' });
});

// ── 잘못된 링크 (632~635) ──

test('A11-B-632 42자 토큰 → 200 { ok:false, code:INVALID }', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await verify(app, token.slice(0, 42));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, INVALID);
});

test('A11-B-633 모양은 맞는데 없는 43자 → 200 INVALID', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await verify(app, crypto.randomBytes(32).toString('base64url'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, INVALID);
});

test('A11-B-634 token 칸 없음 → 200 INVALID', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await app.get('/auth/password-reset/verify');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, INVALID);
});

test('A11-B-635 ?token=a&token=b 두 번 → 200 INVALID (쓸 수 있는 토큰을 두 번 넣어도)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await app.get(`/auth/password-reset/verify?token=${token}&token=${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, INVALID);
});

test('A11-B-636 저장(confirm) 끝난 토큰 → { ok:false, code:USED }', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    assert.equal((await confirm(app, token)).status, 200, '준비: 저장 성공');
    const res = await verify(app, token);
    assert.deepEqual(res.body, { ok: false, code: 'USED' });
});

test('A11-B-637 가짜 시계 31분 뒤 → { ok:false, code:EXPIRED }', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const { token } = await requested(app);
    app.clock.tick(31 * MINUTE);
    const res = await verify(app, token);
    assert.deepEqual(res.body, { ok: false, code: 'EXPIRED' });
});

// ── 30분 경계 (638~639) ──

test('A11-B-638 만든 뒤 29분 59초 → VALID', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const { token } = await requested(app);
    app.clock.tick(30 * MINUTE - 1000);
    const res = await verify(app, token);
    assert.deepEqual(res.body, { ok: true, status: 'VALID' });
});

test('A11-B-639 만든 뒤 30분 0초 → EXPIRED', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t, { clock: true });
    const { token } = await requested(app);
    app.clock.tick(30 * MINUTE);
    const res = await verify(app, token);
    assert.deepEqual(res.body, { ok: false, code: 'EXPIRED' });
});

// ── 확인은 토큰을 안 씀 (640~642): 같은 토큰으로 verify 3번 ──

async function verifiedThreeTimes(t, prefix) {
    const app = await h.startApp(t);
    const { user, token } = await requested(app, prefix);
    const session = await h.sessionFor(user.uuid);
    const hashBefore = await h.hashOf(user.uuid);
    for (let i = 0; i < 3; i += 1) {
        assert.deepEqual((await verify(app, token)).body, { ok: true, status: 'VALID' }, `준비: ${i + 1}번째 확인`);
    }
    return { app, user, token, session, hashBefore };
}

test('A11-B-640 verify 3번 뒤 토큰 줄 used 그대로 false', async (t) => {
    if (noDb(t)) return;
    const { user } = await verifiedThreeTimes(t, 'vu');
    const rows = await db.PasswordResetToken.findAll({ where: { user_id: user.uuid }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(Boolean(rows[0].used), false);
    assert.equal(rows[0].revoked_at, null);
});

test('A11-B-641 verify 3번 뒤 비번 해시 그대로', async (t) => {
    if (noDb(t)) return;
    const { user, hashBefore } = await verifiedThreeTimes(t, 'vh');
    assert.equal(await h.hashOf(user.uuid), hashBefore);
});

test('A11-B-642 verify 3번 뒤 그 계정 세션 그대로 살아 있음', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await verifiedThreeTimes(t, 'vs');
    const res = await app.get('/user/me/profile', { cookie: session.cookie });
    assert.equal(res.status, 200);
});

test('A11-B-643 verify 응답 Cache-Control: no-store', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    const res = await verify(app, token);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

// ── 확인 ip 10분 20번, verify·confirm 같이 셈 (644~645) ──

test('A11-B-644 같은 ip verify만 20번째 → 200', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    let res = null;
    for (let i = 0; i < 20; i += 1) res = await verify(app, token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: 'VALID' });
});

test('A11-B-645 verify 10번 + confirm 10번 뒤 verify 21번째 → 429', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { token } = await requested(app);
    for (let i = 0; i < 10; i += 1) assert.equal((await verify(app, token)).status, 200, `준비: verify ${i + 1}`);
    // 저장은 모양 틀린 토큰으로 (진짜 토큰을 안 쓰게)
    for (let i = 0; i < 10; i += 1) assert.equal((await confirm(app, 'short')).status, 400, `준비: confirm ${i + 1}`);
    const res = await verify(app, token);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

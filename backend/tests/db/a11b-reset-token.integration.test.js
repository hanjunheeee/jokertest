'use strict';

// 비번 재설정 토큰 DB 시험(시험 DB, 진짜 경로) — 원문 안 남김(해시만)·30분 만료 칸·쓴 표시·동시 저장 하나만·로컬 비번 표시 그대로
// 목록 A11-B-851~855·873 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb, mailsTo, tokenOf } = h;

test.before(h.prepareDb);
test.after(h.closeDb);

const confirm = (app, token, newPassword) => app.post('/auth/password-reset/confirm', { token, newPassword });
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// 비번 계정 하나 + 재설정 요청 → 메일 링크 토큰·요청 앞뒤 시각
async function requested(app, prefix = 't') {
    const user = await h.createLocalUser({ prefix });
    const startedAt = Date.now();
    const res = await app.post('/auth/password-reset/request', { email: user.email });
    const endedAt = Date.now();
    assert.equal(res.status, 200, '준비: 재설정 요청');
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일이 나감');
    return { user, token: tokenOf(sent), startedAt, endedAt };
}

const rowsOf = (uuid) => db.PasswordResetToken.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });

test('A11-B-851 재설정 요청 → 새 줄 token_hash = 링크 토큰 sha256, token 칸 null, 원문은 어느 칸에도 없음', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    const rows = await rowsOf(user.uuid);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.token_hash, sha256(token));
    assert.equal(row.token, null);
    for (const [column, value] of Object.entries(row)) {
        assert.ok(!String(value).includes(token), `${column} 칸에 토큰 원문이 있음`);
    }
});

test('A11-B-852 같은 줄 expired_at = 만든 시각 + 30분 (±1초)', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, startedAt, endedAt } = await requested(app);
    const [row] = await rowsOf(user.uuid);
    const expires = new Date(row.expired_at).getTime();
    const created = new Date(row.created_at).getTime();
    const THIRTY = 30 * 60 * 1000;
    assert.ok(Math.abs(expires - (created + THIRTY)) <= 1000, `만든 시각 기준 차이 ${expires - (created + THIRTY)}ms`);
    // 요청한 동안의 시각 + 30분 안 (초 단위 칸이라 앞뒤 1초)
    assert.ok(expires >= startedAt + THIRTY - 1000 && expires <= endedAt + THIRTY + 1000);
});

test('A11-B-853 저장 성공 → 그 줄 used = true', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal((await confirm(app, token, 'NewPass-2026')).status, 200, '준비: 저장');
    const [row] = await rowsOf(user.uuid);
    assert.equal(Boolean(row.used), true);
});

test('A11-B-854 같은 토큰 confirm 두 개 동시에 → 200 정확히 1개, 나머지 USED, 비번은 그 값 하나로 바뀜', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app, 'tc');
    const before = await h.hashOf(user.uuid);
    const results = await Promise.all([confirm(app, token, 'SamePass-2026'), confirm(app, token, 'SamePass-2026')]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 400]);
    assert.equal(results.find((r) => r.status === 400).body.code, 'USED');
    assert.notEqual(await h.hashOf(user.uuid), before);
    assert.equal((await h.login(app, user.email, 'SamePass-2026')).status, 200);
    // 쓴 줄 하나, 쓴 표시 한 번
    const rows = await rowsOf(user.uuid);
    assert.equal(rows.filter((r) => Boolean(r.used)).length, 1);
});

test('A11-B-855 같은 토큰 + 다른 새 비번 둘 동시에 → 200 받은 쪽 비번만 로그인 됨', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app, 'td');
    const pws = ['AlphaPass-2026', 'BravoPass-2026'];
    const results = await Promise.all(pws.map((pw) => confirm(app, token, pw)));
    const okIndex = results.findIndex((r) => r.status === 200);
    assert.notEqual(okIndex, -1, '둘 다 실패');
    assert.equal(results.filter((r) => r.status === 200).length, 1, '둘 다 성공');
    assert.equal((await h.login(app, user.email, pws[okIndex])).status, 200);
    assert.equal((await h.login(app, user.email, pws[1 - okIndex])).status, 401);
});

test('A11-B-873 재설정 성공 → has_local_password = true 그대로', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const { user, token } = await requested(app);
    assert.equal(Boolean((await h.userRow(user.uuid)).has_local_password), true, '준비: 비번 있는 계정');
    assert.equal((await confirm(app, token, 'NewPass-2026')).status, 200, '준비: 저장');
    assert.equal(Boolean((await h.userRow(user.uuid)).has_local_password), true);
});

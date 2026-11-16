'use strict';

// 비번 재설정·비번 바꾸기·탈퇴 뒤 소켓 끊김 시험(시험 DB) — 세션 주기 검사 5초 안 끊김, 탈퇴는 주기 검사 안 기다리고 ACCOUNT_WITHDRAWN 먼저
// 목록 A11-B-901~905 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 진짜 DB 세션을 봐서 돌리기는 with-lock.sh testdb (시험_도우미.md 3-3)
// 틀(시험 DB 준비·사람·세션·메일)은 a11b-harness, 소켓 세상은 a10-world(진짜 연결 처리기 + 가짜 시계)
const h = require('../db/a11b-harness');
const { makeWorld } = require('./a10-world');

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const { authenticateSocket } = require('../../socket/connection/auth');
const passwordReset = require('../../services/auth/passwordReset');
const { changePassword } = require('../../services/auth/account/password');
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const withdrawRepository = require('../../repositories/user/withdraw');

const { noDb, mailsTo, tokenOf } = h;

test.before(h.prepareDb);
test.after(h.closeDb);

// 접속 인증 한 번 → { err, socket } (통과면 socket.data.user에 토큰 값)
function handshake(token) {
    const socket = { data: {}, handshake: { headers: { cookie: `accessToken=${token}` } } };
    return new Promise((resolve) => authenticateSocket(socket, (err) => resolve({ err, socket })));
}

// 세션 하나로 소켓 붙이기 (접속 인증을 진짜로 거침)
async function connectWith(w, uuid, session) {
    const { err, socket: authed } = await handshake(session.access);
    assert.equal(err, undefined, `준비: 접속 거절 ${err?.message}`);
    return w.connect(uuid, { user: authed.data.user });
}

// DB 일이 끝날 때까지 기다림 (가짜 시계라 setImmediate로 돌리고 진짜 시간으로 끊음)
async function waitFor(check, label, timeoutMs = 8_000) {
    const until = performance.now() + timeoutMs;
    while (performance.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`기다려도 안 됨: ${label}`);
}

const firstKickCode = (w, socket) => w.received(socket, 'force_disconnect')[0]?.code;

test('A11-B-901 소켓 붙은 계정 재설정 → 세션 주기 검사(5초) 안에 그 소켓 끊김', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const user = await h.createLocalUser({ prefix: 'k' });
    const socket = await connectWith(w, user.uuid, await h.sessionFor(user.uuid));
    assert.equal(socket.connected, true, '준비: 접속 됨');
    // 재설정 메일 → 링크 토큰 → 새 비번 저장 (다른 기기에서 한 것)
    assert.deepEqual(await passwordReset.requestPasswordReset({ email: user.email }), { ok: true });
    const sent = mailsTo(user.email, 'PASSWORD_RESET').at(-1);
    assert.ok(sent, '준비: 재설정 메일');
    assert.deepEqual(await passwordReset.confirmPasswordReset(tokenOf(sent), 'NewPass-2026'), { ok: true });
    await w.tick(5_000);
    await waitFor(() => socket.connected === false, '재설정 뒤 소켓 끊김');
    assert.equal(socket.connected, false);
    assert.equal(firstKickCode(w, socket), 'SESSION_EXPIRED');
});

// 한 계정에 소켓은 하나뿐 (새로 붙으면 먼저 붙은 쪽이 밀려남) → 붙어 있는 소켓 하나로 봄
test('A11-B-902 소켓 붙은 계정 → 비번 바꾸기 성공 → 5초 안 그 소켓 끊김', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const user = await h.createLocalUser({ prefix: 'k' });
    const here = await connectWith(w, user.uuid, await h.sessionFor(user.uuid));
    assert.equal(here.connected, true, '준비: 접속 됨');
    const outcome = await changePassword({ uuid: user.uuid, currentPassword: user.password, newPassword: 'Changed-2026' });
    assert.equal(outcome.ok, true, '준비: 비번 바뀜');
    await w.tick(5_000);
    await waitFor(() => here.connected === false, '비번 바꾼 뒤 소켓 끊김');
    assert.equal(here.connected, false);
    assert.equal(firstKickCode(w, here), 'SESSION_EXPIRED', `소켓 끊김 까닭: ${firstKickCode(w, here)}`);
});

// 한 계정에 소켓은 하나뿐 (새로 붙으면 먼저 붙은 쪽이 밀려남) → 붙어 있는 소켓 하나로 봄
test('A11-B-903 소켓 붙은 계정 → 탈퇴 → force_disconnect ACCOUNT_WITHDRAWN 받고 끊김 (주기 검사 안 기다림)', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const user = await h.createLocalUser({ prefix: 'k' });
    const tab = await connectWith(w, user.uuid, await h.sessionFor(user.uuid));
    assert.equal(tab.connected, true, '준비: 접속 됨');
    assert.deepEqual(await withdrawAccount({ uuid: user.uuid, password: user.password }), { ok: true });
    // 시계는 안 넘김 (주기 검사 없이 바로)
    await w.settle();
    assert.equal(tab.connected, false);
    assert.equal(w.received(tab, 'force_disconnect').at(-1)?.code, 'ACCOUNT_WITHDRAWN', `끊김 까닭: ${firstKickCode(w, tab)}`);
});

test('A11-B-904 탈퇴 때 소켓이 처음 받은 끊김 까닭이 ACCOUNT_WITHDRAWN (세션 만료 아님)', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const user = await h.createLocalUser({ prefix: 'k' });
    const session = await h.sessionFor(user.uuid);
    await connectWith(w, user.uuid, session);
    const tab = await connectWith(w, user.uuid, session);
    // 탈퇴 때 붙어 있던 소켓만 봄
    assert.equal(tab.connected, true, '준비: 접속 됨');
    const kicksBefore = w.received(tab, 'force_disconnect').length;
    assert.deepEqual(await withdrawAccount({ uuid: user.uuid, password: user.password }), { ok: true });
    await w.settle();
    // 주기 검사가 한 번 더 돌아도 처음 까닭은 그대로
    await w.tick(5_000);
    const kicks = w.received(tab, 'force_disconnect').slice(kicksBefore);
    assert.ok(kicks.length >= 1, '끊김 안내 없음');
    assert.equal(kicks[0].code, 'ACCOUNT_WITHDRAWN');
    assert.equal(tab.connected, false);
});

// 탈퇴 직후 바로 끊는 길(A11-B-903·904)이 아니라 세션 주기 검사가 끊는 길: 다른 서버에서 탈퇴가 끝나 안내가 이 소켓에 안 닿은 경우
test('A11-B-905 탈퇴한 계정의 살아 있던 소켓 → 다음 세션 주기 검사(5초)에서 force_disconnect ACCOUNT_WITHDRAWN으로 끊김', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const user = await h.createLocalUser({ prefix: 'k' });
    const socket = await connectWith(w, user.uuid, await h.sessionFor(user.uuid));
    assert.equal(socket.connected, true, '준비: 접속 됨');
    // DB에서만 탈퇴 처리 (탈퇴 서비스의 "바로 끊기"는 안 거침)
    await h.db.sequelize.transaction(async (transaction) => {
        await withdrawRepository.detachAccount(user.uuid, user.email, { transaction });
        await withdrawRepository.closeAccount(user.uuid, { transaction });
    });
    assert.equal(socket.connected, true, '준비: 아직 붙어 있음');
    await w.tick(5_000);
    await waitFor(() => socket.connected === false, '탈퇴 뒤 세션 검사로 소켓 끊김');
    assert.equal(firstKickCode(w, socket), 'ACCOUNT_WITHDRAWN');
});

'use strict';

// 소켓 연결 시험: 접속 인증·사건마다 세션 검사·주기 검사·한 계정 한 소켓(force_disconnect code)·알림 준비
// + 입장 시도 제한·코드 입장 요청 검사·인원 규칙 (가짜 시계, 진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const presenceService = require('../../services/presence/status');
const matchmaking = require('../../socket/matchmaking');
const notificationService = require('../../services/notification');
const { onlineUsers } = require('../../socket/emitter');
const auth = require('../../socket/connection/auth');
const presence = require('../../socket/connection/presence');
const { registerNotificationHandlers } = require('../../socket/connection/notifications');
const entryLimits = require('../../socket/matchmaking/join/entryLimits');
const guards = require('../../socket/matchmaking/join/guards');
const config = require('../../socket/matchmaking/core/config');

// 가짜 소켓 (사건 등록·보낸 것·끊김 기록)
function makeSocket({ id = 'sock-1', user = { uuid: 'me' }, cookie = '' } = {}) {
    const listeners = new Map();
    return {
        id,
        data: { user },
        handshake: { headers: { cookie } },
        emitted: [],
        disconnected: 0,
        on(event, fn) { listeners.set(event, fn); },
        emit(event, payload) { this.emitted.push({ event, payload }); },
        disconnect() { this.disconnected += 1; },
        fire(event, ...args) { return listeners.get(event)(...args); },
    };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test.afterEach(() => {
    onlineUsers.clear();
    entryLimits.__resetEntryLimitsForTests();
});

// ── 접속 인증 ──
test('접속 인증: accessToken 쿠키 없으면 UNAUTHORIZED', async () => {
    const socket = makeSocket();
    const err = await new Promise((resolve) => auth.authenticateSocket(socket, resolve));
    assert.equal(err.message, 'UNAUTHORIZED');
});

test('접속 인증: 토큰 풀기 실패도 같은 UNAUTHORIZED', async (t) => {
    t.mock.method(sessionLifecycle, 'verifyAccessToken', () => { throw new Error('jwt malformed'); });
    const socket = makeSocket({ cookie: 'accessToken=bad' });
    const err = await new Promise((resolve) => auth.authenticateSocket(socket, resolve));
    assert.equal(err.message, 'UNAUTHORIZED');
});

test('접속 인증: 세션 끊긴 토큰이면 UNAUTHORIZED', async (t) => {
    t.mock.method(sessionLifecycle, 'verifyAccessToken', () => ({ uuid: 'me', sessionId: 's1' }));
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, message: '만료' }));
    const socket = makeSocket({ cookie: 'accessToken=tok' });
    const err = await new Promise((resolve) => auth.authenticateSocket(socket, resolve));
    assert.equal(err.message, 'UNAUTHORIZED');
});

test('접속 인증: 통과하면 socket.data.user에 풀린 토큰, next 인자 없음', async (t) => {
    t.mock.method(sessionLifecycle, 'verifyAccessToken', () => ({ uuid: 'me', sessionId: 's1' }));
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const socket = makeSocket({ cookie: 'accessToken=tok', user: undefined });
    const err = await new Promise((resolve) => auth.authenticateSocket(socket, resolve));
    assert.equal(err, undefined);
    assert.deepEqual(socket.data.user, { uuid: 'me', sessionId: 's1' });
});

// ── 사건마다 세션 검사 ──
test('사건 검사: 세션 살아 있으면 처리기 불림', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const socket = auth.wrapSocketWithSessionGuard(makeSocket());
    let called = 0;
    socket.on('ping_me', () => { called += 1; });
    await socket.fire('ping_me');
    assert.equal(called, 1);
});

test('사건 검사: 세션 끊겼으면 처리기 안 부르고 ack 실패 + force_disconnect SESSION_EXPIRED', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, message: '세션 끝' }));
    const socket = auth.wrapSocketWithSessionGuard(makeSocket());
    let called = 0;
    let ack = null;
    socket.on('do', () => { called += 1; });
    await socket.fire('do', {}, (res) => { ack = res; });
    assert.equal(called, 0);
    assert.equal(ack.code, 'SESSION_EXPIRED');
    assert.deepEqual(socket.emitted[0], { event: 'force_disconnect', payload: { message: '세션 끝', code: 'SESSION_EXPIRED' } });
    assert.equal(socket.disconnected, 1);
});

test('사건 검사: 검사 자체가 터지면 SESSION_CHECK_FAILED 답, 연결은 안 끊음', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => { throw new Error('db down'); });
    const socket = auth.wrapSocketWithSessionGuard(makeSocket());
    let ack = null;
    socket.on('do', () => {});
    await socket.fire('do', (res) => { ack = res; });
    assert.equal(ack.code, 'SESSION_CHECK_FAILED');
    assert.equal(socket.disconnected, 0);
});

// 저장 시간은 1초 → 5초(주기 검사 간격)로 늘림 (부하 줄이기 2026-11-09, docs/부하시험.md 11번)
test('사건 검사: 저장 시간(5초) 안 두 번째 사건은 DB 검사 안 함 (가짜 시계)', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const socket = auth.wrapSocketWithSessionGuard(makeSocket());
    socket.on('do', () => {});
    await socket.fire('do');
    t.mock.timers.tick(auth.EVENT_CHECK_CACHE_MS - 1);
    await socket.fire('do');
    assert.equal(resolve.mock.callCount(), 1);
    t.mock.timers.tick(1);
    await socket.fire('do');
    assert.equal(resolve.mock.callCount(), 2);
});

test('사건 검사: disconnect 처리기는 감싸지 않음 (세션 끊겨도 정리 돎)', async (t) => {
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, message: 'x' }));
    const socket = auth.wrapSocketWithSessionGuard(makeSocket());
    let cleaned = 0;
    socket.on('disconnect', () => { cleaned += 1; });
    socket.fire('disconnect');
    assert.equal(cleaned, 1);
    assert.equal(resolve.mock.callCount(), 0);
});

test('사건 검사: 로그인 유지 안 한 긴 토큰이 만료되면 DB 안 가고 끊음', async (t) => {
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const nowSec = Math.floor(Date.now() / 1000);
    const socket = auth.wrapSocketWithSessionGuard(makeSocket({ user: { uuid: 'me', iat: nowSec - 7200, exp: nowSec - 10 } }));
    let called = 0;
    socket.on('do', () => { called += 1; });
    await socket.fire('do');
    assert.equal(called, 0);
    assert.equal(resolve.mock.callCount(), 0);
    assert.equal(socket.emitted[0].payload.code, 'SESSION_EXPIRED');
});

// ── 주기 검사 ──
test('주기 검사: 5초마다 검사, 세션 끊겼으면 force_disconnect SESSION_EXPIRED', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, message: '로그아웃됨' }));
    const socket = makeSocket();
    const watcher = auth.startSessionRevocationWatcher(socket);
    t.after(() => watcher.stop());
    t.mock.timers.tick(auth.SESSION_CHECK_INTERVAL_MS);
    await flush();
    assert.equal(socket.emitted[0]?.payload.code, 'SESSION_EXPIRED');
    assert.equal(socket.disconnected, 1);
});

test('주기 검사: DB 오류는 3번 연달아일 때만 SESSION_CHECK_FAILED로 끊음', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    t.mock.method(sessionLifecycle, 'resolveSession', async () => { throw new Error('db'); });
    const socket = makeSocket();
    const watcher = auth.startSessionRevocationWatcher(socket);
    t.after(() => watcher.stop());
    for (let i = 0; i < auth.WATCH_FAILURE_LIMIT - 1; i += 1) {
        t.mock.timers.tick(auth.SESSION_CHECK_INTERVAL_MS);
        await flush();
    }
    assert.equal(socket.disconnected, 0);
    t.mock.timers.tick(auth.SESSION_CHECK_INTERVAL_MS);
    await flush();
    assert.equal(socket.disconnected, 1);
    assert.equal(socket.emitted.at(-1).payload.code, 'SESSION_CHECK_FAILED');
});

test('주기 검사: stop 뒤엔 검사 안 함', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const watcher = auth.startSessionRevocationWatcher(makeSocket());
    watcher.stop();
    t.mock.timers.tick(auth.SESSION_CHECK_INTERVAL_MS * 3);
    await flush();
    assert.equal(resolve.mock.callCount(), 0);
});

// ── 한 계정 한 소켓 ──
function presenceFakes(t) {
    const saved = [];
    t.mock.method(presenceService, 'setPresence', async (uuid, status) => { saved.push([uuid, status]); });
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => []);
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {});
    return saved;
}
// 가짜 io: to(채널)은 그 채널 든 소켓(소켓 id 채널 포함)에만 감, sent엔 받은 소켓 id로 남김
function presenceIo(sockets) {
    const map = new Map(sockets.map((s) => [s.id, s]));
    const sent = [];
    const to = (channel) => ({
        emit: (event, payload) => {
            for (const s of map.values()) {
                if (s.id !== channel && !s.rooms?.has?.(channel)) continue;
                sent.push({ id: s.id, event, payload });
            }
        },
    });
    return { sockets: { sockets: map }, sent, to };
}

test('한 계정 한 소켓: 같은 세션 새 탭이면 옛 소켓에 REPLACED_BY_SAME_SESSION', async (t) => {
    presenceFakes(t);
    const oldSocket = makeSocket({ id: 'old', user: { uuid: 'me', sessionId: 'S' } });
    const newSocket = makeSocket({ id: 'new', user: { uuid: 'me', sessionId: 'S' } });
    const io = presenceIo([oldSocket, newSocket]);
    onlineUsers.set('me', 'old');
    await presence.handleConnection(io, newSocket, 'me');
    assert.equal(oldSocket.emitted[0].event, 'force_disconnect');
    assert.equal(oldSocket.emitted[0].payload.code, 'REPLACED_BY_SAME_SESSION');
    assert.equal(oldSocket.data.forcedLogout, true);
    assert.equal(oldSocket.disconnected, 1);
    assert.equal(onlineUsers.get('me'), 'new');
});

test('한 계정 한 소켓: 다른 로그인이면 REPLACED_BY_OTHER_LOGIN', async (t) => {
    presenceFakes(t);
    const oldSocket = makeSocket({ id: 'old', user: { uuid: 'me', sessionId: 'A' } });
    const newSocket = makeSocket({ id: 'new', user: { uuid: 'me', sessionId: 'B' } });
    onlineUsers.set('me', 'old');
    await presence.handleConnection(presenceIo([oldSocket, newSocket]), newSocket, 'me');
    assert.equal(oldSocket.emitted[0].payload.code, 'REPLACED_BY_OTHER_LOGIN');
});

test('한 계정 한 소켓: 세션 id 없으면 다른 로그인으로 봄', async (t) => {
    presenceFakes(t);
    const oldSocket = makeSocket({ id: 'old', user: { uuid: 'me' } });
    const newSocket = makeSocket({ id: 'new', user: { uuid: 'me' } });
    onlineUsers.set('me', 'old');
    await presence.handleConnection(presenceIo([oldSocket, newSocket]), newSocket, 'me');
    assert.equal(oldSocket.emitted[0].payload.code, 'REPLACED_BY_OTHER_LOGIN');
});

test('한 계정 한 소켓: 밀려난 옛 소켓 끊김은 오프라인으로 안 바꿈', async (t) => {
    const saved = presenceFakes(t);
    const oldSocket = makeSocket({ id: 'old' });
    oldSocket.data.forcedLogout = true;
    onlineUsers.set('me', 'new');
    await presence.handleDisconnect(presenceIo([oldSocket]), oldSocket, 'me');
    assert.equal(onlineUsers.get('me'), 'new');
    assert.deepEqual(saved, []);
});

test('접속 상태: 접속하면 ONLINE 저장, 접속 중인 친구에게만 friend_status_change', async (t) => {
    const saved = presenceFakes(t);
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => ['f-on', 'f-off']);
    onlineUsers.set('f-on', 'sock-f');
    // 접속 중인 친구는 계정 채널(user:f-on)에 든 소켓 하나, 접속 안 한 친구 채널은 비어 있음
    const friendSocket = makeSocket({ id: 'sock-f', user: { uuid: 'f-on' } });
    friendSocket.rooms = new Set(['sock-f', 'user:f-on']);
    const socket = makeSocket({ id: 'mine' });
    const io = presenceIo([socket, friendSocket]);
    await presence.handleConnection(io, socket, 'me');
    assert.deepEqual(saved, [['me', 'ONLINE']]);
    assert.deepEqual(io.sent, [{ id: 'sock-f', event: 'friend_status_change', payload: { uuid: 'me', status: 'ONLINE' } }]);
});

test('접속 상태: 끊기면 목록에서 빠지고 OFFLINE 저장', async (t) => {
    const saved = presenceFakes(t);
    const socket = makeSocket({ id: 'mine' });
    onlineUsers.set('me', 'mine');
    await presence.handleDisconnect(presenceIo([socket]), socket, 'me');
    assert.equal(onlineUsers.has('me'), false);
    assert.deepEqual(saved, [['me', 'OFFLINE']]);
});

// ── 알림 준비 ──
test('알림 준비: 옛 소켓이면 STALE_SOCKET, 환영 알림 안 만듦', async (t) => {
    const ensure = t.mock.method(notificationService, 'ensureSystemWelcome', async () => ({ created: true }));
    const socket = makeSocket({ id: 'old' });
    onlineUsers.set('me', 'new');
    registerNotificationHandlers(socket, 'me');
    let res;
    socket.fire('notifications_ready', {}, (r) => { res = r; });
    assert.deepEqual(res, { ok: false, reason: 'STALE_SOCKET' });
    assert.equal(ensure.mock.callCount(), 0);
});

test('알림 준비: 지금 소켓이면 환영 알림 만들고 created 답', async (t) => {
    t.mock.method(notificationService, 'ensureSystemWelcome', async () => ({ created: true }));
    const socket = makeSocket({ id: 'cur' });
    onlineUsers.set('me', 'cur');
    registerNotificationHandlers(socket, 'me');
    const res = await new Promise((resolve) => socket.fire('notifications_ready', {}, resolve));
    assert.deepEqual(res, { ok: true, created: true });
});

test('알림 준비: 만들기 실패면 FAILED', async (t) => {
    t.mock.method(notificationService, 'ensureSystemWelcome', async () => { throw new Error('db'); });
    t.mock.method(console, 'error', () => {});
    const socket = makeSocket({ id: 'cur' });
    onlineUsers.set('me', 'cur');
    registerNotificationHandlers(socket, 'me');
    const res = await new Promise((resolve) => socket.fire('notifications_ready', {}, resolve));
    assert.deepEqual(res, { ok: false, reason: 'FAILED' });
});

// ── 입장 시도 제한 (순수 함수, 시각 직접 넘김) ──
test('입장 시도 제한: 1분 안 20번까지 true, 21번째 false', () => {
    for (let i = 0; i < entryLimits.JOIN_ATTEMPT_LIMIT; i += 1) {
        assert.equal(entryLimits.takeJoinAttempt('u', 1000 + i), true);
    }
    assert.equal(entryLimits.takeJoinAttempt('u', 1100), false);
});

test('입장 시도 제한: 1분 지나면 다시 셈', () => {
    for (let i = 0; i < 21; i += 1) entryLimits.takeJoinAttempt('u', 1000);
    assert.equal(entryLimits.takeJoinAttempt('u', 1000 + entryLimits.JOIN_ATTEMPT_WINDOW_MS), true);
});

test('입장 시도 제한: 59.999초 뒤엔 아직 막힘', () => {
    for (let i = 0; i < 21; i += 1) entryLimits.takeJoinAttempt('u', 0);
    assert.equal(entryLimits.takeJoinAttempt('u', entryLimits.JOIN_ATTEMPT_WINDOW_MS - 1), false);
});

// ── 코드 입장 요청 검사 ──
test('코드 입장 요청 검사: 배열·null·글자는 INVALID_REQUEST', () => {
    for (const bad of [null, [], 'ABC123', 7]) {
        assert.equal(guards.validateJoinRoomByCodeRequest(bad).code, 'INVALID_REQUEST');
    }
});

test('코드 입장 요청 검사: uuid 같은 다른 키 끼우면 거절', () => {
    assert.equal(guards.validateJoinRoomByCodeRequest({ roomCode: 'A', uuid: 'x' }).ok, false);
});

test('코드 입장 요청 검사: roomId 빈 글자면 거절, 없으면 null', () => {
    assert.equal(guards.validateJoinRoomByCodeRequest({ roomCode: 'A', roomId: '' }).ok, false);
    assert.deepEqual(guards.validateJoinRoomByCodeRequest({ roomCode: 'A' }), { ok: true, roomCode: 'A', roomId: null });
});

// ── 인원 규칙 ──
test('인원 규칙: 운영이면 최소 5명·방 크기 10/8/6/5', (t) => {
    const before = process.env.NODE_ENV;
    t.after(() => { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before; });
    process.env.NODE_ENV = 'production';
    assert.equal(config.getMinPlayers(), 5);
    assert.deepEqual(config.getSupportedRoomSizes(), [10, 8, 6, 5]);
});

test('인원 규칙: 개발이면 GAME_DEV_MIN_PLAYERS 따름, 틀린 값이면 1', (t) => {
    const before = { NODE_ENV: process.env.NODE_ENV, MIN: process.env.GAME_DEV_MIN_PLAYERS };
    t.after(() => {
        if (before.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.NODE_ENV;
        if (before.MIN === undefined) delete process.env.GAME_DEV_MIN_PLAYERS; else process.env.GAME_DEV_MIN_PLAYERS = before.MIN;
    });
    delete process.env.NODE_ENV;
    process.env.GAME_DEV_MIN_PLAYERS = '3';
    assert.equal(config.getMinPlayers(), 3);
    process.env.GAME_DEV_MIN_PLAYERS = 'abc';
    assert.equal(config.getMinPlayers(), 1);
});

test('자동 매칭 스위치: 기본값 꺼짐', () => {
    assert.equal(config.RANDOM_MATCH_ENABLED, false);
    assert.equal(config.isRandomMatchEnabled(), false);
});

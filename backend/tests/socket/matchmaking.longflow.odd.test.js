'use strict';

// 대기방 끝까지 가는 긴 흐름 시험: 사람 수 끝값(10명·5명)에서 방 만들기 → 입장 → 준비 → 시작까지, 중간중간 이상한 요청 섞기
// 진짜 DB 안 씀 (가짜 서비스), 운영 규칙(NODE_ENV=production)으로 5~10명 규칙 그대로 봄
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const matchmaking = require('../../socket/matchmaking');
const gameSession = require('../../game-core/gameSession');
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors');
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    readyPayload,
    startPayload,
} = require('../helpers/matchmakingFixtures');

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetPublicRooms,
    handleSetReady,
    handleStartGame,
    handleUpdateRoomSettings,
    removeFromRoom,
} = matchmaking.__testables;

// 가짜 서비스: 문을 걸면 열릴 때까지 기다림 (계정 읽기·시작 외형 읽기)
const fakes = { userGate: null, startGate: null, userCalls: 0 };
function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}
matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => {
        fakes.userCalls += 1;
        if (fakes.userGate) await fakes.userGate;
        return { uuid, nickname: `닉-${uuid}` };
    },
});
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (ids) => {
        if (fakes.startGate) await fakes.startGate;
        return Object.fromEntries(ids.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]));
    },
    getEmojiPalette: async () => ({ slots: [], owned: [] }),
});
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (ids) => new Map(ids.map((id) => [id, { totalGames: 0, winRate: 0 }])),
});

let savedEnv;
test.beforeEach(() => {
    savedEnv = { NODE_ENV: process.env.NODE_ENV, GAME_DEV_MIN_PLAYERS: process.env.GAME_DEV_MIN_PLAYERS };
    process.env.NODE_ENV = 'production';
    delete process.env.GAME_DEV_MIN_PLAYERS;
    fakes.userGate = null;
    fakes.startGate = null;
    fakes.userCalls = 0;
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setGameInviteServiceForTests({
        cancelPendingInvitesForRoom: async () => [],
        cancelPendingInvitesBetween: async () => [],
        recordEntryInterrupted: async () => true,
    });
});
test.afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setGameInviteServiceForTests(null);
});

const snapshot = () => matchmaking.__getStateSnapshotForTests();
const roomOf = (roomId) => snapshot().gameRooms.find(([id]) => id === roomId)?.[1];
const countEvent = (socket, event) => socket.emitted.filter((e) => e.event === event).length;
const lastEvent = (socket, event) => [...socket.emitted].reverse().find((e) => e.event === event);
const joinResult = (socket) => [...socket.emitted].reverse().find((e) => e.event === 'room_joined' || e.event === 'room_join_failed');

async function waitFor(check, label) {
    for (let i = 0; i < 400; i += 1) {
        if (check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`기다려도 안 됨: ${label}`);
}

function addSocket(io, uuid, id) {
    const socket = createFakeSocket(uuid, id ? { id } : {});
    io.sockets.sockets.set(socket.id, socket);
    return socket;
}

const settingsRequest = (room, overrides = {}) => ({
    roomId: room.roomId,
    requestId: `long-${Math.random().toString(36).slice(2)}`,
    expectedSettingsVersion: 1,
    accessType: 'code',
    maxPlayers: 10,
    jokerCount: 2,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 90,
    ...overrides,
});

test('[끝까지·10명 끝값] 동시 입장(따닥·틀린 코드 섞임) → 꽉 참 → 준비 전 시작 → 전원 준비 → 설정 바꿔 준비 풀림 → 옛 버전 준비·방장 아닌 시작 → 다시 준비 → 시작 따닥 → 판 하나 10명, 광대 2명, 방 흔적 없음', async () => {
    const hostSocket = createFakeSocket('host');
    const io = createFakeIo([hostSocket]);
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'host', validSettingsPayload({ maxPlayers: 10, jokerCount: 2 }));
    assert.equal(created.ok, true, created.message);
    const room = created.room;

    // 1) 9명 동시 입장 + p1 따닥 + 틀린 코드 하나
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const players = Array.from({ length: 9 }, (_, i) => [`p${i + 1}`, addSocket(io, `p${i + 1}`)]);
    const runs = players.map(([u, s]) => handleJoinRoomByCode(io, s, u, room.roomCode));
    const p1 = players[0][1];
    runs.push(handleJoinRoomByCode(io, p1, 'p1', room.roomCode));
    const stranger = addSocket(io, 'stranger');
    runs.push(handleJoinRoomByCode(io, stranger, 'stranger', 'ZZZZZZ'));
    await waitFor(() => fakes.userCalls >= before + 9, '9명 계정 읽기');
    gate.resolve();
    await Promise.all(runs);
    fakes.userGate = null;
    assert.equal(countEvent(p1, 'room_joined'), 1, 'p1 따닥은 한 번만 들어감');
    assert.equal(p1.emitted.find((e) => e.event === 'room_join_failed')?.payload.code, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS);
    assert.equal(joinResult(stranger)?.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH);
    assert.equal(roomOf(room.roomId).players.length, 10);

    // 2) 꽉 참: 목록 full, 11번째 ROOM_FULL
    const list = await callAsPromise(handleGetPublicRooms);
    assert.equal(list.rooms.find((r) => r.id === room.roomId)?.status, 'full');
    const eleventh = addSocket(io, 'p11');
    await handleJoinRoomByCode(io, eleventh, 'p11', room.roomCode);
    assert.equal(joinResult(eleventh)?.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL);

    // 3) 준비 전 시작 → PLAYERS_NOT_READY
    const tooEarly = await callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room));
    assert.equal(tooEarly.code, 'PLAYERS_NOT_READY');

    // 4) 전원 같은 순간 준비 → 마지막 답에 canStart
    const everyone = [['host', hostSocket], ...players];
    const readyAnswers = await Promise.all(everyone.map(([u, s]) => callAsPromise(handleSetReady, io, s, u, readyPayload(room))));
    assert.ok(readyAnswers.every((a) => a.ok === true), JSON.stringify(readyAnswers.filter((a) => !a.ok)));
    assert.equal(readyAnswers.filter((a) => a.canStart === true).length, 1, '마지막 한 명 답에서만 시작 가능');

    // 5) 방장이 설정 바꿈 → 버전 2, 전원 준비 풀림
    const changed = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host', settingsRequest(room, { dayDiscussionTime: 90 }));
    assert.equal(changed.ok, true, changed.message);
    assert.equal(changed.settingsVersion, 2);
    assert.ok(roomOf(room.roomId).players.every(([, p]) => p.isReady === false));

    // 6) 옛 버전 보고 누른 준비 → 충돌, 방장 아닌 사람 시작 → NOT_HOST
    const [, p3] = players[2];
    const stale = await callAsPromise(handleSetReady, io, p3, 'p3', readyPayload(room, true, { settingsVersion: 1 }));
    assert.equal(stale.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT);
    assert.equal(stale.settingsVersion, 2);
    const notHost = await callAsPromise(handleStartGame, io, p3, 'p3', startPayload(room, { settingsVersion: 2 }));
    assert.equal(notHost.code, 'NOT_HOST');

    // 7) 새 버전으로 다시 준비 (p5는 따닥: 순번은 한 번만)
    for (const [u, s] of everyone) {
        const res = await callAsPromise(handleSetReady, io, s, u, readyPayload(room, true, { settingsVersion: 2 }));
        assert.equal(res.ok, true, `${u}: ${res.message}`);
    }
    const [, p5] = players[4];
    const revisionOf = (u) => roomOf(room.roomId).players.find(([x]) => x === u)[1].readyRevision;
    const revisionBefore = revisionOf('p5');
    const again = await callAsPromise(handleSetReady, io, p5, 'p5', readyPayload(room, true, { settingsVersion: 2 }));
    assert.equal(again.ok, true);
    assert.equal(revisionOf('p5'), revisionBefore, '따닥 준비는 순번 안 올림');

    // 8) 시작 따닥 (외형 읽기 중 두 번째 도착)
    const startGate = deferred();
    fakes.startGate = startGate.promise;
    const s1 = callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room, { settingsVersion: 2 }));
    const s2 = callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room, { settingsVersion: 2 }));
    startGate.resolve();
    const starts = await Promise.all([s1, s2]);
    fakes.startGate = null;
    assert.equal(starts.filter((a) => a.ok).length, 1, JSON.stringify(starts));

    // 9) 끝 상태: 10명 각자 game_started 한 번, 같은 판, 광대 2명, 방·소속 비었음, 목록에서 빠짐
    const gameIds = new Set();
    let jokers = 0;
    for (const [u, s] of everyone) {
        assert.equal(countEvent(s, 'game_started'), 1, `${u} game_started 수`);
        const payload = lastEvent(s, 'game_started').payload;
        gameIds.add(payload.gameId);
        assert.equal(payload.state.players.length, 10);
        if (payload.state.self.role === 'JOKER') jokers += 1;
    }
    assert.equal(gameIds.size, 1);
    assert.equal(jokers, 2);
    assert.equal(roomOf(room.roomId), undefined);
    assert.equal(snapshot().playerRoom.length, 0);
    assert.equal(snapshot().pendingRoomTransitions.length, 0);
    const after = await callAsPromise(handleGetPublicRooms);
    assert.equal(after.rooms.some((r) => r.id === room.roomId), false);

    // 10) 끝난 뒤 이상한 요청: 늦은 입장은 이미 시작, 판 사람의 방 만들기는 게임 중 거절
    const late = addSocket(io, 'late');
    await handleJoinRoomByCode(io, late, 'late', room.roomCode);
    assert.equal(joinResult(late)?.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED);
    const sneaky = await callAsPromise(handleCreateRoom, io, p1, 'p1', validSettingsPayload({ maxPlayers: 5, jokerCount: 1 }));
    assert.equal(sneaky.ok, false);
    assert.equal(sneaky.code, ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME);
});

test('[끝값 5명·시작 중 나감] 5명 전원 준비 → 시작 처리 중 1명 나감 → 실패 → 4명이면 MIN_PLAYERS_NOT_MET → 새 사람 들어와 준비 → 5명으로 시작, 나간 사람은 판에 없음', async () => {
    const hostSocket = createFakeSocket('host');
    const io = createFakeIo([hostSocket]);
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'host', validSettingsPayload({ maxPlayers: 5, jokerCount: 1 }));
    assert.equal(created.ok, true, created.message);
    const room = created.room;
    const others = [];
    for (const u of ['a', 'b', 'c', 'd']) {
        const s = addSocket(io, u);
        await handleJoinRoomByCode(io, s, u, room.roomCode);
        assert.equal(joinResult(s)?.event, 'room_joined');
        others.push([u, s]);
    }
    for (const [u, s] of [['host', hostSocket], ...others]) {
        assert.equal((await callAsPromise(handleSetReady, io, s, u, readyPayload(room))).ok, true);
    }

    // 시작 외형 읽기 중 d가 나감
    const gate = deferred();
    fakes.startGate = gate.promise;
    const starting = callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room));
    const [, dSocket] = others[3];
    removeFromRoom(io, dSocket, 'd');
    gate.resolve();
    const first = await starting;
    fakes.startGate = null;
    assert.equal(first.ok, false);
    assert.equal(first.code, 'ROOM_STATE_CHANGED');
    // 남은 4명 준비는 그대로
    assert.ok(roomOf(room.roomId).players.every(([, p]) => p.isReady === true));

    // 4명이면 인원 모자람
    const short = await callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room));
    assert.equal(short.code, 'MIN_PLAYERS_NOT_MET');

    // 새 사람 e: 들어오자마자는 미준비 → 시작 거절, 준비 뒤 시작
    const e = addSocket(io, 'e');
    await handleJoinRoomByCode(io, e, 'e', room.roomCode);
    assert.equal(joinResult(e)?.event, 'room_joined');
    const notReady = await callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room));
    assert.equal(notReady.code, 'PLAYERS_NOT_READY');
    assert.equal((await callAsPromise(handleSetReady, io, e, 'e', readyPayload(room))).ok, true);
    const ok = await callAsPromise(handleStartGame, io, hostSocket, 'host', startPayload(room));
    assert.equal(ok.ok, true, ok.message);

    const inGame = [['host', hostSocket], ...others.slice(0, 3), ['e', e]];
    for (const [u, s] of inGame) assert.equal(countEvent(s, 'game_started'), 1, `${u} 시작 알림`);
    assert.equal(countEvent(dSocket, 'game_started'), 0);
    assert.deepEqual(lastEvent(hostSocket, 'game_started').payload.state.players.map((p) => p.uuid).sort(), ['a', 'b', 'c', 'e', 'host']);
    // 나간 d는 게임 중이 아니라 새 방을 만들 수 있음
    const dRoom = await callAsPromise(handleCreateRoom, io, dSocket, 'd', validSettingsPayload({ maxPlayers: 5, jokerCount: 1 }));
    assert.equal(dRoom.ok, true, dRoom.message);
});

'use strict';

// 대기방 시험: 방 만들기·코드 입장·준비·시작·설정·강퇴·방 지우기·나가기·끊김 유예·자동 매칭 잠김
// 진짜 DB 안 씀 (사용자·경제·전적·초대 서비스 전부 가짜), DB 주소는 닿지 않는 곳으로 막음
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
    handleJoinPublicRoom,
    handleGetPublicRooms,
    handleGetCurrentRoom,
    handleGetPartyMatchingRoom,
    handleSetReady,
    handleStartGame,
    handleDeleteRoom,
    handleKickRoomPlayer,
    handleUpdateRoomSettings,
    handleJoinMatchmaking,
    removeFromRoom,
} = matchmaking.__testables;

// 가짜 바깥 서비스 (사용자·경제·전적), 초대 서비스는 방 취소 기록만
const users = new Map();
matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => (users.has(uuid) ? users.get(uuid) : { nickname: `닉-${uuid}` }),
});
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {
        profilePhotoId: null, profileBorderId: null, cardFrameId: null,
        skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
    }])),
    getEmojiPalette: async () => ({ slots: [], owned: [] }),
});
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (ids) => new Map(ids.map((id) => [id, { totalGames: 0, winRate: 0 }])),
});

let cancelledRooms = [];
const inviteStub = {
    cancelPendingInvitesForRoom: async (roomId, reason) => { cancelledRooms.push({ roomId, reason }); return []; },
    cancelPendingInvitesBetween: async () => [],
    recordEntryInterrupted: async () => true,
};

let savedEnv;
test.beforeEach(() => {
    savedEnv = { NODE_ENV: process.env.NODE_ENV, GAME_DEV_MIN_PLAYERS: process.env.GAME_DEV_MIN_PLAYERS };
    delete process.env.NODE_ENV;
    delete process.env.GAME_DEV_MIN_PLAYERS;
    users.clear();
    cancelledRooms = [];
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setGameInviteServiceForTests(inviteStub);
    matchmaking.__setRandomMatchmakingEnabledForTests(null);
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

// 방장 소켓 + 방 하나 (개발 규칙, 정원·광대 바꿀 수 있음)
async function makeRoom(hostUuid = 'host', overrides = {}) {
    const hostSocket = createFakeSocket(hostUuid);
    const io = createFakeIo([hostSocket]);
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 4, jokerCount: 1, ...overrides }),
    );
    assert.equal(created.ok, true, created.message);
    return { io, hostSocket, hostUuid, room: created.room };
}

// 소켓 하나 더 만들어 코드로 들어옴
async function joinWithCode(io, uuid, code) {
    const socket = createFakeSocket(uuid);
    io.sockets.sockets.set(socket.id, socket);
    await handleJoinRoomByCode(io, socket, uuid, code);
    return socket;
}

const lastEvent = (socket, event) => [...socket.emitted].reverse().find((entry) => entry.event === event);
const snapshot = () => matchmaking.__getStateSnapshotForTests();
const roomOf = (roomId) => snapshot().gameRooms.find(([id]) => id === roomId)?.[1];
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

// ── 방 만들기 ──
test('방 만들기: 성공하면 방장이 나, 명단 1명, 코드 6자리, 설정 버전 1', async () => {
    const { room, hostUuid } = await makeRoom();
    assert.equal(room.hostUuid, hostUuid);
    assert.equal(room.players.length, 1);
    assert.equal(typeof room.roomCode, 'string');
    assert.ok(room.roomCode.length > 0);
    assert.equal(room.settingsVersion, 1);
});

test('방 만들기: 방 제목은 "닉네임의 방"', async () => {
    users.set('host', { nickname: '조커왕' });
    const { room } = await makeRoom('host');
    assert.equal(roomOf(room.roomId).title, '조커왕의 방');
});

test('방 만들기: 답 함수 없으면 아무것도 안 만듦', async () => {
    const socket = createFakeSocket('nocb');
    const io = createFakeIo([socket]);
    handleCreateRoom(io, socket, 'nocb', validSettingsPayload(), undefined);
    await flushAsync();
    assert.equal(snapshot().gameRooms.length, 0);
});

test('방 만들기: 이미 방에 있으면 거절', async () => {
    const { io, hostSocket, hostUuid } = await makeRoom();
    const again = await callAsPromise(handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }));
    assert.equal(again.ok, false);
    assert.match(again.message, /이미 참여 중인 방/);
});

test('방 만들기: 줄에 서 있으면 거절', async () => {
    const socket = createFakeSocket('queued');
    const io = createFakeIo([socket]);
    matchmaking.__seedMatchmakingQueueForTests('queued', { uuid: 'queued', socketId: socket.id });
    const res = await callAsPromise(handleCreateRoom, io, socket, 'queued', validSettingsPayload());
    assert.equal(res.ok, false);
    assert.match(res.message, /매칭 대기열/);
});

test('방 만들기: 허용 안 된 공개 방식이면 거절', async () => {
    const socket = createFakeSocket('bad-access');
    const io = createFakeIo([socket]);
    const res = await callAsPromise(handleCreateRoom, io, socket, 'bad-access', validSettingsPayload({ accessType: 'private' }));
    assert.equal(res.ok, false);
    assert.match(res.message, /공개 방식/);
});

test('방 만들기: 정원 11은 거절', async () => {
    const socket = createFakeSocket('cap11');
    const io = createFakeIo([socket]);
    const res = await callAsPromise(handleCreateRoom, io, socket, 'cap11', validSettingsPayload({ maxPlayers: 11 }));
    assert.equal(res.ok, false);
    assert.match(res.message, /최대 플레이어 수/);
});

test('방 만들기: 개발 규칙이면 정원 4 허용', async () => {
    const { room } = await makeRoom('dev4', { maxPlayers: 4 });
    assert.equal(room.settings.maxPlayers, 4);
});

test('방 만들기: 운영 규칙이면 정원 4 거절, 5는 허용', async () => {
    process.env.NODE_ENV = 'production';
    const s4 = createFakeSocket('p4');
    const io = createFakeIo([s4]);
    const r4 = await callAsPromise(handleCreateRoom, io, s4, 'p4', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }));
    assert.equal(r4.ok, false);
    const s5 = createFakeSocket('p5');
    io.sockets.sockets.set(s5.id, s5);
    const r5 = await callAsPromise(handleCreateRoom, io, s5, 'p5', validSettingsPayload({ maxPlayers: 5, jokerCount: 1 }));
    assert.equal(r5.ok, true, r5.message);
});

test('방 만들기: 광대 3명은 거절', async () => {
    const socket = createFakeSocket('j3');
    const io = createFakeIo([socket]);
    const res = await callAsPromise(handleCreateRoom, io, socket, 'j3', validSettingsPayload({ jokerCount: 3 }));
    assert.equal(res.ok, false);
});

test('방 만들기: 계정 없으면 거절하고 방 안 남김', async () => {
    users.set('ghost', null);
    const socket = createFakeSocket('ghost');
    const io = createFakeIo([socket]);
    const res = await callAsPromise(handleCreateRoom, io, socket, 'ghost', validSettingsPayload());
    assert.equal(res.ok, false);
    assert.match(res.message, /사용자 정보/);
    assert.equal(snapshot().gameRooms.length, 0);
    assert.equal(snapshot().pendingRoomTransitions.length, 0);
});

test('방 만들기: 끊긴 소켓이면 거절', async () => {
    const socket = createFakeSocket('dc');
    socket.connected = false;
    const io = createFakeIo([socket]);
    const res = await callAsPromise(handleCreateRoom, io, socket, 'dc', validSettingsPayload());
    assert.equal(res.ok, false);
    assert.match(res.message, /연결이 끊어져/);
    assert.equal(snapshot().gameRooms.length, 0);
});

test('방 만들기: 성공하면 공개 방 목록 방송', async () => {
    const { io } = await makeRoom();
    assert.ok(io.broadcasts.some((b) => b.event === 'public_rooms_updated'));
});

// ── 코드 입장 ──
test('코드 입장: 맞는 코드면 room_joined 받고 방장은 player_joined_room 받음', async () => {
    const { io, hostSocket, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    assert.ok(lastEvent(guest, 'room_joined'));
    assert.equal(lastEvent(hostSocket, 'player_joined_room')?.payload.player.uuid, 'guest');
    assert.equal(roomOf(room.roomId).players.length, 2);
});

test('코드 입장: 앞뒤 공백은 다듬고 들어감', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', `  ${room.roomCode}  `);
    assert.ok(lastEvent(guest, 'room_joined'));
});

test('코드 입장: 빈 코드면 CODE_REQUIRED', async () => {
    const { io } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', '   ');
    assert.equal(lastEvent(guest, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED);
});

test('코드 입장: 없는 코드면 ROOM_CODE_MISMATCH', async () => {
    const { io } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', 'ZZZZZZ');
    assert.equal(lastEvent(guest, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH);
});

test('코드 입장: 정원 찼으면 ROOM_FULL, 명단 그대로', async () => {
    const { io, room } = await makeRoom('host', { maxPlayers: 4 });
    for (const uuid of ['a', 'b', 'c']) await joinWithCode(io, uuid, room.roomCode);
    const late = await joinWithCode(io, 'late', room.roomCode);
    assert.equal(lastEvent(late, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL);
    assert.equal(roomOf(room.roomId).players.length, 4);
});

test('코드 입장: 이미 방에 있으면 ALREADY_IN_ROOM', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await handleJoinRoomByCode(io, hostSocket, hostUuid, room.roomCode);
    assert.equal(lastEvent(hostSocket, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM);
});

test('코드 입장: 줄에 서 있으면 IN_MATCHMAKING_QUEUE', async () => {
    const { io, room } = await makeRoom();
    matchmaking.__seedMatchmakingQueueForTests('q', { uuid: 'q', socketId: 'sock-q' });
    const s = await joinWithCode(io, 'q', room.roomCode);
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE);
});

test('코드 입장: 계정 없으면 USER_NOT_FOUND', async () => {
    const { io, room } = await makeRoom();
    users.set('nouser', null);
    const s = await joinWithCode(io, 'nouser', room.roomCode);
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND);
});

test('코드 입장: 1분에 20번 넘게 시도하면 TOO_MANY_JOIN_ATTEMPTS', async () => {
    const { io } = await makeRoom();
    const s = createFakeSocket('guesser');
    io.sockets.sockets.set(s.id, s);
    for (let i = 0; i < 20; i += 1) await handleJoinRoomByCode(io, s, 'guesser', `X${i}`);
    assert.notEqual(lastEvent(s, 'room_join_failed').payload.code, 'TOO_MANY_JOIN_ATTEMPTS');
    await handleJoinRoomByCode(io, s, 'guesser', 'X21');
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, 'TOO_MANY_JOIN_ATTEMPTS');
});

test('코드 입장: 시도 제한은 사람별 (다른 사람은 그대로 들어감)', async () => {
    const { io, room } = await makeRoom();
    const s = createFakeSocket('guesser');
    io.sockets.sockets.set(s.id, s);
    for (let i = 0; i < 21; i += 1) await handleJoinRoomByCode(io, s, 'guesser', `X${i}`);
    const other = await joinWithCode(io, 'other', room.roomCode);
    assert.ok(lastEvent(other, 'room_joined'));
});

test('코드 입장: 21번째 시도는 맞는 코드여도 막힘', async () => {
    const { io, room } = await makeRoom();
    const s = createFakeSocket('guesser');
    io.sockets.sockets.set(s.id, s);
    for (let i = 0; i < 20; i += 1) await handleJoinRoomByCode(io, s, 'guesser', `X${i}`);
    await handleJoinRoomByCode(io, s, 'guesser', room.roomCode);
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, 'TOO_MANY_JOIN_ATTEMPTS');
    assert.equal(roomOf(room.roomId).players.length, 1);
});

test('코드 입장: 시작된 방 코드면 ROOM_ALREADY_STARTED 또는 SESSION_ENDED (코드 틀림 아님)', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g = await joinWithCode(io, 'g1', room.roomCode);
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room));
    await callAsPromise(handleSetReady, io, g, 'g1', readyPayload(room));
    const started = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(started.ok, true, started.message);
    const late = await joinWithCode(io, 'late', room.roomCode);
    const code = lastEvent(late, 'room_join_failed').payload.code;
    assert.ok([ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, ROOM_JOIN_ERROR_CODES.SESSION_ENDED].includes(code), code);
});

// ── 공개 방 ──
test('공개 방 입장: open 방은 방 id로 들어감', async () => {
    const { io, room } = await makeRoom('host', { accessType: 'open' });
    const s = createFakeSocket('pub');
    io.sockets.sockets.set(s.id, s);
    await handleJoinPublicRoom(io, s, 'pub', { roomId: room.roomId });
    assert.ok(lastEvent(s, 'room_joined'));
});

test('공개 방 입장: code 방은 코드 없이 못 들어감', async () => {
    const { io, room } = await makeRoom('host', { accessType: 'code' });
    const s = createFakeSocket('pub');
    io.sockets.sockets.set(s.id, s);
    await handleJoinPublicRoom(io, s, 'pub', { roomId: room.roomId });
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH);
});

test('공개 방 입장: 방 id 모양 틀리면 INVALID_REQUEST', async () => {
    const { io } = await makeRoom();
    const s = createFakeSocket('pub');
    io.sockets.sockets.set(s.id, s);
    await handleJoinPublicRoom(io, s, 'pub', { roomId: 42 });
    assert.equal(lastEvent(s, 'room_join_failed').payload.code, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST);
});

test('공개 방 목록: 인원·정원·상태 들어 있음', async () => {
    const { room } = await makeRoom('host', { maxPlayers: 4 });
    const res = await callAsPromise(handleGetPublicRooms);
    const entry = res.rooms.find((r) => r.id === room.roomId);
    assert.equal(entry.current, 1);
    assert.equal(entry.max, 4);
    assert.equal(entry.status, 'waiting');
});

// ── 준비 ──
test('준비: 켜면 순번 1, 다른 사람에게 player_ready_changed 방송', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const res = await callAsPromise(handleSetReady, io, guest, 'guest', readyPayload(room, true));
    assert.equal(res.ok, true);
    assert.equal(res.readyRevision, 1);
    assert.equal(lastEvent(hostSocket, 'player_ready_changed')?.payload.uuid, 'guest');
    assert.equal(hostUuid, 'host');
});

test('준비: 같은 값 두 번이면 순번 안 올라감', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    await callAsPromise(handleSetReady, io, guest, 'guest', readyPayload(room, true));
    const again = await callAsPromise(handleSetReady, io, guest, 'guest', readyPayload(room, true));
    assert.equal(again.ok, true);
    assert.equal(again.readyRevision, 1);
});

test('준비: isReady가 참거짓 아니면 거절', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const res = await callAsPromise(handleSetReady, io, hostSocket, hostUuid, { roomId: room.roomId, expectedSettingsVersion: 1, isReady: 'yes' });
    assert.equal(res.ok, false);
});

test('준비: 옛 설정 버전 보고 누르면 SETTINGS_VERSION_CONFLICT와 최신 버전', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const res = await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room, true, { settingsVersion: 9 }));
    assert.equal(res.ok, false);
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT);
    assert.equal(res.settingsVersion, 1);
});

test('준비: 방에 없으면 거절', async () => {
    const s = createFakeSocket('alone');
    const io = createFakeIo([s]);
    const res = await callAsPromise(handleSetReady, io, s, 'alone', { roomId: 'r', expectedSettingsVersion: 1, isReady: true });
    assert.equal(res.ok, false);
    assert.match(res.message, /참여 중인 방이 없습니다/);
});

// ── 시작 ──
test('시작: 방장 아니면 NOT_HOST', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const res = await callAsPromise(handleStartGame, io, guest, 'guest', startPayload(room));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'NOT_HOST');
});

test('시작: 다른 방 id 보내면 ROOM_NOT_FOUND', async () => {
    const { io, hostSocket, hostUuid } = await makeRoom();
    const res = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, { roomId: 'other-room', expectedSettingsVersion: 1 });
    assert.equal(res.code, 'ROOM_NOT_FOUND');
});

test('시작: 옛 탭 소켓이면 STALE_SOCKET', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const res = await new Promise((resolve) => handleStartGame(io, hostSocket, hostUuid, startPayload(room), resolve, () => 'new-socket-id'));
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET);
});

test('시작: 전원 준비 안 됐으면 시작 안 되고 방 그대로', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room));
    const res = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(res.ok, false);
    assert.ok(roomOf(room.roomId));
});

test('시작: 운영 규칙에서 5명 모두 준비면 시작되고 방 장부에서 빠짐 + 방 초대 취소', async () => {
    process.env.NODE_ENV = 'production';
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 5 });
    const sockets = [];
    for (const uuid of ['a', 'b', 'c', 'd']) sockets.push([uuid, await joinWithCode(io, uuid, room.roomCode)]);
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room));
    for (const [uuid, s] of sockets) await callAsPromise(handleSetReady, io, s, uuid, readyPayload(room));
    const res = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(res.ok, true, res.message);
    assert.equal(roomOf(room.roomId), undefined);
    await flushAsync();
    assert.ok(cancelledRooms.some((c) => c.roomId === room.roomId));
});

// ── 설정 변경 ──
const settingsRequest = (room, overrides = {}) => ({
    roomId: room.roomId,
    requestId: 'req-1',
    expectedSettingsVersion: 1,
    accessType: 'code',
    maxPlayers: 6,
    jokerCount: 1,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 90,
    ...overrides,
});

test('설정 변경: 방장 아니면 NOT_HOST', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const res = await callAsPromise(handleUpdateRoomSettings, io, guest, 'guest', settingsRequest(room));
    assert.equal(res.ok, false);
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.NOT_HOST);
});

test('설정 변경: 성공하면 버전 2, 준비 풀림', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    await callAsPromise(handleSetReady, io, guest, 'guest', readyPayload(room, true));
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room));
    assert.equal(res.ok, true, res.message);
    assert.equal(res.settingsVersion, 2);
    const after = roomOf(room.roomId);
    assert.equal(after.players.find(([u]) => u === 'guest')[1].isReady, false);
});

test('설정 변경: 같은 요청 id 다시 오면 replayed', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room));
    const again = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room));
    assert.equal(again.replayed, true);
    assert.equal(again.settingsVersion, 2);
});

test('설정 변경: 같은 요청 id에 내용 다르면 REQUEST_ID_REUSED', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room));
    const again = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { maxPlayers: 8 }));
    assert.equal(again.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED);
});

test('설정 변경: 지금 인원보다 작은 정원이면 MAX_PLAYERS_BELOW_OCCUPANCY', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 6 });
    for (const uuid of ['a', 'b', 'c', 'd']) await joinWithCode(io, uuid, room.roomCode);
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { maxPlayers: 4 }));
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY);
    assert.equal(res.occupancy, 5);
});

test('설정 변경: 옛 버전이면 SETTINGS_VERSION_CONFLICT와 최신 방', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { expectedSettingsVersion: 3 }));
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT);
    assert.equal(res.room.roomId, room.roomId);
});

test('설정 변경: 모르는 칸 끼우면 INVALID_REQUEST', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { hostUuid: 'x' }));
    assert.equal(res.code, matchmaking.ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST);
});

// ── 대기방 강퇴 ──
function kickPayload(room, hostMembershipId, target, overrides = {}) {
    return {
        requestId: 'kick-1',
        bootEpoch: matchmaking.__getBootEpochForTests(),
        roomId: room.roomId,
        roomInstanceId: roomOf(room.roomId).instanceId,
        requesterMembershipId: hostMembershipId,
        targetUuid: target.uuid,
        targetMembershipId: target.membershipId,
        ...overrides,
    };
}
const seatOf = (roomId, uuid) => roomOf(roomId).players.find(([u]) => u === uuid)[1];

test('강퇴: 방장이 하면 대상 빠지고 대상은 room_kicked, 방 사람들은 player_left_room', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const third = await joinWithCode(io, 'third', room.roomCode);
    const payload = kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, seatOf(room.roomId, 'guest'));
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    assert.equal(res.ok, true, res.message);
    assert.equal(res.status, 'KICKED');
    assert.ok(lastEvent(guest, 'room_kicked'));
    assert.equal(lastEvent(third, 'player_left_room')?.payload.uuid, 'guest');
    assert.equal(snapshot().playerRoom.some(([u]) => u === 'guest'), false);
});

test('강퇴: 같은 요청 다시 오면 저장된 결과 replayed', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    const payload = kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, seatOf(room.roomId, 'guest'));
    await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    const again = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    assert.equal(again.ok, true);
    assert.equal(again.replayed, true);
});

test('강퇴: 방장 아니면 NOT_HOST', async () => {
    const { io, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const payload = kickPayload(room, seatOf(room.roomId, 'guest').membershipId, seatOf(room.roomId, hostUuid));
    const res = await callAsPromise(handleKickRoomPlayer, io, guest, 'guest', payload);
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.NOT_HOST);
});

test('강퇴: 자기 자신이면 SELF_KICK', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const seat = seatOf(room.roomId, hostUuid);
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, kickPayload(room, seat.membershipId, seat));
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.SELF_KICK);
});

test('강퇴: 대상 자리 번호가 다르면 STALE_MEMBERSHIP', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    const payload = kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, { uuid: 'guest', membershipId: 'old-seat' });
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.STALE_MEMBERSHIP);
});

test('강퇴: 이미 나간 사람이면 ALREADY_LEFT', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const target = seatOf(room.roomId, 'guest');
    removeFromRoom(io, guest, 'guest');
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, target));
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.ALREADY_LEFT);
});

test('강퇴: 서버 부팅 번호 다르면 STALE_BOOT', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    const payload = kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, seatOf(room.roomId, 'guest'), { bootEpoch: 'old-boot' });
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.STALE_BOOT);
});

test('강퇴: 모르는 키 끼우면 INVALID_REQUEST', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    const payload = { ...kickPayload(room, seatOf(room.roomId, hostUuid).membershipId, seatOf(room.roomId, 'guest')), extra: 'x' };
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, payload);
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.INVALID_REQUEST);
});

test('강퇴: 같은 요청 id에 대상 다르면 REQUEST_ID_REUSED', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await joinWithCode(io, 'guest', room.roomCode);
    await joinWithCode(io, 'third', room.roomCode);
    const hostSeat = seatOf(room.roomId, hostUuid).membershipId;
    await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, kickPayload(room, hostSeat, seatOf(room.roomId, 'guest')));
    const res = await callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, kickPayload(room, hostSeat, seatOf(room.roomId, 'third')));
    assert.equal(res.code, matchmaking.KICK_ERROR_CODES.REQUEST_ID_REUSED);
});

test('강퇴: 인게임 강퇴 사건(kick_game_player)은 등록 안 됨', () => {
    const s = createFakeSocket('reg');
    const io = createFakeIo([s]);
    matchmaking.registerMatchmakingHandlers(io, s, 'reg');
    assert.equal(s.listenerCount('kick_game_player'), 0);
    assert.equal(s.listenerCount('kick_room_player'), 1);
});

// ── 방 지우기 ──
test('방 지우기: 방장이 지우면 room_deleted, 방·소속 사라지고 방 초대 취소', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const res = await new Promise((resolve) => handleDeleteRoom(io, hostUuid, { socket: hostSocket, callback: resolve }));
    assert.equal(res.ok, true);
    assert.ok(lastEvent(guest, 'room_deleted'));
    assert.equal(roomOf(room.roomId), undefined);
    assert.equal(snapshot().playerRoom.length, 0);
    await flushAsync();
    assert.deepEqual(cancelledRooms, [{ roomId: room.roomId, reason: 'ROOM_DELETED' }]);
});

test('방 지우기: 방장 아니면 NOT_HOST', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    const res = await new Promise((resolve) => handleDeleteRoom(io, 'guest', { socket: guest, callback: resolve }));
    assert.equal(res.code, 'NOT_HOST');
    assert.ok(roomOf(room.roomId));
});

test('방 지우기: 방에 없으면 NOT_IN_ROOM', async () => {
    const s = createFakeSocket('none');
    const io = createFakeIo([s]);
    const res = await new Promise((resolve) => handleDeleteRoom(io, 'none', { socket: s, callback: resolve }));
    assert.equal(res.code, 'NOT_IN_ROOM');
});

test('방 지우기: 지운 뒤 남은 사람 소켓의 지금 방 표시도 지움', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    assert.equal(guest.data.activeRoomId, room.roomId);
    await new Promise((resolve) => handleDeleteRoom(io, hostUuid, { socket: hostSocket, callback: resolve }));
    assert.equal(guest.data.activeRoomId, undefined);
    assert.equal(guest.rooms.has(room.roomId), false);
});

// ── 나가기·빈 방 정리 ──
test('나가기: 방장이 나가면 먼저 들어온 사람이 방장, host_changed 방송', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    await joinWithCode(io, 'third', room.roomCode);
    removeFromRoom(io, hostSocket, hostUuid);
    assert.equal(roomOf(room.roomId).hostUuid, 'guest');
    assert.equal(lastEvent(guest, 'host_changed')?.payload.hostUuid, 'guest');
});

test('나가기: 마지막 사람이 나가면 방 없어지고 방 초대 취소 (ROOM_GONE)', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    removeFromRoom(io, hostSocket, hostUuid);
    assert.equal(roomOf(room.roomId), undefined);
    await flushAsync();
    assert.deepEqual(cancelledRooms, [{ roomId: room.roomId, reason: 'ROOM_GONE' }]);
});

test('나가기: 방에 없는 사람이 나가면 아무 일 없음', async () => {
    const { io } = await makeRoom();
    const s = createFakeSocket('nobody');
    removeFromRoom(io, s, 'nobody');
    assert.equal(snapshot().gameRooms.length, 1);
});

test('나가기: 빈 방이 없어지면 그 방 설정 영수증도 지움', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room));
    assert.equal(snapshot().roomSettingsUpdateResults.length, 1);
    removeFromRoom(io, hostSocket, hostUuid);
    assert.equal(snapshot().roomSettingsUpdateResults.length, 0);
});

// ── 끊김 15초 유예 ──
test('끊김: 방에 있던 사람 끊기면 빼기 예약만 걸리고 바로 안 빠짐', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    matchmaking.onDisconnect(io, guest, 'guest');
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), [['guest', room.roomId]]);
    assert.ok(roomOf(room.roomId).players.some(([u]) => u === 'guest'));
});

test('끊김: 15초 지나면 방에서 빠짐 (가짜 시계, 14.999초엔 그대로)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    matchmaking.onDisconnect(io, guest, 'guest');
    t.mock.timers.tick(14_999);
    assert.ok(roomOf(room.roomId).players.some(([u]) => u === 'guest'));
    t.mock.timers.tick(1);
    assert.equal(roomOf(room.roomId).players.some(([u]) => u === 'guest'), false);
});

test('끊김: 유예 안에 지금 방 물으면 예약 취소, 자리 그대로', async () => {
    const { io, room } = await makeRoom();
    const guest = await joinWithCode(io, 'guest', room.roomCode);
    matchmaking.onDisconnect(io, guest, 'guest');
    const res = await callAsPromise(handleGetCurrentRoom, 'guest');
    assert.equal(res.room.roomId, room.roomId);
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), []);
    matchmaking.__flushRoomRetentionForTests();
    assert.ok(roomOf(room.roomId).players.some(([u]) => u === 'guest'));
});

test('끊김: 혼자 있던 방장이 유예 끝나면 빈 방 정리 (방·초대)', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom();
    matchmaking.onDisconnect(io, hostSocket, hostUuid);
    matchmaking.__flushRoomRetentionForTests();
    assert.equal(roomOf(room.roomId), undefined);
    await flushAsync();
    assert.deepEqual(cancelledRooms, [{ roomId: room.roomId, reason: 'ROOM_GONE' }]);
});

test('끊김: 새 탭에 밀린 옛 소켓 끊김은 유예 안 걺', async (t) => {
    const { io, hostSocket, hostUuid } = await makeRoom();
    matchmaking.setOnlineUsersRegistry(new Map([[hostUuid, 'new-socket']]));
    t.after(() => matchmaking.setOnlineUsersRegistry(null));
    hostSocket.data.forcedLogout = true;
    matchmaking.onDisconnect(io, hostSocket, hostUuid);
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), []);
});

test('끊김: 줄에 선 소켓이 끊기면 줄에서 빠짐', () => {
    const s = createFakeSocket('q');
    const io = createFakeIo([s]);
    matchmaking.__seedMatchmakingQueueForTests('q', { uuid: 'q', socketId: s.id });
    matchmaking.onDisconnect(io, s, 'q');
    assert.equal(snapshot().matchmakingQueue.length, 0);
});

// ── 지금 방·다음 방 ──
test('지금 방: 방 없으면 room null', async () => {
    const res = await callAsPromise(handleGetCurrentRoom, 'nobody');
    assert.deepEqual(res, { ok: true, room: null });
});

test('지금 방: 소속만 남고 방이 없으면 흔적 지우고 room null', async () => {
    matchmaking.__seedPlayerRoomForTests('orphan', 'gone-room');
    const res = await callAsPromise(handleGetCurrentRoom, 'orphan');
    assert.equal(res.room, null);
    assert.equal(snapshot().playerRoom.length, 0);
});

test('다음 방: 끝난 판 없으면 gameId·room 둘 다 null', async () => {
    const res = await new Promise((resolve) => handleGetPartyMatchingRoom('nobody', {}, resolve));
    assert.deepEqual(res, { ok: true, gameId: null, room: null });
});

test('다음 방: 남의 판 id 물으면 room null (새지 않음)', async () => {
    const res = await new Promise((resolve) => handleGetPartyMatchingRoom('nobody', { gameId: 'someone-game' }, resolve));
    assert.equal(res.ok, true);
    assert.equal(res.room, null);
});

// ── 자동 매칭 잠김 ──
test('자동 매칭: 기본은 잠김, matchmaking_disabled 알림 받고 줄에 안 섬', async () => {
    const s = createFakeSocket('mm');
    const io = createFakeIo([s]);
    await handleJoinMatchmaking(io, s, 'mm');
    assert.ok(lastEvent(s, 'matchmaking_disabled'));
    assert.equal(snapshot().matchmakingQueue.length, 0);
});

test('자동 매칭: 잠김 알림 문구는 빠른 매칭 미지원', async () => {
    const s = createFakeSocket('mm');
    const io = createFakeIo([s]);
    await handleJoinMatchmaking(io, s, 'mm');
    assert.match(lastEvent(s, 'matchmaking_disabled').payload.message, /빠른 매칭/);
});

'use strict';

// 대기방 이상한 순서·여러 명 동시 시험: 입장·나가기·강퇴·준비·설정·시작·끊김이 서로 끼어드는 경우
// 진짜 DB 안 씀 (계정·경제·전적·초대 전부 가짜), 기다림은 시간 말고 문(gate)·상태 확인으로 맞춤
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
    handleGetCurrentRoom,
    handleSetReady,
    handleStartGame,
    handleDeleteRoom,
    handleKickRoomPlayer,
    handleUpdateRoomSettings,
    handleAcceptGameInvite,
    removeFromRoom,
} = matchmaking.__testables;

// ── 가짜 바깥 서비스: 문을 걸면 그 문이 열릴 때까지 기다림, 한 번 터지기 표시도 받음 ──
const fakes = {
    userGate: null, // 계정 읽기 문 (Promise)
    userFailOnce: new Set(), // 다음 한 번 계정 읽기를 터뜨릴 사람
    startGate: null, // 시작 외형 읽기 문
    startFailOnce: false, // 다음 한 번 시작 외형 읽기 터뜨리기
    userCalls: 0,
};
function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => {
        fakes.userCalls += 1;
        if (fakes.userGate) await fakes.userGate;
        if (fakes.userFailOnce.has(uuid)) {
            fakes.userFailOnce.delete(uuid);
            throw new Error('계정 읽기 실패(시험 주입)');
        }
        return { uuid, nickname: `닉-${uuid}` };
    },
});
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (ids) => {
        if (fakes.startGate) await fakes.startGate;
        if (fakes.startFailOnce) {
            fakes.startFailOnce = false;
            throw new Error('외형 읽기 실패(시험 주입)');
        }
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
const inviteStub = {
    cancelPendingInvitesForRoom: async () => [],
    cancelPendingInvitesBetween: async () => [],
    recordEntryInterrupted: async () => true,
};

let savedEnv;
test.beforeEach(() => {
    savedEnv = { NODE_ENV: process.env.NODE_ENV, GAME_DEV_MIN_PLAYERS: process.env.GAME_DEV_MIN_PLAYERS };
    delete process.env.NODE_ENV;
    delete process.env.GAME_DEV_MIN_PLAYERS;
    fakes.userGate = null;
    fakes.userFailOnce.clear();
    fakes.startGate = null;
    fakes.startFailOnce = false;
    fakes.userCalls = 0;
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setGameInviteServiceForTests(inviteStub);
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

// ── 도우미 ──
const snapshot = () => matchmaking.__getStateSnapshotForTests();
const roomOf = (roomId) => snapshot().gameRooms.find(([id]) => id === roomId)?.[1];
const roomIdOf = (uuid) => snapshot().playerRoom.find(([u]) => u === uuid)?.[1];
const lastEvent = (socket, event) => [...socket.emitted].reverse().find((e) => e.event === event);
const countEvent = (socket, event) => socket.emitted.filter((e) => e.event === event).length;
const joinResult = (socket) => [...socket.emitted].reverse().find((e) => e.event === 'room_joined' || e.event === 'room_join_failed');
const current = (uuid) => callAsPromise(handleGetCurrentRoom, uuid);

// 상태가 맞을 때까지 다음 차례로 넘기며 기다림 (시간 말고 상태로, 400번 넘으면 실패)
async function waitFor(check, label) {
    for (let i = 0; i < 400; i += 1) {
        if (check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`기다려도 안 됨: ${label}`);
}

// 처리기가 문 앞까지 올 때까지 기다림 (계정 읽기 부른 횟수로 셈)
const waitUserCalls = (n) => waitFor(() => fakes.userCalls >= n, `계정 읽기 ${n}번`);

async function makeRoom(hostUuid = 'host', overrides = {}) {
    const hostSocket = createFakeSocket(hostUuid);
    const io = createFakeIo([hostSocket]);
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 4, jokerCount: 1, ...overrides }),
    );
    assert.equal(created.ok, true, created.message);
    return { io, hostSocket, hostUuid, room: created.room };
}

function addSocket(io, uuid, id) {
    const socket = createFakeSocket(uuid, id ? { id } : {});
    io.sockets.sockets.set(socket.id, socket);
    return socket;
}

async function joinWithCode(io, uuid, code) {
    const socket = addSocket(io, uuid);
    await handleJoinRoomByCode(io, socket, uuid, code);
    assert.equal(joinResult(socket)?.event, 'room_joined', `${uuid} 입장 실패: ${JSON.stringify(joinResult(socket)?.payload)}`);
    return socket;
}

// 장부 세 개(소속·방 명단·소켓 채널)가 같은 말을 하는지: 앉은 사람은 채널에 있고, 안 앉은 사람 소켓은 그 방 채널에 없음
function assertLedgersAgree(io, label) {
    const snap = snapshot();
    for (const [uuid, roomId] of snap.playerRoom) {
        const room = snap.gameRooms.find(([id]) => id === roomId)?.[1];
        assert.ok(room, `${label}: ${uuid} 소속 방 ${roomId}이 장부에 없음`);
        assert.ok(room.players.some(([u]) => u === uuid), `${label}: ${uuid}가 소속은 있는데 명단에 없음`);
    }
    for (const [roomId, room] of snap.gameRooms) {
        for (const [uuid] of room.players) {
            assert.equal(roomIdOf(uuid), roomId, `${label}: ${uuid}가 명단엔 있는데 소속이 다름`);
        }
    }
    for (const socket of io.sockets.sockets.values()) {
        // 끊긴 소켓은 진짜 socket.io에선 채널에서 저절로 빠짐 (가짜 소켓은 안 빠져서 셈에서 뺌)
        if (socket.connected === false) continue;
        const uuid = socket.data.user.uuid;
        for (const channel of socket.rooms) {
            if (!snap.gameRooms.some(([id]) => id === channel)) continue;
            assert.equal(roomIdOf(uuid), channel, `${label}: ${socket.id}가 앉지 않은 방 ${channel} 채널에 붙어 있음`);
        }
    }
}

const settingsRequest = (room, overrides = {}) => ({
    roomId: room.roomId,
    requestId: `set-${Math.random().toString(36).slice(2)}`,
    expectedSettingsVersion: 1,
    accessType: room.accessType ?? 'code',
    maxPlayers: 6,
    jokerCount: 1,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 90,
    ...overrides,
});

let kickSeq = 0;
async function kick(io, hostSocket, hostUuid, targetUuid) {
    const { room } = await current(hostUuid);
    const seat = (uuid) => room.players.find((p) => p.uuid === uuid).membershipId;
    kickSeq += 1;
    return callAsPromise(handleKickRoomPlayer, io, hostSocket, hostUuid, {
        requestId: `odd-kick-${kickSeq}`,
        bootEpoch: room.bootEpoch,
        roomId: room.roomId,
        roomInstanceId: room.roomInstanceId,
        requesterMembershipId: seat(hostUuid),
        targetUuid,
        targetMembershipId: seat(targetUuid),
    });
}

// 끊김 흉내: 소켓 끊고 방 끊김 처리 부름 (15초 유예가 걸림)
function disconnect(io, socket) {
    socket.connected = false;
    matchmaking.onDisconnect(io, socket, socket.data.user.uuid);
}

// ════════════════════ 여러 명 동시 ════════════════════

test('[동시·끝값 10명] 정원 10 방(방장 1)에 12명이 같은 순간 코드 입장하면 → 정확히 9명만 들어오고 3명은 ROOM_FULL, 진 사람은 채널에 안 남음', async () => {
    process.env.NODE_ENV = 'production';
    const { io, room } = await makeRoom('host', { maxPlayers: 10, jokerCount: 2 });
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const joiners = Array.from({ length: 12 }, (_, i) => [`p${i}`, addSocket(io, `p${i}`)]);
    const runs = joiners.map(([uuid, s]) => handleJoinRoomByCode(io, s, uuid, room.roomCode));
    await waitUserCalls(before + 12);
    gate.resolve();
    await Promise.all(runs);
    fakes.userGate = null;

    const results = joiners.map(([, s]) => joinResult(s));
    const joined = results.filter((r) => r?.event === 'room_joined').length;
    const full = results.filter((r) => r?.event === 'room_join_failed' && r.payload.code === ROOM_JOIN_ERROR_CODES.ROOM_FULL).length;
    assert.equal(joined, 9);
    assert.equal(full, 3);
    // 사람마다 결과는 하나만
    for (const [uuid, s] of joiners) {
        assert.equal(countEvent(s, 'room_joined') + countEvent(s, 'room_join_failed'), 1, `${uuid} 결과 수`);
    }
    assert.equal(roomOf(room.roomId).players.length, 10);
    await waitFor(() => [...io.sockets.sockets.values()].every((s) => !s.rooms.has(room.roomId) || roomIdOf(s.data.user.uuid) === room.roomId), '진 사람 채널 떼기');
    assertLedgersAgree(io, '12명 동시 입장 뒤');
    assert.equal(snapshot().pendingRoomTransitions.length, 0);
});

test('[두 탭 동시·방 두 개 막기] 같은 계정이 세 탭에서 방 만들기·코드 입장·공개 방 입장을 같은 순간 하면 → 딱 한 방에만, 나머지 탭 소켓은 어느 방 채널에도 없음', async () => {
    const { io, room: codeRoom } = await makeRoom('hostA', { accessType: 'code' });
    const hostB = addSocket(io, 'hostB');
    const openCreated = await callAsPromise(handleCreateRoom, io, hostB, 'hostB', validSettingsPayload({ accessType: 'open', maxPlayers: 4, jokerCount: 1 }));
    assert.equal(openCreated.ok, true);

    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const tabCreate = addSocket(io, 'me', 'me-tab-1');
    const tabCode = addSocket(io, 'me', 'me-tab-2');
    const tabPublic = addSocket(io, 'me', 'me-tab-3');
    let createAck = null;
    handleCreateRoom(io, tabCreate, 'me', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }), (res) => { createAck = res; });
    const codeRun = handleJoinRoomByCode(io, tabCode, 'me', codeRoom.roomCode);
    const publicRun = handleJoinPublicRoom(io, tabPublic, 'me', { roomId: openCreated.room.roomId });
    await waitUserCalls(before + 1);
    gate.resolve();
    await Promise.all([codeRun, publicRun]);
    await waitFor(() => createAck !== null, '방 만들기 답');
    fakes.userGate = null;

    const successes = [
        createAck.ok === true,
        joinResult(tabCode)?.event === 'room_joined',
        joinResult(tabPublic)?.event === 'room_joined',
    ].filter(Boolean).length;
    assert.equal(successes, 1, `성공 수 (만들기 ${JSON.stringify(createAck)}, 코드 ${JSON.stringify(joinResult(tabCode))}, 공개 ${JSON.stringify(joinResult(tabPublic))})`);
    const rooms = snapshot().gameRooms.filter(([, r]) => r.players.some(([u]) => u === 'me'));
    assert.equal(rooms.length, 1, '내 이름이 든 방 수');
    await waitFor(() => [tabCreate, tabCode, tabPublic].filter((s) => [...s.rooms].some((ch) => snapshot().gameRooms.some(([id]) => id === ch))).length <= 1, '진 탭 채널 떼기');
    assertLedgersAgree(io, '세 탭 동시');
});

test('[따닥] 방장이 시작을 두 번 동시에 누르면 → 판은 하나, 사람마다 game_started 한 번, 한쪽 답만 성공', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    const g2 = await joinWithCode(io, 'g2', room.roomCode);
    for (const [u, s] of [[hostUuid, hostSocket], ['g1', g1], ['g2', g2]]) {
        assert.equal((await callAsPromise(handleSetReady, io, s, u, readyPayload(room))).ok, true);
    }
    const gate = deferred();
    fakes.startGate = gate.promise;
    const first = callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    const second = callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    gate.resolve();
    const answers = await Promise.all([first, second]);
    assert.equal(answers.filter((a) => a.ok === true).length, 1, JSON.stringify(answers));
    const gameIds = new Set();
    for (const s of [hostSocket, g1, g2]) {
        assert.equal(countEvent(s, 'game_started'), 1, `${s.id} game_started 수`);
        gameIds.add(lastEvent(s, 'game_started').payload.gameId);
    }
    assert.equal(gameIds.size, 1);
    assert.equal(roomOf(room.roomId), undefined);
    assert.equal(snapshot().playerRoom.length, 0);
});

test('[동시] 시작 처리(외형 읽기) 중 방장이 나가면 → 판이 안 만들어지고 남은 사람 중 새 방장, 방은 그대로', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    const g2 = await joinWithCode(io, 'g2', room.roomCode);
    for (const [u, s] of [[hostUuid, hostSocket], ['g1', g1], ['g2', g2]]) {
        await callAsPromise(handleSetReady, io, s, u, readyPayload(room));
    }
    const gate = deferred();
    fakes.startGate = gate.promise;
    const starting = callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    removeFromRoom(io, hostSocket, hostUuid);
    gate.resolve();
    const answer = await starting;
    assert.equal(answer.ok, false);
    assert.equal(answer.code, 'ROOM_STATE_CHANGED');
    for (const s of [hostSocket, g1, g2]) assert.equal(countEvent(s, 'game_started'), 0);
    const after = roomOf(room.roomId);
    assert.ok(after, '방이 남아 있어야 함');
    assert.equal(after.hostUuid, 'g1');
    assert.deepEqual(after.players.map(([u]) => u).sort(), ['g1', 'g2']);
    // 새 방장은 판 없이 다시 방을 굴릴 수 있음 (게임 중 아님)
    assert.equal(gameSession.isMatchmakingBlocked('g1'), false);
    assertLedgersAgree(io, '시작 중 방장 나감');
});

test('[끊김+방장 넘기기 겹침] 방장이 끊겨 유예 중일 때 다른 사람이 나가고, 유예가 끝나면 → 방장은 한 번만 넘어가고 남은 사람이 방장', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    const g2 = await joinWithCode(io, 'g2', room.roomCode);
    disconnect(io, hostSocket);
    // 유예 중엔 아직 방장 그대로 (다른 사람 시작은 NOT_HOST)
    const early = await callAsPromise(handleStartGame, io, g2, 'g2', startPayload(room));
    assert.equal(early.code, 'NOT_HOST');
    removeFromRoom(io, g1, 'g1');
    assert.equal(roomOf(room.roomId).hostUuid, hostUuid);
    g2.emitted.length = 0;
    matchmaking.__flushRoomRetentionForTests();
    const after = roomOf(room.roomId);
    assert.equal(after.hostUuid, 'g2');
    assert.deepEqual(after.players.map(([u]) => u), ['g2']);
    const hostChanges = g2.emitted.filter((e) => e.event === 'host_changed');
    assert.equal(hostChanges.length, 1);
    assert.equal(hostChanges[0].payload.hostUuid, 'g2');
    // 유예를 한 번 더 돌려도 아무 일 없음
    matchmaking.__flushRoomRetentionForTests();
    assert.equal(g2.emitted.filter((e) => e.event === 'player_left_room').length, 1);
});

// ════════════════════ 이상한 순서 ════════════════════

test('[이상한 순서] 코드 입장이 계정 읽기를 기다리는 사이 방장이 정원을 지금 인원으로 줄이면 → 입장은 ROOM_FULL, 명단 그대로', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 6 });
    for (const u of ['a', 'b', 'c']) await joinWithCode(io, u, room.roomCode);
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const late = addSocket(io, 'late');
    const run = handleJoinRoomByCode(io, late, 'late', room.roomCode);
    await waitUserCalls(before + 1);
    fakes.userGate = null;
    const changed = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { maxPlayers: 4 }));
    assert.equal(changed.ok, true, changed.message);
    gate.resolve();
    await run;
    assert.equal(joinResult(late)?.payload?.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL);
    assert.equal(roomOf(room.roomId).players.length, 4);
    await waitFor(() => !late.rooms.has(room.roomId), '늦은 사람 채널 떼기');
    assertLedgersAgree(io, '정원 줄임');
});

test('[이상한 순서] 공개 방 입장이 기다리는 사이 방장이 코드 방으로 바꾸면 → 코드 없이 들어오지 못하고 채널에도 안 남음', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { accessType: 'open', maxPlayers: 6 });
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const picker = addSocket(io, 'picker');
    const run = handleJoinPublicRoom(io, picker, 'picker', { roomId: room.roomId });
    await waitUserCalls(before + 1);
    fakes.userGate = null;
    const changed = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, hostUuid, settingsRequest(room, { accessType: 'code', maxPlayers: 6 }));
    assert.equal(changed.ok, true, changed.message);
    gate.resolve();
    await run;
    assert.equal(joinResult(picker)?.event, 'room_join_failed');
    assert.equal(roomIdOf('picker'), undefined);
    assert.equal(roomOf(room.roomId).players.length, 1);
    await waitFor(() => !picker.rooms.has(room.roomId), '채널 떼기');
});

test('[겹침: 동시 입장 + 방 지우기] 세 명이 입장을 기다리는 사이 방장이 방을 지우면 → 셋 다 거절, 잠금·채널 흔적 없고 곧바로 각자 새 방을 만들 수 있음', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 6 });
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const waiting = ['w1', 'w2', 'w3'].map((u) => [u, addSocket(io, u)]);
    const runs = waiting.map(([u, s]) => handleJoinRoomByCode(io, s, u, room.roomCode));
    await waitUserCalls(before + 3);
    handleDeleteRoom(io, hostUuid, { socket: hostSocket });
    assert.equal(roomOf(room.roomId), undefined, '방이 지워져야 함');
    gate.resolve();
    await Promise.all(runs);
    fakes.userGate = null;
    for (const [u, s] of waiting) {
        assert.equal(joinResult(s)?.event, 'room_join_failed', `${u} 결과`);
        assert.equal(roomIdOf(u), undefined);
    }
    await waitFor(() => waiting.every(([, s]) => !s.rooms.has(room.roomId)), '지운 방 채널 떼기');
    assert.equal(snapshot().pendingRoomTransitions.length, 0);
    for (const [u, s] of waiting) {
        const made = await callAsPromise(handleCreateRoom, io, s, u, validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }));
        assert.equal(made.ok, true, `${u} 새 방: ${made.message}`);
    }
    assertLedgersAgree(io, '방 지우기 겹침 뒤');
});

test('[이상한 순서] 코드 입장이 기다리는 사이 같은 사람의 나가기가 먼저 도착하면 → 늦게 확정된 입장과 소속·명단·채널이 어긋나지 않음', async () => {
    const { io, room } = await makeRoom('host', { maxPlayers: 4 });
    const gate = deferred();
    fakes.userGate = gate.promise;
    const before = fakes.userCalls;
    const s = addSocket(io, 'flip');
    const run = handleJoinRoomByCode(io, s, 'flip', room.roomCode);
    await waitUserCalls(before + 1);
    removeFromRoom(io, s, 'flip');
    gate.resolve();
    await run;
    fakes.userGate = null;
    const seated = roomIdOf('flip') === room.roomId;
    assert.equal(roomOf(room.roomId).players.some(([u]) => u === 'flip'), seated);
    await waitFor(() => s.rooms.has(room.roomId) === seated, '채널과 소속 맞추기');
    assertLedgersAgree(io, '입장 중 나가기');
    // 그 뒤 나가기를 다시 보내면 깨끗이 빠짐
    removeFromRoom(io, s, 'flip');
    assert.equal(roomIdOf('flip'), undefined);
    await waitFor(() => !s.rooms.has(room.roomId), '나간 뒤 채널 떼기');
});

test('[따닥] 방장이 나가기를 두 번 보내면 → 방장 바뀜·나감 방송은 한 번씩, 두 번째는 아무 일 없음', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    g1.emitted.length = 0;
    removeFromRoom(io, hostSocket, hostUuid);
    removeFromRoom(io, hostSocket, hostUuid);
    assert.equal(countEvent(g1, 'host_changed'), 1);
    assert.equal(countEvent(g1, 'player_left_room'), 1);
    assert.equal(roomOf(room.roomId).hostUuid, 'g1');
    assert.equal(roomOf(room.roomId).players.length, 1);
});

// ════════════════════ 중간 실패 + 다시 보내기 ════════════════════

test('[중간 실패] 코드 입장 중 계정 읽기가 한 번 터지면 → 흔적 없음, 다시 보내면 한 번만 들어가고 방장은 들어옴 알림 한 번', async () => {
    const { io, hostSocket, room } = await makeRoom('host', { maxPlayers: 4 });
    fakes.userFailOnce.add('retry');
    const s = addSocket(io, 'retry');
    hostSocket.emitted.length = 0;
    await handleJoinRoomByCode(io, s, 'retry', room.roomCode);
    assert.equal(joinResult(s)?.payload?.code, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR);
    assert.equal(roomIdOf('retry'), undefined);
    assert.equal(snapshot().pendingRoomTransitions.length, 0);
    await waitFor(() => !s.rooms.has(room.roomId), '실패 뒤 채널 없음');
    await handleJoinRoomByCode(io, s, 'retry', room.roomCode);
    assert.equal(joinResult(s)?.event, 'room_joined');
    assert.equal(roomOf(room.roomId).players.filter(([u]) => u === 'retry').length, 1);
    assert.equal(countEvent(hostSocket, 'player_joined_room'), 1);
    assertLedgersAgree(io, '실패 뒤 다시 입장');
});

test('[중간 실패] 시작 때 외형 읽기가 한 번 터지면 → 방·준비 그대로, 다시 누르면 판 하나만', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room));
    await callAsPromise(handleSetReady, io, g1, 'g1', readyPayload(room));
    fakes.startFailOnce = true;
    const failed = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'INTERNAL_ERROR');
    const kept = roomOf(room.roomId);
    assert.ok(kept);
    assert.ok(kept.players.every(([, p]) => p.isReady === true), '준비가 풀리면 안 됨');
    assert.equal(countEvent(g1, 'game_started'), 0);
    const ok = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(ok.ok, true, ok.message);
    assert.equal(countEvent(g1, 'game_started'), 1);
    assert.equal(countEvent(hostSocket, 'game_started'), 1);
    assert.equal(roomOf(room.roomId), undefined);
});

// ════════════════════ 끊김 + 강퇴·방 두 개 ════════════════════

test('[끊김+강퇴 겹침] 끊겨 유예 중인 사람을 방장이 강퇴하면 → 바로 빠지고, 유예가 끝나도 두 번째 나감 방송 없음, 다시 붙어 물으면 방 없음', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    const g1 = await joinWithCode(io, 'g1', room.roomCode);
    await joinWithCode(io, 'g2', room.roomCode);
    disconnect(io, g1);
    assert.equal(matchmaking.__getPendingRoomRemovalsForTests().length, 1);
    hostSocket.emitted.length = 0;
    const res = await kick(io, hostSocket, hostUuid, 'g1');
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(roomIdOf('g1'), undefined);
    assert.equal(matchmaking.__getPendingRoomRemovalsForTests().length, 0, '강퇴가 유예 예약도 지워야 함');
    matchmaking.__flushRoomRetentionForTests();
    const leftEvents = io.broadcasts.filter((b) => b.event === 'player_left_room' && b.payload.uuid === 'g1');
    assert.equal(leftEvents.length, 1);
    addSocket(io, 'g1', 'g1-new');
    assert.equal((await current('g1')).room, null);
    assert.deepEqual(roomOf(room.roomId).players.map(([u]) => u).sort(), ['g2', 'host']);
});

test('[끊김+방 두 개 막기] 끊겨 유예 중(아직 소속)인 사람이 새 탭으로 다른 방 코드를 치면 → ALREADY_IN_ROOM, 유예가 끝난 뒤엔 들어감', async () => {
    const { io, room: roomA } = await makeRoom('hostA', { maxPlayers: 4 });
    const hostB = addSocket(io, 'hostB');
    const roomB = await callAsPromise(handleCreateRoom, io, hostB, 'hostB', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }));
    const oldTab = await joinWithCode(io, 'wander', roomA.roomCode);
    disconnect(io, oldTab);
    const newTab = addSocket(io, 'wander', 'wander-new');
    await handleJoinRoomByCode(io, newTab, 'wander', roomB.room.roomCode);
    assert.equal(joinResult(newTab)?.payload?.code, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM);
    assert.equal(roomOf(roomB.room.roomId).players.length, 1);
    matchmaking.__flushRoomRetentionForTests();
    assert.equal(roomIdOf('wander'), undefined);
    await handleJoinRoomByCode(io, newTab, 'wander', roomB.room.roomCode);
    assert.equal(joinResult(newTab)?.event, 'room_joined');
    assert.equal(roomIdOf('wander'), roomB.room.roomId);
    assert.equal(roomOf(roomA.roomId).players.some(([u]) => u === 'wander'), false);
    await waitFor(() => !newTab.rooms.has(roomA.roomId), '옛 방 채널 없음');
    assertLedgersAgree(io, '유예 뒤 다른 방');
});

// ════════════════════ 강퇴 한도 ════════════════════

test('[강퇴 한도+방장 바뀜] 방장 A가 2번 강퇴하고 나간 뒤 새 방장 B가 3번째 강퇴하면 → 같은 방이라 그 사람은 못 들어옴', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('hostA', { maxPlayers: 4 });
    const b = await joinWithCode(io, 'B', room.roomCode);
    for (let round = 1; round <= 2; round += 1) {
        await joinWithCode(io, 'target', room.roomCode);
        assert.equal((await kick(io, hostSocket, hostUuid, 'target')).ok, true);
    }
    removeFromRoom(io, hostSocket, hostUuid);
    assert.equal(roomOf(room.roomId).hostUuid, 'B');
    await joinWithCode(io, 'target', room.roomCode);
    assert.equal((await kick(io, b, 'B', 'target')).ok, true);
    const s = addSocket(io, 'target', 'target-last');
    await handleJoinRoomByCode(io, s, 'target', room.roomCode);
    assert.equal(joinResult(s)?.payload?.code, ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES);
    assert.equal(roomIdOf('target'), undefined);
});

test('[강퇴 한도+초대] 3번 쫓겨난 사람이 그 방 초대를 수락해도 → KICKED_TOO_MANY_TIMES, 자리도 안 잡음', async () => {
    const { io, hostSocket, hostUuid, room } = await makeRoom('host', { maxPlayers: 4 });
    for (let round = 1; round <= 3; round += 1) {
        await joinWithCode(io, 'target', room.roomCode);
        assert.equal((await kick(io, hostSocket, hostUuid, 'target')).ok, true);
    }
    let decisions = 0;
    matchmaking.__setGameInviteServiceForTests({
        ...inviteStub,
        getAttemptOutcome: async ({ receiverId, inviteId }) => (receiverId === 'target' && inviteId === 'inv-1'
            ? { known: true, staleAttempt: false, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: room.bootEpoch, invite: { inviteId, status: 'PENDING' } }
            : { known: false }),
        recordAcceptDecision: async () => { decisions += 1; return { ok: true }; },
    });
    const s = addSocket(io, 'target', 'target-inv');
    const ack = await callAsPromise(handleAcceptGameInvite, io, s, 'target', { inviteId: 'inv-1' });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.KICKED_TOO_MANY_TIMES);
    assert.equal(decisions, 0, '수락 기록까지 가면 안 됨');
    assert.equal(snapshot().roomAdmissionAttempts.length, 0);
    assert.equal(roomIdOf('target'), undefined);
});

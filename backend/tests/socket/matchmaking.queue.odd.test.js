'use strict';

// 자동 매칭 줄 이상한 순서·여러 명 동시 시험 (지금 기능은 일부러 잠김 → 시험 안에서만 스위치 켜고 잠김 뒤 코드를 봄)
// 10명 동시 줄서기·줄 서는 중 취소·따닥·매칭된 방 끝까지 시작, 운영 규칙(5~10명), 진짜 DB 안 씀
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const matchmaking = require('../../socket/matchmaking');
const gameSession = require('../../game-core/gameSession');
const { handleLeaveMatchmaking } = require('../../socket/matchmaking/join/queue');
const { OFFICIAL_ROOM_SIZES } = require('../../socket/matchmaking/core/config');
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    readyPayload,
    startPayload,
} = require('../helpers/matchmakingFixtures');

const { handleJoinMatchmaking, handleSetReady, handleStartGame } = matchmaking.__testables;

// 가짜 계정 읽기: 문을 걸면 열릴 때까지 기다림
const fakes = { userGate: null, userCalls: 0 };
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
    getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {
        profilePhotoId: null, profileBorderId: null, cardFrameId: null,
        skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
    }])),
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
    fakes.userCalls = 0;
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setRandomMatchmakingEnabledForTests(true);
    matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => [] });
});
test.afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    matchmaking.__setRandomMatchmakingEnabledForTests(null);
    matchmaking.__resetStateForTests();
    gameSession.__resetStateForTests();
    matchmaking.__setGameInviteServiceForTests(null);
});

const snapshot = () => matchmaking.__getStateSnapshotForTests();
const queued = () => snapshot().matchmakingQueue.map(([uuid]) => uuid);
const countEvent = (socket, event) => socket.emitted.filter((e) => e.event === event).length;
const lastEvent = (socket, event) => [...socket.emitted].reverse().find((e) => e.event === event);

async function waitFor(check, label) {
    for (let i = 0; i < 400; i += 1) {
        if (check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`기다려도 안 됨: ${label}`);
}

function makePeople(n, prefix = 'q') {
    const sockets = Array.from({ length: n }, (_, i) => createFakeSocket(`${prefix}${i + 1}`));
    const io = createFakeIo(sockets);
    return { io, people: sockets.map((s) => [s.data.user.uuid, s]) };
}

test('[동시·10명] 10명이 같은 순간 줄을 서면 → 사람마다 정확히 한 방, match_found 한 번, 방 크기는 운영 크기(5·6·8·10) 중 하나, 줄은 빔', async () => {
    const { io, people } = makePeople(10);
    const gate = deferred();
    fakes.userGate = gate.promise;
    const runs = people.map(([u, s]) => handleJoinMatchmaking(io, s, u));
    await waitFor(() => fakes.userCalls >= 10, '10명 계정 읽기');
    gate.resolve();
    await Promise.all(runs);

    const snap = snapshot();
    assert.deepEqual(queued(), []);
    for (const [u, s] of people) {
        assert.equal(countEvent(s, 'match_found'), 1, `${u} match_found 수`);
        const roomId = snap.playerRoom.find(([x]) => x === u)?.[1];
        assert.ok(roomId, `${u} 소속 없음`);
        assert.equal(lastEvent(s, 'match_found').payload.roomId, roomId);
        assert.ok(s.rooms.has(roomId), `${u} 채널 없음`);
        const inRooms = snap.gameRooms.filter(([, r]) => r.players.some(([x]) => x === u));
        assert.equal(inRooms.length, 1, `${u}가 든 방 수`);
    }
    for (const [, room] of snap.gameRooms) {
        assert.ok(OFFICIAL_ROOM_SIZES.includes(room.players.length), `방 크기 ${room.players.length}`);
    }
});

test('[이상한 순서] 줄 서기 요청이 계정 읽기를 기다리는 사이 취소(leave_matchmaking)가 먼저 도착하면 → 줄에 남지 않아야 함', async () => {
    const { io, people } = makePeople(1, 'cancel');
    const [[u, s]] = people;
    const gate = deferred();
    fakes.userGate = gate.promise;
    const run = handleJoinMatchmaking(io, s, u);
    await waitFor(() => fakes.userCalls >= 1, '계정 읽기');
    handleLeaveMatchmaking(u);
    gate.resolve();
    await run;
    assert.deepEqual(queued(), [], '취소한 사람이 줄에 남음');
    assert.equal(countEvent(s, 'matchmaking_queued'), 0, '취소했는데 줄 섰다는 알림이 감');
});

test('[따닥] 같은 사람이 줄 서기를 두 번 동시에 누르면 → 줄에 한 번만, 알림 한 번, 그 뒤 4명이 더 서면 5인 방 하나', async () => {
    const { io, people } = makePeople(5, 'dbl');
    const [[u1, s1]] = people;
    await Promise.all([handleJoinMatchmaking(io, s1, u1), handleJoinMatchmaking(io, s1, u1)]);
    assert.deepEqual(queued(), [u1]);
    assert.equal(countEvent(s1, 'matchmaking_queued'), 1);
    for (const [u, s] of people.slice(1)) await handleJoinMatchmaking(io, s, u);
    const snap = snapshot();
    assert.equal(snap.gameRooms.length, 1);
    assert.equal(snap.gameRooms[0][1].players.length, 5);
    assert.equal(countEvent(s1, 'match_found'), 1);
});

test('[끝까지] 매칭된 5인 방에서 전원 준비 → 방장 시작 → 판이 열리고 광대는 1~2명 (손으로 만든 방과 같은 규칙)', async () => {
    const { io, people } = makePeople(5, 'm');
    for (const [u, s] of people) await handleJoinMatchmaking(io, s, u);
    const [[hostUuid, hostSocket]] = people;
    const room = lastEvent(hostSocket, 'match_found').payload;
    assert.equal(room.hostUuid, hostUuid);
    for (const [u, s] of people) {
        const res = await callAsPromise(handleSetReady, io, s, u, readyPayload(room));
        assert.equal(res.ok, true, `${u} 준비: ${res.message}`);
    }
    const started = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room));
    assert.equal(started.ok, true, `시작 실패: ${JSON.stringify(started)}`);
    let jokers = 0;
    for (const [u, s] of people) {
        assert.equal(countEvent(s, 'game_started'), 1, `${u} 시작 알림`);
        if (lastEvent(s, 'game_started').payload.state.self.role === 'JOKER') jokers += 1;
    }
    assert.ok(jokers >= 1 && jokers <= 2, `광대 수 ${jokers}`);
});

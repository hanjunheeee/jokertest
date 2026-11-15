'use strict';

// 시작 거절·시작 뒤 시험 — 4명 거절(개발 환경·옛 환경값 포함), 정원 안 채워도 시작, 구성·연결·방 바뀜 거절, 대기방 없어짐, 두 번 시작, 다른 판에서 죽은 사람
// 목록 A02-B-233~244 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "시작 거절·시작 뒤"), 돌리기: node --env-file=.env.test --test tests/flow/a02-start-reject.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');

// 서버 쪽 모듈 묶음 읽기 (gameFixtures가 맨 위에서 DB 주소를 막으니 꼭 먼저)
function requireStack() {
    const gf = require('../audit-2026-11-09/gameFixtures');
    const matchmaking = require('../../socket/matchmaking');
    const gs = require('../../socket/gameSession');
    return {
        gf,
        matchmaking,
        gs,
        mf: require('../helpers/matchmakingFixtures'),
        view: require('../../socket/matchmaking/room/view'),
        byId: require('../../game-core/queries/byId'),
    };
}

// 환경값을 바꾸고 서버 모듈을 새로 읽음 (읽을 때 환경값을 보는 코드도 잡으려고), 시험 끝에 환경값 되돌림
function freshStackWithEnv(t, env) {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(BACKEND) && !key.includes('node_modules')) delete require.cache[key];
    }
    Object.assign(process.env, env);
    t.after(() => {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });
    return requireStack();
}

// ── 대기방 → 시작 세상 (이 파일 안에서만 씀, 공용으로 올릴 것) ──
function makeWorld(t, { env = null, depsOverrides = {} } = {}) {
    const stack = env ? freshStackWithEnv(t, env) : requireStack();
    const { gf, matchmaking, gs, mf } = stack;
    const MM = matchmaking.__testables;
    const G = gs.__testables;
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking, depsOverrides);
    // 낮 표 기록·업적·전적 저장은 DB에 씀 → 아무것도 안 하는 함수로 바꿔 끼움
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(async () => {});
    t.mock.method(Math, 'random', () => 0);
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        gf.resetCore();
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
    });
    const sockets = new Map();
    // 계정 하나 접속 (접속 목록에 이 소켓을 지금 소켓으로 적음), 다시 붙을 땐 소켓 id를 새로
    const connect = (uuid, id = `sock-${uuid}`) => {
        const s = mf.createFakeSocket(uuid, { id });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);

    // 방 만들기 → 나머지 코드 입장 → 전원 준비 (방장 = 첫 사람), 이미 접속한 사람(existing)도 손님으로 넣을 수 있음
    async function openRoom({ prefix, n, accessType = 'code', maxPlayers = n, jokerCount = 1, roleCounts = null, existing = [] }) {
        const fresh = Array.from({ length: n - existing.length }, (_, i) => `${prefix}-${i}`);
        for (const uuid of fresh) connect(uuid);
        const uuids = [...fresh, ...existing];
        const [host, ...guests] = uuids;
        const payload = {
            accessType, maxPlayers, jokerCount, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
            ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        return { ...created.room, host, uuids };
    }
    const start = (room) => mf.callAsPromise(MM.handleStartGame, io, sock(room.host), room.host, mf.startPayload(room));
    // 아무도 game_started를 못 받았는지
    const nobodyStarted = (uuids) => uuids.every((uuid) => received(uuid, 'game_started').length === 0);

    return { ...stack, MM, G, io, connect, sock, received, openRoom, start, nobodyStarted };
}

const MIN_PLAYERS_MESSAGE = '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.';

// A02-B-233~234 개발 환경·옛 환경값이어도 4명 대기방은 시작 거절
const FOUR_CASES = [
    ['A02-B-233', 'NODE_ENV=development', { NODE_ENV: 'development' }],
    ['A02-B-234', 'GAME_DEV_MIN_PLAYERS=1', { NODE_ENV: 'development', GAME_DEV_MIN_PLAYERS: '1' }],
];
for (const [no, label, env] of FOUR_CASES) {
    test(`${no} ${label}, 4명 전원 준비 → 거절 문구 "${MIN_PLAYERS_MESSAGE}", game_started 아무도 안 받음`, async (t) => {
        const w = makeWorld(t, { env });
        // 정원 5 방에 4명만
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 4, maxPlayers: 5 });
        const reply = await w.start(room);
        assert.equal(reply.ok, false);
        assert.equal(reply.message, MIN_PLAYERS_MESSAGE);
        assert.equal(w.nobodyStarted(room.uuids), true);
    });
}

test('A02-B-235 NODE_ENV=development, 5명 → 시작 됨', async (t) => {
    const w = makeWorld(t, { env: { NODE_ENV: 'development' } });
    const room = await w.openRoom({ prefix: 'b235', n: 5 });
    const reply = await w.start(room);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
});

test('A02-B-236 정원 10 방에 5명 전원 준비 → 시작 됨', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b236', n: 5, maxPlayers: 10 });
    const reply = await w.start(room);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
});

test('A02-B-237 정원 10·J2D2G2W2, 지금 7명 → 거절 문구, 판 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b237', n: 7, maxPlayers: 10, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    const reply = await w.start(room);
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.');
    assert.equal(w.nobodyStarted(room.uuids), true);
    for (const uuid of room.uuids) assert.equal(w.byId.getPlayerGameId(uuid) ?? null, null, `${uuid}가 판에 들어감`);
});

const UNAVAILABLE_MESSAGE = '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.';

// 6명 대기방에서 한 명 연결이 끊긴 채 시작 (B-238·239 같이 씀)
async function startWithOneOffline(w, prefix) {
    const room = await w.openRoom({ prefix, n: 6 });
    const offline = room.uuids[4];
    w.sock(offline).connected = false;
    const reply = await w.start(room);
    return { room, offline, reply };
}

test('A02-B-238 6명 중 1명 소켓 없음 → 거절 문구, 아무도 game_started 못 받음, 대기방 남음', async (t) => {
    const w = makeWorld(t);
    const { room, reply } = await startWithOneOffline(w, 'b238');
    assert.equal(reply.ok, false);
    assert.equal(reply.message, UNAVAILABLE_MESSAGE);
    assert.equal(w.nobodyStarted(room.uuids), true);
    for (const uuid of room.uuids) assert.equal(w.matchmaking.hasRoomMembership(uuid), true, `${uuid} 대기방에서 빠짐`);
});

test('A02-B-239 B-238 뒤 그 사람 다시 붙음 → 시작 됨', async (t) => {
    const w = makeWorld(t);
    const { room, offline, reply } = await startWithOneOffline(w, 'b239');
    assert.equal(reply.ok, false);
    // 새 소켓으로 다시 붙음 → 대기방 채널 다시 넣기 (접속 때 서버가 하는 일)
    const fresh = w.connect(offline, `sock-${offline}-2`);
    await w.matchmaking.resyncRoomChannelOnReconnect(fresh, offline);
    const again = await w.start(room);
    assert.equal(again.ok, true, `시작 실패: ${again.message}`);
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
});

test('A02-B-240 공개 방 8명 시작 → 공개 방 목록 방송에서 그 방 빠짐', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b240', n: 8, accessType: 'open' });
    // 공개 방 목록 마지막 방송의 방 id들 (0.5초 묶음 기다림 없이 바로 보내게 함)
    const lastListedIds = () => {
        w.view.flushPublicRoomList(w.io);
        const lists = w.io.broadcasts.filter((b) => b.event === 'public_rooms_updated');
        return lists.at(-1).payload.rooms.map((r) => r.id);
    };
    assert.ok(lastListedIds().includes(room.roomId), '시작 전 목록에 방이 없음');
    assert.equal((await w.start(room)).ok, true);
    assert.equal(lastListedIds().includes(room.roomId), false);
});

test('A02-B-241 5명, 방장이 start_game을 곧바로 두 번 → 판 하나, 사람마다 game_started 1번', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b241', n: 5 });
    const replies = await Promise.all([w.start(room), w.start(room)]);
    const gameIds = new Set(replies.filter((r) => r.ok).map((r) => r.gameId));
    assert.equal(gameIds.size, 1, `판 수 ${gameIds.size}`);
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
});

test('A02-B-242 6명 시작 직후(프로필 읽기 중) 1명 대기방 나감 → 거절 문구, 판 없음', async (t) => {
    // 시작 때 외형 읽기를 문으로 막아 둠 (문을 열 때까지 기다림)
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    let reading;
    const reached = new Promise((resolve) => { reading = resolve; });
    const loadouts = (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]));
    const w = makeWorld(t, {
        depsOverrides: {
            economyService: {
                getPublicProfileLoadouts: async (ids) => loadouts(ids),
                getGameStartLoadouts: async (ids) => { reading(); await gate; return loadouts(ids); },
                getEmojiPalettes: async (ids) => new Map(ids.map((id) => [id, { slots: [], owned: [] }])),
                getEmojiPalette: async () => ({ slots: [], owned: [] }),
            },
        },
    });
    const room = await w.openRoom({ prefix: 'b242', n: 6 });
    const pending = w.start(room);
    await reached;
    const leaver = room.uuids[3];
    w.MM.removeFromRoom(w.io, w.sock(leaver), leaver);
    openGate();
    const reply = await pending;
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.');
    assert.equal(w.nobodyStarted(room.uuids), true);
});

// 옛 7명 판(광대 1·시민 6)에서 시민 A가 첫 밤에 죽은 뒤, A가 새 5명 방에 손님으로 들어가 시작 (B-243·244 같이 씀)
async function deadPlayerStartsNewGame(w, prefix) {
    const oldRoom = await w.openRoom({ prefix: `${prefix}o`, n: 7, roleCounts: {} });
    const oldReply = await w.start(oldRoom);
    assert.equal(oldReply.ok, true, `옛 판 시작 실패: ${oldReply.message}`);
    const old = w.byId.getSessionById(oldReply.gameId);
    // 옛 판 첫 낮 → 밤 → 광대가 시민 A를 죽임 (1:5라 판은 계속)
    w.gf.toDay(old);
    w.gf.toNight(old);
    const joker = w.gf.firstOf(old, 'JOKER');
    const victim = w.gf.nonJokers(old)[0];
    w.gf.resolveNightDirect(old, { [joker]: victim });
    assert.equal(old.players.get(victim).alive, false);
    assert.notEqual(old.phase, 'ENDED');
    const newRoom = await w.openRoom({ prefix: `${prefix}n`, n: 5, existing: [victim] });
    const newReply = await w.start(newRoom);
    return { oldRoom, old, victim, newRoom, newReply };
}

test('A02-B-243 옛 7명 판에서 죽은 A가 새 5명 방에서 시작 → 새 판 시작 됨, 옛 판 사람들이 참여 변경(A 빠짐) 받음', async (t) => {
    const w = makeWorld(t);
    const { oldRoom, victim, newRoom, newReply } = await deadPlayerStartsNewGame(w, 'b243');
    assert.equal(newReply.ok, true, `새 판 시작 실패: ${newReply.message}`);
    // A는 옛 판 시작 알림도 받았으니 새 판 id 것만 셈
    for (const uuid of newRoom.uuids) {
        assert.equal(w.received(uuid, 'game_started').filter((p) => p.gameId === newReply.gameId).length, 1, uuid);
    }
    for (const uuid of oldRoom.uuids.filter((u) => u !== victim)) {
        const changed = w.received(uuid, 'session_participation_changed');
        assert.ok(changed.some((p) => p.departedUuid === victim), `${uuid}가 A 빠짐 알림을 못 받음`);
    }
});

test('A02-B-244 B-243 뒤 옛 판 낮 채팅 → A는 옛 판 채팅 못 받음, 옛 판 단계 그대로 진행', async (t) => {
    const w = makeWorld(t);
    const { oldRoom, old, victim, newReply } = await deadPlayerStartsNewGame(w, 'b244');
    assert.equal(newReply.ok, true, `새 판 시작 실패: ${newReply.message}`);
    assert.equal(old.phase, 'DAY');
    const speaker = w.gf.nonJokers(old).find((u) => old.players.get(u).alive);
    const chatCount = (uuid) => w.sock(uuid).received.filter((e) => /chat/i.test(e.event)).length;
    const victimBefore = chatCount(victim);
    const reply = await w.mf.callAsPromise(w.G.handleSubmitGameChatMessage, w.io, w.sock(speaker), speaker, { gameId: old.id, text: '안녕' });
    assert.equal(reply.ok, true, `채팅 거절: ${reply.code}`);
    assert.equal(chatCount(victim), victimBefore, 'A가 옛 판 채팅을 받음');
    const others = oldRoom.uuids.filter((u) => u !== victim && u !== speaker);
    for (const uuid of others) assert.ok(chatCount(uuid) > 0, `${uuid}가 채팅을 못 받음`);
    assert.equal(old.phase, 'DAY');
    assert.equal(old.dayIndex, 2);
});

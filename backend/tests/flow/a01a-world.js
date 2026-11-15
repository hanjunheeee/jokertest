'use strict';

// A01a 대기방 시험 세상 — 가짜 소켓으로 방 만들기·코드 입장·준비·설정 바꾸기·시작·초대 입장을 진짜 사건 길로 몲
// tests/flow/a01a-*.test.js가 씀 (목록 A01-B-062~180), 시험 파일 아님(이름이 .test.js 아님), 공용으로 올릴 것
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');

// 서버 쪽 모듈 묶음 읽기 (gameFixtures가 맨 위에서 DB 주소를 막으니 꼭 먼저)
function requireStack() {
    const gf = require('../audit-2026-11-09/gameFixtures');
    return {
        gf,
        matchmaking: require('../../socket/matchmaking'),
        gs: require('../../socket/gameSession'),
        core: require('../../game-core/gameSession'),
        mf: require('../helpers/matchmakingFixtures'),
        view: require('../../socket/matchmaking/room/view'),
        byId: require('../../game-core/queries/byId'),
        desertion: require('../../services/game/desertion'),
        maintenance: require('../../services/ops/maintenance'),
    };
}

// 환경값 바꾸고 서버 모듈 새로 읽기 (읽을 때 환경값을 보는 코드도 잡으려고), 시험 끝에 환경값 되돌림
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

// 탈주 저장소 가짜 (DB 안 감): 그날 횟수는 메모리 것만 씀, 쓰기는 늘 새 줄
const FAKE_DESERTION_REPO = Object.freeze({
    findDesertionsForWarmup: async () => [],
    countDesertionsSince: async () => 0,
    insertDesertion: async () => ({ created: true, row: null }),
});

// 방 만들기 처음 값 (칸 하나씩 바꿔 씀), undefined 칸은 뺌
function createPayload(overrides = {}) {
    const payload = {
        accessType: 'open',
        maxPlayers: 10,
        jokerCount: 1,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 60,
        ...overrides,
    };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    return payload;
}

// 직접 구성 칸 두 개 (빠진 역할은 0)
const customRoles = (roleCounts) => ({
    roleCompositionMode: 'custom',
    jokerCount: roleCounts.JOKER,
    roleCounts: { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts },
});

// 시험 세상: 접속 목록·가짜 io·가짜 서비스, 시험 끝에 장부 비움
// opts.env = 환경값 바꿔 새로 읽기, opts.depsOverrides = 가짜 서비스 바꾸기, opts.inviteService = 초대 서비스 가짜
function makeWorld(t, { env = null, depsOverrides = {}, randomZero = true } = {}) {
    const stack = env ? freshStackWithEnv(t, env) : requireStack();
    const { gf, matchmaking, gs, mf, desertion, maintenance } = stack;
    const MM = matchmaking.__testables;
    const G = gs.__testables;
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    desertion.__resetForTests();
    desertion.__setRepositoryForTests(FAKE_DESERTION_REPO);
    maintenance.__setStateForTests({});
    const fakes = mf.installFakeMatchmakingDeps(matchmaking, depsOverrides);
    // 낮 표 기록·업적·전적 저장은 DB에 씀 → 아무것도 안 하는 함수로 바꿔 끼움
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(async () => {});
    // 직업 나누기 늘 같게 (시작 시험은 직업을 안 봄, 그래도 돌릴 때마다 같게)
    if (randomZero) t.mock.method(Math, 'random', () => 0);
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    const getCurrentSocketId = (uuid) => registry.get(uuid);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        matchmaking.__setAdmissionTimeoutsForTests({});
        gf.resetCore();
        desertion.__resetForTests();
        desertion.__setRepositoryForTests(null);
        maintenance.__setStateForTests({});
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
    });

    const sockets = new Map();
    // 계정 하나 접속: 접속 목록에 이 소켓을 지금 소켓으로 적고 서버처럼 사건 받기 등록 (다시 붙을 땐 소켓 id를 새로)
    const connect = (uuid, id = `sock-${uuid}`) => {
        const s = mf.createFakeSocket(uuid, { id });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        matchmaking.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId });
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    // ack 있는 사건 보내기 → 답 (서버에 등록된 처리기 그대로, 점검 거절 포함)
    const emit = (uuid, event, payload, socket = sock(uuid)) => new Promise((resolve) => {
        socket.trigger(event, payload, resolve);
    });
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);

    const create = (uuid, overrides = {}) => emit(uuid, 'create_room', createPayload(overrides));
    const currentRoom = async (uuid) => (await emit(uuid, 'get_current_room', {})).room;
    const publicRooms = async (uuid) => emit(uuid, 'get_public_rooms', {});
    // 코드 입장 (ack 없는 사건이라 처리기를 직접 기다림, 결과는 방 명단으로 봄)
    const join = (uuid, roomCode) => MM.handleJoinRoomByCode(io, sock(uuid), uuid, roomCode);
    // 준비 (방·버전은 그 사람이 지금 보는 방에서 읽음, version을 주면 그 버전으로)
    const ready = async (uuid, isReady = true, { roomId, version } = {}) => {
        const room = roomId ? null : await currentRoom(uuid);
        return emit(uuid, 'set_ready', {
            roomId: roomId ?? room.roomId,
            expectedSettingsVersion: version ?? room.settingsVersion,
            isReady,
        });
    };
    // 시작 (방장이 지금 보는 방·버전, version을 주면 그 버전으로)
    const start = async (by, { roomId, version } = {}) => {
        const room = roomId && version ? null : await currentRoom(by);
        return emit(by, 'start_game', {
            roomId: roomId ?? room.roomId,
            expectedSettingsVersion: version ?? room.settingsVersion,
        });
    };
    // 설정 바꾸기 요청 값: 지금 방 설정 + 바꿀 칸 (undefined 칸은 뺌)
    let requestSeq = 0;
    const updatePayload = async (by, overrides = {}, { roomId, version, requestId } = {}) => {
        const room = await currentRoom(by);
        requestSeq += 1;
        const payload = {
            roomId: roomId ?? room?.roomId,
            requestId: requestId ?? `req-${requestSeq}`,
            expectedSettingsVersion: version ?? room?.settingsVersion ?? 1,
            accessType: room?.accessType ?? 'open',
            ...(room?.settings ?? {}),
            ...overrides,
        };
        for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
        return payload;
    };
    const update = async (by, overrides = {}, options = {}) =>
        emit(by, 'update_room_settings', await updatePayload(by, overrides, options), options.socket);

    // 방 열기: 첫 사람이 만들고 나머지 코드 입장, readyAll이면 전원 준비 (준비할 사람 목록을 줘도 됨)
    async function openRoom({ prefix, n, readyAll = true, readyUuids = null, existing = [], ...overrides }) {
        const fresh = Array.from({ length: n - existing.length }, (_, i) => `${prefix}-${i}`);
        for (const uuid of fresh) connect(uuid);
        const uuids = [...fresh, ...existing];
        const [host, ...guests] = uuids;
        const created = await create(host, overrides);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await join(uuid, created.room.roomCode);
        const roster = (await currentRoom(host)).players.map((p) => p.uuid);
        assert.deepEqual([...roster].sort(), [...uuids].sort(), '코드 입장 뒤 명단이 다름');
        const toReady = readyUuids ?? (readyAll ? uuids : []);
        for (const uuid of toReady) {
            const r = await ready(uuid, true);
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        return { roomId: created.room.roomId, roomCode: created.room.roomCode, host, guests, uuids, created };
    }

    // 공개 방 목록 마지막 방송의 방들 (0.5초 묶음 기다리는 게 있으면 지금 보냄)
    const lastListed = () => {
        stack.view.flushPublicRoomList(io);
        const lists = io.broadcasts.filter((b) => b.event === 'public_rooms_updated');
        return lists.length ? lists.at(-1).payload.rooms : [];
    };
    // 아무도 game_started를 못 받았는지
    const nobodyStarted = (uuids) => uuids.every((uuid) => received(uuid, 'game_started').length === 0);

    return {
        ...stack, MM, G, io, fakes, registry, getCurrentSocketId,
        connect, sock, emit, received, create, currentRoom, publicRooms, join, ready, start,
        updatePayload, update, openRoom, lastListed, nobodyStarted,
    };
}

// 초대 입장 가짜 서비스: 초대 하나 = 방 하나, 수락 기록·명단 넣기 뒤를 문으로 막아 "들어오는 중"을 만듦
// gate: 'decision'(자리만 잡음, 명단 전) / 'receipt'(명단에 넣은 뒤 확정 전)
function makeInviteService() {
    const invites = new Map();
    const gates = new Map();
    const reached = new Map();
    const waitPoint = (inviteId, point) => {
        const key = `${inviteId}:${point}`;
        const r = reached.get(key);
        if (r) r.resolve();
        const g = gates.get(key);
        return g ? g.promise : Promise.resolve();
    };
    const deferred = () => {
        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        return { promise, resolve };
    };
    const service = {
        getAttemptOutcome: async ({ receiverId, inviteId }) => {
            const inv = invites.get(inviteId);
            if (!inv || inv.receiverId !== receiverId) return { known: false };
            return { known: true, staleAttempt: false, roomId: inv.roomId, roomInstanceId: inv.roomInstanceId, bootEpoch: inv.bootEpoch, entryOutcome: null };
        },
        recordAcceptDecision: async ({ inviteId }) => { await waitPoint(inviteId, 'decision'); return { ok: true }; },
        finalizeAcceptedEntry: async ({ inviteId, publish }) => {
            const committed = publish();
            if (!committed || committed.ok !== true) return { ok: false, code: committed?.code ?? 'ROOM_STATE_CHANGED', published: false };
            await waitPoint(inviteId, 'receipt');
            return { ok: true, alreadyPublished: false };
        },
        recordEntryInterrupted: async () => true,
        cancelPendingInvitesForRoom: async () => {},
    };
    return {
        service,
        // 초대 하나 심기 (방 정보는 방 만들기 답에서)
        addInvite(inviteId, { receiverId, room, bootEpoch }) {
            invites.set(inviteId, { receiverId, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch });
        },
        // 그 지점에서 멈추게 함 → { reached(멈춘 순간), open() }
        hold(inviteId, point) {
            const key = `${inviteId}:${point}`;
            const g = deferred();
            const r = deferred();
            gates.set(key, g);
            reached.set(key, r);
            return { reached: r.promise, open: () => g.resolve() };
        },
    };
}

// 초대 수락으로 "들어오는 중" 한 사람 만들기 → { reply(끝난 답), open() }
// 방 정원은 그 사람이 들어갈 자리가 있어야 함, point는 makeInviteService.hold와 같음
async function admitByInvite(w, invites, { uuid, roomHolder, point, inviteId = `inv-${uuid}` }) {
    w.matchmaking.__setAdmissionTimeoutsForTests({ step: 60_000, total: 120_000 });
    if (!w.sock(uuid)) w.connect(uuid);
    const room = (await w.emit(roomHolder, 'get_current_room', {})).room;
    invites.addInvite(inviteId, { receiverId: uuid, room, bootEpoch: w.matchmaking.__getBootEpochForTests() });
    const held = invites.hold(inviteId, point);
    const reply = w.emit(uuid, 'accept_game_invite', { inviteId });
    await held.reached;
    // 수락 처리가 멈춘 곳까지 다 오게 한 번 더 양보
    await new Promise((resolve) => setImmediate(resolve));
    return { reply, open: held.open };
}

module.exports = { makeWorld, createPayload, customRoles, makeInviteService, admitByInvite };

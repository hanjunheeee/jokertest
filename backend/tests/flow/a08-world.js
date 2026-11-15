'use strict';

// 판 끝 뒤 같은 방 시험 판 차리기 (a08 시험 파일만 씀) — 대기방 → 시작 → 판 끝 → "대기방으로"·"로비로"·코드 입장·다음 판
// 가짜 소켓·가짜 io + node:test 가짜 시계(setTimeout·Date), DB 주소는 부르는 시험 파일이 먼저 정함 (흐름 시험은 막힌 주소, DB 시험은 시험 DB)
const assert = require('node:assert/strict');

const core = require('../../game-core/gameSession');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');
const e2eHooks = require('../../socket/e2e/gameHooks');
const { getSessionById } = require('../../game-core/queries/byId');
const { handleReturnToRoom } = require('../../socket/matchmaking/room/returnRoom');
const { handleEnterLobby } = require('../../socket/matchmaking/room/lobbyEntry');
const { flushPublicRoomList } = require('../../socket/matchmaking/room/view');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

const MM = matchmaking.__testables;
const G = gs.__testables;

// 가짜 시계 시작 시각 (흐름 시험은 아무 값, DB 시험은 진짜 날짜를 넘김)
const START_MS = 1_000_000;

// 방 시간 기본: 방 설정 최소값 (토론·투표 30초, 재판 15초, 밤 30초)
const MIN_TIMES = { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 };

// 비동기 꼬리 흘려보내기 (setImmediate는 가짜 시계가 안 건드림)
const flush = () => new Promise((resolve) => setImmediate(resolve));

// 세상 하나: 매칭·판 장부 비우고 가짜 서비스 넣고 가짜 시계 켬, 시험 끝에 다 되돌림
// realDb: true면 판 저장·탈주 기록은 진짜 (DB 시험), 아니면 아무것도 안 하는 함수
function makeWorld(t, { now = START_MS, realDb = false } = {}) {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    desertion.__resetForTests();
    // 초대 엿보기 값은 시험이 넣음 (초대 id → 엿본 값)
    const invites = new Map();
    const inviteGates = [];
    mf.installFakeMatchmakingDeps(matchmaking, {
        gameInviteService: {
            cancelPendingInvitesForRoom: async () => {},
            getAttemptOutcome: async ({ inviteId }) => invites.get(inviteId) ?? { known: false },
            // 수락 기록은 시험이 풀 때까지 기다림 (입장 처리 중 상태 만들기용)
            recordAcceptDecision: () => new Promise((resolve) => inviteGates.push(resolve)),
            recordEntryInterrupted: async () => {},
            finalizeAcceptedEntry: async () => ({ ok: true }),
        },
    });
    // 낮 표 기록·업적은 늘 가짜 (이 영역 밖), 판 저장·탈주는 DB 시험만 진짜
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    if (!realDb) {
        G.__setGameResultPersistForTests(async () => ({ ok: true }));
        desertion.__setRepositoryForTests({
            findDesertionsForWarmup: async () => [],
            countDesertionsSince: async () => 0,
            insertDesertion: async () => ({ created: true, row: null }),
        });
    }
    t.mock.method(Math, 'random', () => 0);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        e2eHooks.clearRolePresets();
        core.__resetStateForTests();
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        if (!realDb) {
            G.__setGameResultPersistForTests(null);
            desertion.__setRepositoryForTests(null);
        }
        desertion.__resetForTests();
    });

    // 사람마다 지금 소켓 + 지난 소켓 (다시 붙으면 새 소켓)
    const sockets = new Map();
    const history = new Map();
    let socketSeq = 0;
    const connect = (uuid, options = {}) => {
        socketSeq += 1;
        const s = mf.createFakeSocket(uuid, { id: `sock-${uuid}-${socketSeq}`, ...options });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        history.set(uuid, [...(history.get(uuid) ?? []), s]);
        // 진짜 접속처럼 방·판 사건 받기 붙임 (지운 사건이 받는 곳 없는지 볼 때도 씀)
        matchmaking.registerMatchmakingHandlers(io, s, uuid);
        gs.registerGameHandlers(io, s, uuid);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    // 그 사람 소켓 전부(지난 소켓 포함)가 받은 그 알림 값
    const received = (uuid, event) => (history.get(uuid) ?? [])
        .flatMap((s) => s.received.filter((e) => e.event === event).map((e) => e.payload));
    const tick = (ms) => t.mock.timers.tick(ms);

    // 화면이 보내는 것처럼 (답 받는 사건)
    const ask = (handler, uuid, payload) => mf.callAsPromise(handler, io, sock(uuid), uuid, payload);

    // ── 방 ──

    // 방 만들기 (보내는 값 그대로), 답
    const createRoom = (uuid, payload) => mf.callAsPromise(MM.handleCreateRoom, io, sock(uuid), uuid, payload);
    // 방 만들기 값: 공개 방식·정원·광대·시간·직접 구성
    const roomPayload = ({ accessType = 'code', maxPlayers, jokerCount = 1, roleCounts = null, times = {}, roleNightActionTimes, extra = {} }) => ({
        accessType, maxPlayers, jokerCount, ...MIN_TIMES, ...times,
        ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        ...(roleNightActionTimes ? { roleNightActionTimes } : {}),
        ...extra,
    });

    // 코드 입장: 입장 알림·실패 알림 중 새로 온 것 → { ok:true, room } / { ok:false, code, message }
    async function joinCode(uuid, code) {
        const s = sock(uuid);
        const before = s.received.length;
        await MM.handleJoinRoomByCode(io, s, uuid, code);
        await flush();
        return lastJoinOutcome(s, before);
    }
    // 공개 방 목록으로 입장
    async function joinPublic(uuid, roomId) {
        const s = sock(uuid);
        const before = s.received.length;
        await MM.handleJoinPublicRoom(io, s, uuid, { roomId });
        await flush();
        return lastJoinOutcome(s, before);
    }
    function lastJoinOutcome(s, before) {
        const fresh = s.received.slice(before);
        const joined = fresh.find((e) => e.event === 'room_joined');
        if (joined) return { ok: true, room: joined.payload };
        const failed = fresh.find((e) => e.event === 'room_join_failed');
        if (failed) return { ok: false, ...failed.payload };
        return { ok: false, code: 'NO_ANSWER' };
    }
    // 지금 방 묻기 (get_current_room) → 방 내용 또는 null
    const currentRoom = async (uuid) => (await mf.callAsPromise(MM.handleGetCurrentRoom, uuid)).room;
    // 공개 방 목록 답 (get_public_rooms)
    const publicRooms = async () => (await mf.callAsPromise(MM.handleGetPublicRooms)).rooms;
    // 공개 방 목록 방송 기다리는 것 바로 보냄
    const flushList = () => flushPublicRoomList(io);
    // 대기방 나가기 (leave_room)
    const leaveRoom = async (uuid) => { MM.removeFromRoom(io, sock(uuid), uuid); await flush(); };
    // 방장 방 지우기 (delete_room)
    const deleteRoom = (uuid) => new Promise((resolve) => MM.handleDeleteRoom(io, uuid, { socket: sock(uuid), callback: resolve }));
    // 준비 (set_ready), 방 내용은 지금 방 묻기로 새로 받음
    async function ready(uuid, isReady = true) {
        const room = await currentRoom(uuid);
        assert.ok(room, `${uuid} 준비할 방 없음`);
        return mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(room, isReady));
    }
    // 방장 추방 (kick_room_player), 자리 번호는 지금 방 내용에서
    let kickSeq = 0;
    async function kick(hostUuid, targetUuid) {
        const room = await currentRoom(hostUuid);
        assert.ok(room, `${hostUuid} 방 없음`);
        kickSeq += 1;
        const payload = {
            requestId: `kick-${kickSeq}`,
            bootEpoch: BOOT_EPOCH,
            roomId: room.roomId,
            roomInstanceId: room.roomInstanceId,
            requesterMembershipId: room.players.find((p) => p.uuid === hostUuid)?.membershipId ?? 'none',
            targetUuid,
            targetMembershipId: room.players.find((p) => p.uuid === targetUuid)?.membershipId ?? 'none',
        };
        return mf.callAsPromise(MM.handleKickRoomPlayer, io, sock(hostUuid), hostUuid, payload);
    }
    // 방 설정 바꾸기 (update_room_settings), 지금 설정에 changes를 덮어 보냄
    async function updateSettings(hostUuid, changes) {
        const room = await currentRoom(hostUuid);
        assert.ok(room, `${hostUuid} 방 없음`);
        kickSeq += 1;
        const payload = {
            roomId: room.roomId, requestId: `set-${kickSeq}`, expectedSettingsVersion: room.settingsVersion,
            accessType: room.accessType, ...room.settings, ...changes,
        };
        return mf.callAsPromise(MM.handleUpdateRoomSettings, io, sock(hostUuid), hostUuid, payload);
    }
    // 방장 시작 (presets = { uuid: 역할 } 이면 그 방만 역할 미리 정하기 손잡이를 켜고 시작)
    async function start(hostUuid, presets = null) {
        const room = await currentRoom(hostUuid);
        assert.ok(room, `${hostUuid} 시작할 방 없음`);
        const saved = process.env.E2E_HOOKS;
        if (presets) {
            process.env.E2E_HOOKS = '1';
            e2eHooks.setRolePresets(presets, { roomId: room.roomId });
        }
        try {
            return await mf.callAsPromise(MM.handleStartGame, io, sock(hostUuid), hostUuid, mf.startPayload(room));
        } finally {
            if (saved === undefined) delete process.env.E2E_HOOKS;
            else process.env.E2E_HOOKS = saved;
        }
    }
    // 방 장부에서 그 코드 방 (없으면 null) — 판 끝 직후 빈 방·방장 칸·남긴 자리를 볼 때
    function roomByCode(code) {
        const rooms = matchmaking.__getStateSnapshotForTests().gameRooms.map(([, room]) => room);
        const found = rooms.filter((room) => room.code === code);
        assert.ok(found.length <= 1, `같은 코드 방이 ${found.length}개`);
        if (!found[0]) return null;
        return { ...found[0], players: new Map(found[0].players) };
    }
    // 장부 안 그 코드 방 수
    const countRoomsWithCode = (code) => matchmaking.__getStateSnapshotForTests().gameRooms
        .filter(([, room]) => room.code === code).length;

    // ── 판 ──

    // 첫 판: 방 만들기 → 코드 입장 → 전원 준비 → 시작 (방장 = 첫 사람, 광대 = 끝 사람들로 정해 둠)
    // uuids를 주면 그 사람들로 (DB 시험은 진짜 uuid), 아니면 <prefix>-번호
    async function openAndStart({ prefix, n, uuids = null, maxPlayers = n, accessType = 'code', jokerCount = 1, roleCounts = null, times = {}, roleNightActionTimes, extra = {}, presets = null }) {
        const people = uuids ?? Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of people) if (!sock(uuid)) connect(uuid);
        const [host, ...guests] = people;
        const created = await createRoom(host, roomPayload({ accessType, maxPlayers, jokerCount, roleCounts, times, roleNightActionTimes, extra }));
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) {
            const joined = await joinCode(uuid, created.room.roomCode);
            assert.equal(joined.ok, true, `${uuid} 입장 실패: ${joined.code}`);
        }
        const roomBefore = roomByCode(created.room.roomCode);
        for (const uuid of people) {
            const r = await ready(uuid);
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        const g = await startGame(people, host, presets ?? jokerPresets(people, jokerCount));
        return { ...g, roomCode: created.room.roomCode, roomBefore };
    }

    // 끝 사람들을 광대로 (방장이 광대가 안 되게)
    const jokerPresets = (people, jokerCount) =>
        Object.fromEntries(people.slice(-jokerCount).map((uuid) => [uuid, 'JOKER']));

    // 지금 방에서 방장 시작 → 판 내용 (시작 알림으로 직업 모음), 실패면 바로 멈춤
    async function startGame(people, host, presets) {
        const reply = await start(host, presets);
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        return gameOf(people, host, reply.gameId);
    }
    // 그 판 시작 알림으로 직업 모으기 → { uuids, host, gameId, roles, started }
    function gameOf(people, host, gameId) {
        const started = new Map(people.map((uuid) => [uuid, received(uuid, 'game_started').find((p) => p.gameId === gameId)]));
        for (const [uuid, p] of started) assert.ok(p, `${uuid} 시작 알림 없음`);
        const roles = new Map([...started].map(([uuid, p]) => [uuid, p.state.self.role]));
        const roomCode = started.get(host).state.roomCode;
        return { uuids: people, host, gameId, roles, started, roomCode, endedAt: null };
    }

    const session = (g) => getSessionById(g.gameId);
    const alivePlayers = (g) => [...(session(g)?.players.values() ?? [])]
        .filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid);
    const jokersOf = (g) => [...g.roles].filter(([, role]) => role === 'JOKER').map(([uuid]) => uuid);
    const citizensOf = (g) => [...g.roles].filter(([, role]) => role !== 'JOKER').map(([uuid]) => uuid);

    // 판 상태가 맞을 때까지 가짜 시계를 1초씩 넘김 (판을 몰고 갈 때만 씀, 확인은 받은 알림으로)
    // 판이 끝나면 그 순간 시각을 판 끝 시각으로 적어 둠 (1초씩 넘기면 끝난 순간 = 넘긴 끝 시각)
    function advanceUntil(g, done, limitMs = 1_200_000) {
        for (let spent = 0; spent <= limitMs; spent += 1_000) {
            const s = session(g);
            noteEnd(g);
            if (!s || done(s)) return s;
            tick(1_000);
        }
        throw new Error(`판이 ${limitMs}ms 안에 원하는 상태가 안 됨`);
    }
    function noteEnd(g) {
        if (g.endedAt === null && session(g)?.phase === 'ENDED') g.endedAt = Date.now();
    }

    // 낮 하나: target이 있으면 전원 표로 재판 → 전원 유죄로 처형 (피고는 기권), 없으면 아무도 안 내고 마감까지 (기권 → 밤)
    async function day(g, target = null) {
        const s = advanceUntil(g, (x) => x.phase === 'DAY' || x.phase === 'ENDED');
        if (s.phase === 'ENDED') return;
        if (!target) {
            advanceUntil(g, (x) => x.phase !== 'DAY');
            return;
        }
        const alive = alivePlayers(g);
        for (const uuid of alive) await ask(G.handleAcknowledgeDayVoteReady, uuid, { gameId: g.gameId });
        for (const uuid of alive) {
            const r = await ask(G.handleSubmitDayVote, uuid, { gameId: g.gameId, targetId: uuid === target ? null : target });
            assert.equal(r.ok, true, `${uuid} 낮 표 거절: ${r.code}`);
        }
        const tribunal = advanceUntil(g, (x) => x.phase !== 'DAY');
        assert.equal(tribunal.phase, 'TRIBUNAL', '재판으로 안 감');
        for (const uuid of alive.filter((u) => u !== target)) {
            await ask(G.handleCastTribunalVote, uuid, { gameId: g.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' });
        }
        advanceUntil(g, (x) => x.phase !== 'TRIBUNAL');
        noteEnd(g);
    }

    // 밤 하나: victim이 있으면 광대 차례에 산 광대 전원이 그 사람을 고름, 없으면 아무도 안 냄 → 다음 낮(또는 판 끝)까지
    async function night(g, victim = null) {
        advanceUntil(g, (x) => x.phase === 'NIGHT' || x.phase === 'ENDED');
        if (session(g)?.phase === 'ENDED') return;
        if (victim) {
            advanceUntil(g, (x) => x.phase !== 'NIGHT' || x.nightTurnRole === 'JOKER');
            for (const joker of jokersOf(g).filter((u) => alivePlayers(g).includes(u))) {
                const r = await mf.callAsPromise(G.handleSubmitNightAction, sock(joker), joker, { gameId: g.gameId, targetId: victim });
                assert.equal(r.ok, true, `${joker} 밤 행동 거절: ${r.code}`);
            }
        }
        advanceUntil(g, (x) => x.phase !== 'NIGHT');
        noteEnd(g);
    }

    // 판 끝까지 (how: 'citizenWin' 광대를 차례로 처형 / 'jokerNightWin' 밤마다 광대가 시민 하나씩 / 'jokerLeaves' 광대가 산 채로 나감)
    async function endGame(g, how = 'citizenWin') {
        if (how === 'citizenWin') {
            for (const joker of jokersOf(g)) await day(g, joker);
        } else if (how === 'jokerNightWin') {
            for (let i = 0; i < 10 && session(g)?.phase !== 'ENDED'; i += 1) {
                await day(g, null);
                const victim = alivePlayers(g).find((u) => g.roles.get(u) !== 'JOKER');
                await night(g, victim);
            }
        } else if (how === 'jokerLeaves') {
            for (const joker of jokersOf(g)) await lobby(joker, g.gameId);
        } else {
            throw new Error(`모르는 끝내기 ${how}`);
        }
        noteEnd(g);
        assert.equal(session(g)?.phase, 'ENDED', '판이 안 끝남');
        assert.ok(Number.isFinite(g.endedAt), '판 끝 시각을 못 적음');
        return g;
    }

    // 판 끝 시각부터 ms 지난 때까지 시계 넘김 (지난 때보다 앞이면 안 넘김)
    function tickToSinceEnd(g, ms) {
        const target = g.endedAt + ms;
        const gap = target - Date.now();
        assert.ok(gap >= 0, `이미 판 끝 + ${Date.now() - g.endedAt}ms (요청 ${ms}ms)`);
        if (gap > 0) tick(gap);
    }

    // ── 결과 화면 단추 ──

    // "대기방으로" (return_to_room)
    async function ret(uuid, gameId, payload = { gameId }) {
        const reply = await mf.callAsPromise(handleReturnToRoom, io, sock(uuid), uuid, payload);
        await flush();
        return reply;
    }
    // "로비로" (leave_game_session), 판 중이면 나가기
    async function lobby(uuid, gameId) {
        const reply = await ask(G.handleLeaveGameSession, uuid, { gameId });
        await flush();
        return reply;
    }
    // 로비 주소로 감 (enter_lobby)
    async function enterLobby(uuid) {
        const reply = await new Promise((resolve) => handleEnterLobby(io, sock(uuid), uuid, resolve));
        await flush();
        return reply;
    }
    // 판 상태 다시 받기 (get_session_snapshot)
    const snapshot = (uuid, gameId) => ask(G.handleGetSessionSnapshot, uuid, gameId ? { gameId } : {});

    // 연결 끊김: 진짜 접속처럼 판 쪽·대기방 쪽 끊김 처리 둘 다
    async function disconnect(uuid) {
        const s = sock(uuid);
        s.connected = false;
        await gs.onDisconnect(io, s, uuid);
        matchmaking.onDisconnect(io, s, uuid);
        await flush();
    }
    // 다시 붙음: 새 소켓 + 판·방 채널 다시 잇기 (화면 새로고침과 같음)
    async function reconnect(uuid, options = {}) {
        const s = connect(uuid, options);
        await gs.resyncSessionRouting(s, uuid, io).catch(() => {});
        await matchmaking.resyncRoomChannelOnReconnect(s, uuid);
        await flush();
        return s;
    }

    return {
        io, invites, inviteGates, connect, sock, received, tick, ask, flush,
        createRoom, roomPayload, joinCode, joinPublic, currentRoom, publicRooms, flushList, leaveRoom, deleteRoom,
        ready, kick, updateSettings, start, roomByCode, countRoomsWithCode,
        openAndStart, startGame, gameOf, jokerPresets, session, alivePlayers, jokersOf, citizensOf,
        advanceUntil, day, night, endGame, tickToSinceEnd,
        ret, lobby, enterLobby, snapshot, disconnect, reconnect,
    };
}

module.exports = { makeWorld, START_MS, MIN_TIMES, flush, MM, G, core, matchmaking, gs };

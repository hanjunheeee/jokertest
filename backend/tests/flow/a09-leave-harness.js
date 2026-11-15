'use strict';

// A09 나가기·죽은 사람 풀기·탈주 대기 시험 판 차리기 (a09-leave-game·a09-dead-release·a09-desertion-* 흐름 시험과 a09 DB·관리자 시험만 씀)
// 판 여럿 + 대기방 다섯 길(방 만들기·코드 입장·공개 방·초대 수락·자동 매칭)을 한 가짜 소켓 세상에 둠, 시계는 node:test 가짜 시계
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// gameFixtures가 맨 위에서 DATABASE_URL을 막음 → DB 시험은 models를 먼저 불러 둔 뒤 이 파일을 부름
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');
const mmState = require('../../socket/matchmaking/core/state');
const { getSessionById } = require('../../game-core/queries/byId');

const { core } = gf;
const T = gs.__testables;
const M = matchmaking.__testables;

// 가짜 시계 시작 시각: 2026-11-16 12:00 한국 시간 (자정과 멀어 날이 안 바뀜)
const START_MS = Date.UTC(2026, 10, 16, 3, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// 한국 시간 → ms (예: kst(2026, 11, 16, 23, 50) → 2026-11-16T14:50:00Z)
const kst = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h - 9, mi, s);

// 방 설정 기본값: 토론·투표·밤 30초, 재판 15초 (방 설정 최소값)
const BASE_SETTINGS = { dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30, tribunalTime: 15 };

// 탈주 저장소 가짜: DB처럼 줄을 들고 셈 (같은 사람·같은 판 두 번째는 있던 줄), over로 함수 바꿔 끼움
function fakeDesertionRepo(over = {}) {
    const rows = [];
    const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
    const repo = {
        rows,
        countDesertionsSince: async ({ userId, since, excludeGameId }) => rows
            .filter((r) => r.user_id === userId && ms(r.deserted_at) >= ms(since) && r.game_id !== excludeGameId).length,
        insertDesertion: async ({ userId, gameId, reason, desertedAt, blockedUntil }) => {
            const same = rows.find((r) => r.user_id === userId && r.game_id === gameId);
            if (same) return { created: false, row: same };
            const row = { user_id: userId, game_id: gameId, reason, deserted_at: desertedAt, blocked_until: blockedUntil };
            rows.push(row);
            return { created: true, row };
        },
        findDesertionsForWarmup: async () => [],
        ...over,
    };
    return repo;
}

// 초대 서비스 가짜: 초대 id → 방 id 표, 수락 기록·영수증은 늘 성공 (DB 안 감)
function fakeInviteService() {
    const invites = new Map();
    return {
        invites,
        getAttemptOutcome: async ({ inviteId }) => {
            const roomId = invites.get(inviteId);
            const room = roomId ? mmState.gameRooms.get(roomId) : null;
            if (!room) return { known: false };
            return { known: true, roomId, roomInstanceId: room.instanceId ?? room.id, bootEpoch: matchmaking.__getBootEpochForTests() };
        },
        recordAcceptDecision: async () => ({ ok: true }),
        finalizeAcceptedEntry: async ({ publish }) => publish(),
        recordEntryInterrupted: async () => {},
        cancelPendingInvitesForRoom: async () => {},
    };
}

// 시험 하나 준비
// opts.now: 시작 시각 / opts.timers: 'fake'(setTimeout·Date 가짜) · 'date'(Date만 가짜, DB 시험) · 'real'
// opts.repo: 탈주 저장소 가짜 바꿀 함수들, null이면 진짜 저장소(DB 시험) / opts.realPersist: 판 끝 저장을 진짜로(DB 시험)
function setup(t, { now = START_MS, timers = 'fake', repo = {}, realPersist = false } = {}) {
    gf.resetCore();
    gs.__resetStateForTests();
    matchmaking.__resetStateForTests();
    desertion.__resetForTests();
    if (timers === 'fake') t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
    if (timers === 'date') t.mock.timers.enable({ apis: ['Date'], now });
    // 방에서 시작한 판 직업 고정 (시작이 Math.random으로 나눔)
    t.mock.method(Math, 'random', () => 0);

    // DB에 쓰는 곳 막기 (메모리 시험), DB 시험은 판 끝 저장만 진짜로
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    if (!realPersist) T.__setGameResultPersistForTests(async () => ({ ok: true }));
    const desertionRepo = repo === null ? null : fakeDesertionRepo(repo);
    if (desertionRepo) desertion.__setRepositoryForTests(desertionRepo);

    const invite = fakeInviteService();
    mf.installFakeMatchmakingDeps(matchmaking, { gameInviteService: invite });

    const io = mf.createFakeIo([]);
    const registry = new Map();
    gs.setOnlineUsersRegistry(registry);
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setEmitToUser(() => {});

    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
    });

    const sockets = new Map();
    let socketSeq = 0;
    let gameSeq = 0;
    let outsiderSeq = 0;
    let inviteSeq = 0;

    const w = {
        t, io, registry, sockets, desertionRepo, invite,
        tick: (ms) => t.mock.timers.tick(ms),
        now: () => Date.now(),
        sock: (uuid) => sockets.get(uuid),
        // 그 사람 지금 소켓이 받은 그 알림
        received: (uuid, event) => sockets.get(uuid).received.filter((e) => e.event === event),
    };

    // 새 소켓으로 붙음 (새 탭·새로고침), session을 주면 판 채널 안에 넣음, 접속 목록은 이 소켓
    w.connect = (uuid, session = null) => {
        socketSeq += 1;
        const socket = mf.createFakeSocket(uuid, { id: `sock-${uuid}-${socketSeq}` });
        if (session) {
            socket.rooms.add(session.channelId);
            socket.data.activeGameId = session.id;
        }
        io.sockets.sockets.set(socket.id, socket);
        registry.set(uuid, socket.id);
        sockets.set(uuid, socket);
        return socket;
    };

    // 판 하나 열기: 사람(uuids 또는 접두어 n명), 직업 고정(randomFn 0), 사람마다 소켓 (단계는 역할 확인)
    // roleCounts 없으면 광대 1·나머지 시민, extra에 hostUuid·code
    w.openGame = ({ n, uuids, prefix, roleCounts = { JOKER: 1 }, settings = {}, hostUuid, code, gameId } = {}) => {
        gameSeq += 1;
        const ids = uuids ?? Array.from({ length: n }, (_, i) => `${prefix ?? 'a09g'}${gameSeq}-${i}`);
        const room = {
            id: `room-${gameSeq}-${crypto.randomUUID().slice(0, 8)}`,
            ...(code ? { code } : {}),
            ...(hostUuid ? { hostUuid } : {}),
            players: new Map(ids.map((uuid, i) => [uuid, { uuid, nickname: `닉${gameSeq}${i}`, isReady: true }])),
            settings: {
                maxPlayers: 10,
                jokerCount: roleCounts.JOKER,
                roleCompositionMode: 'custom',
                roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts },
                ...BASE_SETTINGS,
                ...settings,
            },
        };
        const id = gameId ?? `g-a09-${gameSeq}-${crypto.randomUUID().slice(0, 8)}`;
        const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => id });
        assert.equal(candidate.ok, true, `판 만들기 거절: ${candidate.reason ?? candidate.code}`);
        core.commitGameSession(candidate.session);
        for (const uuid of ids) w.connect(uuid, candidate.session);
        return candidate.session;
    };

    // 판 바깥 사람 하나 (소켓만)
    w.outsider = (label = 'out') => {
        outsiderSeq += 1;
        const uuid = `a09-${label}-${outsiderSeq}`;
        w.connect(uuid);
        return uuid;
    };

    // ── 판 요청 (화면이 보내는 것 그대로) ──
    w.leave = (session, uuid, socket = w.sock(uuid)) => gf.call(T.handleLeaveGameSession, io, socket, uuid, { gameId: session.id });
    w.snapshot = (session, uuid) => gf.call(T.handleGetSessionSnapshot, io, w.sock(uuid), uuid, { gameId: session.id });
    w.dayVote = (session, uuid, targetId) => gf.call(T.handleSubmitDayVote, io, w.sock(uuid), uuid, { gameId: session.id, targetId });
    w.cast = (session, uuid, vote) => gf.call(T.handleCastTribunalVote, io, w.sock(uuid), uuid, { gameId: session.id, dayIndex: session.dayIndex, vote });
    w.nightPick = (session, uuid, targetId) => gf.call(T.handleSubmitNightAction, w.sock(uuid), uuid, { gameId: session.id, targetId });

    // 끊김: 지금 소켓을 끊고 서버 끊김 처리 (산 사람이면 60초 기다림 시작)
    w.disconnect = async (uuid) => {
        const socket = w.sock(uuid);
        socket.connected = false;
        await gs.onDisconnect(io, socket, uuid);
    };

    // 다시 붙음: 새 소켓(판 채널 안) + 스냅샷 요청 (화면 새로고침과 같음), 스냅샷 답
    w.reconnect = (session, uuid) => {
        w.connect(uuid, session);
        return w.snapshot(session, uuid);
    };

    // ── 판 진행 (판 규칙 함수로 바로, 보는 것은 그 뒤 소켓 길) ──
    // 피고 세우고 투표할 사람 전원 유죄 → 처형 확정 (낮이 아니면 첫 낮부터)
    w.execute = (session, defendant) => {
        if (session.phase === 'ROLE_REVEAL') gf.toDay(session);
        gf.toTribunal(session, defendant);
        for (const uuid of core.getTribunalVoterUuids(session, defendant)) {
            assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY').ok, true);
        }
        const anyone = [...session.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
        const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
        assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
        const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
        assert.equal(committed.ok, true, `재판 확정 실패: ${committed.code}`);
        assert.equal(session.players.get(defendant).alive, false);
        return committed;
    };

    // 밤 하나 끝내기 (victim 주면 광대가 죽임), 끝나면 다음 날 낮
    w.night = (session, victim = null) => {
        T.stopNightTurnSequence(session.id);
        if (session.phase !== 'NIGHT') gf.toNight(session);
        const joker = [...session.players.values()].find((p) => p.role === 'JOKER' && p.alive).uuid;
        if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
        gf.skipAllNight(session);
        const prepared = core.prepareNightResolution(joker, session.id);
        assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
        const committed = core.commitNightResolution(prepared.session, prepared.resolution);
        assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
        return committed;
    };

    // 진짜 낮 타이머 걸고 토론 30초 넘김 → 투표 단계
    w.startDayVote = (session) => {
        if (session.phase === 'ROLE_REVEAL') gf.toDay(session);
        T.startDayPhaseTimer(io, session);
        w.tick(30_000);
        assert.equal(core.getDayPhase(session), 'DAY_VOTE');
    };

    // ── 대기방 다섯 길 ──
    w.createRoom = (uuid, overrides = {}) => mf.callAsPromise(
        M.handleCreateRoom, io, w.sock(uuid), uuid, mf.validSettingsPayload({ maxPlayers: 8, jokerCount: 1, ...overrides }),
    );

    // 판 바깥 사람이 연 대기방 (코드 입장·공개 방·초대 수락 대상), { roomId, roomCode }
    w.hostRoom = async (accessType = 'open') => {
        const host = w.outsider('host');
        const created = await w.createRoom(host, { accessType });
        assert.equal(created.ok, true, `대기방 만들기 실패: ${created.code ?? created.message}`);
        return { roomId: created.room.roomId, roomCode: created.room.roomCode, host };
    };

    // 알림으로 답하는 길: 보낸 뒤 새로 받은 입장 알림 하나 (들어감·실패·매칭 꺼짐)
    const lastJoinEvent = (uuid, before) => w.sock(uuid).received.slice(before)
        .filter((e) => ['room_joined', 'room_join_failed', 'matchmaking_disabled'].includes(e.event)).at(-1) ?? null;

    w.joinByCode = async (uuid, roomCode) => {
        const before = w.sock(uuid).received.length;
        await M.handleJoinRoomByCode(io, w.sock(uuid), uuid, roomCode);
        return lastJoinEvent(uuid, before);
    };
    w.joinPublic = async (uuid, roomId) => {
        const before = w.sock(uuid).received.length;
        await M.handleJoinPublicRoom(io, w.sock(uuid), uuid, { roomId });
        return lastJoinEvent(uuid, before);
    };
    w.acceptInvite = (uuid, roomId) => {
        inviteSeq += 1;
        const inviteId = `inv-a09-${inviteSeq}`;
        invite.invites.set(inviteId, roomId);
        return mf.callAsPromise(M.handleAcceptGameInvite, io, w.sock(uuid), uuid, { inviteId });
    };
    w.joinMatchmaking = async (uuid) => {
        const before = w.sock(uuid).received.length;
        await M.handleJoinMatchmaking(io, w.sock(uuid), uuid);
        return lastJoinEvent(uuid, before);
    };

    // 다섯 길 하나 해 보기 → { ok, code, message, retryAfterMs, blockedUntil, event }
    // ok = 방 만들기·초대 수락 답 ok / 코드·공개 방 room_joined 받음, 자동 매칭은 늘 ok false (event로 봄)
    w.tryWay = async (uuid, way) => {
        if (way === 'create_room') {
            const res = await w.createRoom(uuid);
            return { ok: res.ok === true, event: null, ...res };
        }
        if (way === 'join_matchmaking') {
            const ev = await w.joinMatchmaking(uuid);
            return { ok: false, event: ev?.event ?? null, ...(ev?.payload ?? {}) };
        }
        const target = await w.hostRoom('open');
        if (way === 'accept_game_invite') {
            const res = await w.acceptInvite(uuid, target.roomId);
            return { ok: res.ok === true, event: null, ...res };
        }
        const ev = way === 'join_room_by_code'
            ? await w.joinByCode(uuid, target.roomCode)
            : await w.joinPublic(uuid, target.roomId);
        return { ok: ev?.event === 'room_joined', event: ev?.event ?? null, ...(ev?.payload ?? {}) };
    };

    // 공개 방 목록 답
    w.publicRooms = () => new Promise((resolve) => M.handleGetPublicRooms(resolve));

    // 로비 입장 (enter_lobby): 사건 등록 뒤 소켓에 보내기, 답
    w.enterLobby = (uuid) => new Promise((resolve) => {
        const socket = w.sock(uuid);
        if (socket.listenerCount('enter_lobby') === 0) matchmaking.registerMatchmakingHandlers(io, socket, uuid);
        socket.trigger('enter_lobby', {}, resolve);
    });

    // 방에서 진짜로 판 시작: 방장 방 만들기 → 나머지 코드 입장·준비 → 시작, 판 (역할 확인 타이머는 끔)
    w.startRoomGame = async (uuids, { jokerCount = 1 } = {}) => {
        for (const uuid of uuids) if (!sockets.has(uuid) || !w.sock(uuid).connected) w.connect(uuid);
        const [host, ...guests] = uuids;
        const created = await w.createRoom(host, { maxPlayers: uuids.length, jokerCount, accessType: 'code', ...BASE_SETTINGS });
        assert.equal(created.ok, true, `방 만들기 실패: ${created.code ?? created.message}`);
        for (const g of guests) {
            const ev = await w.joinByCode(g, created.room.roomCode);
            assert.equal(ev?.event, 'room_joined', `입장 실패: ${ev?.payload?.code}`);
        }
        for (const u of uuids) {
            const r = await mf.callAsPromise(M.handleSetReady, io, w.sock(u), u, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `준비 실패: ${r.code}`);
        }
        const started = await mf.callAsPromise(M.handleStartGame, io, w.sock(host), host, mf.startPayload(created.room));
        assert.equal(started.ok, true, `시작 실패: ${started.code}`);
        const session = getSessionById(started.gameId);
        T.stopRoleRevealTimer(session.id);
        for (const u of uuids) {
            w.sock(u).rooms.add(session.channelId);
            w.sock(u).data.activeGameId = session.id;
        }
        return { session, roomCode: created.room.roomCode };
    };

    return w;
}

// 알림 값 안에 직업·편 칸이 있는지 (어느 깊이든)
function hasRoleField(value) {
    if (Array.isArray(value)) return value.some(hasRoleField);
    if (value && typeof value === 'object') {
        return Object.entries(value).some(([key, v]) => ['role', 'team'].includes(key) || hasRoleField(v));
    }
    return false;
}

module.exports = {
    gf,
    gs,
    T,
    M,
    core,
    desertion,
    START_MS,
    MINUTE,
    HOUR,
    DAY,
    kst,
    setup,
    hasRoleField,
};

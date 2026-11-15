'use strict';

// 로비 입장 정리 시험 세상 (a10 흐름 시험 파일만 씀) — 가짜 소켓·가짜 io + node:test 가짜 시계(setTimeout·setInterval·Date)
// 소켓마다 진짜 연결 처리기(socket.js registerConnectionHandlers)를 붙임 → 옛 탭 밀어내기·방 채널 다시 붙기·사건 검사·끊김 처리가 진짜 길로 감
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const mf = require('../helpers/matchmakingFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const socketModule = require('../../socket/socket');
const emitter = require('../../socket/emitter');
const presenceService = require('../../services/presence/status');
const sessionCheckRepository = require('../../repositories/user/sessionCheck');
const userRepository = require('../../repositories/user');
const desertion = require('../../services/game/desertion');
const maintenance = require('../../services/ops/maintenance');
const e2eHooks = require('../../socket/e2e/gameHooks');
const { getSessionById } = require('../../game-core/queries/byId');
const coreSession = require('../../game-core/gameSession');

const G = gs.__testables;
const S = socketModule.__testables;

// 가짜 시계 시작 시각 (아무 값)
const START_MS = 1_800_000_000_000;

// 방 시간: 방 설정 최소값 (토론·투표 30초, 재판 15초, 밤 30초)
const TIMES = { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 };

// 계정 읽기를 사람마다 붙잡아 둘 수 있는 가짜 (처리 중 입장을 시험할 때 "답 전" 상태 만들기)
function makeGates() {
    const gates = new Map();
    return {
        // 그 사람 다음 계정 읽기를 붙잡음 → 풀기 함수 돌려줌
        hold(uuid) {
            let release;
            const promise = new Promise((resolve) => { release = resolve; });
            gates.set(uuid, promise);
            return () => { gates.delete(uuid); release(); };
        },
        wait(uuid) {
            return gates.get(uuid) ?? null;
        },
    };
}

// 초대 서비스 가짜 (메모리): 초대 하나 = 받는 사람·방·방 인스턴스, 수락 기록은 붙잡아 둘 수 있음
function makeInviteService(decisionGates) {
    const invites = new Map();
    let seq = 0;
    return {
        invites,
        add(receiverId, room) {
            seq += 1;
            const id = `inv-${seq}`;
            invites.set(id, {
                id, receiverId, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
                bootEpoch: room.bootEpoch, attemptId: null, entryOutcome: null,
            });
            return id;
        },
        async getAttemptOutcome({ receiverId, inviteId, attemptId }) {
            const row = invites.get(inviteId);
            if (!row || row.receiverId !== receiverId) return { known: false };
            if (attemptId !== undefined && row.attemptId !== attemptId) return { known: true, staleAttempt: true, invite: { id: row.id } };
            return {
                known: true, staleAttempt: false, invite: { id: row.id }, roomId: row.roomId,
                roomInstanceId: row.roomInstanceId, bootEpoch: row.bootEpoch, entryOutcome: row.entryOutcome,
            };
        },
        async recordAcceptDecision({ receiverId, inviteId, attemptId }) {
            const gate = decisionGates.wait(receiverId);
            if (gate) await gate;
            const row = invites.get(inviteId);
            row.attemptId = attemptId;
            return { ok: true, invite: { id: row.id }, roomId: row.roomId, roomInstanceId: row.roomInstanceId };
        },
        async finalizeAcceptedEntry({ inviteId, publish }) {
            const row = invites.get(inviteId);
            const published = publish();
            if (!published.ok) return { ok: false, code: published.code, published: false };
            row.entryOutcome = 'PUBLISHED';
            return { ok: true, invite: { id: row.id } };
        },
        async recordEntryInterrupted({ inviteId }) {
            const row = invites.get(inviteId);
            if (row && row.entryOutcome !== 'PUBLISHED') row.entryOutcome = 'INTERRUPTED';
            return true;
        },
        async cancelPendingInvitesForRoom() {},
    };
}

// 세상 하나 차리기: 장부 비우기 → 가짜 서비스 → 가짜 시계 → 접속 목록 (emitter의 Map 하나를 셋이 같이 봄)
// realDb: 전적·판 골드·탈주를 진짜 저장소로 (DB 시험), realSessions: 소켓 세션 검사를 진짜 DB로 (세션 DB 시험)
function makeWorld(t, { realDb = false, realSessions = false } = {}) {
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    desertion.__resetForTests();
    emitter.onlineUsers.clear();
    maintenance.__setStateForTests({ enabled: false });

    const userGates = makeGates();
    const decisionGates = makeGates();
    const inviteService = makeInviteService(decisionGates);
    mf.installFakeMatchmakingDeps(matchmaking, {
        userRepository: {
            findByUuid: async (uuid) => {
                const gate = userGates.wait(uuid);
                if (gate) await gate;
                return { uuid, nickname: `닉-${uuid}` };
            },
        },
        gameInviteService: inviteService,
    });
    // 낮 표 기록·업적·전적 저장은 DB에 씀 → 메모리 시험에선 바꿔 끼움 (DB 시험은 setPersist로 진짜 저장)
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(realDb ? null : async () => ({ ok: true }));
    if (!realDb) {
        desertion.__setRepositoryForTests({
            countDesertionsSince: async () => 0,
            insertDesertion: async () => ({ created: true, row: null }),
            findDesertionsForWarmup: async () => [],
        });
    }
    // 접속 상태 저장·친구 목록은 DB → 아무것도 안 함
    t.mock.method(presenceService, 'setPresence', async () => {});
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => []);
    // 사건마다 세션 검사: 기본은 살아 있음, banned/expired로 바꾸면 그 사람 검사 결과가 바뀜
    const sessionStates = new Map();
    if (!realSessions) {
        t.mock.method(sessionCheckRepository, 'loadSessionCheck', async (sessionId, uuid) => {
            const state = sessionStates.get(uuid) ?? 'ok';
            if (state === 'gone') return [null, null];
            const session = { is_online: true, refresh_token_expires_at: null, User: { status: state === 'inactive' ? 'INACTIVE' : 'ACTIVE' } };
            return [session, state === 'banned' ? { reason: '시험 정지' } : null];
        });
        t.mock.method(userRepository, 'markOnlineSessionsOffline', async () => {});
    }
    t.mock.method(Math, 'random', () => 0);
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: START_MS });

    const registry = emitter.onlineUsers;
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    // 계정 채널 소켓 찾기 (탈퇴·강제 끊기가 씀, 진짜 socket.io의 fetchSockets 흉내)
    const plainIn = io.in.bind(io);
    io.in = (channel) => ({
        ...plainIn(channel),
        fetchSockets: async () => [...io.sockets.sockets.values()].filter((s) => s.connected && s.rooms.has(channel)),
    });
    emitter.setIo(io);

    // 사람마다 지금 소켓·지금까지 붙은 소켓 전부
    const current = new Map();
    const allSockets = [];
    let socketSeq = 0;

    t.after(() => {
        // 남은 소켓 끊어 세션 주기 검사 타이머 멈춤 (안 하면 다음 시험 타이머가 안 걸림)
        for (const s of allSockets) {
            if (s.connected) { s.connected = false; s.trigger('disconnect', 'test end'); }
        }
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        e2eHooks.clearRolePresets();
        gf.resetCore();
        emitter.onlineUsers.clear();
        emitter.setIo(null);
        maintenance.__setStateForTests({ enabled: false });
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
    });

    // 진짜 socket.io가 끊을 때처럼: 채널에서 다 빠지고 목록에서 지운 뒤 끊김 처리기 부름
    function closeSocket(socket) {
        if (!socket.connected) return;
        socket.connected = false;
        socket.rooms.clear();
        io.sockets.sockets.delete(socket.id);
        socket.trigger('disconnect', 'transport close');
    }

    // 새 소켓 접속 (같은 uuid면 옛 소켓은 서버가 밀어냄), sessionId 같으면 같은 브라우저 새 탭
    async function connect(uuid, { sessionId = `sess-${uuid}`, user = null } = {}) {
        socketSeq += 1;
        const socket = mf.createFakeSocket(uuid, { id: `sock-${uuid}-${socketSeq}` });
        socket.data.user = user ?? { uuid, sessionId };
        socket.server = io;
        socket.handshake = { headers: {} };
        socket.disconnect = () => closeSocket(socket);
        io.sockets.sockets.set(socket.id, socket);
        S.registerConnectionHandlers(io, socket);
        current.set(uuid, socket);
        allSockets.push(socket);
        await settle();
        return socket;
    }

    // 서버 쪽 약속이 다 돌 때까지 (가짜 시계는 안 넘김)
    async function settle(rounds = 8) {
        for (let i = 0; i < rounds; i += 1) await gf.flush();
    }

    const sock = (uuid) => current.get(uuid);
    const target = (who) => (typeof who === 'string' ? sock(who) : who);

    // 답 받는 사건 보내기 (화면 socket.emit(event, payload, ack)와 같음), 답 돌려줌
    async function ask(who, event, payload = {}) {
        const socket = target(who);
        let reply;
        const done = new Promise((resolve) => { reply = resolve; });
        socket.trigger(event, payload, reply);
        return done;
    }

    // 답 없는 사건 보내기 → 서버 약속이 돌 때까지 기다림
    async function send(who, event, ...args) {
        target(who).trigger(event, ...args);
        await settle();
    }

    // 로비 입장 (보내는 값 없음 = 답 함수만)
    async function lobby(who) {
        const socket = target(who);
        let reply;
        const done = new Promise((resolve) => { reply = resolve; });
        socket.trigger('enter_lobby', reply);
        const answer = await done;
        await settle();
        return answer;
    }

    // 그 소켓이 받은 알림 (이름으로 거름), 소켓 대신 uuid면 지금 소켓
    const received = (who, event) => target(who).received.filter((e) => e.event === event).map((e) => e.payload);
    const count = (who, event) => received(who, event).length;
    const mark = (who) => target(who).received.length;
    // 표시 뒤로 받은 알림만
    const since = (who, at, event = null) => target(who).received.slice(at)
        .filter((e) => event === null || e.event === event).map((e) => e.payload);

    const tick = async (ms) => { t.mock.timers.tick(ms); await settle(); };
    // 시각 경계를 잘게 넘김 (가짜 시계는 한 번에 넘긴 시간 끝 시각으로 타이머를 부름)
    async function tickBy(ms, step = 1_000) {
        for (let spent = 0; spent < ms; spent += step) await tick(Math.min(step, ms - spent));
    }

    // 방 만들기 (방장 = 그 사람), payload는 덮어쓰기
    async function createRoom(host, payload = {}) {
        return ask(host, 'create_room', { accessType: 'code', maxPlayers: 10, jokerCount: 1, ...TIMES, ...payload });
    }

    // 코드 입장 (답 없는 사건 → room_joined·room_join_failed 중 새로 받은 것)
    async function joinByCode(who, roomCode) {
        const at = mark(who);
        await send(who, 'join_room_by_code', { roomCode });
        const got = target(who).received.slice(at).find((e) => e.event === 'room_joined' || e.event === 'room_join_failed');
        return got ? { event: got.event, ...got.payload } : null;
    }

    // n명 대기방 차리기: 사람마다 접속 → 방장이 만들기 → 나머지 코드 입장 (준비는 ready: true일 때)
    async function openRoom({ prefix, n, maxPlayers = 10, accessType = 'code', ready = false, jokerCount = 1, uuids: given = null }) {
        const uuids = given ?? Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) if (!sock(uuid)?.connected) await connect(uuid);
        const [host, ...guests] = uuids;
        const created = await createRoom(host, { maxPlayers, accessType, jokerCount });
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) {
            const joined = await joinByCode(uuid, created.room.roomCode);
            assert.equal(joined?.event, 'room_joined', `${uuid} 입장 실패: ${joined?.message}`);
        }
        if (ready) {
            for (const uuid of uuids) {
                const r = await ask(uuid, 'set_ready', { roomId: created.room.roomId, isReady: true, expectedSettingsVersion: created.room.settingsVersion });
                assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
            }
        }
        return { uuids, host, guests, roomId: created.room.roomId, roomCode: created.room.roomCode, room: created.room };
    }

    // 그 사람이 앉은 방 내용 (지금 방 묻기 답), 없으면 null
    async function currentRoom(uuid) {
        const r = await ask(uuid, 'get_current_room', {});
        return r?.room ?? null;
    }

    // 방장이 설정 바꿈 (토론 시간만 바꿔 저장), 답 돌려줌
    let requestSeq = 0;
    async function changeSettings(host, dayDiscussionTime = 60) {
        const room = await currentRoom(host);
        requestSeq += 1;
        return ask(host, 'update_room_settings', {
            roomId: room.roomId, requestId: `req-${requestSeq}`, expectedSettingsVersion: room.settingsVersion,
            accessType: room.accessType, maxPlayers: room.settings.maxPlayers, jokerCount: room.settings.jokerCount,
            ...TIMES, dayDiscussionTime,
        });
    }

    // 방장이 한 사람 추방, 답 돌려줌
    async function kick(host, victim) {
        const room = await currentRoom(host);
        requestSeq += 1;
        const seat = (u) => room.players.find((p) => p.uuid === u)?.membershipId;
        return ask(host, 'kick_room_player', {
            requestId: `kick-${requestSeq}`, bootEpoch: room.bootEpoch, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
            requesterMembershipId: seat(host), targetUuid: victim, targetMembershipId: seat(victim),
        });
    }

    // 공개 방 목록 묻기 (답 함수 사건)
    const publicRooms = async (who) => (await ask(who, 'get_public_rooms', {}))?.rooms ?? null;

    // 방장 시작 (presets = { uuid: 역할 }, 그 방만 역할 미리 정하기 손잡이로)
    async function start(room, host, presets = null) {
        const saved = process.env.E2E_HOOKS;
        if (presets) {
            process.env.E2E_HOOKS = '1';
            e2eHooks.setRolePresets(presets, { roomId: room.roomId });
        }
        try {
            return await ask(host, 'start_game', mf.startPayload(room));
        } finally {
            if (saved === undefined) delete process.env.E2E_HOOKS;
            else process.env.E2E_HOOKS = saved;
        }
    }

    // 판 하나 차리기: n명 방 → 전원 준비 → 시작, 광대는 늘 맨 끝 사람 (roles로 덮어쓰기, 나머지는 Math.random 0으로 늘 같음)
    // 돌려줌: { uuids, host, gameId, roomCode, roles: uuid → 직업, joker }
    async function openGame({ prefix, n, roles = null, maxPlayers = n, accessType = 'code', jokerCount = 1, uuids = null }) {
        const room = await openRoom({ prefix, n, maxPlayers, accessType, ready: true, jokerCount, uuids });
        // 정한 사람 말고는 방 구성대로 (6명부터 자동 구성에 의사가 들어감), 받은 직업은 시작 알림으로 확인
        const presets = roles ?? { [room.uuids[n - 1]]: 'JOKER' };
        const reply = await start(room.room, room.host, presets);
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        await settle();
        const rolesSeen = new Map(room.uuids.map((uuid) => {
            const started = received(uuid, 'game_started').find((p) => p.gameId === reply.gameId);
            return [uuid, started?.state?.self?.role];
        }));
        for (const [uuid, role] of Object.entries(presets)) assert.equal(rolesSeen.get(uuid), role, `${uuid} 직업이 안 맞음`);
        return {
            ...room, gameId: reply.gameId, roles: rolesSeen,
            joker: [...rolesSeen].find(([, r]) => r === 'JOKER')[0],
            jokers: [...rolesSeen].filter(([, r]) => r === 'JOKER').map(([u]) => u),
        };
    }

    const session = (gameId) => getSessionById(gameId);
    const phaseOf = (gameId) => session(gameId)?.phase ?? null;
    const aliveOf = (gameId) => [...(session(gameId)?.players.values() ?? [])]
        .filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid);

    // 판 상태가 맞을 때까지 가짜 시계를 1초씩 넘김 (판을 몰고 갈 때만 씀, 확인은 받은 알림으로)
    async function advanceUntil(gameId, done, limitMs = 600_000) {
        for (let spent = 0; spent <= limitMs; spent += 1_000) {
            const s = session(gameId);
            if (!s || done(s)) return s;
            await tick(1_000);
        }
        throw new Error(`판이 ${limitMs}ms 안에 원하는 상태가 안 됨`);
    }

    // 역할 확인 끝 → 첫 낮
    const toDay = (g) => advanceUntil(g.gameId, (s) => s.phase === 'DAY');

    // 판 화면 스냅샷 묻기 (화면 새로고침 때 하는 것과 같음)
    const snapshot = (uuid, gameId) => ask(uuid, 'get_session_snapshot', { gameId });

    // 낮에 산 사람 전원이 한 사람을 찍어(피고는 기권) 재판까지
    async function openTribunal(g, victim) {
        const s = await advanceUntil(g.gameId, (x) => x.phase === 'DAY');
        const alive = aliveOf(g.gameId);
        for (const uuid of alive) await ask(uuid, 'ready_for_day_vote', { gameId: g.gameId });
        for (const uuid of alive) {
            const r = await ask(uuid, 'cast_day_vote', { gameId: g.gameId, targetId: uuid === victim ? null : victim });
            assert.equal(r.ok, true, `${uuid} 낮 표 거절: ${r.code}`);
        }
        const tribunal = await advanceUntil(g.gameId, (x) => x.phase !== 'DAY');
        assert.equal(tribunal.phase, 'TRIBUNAL', '재판으로 안 감');
        return { dayIndex: s.dayIndex, alive };
    }

    // 낮에 한 사람을 표로 재판에 세우고 전원 유죄로 처형 (피고는 기권), 끝나면 다음 단계(밤·판 끝)
    async function voteOut(g, victim) {
        const { dayIndex, alive } = await openTribunal(g, victim);
        const s = { dayIndex };
        for (const uuid of alive.filter((u) => u !== victim)) {
            await ask(uuid, 'cast_tribunal_vote', { gameId: g.gameId, dayIndex: s.dayIndex, vote: 'GUILTY' });
        }
        await advanceUntil(g.gameId, (x) => x.phase !== 'TRIBUNAL');
        assert.equal(session(g.gameId)?.players.get(victim)?.alive ?? false, false, `${victim} 처형 안 됨`);
    }

    // 낮을 아무도 안 내고 마감까지 넘겨 밤으로 (모두 기권 → 재판 없음)
    async function skipDay(g) {
        await advanceUntil(g.gameId, (x) => x.phase === 'DAY');
        await advanceUntil(g.gameId, (x) => x.phase !== 'DAY');
        assert.equal(phaseOf(g.gameId), 'NIGHT', '낮 뒤 밤이 아님');
    }

    // 밤에 광대가 한 사람 죽임: 광대 차례가 열릴 때까지 1초씩 넘기며 보냄 → 밤 끝까지
    async function nightKill(g, victim, joker = g.joker) {
        await advanceUntil(g.gameId, (x) => x.phase === 'NIGHT');
        let sent = false;
        for (let i = 0; i < 120 && !sent; i += 1) {
            const r = await ask(joker, 'submit_night_action', { gameId: g.gameId, targetId: victim });
            if (r.ok) sent = true;
            else await tick(1_000);
        }
        assert.equal(sent, true, '광대 차례가 안 열림');
        await advanceUntil(g.gameId, (x) => x.phase !== 'NIGHT');
    }

    // 첫 낮 기권 → 1일 밤 광대가 victim 죽임 → 2일 낮
    async function killFirstNight(g, victim) {
        await skipDay(g);
        await nightKill(g, victim);
        assert.equal(session(g.gameId)?.players.get(victim)?.alive ?? false, false, `${victim} 안 죽음`);
    }

    // 시민 승으로 판 끝: 첫 낮에 광대 처형
    async function playToCitizenWin(g) {
        await voteOut(g, g.joker);
        assert.equal(phaseOf(g.gameId), 'ENDED', '판이 안 끝남');
    }

    // 결과 화면 "대기방으로"
    const returnToRoom = (uuid, gameId) => ask(uuid, 'return_to_room', { gameId });

    return {
        t, io, registry, sessionStates, userGates, decisionGates, inviteService,
        connect, closeSocket, settle, sock, ask, send, lobby, received, count, mark, since, tick, tickBy,
        createRoom, joinByCode, openRoom, currentRoom, changeSettings, kick, publicRooms, start, openGame, session, phaseOf, aliveOf,
        advanceUntil, toDay, snapshot, openTribunal, voteOut, skipDay, nightKill, killFirstNight, playToCitizenWin, returnToRoom,
    };
}

// 정리할 것 없음 답 (모두 false)
const NOTHING = Object.freeze({ liveGame: false, endedGame: false, pending: false, room: false });

module.exports = { gf, mf, matchmaking, gs, G, coreSession, maintenance, makeWorld, NOTHING, TIMES, START_MS };

'use strict';

// A09 끊김·60초 기다림 흐름 시험(backend/tests/flow/a09-grace-*·defendant·connection-notice·reconnect-snapshot·replace-device)만 쓰는 판 차리기
// 공용 도우미는 못 고쳐서 여기 둠 (공용으로 올릴 것 후보), 시험 파일이 아니라 node --test 묶음에 안 잡힘

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const assert = require('node:assert/strict');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');

const T = gs.__testables;
const MM = matchmaking.__testables;
const core = gf.core;

// 가짜 시계 시작 시각 (2026-11-16 12:00 한국 시간, 고정값이라 돌릴 때마다 같음)
const START_MS = Date.UTC(2026, 10, 16, 3, 0, 0);

// 진짜 시계 함수 (시험 끝에 되돌림)
const REAL = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };

// 전역 시계를 가짜로: 역할 확인·낮·재판·밤·끊김 60초·대기방 15초 타이머가 다 같은 시계로 감
// node:test mock.timers는 한 번 넘긴 끝 시각으로 타이머를 불러 59.999초·60초 경계를 못 봄 → gameFixtures 시계 씀
function installClock() {
    restoreClock();
    const clock = gf.fakeClock(START_MS);
    globalThis.setTimeout = (fn, ms, ...args) => {
        const id = clock.setTimeoutFn(() => fn(...args), Number(ms) || 0);
        return { id, unref() { return this; }, ref() { return this; } };
    };
    globalThis.clearTimeout = (handle) => clock.clearTimeoutFn(handle?.id ?? handle);
    Date.now = clock.nowFn;
    return clock;
}

function restoreClock() {
    globalThis.setTimeout = REAL.setTimeout;
    globalThis.clearTimeout = REAL.clearTimeout;
    Date.now = REAL.now;
}

// 판·대기방·타이머·탈주 기록 전부 비움 (시험끼리 안 섞이게)
function hardReset() {
    gs.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gf.resetCore();
    desertion.__resetForTests();
}

// DB에 쓰는 곳은 아무것도 안 하는 가짜로 (메모리 시험), 탈주 저장소는 시험이 바꿔 끼울 수 있게 받음
function installFakeStores(repo) {
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => ({ ok: true }));
    desertion.__setRepositoryForTests(repo ?? {
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
        findDesertionsForWarmup: async () => [],
    });
    mf.installFakeMatchmakingDeps(matchmaking);
}

function restoreFakeStores() {
    T.__setRecordVoteParticipationForTests(null);
    T.__setEvaluateAchievementsForTests(null);
    T.__setGameResultPersistForTests(null);
    desertion.__setRepositoryForTests(null);
}

// 방 설정 시간 기본값: 토론·투표·재판·밤 30초 (방 설정 최소값), 케이스가 바꿈
const BASE_SETTINGS = { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 30, nightActionTime: 30 };

// 판 하나 차리기: n명·직업 고정(randomFn 0, 무작위 빈 차례 길이도 0)·역할 확인 단계 + 가짜 소켓 + 가짜 시계 + 역할 확인 10초 타이머
// 판 시작 때 서버가 하는 것처럼 역할 확인 마감을 걸어 둠 → 10초 뒤 첫 낮, 그 뒤 단계 타이머는 서버가 알아서 이어 걺
function setup(t, { id, n, roleCounts = { JOKER: 1 }, settings = {}, hostUuid = null, repo = null } = {}) {
    hardReset();
    const clock = installClock();
    t.mock.method(Math, 'random', () => 0);
    installFakeStores(repo);
    const session = gf.startGame({
        id,
        n,
        roleCounts,
        settings: { ...BASE_SETTINGS, ...settings },
        extra: hostUuid ? { hostUuid } : {},
    });
    const world = makeWorld(session);
    T.ensureRoleRevealTimer(world.io, session);
    t.after(() => {
        hardReset();
        restoreFakeStores();
        restoreClock();
    });
    return makeTable(session, world, clock);
}

// 판 참가자마다 소켓 하나 (판 채널 안), 접속 목록 하나를 판·대기방이 같이 봄
function makeWorld(session) {
    const sockets = new Map();
    const history = new Map();
    for (const uuid of session.players.keys()) {
        const socket = withDisconnect(gf.createFakeSocket(uuid));
        socket.rooms.add(session.channelId);
        socket.data.activeGameId = session.id;
        sockets.set(uuid, socket);
        history.set(uuid, [socket]);
    }
    const io = gf.createFakeIo([...sockets.values()]);
    const registry = new Map([...sockets].map(([uuid, s]) => [uuid, s.id]));
    gs.setOnlineUsersRegistry(registry);
    matchmaking.setOnlineUsersRegistry(registry);
    return { io, sockets, history, registry };
}

// 가짜 소켓에 끊기 손잡이 붙임 (서버가 옛 소켓을 끊을 때 부름)
function withDisconnect(socket) {
    socket.disconnect = () => { socket.connected = false; };
    return socket;
}

// 판 한 개를 다루는 손잡이 묶음 (사람이 화면에서 하는 일 + 받은 알림 보기 + 시간 넘기기)
function makeTable(session, world, clock) {
    const gameId = session.id;
    const { io } = world;
    const sock = (uuid) => world.sockets.get(uuid);
    let socketSeq = 0;

    const w = {
        session,
        world,
        io,
        clock,
        gameId,
        ids: [...session.players.keys()],
        sock,
        now: () => clock.now(),
        advance: (ms) => clock.advance(ms),
        // 그 시각까지 넘김 (이미 지났으면 그대로)
        advanceTo: (at) => clock.advance(Math.max(0, at - clock.now())),
        byRole: (role) => gf.byRole(session, role),
        firstOf: (role) => gf.firstOf(session, role),
        nonJokers: () => gf.nonJokers(session),
        roleOf: (uuid) => session.players.get(uuid).role,
        isAlive: (uuid) => session.players.get(uuid).alive === true,
        alive: () => [...session.players.values()].filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid),
        aliveOf: (role) => gf.byRole(session, role).filter((u) => session.players.get(u).alive),
        connected: (uuid) => sock(uuid)?.connected === true,
        // 지금 단계 이름 (낮이면 토론·투표까지)
        phase: () => (session.phase === 'DAY' ? core.getDayPhase(session) : session.phase),

        // 화면이 보내는 것들 (답을 그대로 돌려줌)
        vote: (uuid, targetId) => gf.call(T.handleSubmitDayVote, io, sock(uuid), uuid, { gameId, targetId }),
        ready: (uuid) => gf.call(T.handleAcknowledgeDayVoteReady, io, sock(uuid), uuid, { gameId }),
        cast: (uuid, vote) => gf.call(T.handleCastTribunalVote, io, sock(uuid), uuid, { gameId, dayIndex: session.dayIndex, vote }),
        night: (uuid, targetId) => gf.call(T.handleSubmitNightAction, sock(uuid), uuid, { gameId, targetId }),
        leave: (uuid) => gf.call(T.handleLeaveGameSession, io, sock(uuid), uuid, { gameId }),
        snapshot: (uuid, payload = { gameId }) => gf.call(T.handleGetSessionSnapshot, io, sock(uuid), uuid, payload),
        chat: (uuid, text) => gf.call(T.handleSubmitGameChatMessage, io, sock(uuid), uuid, { gameId, text }),
        // 방 만들기 (탈주 막힘을 볼 때), 답 그대로
        createRoom: (uuid) => mf.callAsPromise(MM.handleCreateRoom, io, sock(uuid), uuid, mf.validSettingsPayload({ maxPlayers: 5, jokerCount: 1 })),

        // 소켓 끊김 (서버가 알아챔 → 산 사람이면 60초 기다림 시작)
        async disconnect(uuid) {
            const s = sock(uuid);
            s.connected = false;
            await gs.onDisconnect(io, s, uuid);
        },

        // 새 소켓만 만들어 접속 목록에 넣음 (아직 판 채널 다시 넣기·스냅샷 안 함)
        attachSocket(uuid, { id } = {}) {
            socketSeq += 1;
            const s = withDisconnect(gf.createFakeSocket(uuid, { id: id ?? `sock-${uuid}-re${socketSeq}` }));
            io.sockets.sockets.set(s.id, s);
            world.registry.set(uuid, s.id);
            world.sockets.set(uuid, s);
            world.history.get(uuid)?.push(s);
            return s;
        },

        // 다시 붙음: 새 소켓 → 판 채널 다시 넣기(접속 때 서버가 하는 일) → 스냅샷 요청(화면이 하는 일), 스냅샷 답 돌려줌
        async reconnect(uuid) {
            const s = w.attachSocket(uuid);
            await gs.resyncSessionRouting(s, uuid, io);
            return w.snapshot(uuid);
        },

        // 받은 알림 내용 목록 (옛 소켓까지 다 합침)
        got(uuid, event) {
            return (world.history.get(uuid) ?? []).flatMap((s) => s.received)
                .filter((e) => e.event === event).map((e) => e.payload);
        },
        // 그 사람이 받은 알림 이름 차례 (옛 소켓까지)
        names(uuid) {
            return (world.history.get(uuid) ?? []).flatMap((s) => s.received).map((e) => e.event);
        },
        // 그 사람들(기본: 나 빼고 전원) 중 그 알림을 count번 못 받은 사람 목록
        missing(event, count, uuids) {
            return uuids.filter((u) => w.got(u, event).length !== count);
        },
        others: (uuid) => w.ids.filter((u) => u !== uuid),

        // 역할 확인 10초 마감 → 첫 낮 토론
        toDay() {
            assert.equal(session.phase, 'ROLE_REVEAL');
            clock.advance(10_000);
            assert.equal(w.phase(), 'DAY_DISCUSSION', '첫 낮이 안 옴');
        },
        // 토론 마감까지 시간 넘김 → 투표
        toVote() {
            if (session.phase === 'ROLE_REVEAL') w.toDay();
            assert.equal(w.phase(), 'DAY_DISCUSSION');
            w.advanceTo(session.dayPhaseDeadline);
            assert.equal(w.phase(), 'DAY_VOTE', '투표 단계가 안 옴');
        },
        // 조건이 될 때까지 step씩 시간 넘김 (넘긴 ms 돌려줌), 못 되면 멈춤
        advanceUntil(pred, { step = 1000, max = 600_000, label = '기다린 일' } = {}) {
            let spent = 0;
            while (!pred()) {
                if (spent >= max) throw new Error(`시간을 넘겨도 ${label}이 안 생김`);
                clock.advance(step);
                spent += step;
            }
            return spent;
        },

        // 붙어 있는 산 사람 전원 낮 표 (pick(uuid) → 대상 | null), 답 확인
        async voteAll(pick, { skip = [] } = {}) {
            for (const uuid of w.alive()) {
                if (!w.connected(uuid) || skip.includes(uuid)) continue;
                const reply = await w.vote(uuid, pick(uuid));
                assert.equal(reply.ok, true, `낮 표 실패(${uuid}): ${reply.code}`);
            }
        },
        // 붙어 있는 산 사람이 그 사람을 찍음(그 사람은 기권) → 재판 (다 냈으면 5초 뒤, 아니면 투표 마감)
        async toTribunal(defendant, { skip = [] } = {}) {
            if (w.phase() !== 'DAY_VOTE') w.toVote();
            await w.voteAll((u) => (u === defendant ? null : defendant), { skip });
            w.advanceUntil(() => session.phase === 'TRIBUNAL', { label: '재판' });
        },
        // 붙어 있는 산 사람 전원 기권 → 밤
        async toNight({ skip = [] } = {}) {
            if (w.phase() !== 'DAY_VOTE') w.toVote();
            await w.voteAll(() => null, { skip });
            w.advanceUntil(() => session.phase === 'NIGHT', { label: '밤' });
        },
        // 재판 표 전원 같은 것 (붙어 있는 투표할 사람만), 판정까지 기다리지 않음
        async castAll(vote, { skip = [] } = {}) {
            for (const uuid of core.getTribunalVoterUuids(session, session.tribunal.defendantUuid)) {
                if (!w.connected(uuid) || skip.includes(uuid)) continue;
                const reply = await w.cast(uuid, vote);
                assert.equal(reply.ok, true, `재판 표 실패(${uuid}): ${reply.code}`);
            }
        },
        // 밤 빨리 넘기기: 차례마다 붙어 있는 산 행동자가 picks대로(없으면 건너뛰기) 고름 → 다음 낮(또는 판 끝)까지
        async quickNight(picks = {}) {
            assert.equal(session.phase, 'NIGHT');
            for (let i = 0; i < 2000 && session.phase === 'NIGHT'; i += 1) {
                const role = core.getCurrentNightTurnRole(session);
                if (role) {
                    for (const actor of core.getAliveActorUuidsForRole(session, role)) {
                        if (!w.connected(actor) || session.nightActions.has(actor)) continue;
                        const reply = await w.night(actor, picks[actor] ?? null);
                        assert.equal(reply.ok, true, `밤 고르기 실패(${actor}): ${reply.code}`);
                    }
                }
                clock.advance(500);
            }
            assert.notEqual(session.phase, 'NIGHT', '밤이 안 끝남');
        },
        // 지금 밤 차례가 그 직업이 될 때까지 (앞 차례 사람은 건너뛰기)
        async untilTurn(targetRole) {
            for (let i = 0; i < 2000; i += 1) {
                const role = core.getCurrentNightTurnRole(session);
                if (role === targetRole) return;
                assert.equal(session.phase, 'NIGHT', `${targetRole} 차례 전에 밤이 끝남`);
                if (role) {
                    for (const actor of core.getAliveActorUuidsForRole(session, role)) {
                        if (!w.connected(actor) || session.nightActions.has(actor)) continue;
                        await w.night(actor, null);
                    }
                }
                clock.advance(500);
            }
            throw new Error(`${targetRole} 차례가 안 옴`);
        },
        // 하루 빨리 넘기기: 낮 기권 → 밤 (picks대로) → 다음 낮
        async quickDay(picks = {}) {
            await w.toNight();
            await w.quickNight(picks);
        },
    };
    return w;
}

module.exports = {
    gf,
    gs,
    T,
    MM,
    core,
    matchmaking,
    mf,
    desertion,
    START_MS,
    setup,
    installClock,
    restoreClock,
    hardReset,
    installFakeStores,
    restoreFakeStores,
};

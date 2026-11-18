'use strict';

// A03 낮 투표 흐름 시험(backend/tests/flow/a03-day-*.test.js)만 쓰는 작은 도우미 — 판 차리기·가짜 시계·사람 손 흉내
// 공용 도우미는 못 고쳐서 여기 둠 (공용으로 올릴 것 후보), 시험 파일이 아니라 node --test 묶음에 안 잡힘

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');

const T = gs.__testables;
const core = gf.core;

// 가짜 시계 시작 시각 (2026-11-16 12:00 한국 시간, 고정값이라 돌릴 때마다 같음)
const START_MS = Date.UTC(2026, 10, 16, 3, 0, 0);

// 지금 시험이 쓰는 가짜 시계 (다음 판 열기가 같은 시계를 씀)
let currentClock = null;

// 진짜 시계 함수 (시험 끝에 되돌림)
const REAL = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };

// 전역 시계를 가짜로 바꿈: 낮·재판·밤·끊김 60초 타이머가 다 같은 가짜 시계로 감 (따로 넣는 길이 없는 재판·밤 타이머 때문)
// node:test mock.timers는 tick 안에서 Date.now가 끝 시각으로 보여 마감 시각 경계를 못 봄 → gameFixtures 시계 씀
function installClock() {
    restoreClock();
    const clock = gf.fakeClock(START_MS);
    globalThis.setTimeout = (fn, ms, ...args) => clock.setTimeoutFn(() => fn(...args), Number(ms) || 0);
    globalThis.clearTimeout = (id) => clock.clearTimeoutFn(id);
    Date.now = clock.nowFn;
    return clock;
}

function restoreClock() {
    globalThis.setTimeout = REAL.setTimeout;
    globalThis.clearTimeout = REAL.clearTimeout;
    Date.now = REAL.now;
}

// 판·소켓·타이머·탈주 기록 전부 비움 (시험끼리 안 섞이게)
function hardReset() {
    gs.__resetStateForTests();
    gf.resetCore();
    desertion.__resetForTests();
}

// DB에 쓰는 것들을 아무것도 안 하는 가짜로 (메모리 시험), persist는 참여 기록 저장 가짜를 바꿀 때만
function installFakeStores(persist) {
    T.__setRecordVoteParticipationForTests(persist ?? (async () => {}));
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => {});
    desertion.__setRepositoryForTests({
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
    });
}

function restoreFakeStores() {
    T.__setRecordVoteParticipationForTests(null);
    T.__setEvaluateAchievementsForTests(null);
    T.__setGameResultPersistForTests(null);
    desertion.__setRepositoryForTests(null);
}

// 판 앞부분을 game-core 길로 진짜처럼 돌림 (죽은 사람 만들기용, 소켓·타이머 붙기 전)
// steps 예: [{ execute: 'g-3' }, { kill: 'g-5' }] → 1일 재판 처형 + 1일 밤 암살, 칸 하나 = 낮 하나 + 밤 하나
function runPrelude(session, steps) {
    for (const step of steps) {
        gf.toVote(session);
        if (step.execute) {
            // 모두 그 사람 찍어 재판 → 산 사람 전원 유죄
            gf.toTribunal(session, step.execute);
            for (const p of session.players.values()) {
                if (!p.alive || p.uuid === step.execute) continue;
                const r = core.submitTribunalVote(p.uuid, session.id, session.dayIndex, 'GUILTY');
                if (!r.ok) throw new Error(`재판 표 실패: ${r.code}`);
            }
            const anyone = [...session.players.values()].find((p) => p.alive).uuid;
            const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
            if (!prepared.ok) throw new Error(`재판 판정 준비 실패: ${prepared.code}`);
            const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
            if (!committed.ok || committed.terminal) throw new Error('재판 판정 실패 또는 판 끝');
        } else {
            // 전원 기권 → 밤
            for (const p of session.players.values()) {
                if (p.alive) core.submitDayVote(p.uuid, session.id, null);
            }
            const anyone = [...session.players.values()].find((p) => p.alive).uuid;
            const prepared = core.prepareDayVoteResolution(anyone, session.id, session.dayIndex);
            if (!prepared.ok) throw new Error(`낮 판정 준비 실패: ${prepared.code}`);
            const committed = core.commitDayVoteResolution(prepared.session, prepared.resolution);
            if (!committed.ok) throw new Error(`낮 판정 실패: ${committed.code}`);
        }
        // 밤: 광대 전원이 같은 사람 고르고 나머지는 건너뜀
        if (step.kill) {
            for (const joker of gf.byRole(session, 'JOKER')) {
                if (!session.players.get(joker).alive) continue;
                const r = core.submitNightAction(joker, session.id, step.kill);
                if (!r.ok) throw new Error(`밤 암살 실패: ${r.code}`);
            }
        }
        gf.skipAllNight(session);
        const anyone = [...session.players.values()].find((p) => p.alive).uuid;
        const prepared = core.prepareNightResolution(anyone, session.id);
        if (!prepared.ok) throw new Error(`밤 판정 준비 실패: ${prepared.code}`);
        const committed = core.commitNightResolution(prepared.session, prepared.resolution);
        if (!committed.ok || committed.terminal) throw new Error('밤 판정 실패 또는 판 끝');
    }
}

// 죽일 사람 고르기: 광대 아닌 사람을 뒤에서부터 (앞쪽 사람은 시험이 X·Y로 씀)
function pickVictims(session, count) {
    const pool = gf.nonJokers(session);
    return pool.slice(pool.length - count).reverse();
}

// 판 하나 차리기: 사람 n명·직업 고정(randomFn 0)·첫 낮 토론 + 가짜 소켓 + 가짜 시계 + 낮 타이머
// deaths: 첫 낮 전에 밤마다 한 명씩 죽일 수(광대 아닌 뒤쪽 사람), steps: 직접 정한 앞부분(판을 받는 함수도 됨)
function setup(t, {
    id, n, roleCounts = null, settings = {}, deaths = 0, steps = null, timer = true, persist = null,
} = {}) {
    hardReset();
    const clock = installClock();
    currentClock = clock;
    installFakeStores(persist);
    // 방 설정 시간: 토론·투표·재판·밤 30초가 기본 (방 설정 최소값), 케이스가 바꿈
    const session = gf.startGame({
        id,
        n,
        ...(roleCounts ? { roleCounts } : {}),
        settings: { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 30, nightActionTime: 30, ...settings },
    });
    gf.toDay(session);
    const prelude = typeof steps === 'function'
        ? steps(session)
        : steps ?? pickVictims(session, deaths).map((victim) => ({ kill: victim }));
    runPrelude(session, prelude);
    const world = gf.socketWorld(gs, session);
    if (timer) T.startDayPhaseTimer(world.io, session);
    t.after(() => {
        hardReset();
        restoreFakeStores();
        restoreClock();
    });
    return makeTable(session, world, clock);
}

// 같은 방(같은 id·같은 사람)에서 다음 판 열기: 앞 판은 끝나고 다 나간 뒤, 장부·시계는 그대로 둠 (앞 판 흔적이 새는지 보려고)
function openNextGame({ id, n, settings = {} }) {
    const session = gf.startGame({
        id,
        n,
        settings: { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 30, nightActionTime: 30, ...settings },
    });
    gf.toDay(session);
    const world = gf.socketWorld(gs, session);
    T.startDayPhaseTimer(world.io, session);
    return makeTable(session, world, currentClock);
}

// 판 한 개를 다루는 손잡이 묶음 (사람이 화면에서 하는 일 + 받은 알림 보기 + 시간 넘기기)
function makeTable(session, world, clock) {
    const gameId = session.id;
    const sock = (uuid) => world.sockets.get(uuid);
    let reconnectSeq = 0;

    const table = {
        session,
        world,
        clock,
        gameId,
        io: world.io,
        ids: [...session.players.keys()],
        get joker() { return gf.firstOf(session, 'JOKER'); },
        jokers: () => gf.byRole(session, 'JOKER'),
        byRole: (role) => gf.byRole(session, role),
        // 산 사람 (판 시작 직후 목록 순서 그대로)
        alive: () => [...session.players.values()].filter((p) => p.alive).map((p) => p.uuid),
        dead: () => [...session.players.values()].filter((p) => !p.alive).map((p) => p.uuid),
        aliveNonJokers: () => [...session.players.values()]
            .filter((p) => p.alive && p.role !== 'JOKER').map((p) => p.uuid),
        now: () => clock.now(),
        advance: (ms) => clock.advance(ms),

        // 화면이 보내는 것들 (답을 그대로 돌려줌)
        vote: (uuid, targetId) => gf.call(T.handleSubmitDayVote, world.io, sock(uuid), uuid, { gameId, targetId }),
        // 낸 표 거두기 ("투표취소")
        withdraw: (uuid) => gf.call(T.handleWithdrawDayVote, world.io, sock(uuid), uuid, { gameId }),
        ready: (uuid) => gf.call(T.handleAcknowledgeDayVoteReady, world.io, sock(uuid), uuid, { gameId }),
        leave: (uuid) => gf.call(T.handleLeaveGameSession, world.io, sock(uuid), uuid, { gameId }),
        snapshot: (uuid) => gf.call(T.handleGetSessionSnapshot, world.io, sock(uuid), uuid, { gameId }),
        chat: (uuid, text) => gf.call(T.handleSubmitGameChatMessage, world.io, sock(uuid), uuid, { gameId, text }),
        night: (uuid, targetId) => gf.call(T.handleSubmitNightAction, sock(uuid), uuid, { gameId, targetId }),

        // 표 여러 개를 차례대로 냄, 답 목록 돌려줌 (votes: [[찍는 사람, 대상|null], …])
        async voteAll(votes) {
            const acks = [];
            for (const [voter, target] of votes) acks.push(await table.vote(voter, target));
            return acks;
        },

        // 소켓 끊김 (서버가 알아챔 → 산 사람이면 60초 기다림 시작)
        async disconnect(uuid) {
            const s = sock(uuid);
            s.connected = false;
            await gs.onDisconnect(world.io, s, uuid);
        },

        // 새 소켓으로 다시 붙음 (새로고침·재접속처럼 접속 목록이 새 소켓을 가리킴 → 판 채널 다시 넣기)
        async reconnect(uuid) {
            reconnectSeq += 1;
            const s = gf.createFakeSocket(uuid, { id: `sock-${uuid}-again-${reconnectSeq}` });
            world.io.sockets.sockets.set(s.id, s);
            world.registry.set(uuid, s.id);
            world.sockets.set(uuid, s);
            await gs.resyncSessionRouting(s, uuid, world.io);
            return s;
        },

        // 받은 알림 (payload 목록), dayIndex 주면 그날 것만
        got(uuid, event, dayIndex = undefined) {
            return world.received(uuid, event)
                .map((e) => e.payload)
                .filter((p) => dayIndex === undefined || p?.dayIndex === dayIndex);
        },
        // 판 전원(지금 소켓 기준) 중 그 알림을 count번 받았는지 못 받은 사람 목록
        missing(event, count, uuids = table.ids, dayIndex = undefined) {
            return uuids.filter((u) => table.got(u, event, dayIndex).length !== count);
        },

        // 조건이 될 때까지 step씩 시간 넘김 (넘긴 ms 돌려줌), 못 되면 멈춤
        advanceUntil(pred, { step = 1000, max = 600_000 } = {}) {
            let spent = 0;
            while (!pred()) {
                if (spent >= max) throw new Error('시간을 넘겨도 기다린 일이 안 생김');
                clock.advance(step);
                spent += step;
            }
            return spent;
        },

        // 토론 마감까지 시간 넘김 → 투표 단계 알림의 투표 마감 시각 돌려줌 (마감 시각은 시간 넘기기용으로만 읽음)
        toVote() {
            const day = session.dayIndex;
            const ref = table.alive()[0];
            const before = table.got(ref, 'day_phase_changed', day).length;
            clock.advance(session.dayPhaseDeadline - clock.now());
            const changed = table.got(ref, 'day_phase_changed', day);
            if (changed.length !== before + 1 || changed.at(-1).dayPhase !== 'DAY_VOTE') {
                throw new Error('토론 마감 뒤 투표 단계 알림이 안 옴');
            }
            return changed.at(-1).dayPhaseDeadline;
        },

        // 밤을 아무도 안 고른 채 다 지나 다음 낮 시작 알림까지 (밤 공개 결과 알림 돌려줌, 다음 낮 마감 시각 실림)
        passNight(ref = table.alive()[0]) {
            const before = table.got(ref, 'night_result_applied').length;
            table.advanceUntil(() => table.got(ref, 'night_result_applied').length > before);
            return table.got(ref, 'night_result_applied').at(-1);
        },
    };
    return table;
}

// 표 모양 → 누가 누굴 찍나 (자기 자신은 못 찍게 나눔)
// spec 예: { targets: [[X, 3], [Y, 1]], abstain: 2, skip: 1 } → { votes: [[voter, target|null], …], skipped: [uuid] }
// 대상인 사람 표를 먼저 정함 (고를 칸이 적어서), 못 나누면 멈춤
function allocate(voters, { targets = [], abstain = 0, skip = 0 }) {
    const SKIP = Symbol('skip');
    const buckets = [
        ...targets.map(([target, left]) => ({ target, left })),
        { target: null, left: abstain },
        { target: SKIP, left: skip },
    ];
    const total = buckets.reduce((sum, b) => sum + b.left, 0);
    if (total !== voters.length) throw new Error(`표 수 ${total} ≠ 투표할 사람 ${voters.length}`);
    const targetSet = new Set(targets.map(([u]) => u));
    const ordered = [...voters].sort((a, b) => Number(targetSet.has(b)) - Number(targetSet.has(a)));
    const chosen = new Map();
    for (const voter of ordered) {
        const bucket = buckets.find((b) => b.left > 0 && b.target !== voter);
        if (!bucket) throw new Error(`${voter} 표를 나눌 칸이 없음`);
        bucket.left -= 1;
        chosen.set(voter, bucket.target);
    }
    // 낸 차례는 받은 voters 순서 그대로
    const votes = voters.filter((v) => chosen.get(v) !== SKIP).map((v) => [v, chosen.get(v)]);
    const skipped = voters.filter((v) => chosen.get(v) === SKIP);
    return { votes, skipped };
}

// 값 안에 그 글자(uuid)가 어디 있는지 경로 목록 (새는지 볼 때)
function pathsOf(value, needle, path = '') {
    if (value === needle) return [path || '(값)'];
    if (value === null || typeof value !== 'object') return [];
    const found = [];
    for (const [key, child] of Object.entries(value)) {
        found.push(...pathsOf(child, needle, path ? `${path}.${key}` : key));
    }
    return found;
}

module.exports = {
    gf,
    gs,
    T,
    core,
    START_MS,
    setup,
    openNextGame,
    allocate,
    pathsOf,
};

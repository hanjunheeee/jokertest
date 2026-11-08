'use strict';

// 게임 진행·소켓 시험 공용 도우미 (2차 묶음)
// 판 만들기·단계 옮기기·역할 찾기 + 가짜 소켓 세상, 진짜 DB는 절대 안 붙음
// DB 주소는 닿지 않는 곳으로 막음 (모델 require 때 주소만 읽고 연결은 안 함)
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';

const core = require('../../game-core/gameSession');
const { createFakeSocket, createFakeIo } = require('../helpers/matchmakingFixtures');

const T = core.__testables;

// 사람 목록 만들기 (uuid = 접두어-번호)
const makePlayers = (n, prefix) => Array.from({ length: n }, (_, i) => ({
    uuid: `${prefix}-${i}`,
    nickname: `닉${prefix}${i}`,
    isReady: true,
}));

// 방 만들기: 자동 구성(광대 수) 또는 직접 구성(roleCounts)
const makeRoom = ({ id, n = 5, prefix = id, jokerCount = 1, roleCounts = null, settings = {}, extra = {} }) => {
    const players = makePlayers(n, prefix);
    const base = roleCounts
        ? {
            maxPlayers: 10,
            jokerCount: roleCounts.JOKER,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts },
        }
        : { jokerCount };
    return {
        id,
        players: new Map(players.map((p) => [p.uuid, p])),
        settings: { ...base, ...settings },
        ...extra,
    };
};

// 판 열기 (장부에 넣음), 판 객체 돌려줌
let gameSeq = 0;
const startGame = (opts) => {
    const room = makeRoom(opts);
    gameSeq += 1;
    const gameId = opts.gameId ?? `g-${opts.id}-${gameSeq}`;
    const candidate = T.buildSessionCandidate(room, { randomFn: opts.randomFn ?? (() => 0), gameIdFn: () => gameId });
    if (!candidate.ok) throw new Error(`판 후보 실패: ${candidate.reason}`);
    core.commitGameSession(candidate.session);
    return candidate.session;
};

// 역할별 uuid 목록
const byRole = (session, role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid);
const firstOf = (session, role) => byRole(session, role)[0];
const nonJokers = (session) => [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid);

// 역할 공개 → 첫 낮 (마감 길로 넘김, 확인 버튼 규칙과 상관없게)
const toDay = (session) => {
    const r = core.forceCompleteRoleReveal(session);
    if (!r.ok || !r.transitioned) throw new Error(`첫 낮 실패: ${r.code}`);
    return session;
};

// 낮 토론 → 투표 (상태 함수로 바로)
const toVote = (session) => {
    T.enterDayVotePhase(session);
    return session;
};

// 지금 날짜 그대로 밤으로 (판정 길 안 거치고 상태만)
const toNight = (session, dayIndex = session.dayIndex) => {
    session.phase = 'NIGHT';
    session.dayIndex = dayIndex;
    session.nightActions = new Map();
    session.nightResolution = null;
    session.nightProgress = null;
    session.dayVotes = new Map();
    session.dayVoteResolution = null;
    session.tribunal = null;
    return session;
};

// 낮 투표에서 한 사람을 재판에 세움 (모두가 그 사람 찍고, 그 사람은 기권)
const toTribunal = (session, defendantUuid) => {
    if (session.phase === 'ROLE_REVEAL') toDay(session);
    if (T.getDayPhase(session) !== 'DAY_VOTE') toVote(session);
    for (const p of session.players.values()) {
        if (!p.alive) continue;
        core.submitDayVote(p.uuid, session.id, p.uuid === defendantUuid ? null : defendantUuid);
    }
    const anyone = [...session.players.values()].find((p) => p.alive).uuid;
    const prepared = core.prepareDayVoteResolution(anyone, session.id, session.dayIndex);
    if (!prepared.ok) throw new Error(`재판 준비 실패: ${prepared.code}`);
    const committed = core.commitDayVoteResolution(prepared.session, prepared.resolution);
    if (!committed.ok) throw new Error(`재판 확정 실패: ${committed.code}`);
    return session;
};

// 밤을 한 번에 판정하고 확정
const resolveNightDirect = (session, actions = {}) => {
    for (const [actor, target] of Object.entries(actions)) {
        const r = core.submitNightAction(actor, session.id, target);
        if (!r.ok) throw new Error(`밤 제출 실패(${actor}): ${r.code}`);
    }
    const anyone = [...session.players.keys()][0];
    const prepared = core.prepareNightResolution(anyone, session.id);
    if (!prepared.ok) return { prepared };
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    return { prepared, committed };
};

// 산 행동자 전원 기권 제출 (null)
const skipAllNight = (session) => {
    for (const uuid of T.getEligibleNightActorUuids(session)) {
        if (!session.nightActions.has(uuid)) core.submitNightAction(uuid, session.id, null);
    }
};

// 시험마다 초기화 묶음 (core만)
const resetCore = () => core.__resetStateForTests();

// 가짜 소켓 세상: 판 참가자마다 소켓 하나, 채널 안, 접속 목록 등록
const socketWorld = (gs, session, { uuids = [...session.players.keys()] } = {}) => {
    const sockets = new Map();
    for (const uuid of uuids) {
        const s = createFakeSocket(uuid);
        s.rooms.add(session.channelId);
        s.data.activeGameId = session.id;
        sockets.set(uuid, s);
    }
    const io = createFakeIo([...sockets.values()]);
    const registry = new Map([...sockets].map(([uuid, s]) => [uuid, s.id]));
    gs.setOnlineUsersRegistry(registry);
    const received = (uuid, event) => sockets.get(uuid).received.filter((e) => e.event === event);
    return { io, sockets, registry, sock: (uuid) => sockets.get(uuid), received };
};

// callback 받는 핸들러를 Promise로 (callback 안 부르면 안 끝나니 짧은 대기 붙임)
const call = (handler, ...args) => new Promise((resolve) => {
    handler(...args, resolve);
});

// 비동기 꼬리 흘려보내기
const flush = () => new Promise((resolve) => setImmediate(resolve));

// 가짜 시계 + 가짜 타이머 (직접 시간을 넘겨 걸린 함수 부름)
const fakeClock = (start = 1_000_000) => {
    let now = start;
    let seq = 0;
    const timers = new Map();
    const setTimeoutFn = (fn, ms) => {
        seq += 1;
        timers.set(seq, { fn, at: now + ms });
        return seq;
    };
    const clearTimeoutFn = (id) => { timers.delete(id); };
    const advance = (ms) => {
        const target = now + ms;
        for (;;) {
            const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            timers.delete(due[0]);
            now = due[1].at;
            due[1].fn();
        }
        now = target;
    };
    return { nowFn: () => now, setTimeoutFn, clearTimeoutFn, advance, pending: () => timers.size, now: () => now };
};

module.exports = {
    core,
    T,
    makePlayers,
    makeRoom,
    startGame,
    byRole,
    firstOf,
    nonJokers,
    toDay,
    toVote,
    toNight,
    toTribunal,
    resolveNightDirect,
    skipAllNight,
    resetCore,
    socketWorld,
    call,
    flush,
    fakeClock,
    createFakeSocket,
    createFakeIo,
};

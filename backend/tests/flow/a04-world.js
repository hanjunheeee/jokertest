'use strict';

// 재판 흐름 시험 판 차리기 (a04 흐름 시험 파일만 씀) — 가짜 소켓·가짜 io + node:test 가짜 시계(setTimeout·Date)
// 낮 투표 → 재판까지 진짜 핸들러 길로 감, DB에 쓰는 곳(낮 표 참여·업적·전적·탈주)은 아무것도 안 하는 함수로 바꿔 끼움
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');

const T = gs.__testables;

// 가짜 시계 시작 시각 (아무 값, 시험마다 같음)
const START_MS = 1_800_000_000_000;

// 방 설정 기본값: 토론·투표·밤 30초(방 설정 최소값), 재판은 시험마다 줌
const BASE_SETTINGS = { dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 };

// 판 하나 차리기: n명, 직업 고정(randomFn 0) + 소켓 세상 + 가짜 시계 (단계는 역할 확인)
// opts.settings에 tribunalTime 등, opts.roleCounts 없으면 광대 1·나머지 시민, opts.extra에 hostUuid 등
function setupWorld(t, spec) {
    return setupWorlds(t, [spec])[0];
}

// 판 여러 개를 한 소켓 세상에 차리기 (다른 판 사람이 알림을 받는지 볼 때), 판마다 world 하나씩 돌려줌
function setupWorlds(t, specs) {
    gf.resetCore();
    gs.__resetStateForTests();
    desertion.__resetForTests();
    // 시계는 setTimeout·Date 둘 다 가짜 (서버 타이머가 부를 때마다 전역 값을 읽어 같이 따름)
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START_MS });
    // DB에 쓰는 곳 막기 (메모리 시험)
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => ({ ok: true }));
    desertion.__setRepositoryForTests({
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
        findDesertionsForWarmup: async () => [],
    });

    const sessions = specs.map(({ id, n, roleCounts = { JOKER: 1 }, settings = {}, extra = {} }) =>
        gf.startGame({ id, n, roleCounts, settings: { ...BASE_SETTINGS, ...settings }, extra }));

    // 판 참가자마다 소켓 하나 (판 채널 안), 접속 목록 하나에 다 넣음
    const sockets = new Map();
    for (const session of sessions) {
        for (const uuid of session.players.keys()) {
            const socket = gf.createFakeSocket(uuid);
            socket.rooms.add(session.channelId);
            socket.data.activeGameId = session.id;
            sockets.set(uuid, socket);
        }
    }
    const io = gf.createFakeIo([...sockets.values()]);
    const registry = new Map([...sockets].map(([uuid, s]) => [uuid, s.id]));
    gs.setOnlineUsersRegistry(registry);
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event) => sockets.get(uuid).received.filter((e) => e.event === event);

    t.after(() => {
        gs.__resetStateForTests();
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
    });

    const tick = (ms) => t.mock.timers.tick(ms);
    const now = () => Date.now();
    return sessions.map((session) => ({
        t, session, io, sockets, registry, sock, received, tick, now, uuids: [...session.players.keys()],
    }));
}

// 밤을 진짜 밤 차례 타이머로 넘겨 다음 낮까지 (1초씩, 아무도 안 고르면 차례마다 마감까지 감)
function nightToDay(w) {
    assert.equal(w.session.phase, 'NIGHT');
    for (let i = 0; i < 600 && w.session.phase === 'NIGHT'; i += 1) w.tick(1_000);
    assert.equal(w.session.phase, 'DAY', '밤이 안 끝남');
}

// 재판 마감 당김 알림만 (낮 당김 알림은 뺌)
const tribunalSettles = (w, uuid) => w.received(uuid, 'phase_settle_started').filter((e) => e.payload.phase === 'TRIBUNAL');

// 투표할 사람 (산 사람 중 피고 빼고, 나간 사람 빼고)
const tribunalVoters = (w) => gf.core.getTribunalVoterUuids(w.session, w.session.tribunal.defendantUuid);

// 첫 낮으로 (역할 확인 마감 길)
function toFirstDay(w) {
    gf.toDay(w.session);
    return w;
}

// 낮에 들어가기 전 밤마다 광대가 한 사람씩 죽임 (죽은 사람 섞인 판 만들기), 끝나면 그다음 날 낮
function killAtNights(w, victims) {
    const { session } = w;
    if (session.phase === 'ROLE_REVEAL') gf.toDay(session);
    for (const victim of victims) {
        gf.toNight(session);
        const joker = gf.firstOf(session, 'JOKER');
        const sent = gf.core.submitNightAction(joker, session.id, victim);
        assert.equal(sent.ok, true, `밤 행동 실패: ${sent.code}`);
        gf.skipAllNight(session);
        const prepared = gf.core.prepareNightResolution(joker, session.id);
        assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
        const committed = gf.core.commitNightResolution(prepared.session, prepared.resolution);
        assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
        assert.equal(session.players.get(victim).alive, false);
    }
    assert.equal(session.phase, 'DAY');
    return w;
}

// 낮 표 하나 (targetId null = 기권)
const dayVote = (w, uuid, targetId) => gf.call(
    T.handleSubmitDayVote, w.io, w.sock(uuid), uuid, { gameId: w.session.id, targetId },
);

// 재판 표 하나: 보내는 값 그대로 (모양 틀린 값 시험도 이걸로)
const castRaw = (w, uuid, payload, socket = w.sock(uuid)) => gf.call(
    T.handleCastTribunalVote, w.io, socket, uuid, payload,
);

// 재판 표 하나: 오늘 날짜·이 판 id로
const cast = (w, uuid, vote) => castRaw(w, uuid, { gameId: w.session.id, dayIndex: w.session.dayIndex, vote });

// 지금 낮(토론 시작)에서 낮 타이머 걸고 토론 30초 넘김 → 투표 단계
function startDayVote(w) {
    T.startDayPhaseTimer(w.io, w.session);
    w.tick(30_000);
    assert.equal(gf.core.getDayPhase(w.session), 'DAY_VOTE');
}

// 산 사람 전원이 피고를 찍고(피고는 기권) 5초 뒤 재판으로, 재판 진입 시각을 돌려줌
// 낮 투표가 다 차서 5초로 당겨진 길 (진짜 핸들러·진짜 낮 타이머)
async function openTribunal(w, defendant) {
    startDayVote(w);
    const alive = [...w.session.players.values()].filter((p) => p.alive && p.isParticipating !== false);
    for (const p of alive) {
        const reply = await dayVote(w, p.uuid, p.uuid === defendant ? null : defendant);
        assert.equal(reply.ok, true, `낮 표 실패(${p.uuid}): ${reply.code}`);
    }
    w.tick(5_000);
    assert.equal(w.session.phase, 'TRIBUNAL', '재판에 못 들어감');
    return Date.now();
}

// 끊김: 소켓을 끊고 서버 끊김 처리 (60초 기다림 시작)
async function disconnect(w, uuid) {
    const socket = w.sock(uuid);
    socket.connected = false;
    await gs.onDisconnect(w.io, socket, uuid);
}

// 다시 붙음: 새 소켓을 접속 목록에 넣고 스냅샷 요청 (화면이 새로고침 때 하는 것과 같음), 스냅샷 답 돌려줌
let reconnectSeq = 0;
function reconnect(w, uuid) {
    reconnectSeq += 1;
    const socket = gf.createFakeSocket(uuid, { id: `sock-${uuid}-re${reconnectSeq}` });
    socket.rooms.add(w.session.channelId);
    socket.data.activeGameId = w.session.id;
    w.io.sockets.sockets.set(socket.id, socket);
    w.registry.set(uuid, socket.id);
    w.sockets.set(uuid, socket);
    return snapshot(w, uuid);
}

// 스냅샷 요청 답
const snapshot = (w, uuid, payload = { gameId: w.session.id }) => gf.call(
    T.handleGetSessionSnapshot, w.io, w.sock(uuid), uuid, payload,
);

// 판에서 나가기
const leave = (w, uuid) => gf.call(T.handleLeaveGameSession, w.io, w.sock(uuid), uuid, { gameId: w.session.id });

// 판 채팅 하나
const chat = (w, uuid, text) => gf.call(
    T.handleSubmitGameChatMessage, w.io, w.sock(uuid), uuid, { gameId: w.session.id, text },
);

// 그 사람이 받은 알림 이름 순서 (순서 비교용)
const eventNames = (w, uuid) => w.sock(uuid).received.map((e) => e.event);

// 판 전원(지금 소켓 기준)이 받은 그 알림 수
const countFor = (w, uuid, event) => w.received(uuid, event).length;

// 재판 결과 알림 (그 사람이 받은 마지막 것)
const lastResolved = (w, uuid) => w.received(uuid, 'tribunal_vote_resolved').at(-1)?.payload;

module.exports = {
    gf,
    gs,
    T,
    START_MS,
    setupWorld,
    setupWorlds,
    nightToDay,
    tribunalSettles,
    tribunalVoters,
    toFirstDay,
    killAtNights,
    dayVote,
    cast,
    castRaw,
    startDayVote,
    openTribunal,
    disconnect,
    reconnect,
    snapshot,
    leave,
    chat,
    eventNames,
    countFor,
    lastResolved,
};

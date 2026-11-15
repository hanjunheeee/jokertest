'use strict';

// 견본(도우미 쓰는 법 본보기) — 백엔드 서버 흐름(메모리, DB 없음): 5명·7명 판 낮 투표 "다 내면 5초 뒤 판정"을 가짜 시계로 봄
// 시험 쓰는 에이전트가 베껴 쓰는 틀 (docs/게임_의도_2026-11-15/시험_도우미.md 3장), 돌리기: node --env-file=.env.test --test tests/flow/a03-sample-day-settle.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 모델을 불러도 DB에 안 붙음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const T = gs.__testables;

// 판 하나 차리기: 사람 n명, 직업은 randomFn 0으로 늘 같게 (무작위로 두면 결과가 바뀜) + 첫 낮 + 가짜 소켓·가짜 시계
function setupDay(t, { id, n }) {
    gf.resetCore();
    // 낮 표 참여 기록·업적은 DB에 씀 → 메모리 시험에선 아무것도 안 하는 함수로 바꿔 끼움 (끝에 원래대로)
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    const session = gf.startGame({ id, n });
    gf.toDay(session);
    const world = gf.socketWorld(gs, session);
    const clock = gf.fakeClock();
    // 낮 타이머에 가짜 시계를 넣음 (토론·투표 30초 = 방 설정 최소값)
    T.startDayPhaseTimer(world.io, session, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        discussionDurationMs: 30_000, voteDurationMs: 30_000,
    });
    // 다음 단계 타이머(재판·밤)는 진짜 시계라 시험 끝에 끔 (프로세스가 안 끝나는 것 막기)
    t.after(() => {
        T.stopDayPhaseTimer(session.id);
        T.stopTribunalTimer(session.id);
        T.stopNightTurnSequence(session.id);
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        gf.resetCore();
    });
    return { session, world, clock };
}

// 화면이 보내는 것처럼 낮 표 하나 보내고 답 받기 (target null = 기권)
const vote = (world, session, uuid, targetId) => gf.call(
    T.handleSubmitDayVote, world.io, world.sock(uuid), uuid, { gameId: session.id, targetId },
);

test('견본-1 5명 판: 다 내면 판 전원에 "5초 뒤 마감" 알림, 4.999초엔 판정 없음, 5초에 재판', async (t) => {
    const { session, world, clock } = setupDay(t, { id: 'smp-a', n: 5 });
    const joker = gf.firstOf(session, 'JOKER');
    const citizens = gf.nonJokers(session);

    // 토론 30초 끝 → 투표 (단계 바뀜 알림이 전원에게)
    clock.advance(30_000);
    for (const uuid of session.players.keys()) assert.equal(world.received(uuid, 'day_phase_changed').length, 1);

    // 시민 4명은 광대, 광대는 시민 하나 → 다 냄 (남은 시간 30초)
    for (const uuid of citizens) assert.equal((await vote(world, session, uuid, joker)).ok, true);
    const lastAt = clock.now();
    assert.equal((await vote(world, session, joker, citizens[0])).ok, true);

    // 마감 당김 알림: 판 전원(5명)에게 deadline = 지금 + 5초
    for (const uuid of session.players.keys()) {
        const [settle] = world.received(uuid, 'phase_settle_started');
        assert.ok(settle, `${uuid}가 5초 알림을 못 받음`);
        assert.equal(settle.payload.deadline, lastAt + 5_000);
    }

    clock.advance(4_999);
    assert.equal(world.received(joker, 'day_vote_resolved').length, 0);
    clock.advance(1);
    // 최다 4표 > 기권 0 → 재판, 판정 알림은 전원에게 한 번
    for (const uuid of session.players.keys()) assert.equal(world.received(uuid, 'day_vote_resolved').length, 1);
    assert.equal(session.phase, 'TRIBUNAL');
});

test('견본-2 7명 판: 1표 6기권이면 재판 없이 밤 (받은 버그 9)', async (t) => {
    const { session, world, clock } = setupDay(t, { id: 'smp-b', n: 7 });
    const joker = gf.firstOf(session, 'JOKER');
    const [first, ...rest] = gf.nonJokers(session);

    clock.advance(30_000);
    assert.equal((await vote(world, session, first, joker)).ok, true);
    for (const uuid of [...rest, joker]) assert.equal((await vote(world, session, uuid, null)).ok, true);

    clock.advance(5_000);
    assert.equal(session.phase, 'NIGHT');
});

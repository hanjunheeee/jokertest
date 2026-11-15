'use strict';

// 역할 확인 규칙 시험 — 마감이면 확인 안 눌러도 1일째 낮, 전원 나가면 안 넘김, 역할 확인 중 채팅 막힘
// 목록 A02-B-152~156 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "역할 확인 규칙")
const test = require('node:test');
const assert = require('node:assert/strict');

// 판 차리기 도우미 (맨 위에서 DB 주소를 닿지 않는 곳으로 막음)
const gf = require('../audit-2026-11-09/gameFixtures');
const gameSession = require('../../game-core/gameSession');

test.beforeEach(() => gf.resetCore());
test.after(() => gf.resetCore());

// 아무 사람 눈으로 본 스냅샷 (단계·날짜·낮 단계)
const viewOf = (session) => gameSession.buildSessionSnapshot(session, [...session.players.keys()][0]);

test('A02-B-152 5명 역할 확인 판에 마감 처리 → 낮(토론), 1일째', () => {
    const session = gf.startGame({ id: 'b152', n: 5 });
    const r = gameSession.forceCompleteRoleReveal(session);
    assert.equal(r.ok, true);
    const view = viewOf(session);
    assert.equal(view.phase, 'DAY');
    assert.equal(view.dayPhase, 'DAY_DISCUSSION');
    assert.equal(view.dayIndex, 1);
});

test('A02-B-153 6명 중 2명만 확인 → 마감 처리 → 1일째 낮', () => {
    const session = gf.startGame({ id: 'b153', n: 6 });
    const [a, b] = [...session.players.keys()];
    gameSession.acknowledgeRoleReveal(a, session.id);
    gameSession.acknowledgeRoleReveal(b, session.id);
    assert.equal(session.phase, 'ROLE_REVEAL');
    gameSession.forceCompleteRoleReveal(session);
    const view = viewOf(session);
    assert.equal(view.phase, 'DAY');
    assert.equal(view.dayIndex, 1);
});

test('A02-B-154 [지금 동작] 5명 전원 나간 역할 확인 판에 마감 → 낮으로 안 넘어감', () => {
    const session = gf.startGame({ id: 'b154', n: 5 });
    // 한 명씩 나감 (판이 먼저 끝나면 뒤 사람 나가기는 거절돼도 됨)
    for (const uuid of [...session.players.keys()]) gameSession.commitParticipantDeparture(session, uuid, { reason: 'PLAYER_LEFT' });
    const r = gameSession.forceCompleteRoleReveal(session);
    assert.notEqual(r.transitioned, true);
    assert.notEqual(session.phase, 'DAY');
    assert.equal(session.dayIndex, 0);
});

test('A02-B-155 7명 역할 확인 중, 산 시민 낮 채팅 → INVALID_PHASE 거절', () => {
    const session = gf.startGame({ id: 'b155', n: 7 });
    const citizen = gf.firstOf(session, 'CITIZEN');
    const r = gameSession.prepareGameChatMessage(citizen, session.id, '안녕');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_PHASE');
});

test('A02-B-156 7명 역할 확인 중, 산 광대 광대 채팅 → INVALID_PHASE 거절', () => {
    const session = gf.startGame({ id: 'b156', n: 7 });
    const joker = gf.firstOf(session, 'JOKER');
    const r = gameSession.prepareJokerChatMessage(joker, session.id, '안녕');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_PHASE');
});

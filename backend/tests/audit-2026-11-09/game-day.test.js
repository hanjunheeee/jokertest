'use strict';

// 게임 진행 시험: 낮 토론 준비·낮 투표·낮 판정 (2차 묶음)
// 새 규칙: 재투표 없음, 동률·전원 기권이면 바로 밤
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

// 5명 판(광대 1 + 시민 4)을 1일째 낮으로
let seq = 0;
const dayGame = ({ vote = false, n = 5 } = {}) => {
    seq += 1;
    const session = F.toDay(F.startGame({ id: `day${seq}`, n }));
    if (vote) F.toVote(session);
    const uuids = [...session.players.keys()];
    return { session, uuids };
};

const vote = (session, voter, target) => core.submitDayVote(voter, session.id, target);
const prepare = (session, who = [...session.players.keys()][0], day = session.dayIndex) =>
    core.prepareDayVoteResolution(who, session.id, day);

// ── 투표 준비 ──

test('투표 준비: 산 사람 전원이 누르면 토론에서 투표로 넘어감', () => {
    const { session, uuids } = dayGame();
    let last;
    for (const uuid of uuids) last = core.acknowledgeDayVoteReady(uuid, session.id);
    assert.equal(last.transitioned, true);
    assert.equal(session.dayPhase, 'DAY_VOTE');
});

test('투표 준비: 한 명 빼고 다 눌렀으면 아직 토론, 수는 4/5', () => {
    const { session, uuids } = dayGame();
    let last;
    for (const uuid of uuids.slice(0, 4)) last = core.acknowledgeDayVoteReady(uuid, session.id);
    assert.deepEqual([last.transitioned, last.readyCount, last.requiredCount], [false, 4, 5]);
    assert.equal(session.dayPhase, 'DAY_DISCUSSION');
});

test('투표 준비를 두 번 눌러도 수가 안 늘어남', () => {
    const { session, uuids } = dayGame();
    core.acknowledgeDayVoteReady(uuids[0], session.id);
    const again = core.acknowledgeDayVoteReady(uuids[0], session.id);
    assert.deepEqual([again.ok, again.readyCount], [true, 1]);
});

test('죽은 사람은 투표 준비 못 함 (ACTOR_NOT_ALIVE), 필요 인원에서도 빠짐', () => {
    const { session, uuids } = dayGame();
    session.players.get(uuids[4]).alive = false;
    assert.equal(core.acknowledgeDayVoteReady(uuids[4], session.id).code, 'ACTOR_NOT_ALIVE');
    assert.equal(core.acknowledgeDayVoteReady(uuids[0], session.id).requiredCount, 4);
});

test('투표 단계에서 투표 준비를 또 보내면 INVALID_DAY_PHASE', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(core.acknowledgeDayVoteReady(uuids[0], session.id).code, 'INVALID_DAY_PHASE');
});

test('밤에 투표 준비를 보내면 INVALID_PHASE', () => {
    const { session, uuids } = dayGame();
    F.toNight(session);
    assert.equal(core.acknowledgeDayVoteReady(uuids[0], session.id).code, 'INVALID_PHASE');
});

test('끝난 판에 투표 준비를 보내면 GAME_ALREADY_ENDED', () => {
    const { session, uuids } = dayGame();
    session.phase = 'ENDED';
    assert.equal(core.acknowledgeDayVoteReady(uuids[0], session.id).code, 'GAME_ALREADY_ENDED');
});

// ── 낮 표 받기 ──

test('토론 중에 낸 표는 INVALID_DAY_PHASE로 거절, 표 안 남음', () => {
    const { session, uuids } = dayGame();
    assert.equal(vote(session, uuids[0], uuids[1]).code, 'INVALID_DAY_PHASE');
    assert.equal(session.dayVotes.size, 0);
});

test('자기 자신 찍기는 SELF_TARGET_NOT_ALLOWED', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(vote(session, uuids[0], uuids[0]).code, 'SELF_TARGET_NOT_ALLOWED');
});

test('죽은 사람 찍기는 TARGET_NOT_ALIVE', () => {
    const { session, uuids } = dayGame({ vote: true });
    session.players.get(uuids[3]).alive = false;
    assert.equal(vote(session, uuids[0], uuids[3]).code, 'TARGET_NOT_ALIVE');
});

test('판에 없는 사람 찍기는 INVALID_TARGET', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(vote(session, uuids[0], 'nobody').code, 'INVALID_TARGET');
});

test('대상이 빈 문자열·숫자·객체면 INVALID_TARGET', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const bad of ['', 7, { uuid: uuids[1] }]) {
        assert.equal(vote(session, uuids[0], bad).code, 'INVALID_TARGET');
    }
    assert.equal(session.dayVotes.size, 0);
});

test('죽은 사람이 낸 표는 ACTOR_NOT_ALIVE', () => {
    const { session, uuids } = dayGame({ vote: true });
    session.players.get(uuids[0]).alive = false;
    assert.equal(vote(session, uuids[0], uuids[1]).code, 'ACTOR_NOT_ALIVE');
});

test('낮 표의 판 id는 공백을 안 자름: 공백 붙은 id는 옛 판으로 보고 거절', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(core.submitDayVote(uuids[0], ` ${session.id}`, uuids[1]).code, 'STALE_SESSION_MISMATCH');
});

test('판에 없는 사람이 표를 내면 NOT_IN_SESSION', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(core.submitDayVote('outsider', session.id, uuids[1]).code, 'NOT_IN_SESSION');
});

test('표를 다시 내면 마지막 표로 덮어써서 셈', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    vote(session, uuids[0], uuids[2]);
    for (const u of uuids.slice(1)) vote(session, u, u === uuids[2] ? null : uuids[2]);
    const r = prepare(session);
    assert.equal(r.resolution.tribunalTargetUuid, uuids[2]);
});

test('투표 효과음: 같은 대상을 다시 내면 번호 그대로, 다른 대상이면 +1', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    const first = core.readDayVoteSfx(uuids[0], session.id);
    vote(session, uuids[0], uuids[1]);
    assert.equal(core.readDayVoteSfx(uuids[0], session.id).eventId, first.eventId);
    vote(session, uuids[0], uuids[2]);
    assert.equal(core.readDayVoteSfx(uuids[0], session.id).revision, first.revision + 1);
});

test('투표 효과음: 표 안 낸 사람·잘못된 판 id는 null', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(core.readDayVoteSfx(uuids[0], session.id), null);
    assert.equal(core.readDayVoteSfx(uuids[0], 123), null);
});

// ── 낮 판정 ──

test('판정: 산 사람 중 한 명이라도 안 냈으면 ACTIONS_PENDING', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids.slice(0, 4)) vote(session, u, null);
    assert.equal(prepare(session).code, 'ACTIONS_PENDING');
});

test('판정: 최다 득표 한 명이면 그 사람이 재판에 섬', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[4]);
    vote(session, uuids[1], uuids[4]);
    vote(session, uuids[2], uuids[0]);
    vote(session, uuids[3], null);
    vote(session, uuids[4], null);
    const r = prepare(session);
    assert.equal(r.resolution.outcome, 'TRIBUNAL');
    core.commitDayVoteResolution(r.session, r.resolution);
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal(session.tribunal.defendantUuid, uuids[4]);
});

test('[규칙 변경] 판정: 1라운드 동률이면 재투표 없이 바로 밤', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    vote(session, uuids[1], uuids[0]);
    for (const u of uuids.slice(2)) vote(session, u, null);
    const r = prepare(session);
    assert.notEqual(r.resolution.outcome, 'REVOTE');
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).ok, true);
    assert.equal(session.phase, 'NIGHT');
});

test('[규칙 변경] 판정: 동률 결과에 재투표 제외 목록이 비어 있음', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[3]);
    vote(session, uuids[1], uuids[2]);
    vote(session, uuids[2], uuids[3]);
    vote(session, uuids[3], uuids[2]);
    vote(session, uuids[4], null);
    const r = prepare(session);
    assert.equal(r.ok, true);
    assert.deepEqual([...(r.resolution.revoteExcludedUuids ?? [])], []);
});

test('판정: 전원 기권이면 바로 밤 (ABSTAINED), 아무도 안 죽음', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, null);
    const r = prepare(session);
    assert.equal(r.resolution.outcome, 'ABSTAINED');
    core.commitDayVoteResolution(r.session, r.resolution);
    assert.equal(session.phase, 'NIGHT');
    assert.ok([...session.players.values()].every((p) => p.alive));
});

test('판정 공개 수: 투표자 수는 산 사람 수, 기권 수는 null 표 수', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    for (const u of uuids.slice(1)) vote(session, u, null);
    const r = prepare(session);
    assert.deepEqual([r.resolution.publicVoteCount, r.resolution.publicAbstainCount], [5, 4]);
});

test('판정: 요청 날짜가 오늘이 아니면 STALE_DAY_INDEX, 정수가 아니면 INVALID_DAY_INDEX', () => {
    const { session, uuids } = dayGame({ vote: true });
    assert.equal(prepare(session, uuids[0], 0).code, 'STALE_DAY_INDEX');
    assert.equal(prepare(session, uuids[0], 1.5).code, 'INVALID_DAY_INDEX');
});

test('판정: 토론 중이면 INVALID_DAY_PHASE', () => {
    const { session } = dayGame();
    assert.equal(prepare(session).code, 'INVALID_DAY_PHASE');
});

test('판정: 끝난 판이면 GAME_ALREADY_ENDED', () => {
    const { session } = dayGame({ vote: true });
    session.phase = 'ENDED';
    assert.equal(prepare(session).code, 'GAME_ALREADY_ENDED');
});

test('판정: 찍힌 사람이 그사이 죽었으면 TARGET_NOT_A_PARTICIPANT', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    for (const u of uuids.slice(1)) vote(session, u, null);
    session.players.get(uuids[1]).alive = false;
    assert.equal(prepare(session).code, 'TARGET_NOT_A_PARTICIPANT');
});

test('판정이 이미 끝난 투표를 또 판정하면 결과만 주고 다시 확정 안 함 (타이머·버튼 겹침)', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const first = prepare(session);
    core.commitDayVoteResolution(first.session, first.resolution);
    const again = prepare(session);
    assert.equal(again.alreadyResolved, true);
    assert.equal(again.resolution, session.dayVoteResolution);
});

test('판정 끝난 뒤 늦게 온 낮 표는 DAY_VOTE_ALREADY_RESOLVED', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const r = prepare(session);
    core.commitDayVoteResolution(r.session, r.resolution);
    assert.equal(vote(session, uuids[0], uuids[2]).code, 'DAY_VOTE_ALREADY_RESOLVED');
});

test('확정: prepare 뒤 누가 표를 바꿨으면 DAY_VOTE_RESOLUTION_MISMATCH, 판 그대로', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const r = prepare(session);
    vote(session, uuids[0], uuids[2]);
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).code, 'DAY_VOTE_RESOLUTION_MISMATCH');
    assert.equal(session.phase, 'DAY');
});

test('확정: prepare 뒤 표를 바꿨다가 원래대로 되돌리면 확정됨', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    vote(session, uuids[1], uuids[0]);
    vote(session, uuids[2], uuids[1]);
    vote(session, uuids[3], null);
    vote(session, uuids[4], uuids[0]);
    const r = prepare(session);
    vote(session, uuids[3], uuids[4]);
    vote(session, uuids[3], null);
    vote(session, uuids[4], uuids[2]);
    vote(session, uuids[4], uuids[0]);
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).ok, true);
});

test('확정: prepare 뒤 판이 끝났으면 GAME_ALREADY_ENDED', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, null);
    const r = prepare(session);
    session.phase = 'ENDED';
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).code, 'GAME_ALREADY_ENDED');
});

test('확정을 두 번 하면 두 번째는 거절 (재판 두 번 안 열림)', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const r = prepare(session);
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).ok, true);
    const tribunal = session.tribunal;
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).ok, false);
    assert.equal(session.tribunal, tribunal);
});

test('확정: 장부에서 빠진 판이면 DAY_VOTE_RESOLUTION_MISMATCH', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, null);
    const r = prepare(session);
    F.T.__deleteGameSessionOnlyForTests(session.id);
    assert.equal(core.commitDayVoteResolution(r.session, r.resolution).code, 'DAY_VOTE_RESOLUTION_MISMATCH');
});

test('확정: 결과의 피고 uuid를 몰래 바꾸면 거절', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const r = prepare(session);
    const forged = { ...r.resolution, tribunalTargetUuid: uuids[2] };
    assert.equal(core.commitDayVoteResolution(r.session, forged).code, 'DAY_VOTE_RESOLUTION_MISMATCH');
});

test('낮 투표 결과 방송엔 누가 누굴 찍었는지(표 묶음)가 없음', () => {
    const { session, uuids } = dayGame({ vote: true });
    for (const u of uuids) vote(session, u, u === uuids[1] ? null : uuids[1]);
    const r = prepare(session);
    core.commitDayVoteResolution(r.session, r.resolution);
    const payload = core.buildDayVoteResolvedPayload(session, r.resolution);
    assert.equal('ballotSnapshot' in payload, false);
    assert.equal(JSON.stringify(payload).includes(uuids[0]), false);
});

test('낮 단계 방송: 마감 시각이 있으면 싣고, 0·없음이면 칸째 뺌', () => {
    const { session } = dayGame();
    session.dayPhaseDeadline = 5000;
    assert.equal(core.buildDayPhaseChangedPayload(session).dayPhaseDeadline, 5000);
    session.dayPhaseDeadline = 0;
    assert.equal('dayPhaseDeadline' in core.buildDayPhaseChangedPayload(session), false);
});

test('밤으로 넘어간 판의 단계 방송엔 낮 마감 시각이 안 실림', () => {
    const { session, uuids } = dayGame({ vote: true });
    session.dayPhaseDeadline = 9999;
    for (const u of uuids) vote(session, u, null);
    const r = prepare(session);
    core.commitDayVoteResolution(r.session, r.resolution);
    assert.equal('dayPhaseDeadline' in core.buildPhaseChangedPayload(session), false);
});

test('낮 투표 진행 표시: 표 낸 수 / 산 사람 수, 내 칸엔 내 표만', () => {
    const { session, uuids } = dayGame({ vote: true });
    vote(session, uuids[0], uuids[1]);
    vote(session, uuids[2], null);
    assert.deepEqual(core.buildPublicProgress(session), { kind: 'DAY_VOTE', doneCount: 2, requiredCount: 5 });
    const self = core.buildSelfFields(session, uuids[0]);
    assert.equal(self.dayVoteTargetUuid, uuids[1]);
    assert.equal(core.buildSelfFields(session, uuids[1]).hasSubmittedDayVote, false);
});

test('밤엔 진행 표시 숫자를 숨김 (역할 인원 샘 막기)', () => {
    const { session } = dayGame();
    F.toNight(session);
    assert.deepEqual(core.buildPublicProgress(session), { kind: 'NIGHT', doneCount: null, requiredCount: null });
});

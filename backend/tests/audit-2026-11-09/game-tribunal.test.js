'use strict';

// 게임 진행 시험: 재판 표·재판 판정·처형 뒤 승패 (2차 묶음)
// 규칙: 유죄 > 무죄면 처형, 같으면 무죄, 마감 때 안 낸 표는 기권(어느 쪽도 아님)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

// 5명 판(광대 1 + 시민 4), 피고를 정해 재판까지
let seq = 0;
const tribunalGame = ({ defendant = 'citizen' } = {}) => {
    seq += 1;
    const session = F.toDay(F.startGame({ id: `tri${seq}`, n: 5 }));
    const joker = F.firstOf(session, 'JOKER');
    const citizens = F.byRole(session, 'CITIZEN');
    const defendantUuid = defendant === 'joker' ? joker : citizens[0];
    F.toTribunal(session, defendantUuid);
    const voters = [...session.players.keys()].filter((u) => u !== defendantUuid);
    return { session, joker, citizens, defendantUuid, voters };
};

const cast = (session, voter, value, day = session.dayIndex) => core.submitTribunalVote(voter, session.id, day, value);
const resolve = (session) => {
    const prepared = core.prepareTribunalVoteResolution(session.tribunal ? [...session.players.keys()][0] : null, session.id, session.dayIndex);
    if (!prepared.ok) return { prepared };
    return { prepared, committed: core.commitTribunalVoteResolution(prepared.session, prepared.resolution) };
};
const castAll = (session, voters, values) => voters.forEach((v, i) => cast(session, v, values[i]));

// ── 재판 표 받기 ──

test('피고 본인은 재판 표를 못 냄 (DEFENDANT_CANNOT_VOTE)', () => {
    const { session, defendantUuid } = tribunalGame();
    assert.equal(cast(session, defendantUuid, 'NOT_GUILTY').code, 'DEFENDANT_CANNOT_VOTE');
});

test('재판 표는 한 사람 한 번만, 바꾸기 없음', () => {
    const { session, voters } = tribunalGame();
    assert.equal(cast(session, voters[0], 'GUILTY').ok, true);
    assert.equal(cast(session, voters[0], 'NOT_GUILTY').code, 'TRIBUNAL_VOTE_ALREADY_SUBMITTED');
    assert.equal(session.tribunal.votes.get(voters[0]), 'GUILTY');
});

test('유죄·무죄 말고 다른 값은 INVALID_TRIBUNAL_VOTE', () => {
    const { session, voters } = tribunalGame();
    for (const bad of ['MAYBE', 'guilty', null, 1]) {
        assert.equal(cast(session, voters[0], bad).code, 'INVALID_TRIBUNAL_VOTE');
    }
});

test('사람이 기권(ABSTAIN)을 직접 보내면 거절, 마감 기권만 기록됨', () => {
    const { session, voters } = tribunalGame();
    assert.equal(cast(session, voters[0], core.TRIBUNAL_ABSTAIN).code, 'INVALID_TRIBUNAL_VOTE');
    const r = core.submitTribunalAbstention(voters[0], session.id, session.dayIndex);
    assert.deepEqual([r.ok, r.vote], [true, 'ABSTAIN']);
});

test('죽은 사람의 재판 표는 PLAYER_NOT_ALIVE', () => {
    const { session, voters } = tribunalGame();
    session.players.get(voters[0]).alive = false;
    assert.equal(cast(session, voters[0], 'GUILTY').code, 'PLAYER_NOT_ALIVE');
});

test('지난 날짜로 온 재판 표는 STALE_DAY_INDEX, 날짜가 소수면 INVALID_DAY_INDEX', () => {
    const { session, voters } = tribunalGame();
    assert.equal(cast(session, voters[0], 'GUILTY', 0).code, 'STALE_DAY_INDEX');
    assert.equal(cast(session, voters[0], 'GUILTY', 1.2).code, 'INVALID_DAY_INDEX');
});

test('재판이 아닌 낮에 온 재판 표는 INVALID_PHASE', () => {
    const session = F.toVote(F.toDay(F.startGame({ id: 'tri-np', n: 5 })));
    assert.equal(cast(session, 'tri-np-0', 'GUILTY').code, 'INVALID_PHASE');
});

test('낮 투표 결과가 이 재판과 안 맞으면 표를 안 받음 (TRIBUNAL_RESOLUTION_MISMATCH)', () => {
    const { session, voters } = tribunalGame();
    session.dayVoteResolution = { ...session.dayVoteResolution, tribunalTargetUuid: voters[1] };
    assert.equal(cast(session, voters[0], 'GUILTY').code, 'TRIBUNAL_RESOLUTION_MISMATCH');
});

test('재판 표 효과음 id는 같은 사람·같은 날이면 늘 같음, 표 안 낸 사람은 null', () => {
    const { session, voters } = tribunalGame();
    assert.equal(core.readTribunalVoteSfx(voters[0], session.id), null);
    cast(session, voters[0], 'GUILTY');
    const a = core.readTribunalVoteSfx(voters[0], session.id);
    assert.equal(core.readTribunalVoteSfx(voters[0], session.id).eventId, a.eventId);
    assert.match(a.eventId, /tribunal-submitted$/);
});

test('재판 진행 표시: 피고를 뺀 산 사람 수가 필요 인원, 내 칸엔 유죄·무죄가 없음', () => {
    const { session, voters } = tribunalGame();
    cast(session, voters[0], 'GUILTY');
    assert.deepEqual(core.buildPublicProgress(session), { kind: 'TRIBUNAL', doneCount: 1, requiredCount: 4 });
    const self = core.buildSelfFields(session, voters[0]);
    assert.deepEqual(self, { hasSubmittedTribunalVote: true });
});

// ── 재판 판정 ──

test('판정: 아직 안 낸 사람 있으면 TRIBUNAL_VOTES_INCOMPLETE', () => {
    const { session, voters } = tribunalGame();
    cast(session, voters[0], 'GUILTY');
    assert.equal(resolve(session).prepared.code, 'TRIBUNAL_VOTES_INCOMPLETE');
});

test('판정: 유죄 3 무죄 1이면 처형, 죽은 이유 EXECUTION, 승부 안 나면 밤으로', () => {
    const { session, voters, defendantUuid } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'NOT_GUILTY']);
    const { committed } = resolve(session);
    assert.deepEqual([committed.ok, committed.terminal], [true, null]);
    const d = session.players.get(defendantUuid);
    assert.deepEqual([d.alive, d.deathReason], [false, 'EXECUTION']);
    assert.equal(session.phase, 'NIGHT');
});

test('판정: 유죄 2 무죄 2 동수면 무죄, 피고 살고 밤으로', () => {
    const { session, voters, defendantUuid } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'NOT_GUILTY', 'NOT_GUILTY']);
    const { prepared } = resolve(session);
    assert.equal(prepared.resolution.outcome, 'NOT_GUILTY');
    assert.equal(session.players.get(defendantUuid).alive, true);
    assert.equal(session.phase, 'NIGHT');
});

test('판정: 유죄 1 + 기권 3이면 유죄 (기권은 어느 쪽에도 안 셈)', () => {
    const { session, voters } = tribunalGame();
    cast(session, voters[0], 'GUILTY');
    for (const v of voters.slice(1)) core.submitTribunalAbstention(v, session.id, session.dayIndex);
    const { prepared } = resolve(session);
    assert.deepEqual([prepared.resolution.outcome, prepared.resolution.counts.guilty, prepared.resolution.counts.notGuilty], ['GUILTY', 1, 0]);
});

test('판정: 전원 기권이면 무죄', () => {
    const { session, voters } = tribunalGame();
    for (const v of voters) core.submitTribunalAbstention(v, session.id, session.dayIndex);
    assert.equal(resolve(session).prepared.resolution.outcome, 'NOT_GUILTY');
});

test('광대를 처형하면 광대 0명 → 시민 승, 판 끝', () => {
    const { session, voters } = tribunalGame({ defendant: 'joker' });
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'GUILTY']);
    const { committed } = resolve(session);
    assert.deepEqual(committed.terminal, { winner: 'CITIZEN' });
    assert.equal(session.phase, 'ENDED');
    assert.equal(session.winResult.winner, 'CITIZEN');
});

test('시민 처형으로 산 광대 수가 나머지 이상이 되면 광대 승', () => {
    const { session, voters, citizens } = tribunalGame();
    // 피고 말고 시민 둘은 이미 죽은 상태로 (산 사람: 광대 1, 피고 1, 시민 1)
    session.players.get(citizens[1]).alive = false;
    session.players.get(citizens[2]).alive = false;
    const alive = voters.filter((v) => session.players.get(v).alive);
    castAll(session, alive, alive.map(() => 'GUILTY'));
    const { committed } = resolve(session);
    assert.deepEqual(committed.terminal, { winner: 'JOKER' });
});

test('확정: 다시 prepare했으면 옛 결과로는 확정 못 함 (TRIBUNAL_RESOLUTION_MISMATCH)', () => {
    const { session, voters } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'GUILTY']);
    const first = core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex);
    const second = core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex);
    assert.equal(core.commitTribunalVoteResolution(session, first.resolution).code, 'TRIBUNAL_RESOLUTION_MISMATCH');
    assert.equal(core.commitTribunalVoteResolution(session, second.resolution).ok, true);
});

test('확정을 두 번 하면 두 번째는 거절, 피고가 두 번 안 죽음', () => {
    const { session, voters } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'GUILTY']);
    const p = core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex);
    assert.equal(core.commitTribunalVoteResolution(session, p.resolution).ok, true);
    assert.equal(core.commitTribunalVoteResolution(session, p.resolution).ok, false);
});

test('확정: 결과 객체를 복사해 만든 가짜는 거절', () => {
    const { session, voters } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'GUILTY']);
    const p = core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex);
    assert.equal(core.commitTribunalVoteResolution(session, { ...p.resolution }).code, 'TRIBUNAL_RESOLUTION_MISMATCH');
});

test('확정: prepare 뒤 판이 끝났으면 GAME_ALREADY_ENDED, 피고 안 죽음', () => {
    const { session, voters, defendantUuid } = tribunalGame();
    castAll(session, voters, ['GUILTY', 'GUILTY', 'GUILTY', 'GUILTY']);
    const p = core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex);
    session.phase = 'ENDED';
    assert.equal(core.commitTribunalVoteResolution(session, p.resolution).code, 'GAME_ALREADY_ENDED');
    assert.equal(session.players.get(defendantUuid).alive, true);
});

test('판정 준비: 재판이 끝난 판이면 GAME_ALREADY_ENDED, 다른 날짜면 STALE_DAY_INDEX', () => {
    const { session, voters } = tribunalGame();
    assert.equal(core.prepareTribunalVoteResolution(voters[0], session.id, 9).code, 'STALE_DAY_INDEX');
    session.phase = 'ENDED';
    assert.equal(core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex).code, 'GAME_ALREADY_ENDED');
});

test('판정 준비: 재판 상태가 비면 TRIBUNAL_STATE_NOT_FOUND', () => {
    const { session, voters } = tribunalGame();
    session.tribunal = null;
    assert.equal(core.prepareTribunalVoteResolution(voters[0], session.id, session.dayIndex).code, 'TRIBUNAL_STATE_NOT_FOUND');
});

test('재판 결과 방송: 처형됐으면 처형된 사람 역할만 공개, 무죄면 역할 null', () => {
    const a = tribunalGame({ defendant: 'joker' });
    castAll(a.session, a.voters, ['GUILTY', 'GUILTY', 'GUILTY', 'NOT_GUILTY']);
    resolve(a.session);
    assert.equal(core.buildTribunalVoteResolvedPayload(a.session).executedRole, 'JOKER');

    const b = tribunalGame();
    castAll(b.session, b.voters, ['NOT_GUILTY', 'NOT_GUILTY', 'NOT_GUILTY', 'GUILTY']);
    resolve(b.session);
    const payload = core.buildTribunalVoteResolvedPayload(b.session);
    assert.deepEqual([payload.executedUuid, payload.executedRole], [null, null]);
});

test('피고가 재판 중에 나가면 재판 취소, 처형 없이 밤으로, 취소 이유 DEFENDANT_LEFT', () => {
    const { session, voters, defendantUuid } = tribunalGame();
    cast(session, voters[0], 'GUILTY');
    const r = core.commitParticipantDeparture(session, defendantUuid);
    assert.equal(r.tribunalCancelled, true);
    assert.equal(session.phase, 'NIGHT');
    const payload = core.buildTribunalVoteResolvedPayload(session);
    assert.deepEqual([payload.outcome, payload.reason, payload.counts.guilty], ['CANCELLED', 'DEFENDANT_LEFT', 1]);
});

test('재판 중 투표자(시민)가 나가면 그 사람 표는 지워지고 남은 사람만으로 판정 가능', () => {
    const { session, voters, citizens } = tribunalGame();
    const leaver = citizens[1];
    cast(session, leaver, 'GUILTY');
    core.commitParticipantDeparture(session, leaver);
    assert.equal(session.tribunal.votes.has(leaver), false);
    const rest = voters.filter((v) => v !== leaver);
    castAll(session, rest, rest.map(() => 'NOT_GUILTY'));
    const p = core.prepareTribunalVoteResolution(rest[0], session.id, session.dayIndex);
    assert.equal(p.ok, true);
    assert.deepEqual([p.resolution.counts.guilty, p.resolution.counts.notGuilty], [0, 3]);
});

test('재판 확정 뒤 늦게 온 재판 표는 거절 (밤으로 넘어감)', () => {
    const { session, voters } = tribunalGame();
    castAll(session, voters.slice(0, 4), ['NOT_GUILTY', 'NOT_GUILTY', 'NOT_GUILTY', 'NOT_GUILTY']);
    resolve(session);
    assert.equal(cast(session, voters[0], 'GUILTY', session.dayIndex).ok, false);
});

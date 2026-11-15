'use strict';

// 재판 뒤 규칙 시험: 승패 확인·날짜·한 낮에 재판 한 번·두 번 확정 막기·처형 죽은 이유·피고·투표자 나감
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-066~080
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    gf, core, newGame, killAtNights, nightToDay, openTribunal, vote, voters, abstainRest, prepare, resolve, castCounts,
} = require('./a04-setup');

// 투표할 사람 전원 유죄 → 확정 결과
function executeAll(session) {
    castCounts(session, voters(session).length, 0);
    const { committed } = resolve(session);
    assert.equal(committed.ok, true, `확정 실패: ${committed.code}`);
    return committed;
}

// 투표할 사람 전원 무죄 → 확정 결과
function acquitAll(session) {
    castCounts(session, 0, voters(session).length);
    const { committed } = resolve(session);
    assert.equal(committed.ok, true, `확정 실패: ${committed.code}`);
    return committed;
}

test('A04-B-066 5명 판 광대 1 처형 → 시민 승', () => {
    const session = newGame({ n: 5 });
    openTribunal(session, gf.firstOf(session, 'JOKER'));
    assert.deepEqual(executeAll(session).terminal, { winner: 'CITIZEN' });
});

test('A04-B-067 7명 판 마지막 광대 처형 → 시민 승', () => {
    const session = newGame({ n: 7, roleCounts: { JOKER: 2 } });
    const [jokerA, jokerB] = gf.byRole(session, 'JOKER');
    // 1일에 광대 하나 처형 (판 계속), 2일에 남은 광대 처형
    openTribunal(session, jokerA);
    assert.equal(executeAll(session).terminal, null);
    nightToDay(session);
    openTribunal(session, jokerB);
    assert.deepEqual(executeAll(session).terminal, { winner: 'CITIZEN' });
});

test('A04-B-068 8명 판 광대 2 중 1 처형 → 판 계속·밤', () => {
    const session = newGame({ n: 8, roleCounts: { JOKER: 2 } });
    openTribunal(session, gf.firstOf(session, 'JOKER'));
    assert.equal(executeAll(session).terminal, null);
    assert.equal(session.phase, 'NIGHT');
});

test('A04-B-069 5명 판 광대 2·시민 3, 시민 처형 → 2:2 광대 승', () => {
    const session = newGame({ n: 5, roleCounts: { JOKER: 2 } });
    openTribunal(session, gf.nonJokers(session)[0]);
    assert.deepEqual(executeAll(session).terminal, { winner: 'JOKER' });
});

test('A04-B-070 6명 판 광대 1, 시민 처형 → 판 계속·밤', () => {
    const session = newGame({ n: 6 });
    openTribunal(session, gf.nonJokers(session)[0]);
    assert.equal(executeAll(session).terminal, null);
    assert.equal(session.phase, 'NIGHT');
});

test('A04-B-071 10명 판 산 광대 2·나머지 3, 시민 처형 → 광대 승', () => {
    const session = newGame({ n: 10, roleCounts: { JOKER: 2 } });
    const citizens = gf.nonJokers(session);
    // 밤 다섯 번에 시민 다섯 죽음 → 산 사람 광대 2·나머지 3
    killAtNights(session, citizens.slice(0, 5));
    openTribunal(session, citizens[5]);
    assert.deepEqual(executeAll(session).terminal, { winner: 'JOKER' });
});

test('A04-B-072 8명 판 1일 재판 무죄 → 단계 NIGHT, dayIndex 1 그대로', () => {
    const session = newGame({ n: 8 });
    openTribunal(session, gf.nonJokers(session)[0]);
    acquitAll(session);
    assert.equal(session.phase, 'NIGHT');
    assert.equal(session.dayIndex, 1);
});

test('A04-B-073 6명 판 2일 재판 유죄(광대 아님) → NIGHT, dayIndex 2 그대로', () => {
    const session = newGame({ n: 6 });
    const [dead, defendant] = gf.nonJokers(session);
    killAtNights(session, [dead]);
    openTribunal(session, defendant);
    assert.equal(executeAll(session).terminal, null);
    assert.equal(session.phase, 'NIGHT');
    assert.equal(session.dayIndex, 2);
});

test('A04-B-074 7명 판 재판 끝난 뒤 같은 날 낮 투표·재판 표 → 둘 다 거절(단계 NIGHT)', () => {
    const session = newGame({ n: 7 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    acquitAll(session);
    const voter = gf.nonJokers(session)[1];
    assert.equal(core.submitDayVote(voter, session.id, defendant).ok, false);
    assert.equal(vote(session, voter, 'GUILTY').code, 'INVALID_PHASE');
    assert.equal(session.phase, 'NIGHT');
});

test('A04-B-075 5명 판 같은 판정 결과로 확정 두 번 → 두 번째 거절, 피고 죽음·밤 한 번', () => {
    const session = newGame({ n: 5 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    castCounts(session, voters(session).length, 0);
    const prepared = prepare(session);
    const first = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(first.ok, true);
    const dayAfterFirst = session.dayIndex;
    const second = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(second.ok, false);
    assert.match(second.code, /^TRIBUNAL_/);
    assert.equal(session.players.get(defendant).alive, false);
    assert.equal(session.phase, 'NIGHT');
    assert.equal(session.dayIndex, dayAfterFirst);
});

test('A04-B-076 10명 판 유죄 확정 → 피고 죽음, 죽은 이유 EXECUTION', () => {
    const session = newGame({ n: 10 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    executeAll(session);
    // 겉으로 보이는 기록 = 판 기록 줄 (저장할 때 쓰는 값)
    const row = core.buildGameResultRecord(session, { completed: false }).players.find((p) => p.user_id === defendant);
    assert.equal(row.is_alive, false);
    assert.equal(row.death_reason, 'EXECUTION');
});

test('A04-B-077 6명 판 1일 무죄 피고 → 2일 낮 투표 대상·투표자 둘 다 됨', () => {
    const session = newGame({ n: 6 });
    const [defendant, other] = gf.nonJokers(session);
    openTribunal(session, defendant);
    acquitAll(session);
    nightToDay(session);
    gf.toVote(session);
    assert.ok(core.getDayVoterUuids(session).includes(defendant));
    assert.equal(core.submitDayVote(other, session.id, defendant).ok, true);
    assert.equal(core.submitDayVote(defendant, session.id, other).ok, true);
});

test('A04-B-078 7명 판 표 2개 뒤 피고 나감 → CANCELLED·DEFENDANT_LEFT·처형 없음·그때까지 표 수, 밤', () => {
    const session = newGame({ n: 7 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    const [a, b] = voters(session);
    assert.equal(vote(session, a, 'GUILTY').ok, true);
    assert.equal(vote(session, b, 'NOT_GUILTY').ok, true);
    const left = core.commitParticipantDeparture(session, defendant, { reason: 'PLAYER_LEFT' });
    assert.equal(left.ok, true);
    const payload = core.buildTribunalVoteResolvedPayload(session);
    assert.equal(payload.outcome, 'CANCELLED');
    assert.equal(payload.reason, 'DEFENDANT_LEFT');
    assert.equal(payload.executedUuid, null);
    assert.deepEqual(payload.counts, { guilty: 1, notGuilty: 1 });
    assert.equal(session.phase, 'NIGHT');
});

test('A04-B-079 5명 판 광대 1명 = 피고가 나감 → 취소 결과 없이 시민 승 판 끝', () => {
    const session = newGame({ n: 5 });
    const joker = gf.firstOf(session, 'JOKER');
    openTribunal(session, joker);
    const left = core.commitParticipantDeparture(session, joker, { reason: 'PLAYER_LEFT' });
    assert.equal(left.ok, true);
    assert.equal(left.tribunalCancelled, false);
    assert.deepEqual(left.terminal, { winner: 'CITIZEN' });
    assert.equal(session.phase, 'ENDED');
});

test('A04-B-080 8명 판 유죄 낸 투표자 나감 → 그 표 지워짐, 투표할 사람 명단에서 빠짐', () => {
    const session = newGame({ n: 8 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    const leaver = voters(session).find((u) => u !== gf.firstOf(session, 'JOKER'));
    assert.equal(vote(session, leaver, 'GUILTY').ok, true);
    assert.equal(core.commitParticipantDeparture(session, leaver, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(voters(session).includes(leaver), false);
    // 남은 사람 전원 무죄 → 유죄 0 (나간 사람 유죄 표가 남았으면 1)
    for (const uuid of voters(session)) assert.equal(vote(session, uuid, 'NOT_GUILTY').ok, true);
    abstainRest(session);
    assert.deepEqual({ ...prepare(session).resolution.counts }, { guilty: 0, notGuilty: 6 });
});

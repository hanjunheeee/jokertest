'use strict';

// 재판 표 받기 규칙 시험: 누가·언제·무슨 값을 낼 수 있나 (받기 답·투표할 사람 명단·판정 준비 결과만 봄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-041~059
const test = require('node:test');
const assert = require('node:assert/strict');

const { gf, core, newGame, killAtNights, openTribunal, vote, voters, abstainRest, prepare, resolve } = require('./a04-setup');

// 판정 준비 결과의 표 수 (기권 채운 뒤)
function countsAfterAbstain(session) {
    abstainRest(session);
    const prepared = prepare(session);
    assert.equal(prepared.ok, true, `판정 준비 실패: ${prepared.code}`);
    return { ...prepared.resolution.counts };
}

test('A04-B-041 6명 판: 피고가 유죄 냄 → DEFENDANT_CANNOT_VOTE, 표 묶음에 안 들어감', () => {
    const session = newGame({ n: 6 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    assert.equal(vote(session, defendant, 'GUILTY').code, 'DEFENDANT_CANNOT_VOTE');
    // 나머지 5명 무죄 → 유죄 0이어야 피고 표가 안 들어간 것
    for (const uuid of voters(session)) assert.equal(vote(session, uuid, 'NOT_GUILTY').ok, true);
    const prepared = prepare(session);
    assert.deepEqual({ ...prepared.resolution.counts }, { guilty: 0, notGuilty: 5 });
    assert.equal(prepared.resolution.ballotSnapshot.some((b) => b.voterUuid === defendant), false);
});

test('A04-B-042 7명 판(1명 밤에 죽음): 죽은 사람이 무죄 냄 → PLAYER_NOT_ALIVE, 표 안 적힘', () => {
    const session = newGame({ n: 7 });
    const [dead, defendant] = gf.nonJokers(session);
    killAtNights(session, [dead]);
    openTribunal(session, defendant);
    assert.equal(vote(session, dead, 'NOT_GUILTY').code, 'PLAYER_NOT_ALIVE');
    for (const uuid of voters(session)) assert.equal(vote(session, uuid, 'GUILTY').ok, true);
    assert.deepEqual(countsAfterAbstain(session), { guilty: 5, notGuilty: 0 });
});

['GUILTY', 'NOT_GUILTY'].forEach((second, i) => {
    test(`A04-B-${String(43 + i).padStart(3, '0')} 8명 판: 유죄 낸 사람이 다시 ${second} → TRIBUNAL_VOTE_ALREADY_SUBMITTED, 첫 표 그대로`, () => {
        const session = newGame({ n: 8 });
        const defendant = gf.nonJokers(session)[0];
        openTribunal(session, defendant);
        const [voter] = voters(session);
        assert.equal(vote(session, voter, 'GUILTY').ok, true);
        assert.equal(vote(session, voter, second).code, 'TRIBUNAL_VOTE_ALREADY_SUBMITTED');
        // 나머지 기권 → 첫 표(유죄) 하나만 남아야 함
        assert.deepEqual(countsAfterAbstain(session), { guilty: 1, notGuilty: 0 });
    });
});

test('A04-B-045 5명 판: 사람이 기권(ABSTAIN)을 보냄 → INVALID_TRIBUNAL_VOTE', () => {
    const session = newGame({ n: 5 });
    openTribunal(session, gf.nonJokers(session)[0]);
    const [voter] = voters(session);
    assert.equal(vote(session, voter, 'ABSTAIN').code, 'INVALID_TRIBUNAL_VOTE');
});

['guilty', '', null, 'YES'].forEach((value, i) => {
    const label = JSON.stringify(value);
    test(`A04-B-${String(46 + i).padStart(3, '0')} 10명 판: 표 값 ${label} → INVALID_TRIBUNAL_VOTE`, () => {
        const session = newGame({ n: 10 });
        openTribunal(session, gf.nonJokers(session)[0]);
        const [voter] = voters(session);
        assert.equal(vote(session, voter, value).code, 'INVALID_TRIBUNAL_VOTE');
    });
});

test('A04-B-050 6명 판: 낮(DAY)에 재판 표 → INVALID_PHASE', () => {
    const session = newGame({ n: 6 });
    gf.toVote(session);
    const [voter] = gf.nonJokers(session);
    assert.equal(core.submitTribunalVote(voter, session.id, session.dayIndex, 'GUILTY').code, 'INVALID_PHASE');
});

test('A04-B-051 6명 판: 밤(NIGHT)에 재판 표 → INVALID_PHASE', () => {
    const session = newGame({ n: 6 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    abstainRest(session);
    resolve(session);
    assert.equal(session.phase, 'NIGHT');
    const [voter] = gf.nonJokers(session).filter((u) => u !== defendant);
    assert.equal(core.submitTribunalVote(voter, session.id, session.dayIndex, 'GUILTY').code, 'INVALID_PHASE');
});

test('A04-B-052 7명 판: 2일 재판에 dayIndex 1로 냄 → STALE_DAY_INDEX', () => {
    const session = newGame({ n: 7 });
    const [dead, defendant] = gf.nonJokers(session);
    killAtNights(session, [dead]);
    assert.equal(session.dayIndex, 2);
    openTribunal(session, defendant);
    const [voter] = voters(session);
    assert.equal(core.submitTribunalVote(voter, session.id, 1, 'GUILTY').code, 'STALE_DAY_INDEX');
});

test('A04-B-053 5명 판: dayIndex "1"(글자) → INVALID_DAY_INDEX', () => {
    const session = newGame({ n: 5 });
    openTribunal(session, gf.nonJokers(session)[0]);
    const [voter] = voters(session);
    assert.equal(core.submitTribunalVote(voter, session.id, '1', 'GUILTY').code, 'INVALID_DAY_INDEX');
});

// 054~059: 판 인원·죽은 사람 수 섞음 → 명단 = 산 사람 중 피고 뺀 전원
[[5, 0], [6, 1], [7, 2], [8, 0], [9, 1], [10, 2]].forEach(([n, deadCount], i) => {
    test(`A04-B-${String(54 + i).padStart(3, '0')} ${n}명 판(죽은 사람 ${deadCount}): 투표할 사람 = 산 사람 중 피고 뺀 전원`, () => {
        const session = newGame({ n });
        const citizens = gf.nonJokers(session);
        const dead = citizens.slice(0, deadCount);
        killAtNights(session, dead);
        const defendant = citizens[deadCount];
        openTribunal(session, defendant);
        const expected = [...session.players.keys()].filter((u) => u !== defendant && !dead.includes(u));
        assert.deepEqual([...voters(session)].sort(), expected.sort());
        assert.equal(voters(session).length, n - deadCount - 1);
    });
});

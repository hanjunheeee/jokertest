'use strict';

// 끊김 기다림 대상·매칭 막힘 순수 시험 (판 중 산 사람만 기다려 주고 매칭을 막음)
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-026~037, 돌리기: node --test tests/game-core/a09-grace-target.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음
const gf = require('../audit-2026-11-09/gameFixtures');

const { core } = gf;

// 판 id 겹침 막기 (같은 id면 "이미 다른 판에 속함"으로 터짐)
let seq = 0;
function open(t, n, roleCounts = { JOKER: 1 }) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    return gf.startGame({ id: `a09gt${seq}`, n, roleCounts });
}

// 산 사람 전원 기권 → 재판 없이 밤 (진짜 판정 길)
function abstainToNight(s) {
    if (s.phase === 'ROLE_REVEAL') gf.toDay(s);
    gf.toVote(s);
    for (const p of s.players.values()) if (p.alive) core.submitDayVote(p.uuid, s.id, null);
    const anyone = [...s.players.values()].find((p) => p.alive).uuid;
    const prepared = core.prepareDayVoteResolution(anyone, s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `낮 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(s.phase, 'NIGHT');
}

// 재판 유죄로 처형 (산 사람 전원 그 사람 찍고 유죄)
function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = core.getTribunalVoterUuids(s, uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true);
    assert.equal(s.players.get(uuid).alive, false);
}

// 기다림 대상인지 (대상이면 그 판을 돌려줌)
const isGraceTarget = (s, uuid) => core.getDisconnectGraceTarget(uuid, s.id)?.session === s;

// A09-B-026~030 끊기면 기다려 줄 대상: 판 중 산 사람 × 단계 (6명 판)
const PHASE_CASES = [
    ['A09-B-026', 'ROLE_REVEAL', () => {}, true],
    ['A09-B-027', 'DAY', (s) => gf.toDay(s), true],
    ['A09-B-028', 'TRIBUNAL', (s) => gf.toTribunal(s, gf.nonJokers(s)[1]), true],
    ['A09-B-029', 'NIGHT', (s) => abstainToNight(s), true],
    // 광대가 나가 시민 승 → 끝난 판
    ['A09-B-030', 'ENDED', (s) => {
        gf.toDay(s);
        assert.equal(core.commitParticipantDeparture(s, gf.firstOf(s, 'JOKER'), { reason: 'PLAYER_LEFT' }).ok, true);
    }, false],
];
for (const [no, phase, prepare, expected] of PHASE_CASES) {
    test(`${no} 6명 판 단계 ${phase}의 산 시민 → 기다림 대상 ${expected ? '맞음' : '아님'}`, (t) => {
        const s = open(t, 6);
        prepare(s);
        assert.equal(s.phase, phase);
        const citizen = gf.nonJokers(s)[0];
        assert.equal(s.players.get(citizen).alive, true);
        assert.equal(isGraceTarget(s, citizen), expected);
    });
}

test('A09-B-031 7명 판 처형된 사람 → 기다림 대상 아님', (t) => {
    const s = open(t, 7);
    gf.toDay(s);
    const victim = gf.nonJokers(s)[0];
    execute(s, victim);
    assert.equal(isGraceTarget(s, victim), false);
});

test('A09-B-032 7명 판 나가서 빠진 사람 → 기다림 대상 아님', (t) => {
    const s = open(t, 7);
    gf.toDay(s);
    const leaver = gf.nonJokers(s)[0];
    assert.equal(core.commitParticipantDeparture(s, leaver, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(isGraceTarget(s, leaver), false);
});

// A09-B-033~037 매칭(방 입장·만들기)을 막는 사람은 판 중 산 사람만 (8명 판)
const BLOCK_CASES = [
    ['A09-B-033', '진행 중 판 산 사람', (s) => gf.nonJokers(s)[0], true],
    ['A09-B-034', '진행 중 판 죽은 사람(처형)', (s) => {
        const victim = gf.nonJokers(s)[0];
        execute(s, victim);
        return victim;
    }, false],
    ['A09-B-035', '판에서 빠진 사람(나감)', (s) => {
        const leaver = gf.nonJokers(s)[0];
        assert.equal(core.commitParticipantDeparture(s, leaver, { reason: 'PLAYER_LEFT' }).ok, true);
        return leaver;
    }, false],
    ['A09-B-036', '끝난 판 산 사람', (s) => {
        assert.equal(core.commitParticipantDeparture(s, gf.firstOf(s, 'JOKER'), { reason: 'PLAYER_LEFT' }).ok, true);
        assert.equal(s.phase, 'ENDED');
        return gf.nonJokers(s)[0];
    }, false],
    ['A09-B-037', '판 없는 사람', () => 'a09gt-nobody', false],
];
for (const [no, label, pick, expected] of BLOCK_CASES) {
    test(`${no} 8명 판 ${label} → 매칭 ${expected ? '막힘' : '안 막힘'}`, (t) => {
        const s = open(t, 8);
        gf.toDay(s);
        const uuid = pick(s);
        assert.equal(core.isMatchmakingBlocked(uuid), expected);
    });
}

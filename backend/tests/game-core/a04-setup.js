'use strict';

// 재판 판 규칙 시험 판 차리기 (a04 순수 시험 파일만 씀) — game-core 함수만 부름, 소켓·타이머·DB 없음
// 직업은 늘 고정(randomFn 0, 광대 수는 roleCounts로), 판 id는 시험마다 새로 만들어 안 겹치게
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

// 판 id 겹침 막기 (같은 id면 "이미 다른 판에 속함"으로 터짐)
let seq = 0;

// n명 판 열고 첫 낮까지, roleCounts 없으면 광대 1·나머지 시민
function newGame({ n, roleCounts = { JOKER: 1 }, settings = {}, extra = {} }) {
    seq += 1;
    const session = gf.startGame({ id: `a04c${seq}`, n, roleCounts, settings, extra });
    gf.toDay(session);
    return session;
}

// 밤마다 광대가 한 사람씩 죽임 (죽은 사람 섞인 판), 끝나면 다음 날 낮
function killAtNights(session, victims) {
    for (const victim of victims) {
        gf.toNight(session);
        const joker = gf.firstOf(session, 'JOKER');
        assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
        gf.skipAllNight(session);
        nightToDay(session);
        assert.equal(session.players.get(victim).alive, false);
    }
    return session;
}

// 아무도 안 죽는 밤을 끝내고 다음 날 낮으로 (지금 밤이어야 함)
function nightToDay(session) {
    gf.skipAllNight(session);
    const anyone = [...session.players.values()].find((p) => p.alive).uuid;
    const prepared = core.prepareNightResolution(anyone, session.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
    assert.equal(session.phase, 'DAY');
    return session;
}

// 낮 투표로 피고 세우기 (산 사람 전원이 피고 찍고 피고는 기권)
function openTribunal(session, defendant) {
    gf.toTribunal(session, defendant);
    assert.equal(session.phase, 'TRIBUNAL');
    return session;
}

// 재판 표 하나 (오늘 날짜)
const vote = (session, uuid, choice) => core.submitTribunalVote(uuid, session.id, session.dayIndex, choice);

// 투표할 사람 명단 (산 사람 중 피고 빼고)
const voters = (session) => core.getTribunalVoterUuids(session, session.tribunal.defendantUuid);

// 아직 안 낸 투표할 사람은 마감처럼 기권으로 채움
function abstainRest(session) {
    for (const uuid of voters(session)) {
        if (session.tribunal.votes.has(uuid)) continue;
        assert.equal(core.submitTribunalAbstention(uuid, session.id, session.dayIndex).ok, true);
    }
}

// 재판 판정 준비 (산 사람 하나 이름으로)
function prepare(session) {
    const anyone = [...session.players.values()].find((p) => p.alive).uuid;
    return core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
}

// 판정 준비 + 확정 한 번에, 확정 결과 돌려줌
function resolve(session) {
    const prepared = prepare(session);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    return { prepared, committed: core.commitTribunalVoteResolution(prepared.session, prepared.resolution) };
}

// 피고 하나에게 유죄·무죄 몇 표씩 넣고 나머지 기권 (앞사람부터 유죄, 그다음 무죄)
function castCounts(session, guilty, notGuilty) {
    const list = voters(session);
    assert.ok(guilty + notGuilty <= list.length, '표가 투표할 사람보다 많음');
    list.slice(0, guilty).forEach((uuid) => assert.equal(vote(session, uuid, 'GUILTY').ok, true));
    list.slice(guilty, guilty + notGuilty).forEach((uuid) => assert.equal(vote(session, uuid, 'NOT_GUILTY').ok, true));
    abstainRest(session);
}

module.exports = {
    gf,
    core,
    newGame,
    killAtNights,
    nightToDay,
    openTribunal,
    vote,
    voters,
    abstainRest,
    prepare,
    resolve,
    castCounts,
};

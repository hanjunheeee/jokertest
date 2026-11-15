'use strict';

// 낮 토론 "투표하자" 준비 시험 (판 규칙 순수) — 산 사람 전원이 누르면 바로 투표로, 아니면 토론 그대로인지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-096~107, 돌리기: node --test tests/game-core/a03-day-ready.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (모델이 DB에 안 붙게)
const gf = require('../audit-2026-11-09/gameFixtures');

const { core } = gf;

// 판 차리기: 광대 1·나머지 시민으로 직업 고정 (밤에 광대만 움직여 날 넘기기 쉬움)
function newGame(t, id, n) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    return gf.startGame({ id, n, roleCounts: { JOKER: 1 } });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
const ready = (s, uuid) => core.acknowledgeDayVoteReady(uuid, s.id);

// 화면이 받는 스냅샷의 낮 안 단계 (토론·투표)
const dayPhaseOf = (s) => core.getSessionSnapshotForPlayer(aliveUuids(s)[0], s.id).snapshot.dayPhase;

// 낮 한 번 넘김: 투표로 가서 산 사람 전원 기권 → 판정 → 밤
function passDay(s) {
    gf.toVote(s);
    for (const uuid of aliveUuids(s)) assert.equal(core.submitDayVote(uuid, s.id, null).ok, true);
    const prepared = core.prepareDayVoteResolution(aliveUuids(s)[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `낮 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤 한 번: 광대가 victim을 죽임 → 다음 날 낮(토론)
function passNight(s, victim) {
    const joker = gf.firstOf(s, 'JOKER');
    const { committed } = gf.resolveNightDirect(s, { [joker]: victim });
    assert.equal(committed?.ok, true, '밤 판정 실패');
}

// 첫 낮 뒤 시민을 dead명 밤에 죽이고 그다음 날 토론으로 → { s, deadUuids }
function dayWithDead(t, id, n, dead) {
    const s = newGame(t, id, n);
    gf.toDay(s);
    const deadUuids = gf.nonJokers(s).slice(-dead);
    for (const victim of deadUuids) {
        passDay(s);
        passNight(s, victim);
    }
    return { s, deadUuids };
}

// ①~⑥ B-096~101: 인원 5~10, 산 사람 전원 준비 → 투표 단계
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const no = `A03-B-${String(96 + i).padStart(3, '0')}`;
    test(`${no} ${n}명 판 산 사람 전원 "투표하자" → 투표 단계`, (t) => {
        const s = newGame(t, `rd${96 + i}`, n);
        gf.toDay(s);
        for (const uuid of aliveUuids(s)) assert.equal(ready(s, uuid).ok, true);
        assert.equal(dayPhaseOf(s), 'DAY_VOTE');
    });
});

test('A03-B-102 ⑦ 산 사람 하나 모자람 → 토론 그대로', (t) => {
    const s = newGame(t, 'rd102', 6);
    gf.toDay(s);
    for (const uuid of aliveUuids(s).slice(0, -1)) assert.equal(ready(s, uuid).ok, true);
    assert.equal(dayPhaseOf(s), 'DAY_DISCUSSION');
});

test('A03-B-103 ⑧ 같은 사람이 두 번 누름 → 한 번만 셈', (t) => {
    const s = newGame(t, 'rd103', 5);
    gf.toDay(s);
    const uuids = aliveUuids(s);
    // 4명 누르고 그중 하나가 또 누름 → 두 번 세면 5가 되어 투표로 넘어감
    for (const uuid of uuids.slice(0, 4)) assert.equal(ready(s, uuid).ok, true);
    assert.equal(ready(s, uuids[0]).ok, true);
    assert.equal(dayPhaseOf(s), 'DAY_DISCUSSION');
    // 마지막 사람이 눌러야 넘어감
    assert.equal(ready(s, uuids[4]).ok, true);
    assert.equal(dayPhaseOf(s), 'DAY_VOTE');
});

test('A03-B-104 ⑨ 죽은 사람이 누름 → ACTOR_NOT_ALIVE, 셈에 안 들어감', (t) => {
    const { s, deadUuids } = dayWithDead(t, 'rd104', 6, 1);
    const alive = aliveUuids(s);
    assert.equal(alive.length, 5);
    const r = ready(s, deadUuids[0]);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ACTOR_NOT_ALIVE');
    // 산 사람 4명만 누름 → 죽은 사람이 세졌으면 5가 되어 넘어감
    for (const uuid of alive.slice(0, 4)) assert.equal(ready(s, uuid).ok, true);
    assert.equal(dayPhaseOf(s), 'DAY_DISCUSSION');
});

test('A03-B-105 ⑩ 7명 판 2명 죽음, 산 5명 다 누름 → 투표 단계', (t) => {
    const { s } = dayWithDead(t, 'rd105', 7, 2);
    const alive = aliveUuids(s);
    assert.equal(alive.length, 5);
    for (const uuid of alive) assert.equal(ready(s, uuid).ok, true);
    assert.equal(dayPhaseOf(s), 'DAY_VOTE');
});

test('A03-B-106 ⑪ 투표 단계에 누름 → INVALID_DAY_PHASE', (t) => {
    const s = newGame(t, 'rd106', 6);
    gf.toDay(s);
    gf.toVote(s);
    const r = ready(s, aliveUuids(s)[0]);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_DAY_PHASE');
});

test('A03-B-107 ⑫ 밤에 누름 → INVALID_PHASE', (t) => {
    const s = newGame(t, 'rd107', 6);
    gf.toDay(s);
    passDay(s);
    assert.equal(s.phase, 'NIGHT');
    const r = ready(s, aliveUuids(s)[0]);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_PHASE');
});

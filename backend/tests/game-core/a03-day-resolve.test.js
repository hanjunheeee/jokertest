'use strict';

// 낮 판정 뒤 다음 단계 시험 (판 규칙 순수) — 재판이면 같은 날 재판, 나머지는 같은 날 밤, 재투표는 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-108~120, 돌리기: node --test tests/game-core/a03-day-resolve.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (모델이 DB에 안 붙게)
const gf = require('../audit-2026-11-09/gameFixtures');

const { core } = gf;

// 판 차리기: 6명, 광대 1·나머지 시민으로 직업 고정 (밤에 광대만 움직여 날 넘기기 쉬움)
function newGame(t, id) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    return gf.startGame({ id, n: 6, roleCounts: { JOKER: 1 } });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
const snapOf = (s) => core.getSessionSnapshotForPlayer(aliveUuids(s)[0], s.id).snapshot;

// 표 내고 판정까지 (확정 성공 확인) → 판정 결과
function resolveWith(s, ballots) {
    for (const [voter, target] of ballots) assert.equal(core.submitDayVote(voter, s.id, target).ok, true);
    const prepared = core.prepareDayVoteResolution(aliveUuids(s)[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
    return prepared.resolution;
}

// 6명 판 결과 4가지 표 모양 (산 사람 앞에서부터 X·Y)
const OUTCOMES = {
    // 몰표: 나머지 전원 X, X는 Y
    TRIBUNAL: ([X, Y, ...rest]) => [[X, Y], [Y, X], ...rest.map((u) => [u, X])],
    // X 3·Y 3
    TIE: ([X, Y, a, b, c, d]) => [[X, Y], [Y, X], [a, X], [b, X], [c, Y], [d, Y]],
    // X 1·기권 5
    ABSTAIN_MAJORITY: ([X, Y, ...rest]) => [[X, null], [Y, X], ...rest.map((u) => [u, null])],
    // 전원 기권
    ABSTAINED: (uuids) => uuids.map((u) => [u, null]),
};

// 낮 한 번 그냥 넘기고(전원 기권) 밤엔 아무도 안 죽임 → 다음 날 낮
function passDayAndNight(s) {
    gf.toVote(s);
    resolveWith(s, OUTCOMES.ABSTAINED(aliveUuids(s)));
    const joker = gf.firstOf(s, 'JOKER');
    const { committed } = gf.resolveNightDirect(s, { [joker]: null });
    assert.equal(committed?.ok, true, '밤 판정 실패');
}

// B-108~119: 결과 4 × 1·2·3일째 (번호 = 결과 바깥, 날 안쪽: 108 = 재판 1일, 111 = 동점 1일)
Object.keys(OUTCOMES).forEach((outcome, i) => {
    [1, 2, 3].forEach((day, k) => {
        const no = `A03-B-${String(108 + i * 3 + k).padStart(3, '0')}`;
        const next = outcome === 'TRIBUNAL' ? 'TRIBUNAL' : 'NIGHT';
        test(`${no} ${day}일째 결과 ${outcome} → 같은 날 ${next === 'TRIBUNAL' ? '재판' : '밤'}`, (t) => {
            const s = newGame(t, `rs${108 + i * 3 + k}`);
            gf.toDay(s);
            for (let d = 1; d < day; d += 1) passDayAndNight(s);
            assert.equal(s.dayIndex, day);
            gf.toVote(s);
            const resolution = resolveWith(s, OUTCOMES[outcome](aliveUuids(s)));
            assert.equal(resolution.outcome, outcome);
            const snap = snapOf(s);
            assert.equal(snap.phase, next);
            // 날짜 안 바뀜
            assert.equal(snap.dayIndex, day);
        });
    });
});

test('A03-B-120 6명 판 동점 판정 → 같은 날 다시 투표 안 열리고 밤', (t) => {
    const s = newGame(t, 'rs120');
    gf.toDay(s);
    gf.toVote(s);
    const uuids = aliveUuids(s);
    const resolution = resolveWith(s, OUTCOMES.TIE(uuids));
    assert.equal(resolution.outcome, 'TIE');
    const snap = snapOf(s);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.dayIndex, 1);
    // 같은 날 낮 표를 다시 내도 안 받음 (재투표 없음)
    const again = core.submitDayVote(uuids[2], s.id, uuids[0]);
    assert.equal(again.ok, false);
});

'use strict';

// 낮 표 세기 시험 (판 규칙 순수) — 인원·표 모양마다 결과(재판·동점·기권 다수·전원 기권)와 피고를 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-001~071, 돌리기: node --test tests/game-core/a03-day-tally.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (모델이 DB에 안 붙게)
const gf = require('../audit-2026-11-09/gameFixtures');

const { core, T } = gf;

// 안 낸 표 표시 (기권 null과 구별)
const MISS = Symbol('안 냄');

// 판 차리기: 광대 1·나머지 시민으로 직업 고정 (밤에 광대만 움직여 날 넘기기 쉬움)
function newGame(t, id, n) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    return gf.startGame({ id, n, roleCounts: { JOKER: 1 } });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

// 표 모양 → 사람마다 낼 표 (자기 자신은 못 찍어서 짝을 맞춰 나눔)
// plan 예: { X: 3, Y: 1, ab: 3 } → [[투표자, 대상 | null | MISS], …]
function assignBallots(voters, cands, plan) {
    const pool = [];
    for (const [key, uuid] of Object.entries(cands)) {
        for (let i = 0; i < (plan[key] ?? 0); i += 1) pool.push(uuid);
    }
    for (let i = 0; i < (plan.ab ?? 0); i += 1) pool.push(null);
    for (let i = 0; i < (plan.miss ?? 0); i += 1) pool.push(MISS);
    if (pool.length !== voters.length) throw new Error(`표 수(${pool.length})와 산 사람 수(${voters.length})가 다름`);
    const out = [];
    const used = pool.map(() => false);
    const place = (i) => {
        if (i === voters.length) return true;
        for (let j = 0; j < pool.length; j += 1) {
            if (used[j] || pool[j] === voters[i]) continue;
            used[j] = true;
            out[i] = [voters[i], pool[j]];
            if (place(i + 1)) return true;
            used[j] = false;
        }
        return false;
    };
    if (!place(0)) throw new Error('자기 자신을 안 찍게 나눌 수 없음');
    return out;
}

// 후보 이름표: 산 사람 앞에서부터 X·Y·Z·W·V
const candidatesOf = (s) => {
    const [X, Y, Z, W, V] = aliveUuids(s);
    return { X, Y, Z, W, V };
};

// 표 모양대로 진짜로 냄 (안 냄은 건너뜀), 표마다 받았는지 확인
function castPlan(s, plan) {
    const cands = candidatesOf(s);
    for (const [voter, target] of assignBallots(aliveUuids(s), cands, plan)) {
        if (target === MISS) continue;
        const r = core.submitDayVote(voter, s.id, target);
        assert.equal(r.ok, true, `표 거절됨: ${r.code}`);
    }
    return cands;
}

// 낮 한 번 넘김: 투표로 가서 산 사람 전원 기권 → 판정 → 밤
function passDay(s) {
    gf.toVote(s);
    for (const uuid of aliveUuids(s)) assert.equal(core.submitDayVote(uuid, s.id, null).ok, true);
    const prepared = core.prepareDayVoteResolution(aliveUuids(s)[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `낮 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤 한 번: 광대가 victim을 죽임 → 다음 날 낮
function passNight(s, victim) {
    const joker = gf.firstOf(s, 'JOKER');
    const { committed } = gf.resolveNightDirect(s, { [joker]: victim });
    assert.equal(committed?.ok, true, '밤 판정 실패');
}

// 첫 낮 → 투표 단계
function dayVote(s) {
    gf.toDay(s);
    gf.toVote(s);
}

const SIZES = [5, 6, 7, 8, 9, 10];

// B-001~036: 인원 × 모양 ①~⑥ (번호 = 인원 순서 바깥, 모양 안쪽: 001 = 5명 ①, 007 = 6명 ①)
const BASIC_SHAPES = [
    {
        name: '① 몰표(나머지 전원 X, X는 Y) → 재판 X',
        plan: (n) => ({ X: n - 1, Y: 1 }),
        outcome: 'TRIBUNAL', defendant: 'X',
    },
    {
        name: '② 두 명 같은 최다·기권은 더 적음 → 동점, 피고 없음',
        plan: (n) => ({
            5: { X: 2, Y: 2, ab: 1 }, 6: { X: 3, Y: 3 }, 7: { X: 3, Y: 3, ab: 1 },
            8: { X: 3, Y: 3, ab: 2 }, 9: { X: 4, Y: 4, ab: 1 }, 10: { X: 4, Y: 4, ab: 2 },
        })[n],
        outcome: 'TIE', defendant: null,
    },
    {
        name: '③ 전원 기권 → 전원 기권',
        plan: (n) => ({ ab: n }),
        outcome: 'ABSTAINED', defendant: null,
    },
    {
        name: '④ 최다 = 기권 → 기권 다수, 밤',
        plan: (n) => ({
            5: { X: 2, Y: 1, ab: 2 }, 6: { X: 3, ab: 3 }, 7: { X: 3, Y: 1, ab: 3 },
            8: { X: 4, ab: 4 }, 9: { X: 4, Y: 1, ab: 4 }, 10: { X: 5, ab: 5 },
        })[n],
        outcome: 'ABSTAIN_MAJORITY', defendant: null,
    },
    {
        name: '⑤ 최다 = 기권+1 → 재판 X',
        plan: (n) => ({
            5: { X: 3, ab: 2 }, 6: { X: 3, Y: 1, ab: 2 }, 7: { X: 4, ab: 3 },
            8: { X: 4, Y: 1, ab: 3 }, 9: { X: 5, ab: 4 }, 10: { X: 5, Y: 1, ab: 4 },
        })[n],
        outcome: 'TRIBUNAL', defendant: 'X',
    },
    {
        name: '⑥ 최다 = 기권−1 → 기권 다수, 밤',
        plan: (n) => ({
            5: { X: 2, ab: 3 }, 6: { X: 2, Y: 1, ab: 3 }, 7: { X: 3, ab: 4 },
            8: { X: 3, Y: 1, ab: 4 }, 9: { X: 4, ab: 5 }, 10: { X: 4, Y: 1, ab: 5 },
        })[n],
        outcome: 'ABSTAIN_MAJORITY', defendant: null,
    },
];

const num = (k) => `A03-B-${String(k).padStart(3, '0')}`;

SIZES.forEach((n, i) => {
    BASIC_SHAPES.forEach((shape, k) => {
        const no = num(1 + i * BASIC_SHAPES.length + k);
        test(`${no} ${n}명 ${shape.name}`, (t) => {
            const s = newGame(t, `tl${no}`, n);
            dayVote(s);
            const cands = castPlan(s, shape.plan(n));
            const tally = T.tallyDayVoteOutcome(s);
            assert.equal(tally.outcome, shape.outcome);
            assert.equal(tally.tribunalTargetUuid, shape.defendant ? cands[shape.defendant] : null);
        });
    });
});

// B-037~048: 동점이면서 최다 ≥ 기권이 아님(= 또는 <) → 재판 없이 밤 (결과 값이 TIE인지 ABSTAIN_MAJORITY인지는 결정 대기라 안 가름)
const TIE_ABSTAIN = [
    {
        name: '동점 최다 = 기권',
        plan: {
            5: { X: 1, Y: 1, Z: 1, W: 1, ab: 1 }, 6: { X: 2, Y: 2, ab: 2 }, 7: { X: 2, Y: 2, Z: 1, ab: 2 },
            8: { X: 2, Y: 2, Z: 2, ab: 2 }, 9: { X: 3, Y: 3, ab: 3 }, 10: { X: 3, Y: 3, Z: 1, ab: 3 },
        },
    },
    {
        name: '동점 최다 < 기권',
        plan: {
            5: { X: 1, Y: 1, ab: 3 }, 6: { X: 1, Y: 1, ab: 4 }, 7: { X: 1, Y: 1, ab: 5 },
            8: { X: 2, Y: 2, ab: 4 }, 9: { X: 2, Y: 2, ab: 5 }, 10: { X: 3, Y: 3, ab: 4 },
        },
    },
];

SIZES.forEach((n, i) => {
    TIE_ABSTAIN.forEach((shape, k) => {
        const no = num(37 + i * 2 + k);
        test(`${no} ${n}명 ${shape.name} → 재판 없이 밤, 피고 없음`, (t) => {
            const s = newGame(t, `tl${no}`, n);
            dayVote(s);
            castPlan(s, shape.plan[n]);
            const prepared = core.prepareDayVoteResolution(aliveUuids(s)[0], s.id, s.dayIndex);
            assert.equal(prepared.ok, true, `판정 준비 실패: ${prepared.code}`);
            assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
            // 다음 단계는 화면이 받는 스냅샷 단계로 봄
            const snap = core.getSessionSnapshotForPlayer(aliveUuids(s)[0], s.id).snapshot;
            assert.equal(snap.phase, 'NIGHT');
            assert.equal(prepared.resolution.tribunalTargetUuid, null);
            assert.ok(['TIE', 'ABSTAIN_MAJORITY'].includes(prepared.resolution.outcome));
        });
    });
});

// B-049~053: 세 명 동점 (기권은 그보다 적음) → 동점, 피고 없음
const THREE_WAY = [
    [6, { X: 2, Y: 2, Z: 2 }],
    [7, { X: 2, Y: 2, Z: 2, ab: 1 }],
    [8, { X: 2, Y: 2, Z: 2, W: 1, ab: 1 }],
    [9, { X: 2, Y: 2, Z: 2, W: 1, V: 1, ab: 1 }],
    [10, { X: 3, Y: 3, Z: 3, ab: 1 }],
];

THREE_WAY.forEach(([n, plan], i) => {
    const no = num(49 + i);
    test(`${no} ${n}명 세 명 같은 최다 → 동점, 피고 없음`, (t) => {
        const s = newGame(t, `tl${no}`, n);
        dayVote(s);
        castPlan(s, plan);
        const tally = T.tallyDayVoteOutcome(s);
        assert.equal(tally.outcome, 'TIE');
        assert.equal(tally.tribunalTargetUuid, null);
    });
});

// B-054~065: 안 낸 표는 기권으로 셈 (직접 기권 0명), 번호 = 인원 바깥·(같음, +1) 안쪽
const MISSING = [
    {
        name: 'X 표 = 안 낸 수 → 기권 다수',
        plan: {
            5: { X: 2, Y: 1, miss: 2 }, 6: { X: 3, miss: 3 }, 7: { X: 3, Y: 1, miss: 3 },
            8: { X: 4, miss: 4 }, 9: { X: 4, Y: 1, miss: 4 }, 10: { X: 5, miss: 5 },
        },
        outcome: 'ABSTAIN_MAJORITY', defendant: null,
    },
    {
        name: 'X 표 = 안 낸 수+1 → 재판 X',
        plan: {
            5: { X: 3, miss: 2 }, 6: { X: 3, Y: 1, miss: 2 }, 7: { X: 4, miss: 3 },
            8: { X: 4, Y: 1, miss: 3 }, 9: { X: 5, miss: 4 }, 10: { X: 5, Y: 1, miss: 4 },
        },
        outcome: 'TRIBUNAL', defendant: 'X',
    },
];

SIZES.forEach((n, i) => {
    MISSING.forEach((shape, k) => {
        const no = num(54 + i * 2 + k);
        test(`${no} ${n}명 ${shape.name} (안 낸 표 = 기권)`, (t) => {
            const s = newGame(t, `tl${no}`, n);
            dayVote(s);
            const cands = castPlan(s, shape.plan[n]);
            const tally = T.tallyDayVoteOutcome(s);
            assert.equal(tally.outcome, shape.outcome);
            assert.equal(tally.tribunalTargetUuid, shape.defendant ? cands[shape.defendant] : null);
            // 안 낸 사람 수가 그대로 기권 수
            assert.equal(tally.publicAbstainCount, shape.plan[n].miss);
        });
    });
});

// B-066~071: 산 사람만 투표하는 사람으로 셈 (죽음은 밤에 광대가 진짜로 죽여 만듦)
const DEAD = [[6, 1], [7, 1], [7, 2], [8, 3], [9, 3], [10, 4]];

DEAD.forEach(([n, dead], i) => {
    const no = num(66 + i);
    test(`${no} ${n}명 판 ${dead}명 죽음, 산 사람 전원 X 몰표 → 재판 X, 산 사람 수 ${n - dead}·기권 0`, (t) => {
        const s = newGame(t, `tl${no}`, n);
        gf.toDay(s);
        // 시민 뒤에서부터 죽임 (광대는 남김 → 판 안 끝남)
        const victims = gf.nonJokers(s).slice(-dead);
        for (const victim of victims) {
            passDay(s);
            passNight(s, victim);
        }
        gf.toVote(s);
        assert.equal(aliveUuids(s).length, n - dead);
        const cands = castPlan(s, { X: n - dead - 1, Y: 1 });
        const tally = T.tallyDayVoteOutcome(s);
        assert.equal(tally.outcome, 'TRIBUNAL');
        assert.equal(tally.tribunalTargetUuid, cands.X);
        assert.equal(tally.publicVoteCount, n - dead);
        assert.equal(tally.publicAbstainCount, 0);
    });
});

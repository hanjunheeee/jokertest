'use strict';

// 낮 투표 다 차서 5초 뒤 판정한 결과가 표 세기와 같은지 서버 흐름 시험 (재판이면 재판 알림, 밤이면 밤 차례 시작)
// 목록 A03-낮투표.md 번호 A03-B-152~175, 256~258
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

const SIZES = [5, 6, 7, 8, 9, 10];

// 동점 모양 (B-001~036 ②): 인원 → [X 표, Y 표, 기권]
const TIE_SHAPES = { 5: [2, 2, 1], 6: [3, 3, 0], 7: [3, 3, 1], 8: [3, 3, 2], 9: [4, 4, 1], 10: [4, 4, 2] };

// 결과 4가지: 표 모양 만들기 + 기대 결과
const OUTCOMES = [
    {
        name: '몰표 → X 재판',
        spec: (n, X, Y) => ({ targets: [[X, n - 1], [Y, 1]] }),
        expect: (X) => ({ outcome: 'TRIBUNAL', tribunalTargetUuid: X }),
    },
    {
        name: '두 명 동점 → 동점·피고 없음',
        spec: (n, X, Y) => {
            const [x, y, a] = TIE_SHAPES[n];
            return { targets: [[X, x], [Y, y]], abstain: a };
        },
        expect: () => ({ outcome: 'TIE', tribunalTargetUuid: null }),
    },
    {
        name: '1표·나머지 기권 → 기권 다수·밤',
        spec: (n, X) => ({ targets: [[X, 1]], abstain: n - 1 }),
        expect: () => ({ outcome: 'ABSTAIN_MAJORITY', tribunalTargetUuid: null }),
    },
    {
        name: '전원 기권 → 전원 기권·밤',
        spec: (n) => ({ abstain: n }),
        expect: () => ({ outcome: 'ABSTAINED', tribunalTargetUuid: null }),
    },
];

// 다 내고 5초 넘김 → 판 전원의 판정 알림 (한 사람당 하나여야 함)
async function settleWith(g, spec) {
    const { votes } = H.allocate(g.alive(), spec);
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    return g.ids.map((uuid) => {
        const got = g.got(uuid, 'day_vote_resolved');
        assert.equal(got.length, 1, `${uuid}: 판정 알림 수`);
        return got[0];
    });
}

// A03-B-152~175 인원 5~10 × 결과 4
SIZES.forEach((n, si) => {
    OUTCOMES.forEach((kind, ki) => {
        const no = 152 + si * OUTCOMES.length + ki;
        test(`A03-B-${no} ${n}명 판: 다 차서 5초 뒤 판정 — ${kind.name}`, async (t) => {
            const g = H.setup(t, { id: `b${no}`, n });
            g.toVote();
            const [X, Y] = g.aliveNonJokers();
            const want = kind.expect(X);
            const resolved = await settleWith(g, kind.spec(n, X, Y));
            for (const payload of resolved) {
                assert.equal(payload.outcome, want.outcome);
                assert.equal(payload.tribunalTargetUuid, want.tribunalTargetUuid);
            }
            if (want.outcome === 'TRIBUNAL') {
                // 재판 단계 알림: 판정 알림이 재판 단계·재판 마감을 실음
                for (const payload of resolved) {
                    assert.equal(payload.phase, 'TRIBUNAL');
                    assert.equal(typeof payload.tribunalDeadline, 'number');
                }
            } else {
                for (const payload of resolved) assert.equal(payload.phase, 'NIGHT');
                assert.deepEqual(g.ids.filter((u) => g.got(u, 'night_turn_started').length === 0), [], '밤 차례 시작 못 받은 사람');
            }
        });
    });
});

// A03-B-256~258 표 낸 차례가 결과를 안 바꿈 (7명 판, 앞에서부터 낸 판과 뒤에서부터 낸 판 비교)
const ORDER_SHAPES = [
    { no: 256, name: 'X 3·Y 3·기권 1', spec: (X, Y) => ({ targets: [[X, 3], [Y, 3]], abstain: 1 }), want: { outcome: 'TIE', target: null } },
    { no: 257, name: 'X 4·기권 3', spec: (X) => ({ targets: [[X, 4]], abstain: 3 }), want: { outcome: 'TRIBUNAL', target: 'X' } },
    { no: 258, name: 'X 2·Y 2·Z 2·기권 1', spec: (X, Y, Z) => ({ targets: [[X, 2], [Y, 2], [Z, 2]], abstain: 1 }), want: { outcome: 'TIE', target: null } },
];

ORDER_SHAPES.forEach(({ no, name, spec, want }) => {
    test(`A03-B-${no} 7명 판: ${name}을 다른 차례로 내도 결과·피고 같음`, async (t) => {
        const results = [];
        for (const reverse of [false, true]) {
            // 같은 방 id라 두 판의 사람 uuid가 같음 → 결과를 그대로 비교
            const g = H.setup(t, { id: `b${no}`, n: 7 });
            g.toVote();
            const [X, Y, Z] = g.aliveNonJokers();
            const { votes } = H.allocate(g.alive(), spec(X, Y, Z));
            const ordered = reverse ? [...votes].reverse() : votes;
            for (const ack of await g.voteAll(ordered)) assert.equal(ack.ok, true);
            g.advance(5_000);
            const [payload] = g.got(g.ids[0], 'day_vote_resolved');
            results.push({ outcome: payload.outcome, target: payload.tribunalTargetUuid, X });
        }
        assert.equal(results[0].outcome, results[1].outcome);
        assert.equal(results[0].target, results[1].target);
        assert.equal(results[0].outcome, want.outcome);
        assert.equal(results[0].target, want.target === 'X' ? results[0].X : null);
    });
});

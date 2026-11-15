'use strict';

// 재판 판정 규칙 시험: 유죄가 무죄보다 많을 때만 처형, 기권은 어느 쪽에도 안 셈 (판정 준비가 돌려준 결과만 봄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-001~040
const test = require('node:test');
const assert = require('node:assert/strict');

const { gf, newGame, openTribunal, castCounts, prepare } = require('./a04-setup');

// 투표할 사람 v명(= v+1명 판)에서 유죄·무죄 수 주고 나머지 기권 → 판정 준비 결과
function judge(v, guilty, notGuilty) {
    const session = newGame({ n: v + 1 });
    const defendant = gf.nonJokers(session)[0];
    openTribunal(session, defendant);
    castCounts(session, guilty, notGuilty);
    const prepared = prepare(session);
    assert.equal(prepared.ok, true, `판정 준비 실패: ${prepared.code}`);
    return { defendant, resolution: prepared.resolution };
}

// 유죄면 처형할 사람 = 피고, 아니면 무죄·처형 없음
function expectOutcome({ defendant, resolution }, guiltyWins) {
    assert.equal(resolution.outcome, guiltyWins ? 'GUILTY' : 'NOT_GUILTY');
    assert.equal(resolution.executedUuid, guiltyWins ? defendant : null);
}

// 001~024: 투표할 사람 4~9명 × 네 가지 (유죄=무죄 / 유죄=무죄+1 / 무죄=유죄+1 / 전원 기권)
const PATTERNS = [
    { name: '유죄=무죄', counts: (v) => [Math.floor(v / 2), Math.floor(v / 2)], guiltyWins: false },
    { name: '유죄=무죄+1', counts: (v) => [Math.floor((v - 1) / 2) + 1, Math.floor((v - 1) / 2)], guiltyWins: true },
    { name: '무죄=유죄+1', counts: (v) => [Math.floor((v - 1) / 2), Math.floor((v - 1) / 2) + 1], guiltyWins: false },
    { name: '전원 기권', counts: () => [0, 0], guiltyWins: false },
];
let no = 0;
for (const v of [4, 5, 6, 7, 8, 9]) {
    for (const pattern of PATTERNS) {
        no += 1;
        const [guilty, notGuilty] = pattern.counts(v);
        const id = `A04-B-${String(no).padStart(3, '0')}`;
        test(`${id} 투표할 사람 ${v}명, ${pattern.name}(유죄 ${guilty}·무죄 ${notGuilty}·나머지 기권) → ${pattern.guiltyWins ? '유죄·피고 처형' : '무죄·처형 없음'}`, () => {
            expectOutcome(judge(v, guilty, notGuilty), pattern.guiltyWins);
        });
    }
}

// 025~030: 유죄 1표 + 나머지 기권 → 유죄 (기권은 무죄로 안 셈)
[4, 5, 6, 7, 8, 9].forEach((v, i) => {
    test(`A04-B-${String(25 + i).padStart(3, '0')} 투표할 사람 ${v}명, 유죄 1·나머지 기권 → 유죄·피고 처형`, () => {
        expectOutcome(judge(v, 1, 0), true);
    });
});

// 031~036: 무죄 1표 + 나머지 기권 → 무죄 (기권은 유죄로 안 셈)
[4, 5, 6, 7, 8, 9].forEach((v, i) => {
    test(`A04-B-${String(31 + i).padStart(3, '0')} 투표할 사람 ${v}명, 무죄 1·나머지 기권 → 무죄·처형 없음`, () => {
        expectOutcome(judge(v, 0, 1), false);
    });
});

// 037~040: 6명 판(투표할 사람 5명) 결과 칸 — 표 수 그대로, 유죄일 때만 처형된 사람 = 피고
[
    { guilty: 3, notGuilty: 2, guiltyWins: true },
    { guilty: 2, notGuilty: 3, guiltyWins: false },
    { guilty: 0, notGuilty: 0, guiltyWins: false },
    { guilty: 1, notGuilty: 1, guiltyWins: false },
].forEach(({ guilty, notGuilty, guiltyWins }, i) => {
    test(`A04-B-${String(37 + i).padStart(3, '0')} 6명 판 유죄 ${guilty}:무죄 ${notGuilty} → counts 그대로, 처형된 사람 ${guiltyWins ? '= 피고' : 'null'}`, () => {
        const judged = judge(5, guilty, notGuilty);
        assert.deepEqual({ ...judged.resolution.counts }, { guilty, notGuilty });
        expectOutcome(judged, guiltyWins);
    });
});

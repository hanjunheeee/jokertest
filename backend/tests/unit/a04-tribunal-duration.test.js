'use strict';

// 재판 길이 고르기 시험: 방 설정 재판 시간 → 없으면 낮 투표 시간 → 둘 다 없으면 60초
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-060~065
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const { resolveTribunalDurationMs } = require('../../socket/gameSession/phase/tribunal');

// 방 설정 칸을 준 7명 판의 재판 길이(ms)
let seq = 0;
function durationFor(settings) {
    seq += 1;
    const session = gf.startGame({ id: `a04u${seq}`, n: 7, roleCounts: { JOKER: 1 }, settings });
    return resolveTribunalDurationMs(session, {});
}

[
    { label: '재판 시간 15', settings: { tribunalTime: 15 }, seconds: 15 },
    { label: '재판 시간 120', settings: { tribunalTime: 120 }, seconds: 120 },
    { label: '재판 시간 45', settings: { tribunalTime: 45 }, seconds: 45 },
    { label: '재판 칸 없음 + 낮 투표 30', settings: { dayVoteTime: 30 }, seconds: 30 },
    { label: '재판 칸 없음 + 낮 투표 90', settings: { dayVoteTime: 90 }, seconds: 90 },
    { label: '둘 다 없음', settings: {}, seconds: 60 },
].forEach(({ label, settings, seconds }, i) => {
    test(`A04-B-${String(60 + i).padStart(3, '0')} 7명 판 ${label} → 재판 ${seconds}초`, () => {
        assert.equal(durationFor(settings), seconds * 1000);
    });
});

'use strict';

// 방 설정 토론·투표 시간대로 낮 마감이 오는지 서버 흐름 시험 (토론 30~150초, 투표 30~90초)
// 목록 A03-낮투표.md 번호 A03-B-199~206
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// A03-B-199~203 토론 시간 설정 (6명 판)
[30, 60, 90, 120, 150].forEach((sec, i) => {
    test(`A03-B-${199 + i} 6명 판 토론 ${sec}초 방: ${sec}초 뒤 투표 단계 알림`, (t) => {
        const g = H.setup(t, { id: `b${199 + i}`, n: 6, settings: { dayDiscussionTime: sec } });
        g.advance(sec * 1_000 - 1);
        assert.deepEqual(g.missing('day_phase_changed', 0), [], '마감 전 단계 바뀜');
        g.advance(1);
        for (const uuid of g.ids) {
            const got = g.got(uuid, 'day_phase_changed');
            assert.equal(got.length, 1);
            assert.equal(got[0].dayPhase, 'DAY_VOTE');
        }
    });
});

// A03-B-204~206 투표 시간 설정 (8명 판, 아무도 안 냄)
[30, 60, 90].forEach((sec, i) => {
    test(`A03-B-${204 + i} 8명 판 투표 ${sec}초 방: 아무도 안 내면 ${sec}초 뒤 전원 기권 판정`, (t) => {
        const g = H.setup(t, { id: `b${204 + i}`, n: 8, settings: { dayVoteTime: sec } });
        g.toVote();
        g.advance(sec * 1_000 - 1);
        assert.deepEqual(g.missing('day_vote_resolved', 0), [], '마감 전 판정');
        g.advance(1);
        for (const uuid of g.ids) {
            const got = g.got(uuid, 'day_vote_resolved');
            assert.equal(got.length, 1);
            assert.equal(got[0].outcome, 'ABSTAINED');
        }
    });
});

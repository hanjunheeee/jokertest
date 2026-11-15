'use strict';

// 결과 화면 닫힘 시각 시험 — 판 끝 시각 + 180초, 안 끝난 판은 없음, 판 끝 칸과 스냅샷 칸이 같은 시각 (시계 하나)
// 목록 A08-B-018~020 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --test tests/game-core/a08-result-close.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

test('A08-B-018 끝난 판 endedAt 1,000,000 → 닫힘 시각 1,180,000', () => {
    assert.equal(core.getResultClosesAt({ phase: 'ENDED', endedAt: 1_000_000 }), 1_180_000);
});

test('A08-B-019 낮 단계 판(5명) → 닫힘 시각 null', (t) => {
    gf.resetCore();
    t.after(() => gf.resetCore());
    const s = gf.toDay(gf.startGame({ id: 'a08-b019', n: 5 }));
    assert.equal(s.phase, 'DAY');
    assert.equal(core.getResultClosesAt(s), null);
});

test('A08-B-020 6명 판 재판으로 광대 처형해 끝냄 → 판 끝 칸·스냅샷 칸 resultClosesAt 같음(판 끝 + 180초)', (t) => {
    gf.resetCore();
    t.after(() => gf.resetCore());
    t.mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
    const s = gf.startGame({ id: 'a08-b020', n: 6 });
    const joker = gf.firstOf(s, 'JOKER');
    gf.toTribunal(s, joker);
    const voters = core.getTribunalVoterUuids(s, joker);
    for (const uuid of voters) assert.equal(core.submitTribunalVote(uuid, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(s.phase, 'ENDED', '판이 안 끝남 (준비 잘못)');

    const broadcast = core.buildTerminalFields(s).resultClosesAt;
    const viewer = gf.nonJokers(s)[0];
    const snap = core.getSessionSnapshotForPlayer(viewer, s.id);
    assert.equal(snap.ok, true, `스냅샷 실패: ${snap.code}`);
    assert.equal(broadcast, 5_180_000);
    assert.equal(snap.snapshot.resultClosesAt, broadcast);
});

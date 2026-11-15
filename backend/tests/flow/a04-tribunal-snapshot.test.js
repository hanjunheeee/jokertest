'use strict';

// 재판 스냅샷(새로고침·다시 붙음 때 받는 판 모습) 흐름 시험: 재판 칸·내 표 냈음 표시·밤엔 없음·남의 표 안 샘·판정 뒤 복귀
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-201~205, 217
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 피고(첫 시민) + 재판 진입
async function openWorld(t, spec) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = gf.nonJokers(w.session)[0];
    const enteredAt = await W.openTribunal(w, defendant);
    return { w, defendant, enteredAt };
}

test('A04-B-201 6명 판 재판 중 스냅샷 → phase TRIBUNAL·tribunal.defendantUuid·tribunalDeadline', async (t) => {
    const { w, defendant, enteredAt } = await openWorld(t, { id: 'a04q201', n: 6, settings: { tribunalTime: 60 } });
    const snap = await W.snapshot(w, w.uuids[0]);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(snap.tribunal.defendantUuid, defendant);
    assert.equal(snap.tribunalDeadline, enteredAt + 60_000);
});

test('A04-B-202 7명 판 낸 사람 스냅샷 → hasSubmittedTribunalVote true', async (t) => {
    const { w } = await openWorld(t, { id: 'a04q202', n: 7, settings: { tribunalTime: 60 } });
    const [voter] = W.tribunalVoters(w);
    assert.equal((await W.cast(w, voter, 'GUILTY')).ok, true);
    assert.equal((await W.snapshot(w, voter)).self.hasSubmittedTribunalVote, true);
});

test('A04-B-203 7명 판 안 낸 사람 스냅샷 → hasSubmittedTribunalVote false', async (t) => {
    const { w } = await openWorld(t, { id: 'a04q203', n: 7, settings: { tribunalTime: 60 } });
    const [voter, idle] = W.tribunalVoters(w);
    assert.equal((await W.cast(w, voter, 'GUILTY')).ok, true);
    assert.equal((await W.snapshot(w, idle)).self.hasSubmittedTribunalVote, false);
});

test('A04-B-204 5명 판 재판 끝 밤 스냅샷 → 재판 표 냈음 표시·재판 마감 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04q204', n: 5, settings: { tribunalTime: 60 } });
    const voters = W.tribunalVoters(w);
    for (const uuid of voters) assert.equal((await W.cast(w, uuid, 'NOT_GUILTY')).ok, true);
    w.tick(5_000);
    const snap = await W.snapshot(w, voters[0]);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(Object.hasOwn(snap.self, 'hasSubmittedTribunalVote'), false);
    assert.equal(Object.hasOwn(snap, 'tribunalDeadline'), false);
});

test('A04-B-205 8명 판 투표자 E 스냅샷 → 다른 사람이 무엇을 냈는지 칸 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04q205', n: 8, settings: { tribunalTime: 60 } });
    const voters = W.tribunalVoters(w);
    const e = voters.at(-1);
    for (const [i, uuid] of voters.slice(0, -1).entries()) {
        assert.equal((await W.cast(w, uuid, i % 2 === 0 ? 'GUILTY' : 'NOT_GUILTY')).ok, true);
    }
    const snap = await W.snapshot(w, e);
    assert.equal(snap.ok, true);
    const text = JSON.stringify(snap);
    assert.equal(text.includes('GUILTY'), false, '스냅샷에 표 값이 있음');
    assert.equal(/"votes"|"tribunalVote"/.test(text), false, '스냅샷에 표 칸이 있음');
});

test('A04-B-217 7명 판 판정 순간 끊긴 투표자가 다시 붙음 → 스냅샷 NIGHT·처형된 사람 죽음', async (t) => {
    const { w, defendant, enteredAt } = await openWorld(t, { id: 'a04q217', n: 7, settings: { tribunalTime: 30 } });
    const voters = W.tribunalVoters(w);
    const away = voters.find((u) => u !== gf.firstOf(w.session, 'JOKER'));
    await W.disconnect(w, away);
    for (const uuid of voters.filter((u) => u !== away)) assert.equal((await W.cast(w, uuid, 'GUILTY')).ok, true);
    // 끊긴 사람이 안 내 원래 마감에 판정 (그때 끊겨 있음)
    w.tick(enteredAt + 30_000 - Date.now());
    assert.equal(w.session.phase, 'NIGHT');
    const snap = await W.reconnect(w, away);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.players.find((p) => p.uuid === defendant).isAlive, false);
});

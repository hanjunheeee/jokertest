'use strict';

// 끊긴 사람이 재판 피고일 때 흐름 시험 — 재판 열림·유죄 처형·무죄면 기다림 이어짐·재판 중 60초면 취소·다시 붙음·스스로 나가면 취소+탈주
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-210~217, 329, 돌리기: node --env-file=.env.test --test tests/flow/a09-defendant.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

const { core } = H;

// 재판 열고 피고 끊음, 끊긴 시각 돌려줌
async function openAndDisconnect(w, defendant) {
    await w.toTribunal(defendant);
    const at = w.now();
    await w.disconnect(defendant);
    return at;
}

// 판 끝 기록의 그 사람 죽은 이유
const deathReason = (w, uuid) => core.buildGameResultRecord(w.session, { completed: false }).players.find((p) => p.user_id === uuid).death_reason;

test('A09-B-210 7명 판 끊긴 C가 최다 득표 → 재판 단계, 피고 = C', async (t) => {
    const w = H.setup(t, { id: 'a09df210', n: 7 });
    w.toVote();
    const c = w.nonJokers()[0];
    await w.disconnect(c);
    await w.voteAll(() => c, { skip: [c] });
    w.advanceUntil(() => w.session.phase !== 'DAY');
    assert.equal(w.session.phase, 'TRIBUNAL');
    const watcher = w.firstOf('JOKER');
    assert.equal(w.got(watcher, 'day_vote_resolved').at(-1).tribunalTargetUuid, c);
    assert.equal((await w.snapshot(watcher)).tribunal.defendantUuid, c);
});

test('A09-B-211 6명 판 끊긴 피고 유죄 → 죽은 이유 EXECUTION (끊김 사망 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09df211', n: 6 });
    const d = w.nonJokers()[0];
    await openAndDisconnect(w, d);
    await w.castAll('GUILTY');
    w.advanceUntil(() => w.session.phase !== 'TRIBUNAL');
    assert.equal(w.got(w.firstOf('JOKER'), 'tribunal_vote_resolved').at(-1).executedUuid, d);
    assert.equal(deathReason(w, d), 'EXECUTION');
});

test('A09-B-212 8명 판 끊긴 피고 무죄 → 밤, 피고는 산 채·끊긴 채, 끊긴 때부터 60초에 탈락', async (t) => {
    const w = H.setup(t, { id: 'a09df212', n: 8 });
    const d = w.nonJokers()[0];
    const at = await openAndDisconnect(w, d);
    await w.castAll('NOT_GUILTY');
    w.advanceUntil(() => w.session.phase !== 'TRIBUNAL');
    assert.equal(w.session.phase, 'NIGHT');
    const watcher = w.firstOf('JOKER');
    const snap = await w.snapshot(watcher);
    const row = snap.players.find((p) => p.uuid === d);
    assert.deepEqual({ isAlive: row.isAlive, isConnected: row.isConnected }, { isAlive: true, isConnected: false });
    w.advanceTo(at + 59_999);
    assert.equal(w.got(watcher, 'player_eliminated').length, 0);
    w.advance(1);
    assert.equal(w.got(watcher, 'player_eliminated').at(-1)?.victimUuid, d);
});

test('A09-B-213 6명 판 재판 중 피고 60초 → 판 전원 tribunal_vote_resolved 취소 + 밤, 처형 없음', async (t) => {
    const w = H.setup(t, { id: 'a09df213', n: 6, settings: { tribunalTime: 120 } });
    const d = w.nonJokers()[0];
    const at = await openAndDisconnect(w, d);
    w.advanceTo(at + 60_000);
    for (const u of w.others(d)) {
        const resolved = w.got(u, 'tribunal_vote_resolved').at(-1);
        assert.equal(resolved?.outcome, 'CANCELLED', u);
        assert.equal(resolved.phase, 'NIGHT');
        assert.equal(resolved.executedUuid, null);
    }
    assert.equal(deathReason(w, d), 'DISCONNECT');
});

test('A09-B-214 10명 판 재판 중 피고가 다시 붙음 → 스냅샷 TRIBUNAL·피고 = 나, 재판 그대로', async (t) => {
    const w = H.setup(t, { id: 'a09df214', n: 10, settings: { tribunalTime: 120 } });
    const d = w.nonJokers()[0];
    const at = await openAndDisconnect(w, d);
    w.advanceTo(at + 30_000);
    const snap = await w.reconnect(d);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(snap.tribunal.defendantUuid, d);
    w.advanceTo(at + 61_000);
    assert.equal(w.session.phase, 'TRIBUNAL');
    assert.equal(w.got(w.firstOf('JOKER'), 'tribunal_vote_resolved').length, 0);
});

test('A09-B-215 5명 판 재판 중 산 피고가 스스로 나감 → 재판 취소·밤, 피고 방 만들기 → DESERTION_COOLDOWN', async (t) => {
    const w = H.setup(t, { id: 'a09df215', n: 5 });
    const d = w.nonJokers()[0];
    await w.toTribunal(d);
    assert.equal((await w.leave(d)).ok, true);
    const resolved = w.got(w.firstOf('JOKER'), 'tribunal_vote_resolved').at(-1);
    assert.equal(resolved?.outcome, 'CANCELLED');
    assert.equal(resolved.phase, 'NIGHT');
    const room = await w.createRoom(d);
    assert.equal(room.code, 'DESERTION_COOLDOWN');
});

test('A09-B-216 7명 판 재판 중 광대 피고 60초 → 시민 승, 재판 판정 없이 끝', async (t) => {
    const w = H.setup(t, { id: 'a09df216', n: 7, settings: { tribunalTime: 120 } });
    const joker = w.firstOf('JOKER');
    const at = await openAndDisconnect(w, joker);
    w.advanceTo(at + 60_000);
    const watcher = w.nonJokers()[0];
    assert.equal(w.got(watcher, 'player_eliminated').at(-1)?.winResult?.winner, 'CITIZEN');
    assert.equal(w.session.phase, 'ENDED');
    assert.equal(w.got(watcher, 'tribunal_vote_resolved').length, 0);
});

test('A09-B-217 8명 판 끊긴 피고 유죄 처형 → 그 사람 방 만들기 바로 됨 (탈주 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09df217', n: 8 });
    const d = w.nonJokers()[0];
    await openAndDisconnect(w, d);
    await w.castAll('GUILTY');
    w.advanceUntil(() => w.session.phase !== 'TRIBUNAL');
    assert.equal(w.isAlive(d), false);
    w.attachSocket(d);
    const room = await w.createRoom(d);
    assert.equal(room.ok, true, `방 만들기 거절: ${room.code}`);
});

test('A09-B-329 6명 판 끊긴 피고 무죄 → 밤 차례 중 60초 → 탈락 (재판은 이미 끝나 취소 아님)', async (t) => {
    // 밤 차례를 길게 (60초 탈락이 밤 차례 안에 오게)
    const w = H.setup(t, { id: 'a09df329', n: 6, settings: { nightActionTime: 120 } });
    const d = w.nonJokers()[0];
    const at = await openAndDisconnect(w, d);
    await w.castAll('NOT_GUILTY');
    w.advanceUntil(() => w.session.phase !== 'TRIBUNAL');
    const watcher = w.firstOf('JOKER');
    assert.equal(w.got(watcher, 'tribunal_vote_resolved').length, 1);
    w.advanceTo(at + 60_000);
    assert.equal(w.session.phase, 'NIGHT');
    assert.equal(w.got(watcher, 'player_eliminated').at(-1)?.victimUuid, d);
    const resolvedList = w.got(watcher, 'tribunal_vote_resolved');
    assert.equal(resolvedList.length, 1);
    assert.equal(resolvedList[0].outcome, 'NOT_GUILTY');
});

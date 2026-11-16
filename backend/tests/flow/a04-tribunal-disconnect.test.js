'use strict';

// 재판 중 끊김·나가기 흐름 시험: 끊긴 투표자 기권·59초 복귀·61초 탈락, 끊긴 피고(뽑힐 때 끊겨 있으면 재판 없음·재판 중 60초면 피고 사망), 피고·투표자·방장 나감 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-175~190, 229, 231~232
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 재판 진입 (피고 고르는 함수 받음, 없으면 첫 시민)
async function openWorld(t, spec, pickDefendant = (s) => gf.nonJokers(s)[0]) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = pickDefendant(w.session);
    const enteredAt = await W.openTribunal(w, defendant);
    return { w, defendant, enteredAt };
}

// 여러 사람이 같은 표
async function castEach(w, uuids, vote) {
    for (const uuid of uuids) assert.equal((await W.cast(w, uuid, vote)).ok, true, `재판 표 실패(${uuid})`);
}

// 광대 아닌 투표자 (나가거나 끊겨도 승부가 안 나게)
const citizenVoters = (w) => W.tribunalVoters(w).filter((u) => u !== gf.firstOf(w.session, 'JOKER'));

test('A04-B-175 7명 판 재판 중 끊긴 C가 60초 안, 재판 마감 옴 → C 기권, 낸 표만 셈', async (t) => {
    const { w, enteredAt } = await openWorld(t, { id: 'a04x175', n: 7, settings: { tribunalTime: 30 } });
    const [c] = citizenVoters(w);
    await W.disconnect(w, c);
    const rest = W.tribunalVoters(w).filter((u) => u !== c);
    await castEach(w, rest.slice(0, 3), 'GUILTY');
    await castEach(w, rest.slice(3), 'NOT_GUILTY');
    w.tick(enteredAt + 30_000 - Date.now());
    // 표 수는 알림에 안 실림 → 결과로 봄 (끊긴 C를 무죄로 셌다면 3:3 무죄)
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.outcome, 'GUILTY');
});

test('A04-B-176 8명 판 재판 120초, 끊긴 지 59초에 다시 붙어 유죄 → 받음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04x176', n: 8, settings: { tribunalTime: 120 } });
    const [c] = citizenVoters(w);
    await W.disconnect(w, c);
    w.tick(59_000);
    assert.equal((await W.reconnect(w, c)).ok, true);
    const reply = await W.cast(w, c, 'GUILTY');
    assert.equal(reply.ok, true, `거절: ${reply.code}`);
});

test('A04-B-177 6명 판 재판 120초, 끊긴 투표자 61초 → player_eliminated, 투표할 사람에서 빠짐, 남은 사람 다 냈으면 그때 5초 당김', async (t) => {
    const { w } = await openWorld(t, { id: 'a04x177', n: 6, settings: { tribunalTime: 120 } });
    const [c] = citizenVoters(w);
    const disconnectedAt = Date.now();
    await W.disconnect(w, c);
    await castEach(w, W.tribunalVoters(w).filter((u) => u !== c), 'GUILTY');
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.tribunalSettles(w, watcher).length, 0);
    w.tick(59_000);
    assert.equal(W.countFor(w, watcher, 'player_eliminated'), 0);
    // 1초씩 넘김 (가짜 시계는 한 번 넘긴 끝 시각으로 타이머를 부름 → 60초 타이머가 60초 시각에 돌게)
    w.tick(1_000);
    w.tick(1_000);
    const [eliminated] = w.received(watcher, 'player_eliminated');
    assert.ok(eliminated, '61초에 탈락 알림 없음');
    assert.equal(W.tribunalVoters(w).includes(c), false);
    // 탈락 순간(끊긴 때 + 60초)에 다 찬 것으로 5초 당김
    assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, disconnectedAt + 60_000 + 5_000);
});

test('A04-B-178 5명 판 끊겼다 다시 붙은 투표자 스냅샷 → phase TRIBUNAL·같은 피고·tribunalDeadline', async (t) => {
    const { w, defendant, enteredAt } = await openWorld(t, { id: 'a04x178', n: 5, settings: { tribunalTime: 60 } });
    const [c] = citizenVoters(w);
    await W.disconnect(w, c);
    w.tick(10_000);
    const snap = await W.reconnect(w, c);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(snap.tribunal.defendantUuid, defendant);
    assert.equal(snap.tribunalDeadline, enteredAt + 60_000);
});

test('A04-B-179 6명 판 끊긴 사람이 낮 투표 최다 득표 → 재판 안 열림(DEFENDANT_DISCONNECTED), 밤, 그 사람은 산 채', async (t) => {
    const w = W.toFirstDay(W.setupWorld(t, { id: 'a04x179', n: 6, settings: { tribunalTime: 60 } }));
    const x = gf.nonJokers(w.session)[0];
    W.startDayVote(w);
    await W.disconnect(w, x);
    for (const uuid of w.uuids.filter((u) => u !== x)) assert.equal((await W.dayVote(w, uuid, x)).ok, true);
    // 끊긴 X가 안 내 다 찬 게 아님 → 낮 투표 마감(30초)에 판정
    w.tick(30_000);
    const watcher = gf.firstOf(w.session, 'JOKER');
    const resolved = w.received(watcher, 'day_vote_resolved').at(-1).payload;
    assert.equal(resolved.outcome, 'DEFENDANT_DISCONNECTED');
    assert.equal(resolved.phase, 'NIGHT');
    // 재판이 안 열리면 누가 뽑혔는지는 안 알림 (동률 때와 같음)
    assert.equal(resolved.tribunalTargetUuid, null);
    assert.equal(Object.values(resolved).includes(x), false);
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
    assert.ok(W.countFor(w, watcher, 'night_turn_started') >= 1, '밤 차례가 안 열림');
    // 새로고침해도 밤·재판 없음·X는 산 채·왜 재판이 안 열렸는지가 보임
    const snap = await W.snapshot(w, watcher);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.tribunal, undefined);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
    assert.equal(snap.dayVoteResolution?.outcome, 'DEFENDANT_DISCONNECTED');
});

test('A04-B-231 7명 판 끊겼다 다시 붙은 사람이 최다 득표 → 재판 열림 (뽑히는 순간 붙어 있음)', async (t) => {
    const w = W.toFirstDay(W.setupWorld(t, { id: 'a04x231', n: 7, settings: { tribunalTime: 60 } }));
    const x = gf.nonJokers(w.session)[0];
    W.startDayVote(w);
    await W.disconnect(w, x);
    w.tick(10_000);
    assert.equal((await W.reconnect(w, x)).ok, true);
    for (const uuid of w.uuids.filter((u) => u !== x)) assert.equal((await W.dayVote(w, uuid, x)).ok, true);
    w.tick(30_000);
    const resolved = w.received(gf.firstOf(w.session, 'JOKER'), 'day_vote_resolved').at(-1).payload;
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.phase, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, x);
});

test('A04-B-232 8명 판 끊긴 사람이 뽑혀 재판 없이 밤 → 끊긴 때부터 60초에 탈락 (기다림 그대로)', async (t) => {
    const w = W.toFirstDay(W.setupWorld(t, { id: 'a04x232', n: 8, settings: { tribunalTime: 60, nightActionTime: 120 } }));
    const x = gf.nonJokers(w.session)[0];
    W.startDayVote(w);
    const disconnectedAt = Date.now();
    await W.disconnect(w, x);
    for (const uuid of w.uuids.filter((u) => u !== x)) assert.equal((await W.dayVote(w, uuid, x)).ok, true);
    w.tick(30_000);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(w.received(watcher, 'day_vote_resolved').at(-1).payload.phase, 'NIGHT');
    w.tick(disconnectedAt + 59_000 - Date.now());
    assert.equal(W.countFor(w, watcher, 'player_eliminated'), 0);
    w.tick(1_000);
    w.tick(1_000);
    assert.equal(w.received(watcher, 'player_eliminated').at(-1)?.payload.victimUuid, x);
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
});

test('A04-B-180 7명 판 끊긴 피고 60초 안 유죄 → 처형(EXECUTION)', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x180', n: 7, settings: { tribunalTime: 60 } });
    await W.disconnect(w, defendant);
    await castEach(w, W.tribunalVoters(w), 'GUILTY');
    w.tick(5_000);
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.outcome, 'GUILTY');
    assert.equal(resolved.executedUuid, defendant);
    const row = gf.core.buildGameResultRecord(w.session, { completed: false }).players.find((p) => p.user_id === defendant);
    assert.equal(row.death_reason, 'EXECUTION');
});

test('A04-B-181 8명 판 끊긴 피고 무죄 → 밤, 끊김 기다림 계속 (60초에 탈락)', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x181', n: 8, settings: { tribunalTime: 60 } });
    const disconnectedAt = Date.now();
    await W.disconnect(w, defendant);
    await castEach(w, W.tribunalVoters(w), 'NOT_GUILTY');
    w.tick(5_000);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.lastResolved(w, watcher).phase, 'NIGHT');
    w.tick(disconnectedAt + 59_000 - Date.now());
    assert.equal(W.countFor(w, watcher, 'player_eliminated'), 0);
    w.tick(2_000);
    const eliminated = w.received(watcher, 'player_eliminated');
    assert.equal(eliminated.length, 1);
    assert.equal(eliminated[0].payload.victimUuid, defendant);
});

test('A04-B-182 6명 판 재판 중 끊긴 피고 60초 지남 → 취소가 아니라 피고 사망(DEFENDANT_DIED)·밤·player_eliminated', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x182', n: 6, settings: { tribunalTime: 120 } });
    await W.disconnect(w, defendant);
    w.tick(60_000);
    const watcher = gf.firstOf(w.session, 'JOKER');
    const resolved = W.lastResolved(w, watcher);
    assert.equal(resolved?.outcome, 'DEFENDANT_DIED');
    assert.equal(Object.hasOwn(resolved, 'reason'), false);
    assert.equal(resolved.defendantUuid, defendant);
    assert.equal(resolved.executedUuid, null);
    assert.equal(resolved.phase, 'NIGHT');
    assert.equal(W.countFor(w, watcher, 'player_eliminated'), 1);
    assert.equal((await W.snapshot(w, watcher)).players.find((p) => p.uuid === defendant).isAlive, false);
    const row = gf.core.buildGameResultRecord(w.session, { completed: false }).players.find((p) => p.user_id === defendant);
    assert.equal(row.death_reason, 'DISCONNECT');
});

test('A04-B-183 7명 판 끊긴 피고가 59초에 다시 붙음 → 재판 그대로', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x183', n: 7, settings: { tribunalTime: 120 } });
    await W.disconnect(w, defendant);
    w.tick(59_000);
    assert.equal((await W.reconnect(w, defendant)).ok, true);
    w.tick(2_000);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
    assert.equal(W.countFor(w, watcher, 'player_eliminated'), 0);
    assert.equal(w.session.phase, 'TRIBUNAL');
    assert.equal((await W.cast(w, watcher, 'GUILTY')).ok, true);
});

test('A04-B-184 5명 판 끊긴 피고가 마지막 광대, 재판 중 탈락 → 판 끝, 취소 알림 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04x184', n: 5, settings: { tribunalTime: 120 } }, (s) => gf.firstOf(s, 'JOKER'));
    await W.disconnect(w, gf.firstOf(w.session, 'JOKER'));
    w.tick(60_000);
    for (const uuid of gf.nonJokers(w.session)) {
        const [eliminated] = w.received(uuid, 'player_eliminated');
        assert.equal(eliminated?.payload.winResult?.winner, 'CITIZEN');
        assert.equal(W.countFor(w, uuid, 'tribunal_vote_resolved'), 0);
    }
});

// 스스로 나간 피고도 피고 사망으로 닫음 (사용자 결정 2026-11-16 낮, 끊겨 60초 탈락한 피고와 같게)
test('A04-B-185 6명 판 피고가 leave_game_session → 판 전원 tribunal_vote_resolved DEFENDANT_DIED, 밤', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x185', n: 6, settings: { tribunalTime: 60 } });
    assert.equal((await W.leave(w, defendant)).ok, true);
    for (const uuid of w.uuids.filter((u) => u !== defendant)) {
        const resolved = W.lastResolved(w, uuid);
        assert.equal(resolved?.outcome, 'DEFENDANT_DIED', `${uuid} 피고 사망 알림`);
        assert.equal(resolved.phase, 'NIGHT');
    }
});

test('A04-B-186 8명 판 유죄 2·무죄 1 들어온 뒤 피고 나감 → 피고 사망 알림에 표 수 칸 없음, 처형 없음', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x186', n: 8, settings: { tribunalTime: 60 } });
    const list = W.tribunalVoters(w);
    await castEach(w, list.slice(0, 2), 'GUILTY');
    await castEach(w, list.slice(2, 3), 'NOT_GUILTY');
    assert.equal((await W.leave(w, defendant)).ok, true);
    // 유죄가 더 많았어도 피고가 나가면 처형 없음, 그때까지 표 수도 안 알림 (사용자 결정 2026-11-16)
    const resolved = W.lastResolved(w, list[0]);
    assert.equal(resolved.outcome, 'DEFENDANT_DIED');
    assert.equal(resolved.executedUuid, null);
    assert.equal(Object.hasOwn(resolved, 'counts'), false);
});

test('A04-B-187 5명 판 피고 나간 뒤 표 → INVALID_PHASE', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x187', n: 5, settings: { tribunalTime: 60 } });
    const [voter] = W.tribunalVoters(w);
    assert.equal((await W.leave(w, defendant)).ok, true);
    const reply = await W.cast(w, voter, 'GUILTY');
    assert.equal(reply.code, 'INVALID_PHASE');
});

test('A04-B-188 7명 판 유죄 낸 D 나감 → 남은 표 유죄 2·무죄 2 → 무죄 (D 표가 남았다면 3:2 유죄)', async (t) => {
    const { w, enteredAt } = await openWorld(t, { id: 'a04x188', n: 7, settings: { tribunalTime: 60 } });
    const [d] = citizenVoters(w);
    assert.equal((await W.cast(w, d, 'GUILTY')).ok, true);
    assert.equal((await W.leave(w, d)).ok, true);
    const rest = W.tribunalVoters(w);
    assert.equal(rest.length, 5);
    // 한 명은 안 냄 → 재판 마감(60초)에 판정
    await castEach(w, rest.slice(0, 2), 'GUILTY');
    await castEach(w, rest.slice(2, 4), 'NOT_GUILTY');
    w.tick(enteredAt + 60_000 - Date.now());
    const resolved = W.lastResolved(w, rest[0]);
    assert.equal(resolved.outcome, 'NOT_GUILTY');
    assert.equal(resolved.executedUuid, null);
});

test('A04-B-189 5명 판 광대 2, 시민 투표자 1명 나감 → 산 광대 2 ≥ 나머지 2 → 판 끝, 재판 판정 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04x189', n: 5, roleCounts: { JOKER: 2 }, settings: { tribunalTime: 60 } });
    const leaver = W.tribunalVoters(w).find((u) => w.session.players.get(u).role !== 'JOKER');
    assert.equal((await W.leave(w, leaver)).ok, true);
    const watcher = gf.firstOf(w.session, 'JOKER');
    const [eliminated] = w.received(watcher, 'player_eliminated');
    assert.equal(eliminated?.payload.winResult?.winner, 'JOKER');
    assert.equal(w.session.phase, 'ENDED');
    w.tick(60_000);
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
});

test('A04-B-190 6명 판 재판 중 방장(피고 아님) 나감 → 방장만 다음 사람, 재판 마감·표 그대로', async (t) => {
    const host = 'a04x190-3';
    const { w, enteredAt } = await openWorld(
        t, { id: 'a04x190', n: 6, settings: { tribunalTime: 60 }, extra: { hostUuid: host } },
        (s) => gf.nonJokers(s).find((u) => u !== host),
    );
    const voters = W.tribunalVoters(w).filter((u) => u !== host);
    await castEach(w, voters.slice(0, 2), 'GUILTY');
    assert.equal((await W.leave(w, host)).ok, true);
    const watcher = voters[0];
    const changed = w.received(watcher, 'session_participation_changed').at(-1)?.payload;
    assert.ok(changed, '참여 변경 알림 없음');
    assert.notEqual(changed.hostUuid, host);
    assert.ok(w.uuids.includes(changed.hostUuid) && changed.hostUuid !== null);
    const snap = await W.snapshot(w, watcher);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(snap.tribunalDeadline, enteredAt + 60_000);
    assert.equal(snap.progress.doneCount, 2);
});

test('A04-B-229 6명 판 끊긴 피고 처형 → 처음 끊긴 때부터 61초 지나도 player_eliminated 0번', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04x229', n: 6, settings: { tribunalTime: 60 } });
    const disconnectedAt = Date.now();
    await W.disconnect(w, defendant);
    await castEach(w, W.tribunalVoters(w), 'GUILTY');
    w.tick(5_000);
    assert.equal(W.lastResolved(w, gf.firstOf(w.session, 'JOKER')).executedUuid, defendant);
    w.tick(disconnectedAt + 61_000 - Date.now());
    for (const uuid of w.uuids.filter((u) => u !== defendant)) assert.equal(W.countFor(w, uuid, 'player_eliminated'), 0);
});

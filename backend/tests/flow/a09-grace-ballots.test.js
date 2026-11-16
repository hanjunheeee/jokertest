'use strict';

// 끊김 기다리는 동안 표·밤 차례 흐름 시험 — 안 낸 것은 마감에 기권·건너뜀, 끊긴 사람이 안 냈으면 "다 냄" 아님, 끊기기 전 낸 것은 그대로
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-162~177, 돌리기: node --env-file=.env.test --test tests/flow/a09-grace-ballots.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

// 그 사람이 받은 마감 당김 알림 (단계 이름으로 거름)
const settles = (w, uuid, phase) => w.got(uuid, 'phase_settle_started').filter((p) => p.phase === phase);

test('A09-B-162 6명 판 낮 투표 중 끊긴 사람이 안 냄 → 마감에 기권으로 셈', async (t) => {
    const w = H.setup(t, { id: 'a09gb162', n: 6 });
    w.toVote();
    const [x, d] = w.nonJokers();
    await w.disconnect(x);
    await w.voteAll((u) => (u === d ? null : d), { skip: [x] });
    w.advanceUntil(() => w.got(d, 'day_vote_resolved').length > 0);
    const resolved = w.got(d, 'day_vote_resolved').at(-1);
    // D 4표, 기권 = D 자신 + 끊긴 X
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 2);
    assert.equal(resolved.tribunalTargetUuid, d);
});

test('A09-B-163 7명 판 재판 중 끊긴 투표자가 안 냄 → 마감에 기권 (유죄·무죄 어디에도 안 셈)', async (t) => {
    const w = H.setup(t, { id: 'a09gb163', n: 7 });
    const [x, d] = w.nonJokers();
    await w.toTribunal(d);
    await w.disconnect(x);
    // 붙어 있는 5명: 유죄 3·무죄 2 (표 수는 알림에 안 실림 → 결과로 봄, 끊긴 X를 무죄로 셌다면 3:3 무죄)
    const voters = w.others(d).filter((u) => u !== x);
    assert.equal(voters.length, 5);
    for (const [i, u] of voters.entries()) assert.equal((await w.cast(u, i < 3 ? 'GUILTY' : 'NOT_GUILTY')).ok, true);
    w.advanceUntil(() => w.got(d, 'tribunal_vote_resolved').length > 0);
    const resolved = w.got(d, 'tribunal_vote_resolved').at(-1);
    assert.equal(resolved.outcome, 'GUILTY');
    assert.equal(resolved.executedUuid, d);
});

test('A09-B-164 8명 판 끊긴 광대가 안 고름 → 차례 건너뜀·암살 없음', async (t) => {
    const w = H.setup(t, { id: 'a09gb164', n: 8 });
    w.toDay();
    await w.toNight();
    const joker = w.firstOf('JOKER');
    await w.disconnect(joker);
    await w.quickNight();
    const watcher = w.nonJokers()[0];
    assert.equal(w.got(watcher, 'night_result_applied').at(-1).victimUuid, null);
    assert.equal(w.alive().length, 8);
});

test('A09-B-165 6명 판 끊긴 의사가 안 고름 → 보호 없음 (광대가 고른 사람 죽음)', async (t) => {
    const w = H.setup(t, { id: 'a09gb165', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    const victim = w.byRole('CITIZEN')[0];
    await w.disconnect(w.firstOf('DOCTOR'));
    await w.quickNight({ [w.firstOf('JOKER')]: victim });
    assert.equal(w.got(w.firstOf('JOKER'), 'night_result_applied').at(-1).victimUuid, victim);
});

test('A09-B-166 8명 판 끊긴 경비원이 안 고름 → 조사 없음 (붙어도 지난밤 결과 없음)', async (t) => {
    const w = H.setup(t, { id: 'a09gb166', n: 8, roleCounts: { JOKER: 1, GUARD: 1 } });
    w.toDay();
    await w.toNight();
    const guard = w.firstOf('GUARD');
    await w.disconnect(guard);
    await w.quickNight();
    assert.equal(w.session.phase, 'DAY');
    const snap = await w.reconnect(guard);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.self.nightActionResult, undefined);
});

test('A09-B-167 10명 판 둘째 밤 끊긴 마녀사냥꾼이 안 고름 → 확인 없음 (붙어도 지난밤 결과 없음)', async (t) => {
    const w = H.setup(t, { id: 'a09gb167', n: 10, roleCounts: { JOKER: 2, WITCH_HUNTER: 1 } });
    w.toDay();
    await w.toNight();
    const victim = w.byRole('CITIZEN')[0];
    await w.quickNight(Object.fromEntries(w.byRole('JOKER').map((j) => [j, victim])));
    await w.toNight();
    const hunter = w.firstOf('WITCH_HUNTER');
    await w.untilTurn('WITCH_HUNTER');
    await w.disconnect(hunter);
    await w.quickNight();
    assert.equal(w.session.phase, 'DAY');
    const snap = await w.reconnect(hunter);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.self.nightActionResult, undefined);
});

test('A09-B-168 7명 판 낮 투표: 끊긴 1명 빼고 6명 다 냄 → 5초 당김 알림 없음, 원래 마감에 판정', async (t) => {
    const w = H.setup(t, { id: 'a09gb168', n: 7 });
    w.toVote();
    const deadline = w.session.dayPhaseDeadline;
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    await w.voteAll(() => null, { skip: [x] });
    const watcher = w.firstOf('JOKER');
    w.advanceTo(deadline - 1);
    assert.equal(settles(w, watcher, 'DAY').length, 0);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 0);
    w.advance(1);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 1);
});

test('A09-B-169 8명 판 재판: 끊긴 투표자 1명 빼고 다 냄 → 원래 마감에 판정', async (t) => {
    const w = H.setup(t, { id: 'a09gb169', n: 8 });
    const [x, d] = w.nonJokers();
    await w.toTribunal(d);
    const deadline = w.session.tribunalDeadline;
    await w.disconnect(x);
    await w.castAll('NOT_GUILTY');
    w.advanceTo(deadline - 1);
    assert.equal(settles(w, d, 'TRIBUNAL').length, 0);
    assert.equal(w.got(d, 'tribunal_vote_resolved').length, 0);
    w.advance(1);
    assert.equal(w.got(d, 'tribunal_vote_resolved').length, 1);
});

test('A09-B-170 10명 판 의사 2명 중 1명 끊김, 산 의사 1명만 고름 → 원래 차례 마감', async (t) => {
    const w = H.setup(t, { id: 'a09gb170', n: 10, roleCounts: { JOKER: 2, DOCTOR: 2 } });
    w.toDay();
    await w.toNight();
    await w.untilTurn('DOCTOR');
    const [d1, d2] = w.byRole('DOCTOR');
    const deadline = w.got(d1, 'night_turn_started').at(-1).deadline;
    await w.disconnect(d2);
    assert.equal((await w.night(d1, w.byRole('CITIZEN')[0])).ok, true);
    const doctorEnded = () => w.got(d1, 'night_turn_ended').filter((e) => e.role === 'DOCTOR').length;
    w.advanceTo(deadline - 1);
    assert.equal(settles(w, d1, 'NIGHT').filter((p) => p.role === 'DOCTOR').length, 0);
    assert.equal(doctorEnded(), 0);
    w.advance(1);
    assert.equal(doctorEnded(), 1);
});

test('A09-B-171 6명 판 B 찍고 끊김 → 마감 → B 1표에 셈', async (t) => {
    const w = H.setup(t, { id: 'a09gb171', n: 6 });
    w.toVote();
    const [x, b] = w.nonJokers();
    assert.equal((await w.vote(x, b)).ok, true);
    await w.disconnect(x);
    await w.voteAll(() => null, { skip: [x] });
    w.advanceUntil(() => w.got(b, 'day_vote_resolved').length > 0);
    const resolved = w.got(b, 'day_vote_resolved').at(-1);
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 5);
});

test('A09-B-172 7명 판 의사가 A 보호 고르고 끊김, 광대가 A 암살 → 낮에 A 삶', async (t) => {
    const w = H.setup(t, { id: 'a09gb172', n: 7, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    const a = w.byRole('CITIZEN')[0];
    assert.equal((await w.night(w.firstOf('JOKER'), a)).ok, true);
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    assert.equal((await w.night(doctor, a)).ok, true);
    await w.disconnect(doctor);
    await w.quickNight();
    assert.equal(w.session.phase, 'DAY');
    assert.equal(w.isAlive(a), true);
    assert.equal(w.got(a, 'night_result_applied').at(-1).victimUuid, null);
});

test('A09-B-173 5명 판 토론: 산 사람 4명 준비, 끊긴 1명 준비 못 함 → 바로 투표 안 감, 토론 마감에 투표', async (t) => {
    const w = H.setup(t, { id: 'a09gb173', n: 5 });
    w.toDay();
    const deadline = w.session.dayPhaseDeadline;
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    for (const u of w.others(x)) assert.equal((await w.ready(u)).ok, true);
    assert.equal(w.phase(), 'DAY_DISCUSSION');
    w.advanceTo(deadline - 1);
    assert.equal(w.phase(), 'DAY_DISCUSSION');
    w.advance(1);
    assert.equal(w.phase(), 'DAY_VOTE');
});

test('A09-B-174 8명 판 끊긴 사람을 낮 투표로 찍음 → ok, 표에 셈', async (t) => {
    const w = H.setup(t, { id: 'a09gb174', n: 8 });
    w.toVote();
    const [x, voter] = w.nonJokers();
    await w.disconnect(x);
    const reply = await w.vote(voter, x);
    assert.equal(reply.ok, true, `표 거절: ${reply.code}`);
    await w.voteAll(() => x, { skip: [x, voter] });
    w.advanceUntil(() => w.got(voter, 'day_vote_resolved').length > 0);
    // 표가 세어져 X가 최다 득표로 뽑힘 → 끊겨 있어 재판은 안 열림 (표를 안 셌다면 전원 기권 ABSTAINED)
    const resolved = w.got(voter, 'day_vote_resolved').at(-1);
    assert.equal(resolved.outcome, 'DEFENDANT_DISCONNECTED');
    assert.equal(resolved.publicAbstainCount, 1);
});

test('A09-B-175 6명 판 광대가 끊긴 시민 고름 → ok, 낮에 그 사람 죽음', async (t) => {
    const w = H.setup(t, { id: 'a09gb175', n: 6 });
    w.toDay();
    await w.toNight();
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    const reply = await w.night(w.firstOf('JOKER'), x);
    assert.equal(reply.ok, true, `고르기 거절: ${reply.code}`);
    await w.quickNight();
    assert.equal(w.got(w.firstOf('JOKER'), 'night_result_applied').at(-1).victimUuid, x);
    assert.equal(w.isAlive(x), false);
});

test('A09-B-176 7명 판 7명 다 낸 뒤 1명 끊김(5초 안) → 마감 = 다 찬 때 + 5초 그대로', async (t) => {
    const w = H.setup(t, { id: 'a09gb176', n: 7 });
    w.toVote();
    const x = w.nonJokers()[0];
    await w.voteAll(() => null);
    const fullAt = w.now();
    const watcher = w.firstOf('JOKER');
    assert.equal(settles(w, watcher, 'DAY').at(-1)?.deadline, fullAt + 5_000);
    w.advance(2_000);
    await w.disconnect(x);
    w.advanceTo(fullAt + 4_999);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 0);
    w.advance(1);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 1);
});

test('A09-B-177 6명 판 다 찬 뒤 1명 끊김 → 2초 뒤 붙어 다른 사람으로 바꿈 → 판정에 바꾼 표', async (t) => {
    const w = H.setup(t, { id: 'a09gb177', n: 6 });
    w.toVote();
    const [x, b, c2, c3, c4] = w.nonJokers();
    // B 3표·기권 3 (재판 없음) 상태에서 X가 기권 → B로 바꾸면 B 4표·기권 2 (재판)
    assert.equal((await w.vote(x, null)).ok, true);
    for (const u of [c2, c3, c4]) assert.equal((await w.vote(u, b)).ok, true);
    for (const u of [b, w.firstOf('JOKER')]) assert.equal((await w.vote(u, null)).ok, true);
    await w.disconnect(x);
    w.advance(2_000);
    assert.equal((await w.reconnect(x)).ok, true);
    const reply = await w.vote(x, b);
    assert.equal(reply.ok, true, `바꾸기 거절: ${reply.code}`);
    w.advanceUntil(() => w.got(b, 'day_vote_resolved').length > 0, { step: 500 });
    const resolved = w.got(b, 'day_vote_resolved').at(-1);
    assert.equal(resolved.publicAbstainCount, 2);
    assert.equal(resolved.tribunalTargetUuid, b);
});

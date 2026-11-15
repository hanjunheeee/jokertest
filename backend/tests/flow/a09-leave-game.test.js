'use strict';

// 판 나가기 서버 흐름 시험 — 산 사람 나가면 바로 죽음·탈주 5분, 죽은 사람 나가기, 방장 넘김, 나가서 다 차면 5초, 줄어도 판 계속
// 목록 A09-B-218~237 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: node --env-file=.env.test --test tests/flow/a09-leave-game.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a09-leave-harness');

const { gf } = h;

// 판 사람 중 나 빼고 (방송을 받아야 할 사람)
const others = (s, ...me) => [...s.players.keys()].filter((u) => !me.includes(u));

// 지금까지 받은 알림 수 적어 두기 → 그 뒤 새로 받은 것만 보려고
const mark = (w, uuids) => new Map(uuids.map((u) => [u, w.sock(u).received.length]));
const newSince = (w, m, uuid, event) => w.sock(uuid).received.slice(m.get(uuid)).filter((e) => !event || e.event === event);

test('A09-B-218 6명 판 산 사람 나가기 → 답 ok, 판 전원 player_eliminated 한 번(직업 없음)', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    assert.deepEqual(await w.leave(s, a), { ok: true });
    for (const u of others(s, a)) {
        const got = w.received(u, 'player_eliminated');
        assert.equal(got.length, 1, `${u} 탈락 알림 수`);
        assert.equal(got[0].payload.victimUuid, a);
        assert.equal(h.hasRoleField(got[0].payload), false, '탈락 알림에 직업·편 칸이 있음');
    }
});

test('A09-B-219 7명 판 산 채로 나간 직후 방 만들기 → DESERTION_COOLDOWN "탈주로 5분 0초 뒤에…"', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'DESERTION_COOLDOWN');
    assert.equal(res.message, '탈주로 5분 0초 뒤에 참여할 수 있습니다.');
});

test('A09-B-220 5명 판 나간 사람 스냅샷 → 거절(판에 안 돌아옴)', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const snap = await w.snapshot(s, a);
    assert.equal(snap.ok, false);
    assert.equal(snap.players, undefined);
});

test('A09-B-221 8명 판 처형된 사람 나가기 → 답 ok, player_eliminated 안 감, session_participation_changed만', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    const m = mark(w, others(s, a));
    assert.deepEqual(await w.leave(s, a), { ok: true });
    for (const u of others(s, a)) {
        assert.equal(newSince(w, m, u, 'player_eliminated').length, 0, `${u}가 죽음 방송을 또 받음`);
        const changed = newSince(w, m, u, 'session_participation_changed');
        assert.equal(changed.length, 1, `${u} 참여 바뀜 알림 수`);
        assert.equal(changed[0].payload.departedUuid, a);
    }
});

test('A09-B-222 6명 판 처형된 사람 나간 직후 방 만들기 → ok', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.leave(s, a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-223 6명 판 이미 나간 사람이 또 나가기 → ok:true, 방송 더 없음', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const m = mark(w, others(s, a));
    assert.deepEqual(await w.leave(s, a), { ok: true });
    for (const u of others(s, a)) assert.equal(newSince(w, m, u).length, 0, `${u}가 두 번째 나가기 방송을 받음`);
});

test('A09-B-224 10명 판 나간 뒤 판 방송을 안 받음 (단계 바뀜 0개)', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10, roleCounts: { JOKER: 2 } });
    gf.toDay(s);
    const [a, b] = gf.nonJokers(s);
    const leaverSocket = w.sock(a);
    await w.leave(s, a);
    const before = leaverSocket.received.length;
    // 토론 30초 → 투표 (단계 바뀜 방송)
    w.startDayVote(s);
    assert.ok(w.received(b, 'day_phase_changed').length >= 1, '남은 사람도 단계 바뀜을 못 받음 (시험 준비 틀림)');
    const after = leaverSocket.received.slice(before).filter((e) => e.payload?.gameId === s.id);
    assert.deepEqual(after.map((e) => e.event), []);
    T_stop(s);
});

test('A09-B-225 7명 판 투표 중 6명 냄·안 낸 1명 나감 → 마감 = 나간 때 + 5초', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    const joker = gf.firstOf(s, 'JOKER');
    const [c, target, ...rest] = gf.nonJokers(s);
    w.startDayVote(s);
    for (const u of [target, ...rest]) assert.equal((await w.dayVote(s, u, joker)).ok, true);
    assert.equal((await w.dayVote(s, joker, target)).ok, true);
    assert.equal(w.received(target, 'phase_settle_started').length, 0, '6명만 냈는데 5초 알림이 옴');
    const leftAt = w.now();
    await w.leave(s, c);
    for (const u of others(s, c)) {
        const [settle] = w.received(u, 'phase_settle_started');
        assert.ok(settle, `${u}가 5초 알림을 못 받음`);
        assert.equal(settle.payload.deadline, leftAt + 5_000);
    }
    w.tick(4_999);
    assert.equal(w.received(target, 'day_vote_resolved').length, 0);
    w.tick(1);
    assert.equal(w.received(target, 'day_vote_resolved').length, 1);
    T_stop(s);
});

test('A09-B-226 8명 판 의사 2: 의사 1명 고름·다른 의사 나감 → 의사 차례 마감 = 나간 때 + 5초', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8, roleCounts: { JOKER: 2, DOCTOR: 2 } });
    const jokers = gf.byRole(s, 'JOKER');
    const [d1, d2] = gf.byRole(s, 'DOCTOR');
    const citizens = gf.byRole(s, 'CITIZEN');
    gf.toDay(s);
    gf.toNight(s);
    h.T.startNightTurnSequence(w.io, s, { randomFn: () => 0 });
    for (const j of jokers) assert.equal((await w.nightPick(s, j, citizens[0])).ok, true);
    w.tick(5_000);
    assert.ok(w.received(citizens[2], 'night_turn_started').some((e) => e.payload.role === 'DOCTOR'), '의사 차례가 안 열림 (시험 준비 틀림)');
    assert.equal((await w.nightPick(s, d1, citizens[1])).ok, true);
    const leftAt = w.now();
    await w.leave(s, d2);
    const watcher = citizens[2];
    const settle = w.received(watcher, 'phase_settle_started').filter((e) => e.payload.role === 'DOCTOR');
    assert.equal(settle.length, 1, '의사 차례 5초 알림 수');
    assert.equal(settle[0].payload.deadline, leftAt + 5_000);
    const doctorEnded = () => w.received(watcher, 'night_turn_ended').filter((e) => e.payload.role === 'DOCTOR').length;
    w.tick(4_999);
    assert.equal(doctorEnded(), 0);
    w.tick(1);
    assert.equal(doctorEnded(), 1);
    T_stop(s);
});

test('A09-B-227 5명 판 역할 확인 중 산 채로 나가도 탈주 → 방 만들기 DESERTION_COOLDOWN', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    assert.equal(s.phase, 'ROLE_REVEAL');
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const res = await w.createRoom(a);
    assert.equal(res.code, 'DESERTION_COOLDOWN');
});

test('A09-B-228 5명 판 광대 나감 → player_eliminated에 시민 승, 단계 ENDED', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    gf.toDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    await w.leave(s, joker);
    for (const u of others(s, joker)) {
        const [got] = w.received(u, 'player_eliminated');
        assert.ok(got, `${u} 탈락 알림 없음`);
        assert.equal(got.payload.winResult?.winner, 'CITIZEN');
        assert.equal(got.payload.phase, 'ENDED');
    }
});

test('A09-B-229 7명 판 산 방장 나감 → session_participation_changed 방장 = 다음 참여 중인 사람', async (t) => {
    const w = h.setup(t);
    const uuids = Array.from({ length: 7 }, (_, i) => `a09b229-${i}`);
    const s = w.openGame({ uuids, roleCounts: { JOKER: 2 }, hostUuid: uuids[0] });
    gf.toDay(s);
    await w.leave(s, uuids[0]);
    for (const u of uuids.slice(1)) {
        const [changed] = w.received(u, 'session_participation_changed');
        assert.ok(changed, `${u} 참여 바뀜 알림 없음`);
        assert.equal(changed.payload.hostUuid, uuids[1]);
    }
});

test('A09-B-230 6명 판 처형된 방장 나감 → 방장 넘어감', async (t) => {
    const w = h.setup(t);
    const uuids = Array.from({ length: 6 }, (_, i) => `a09b230-${i}`);
    const s = w.openGame({ uuids, roleCounts: { JOKER: 2 }, hostUuid: uuids[0] });
    w.execute(s, uuids[0]);
    assert.notEqual(s.phase, 'ENDED');
    await w.leave(s, uuids[0]);
    for (const u of uuids.slice(1)) {
        const changed = w.received(u, 'session_participation_changed').at(-1);
        assert.ok(changed, `${u} 참여 바뀜 알림 없음`);
        assert.equal(changed.payload.hostUuid, uuids[1]);
    }
});

test('A09-B-231 8명 판 판 끝 뒤 나가기는 탈주 아님 → ok, 방 만들기 바로 됨', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    w.execute(s, gf.firstOf(s, 'JOKER'));
    assert.equal(s.phase, 'ENDED');
    const [c] = gf.nonJokers(s);
    assert.deepEqual(await w.leave(s, c), { ok: true });
    const res = await w.createRoom(c);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-232 판에 없는 사람의 나가기 → ok:true [지금 동작]', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    const stranger = w.outsider('stranger');
    assert.deepEqual(await w.leave(s, stranger), { ok: true });
});

test('A09-B-233 7명 판 끊긴 채 다른 탭에서 나가기 → 바로 탈락, 60초 타이머가 다시 안 죽임(탈락 방송 한 번)', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    await w.disconnect(a);
    w.tick(10_000);
    w.connect(a, s);
    assert.deepEqual(await w.leave(s, a), { ok: true });
    assert.equal(w.received(watcher, 'player_eliminated').length, 1);
    // 새 탭도 닫힘 → 60초 지나도 두 번째 탈락 없음
    await w.disconnect(a);
    w.tick(60_000);
    assert.equal(w.received(watcher, 'player_eliminated').length, 1);
});

test('A09-B-234 10명 판 시민 4명 나감 → 6명, 승부 아님 → 판 계속', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10, roleCounts: { JOKER: 2 } });
    gf.toDay(s);
    const citizens = gf.nonJokers(s);
    for (const c of citizens.slice(0, 4)) assert.deepEqual(await w.leave(s, c), { ok: true });
    const watcher = citizens[5];
    for (const e of w.received(watcher, 'player_eliminated')) assert.equal(e.payload.winResult, undefined);
    const snap = await w.snapshot(s, watcher);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'DAY');
    assert.equal(snap.players.filter((p) => p.isAlive).length, 6);
});

test('A09-B-235 10명 판 나감 2 + 60초 탈락 2 → 다음 투표의 투표할 사람 = 남은 산 사람 6명', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10, roleCounts: { JOKER: 2 } });
    gf.toDay(s);
    const jokers = gf.byRole(s, 'JOKER');
    const citizens = gf.nonJokers(s);
    const [l1, l2, d1, d2, ...stay] = citizens;
    await w.leave(s, l1);
    await w.leave(s, l2);
    await w.disconnect(d1);
    await w.disconnect(d2);
    w.tick(60_000);
    assert.equal(s.players.get(d1).alive, false, '60초 탈락이 안 됨 (시험 준비 틀림)');
    w.startDayVote(s);
    const voters = [...jokers, ...stay];
    assert.equal(voters.length, 6);
    // 빠진 사람 표는 안 받음
    assert.equal((await w.dayVote(s, l1, jokers[0])).ok, false);
    for (const u of voters.slice(0, 5)) assert.equal((await w.dayVote(s, u, u === jokers[0] ? stay[0] : jokers[0])).ok, true);
    assert.equal(w.received(stay[0], 'phase_settle_started').length, 0, '5명만 냈는데 다 찼다고 봄');
    assert.equal((await w.dayVote(s, voters[5], jokers[0])).ok, true);
    assert.equal(w.received(stay[0], 'phase_settle_started').length, 1, '남은 6명이 다 냈는데 다 찼다고 안 봄');
    T_stop(s);
});

test('A09-B-236 7명 판 나감 1 + 탈락 1 → 재판 투표할 사람 = 피고 뺀 남은 산 사람 4명', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [l1, d1, defendant, ...stay] = gf.nonJokers(s);
    await w.leave(s, l1);
    await w.disconnect(d1);
    w.tick(60_000);
    assert.equal(s.players.get(d1).alive, false, '60초 탈락이 안 됨 (시험 준비 틀림)');
    w.startDayVote(s);
    for (const u of [joker, ...stay]) assert.equal((await w.dayVote(s, u, defendant)).ok, true);
    assert.equal((await w.dayVote(s, defendant, null)).ok, true);
    w.tick(5_000);
    assert.equal(s.phase, 'TRIBUNAL', '재판에 못 들어감 (시험 준비 틀림)');
    const voters = [joker, ...stay];
    assert.equal(voters.length, 4);
    const tribunalSettles = () => w.received(defendant, 'phase_settle_started').filter((e) => e.payload.phase === 'TRIBUNAL').length;
    for (const u of voters.slice(0, 3)) assert.equal((await w.cast(s, u, 'NOT_GUILTY')).ok, true);
    assert.equal(tribunalSettles(), 0, '3명만 냈는데 다 찼다고 봄');
    assert.equal((await w.cast(s, voters[3], 'NOT_GUILTY')).ok, true);
    assert.equal(tribunalSettles(), 1, '4명이 다 냈는데 다 찼다고 안 봄');
    T_stop(s);
});

test('A09-B-237 6명 판 광대 1·시민 5에서 시민이 하나씩 나가 1:1 → 그 순간 광대 승', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    gf.toDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const citizens = gf.nonJokers(s);
    for (const c of citizens.slice(0, 3)) await w.leave(s, c);
    assert.equal(w.received(joker, 'player_eliminated').filter((e) => e.payload.winResult).length, 0, '시민 2명 남았는데 끝남');
    await w.leave(s, citizens[3]);
    const last = w.received(joker, 'player_eliminated').at(-1);
    assert.equal(last.payload.victimUuid, citizens[3]);
    assert.equal(last.payload.winResult?.winner, 'JOKER');
});

// 진짜 시계로 걸릴 수 있는 다음 단계 타이머 끄기 (가짜 시계라 안 돌지만 다음 시험에 안 넘어가게)
function T_stop(s) {
    h.T.stopDayPhaseTimer(s.id);
    h.T.stopTribunalTimer(s.id);
    h.T.stopNightTurnSequence(s.id);
}

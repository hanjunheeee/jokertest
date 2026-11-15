'use strict';

// 죽은 사람 풀어 주기 서버 흐름 시험 — 죽은 사람은 끊기거나 나가도 기다림·탈주 없음, 다른 방 길 열림, 판 자리·판 끝 명단은 남음
// 목록 A09-B-238~250·331 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: node --env-file=.env.test --test tests/flow/a09-dead-release.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a09-leave-harness');

const { gf } = h;

// 판 사람 중 나 빼고
const others = (s, ...me) => [...s.players.keys()].filter((u) => !me.includes(u));
// 지금까지 받은 알림 수 적어 두기 → 그 뒤 새로 받은 것만
const mark = (w, uuids) => new Map(uuids.map((u) => [u, w.sock(u).received.length]));
const newSince = (w, m, uuid, event) => w.sock(uuid).received.slice(m.get(uuid)).filter((e) => !event || e.event === event);

// 진짜 낮 투표 → 재판 → 유죄 길로 처형 (산 사람 전원 표, 피고는 기권), 마지막 재판 결과 값
async function executeByVote(w, s, defendant) {
    w.startDayVote(s);
    const alive = [...s.players.values()].filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid);
    for (const u of alive) assert.equal((await w.dayVote(s, u, u === defendant ? null : defendant)).ok, true);
    w.tick(5_000);
    assert.equal(s.phase, 'TRIBUNAL', '재판에 못 들어감 (시험 준비 틀림)');
    for (const u of alive) if (u !== defendant) assert.equal((await w.cast(s, u, 'GUILTY')).ok, true);
    w.tick(5_000);
    const watcher = alive.find((u) => u !== defendant);
    return w.received(watcher, 'tribunal_vote_resolved').at(-1)?.payload;
}

// 끝에 남은 단계 타이머 끄기
function stopTimers(s) {
    h.T.stopDayPhaseTimer(s.id);
    h.T.stopTribunalTimer(s.id);
    h.T.stopNightTurnSequence(s.id);
}

test('A09-B-238 6명 판 처형된 사람 끊김 → 60초 지나도 player_eliminated 없음·탈주 막힘 없음', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    const m = mark(w, others(s, a));
    await w.disconnect(a);
    w.tick(61_000);
    for (const u of others(s, a)) assert.equal(newSince(w, m, u, 'player_eliminated').length, 0, `${u}가 탈락 알림을 받음`);
    w.connect(a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

// 처형된 사람이 끊긴 뒤 새 탭으로 다른 방 길 하나 (7명 판)
const releaseWays = [
    ['A09-B-239', 'create_room', '방 만들기 ok'],
    ['A09-B-240', 'join_room_by_code', '다른 방 코드 입장 들어감'],
    ['A09-B-241', 'join_public_room', '공개 방 들어감'],
    ['A09-B-242', 'accept_game_invite', '초대 수락 ok'],
];
for (const [id, way, label] of releaseWays) {
    test(`${id} 7명 판 처형된 사람 끊김 → ${way} ${label}`, async (t) => {
        const w = h.setup(t);
        const s = w.openGame({ n: 7 });
        const [a] = gf.nonJokers(s);
        w.execute(s, a);
        await w.disconnect(a);
        w.connect(a);
        const res = await w.tryWay(a, way);
        assert.equal(res.ok, true, `${way} 거절: ${res.code} ${res.message}`);
    });
}

test('A09-B-243 10명 판 밤 암살로 죽은 사람 끊김 → 방 만들기 ok', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10, roleCounts: { JOKER: 2 } });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    w.night(s, a);
    assert.equal(s.players.get(a).alive, false, '밤에 안 죽음 (시험 준비 틀림)');
    await w.disconnect(a);
    w.connect(a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-244 5명 판 처형된 사람 끊김 → 다시 붙음 → 스냅샷 ok(관전 그대로)', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.disconnect(a);
    w.tick(61_000);
    const snap = await w.reconnect(s, a);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === a).isAlive, false);
});

test('A09-B-245 8명 판 처형된 사람 끊긴 채 판 끝 → 판 끝 승패 칸 명단에 그 사람', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    const joker = gf.firstOf(s, 'JOKER');
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.disconnect(a);
    w.night(s);
    const resolved = await executeByVote(w, s, joker);
    assert.equal(resolved?.winResult?.winner, 'CITIZEN', '판이 안 끝남 (시험 준비 틀림)');
    assert.ok(resolved.winResult.reveals.some((r) => r.uuid === a), '판 끝 명단에 죽고 끊긴 사람이 없음');
    stopTimers(s);
});

test('A09-B-246 처형된 A 끊김 → 새 방에서 5명 판 시작 → 옛 7명 판 전원 참여 바뀜(A 빠짐), A에게 옛 판 방송 0개', async (t) => {
    const w = h.setup(t);
    const old = w.openGame({ n: 7 });
    const [a, b] = gf.nonJokers(old);
    w.execute(old, a);
    await w.disconnect(a);
    const m = mark(w, others(old, a));
    const fresh = [a, 'a09b246-n1', 'a09b246-n2', 'a09b246-n3', 'a09b246-n4'];
    const { session: next } = await w.startRoomGame(fresh);
    assert.notEqual(next.id, old.id);
    for (const u of others(old, a)) {
        const changed = newSince(w, m, u, 'session_participation_changed');
        assert.equal(changed.length, 1, `${u} 참여 바뀜 알림 수`);
        assert.equal(changed[0].payload.departedUuid, a);
    }
    // 그 뒤 옛 판에서 일이 생겨도 A(새 판 소켓)는 못 받음
    await w.leave(old, b);
    const oldEvents = w.sock(a).received.filter((e) => e.payload?.gameId === old.id);
    assert.deepEqual(oldEvents.map((e) => e.event), []);
});

test('A09-B-247 6명 판 처형된 방장 끊김 → 방장 안 넘어감 [지금 동작]', async (t) => {
    const w = h.setup(t);
    const uuids = Array.from({ length: 6 }, (_, i) => `a09b247-${i}`);
    const s = w.openGame({ uuids, roleCounts: { JOKER: 2 }, hostUuid: uuids[0] });
    w.execute(s, uuids[0]);
    const m = mark(w, uuids.slice(1));
    await w.disconnect(uuids[0]);
    for (const u of uuids.slice(1)) assert.equal(newSince(w, m, u, 'session_participation_changed').length, 0);
    const snap = await w.snapshot(s, uuids[1]);
    assert.equal(snap.hostUuid, uuids[0]);
});

test('A09-B-248 [B07-1] 7명 판 처형된 사람 끊김 → 다음 낮 그 사람 찍음 → 거절', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    const [a, voter] = gf.nonJokers(s);
    w.execute(s, a);
    await w.disconnect(a);
    w.night(s);
    w.startDayVote(s);
    const res = await w.dayVote(s, voter, a);
    assert.equal(res.ok, false);
    stopTimers(s);
});

test('A09-B-249 [B07-1] 10명 판 둘째 밤 처형된 사람 끊김 → 마녀사냥꾼이 그 사람 고름 → ok', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10, roleCounts: { JOKER: 2, WITCH_HUNTER: 1 } });
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    const [a] = gf.byRole(s, 'CITIZEN');
    w.execute(s, a);
    await w.disconnect(a);
    w.night(s);
    gf.toNight(s);
    h.T.startNightTurnSequence(w.io, s, { randomFn: () => 0 });
    // 광대 차례(아무도 안 고름)를 1초씩 넘겨 마녀사냥꾼 차례까지
    const hunterTurn = () => w.received(hunter, 'night_turn_started').some((e) => e.payload.role === 'WITCH_HUNTER' && e.payload.dayIndex === s.dayIndex);
    for (let i = 0; i < 120 && !hunterTurn(); i += 1) w.tick(1_000);
    assert.ok(hunterTurn(), '마녀사냥꾼 차례가 안 옴 (시험 준비 틀림)');
    const res = await w.nightPick(s, hunter, a);
    assert.equal(res.ok, true, `마녀사냥꾼 고르기 거절: ${res.code}`);
    stopTimers(s);
});

test('A09-B-250 7명 판 끝 뒤 같은 방 대기방: 죽고 나간 사람 코드 입장 들어감, 탈주자는 막힘 끝난 뒤 들어감', async (t) => {
    const w = h.setup(t);
    const uuids = Array.from({ length: 7 }, (_, i) => `a09b250-${i}`);
    const { session: s, roomCode } = await w.startRoomGame(uuids);
    gf.toDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [dead, deserter] = gf.byRole(s, 'CITIZEN');
    w.execute(s, dead);
    await w.leave(s, dead);
    w.night(s);
    await w.leave(s, deserter);
    const resolved = await executeByVote(w, s, joker);
    assert.equal(resolved?.winResult?.winner, 'CITIZEN', '판이 안 끝남 (시험 준비 틀림)');
    const deadJoin = await w.joinByCode(dead, roomCode);
    assert.equal(deadJoin?.event, 'room_joined', `죽고 나간 사람 입장 거절: ${deadJoin?.payload?.code}`);
    const early = await w.joinByCode(deserter, roomCode);
    assert.equal(early?.payload?.code, 'DESERTION_COOLDOWN');
    w.tick(5 * h.MINUTE);
    const late = await w.joinByCode(deserter, roomCode);
    assert.equal(late?.event, 'room_joined', `막힘 끝난 탈주자 입장 거절: ${late?.payload?.code}`);
    stopTimers(s);
});

test('A09-B-331 6명 판 처형된 사람 나감 → 소켓 끊김 → 알림·탈주 없음', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.leave(s, a);
    const m = mark(w, others(s, a));
    await w.disconnect(a);
    w.tick(61_000);
    for (const u of others(s, a)) {
        const got = newSince(w, m, u).filter((e) => ['player_eliminated', 'session_player_connection_changed', 'session_participation_changed'].includes(e.event));
        assert.deepEqual(got.map((e) => e.event), [], `${u}가 알림을 받음`);
    }
    w.connect(a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

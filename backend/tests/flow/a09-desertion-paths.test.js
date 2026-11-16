'use strict';

// 무엇이 탈주인지 서버 흐름 시험 — 산 채로 나감·60초 탈락만 막힘, 죽은 뒤·결과 화면·점검·서버 재시작·59초 복귀는 안 막힘
// 목록 A09-B-292~303·330 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: node --env-file=.env.test --test tests/flow/a09-desertion-paths.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a09-leave-harness');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

const { gf, MINUTE } = h;

const others = (s, ...me) => [...s.players.keys()].filter((u) => !me.includes(u));

// 탈주 막힘인지: 새 탭으로 방 만들기 → DESERTION_COOLDOWN이면 막힘
async function isBlocked(w, uuid) {
    if (!w.sock(uuid).connected) w.connect(uuid);
    const res = await w.createRoom(uuid);
    return { blocked: res.code === 'DESERTION_COOLDOWN', res };
}

// ── A09-B-292~299: 무엇이 탈주인지 (막힘으로 봄) ──
test('A09-B-292 6명 판 산 채로 나감 → 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    assert.equal((await isBlocked(w, a)).blocked, true);
});

test('A09-B-293 7명 판 끊긴 뒤 60초 탈락 → 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    await w.disconnect(a);
    w.tick(60_000);
    assert.equal(w.received(watcher, 'player_eliminated').length, 1, '60초 탈락이 안 됨 (시험 준비 틀림)');
    assert.equal((await isBlocked(w, a)).blocked, true);
});

test('A09-B-294 8명 판 죽은 뒤 나감 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.leave(s, a);
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-295 5명 판 처형 뒤 끊겨 60초 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 5 });
    const [a] = gf.nonJokers(s);
    w.execute(s, a);
    await w.disconnect(a);
    w.tick(61_000);
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-296 10명 판 결과 화면에서 나감 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 10 });
    w.execute(s, gf.firstOf(s, 'JOKER'));
    assert.equal(s.phase, 'ENDED', '판이 안 끝남 (시험 준비 틀림)');
    const [a] = gf.nonJokers(s);
    assert.deepEqual(await w.leave(s, a), { ok: true });
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-297 6명 판 결과 화면에서 끊김 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    w.execute(s, gf.firstOf(s, 'JOKER'));
    assert.equal(s.phase, 'ENDED', '판이 안 끝남 (시험 준비 틀림)');
    const [a] = gf.nonJokers(s);
    await w.disconnect(a);
    w.tick(61_000);
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-298 7명 판 점검 강제 종료 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    assert.equal(abortGamesForMaintenance(w.io), 1, '점검 종료가 판을 안 끝냄 (시험 준비 틀림)');
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-299 8명 판 끊긴 뒤 59초에 붙음 → 안 막힘', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    await w.disconnect(a);
    w.tick(59_000);
    assert.equal((await w.reconnect(s, a)).ok, true);
    w.tick(2_000);
    assert.equal(w.received(watcher, 'player_eliminated').length, 0);
    // 판이 끝난 뒤에 보면 판 중 거절(ALREADY_IN_GAME)과 섞이지 않음
    w.execute(s, gf.firstOf(s, 'JOKER'));
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-300 6명 판 판 장부를 비움(다시 켬 흉내) → 스냅샷 SESSION_NOT_FOUND, 방 만들기 ok', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 6 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    gf.resetCore();
    const snap = await w.snapshot(s, a);
    assert.equal(snap.code, 'SESSION_NOT_FOUND');
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
    assert.equal(w.desertionRepo.rows.length, 0);
});

test('A09-B-301 7명 판 1명 끊김 → 점검 강제 종료 → 60초 지나도 player_eliminated 없음', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.disconnect(a);
    abortGamesForMaintenance(w.io);
    w.tick(61_000);
    for (const u of others(s, a)) assert.equal(w.received(u, 'player_eliminated').length, 0, `${u}가 탈락 알림을 받음`);
    assert.equal((await isBlocked(w, a)).blocked, false);
});

test('A09-B-302 7명 판 판 중 정지 → 끊김 → 다시 못 붙음 → 60초에 탈락, 탈주로 안 침(탈주 줄·막힘 없음) / 같이 끊긴 정지 아닌 사람은 탈주', async (t) => {
    // 정지 중인 사람 (탈주 적기 전에 저장소에 물어봄)
    const banned = new Set();
    const w = h.setup(t, { repo: { isUserBanned: async (uuid) => banned.has(uuid) } });
    const s = w.openGame({ n: 7 });
    gf.toDay(s);
    const [a, b, watcher] = gf.nonJokers(s);
    // 정지 = 서버가 그 사람 소켓에 끊김 안내 뒤 끊음, 접속 확인에서 막혀 다시 못 붙음
    banned.add(a);
    w.sock(a).emit('force_disconnect', { code: 'ACCOUNT_BANNED', message: '정지된 계정입니다. 운영정책을 확인해주세요.' });
    await w.disconnect(a);
    // 견줄 사람: 정지 아닌데 같은 때 끊김
    await w.disconnect(b);
    w.tick(60_000);
    await gf.flush();
    const victims = w.received(watcher, 'player_eliminated').map((e) => e.payload.victimUuid);
    assert.deepEqual([...victims].sort(), [a, b].sort(), '둘 다 60초에 판에서 빠짐');
    assert.deepEqual(w.desertionRepo.rows.map((r) => r.user_id), [b], '탈주 줄은 정지 아닌 사람만');
    // 막힘은 방 만들기 답으로 봄 (정지된 사람은 실제론 못 붙지만, 탈주 거절이 아닌지만 확인)
    const banned1 = await isBlocked(w, a);
    assert.equal(banned1.blocked, false, '정지로 빠진 사람에게 탈주 막힘이 걸림');
    assert.equal(banned1.res.ok, true, `방 만들기 거절: ${banned1.res.code}`);
    assert.equal((await isBlocked(w, b)).blocked, true);
});

test('A09-B-303 8명 판 정지 없는 관리자 강제 끊기 → 30초 뒤 다시 붙음 → 판에 산 채로 그대로, 60초 지나도 탈락·탈주 없음', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    // 강제 끊기 = 서버가 그 사람 소켓에 끊김 안내 뒤 끊음 (정지·세션 내림 없음 → 다시 붙을 수 있음)
    w.sock(a).emit('force_disconnect', { code: 'ADMIN_DISCONNECT', message: '운영자에 의해 연결이 종료되었습니다.' });
    await w.disconnect(a);
    w.tick(30_000);
    const snap = await w.reconnect(s, a);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === a)?.isAlive, true);
    w.tick(60_000);
    await gf.flush();
    assert.equal(w.received(watcher, 'player_eliminated').length, 0, '다시 붙었는데 탈락함');
    const later = await w.snapshot(s, a);
    assert.equal(later.ok, true, `스냅샷 거절: ${later.code}`);
    assert.equal(later.players.find((p) => p.uuid === a)?.isAlive, true);
    assert.equal(w.desertionRepo.rows.length, 0);
    // 돌아온 뒤엔 보통 사람과 같음: 낮 표를 낼 수 있음
    w.startDayVote(s);
    assert.equal((await w.dayVote(s, a, null)).ok, true);
    // 판이 끝난 뒤 방 만들기 → 탈주 거절 아님 (판 중 거절과 안 섞이게 끝난 뒤에 봄)
    w.execute(s, gf.firstOf(s, 'JOKER'));
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, false);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-330 8명 판 59초에 나가기 → 60초 타이머 안 돎, 막힘 끝 = 나간 때 + 5분', async (t) => {
    const w = h.setup(t);
    const s = w.openGame({ n: 8 });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    await w.disconnect(a);
    w.tick(59_000);
    w.connect(a, s);
    const leftAt = w.now();
    assert.deepEqual(await w.leave(s, a), { ok: true });
    await w.disconnect(a);
    w.tick(2_000);
    assert.equal(w.received(watcher, 'player_eliminated').length, 1);
    const { blocked, res } = await isBlocked(w, a);
    assert.equal(blocked, true);
    assert.equal(res.blockedUntil, new Date(leftAt + 5 * MINUTE).toISOString());
});

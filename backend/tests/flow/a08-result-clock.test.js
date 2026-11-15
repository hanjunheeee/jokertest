'use strict';

// 판 끝 시각부터 180초 하나의 시계 시험 — 결과 화면 닫힘 경계(179·180·181초), 닫힌 뒤 대기방으로 못 함·묶임 없음, 남은 사람만 받음, 늦게 들어와도 판 끝 기준, 판 끝 칸·스냅샷 닫힘 시각, 끊긴 사람도 180초에 정리, 시험 손잡이 결과 바로 닫기, 세 가지 같은 때, 둘째 판 안 건드림
// 목록 A08-B-129~138·147~152·155~161 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-result-clock.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');
const { createE2eRouter } = require('../../routes/e2e.routes');

const RESULT_MS = 180_000;
const closedOf = (w, uuid) => w.received(uuid, 'game_result_closed');

async function endedGame(t, prefix, n, how = 'citizenWin') {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    await w.endGame(g, how);
    return { w, g };
}

// ── 결과 화면 닫힘 경계 (6명 판, 아무도 안 누름) ──
test('A08-B-129 6명 판 끝 + 179초 → 결과 화면 사람 game_result_closed 아직 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b129', 6);
    w.tickToSinceEnd(g, 179_000);
    for (const uuid of g.uuids) assert.equal(closedOf(w, uuid).length, 0, uuid);
});

test('A08-B-130 6명 판 끝 + 180초 → 받음 { gameId, reason:"RESULT_TIMEOUT" }', async (t) => {
    const { w, g } = await endedGame(t, 'b130', 6);
    w.tickToSinceEnd(g, 179_000);
    w.tickToSinceEnd(g, RESULT_MS);
    for (const uuid of g.uuids) assert.deepEqual(closedOf(w, uuid), [{ gameId: g.gameId, reason: 'RESULT_TIMEOUT' }], uuid);
});

test('A08-B-131 6명 판 끝 + 181초 → 받은 것 1번뿐', async (t) => {
    const { w, g } = await endedGame(t, 'b131', 6);
    w.tickToSinceEnd(g, 179_000);
    w.tickToSinceEnd(g, RESULT_MS);
    w.tickToSinceEnd(g, 181_000);
    for (const uuid of g.uuids) assert.equal(closedOf(w, uuid).length, 1, uuid);
});

test('A08-B-132 5명 판 180초 뒤 return_to_room → SESSION_ENDED', async (t) => {
    const { w, g } = await endedGame(t, 'b132', 5);
    w.tickToSinceEnd(g, RESULT_MS);
    const r = await w.ret(g.uuids[1], g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SESSION_ENDED');
});

test('A08-B-133 5명 판 180초 뒤 그 사람 create_room → 성공', async (t) => {
    const { w, g } = await endedGame(t, 'b133', 5);
    w.tickToSinceEnd(g, RESULT_MS);
    const created = await w.createRoom(g.uuids[1], w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true, `막힘: ${created.code} ${created.message}`);
});

// ── 결과 화면에 남은 사람 전원이 받음 ──
[[5, 1], [7, 3], [10, 5]].forEach(([n, stay], i) => {
    test(`A08-B-${String(134 + i).padStart(3, '0')} ${n}명 판 ${stay}명 남음 → 남은 사람 전원 받음`, async (t) => {
        const { w, g } = await endedGame(t, `b${134 + i}`, n);
        const stayers = g.uuids.slice(n - stay);
        for (const uuid of g.uuids.slice(0, n - stay)) assert.equal((await w.ret(uuid, g.gameId)).ok, true);
        w.tickToSinceEnd(g, RESULT_MS);
        for (const uuid of stayers) assert.equal(closedOf(w, uuid).length, 1, `${uuid} 못 받음`);
    });
});

test('A08-B-137 6명 판 C 들어감 → 180초 → C는 game_result_closed 없음, 방 자리 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b137', 6);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal(closedOf(w, c).length, 0);
    const room = await w.currentRoom(c);
    assert.ok(room?.players.some((p) => p.uuid === c), 'C 방 자리 없어짐');
});

test('A08-B-138 5명 판 B 로비로 → 180초 → B는 받은 것 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b138', 5);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal(closedOf(w, b).length, 0);
});

test('A08-B-147 6명 판 C가 판 끝 + 100초에 들어감, A 안 옴 → 판 끝 + 180초에 C 방장 (들어온 뒤 80초)', async (t) => {
    const { w, g } = await endedGame(t, 'b147', 6);
    const c = g.uuids[2];
    w.tickToSinceEnd(g, 100_000);
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, 179_000);
    assert.equal((await w.currentRoom(c)).hostUuid, null, '179초에 벌써 방장');
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal((await w.currentRoom(c)).hostUuid, c);
});

// ── 판 끝 칸에 닫힘 시각 ──
const END_EVENTS = [
    { label: '밤 암살로 끝남 night_result_applied (5명 판)', n: 5, how: 'jokerNightWin', event: 'night_result_applied' },
    { label: '재판 처형으로 끝남 tribunal_vote_resolved (7명 판)', n: 7, how: 'citizenWin', event: 'tribunal_vote_resolved' },
    { label: '나가서 끝남 player_eliminated (6명 판)', n: 6, how: 'jokerLeaves', event: 'player_eliminated' },
];
END_EVENTS.forEach((e, i) => {
    test(`A08-B-${String(148 + i).padStart(3, '0')} ${e.label} → resultClosesAt = 판 끝 시각 + 180,000`, async (t) => {
        const { w, g } = await endedGame(t, `b${148 + i}`, e.n, e.how);
        const watcher = g.uuids[0];
        const payload = w.received(watcher, e.event).find((p) => p.phase === 'ENDED');
        assert.ok(payload, `${e.event} 판 끝 칸 없음`);
        assert.equal(payload.resultClosesAt, g.endedAt + RESULT_MS);
    });
});

test('A08-B-151 8명 판 끝 직후·60초 뒤 스냅샷 → 둘 다 판 끝 칸과 같은 resultClosesAt', async (t) => {
    const { w, g } = await endedGame(t, 'b151', 8);
    const viewer = g.uuids[1];
    const fromEnd = w.received(viewer, 'tribunal_vote_resolved').find((p) => p.phase === 'ENDED')?.resultClosesAt;
    assert.ok(Number.isFinite(fromEnd), '판 끝 칸에 닫힘 시각 없음');
    const now = await w.snapshot(viewer, g.gameId);
    assert.equal(now.ok, true, `스냅샷 실패: ${now.code}`);
    assert.equal(now.resultClosesAt, fromEnd);
    w.tickToSinceEnd(g, 60_000);
    const later = await w.snapshot(viewer, g.gameId);
    assert.equal(later.ok, true, `60초 스냅샷 실패: ${later.code}`);
    assert.equal(later.resultClosesAt, fromEnd);
});

test('A08-B-152 6명 판 끝 직전 끊긴 산 사람 → 60초엔 아직 끝난 판에 묶임, 180초에 빠짐', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b152', n: 6 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    // 두 사람이 끊긴 채 판이 끝남 (X는 60초에, Y는 180초에 봄)
    const [x, y] = [g.uuids[1], g.uuids[2]];
    await w.disconnect(x);
    await w.disconnect(y);
    await w.endGame(g, 'jokerLeaves');
    w.tickToSinceEnd(g, 60_000);
    w.tick(1_000);
    await w.reconnect(x);
    const atSixty = await w.ret(x, g.gameId);
    assert.equal(atSixty.ok, true, `60초에 이미 빠짐: ${atSixty.code}`);
    w.tickToSinceEnd(g, RESULT_MS);
    await w.reconnect(y);
    const atEnd = await w.ret(y, g.gameId);
    assert.equal(atEnd.ok, false);
    assert.equal(atEnd.code, 'SESSION_ENDED');
});

// 시험 손잡이 경로를 바로 부름 (가짜 요청·답, 소켓·HTTP 안 띄움)
const HOOK_KEY = 'a08-close-results-key-0123456789abcdef';
function callRouter(router, url) {
    return new Promise((resolve, reject) => {
        const headers = { 'x-internal-key': HOOK_KEY };
        const req = { method: 'POST', url, originalUrl: url, headers, body: {}, get: (name) => headers[name.toLowerCase()] };
        const res = {
            statusCode: 200,
            set() { return res; },
            status(code) { res.statusCode = code; return res; },
            json(body) { resolve({ status: res.statusCode, body }); return res; },
        };
        router(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
    });
}

test('A08-B-155 6명 판 POST /e2e/games/:gameId/close-results → 180초가 지난 것과 같은 결과(결과 닫힘 알림·방장 자리 끝·빈 방 없어짐)', async (t) => {
    const w = makeWorld(t);
    const saved = process.env.E2E_HOOKS;
    t.after(() => { if (saved === undefined) delete process.env.E2E_HOOKS; else process.env.E2E_HOOKS = saved; });
    const g1 = await w.openAndStart({ prefix: 'b155x', n: 6 });
    const g2 = await w.openAndStart({ prefix: 'b155y', n: 6 });
    // 손잡이가 시계를 기억하게 켠 채로 판 끝
    process.env.E2E_HOOKS = '1';
    await w.endGame(g1, 'jokerLeaves');
    await w.endGame(g2, 'jokerLeaves');
    const b = g1.uuids[1];
    assert.equal((await w.ret(b, g1.gameId)).ok, true);
    const router = createE2eRouter({ env: { E2E_HOOKS: '1', NODE_ENV: 'test', INTERNAL_API_KEY: HOOK_KEY } });
    const first = await callRouter(router, `/games/${g1.gameId}/close-results`);
    const second = await callRouter(router, `/games/${g2.gameId}/close-results`);
    await w.flush();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    // 시계는 1초도 안 넘김
    assert.equal(Date.now(), g1.endedAt);
    // 결과 닫힘 알림: 결과 화면에 남은 사람 (판 1의 A·C, 판 2 전원 중 광대 빼고)
    assert.deepEqual(closedOf(w, g1.host), [{ gameId: g1.gameId, reason: 'RESULT_TIMEOUT' }]);
    assert.equal(closedOf(w, g2.uuids[1]).length, 1);
    assert.equal(closedOf(w, b).length, 0);
    // 방장 자리 끝: 판 1 방은 B가 방장
    const room = await w.currentRoom(b);
    assert.equal(room.hostUuid, b);
    assert.equal(room.reservedHostUuid, null);
    // 빈 방 없어짐: 판 2 방
    assert.equal(w.roomByCode(g2.roomCode), null);
});

test('A08-B-156 7명 판 결과 화면 2명·대기방 1명·원래 방장 결과 화면 → 180초 한 번에 결과 닫힘·방장 넘김·방 유지, 179초엔 셋 다 안 일어남', async (t) => {
    const { w, g } = await endedGame(t, 'b156', 7);
    const c = g.uuids[1];
    const stayers = [g.uuids[2], g.uuids[3]];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    for (const uuid of g.uuids.slice(4)) assert.equal((await w.lobby(uuid, g.gameId)).ok, true);
    w.tickToSinceEnd(g, 179_000);
    for (const uuid of [g.host, ...stayers]) assert.equal(closedOf(w, uuid).length, 0, `179초 ${uuid} 받음`);
    assert.equal((await w.currentRoom(c)).hostUuid, null, '179초 방장 넘어감');
    w.tickToSinceEnd(g, RESULT_MS);
    for (const uuid of [g.host, ...stayers]) assert.equal(closedOf(w, uuid).length, 1, `180초 ${uuid} 못 받음`);
    const room = await w.currentRoom(c);
    assert.equal(room.hostUuid, c);
    assert.deepEqual(room.players.map((p) => p.uuid), [c]);
    assert.ok(w.roomByCode(g.roomCode), '방 없어짐');
});

test('A08-B-157 5명 판 끝 60초에 전원 대기방으로·준비·시작 → 첫 판 180초 지남 → 둘째 판 그대로, 아무도 game_result_closed 안 받음', async (t) => {
    const { w, g } = await endedGame(t, 'b157', 5);
    w.tickToSinceEnd(g, 60_000);
    for (const uuid of [g.host, ...g.uuids.slice(1)]) assert.equal((await w.ret(uuid, g.gameId)).ok, true);
    for (const uuid of g.uuids) assert.equal((await w.ready(uuid)).ok, true);
    const g2 = await w.startGame(g.uuids, g.host, w.jokerPresets(g.uuids, 1));
    w.tickToSinceEnd(g, 181_000);
    const second = w.session(g2);
    assert.ok(second, '둘째 판이 없어짐');
    assert.notEqual(second.phase, 'ENDED');
    for (const uuid of g.uuids) assert.equal(closedOf(w, uuid).length, 0, `${uuid} 닫힘 알림 받음`);
    // 둘째 판이 계속 감
    w.advanceUntil(g2, (s) => s.dayIndex >= 1 && s.phase === 'DAY');
});

test('A08-B-158 5명 판 game_result_closed 값 → gameId·reason뿐, 남의 직업·자리 정보 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b158', 5);
    w.tickToSinceEnd(g, RESULT_MS);
    const [payload] = closedOf(w, g.uuids[1]);
    assert.deepEqual(Object.keys(payload).sort(), ['gameId', 'reason']);
});

test('A08-B-159 6명 판 179.9초에 C 누름·성공 → 180초 지나도 C 방 자리 그대로, 닫힘 알림 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b159', 6);
    const c = g.uuids[2];
    w.tickToSinceEnd(g, 179_900);
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, RESULT_MS);
    w.tick(1_000);
    assert.equal(closedOf(w, c).length, 0);
    assert.ok((await w.currentRoom(c))?.players.some((p) => p.uuid === c), 'C 방 자리 없어짐');
});

test('A08-B-160 5명 판 180초 뒤 그 판 스냅샷 → 끝난 판 없음 답 [지금 동작]', async (t) => {
    const { w, g } = await endedGame(t, 'b160', 5);
    w.tickToSinceEnd(g, RESULT_MS);
    const snap = await w.snapshot(g.uuids[1], g.gameId);
    assert.equal(snap.ok, false);
});

test('A08-B-161 6명 판 C "대기방으로" 답 전에 180초 → C는 방에 앉거나 로비, 둘 중 하나만', async (t) => {
    const { w, g } = await endedGame(t, 'b161', 6);
    const c = g.uuids[2];
    // 채널 넣기를 시험이 풀 때까지 붙잡는 새 탭 소켓 (답이 180초 뒤로 밀림), 판 채널 다시 잇기는 안 함 (그것도 붙잡혀서)
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    w.connect(c, { joinGate: gate });
    const pending = w.ret(c, g.gameId);
    await w.flush();
    w.tickToSinceEnd(g, RESULT_MS);
    openGate();
    const reply = await pending;
    const seated = (await w.currentRoom(c))?.players.some((p) => p.uuid === c) === true;
    const stillBound = (await w.snapshot(c, g.gameId)).ok === true;
    assert.equal(seated && stillBound, false, '방 자리와 끝난 판 묶임이 둘 다 남음');
    assert.equal(stillBound, false, '180초 뒤에도 끝난 판에 묶임');
    assert.equal(seated, reply.ok === true, '답과 방 자리가 다름');
});

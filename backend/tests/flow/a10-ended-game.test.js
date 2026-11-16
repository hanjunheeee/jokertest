'use strict';

// 로비 입장 정리 시험 — 끝난 판 묶임: 결과 화면 사람이 로비에 오면 끝난 판에서 빠짐, 그 뒤 만들기·코드 입장, 원래 방장 자리, 180초, 탈락한 사람
// 목록 A10-B-141~160 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-ended-game.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, gs, maintenance, NOTHING } = require('./a10-world');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

// 결과 화면이 열려 있는 시간 (결정「180초」)
const RESULT_MS = 180_000;

// 광대 아닌 사람 (판 끝 뒤 "로비에 오는 사람"으로 고름)
const citizens = (g) => g.uuids.filter((u) => !g.jokers.includes(u));

[[141, 5], [142, 7], [143, 10]].forEach(([no, n]) => {
    const id = `A10-B-${no}`;
    test(`${id} ${n}명 판 끝, 결과 화면 1명 로비 입장 → endedGame:true, 그 뒤 create_room ok`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openGame({ prefix: id, n });
        await w.playToCitizenWin(g);
        const a = citizens(g)[1];
        const reply = await w.lobby(a);
        assert.equal(reply.ok, true);
        assert.equal(reply.cleared.endedGame, true);
        const created = await w.createRoom(a);
        assert.equal(created.ok, true, `방 만들기 거절: ${created.message}`);
    });
});

test('A10-B-144 6명 판 끝, 1명 로비 → return_to_room ok:false, 다시 연 방 명단에 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b144', n: 6 });
    await w.playToCitizenWin(g);
    const [a, b] = citizens(g).slice(1, 3);
    await w.lobby(a);
    const back = await w.returnToRoom(a, g.gameId);
    assert.equal(back.ok, false);
    const other = await w.returnToRoom(b, g.gameId);
    assert.equal(other.ok, true);
    assert.ok(!other.room.players.some((p) => p.uuid === a), '로비 간 사람이 명단에 있음');
});

test('A10-B-145 7명 판 끝, A 로비, B "대기방으로" → A가 같은 코드로 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b145', n: 7 });
    await w.playToCitizenWin(g);
    const [a, b] = citizens(g).slice(1, 3);
    await w.lobby(a);
    assert.equal((await w.returnToRoom(b, g.gameId)).ok, true);
    const joined = await w.joinByCode(a, g.roomCode);
    assert.equal(joined.event, 'room_joined', `코드 입장 실패: ${joined.code}`);
});

test('A10-B-146 8명 판 끝, B·C 순서로 "대기방으로" → 원래 방장 A 로비 → 다시 연 방 host_changed 방장 = B', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b146', n: 8 });
    await w.playToCitizenWin(g);
    const [b, c] = citizens(g).filter((u) => u !== g.host).slice(0, 2);
    for (const u of [b, c]) assert.equal((await w.returnToRoom(u, g.gameId)).ok, true);
    await w.lobby(g.host);
    for (const u of [b, c]) assert.equal(w.received(u, 'host_changed').at(-1)?.hostUuid, b, `${u} 새 방장 알림`);
});

test('A10-B-147 6명 판 끝, 원래 방장 로비 (아무도 안 들어옴) → 그 뒤 처음 "대기방으로" 누른 사람이 방장', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b147', n: 6 });
    await w.playToCitizenWin(g);
    await w.lobby(g.host);
    const first = citizens(g).filter((u) => u !== g.host)[2];
    const back = await w.returnToRoom(first, g.gameId);
    assert.equal(back.ok, true);
    assert.equal(back.room.hostUuid, first);
});

test('A10-B-148 정원 5·5명 판 끝, 4명 "대기방으로"(방장 자리 1칸 남김) → 원래 방장 로비 → 새 사람 코드 입장 됨 (5명)', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b148', n: 5, maxPlayers: 5 });
    await w.playToCitizenWin(g);
    for (const u of g.uuids.filter((x) => x !== g.host)) assert.equal((await w.returnToRoom(u, g.gameId)).ok, true, `${u} 대기방으로 실패`);
    await w.lobby(g.host);
    await w.connect('b148-new');
    const joined = await w.joinByCode('b148-new', g.roomCode);
    assert.equal(joined.event, 'room_joined', `새 사람 입장 실패: ${joined.code}`);
    assert.equal(joined.players.length, 5);
});

test('A10-B-149 6명 판 끝, 6명 모두 로비 입장 → 각자 endedGame:true, 6명 모두 create_room ok', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b149', n: 6 });
    await w.playToCitizenWin(g);
    for (const u of g.uuids) assert.equal((await w.lobby(u)).cleared.endedGame, true, `${u} 끝난 판에서 안 빠짐`);
    for (const u of g.uuids) {
        const created = await w.createRoom(u);
        assert.equal(created.ok, true, `${u} 방 만들기 거절: ${created.message}`);
    }
});

test('A10-B-150 7명 판 끝, A 로비 → 180초 → A 소켓 game_result_closed 0개, 결과 화면 나머지는 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b150', n: 7 });
    await w.playToCitizenWin(g);
    const a = citizens(g)[1];
    await w.lobby(a);
    await w.tickBy(RESULT_MS + 1_000);
    assert.equal(w.count(a, 'game_result_closed'), 0);
    for (const u of g.uuids.filter((x) => x !== a)) assert.equal(w.count(u, 'game_result_closed'), 1, `${u} 닫힘 알림 못 받음`);
});

test('A10-B-151 8명 판 끝, A "대기방으로"로 다시 연 방에 앉음 → A 로비 → room:true, A create_room ok', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b151', n: 8 });
    await w.playToCitizenWin(g);
    const a = citizens(g)[2];
    assert.equal((await w.returnToRoom(a, g.gameId)).ok, true);
    const reply = await w.lobby(a);
    assert.equal(reply.cleared.room, true);
    assert.equal((await w.createRoom(a)).ok, true);
});

test('A10-B-152 5명 판 끝, 181초 지난 뒤 A 로비 → cleared 전부 false', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b152', n: 5 });
    await w.playToCitizenWin(g);
    await w.tickBy(181_000);
    const reply = await w.lobby(citizens(g)[1]);
    assert.deepEqual(reply.cleared, { ...NOTHING });
});

test('A10-B-153 10명 판 끝, A 로비 두 번 → 둘째 endedGame:false, 오류 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b153', n: 10 });
    await w.playToCitizenWin(g);
    const a = citizens(g)[4];
    assert.equal((await w.lobby(a)).cleared.endedGame, true);
    const second = await w.lobby(a);
    assert.equal(second.ok, true);
    assert.equal(second.cleared.endedGame, false);
});

// 판 끝내는 길 넷 (광대 수는 그 길이 짧게 끝나게 고름)
const ENDINGS = [
    ['A10-B-154', '6명 시민 승', { n: 6 }, async (w, g) => w.playToCitizenWin(g)],
    ['A10-B-155', '7명 광대 승', { n: 7, jokerCount: 2 }, async (w, g) => {
        const c = citizens(g);
        await w.voteOut(g, c[0]);
        await w.nightKill(g, c[1]);
        await w.voteOut(g, c[2]);
    }],
    ['A10-B-156', '8명 밤 암살로 끝', { n: 8, jokerCount: 2 }, async (w, g) => {
        const c = citizens(g);
        await w.voteOut(g, c[0]);
        await w.nightKill(g, c[1]);
        await w.voteOut(g, c[2]);
        await w.nightKill(g, c[3]);
    }],
    ['A10-B-157', '5명 재판 처형으로 끝', { n: 5 }, async (w, g) => w.voteOut(g, g.joker)],
];
for (const [id, label, spec, finish] of ENDINGS) {
    test(`${id} (${label}) → 결과 화면 1명 로비 → endedGame:true, create_room ok`, async (t) => {
        const w = makeWorld(t);
        const roles = spec.jokerCount
            ? Object.fromEntries(Array.from({ length: spec.jokerCount }, (_, i) => [`${id}-${spec.n - 1 - i}`, 'JOKER']))
            : null;
        const g = await w.openGame({ prefix: id, ...spec, roles });
        await finish(w, g);
        assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
        const alive = w.aliveOf(g.gameId);
        const a = alive.find((u) => !g.jokers.includes(u)) ?? alive[0];
        const reply = await w.lobby(a);
        assert.equal(reply.cleared.endedGame, true);
        assert.equal((await w.createRoom(a)).ok, true);
    });
}

test('A10-B-158 7명 판 점검 강제 종료(결과 화면 없이 판을 바로 지움) → 그 판 1명 로비 → endedGame:false, create_room은 점검 거절', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b158', n: 7 });
    await w.toDay(g);
    maintenance.__setStateForTests({ enabled: true });
    assert.equal(abortGamesForMaintenance(w.io), 1, '준비: 판이 안 끝남');
    await w.settle();
    const a = citizens(g)[1];
    const reply = await w.lobby(a);
    assert.equal(reply.ok, true);
    assert.equal(reply.cleared.endedGame, false);
    const created = await w.createRoom(a);
    assert.equal(created.ok, false);
    assert.equal(created.code, 'MAINTENANCE');
});

test('A10-B-159 6명 판, 1일 밤 죽은 A, 판 끝 → A 로비 → endedGame:true, create_room ok', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b159', n: 6 });
    const a = citizens(g)[1];
    await w.killFirstNight(g, a);
    await w.voteOut(g, g.joker);
    assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
    const reply = await w.lobby(a);
    assert.equal(reply.cleared.endedGame, true);
    assert.equal((await w.createRoom(a)).ok, true);
});

test('A10-B-160 8명 판 산 A 끊김 → 61초 탈락 → A 새 소켓 로비 → cleared 전부 false, create_room 탈주 대기 거절', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b160', n: 8 });
    await w.toDay(g);
    const a = citizens(g)[2];
    w.closeSocket(w.sock(a));
    await w.tickBy(61_000);
    assert.equal(w.session(g.gameId)?.players.get(a)?.alive ?? false, false, '준비: 61초에 탈락 안 됨');
    await w.connect(a);
    const reply = await w.lobby(a);
    assert.deepEqual(reply.cleared, { ...NOTHING });
    const created = await w.createRoom(a);
    assert.equal(created.ok, false);
    assert.equal(created.code, 'DESERTION_COOLDOWN');
});

// gs 불러 둠 (판 쪽 로비 정리 손을 끼우는 파일)
void gs;

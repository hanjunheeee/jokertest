'use strict';

// "대기방으로"(return_to_room) 시험 — 누른 사람만 같은 방에 준비 안 됨으로 들어감, 서버가 끌어다 넣지 않음, 두 번 눌러도 한 자리, 결과 화면 사람만 됨(로비로 간 사람·판 밖 사람·판 중 나간 사람 거절), 들어가면 끝난 판에서 빠짐, 죽은 사람도 결과 화면에 있으면 됨
// 목록 A08-B-056~072·082~092 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-return-only-pressed.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

// 판 하나 열고 광대 처형으로 끝냄
async function endedGame(t, prefix, n, how = 'citizenWin') {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    await w.endGame(g, how);
    return { w, g };
}

// 방 명단 uuid 목록
const rosterOf = (room) => room.players.map((p) => p.uuid);

test('A08-B-056 6명 판 return_to_room { gameId } → { ok:true, room }, room에 코드·설정·명단·hostUuid·reservedHostUuid', async (t) => {
    const { w, g } = await endedGame(t, 'b056', 6);
    const r = await w.ret(g.uuids[1], g.gameId);
    assert.equal(r.ok, true, `실패: ${r.code}`);
    assert.equal(r.room.roomCode, g.roomCode);
    assert.equal(typeof r.room.settings, 'object');
    assert.deepEqual(rosterOf(r.room), [g.uuids[1]]);
    assert.equal(Object.hasOwn(r.room, 'hostUuid'), true);
    assert.equal(r.room.hostUuid, null);
    assert.equal(r.room.reservedHostUuid, g.host);
});

test('A08-B-057 5명 판에서 준비 누른 적 있는 사람이 들어감 → 명단에 isReady false', async (t) => {
    const { w, g } = await endedGame(t, 'b057', 5);
    // openAndStart에서 전원 준비를 눌렀음
    const r = await w.ret(g.uuids[2], g.gameId);
    assert.equal(r.ok, true, `실패: ${r.code}`);
    assert.equal(r.room.players.find((p) => p.uuid === g.uuids[2]).isReady, false);
});

// ── 전원 누르면 전원 (판 인원 5~10) ──
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A08-B-${String(58 + i).padStart(3, '0')} ${n}명 판 전원 차례로 누름 → 명단 = 판 사람 전원, 전원 준비 안 됨`, async (t) => {
        const { w, g } = await endedGame(t, `b${58 + i}`, n);
        let last = null;
        for (const uuid of g.uuids) {
            last = await w.ret(uuid, g.gameId);
            assert.equal(last.ok, true, `${uuid} 실패: ${last.code}`);
        }
        assert.deepEqual(rosterOf(last.room).sort(), [...g.uuids].sort());
        assert.ok(last.room.players.every((p) => p.isReady === false));
    });
});

// ── 한 명만 누르면 한 명 ──
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A08-B-${String(64 + i).padStart(3, '0')} ${n}명 판 한 명만 누름 → 명단 1명, 나머지는 방 자리 없음`, async (t) => {
        const { w, g } = await endedGame(t, `b${64 + i}`, n);
        const presser = g.uuids[1];
        const r = await w.ret(presser, g.gameId);
        assert.equal(r.ok, true, `실패: ${r.code}`);
        assert.deepEqual(rosterOf(r.room), [presser]);
        for (const uuid of g.uuids.filter((u) => u !== presser)) {
            assert.equal(await w.currentRoom(uuid), null, `${uuid} 방 자리 있음`);
        }
    });
});

// ── 서버가 끌어다 넣지 않음 (방장이 누름) ──
[5, 7, 10].forEach((n, i) => {
    test(`A08-B-${String(70 + i).padStart(3, '0')} ${n}명 판 방장이 누름 → 나머지 누구에게도 room_joined·본인 입장 알림 없음, 방 자리 없음`, async (t) => {
        const { w, g } = await endedGame(t, `b${70 + i}`, n);
        const r = await w.ret(g.host, g.gameId);
        assert.equal(r.ok, true, `실패: ${r.code}`);
        w.tick(1_000);
        for (const uuid of g.uuids.filter((u) => u !== g.host)) {
            const joinedAfterEnd = w.received(uuid, 'room_joined').filter((room) => room.roomId === r.room.roomId);
            assert.equal(joinedAfterEnd.length, 0, `${uuid} room_joined 받음`);
            const selfJoined = w.received(uuid, 'player_joined_room').filter((p) => p.player?.uuid === uuid);
            assert.equal(selfJoined.length, 0, `${uuid} 본인 입장 알림 받음`);
            assert.equal(await w.currentRoom(uuid), null, `${uuid} 방 자리 있음`);
        }
    });
});

test('A08-B-082 5명 판 B 로비로 → B return_to_room → SESSION_ENDED', async (t) => {
    const { w, g } = await endedGame(t, 'b082', 5);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    const r = await w.ret(b, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SESSION_ENDED');
});

test('A08-B-083 6명 판 들어간 뒤 같은 사람 다시 보냄 → ok:true·같은 방, 명단에 1번만', async (t) => {
    const { w, g } = await endedGame(t, 'b083', 6);
    const c = g.uuids[2];
    const first = await w.ret(c, g.gameId);
    const second = await w.ret(c, g.gameId);
    assert.equal(first.ok, true, `첫째 실패: ${first.code}`);
    assert.equal(second.ok, true, `둘째 실패: ${second.code}`);
    assert.equal(second.room.roomId, first.room.roomId);
    assert.equal(rosterOf(second.room).filter((u) => u === c).length, 1);
});

test('A08-B-084 7명 판 같은 사람이 답 기다리지 않고 두 번 보냄 → 명단 1번, 둘째 답은 같은 방 또는 REQUEST_IN_PROGRESS', async (t) => {
    const { w, g } = await endedGame(t, 'b084', 7);
    const c = g.uuids[2];
    const [first, second] = await Promise.all([w.ret(c, g.gameId), w.ret(c, g.gameId)]);
    assert.equal(first.ok, true, `첫째 실패: ${first.code}`);
    if (second.ok) assert.equal(second.room.roomId, first.room.roomId);
    else assert.equal(second.code, 'REQUEST_IN_PROGRESS');
    const room = await w.currentRoom(c);
    assert.equal(rosterOf(room).filter((u) => u === c).length, 1);
});

test('A08-B-085 5명 판 밖 계정이 그 gameId로 보냄 → SESSION_ENDED, 방 명단 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b085', 5);
    await w.ret(g.uuids[1], g.gameId);
    const outsider = 'b085-out';
    w.connect(outsider);
    const r = await w.ret(outsider, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SESSION_ENDED');
    assert.deepEqual(rosterOf(await w.currentRoom(g.uuids[1])), [g.uuids[1]]);
});

test('A08-B-086 gameId 빠진 요청 → INVALID_REQUEST [지금 동작]', async (t) => {
    const { w, g } = await endedGame(t, 'b086', 5);
    const r = await w.ret(g.uuids[1], null, {});
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_REQUEST');
});

test('A08-B-087 6명 판 C 들어감 → C 판 상태 물으면 끝난 판 없음, 그 판 채널 방송 안 받음', async (t) => {
    const { w, g } = await endedGame(t, 'b087', 6);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    const snap = await w.snapshot(c, g.gameId);
    assert.equal(snap.ok, false, '끝난 판 상태가 옴');
    // 판 채널에 시험 방송 하나 → 결과 화면에 남은 사람은 받고 C는 못 받음
    w.io.to(w.session(g).channelId).emit('a08_probe', { n: 1 });
    assert.equal(w.received(c, 'a08_probe').length, 0);
    assert.equal(w.received(g.uuids[3], 'a08_probe').length, 1, '남은 사람도 못 받음 (준비 잘못)');
});

test('A08-B-088 5명 판 A 들어간 뒤 B 들어감 → A가 player_joined_room(B, 준비 안 됨) 받음', async (t) => {
    const { w, g } = await endedGame(t, 'b088', 5);
    const [a, b] = [g.uuids[1], g.uuids[2]];
    assert.equal((await w.ret(a, g.gameId)).ok, true);
    assert.equal((await w.ret(b, g.gameId)).ok, true);
    const notice = w.received(a, 'player_joined_room').find((p) => p.player?.uuid === b);
    assert.ok(notice, 'A가 B 들어옴 알림 못 받음');
    assert.equal(notice.player.isReady, false);
});

test('A08-B-089 7명 판 재판에서 처형된 사람이 결과 화면에서 누름 → 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b089', n: 7 });
    const executed = g.uuids[3];
    await w.day(g, executed);
    assert.equal(w.alivePlayers(g).includes(executed), false, '처형 안 됨 (준비 잘못)');
    await w.endGame(g);
    const r = await w.ret(executed, g.gameId);
    assert.equal(r.ok, true, `실패: ${r.code}`);
    assert.ok(rosterOf(r.room).includes(executed));
});

test('A08-B-090 7명 판 밤에 죽은 사람이 결과 화면에서 누름 → 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b090', n: 7 });
    const killed = g.uuids[3];
    await w.day(g, null);
    await w.night(g, killed);
    assert.equal(w.alivePlayers(g).includes(killed), false, '밤에 안 죽음 (준비 잘못)');
    await w.endGame(g);
    const r = await w.ret(killed, g.gameId);
    assert.equal(r.ok, true, `실패: ${r.code}`);
    assert.ok(rosterOf(r.room).includes(killed));
});

test('A08-B-091 6명 판 중 죽은 뒤 나간 사람 return_to_room → SESSION_ENDED', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b091', n: 6 });
    const dead = g.uuids[2];
    await w.day(g, dead);
    assert.equal((await w.lobby(dead, g.gameId)).ok, true);
    await w.endGame(g);
    const r = await w.ret(dead, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SESSION_ENDED');
});

test('A08-B-092 5명 판 중 산 채로 나간 사람 → 판 끝 뒤 return_to_room 거절, 방 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b092', n: 5 });
    const leaver = g.uuids[2];
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    assert.equal((await w.lobby(leaver, g.gameId)).ok, true);
    await w.endGame(g);
    assert.equal((await w.ret(g.uuids[1], g.gameId)).ok, true);
    const r = await w.ret(leaver, g.gameId);
    assert.equal(r.ok, false, '산 채로 나간 사람이 들어감');
    assert.deepEqual(rosterOf(await w.currentRoom(g.uuids[1])), [g.uuids[1]]);
});

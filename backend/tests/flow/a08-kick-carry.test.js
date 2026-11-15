'use strict';

// 추방 기록이 판을 건너 같은 방에 남는지 시험 — 판 전 3번이면 판 끝 뒤에도 못 들어옴, 2번이면 들어옴, 판 전·뒤 합쳐 3번, 판 한 사람도 이어짐, 기록은 그 방 것만, 두 판 건너도 남음
// 목록 A08-B-174~179 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-kick-carry.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

// 방장이 그 사람을 방에서 한 번 쫓아냄 (안에 없으면 먼저 코드로 들어오게 함)
async function kickOnce(w, host, code, target) {
    if (!(await w.currentRoom(target))) {
        const joined = await w.joinCode(target, code);
        assert.equal(joined.ok, true, `${target} 입장 실패: ${joined.code}`);
    }
    const r = await w.kick(host, target);
    assert.equal(r.ok, true, `추방 실패: ${r.code}`);
    assert.equal(await w.currentRoom(target), null);
}

// 대기방 만들기 → kicks[uuid]번 추방 → 판 사람 입장·준비 → 시작 (kicks에 판 사람이 있으면 쫓긴 뒤 다시 들어와 판 함)
async function openWithKicks(w, { prefix, n, kicks }) {
    const people = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
    for (const uuid of [...people, ...Object.keys(kicks)]) if (!w.sock(uuid)) w.connect(uuid);
    const [host, ...guests] = people;
    const created = await w.createRoom(host, w.roomPayload({ maxPlayers: n }));
    assert.equal(created.ok, true);
    const code = created.room.roomCode;
    for (const [target, count] of Object.entries(kicks)) {
        for (let i = 0; i < count; i += 1) await kickOnce(w, host, code, target);
    }
    for (const uuid of guests) assert.equal((await w.joinCode(uuid, code)).ok, true, `${uuid} 입장 실패`);
    for (const uuid of people) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    return w.startGame(people, host, w.jokerPresets(people, 1));
}

// 판 끝 → 방장 대기방으로 (방장이 쫓아낼 수 있게)
async function endAndHostBack(w, g) {
    await w.endGame(g);
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.ok, true, `방장 대기방으로 실패: ${r.code}`);
}

test('A08-B-174 6명 판 전 대기방에서 X 3번 추방 → 판 → 판 끝 뒤 X 코드 입장 → KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const x = 'b174-x';
    const g = await openWithKicks(w, { prefix: 'b174', n: 6, kicks: { [x]: 3 } });
    await w.endGame(g);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'KICKED_TOO_MANY_TIMES');
});

test('A08-B-175 5명 판 전 X 2번 추방 → 판 끝 뒤 X 코드 입장 → 들어감', async (t) => {
    const w = makeWorld(t);
    const x = 'b175-x';
    const g = await openWithKicks(w, { prefix: 'b175', n: 5, kicks: { [x]: 2 } });
    await w.endGame(g);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

test('A08-B-176 5명 판 전 2번 + 판 뒤 1번 더 추방 → X 코드 입장 → KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const x = 'b176-x';
    const g = await openWithKicks(w, { prefix: 'b176', n: 5, kicks: { [x]: 2 } });
    await endAndHostBack(w, g);
    await kickOnce(w, g.host, g.roomCode, x);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'KICKED_TOO_MANY_TIMES');
});

test('A08-B-177 6명 판 전 Y 2번 추방(다시 들어와 판 함) → 대기방으로 → 1번 추방 → Y 코드 입장 → KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const y = 'b177-3';
    const g = await openWithKicks(w, { prefix: 'b177', n: 6, kicks: { [y]: 2 } });
    assert.ok(g.uuids.includes(y));
    await endAndHostBack(w, g);
    const back = await w.ret(y, g.gameId);
    assert.equal(back.ok, true, `Y 대기방으로 실패: ${back.code}`);
    await kickOnce(w, g.host, g.roomCode, y);
    const joined = await w.joinCode(y, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'KICKED_TOO_MANY_TIMES');
});

test('A08-B-178 5명 판 X 3번 추방된 뒤 다른 방 코드 입장 → 들어감', async (t) => {
    const w = makeWorld(t);
    const x = 'b178-x';
    const g = await openWithKicks(w, { prefix: 'b178', n: 5, kicks: { [x]: 3 } });
    await w.endGame(g);
    const other = 'b178-other';
    w.connect(other);
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true);
    const joined = await w.joinCode(x, created.room.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

test('A08-B-179 6명 판1 전 1번 → 판1 끝 대기방에서 1번 → 판2 → 판2 끝 대기방에서 1번 → 코드 입장 KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const x = 'b179-x';
    const g1 = await openWithKicks(w, { prefix: 'b179', n: 6, kicks: { [x]: 1 } });
    await endAndHostBack(w, g1);
    await kickOnce(w, g1.host, g1.roomCode, x);
    for (const uuid of g1.uuids.slice(1)) assert.equal((await w.ret(uuid, g1.gameId)).ok, true, `${uuid} 대기방으로 실패`);
    for (const uuid of g1.uuids) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    const g2 = await w.startGame(g1.uuids, g1.host, w.jokerPresets(g1.uuids, 1));
    assert.equal(g2.roomCode, g1.roomCode);
    await endAndHostBack(w, g2);
    await kickOnce(w, g2.host, g2.roomCode, x);
    const joined = await w.joinCode(x, g2.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'KICKED_TOO_MANY_TIMES');
});

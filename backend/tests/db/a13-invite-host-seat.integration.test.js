'use strict';

// 판 끝 뒤 남긴 방장 칸과 초대 보내기 DB 시험 — 방장 칸 때문에 꽉 찬 방에선 409, 원래 방장이 "로비로" 가면 보내짐
// 목록 A13-B-367~368 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-invite-host-seat.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, createUsers, befriend, callController } = W;
const inviteController = require('../../controllers/friend/invites');
// 판 세상은 models 다음에 (A08 것을 읽기만 해서 씀)
const { makeWorld } = require('../flow/a08-world');
const noDb = W.useTestDb(test);

// 6명 판(정원 6) 끝 → 원래 방장 빼고 5명 대기방 → 안의 사람(inside)과 방 밖 친구
async function hostSeatHeld(t) {
    const w = makeWorld(t, { now: Math.floor(Date.now() / 1000) * 1000 });
    const people = await createUsers(6, 'g');
    const inside = people[1];
    const friend = await createUser('fr');
    await befriend(inside, friend);
    const g = await w.openAndStart({ uuids: people, n: 6, maxPlayers: 6 });
    await w.endGame(g);
    for (const uuid of people.slice(1)) assert.equal((await w.ret(uuid, g.gameId)).ok, true, `${uuid} 대기방으로 실패`);
    w.connect(friend);
    const invite = () => callController(inviteController.createInvite, {
        user: { uuid: inside }, body: { receiverId: friend, creationKey: `k-${crypto.randomUUID()}` },
    });
    return { w, g, inside, friend, invite };
}

test('A13-B-367 6명 판(정원 6) 끝, 원래 방장 빼고 5명 대기방 → 안의 사람이 친구 초대 → 409 "방이 가득 차 초대를 보낼 수 없습니다.", 초대 0', async (t) => {
    if (noDb(t)) return;
    const { inside, invite } = await hostSeatHeld(t);
    const made = await invite();
    assert.equal(made.status, 409);
    assert.equal(made.body.message, '방이 가득 차 초대를 보낼 수 없습니다.');
    assert.equal(await db.GameInvite.count({ where: { sender_id: inside } }), 0);
});

test('A13-B-368 위 상태에서 원래 방장 "로비로" → 초대 보내기 201', async (t) => {
    if (noDb(t)) return;
    const { w, g, invite } = await hostSeatHeld(t);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true, '로비로 실패');
    const made = await invite();
    assert.equal(made.status, 201, made.body?.message);
});

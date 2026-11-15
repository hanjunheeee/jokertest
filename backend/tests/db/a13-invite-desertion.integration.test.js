'use strict';

// 탈주 대기 중인 친구 초대 DB 시험 — 판에서 산 채 나간 친구에게도 초대·알림이 가고, 거절도 됨 (막는 것은 수락만)
// 목록 A13-B-365~366 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-invite-desertion.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, createUsers, befriend, callController } = W;
const inviteController = require('../../controllers/friend/invites');
// 판 세상은 models 다음에 (A08 것을 읽기만 해서 씀)
const { makeWorld } = require('../flow/a08-world');
const noDb = W.useTestDb(test);

// 6명 판에서 지유가 산 채 나감 → 판 밖 민수가 대기방을 열고 지유를 초대 → { w, minsu, jiyu, made }
async function inviteDeserter(t) {
    const w = makeWorld(t, { now: Math.floor(Date.now() / 1000) * 1000 });
    const people = await createUsers(6, 'g');
    const jiyu = people[1];
    const minsu = await createUser('ms');
    await befriend(minsu, jiyu);
    const g = await w.openAndStart({ uuids: people, n: 6 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    assert.equal((await w.lobby(jiyu, g.gameId)).ok, true, '판 나가기 실패');
    w.connect(minsu);
    const created = await w.createRoom(minsu, w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
    const made = await callController(inviteController.createInvite, {
        user: { uuid: minsu }, body: { receiverId: jiyu, creationKey: `k-${crypto.randomUUID()}` },
    });
    return { w, minsu, jiyu, made };
}

test('A13-B-365 6명 판: 지유가 산 채 나감(대기 5분) → 민수가 지유 초대 → 초대·알림 생김', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu, made } = await inviteDeserter(t);
    assert.equal(made.status, 201, made.body?.message);
    assert.equal(await db.GameInvite.count({ where: { sender_id: minsu, receiver_id: jiyu } }), 1);
    assert.equal(await db.Notification.count({ where: { user_id: jiyu, type: 'game-invite' } }), 1);
});

test('A13-B-366 6명 판: 위 초대를 탈주 대기 중에 거절 → DECLINED', async (t) => {
    if (noDb(t)) return;
    const { jiyu, made } = await inviteDeserter(t);
    assert.equal(made.status, 201, made.body?.message);
    const declined = await callController(inviteController.declineInvite, { user: { uuid: jiyu }, params: { inviteId: made.body.data.inviteId } });
    assert.equal(declined.status, 200, declined.body?.message);
    assert.equal((await db.GameInvite.findByPk(made.body.data.inviteId, { raw: true })).status, 'DECLINED');
});

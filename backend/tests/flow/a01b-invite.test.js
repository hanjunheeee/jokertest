'use strict';

// 친구 초대로 들어오기 흐름 시험 — 초대 알림, 누구나 초대, 수락하면 들어옴(준비 안 됨), 판 중·다른 방·가득 참·쫓겨남·시작된 방·탈주·삭제·재시작·처리 중·15초·남의 초대·모양, 명단 순서, 목록 인원
// 목록 A01-B-581~600·609~610 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "친구 초대로 들어오기"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-invite.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MSG, kickTimes } = require('./a01b-world');
const byId = require('../../game-core/queries/byId');

test('A01-B-581 정원 6 · 지금 2명, 방장이 친구 초대 → 받는 친구 소켓에 초대 알림(보낸 사람 닉네임), 초대 상태 PENDING', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b581-h', guests: ['b581-g'], maxPlayers: 6 });
    w.connect('friend');
    await w.invite(room.host, 'friend');
    const got = w.received('friend', 'game_invite_received');
    assert.equal(got.length, 1);
    assert.equal(got[0].invite.senderName, '닉-b581-h');
    assert.equal(got[0].invite.status, 'PENDING');
});

test('A01-B-582 정원 6 · 지금 3명, 방장 아닌 손님이 초대 → 성공, 친구에게 알림', async (t) => {
    const w = makeWorld(t);
    await w.openRoom({ host: 'b582-h', guests: ['b582-a', 'b582-b'], maxPlayers: 6 });
    w.connect('friend');
    w.store.befriend('b582-a', 'friend');
    const made = await w.createInvite('b582-a', 'friend');
    assert.equal(made.status, 201, made.error?.message);
    const got = w.received('friend', 'game_invite_received');
    assert.equal(got.length, 1);
    assert.equal(got[0].invite.senderId, 'b582-a');
});

test('A01-B-583 정원 7 · 지금 4명, accept_game_invite → 답 { ok: true, room }, 방 사람 전원 player_joined_room', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b583-h', guests: ['b583-a', 'b583-b', 'b583-c'], maxPlayers: 7 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, true, `수락 실패: ${reply.code} ${reply.message}`);
    assert.equal(reply.room.roomId, room.roomId);
    for (const uuid of room.uuids) assert.equal(w.last(uuid, 'player_joined_room')?.player.uuid, 'friend', uuid);
});

test('A01-B-584 정원 7, 초대 수락한 사람은 답 방 명단에서 isReady: false', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b584-h', guests: ['b584-a'], maxPlayers: 7 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, true, `수락 실패: ${reply.code}`);
    assert.equal(reply.room.players.find((p) => p.uuid === 'friend')?.isReady, false);
});

test('A01-B-585 판 6명 중인 사람이 남은 초대 수락 → ALREADY_IN_GAME', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b585-h', maxPlayers: 6 });
    // 초대 받을 때는 판 밖, 그 뒤 판에 들어감 (판 사람 이름 = b585-0~5)
    w.connect('b585-1');
    const inviteId = await w.invite(room.host, 'b585-1');
    w.seedGame({ id: 'b585', n: 6 });
    const reply = await w.accept('b585-1', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ALREADY_IN_GAME');
});

test('A01-B-586 다른 방에 있는 사람이 초대 수락 → ALREADY_IN_ROOM "이미 참여 중인 방이 있습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b586-h', maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const other = await w.openRoom({ host: 'b586-oh', maxPlayers: 6 });
    await w.joinByCode('friend', other.roomCode);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ALREADY_IN_ROOM');
    assert.equal(reply.message, MSG.ALREADY_IN_ROOM);
});

test('A01-B-587 정원 5, 초대 뒤 방이 꽉 참 → 수락 ROOM_FULL "방이 가득 찼습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b587-h', maxPlayers: 5 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    for (const u of w.names('b587-f', 4)) { w.connect(u); await w.joinByCode(u, room.roomCode); }
    assert.equal((await w.roster(room.host)).length, 5);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ROOM_FULL');
    assert.equal(reply.message, MSG.ROOM_FULL);
});

test('A01-B-588 정원 8, 그 방에서 3번 쫓겨난 사람이 초대 수락 → KICKED_TOO_MANY_TIMES "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b588-h', guests: ['b588-g', 'b588-x'], maxPlayers: 8 });
    await kickTimes(w, room, 'b588-x', 3);
    w.store.befriend('b588-g', 'b588-x');
    const made = await w.createInvite('b588-g', 'b588-x');
    assert.ok(made.invite, made.error?.message);
    const reply = await w.accept('b588-x', made.invite.inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'KICKED_TOO_MANY_TIMES');
    assert.equal(reply.message, MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-589 대기방 때 받은 초대를 판 5명 진행 중에 수락 → 거절 ROOM_NOT_FOUND "방을 찾을 수 없습니다.", 판 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b589-0', guests: w.names('b589', 5).slice(1), maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    await w.startRoom(room);
    const session = byId.getSessionById(byId.getPlayerGameId(room.host));
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ROOM_NOT_FOUND');
    assert.equal(reply.message, '방을 찾을 수 없습니다.');
    assert.deepEqual([...session.players.keys()].sort(), [...room.uuids].sort());
});

test('A01-B-590 정원 6, 탈주 대기 중 수락 → 답 { ok: false, code: DESERTION_COOLDOWN, message: "탈주로 …", retryAfterMs }, 초대는 그대로 대기', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b590-h', maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    await w.desert('friend', 200_000);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'DESERTION_COOLDOWN');
    assert.equal(reply.message, '탈주로 3분 20초 뒤에 참여할 수 있습니다.');
    assert.ok(Math.abs(reply.retryAfterMs - 200_000) <= 1_000, `retryAfterMs ${reply.retryAfterMs}`);
    assert.equal(w.store.row(inviteId).status, 'PENDING');
});

test('A01-B-591 정원 6, 탈주 대기가 끝난 뒤(가짜 시계) 초대 3분 안 같은 초대 수락 → 성공', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b591-h', maxPlayers: 6 });
    w.connect('friend');
    // 남은 탈주 대기 60초 (초대 3분보다 짧게)
    await w.desert('friend', 60_000);
    const inviteId = await w.invite(room.host, 'friend');
    const blocked = await w.accept('friend', inviteId);
    assert.equal(blocked.code, 'DESERTION_COOLDOWN');
    w.tick(60_000);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, true, `수락 실패: ${reply.code} ${reply.message}`);
    assert.ok((await w.roster(room.host)).includes('friend'));
});

test('A01-B-592 정원 6, 방장이 방 삭제한 뒤 수락 → 거절, 방 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b592-h', guests: ['b592-g'], maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    assert.equal((await w.send(room.host, 'delete_room', {})).ok, true);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(await w.currentRoom('friend'), null);
});

test('A01-B-593 서버 다시 켠 뒤 옛 초대(부팅 번호 다름) 수락 → SERVER_RESTARTED "초대가 더 이상 유효하지 않습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b593-h', maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    // 앞 서버가 만든 초대 (부팅 번호만 다름)
    w.store.row(inviteId).boot_epoch = 'old-boot-epoch';
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SERVER_RESTARTED');
    assert.equal(reply.message, '초대가 더 이상 유효하지 않습니다.');
});

test('A01-B-594 정원 6, 수락 단계 중간(자리만 잡음) → 방 사람에게 player_joined_room 0번, 확정 뒤 1번', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b594-h', guests: ['b594-g'], maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const gate = w.gates.pause('decision');
    const answer = w.sendLater('friend', 'accept_game_invite', { inviteId });
    await gate.reached;
    await w.flush();
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'player_joined_room').filter((e) => e.player.uuid === 'friend').length, 0, uuid);
    gate.release();
    assert.equal((await answer).ok, true);
    await w.flush();
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'player_joined_room').filter((e) => e.player.uuid === 'friend').length, 1, uuid);
});

test('A01-B-595 정원 6, 초대 입장 확정 전 set_ready → { ok: false } "입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b595-h', maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const gate = w.gates.pause('decision');
    const answer = w.sendLater('friend', 'accept_game_invite', { inviteId });
    await gate.reached;
    const r = await w.ready('friend', room);
    assert.equal(r.ok, false);
    assert.equal(r.message, '입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.');
    gate.release();
    await answer;
});

test('A01-B-596 정원 6, 같은 초대 수락 두 번 빠르게 → 둘째 REQUEST_IN_PROGRESS, 명단에 그 사람 1줄', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b596-h', maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const first = w.sendLater('friend', 'accept_game_invite', { inviteId });
    const second = w.sendLater('friend', 'accept_game_invite', { inviteId });
    const [a, b] = await Promise.all([first, second]);
    await w.flush();
    assert.equal(a.ok, true, `첫 수락 실패: ${a.code}`);
    assert.equal(b.ok, false);
    assert.equal(b.code, 'REQUEST_IN_PROGRESS');
    assert.equal((await w.roster(room.host)).filter((u) => u === 'friend').length, 1);
});

test('A01-B-597 정원 6 · 지금 5명, 초대 확인 단계가 안 끝남 + 가짜 시계 15초 → 답 { ok: false, code: UNKNOWN, unknown: true }, 잡은 자리 풀림(다른 사람 코드 입장 됨)', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b597', 5);
    const room = await w.openRoom({ host, guests, maxPlayers: 6 });
    w.connect('friend');
    const inviteId = await w.invite(host, 'friend');
    // 수락 기록 단계가 끝나지 않음 (문을 안 엶)
    const gate = w.gates.pause('decision');
    const answer = w.sendLater('friend', 'accept_game_invite', { inviteId });
    await gate.reached;
    w.tick(15_000);
    const reply = await answer;
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'UNKNOWN');
    assert.equal(reply.unknown, true);
    w.connect('x');
    await w.joinByCode('x', room.roomCode);
    assert.equal(w.lastJoined('x')?.roomId, room.roomId, JSON.stringify(w.lastFailed('x')));
});

test('A01-B-598 다른 사람 초대 id로 수락 → 거절, 방 안 들어감', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b598-h', maxPlayers: 6 });
    w.connect('friend');
    w.connect('stranger');
    const inviteId = await w.invite(room.host, 'friend');
    const reply = await w.accept('stranger', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(await w.currentRoom('stranger'), null);
    assert.deepEqual(await w.roster(room.host), room.uuids);
});

// A01-B-599~600 수락 요청 모양
for (const [no, label, payload] of [['A01-B-599', '{}', {}], ['A01-B-600', '[]', []]]) {
    test(`${no} 수락 보내는 값 ${label} → 거절, 방 안 들어감`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ host: `${no}-h`, maxPlayers: 6 });
        w.connect('friend');
        await w.invite(room.host, 'friend');
        const reply = await w.send('friend', 'accept_game_invite', payload);
        assert.equal(reply.ok, false);
        assert.equal(await w.currentRoom('friend'), null);
    });
}

test('A01-B-609 정원 8 · 지금 3명, 초대 수락 → 명단 4번째, 그 뒤 방장 나가면 2번째 사람이 방장(초대 들어온 사람 아님)', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b609-a', guests: ['b609-b', 'b609-c'], maxPlayers: 8 });
    w.connect('friend');
    const inviteId = await w.invite(room.host, 'friend');
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, true, `수락 실패: ${reply.code}`);
    assert.deepEqual(await w.roster('b609-b'), ['b609-a', 'b609-b', 'b609-c', 'friend']);
    await w.leave('b609-a');
    assert.equal(w.last('friend', 'host_changed')?.hostUuid, 'b609-b');
});

test('A01-B-610 정원 9 · 지금 4명 공개 방, 수락 성공 → public_rooms_updated 인원 5', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b610', 4);
    const room = await w.openRoom({ host, guests, maxPlayers: 9, accessType: 'open' });
    w.connect('friend');
    w.connect('watcher');
    const inviteId = await w.invite(host, 'friend');
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, true, `수락 실패: ${reply.code}`);
    w.tick(500);
    w.flushList();
    assert.equal(w.publicRoomOf('watcher', room.roomId)?.current, 5);
});

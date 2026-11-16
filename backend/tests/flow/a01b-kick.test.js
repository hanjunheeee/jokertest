'use strict';

// 추방 흐름 시험 — 한 번 누르면 바로 빠짐(받은 버그 7), 1·2번은 다시 들어옴·3번이면 코드·목록·초대 모두 못 들어옴, 거절 코드마다 우리말 글, 같은 요청 id 같은 답(10분), 결과 다시 묻기, 거절 32개 한도
// 목록 A01-B-631~670 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "추방 — 한 번 누르면 바로"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-kick.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MSG, kickTimes, assertFailed } = require('./a01b-world');
const byId = require('../../game-core/queries/byId');

// 거절 답 확인 (코드·문구)
function assertRejected(reply, code, message) {
    assert.equal(reply.ok, false, `거절 아님: ${JSON.stringify(reply)}`);
    assert.equal(reply.code, code);
    if (message !== undefined) assert.equal(reply.message, message);
}

// 방 하나 (방장 = 첫 사람), n명
async function room(w, prefix, n, maxPlayers, extra = {}) {
    const [host, ...guests] = w.names(prefix, n);
    return w.openRoom({ host, guests, maxPlayers, ...extra });
}

// A01-B-631~636 [버그 7] 추방 요청 한 번에 바로 빠짐
const SIZES = [['A01-B-631', 5, 2], ['A01-B-632', 6, 5], ['A01-B-633', 7, 6], ['A01-B-634', 8, 7], ['A01-B-635', 9, 8], ['A01-B-636', 10, 10]];
for (const [no, max, n] of SIZES) {
    test(`${no} [버그 7] 정원 ${max} · 지금 ${n}명, 방장이 kick_room_player 한 번 → 방장 답 { ok: true, status: 'KICKED' }, 대상 room_kicked, 남은 사람 player_left_room, 명단에서 빠짐`, async (t) => {
        const w = makeWorld(t);
        const r = await room(w, no.slice(6), n, max);
        const target = r.uuids[n - 1];
        const reply = await w.kick(r.host, target);
        assert.equal(reply.ok, true, `추방 실패: ${reply.code} ${reply.message}`);
        assert.equal(reply.status, 'KICKED');
        assert.equal(w.count(target, 'room_kicked'), 1);
        for (const uuid of r.uuids.slice(0, n - 1)) assert.equal(w.last(uuid, 'player_left_room')?.uuid, target, uuid);
        const roster = await w.roster(r.host);
        assert.equal(roster.includes(target), false);
        assert.equal(roster.length, n - 1);
    });
}

test('A01-B-637 정원 6, 추방 1번 → 그 사람 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b637', 3, 6);
    const target = r.uuids[2];
    await kickTimes(w, r, target, 1);
    const before = w.count(target, 'room_joined');
    await w.joinByCode(target, r.roomCode);
    assert.equal(w.count(target, 'room_joined'), before + 1, JSON.stringify(w.lastFailed(target)));
});

test('A01-B-638 정원 6, 추방 2번 → 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b638', 3, 6);
    const target = r.uuids[2];
    await kickTimes(w, r, target, 2);
    const before = w.count(target, 'room_joined');
    await w.joinByCode(target, r.roomCode);
    assert.equal(w.count(target, 'room_joined'), before + 1, JSON.stringify(w.lastFailed(target)));
});

test('A01-B-639 정원 6, 추방 3번 → 코드 입장 → KICKED_TOO_MANY_TIMES + 안내 글', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b639', 3, 6);
    const target = r.uuids[2];
    await kickTimes(w, r, target, 3);
    await w.joinByCode(target, r.roomCode);
    assertFailed(w, target, 'KICKED_TOO_MANY_TIMES', MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-640 정원 6 공개 방, 추방 3번 → 공개 목록으로도 KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b640', 3, 6, { accessType: 'open' });
    const target = r.uuids[2];
    await kickTimes(w, r, target, 3);
    await w.joinPublic(target, r.roomId);
    assertFailed(w, target, 'KICKED_TOO_MANY_TIMES', MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-641 정원 6, 추방 3번 뒤 다른 손님이 초대 → 수락 → KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b641', 3, 6);
    const target = r.uuids[2];
    await kickTimes(w, r, target, 3);
    const inviteId = await w.invite(r.uuids[1], target);
    const reply = await w.accept(target, inviteId);
    assertRejected(reply, 'KICKED_TOO_MANY_TIMES', MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-642 정원 6, 3번 쫓겨난 뒤 방장이 방 삭제 → 같은 방장이 새 방 → 그 사람 코드 입장 됨', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b642', 3, 6);
    const target = r.uuids[2];
    await kickTimes(w, r, target, 3);
    assert.equal((await w.send(r.host, 'delete_room', {})).ok, true);
    const created = await w.send(r.host, 'create_room', { accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60 });
    assert.equal(created.ok, true);
    await w.joinByCode(target, created.room.roomCode);
    assert.equal(w.lastJoined(target)?.roomId, created.room.roomId, JSON.stringify(w.lastFailed(target)));
});

test('A01-B-643 정원 5, 대상 = 방장 → SELF_KICK "자신을 추방할 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b643', 2, 5);
    assertRejected(await w.kick(r.host, r.host), 'SELF_KICK', '자신을 추방할 수 없습니다.');
});

test('A01-B-644 정원 6, 손님이 추방 보냄 → NOT_HOST "방장만 추방할 수 있습니다.", 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b644', 3, 6);
    assertRejected(await w.kick(r.uuids[1], r.uuids[2]), 'NOT_HOST', '방장만 추방할 수 있습니다.');
    assert.deepEqual(await w.roster(r.host), r.uuids);
});

test('A01-B-645 정원 7, 대상이 먼저 leave_room 뒤 추방 → ALREADY_LEFT "이미 방에서 나간 참가자입니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b645', 3, 7);
    const target = r.uuids[2];
    // 방장이 화면에서 본 값 (나가기 전)
    const payload = await w.kickPayload(r.host, target);
    await w.leave(target);
    assertRejected(await w.kickRaw(r.host, payload), 'ALREADY_LEFT', '이미 방에서 나간 참가자입니다.');
});

test('A01-B-646 정원 7, 대상이 나갔다 다시 들어옴 → 옛 자리 번호로 추방 STALE_MEMBERSHIP "대상이 변경되었습니다. 다시 확인해주세요.", 다시 들어온 사람은 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b646', 3, 7);
    const target = r.uuids[2];
    const payload = await w.kickPayload(r.host, target);
    await w.leave(target);
    await w.joinByCode(target, r.roomCode);
    assertRejected(await w.kickRaw(r.host, payload), 'STALE_MEMBERSHIP', '대상이 변경되었습니다. 다시 확인해주세요.');
    assert.ok((await w.roster(r.host)).includes(target));
});

test('A01-B-647 정원 6, 방장 requesterMembershipId가 옛 값 → STALE_MEMBERSHIP "방 정보가 변경되었습니다. 다시 불러와주세요."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b647', 3, 6);
    const reply = await w.kick(r.host, r.uuids[2], { requesterMembershipId: 'old-membership' });
    assertRejected(reply, 'STALE_MEMBERSHIP', '방 정보가 변경되었습니다. 다시 불러와주세요.');
});

test('A01-B-648 정원 6 두 방, roomId가 내 방 아님 → ROOM_NOT_FOUND "참여 중인 방을 찾을 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b648', 3, 6);
    const other = await room(w, 'b648o', 2, 6);
    const reply = await w.kick(r.host, r.uuids[2], { roomId: other.roomId });
    assertRejected(reply, 'ROOM_NOT_FOUND', '참여 중인 방을 찾을 수 없습니다.');
});

test('A01-B-649 정원 6, roomInstanceId 옛 값 → ROOM_NOT_FOUND', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b649', 3, 6);
    assertRejected(await w.kick(r.host, r.uuids[2], { roomInstanceId: 'old-instance' }), 'ROOM_NOT_FOUND');
});

test('A01-B-650 방 없는 사람이 추방 → NOT_IN_ROOM "참여 중인 방이 없습니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b650', 2, 6);
    const payload = await w.kickPayload(r.host, r.uuids[1]);
    w.connect('lonely');
    assertRejected(await w.kickRaw('lonely', { ...payload, requestId: 'lonely-1' }), 'NOT_IN_ROOM', '참여 중인 방이 없습니다.');
});

test('A01-B-651 정원 7, 초대 수락 처리 중인 사람 추방 → ADMISSION_PENDING "상대의 입장 처리가 아직 끝나지 않았습니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b651', 3, 7);
    w.connect('friend');
    const inviteId = await w.invite(r.host, 'friend');
    // 명단엔 넣었지만 입장 확정 기록 전에서 멈춤
    const gate = w.gates.pause('published');
    const answer = w.sendLater('friend', 'accept_game_invite', { inviteId });
    await gate.reached;
    // 대상 자리 번호는 방 장부에서 읽음 (방장 화면엔 아직 안 뜬 사람)
    const seat = new Map(w.matchmaking.__getStateSnapshotForTests().gameRooms).get(r.roomId).players.find(([u]) => u === 'friend')[1];
    const reply = await w.kick(r.host, 'friend', { targetMembershipId: seat.membershipId });
    assertRejected(reply, 'ADMISSION_PENDING', '상대의 입장 처리가 아직 끝나지 않았습니다.');
    gate.release();
    await answer;
});

test('A01-B-652 방장 자신이 입장 처리 중 → ADMISSION_PENDING "입장 처리가 아직 끝나지 않았습니다."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b652', 3, 6);
    const other = await room(w, 'b652o', 2, 6);
    // 옛 방장이 방을 나와 다른 방 초대를 수락하는 중에 옛 화면 값으로 추방
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    await w.leave(r.host);
    const inviteId = await w.invite(other.host, r.host);
    const gate = w.gates.pause('decision');
    const answer = w.sendLater(r.host, 'accept_game_invite', { inviteId });
    await gate.reached;
    assertRejected(await w.kickRaw(r.host, payload), 'ADMISSION_PENDING', '입장 처리가 아직 끝나지 않았습니다.');
    gate.release();
    await answer;
});

test('A01-B-653 판 6명 중인 방장이 옛 대기방 값으로 추방 → ALREADY_IN_GAME', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b653', 6, 6);
    const payload = await w.kickPayload(r.host, r.uuids[5]);
    await w.startRoom(r);
    assert.ok(byId.getPlayerGameId(r.host));
    assertRejected(await w.kickRaw(r.host, payload), 'ALREADY_IN_GAME');
});

test('A01-B-654 정원 6, 같은 계정 새 소켓이 붙은 뒤 옛 소켓으로 추방 → STALE_SOCKET "연결이 만료되었습니다. 다시 시도해주세요.", 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b654', 3, 6);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    const oldSocket = w.sock(r.host);
    w.connect(r.host);
    assertRejected(await w.kickRaw(r.host, payload, { socket: oldSocket }), 'STALE_SOCKET', '연결이 만료되었습니다. 다시 시도해주세요.');
    assert.deepEqual(await w.roster(r.uuids[1]), r.uuids);
});

test('A01-B-655 정원 6, connected: false 소켓으로 추방 → STALE_SOCKET', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b655', 3, 6);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    w.sock(r.host).connected = false;
    assertRejected(await w.kickRaw(r.host, payload), 'STALE_SOCKET');
    assert.deepEqual(await w.roster(r.uuids[1]), r.uuids);
});

test('A01-B-656 정원 6, bootEpoch 다름 → STALE_BOOT "서버가 재시작되었습니다. 방 정보를 다시 불러와주세요."', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b656', 3, 6);
    const reply = await w.kick(r.host, r.uuids[2], { bootEpoch: 'old-boot-epoch' });
    assertRejected(reply, 'STALE_BOOT', '서버가 재시작되었습니다. 방 정보를 다시 불러와주세요.');
});

test('A01-B-657 정원 6, 칸 하나 빠진 추방 요청 → INVALID_REQUEST, 대상 그대로, 방송 0번', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b657', 3, 6);
    const target = r.uuids[2];
    const { targetMembershipId, ...missing } = await w.kickPayload(r.host, target);
    assert.ok(targetMembershipId);
    const before = r.uuids.map((u) => w.sock(u).received.length);
    assertRejected(await w.kickRaw(r.host, missing), 'INVALID_REQUEST');
    r.uuids.forEach((u, i) => assert.equal(w.sock(u).received.length, before[i], u));
    assert.ok((await w.roster(r.host)).includes(target));
});

test('A01-B-658 정원 7, 성공한 요청을 그대로 다시 → 답 같음 + replayed: true, 대상 한 번만 빠짐, 쫓겨난 횟수 1', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b658', 3, 7);
    const target = r.uuids[2];
    const payload = await w.kickPayload(r.host, target);
    const first = await w.kickRaw(r.host, payload);
    assert.equal(first.ok, true);
    const again = await w.kickRaw(r.host, payload);
    assert.deepEqual(again, { ...first, replayed: true });
    assert.equal(w.count(target, 'room_kicked'), 1);
    assert.equal(w.received(r.uuids[1], 'player_left_room').filter((e) => e.uuid === target).length, 1);
    // 횟수 1이면: 다시 들어와 한 번 더 쫓겨나도(2번) 또 들어옴
    await w.joinByCode(target, r.roomCode);
    assert.equal((await w.kick(r.host, target)).ok, true);
    await w.joinByCode(target, r.roomCode);
    assert.equal(w.lastJoined(target)?.roomId, r.roomId, JSON.stringify(w.lastFailed(target)));
    assert.ok((await w.roster(r.host)).includes(target));
});

test('A01-B-659 정원 7, 같은 요청 id로 대상 바꿈 → REQUEST_ID_REUSED "이미 사용한 요청 식별자입니다.", 새 대상 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b659', 4, 7);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    assert.equal((await w.kickRaw(r.host, payload)).ok, true);
    const other = await w.kickPayload(r.host, r.uuids[3], { requestId: payload.requestId });
    assertRejected(await w.kickRaw(r.host, other), 'REQUEST_ID_REUSED', '이미 사용한 요청 식별자입니다.');
    assert.ok((await w.roster(r.host)).includes(r.uuids[3]));
});

test('A01-B-660 정원 6, NOT_HOST 거절 요청을 같은 id로 다시 → 같은 거절', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b660', 3, 6);
    const payload = await w.kickPayload(r.uuids[1], r.uuids[2]);
    const first = await w.kickRaw(r.uuids[1], payload);
    assertRejected(first, 'NOT_HOST');
    const again = await w.kickRaw(r.uuids[1], payload);
    assertRejected(again, 'NOT_HOST', first.message);
});

// A01-B-661~662 같은 답 보관 10분 경계
test('A01-B-661 정원 6, 성공 요청을 가짜 시계 9분 59초 뒤 다시 → 같은 답 replayed', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b661', 3, 6);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    const first = await w.kickRaw(r.host, payload);
    assert.equal(first.ok, true);
    w.tick(9 * 60_000 + 59_000);
    assert.deepEqual(await w.kickRaw(r.host, payload), { ...first, replayed: true });
});

test('A01-B-662 정원 6, 성공 요청을 가짜 시계 10분 0초 뒤 다시 → 저장된 답 없음(새 요청으로 판단, 대상 이미 없음 → ALREADY_LEFT)', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b662', 3, 6);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    assert.equal((await w.kickRaw(r.host, payload)).ok, true);
    w.tick(10 * 60_000);
    const again = await w.kickRaw(r.host, payload);
    assertRejected(again, 'ALREADY_LEFT');
    assert.equal(again.replayed, undefined);
});

test('A01-B-663 정원 6, 성공 뒤 get_kick_result { bootEpoch, requestId } → 저장된 성공 답', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b663', 3, 6);
    const payload = await w.kickPayload(r.host, r.uuids[2]);
    const first = await w.kickRaw(r.host, payload);
    assert.equal(first.ok, true);
    const result = await new Promise((resolve) => w.G.handleGetKickResult(w.io, w.sock(r.host), r.host, { bootEpoch: payload.bootEpoch, requestId: payload.requestId }, resolve));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'KICKED');
    assert.equal(result.targetUuid, r.uuids[2]);
    assert.equal(result.requestId, payload.requestId);
});

test('A01-B-664 보낸 적 없는 requestId 결과 묻기 → 결과 없음 답 { ok: true, status: UNKNOWN }, 아무도 안 빠짐', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b664', 3, 6);
    const bootEpoch = (await w.currentRoom(r.host)).bootEpoch;
    const result = await new Promise((resolve) => w.G.handleGetKickResult(w.io, w.sock(r.host), r.host, { bootEpoch, requestId: 'never-sent' }, resolve));
    assert.deepEqual(result, { ok: true, status: 'UNKNOWN', bootEpoch, requestId: 'never-sent' });
    assert.deepEqual(await w.roster(r.host), r.uuids);
});

// A01-B-665~666 한 사람 거절 기록 32개 한도 (10분 안)
for (const [no, nth, expectCode] of [['A01-B-665', 32, 'NOT_HOST'], ['A01-B-666', 33, 'RECEIPT_CAPACITY']]) {
    test(`${no} 정원 6, 10분 안 거절 ${nth}번째 → ${expectCode === 'NOT_HOST' ? '그 거절 그대로' : 'RECEIPT_CAPACITY "잠시 후 다시 시도해주세요."'}`, async (t) => {
        const w = makeWorld(t);
        const r = await room(w, no.slice(6), 3, 6);
        const guest = r.uuids[1];
        const base = await w.kickPayload(guest, r.uuids[2]);
        let reply;
        for (let i = 1; i <= nth; i += 1) {
            reply = await w.kickRaw(guest, { ...base, requestId: `${no}-${i}` });
            if (i < nth) assertRejected(reply, 'NOT_HOST');
        }
        if (expectCode === 'NOT_HOST') assertRejected(reply, 'NOT_HOST', '방장만 추방할 수 있습니다.');
        else assertRejected(reply, 'RECEIPT_CAPACITY', '잠시 후 다시 시도해주세요.');
    });
}

test('A01-B-667 정원 6, 추방 뒤 남은 손님 준비 → 쫓겨난 사람 소켓에 player_ready_changed 0번', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b667', 3, 6);
    const target = r.uuids[2];
    assert.equal((await w.kick(r.host, target)).ok, true);
    const before = w.count(target, 'player_ready_changed');
    assert.equal((await w.ready(r.uuids[1], r)).ok, true);
    assert.equal(w.count(target, 'player_ready_changed'), before);
    assert.equal(w.last(r.host, 'player_ready_changed')?.uuid, r.uuids[1]);
});

test('A01-B-668 정원 6, 추방 직후 그 사람이 다른 방 코드 입장 → room_joined (ALREADY_IN_ROOM 아님)', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b668', 3, 6);
    const other = await room(w, 'b668o', 2, 6);
    const target = r.uuids[2];
    assert.equal((await w.kick(r.host, target)).ok, true);
    await w.joinByCode(target, other.roomCode);
    assert.equal(w.lastJoined(target)?.roomId, other.roomId, JSON.stringify(w.lastFailed(target)));
});

test('A01-B-669 정원 8 · 지금 6명 공개 방, 추방 → public_rooms_updated 인원 5', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b669', 6, 8, { accessType: 'open' });
    w.connect('watcher');
    assert.equal((await w.kick(r.host, r.uuids[5])).ok, true);
    w.tick(500);
    w.flushList();
    assert.equal(w.publicRoomOf('watcher', r.roomId)?.current, 5);
});

test('A01-B-670 정원 10 · 지금 8명, 다른 요청 id로 두 명 추방 → 둘 다 빠짐, 명단 6', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b670', 8, 10);
    assert.equal((await w.kick(r.host, r.uuids[6])).ok, true);
    assert.equal((await w.kick(r.host, r.uuids[7])).ok, true);
    const roster = await w.roster(r.host);
    assert.equal(roster.length, 6);
    assert.equal(roster.includes(r.uuids[6]) || roster.includes(r.uuids[7]), false);
});

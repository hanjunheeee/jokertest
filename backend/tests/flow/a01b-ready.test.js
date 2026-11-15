'use strict';

// 준비·준비 취소 흐름 시험 — 방송(나는 안 받음)·같은 값·방장도 준비·시작 가능 표시·옛 설정·다른 방·방 없음·요청 모양·들어옴/나감/쫓겨남 뒤 다시 계산·준비 순번
// 목록 A01-B-611~630 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "준비·준비 취소"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-ready.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a01b-world');

const INVALID = '잘못된 요청입니다.';

// 방 하나 차리고 준비 시킬 사람 준비 (방장 = 첫 사람)
async function roomWithReady(w, { prefix, n, maxPlayers, readyUuids = [], accessType = 'code' }) {
    const [host, ...guests] = w.names(prefix, n);
    const room = await w.openRoom({ host, guests, maxPlayers, accessType });
    for (const uuid of readyUuids.map((i) => room.uuids[i])) {
        const r = await w.ready(uuid, room);
        assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
    }
    return room;
}

// A01-B-611~612 준비 / 준비 취소
for (const [no, isReady] of [['A01-B-611', true], ['A01-B-612', false]]) {
    test(`${no} 정원 6 · 지금 5명, 손님 set_ready ${isReady} → 답 { ok: true, isReady: ${isReady} }, 나 뺀 방 사람에게 player_ready_changed, 나는 방송 안 받음`, async (t) => {
        const w = makeWorld(t);
        const room = await roomWithReady(w, { prefix: no.slice(6), n: 5, maxPlayers: 6 });
        const guest = room.uuids[1];
        // 취소는 준비한 뒤에
        if (!isReady) assert.equal((await w.ready(guest, room, true)).ok, true);
        const before = new Map(room.uuids.map((u) => [u, w.count(u, 'player_ready_changed')]));
        const reply = await w.ready(guest, room, isReady);
        assert.equal(reply.ok, true);
        assert.equal(reply.isReady, isReady);
        for (const uuid of room.uuids) {
            const got = w.count(uuid, 'player_ready_changed') - before.get(uuid);
            if (uuid === guest) {
                assert.equal(got, 0, '보낸 사람이 방송을 받음');
            } else {
                assert.equal(got, 1, uuid);
                assert.deepEqual(
                    (({ uuid: u, isReady: r }) => ({ uuid: u, isReady: r }))(w.last(uuid, 'player_ready_changed')),
                    { uuid: guest, isReady },
                );
            }
        }
    });
}

test('A01-B-613 정원 6, 준비 상태에서 또 true → 답 그대로, 방송 0번, readyRevision 안 오름', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b613', n: 3, maxPlayers: 6 });
    const guest = room.uuids[1];
    const first = await w.ready(guest, room, true);
    const before = w.count(room.host, 'player_ready_changed');
    const again = await w.ready(guest, room, true);
    assert.equal(again.ok, true);
    assert.equal(again.isReady, true);
    assert.equal(again.readyRevision, first.readyRevision);
    assert.equal(w.count(room.host, 'player_ready_changed'), before);
});

test('A01-B-614 정원 5, 방장 set_ready true → 됨, 손님에게 방송', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b614', n: 3, maxPlayers: 5 });
    const reply = await w.ready(room.host, room, true);
    assert.equal(reply.ok, true);
    for (const guest of room.uuids.slice(1)) {
        const got = w.last(guest, 'player_ready_changed');
        assert.equal(got?.uuid, room.host, guest);
        assert.equal(got.isReady, true);
    }
});

test('A01-B-615 정원 5 · 지금 5명, 마지막 사람 준비 → 방송 canStart: true', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b615', n: 5, maxPlayers: 5, readyUuids: [0, 1, 2, 3] });
    await w.ready(room.uuids[4], room, true);
    assert.equal(w.last(room.host, 'player_ready_changed')?.canStart, true);
});

test('A01-B-616 정원 5 · 지금 5명 전원 준비에서 손님 false → canStart: false', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b616', n: 5, maxPlayers: 5, readyUuids: [0, 1, 2, 3, 4] });
    await w.ready(room.uuids[2], room, false);
    const got = w.last(room.host, 'player_ready_changed');
    assert.equal(got?.isReady, false);
    assert.equal(got.canStart, false);
});

test('A01-B-617 정원 6 · 지금 4명 모두 준비 → canStart: false', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b617', n: 4, maxPlayers: 6, readyUuids: [0, 1, 2] });
    await w.ready(room.uuids[3], room, true);
    assert.equal(w.last(room.host, 'player_ready_changed')?.canStart, false);
});

test('A01-B-618 정원 7, 설정 버전 2인데 1로 set_ready → SETTINGS_VERSION_CONFLICT "방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요." + settingsVersion 2, 준비 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b618', n: 3, maxPlayers: 7 });
    const saved = await w.saveSettings(room.host, { dayDiscussionTime: 90 });
    assert.equal(saved.ok, true, `설정 저장 실패: ${saved.message}`);
    const guest = room.uuids[1];
    const reply = await w.ready(guest, room, true, { expectedSettingsVersion: 1 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SETTINGS_VERSION_CONFLICT');
    assert.equal(reply.message, '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.');
    assert.equal(reply.settingsVersion, 2);
    assert.equal((await w.currentRoom(room.host)).players.find((p) => p.uuid === guest).isReady, false);
});

test('A01-B-619 roomId가 내 방 아님 → SETTINGS_VERSION_CONFLICT, 준비 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b619', n: 2, maxPlayers: 6 });
    const other = await w.openRoom({ host: 'b619-other', maxPlayers: 6 });
    const guest = room.uuids[1];
    const reply = await w.ready(guest, other, true);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SETTINGS_VERSION_CONFLICT');
    assert.equal((await w.currentRoom(room.host)).players.find((p) => p.uuid === guest).isReady, false);
});

test('A01-B-620 방 없는 사람 준비 → { ok: false } "참여 중인 방이 없습니다."', async (t) => {
    const w = makeWorld(t);
    w.connect('lonely');
    const reply = await w.send('lonely', 'set_ready', { roomId: 'some-room', expectedSettingsVersion: 1, isReady: true });
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '참여 중인 방이 없습니다.');
});

// A01-B-621~624 준비 요청 모양
const SHAPES = [
    ['A01-B-621', "isReady: 'true'(글자)", (room) => ({ roomId: room.roomId, expectedSettingsVersion: 1, isReady: 'true' })],
    ['A01-B-622', 'roomId 없음', () => ({ expectedSettingsVersion: 1, isReady: true })],
    ['A01-B-623', 'expectedSettingsVersion: 0', (room) => ({ roomId: room.roomId, expectedSettingsVersion: 0, isReady: true })],
    ['A01-B-624', '보내는 값 null', () => null],
];
for (const [no, label, make] of SHAPES) {
    test(`${no} 준비 요청 ${label} → "잘못된 요청입니다.", 방송 0번`, async (t) => {
        const w = makeWorld(t);
        const room = await roomWithReady(w, { prefix: no.slice(6), n: 3, maxPlayers: 6 });
        const guest = room.uuids[1];
        const before = room.uuids.map((u) => w.count(u, 'player_ready_changed'));
        const reply = await w.send(guest, 'set_ready', make(room));
        assert.equal(reply.ok, false);
        assert.equal(reply.message, INVALID);
        room.uuids.forEach((u, i) => assert.equal(w.count(u, 'player_ready_changed'), before[i], u));
    });
}

test('A01-B-625 정원 6 · 지금 5명 전원 준비, 6번째 코드 입장 → player_joined_room canStart: false', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b625', n: 5, maxPlayers: 6, readyUuids: [0, 1, 2, 3, 4] });
    assert.equal(w.last(room.host, 'player_ready_changed')?.canStart, true);
    w.connect('sixth');
    await w.joinByCode('sixth', room.roomCode);
    const got = w.last(room.host, 'player_joined_room');
    assert.equal(got?.player.uuid, 'sixth');
    assert.equal(got.canStart, false);
});

// A01-B-626~627 준비 안 한 사람이 나가면 다시 계산
const LEAVE_CASES = [
    ['A01-B-626', 7, 6, true],
    ['A01-B-627', 6, 5, false],
];
for (const [no, max, n, expected] of LEAVE_CASES) {
    test(`${no} 정원 ${max} · ${n}명(${n - 1}명 준비 + 1명 안 함), 안 한 사람 나감 → player_left_room canStart: ${expected}`, async (t) => {
        const w = makeWorld(t);
        const readyIdx = Array.from({ length: n - 1 }, (_, i) => i);
        const room = await roomWithReady(w, { prefix: no.slice(6), n, maxPlayers: max, readyUuids: readyIdx });
        const notReady = room.uuids[n - 1];
        await w.leave(notReady);
        const got = w.last(room.host, 'player_left_room');
        assert.equal(got?.uuid, notReady);
        assert.equal(got.canStart, expected);
    });
}

test('A01-B-628 정원 6 · 6명(5명 준비), 안 한 1명 추방 → player_left_room canStart: true', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b628', n: 6, maxPlayers: 6, readyUuids: [0, 1, 2, 3, 4] });
    const notReady = room.uuids[5];
    const r = await w.kick(room.host, notReady);
    assert.equal(r.ok, true, `추방 실패: ${r.code}`);
    const got = w.last(room.uuids[1], 'player_left_room');
    assert.equal(got?.uuid, notReady);
    assert.equal(got.canStart, true);
});

test('A01-B-629 정원 6, 준비했던 손님이 나갔다 코드로 다시 → isReady: false', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b629', n: 3, maxPlayers: 6, readyUuids: [1] });
    const guest = room.uuids[1];
    await w.leave(guest);
    await w.joinByCode(guest, room.roomCode);
    const joined = w.lastJoined(guest);
    assert.equal(joined.players.find((p) => p.uuid === guest)?.isReady, false);
    assert.equal(w.last(room.host, 'player_joined_room')?.player.isReady, false);
});

test('A01-B-630 정원 5, 준비 → 취소 → 준비 → 방송 readyRevision 1·2·3', async (t) => {
    const w = makeWorld(t);
    const room = await roomWithReady(w, { prefix: 'b630', n: 3, maxPlayers: 5 });
    const guest = room.uuids[1];
    await w.ready(guest, room, true);
    await w.ready(guest, room, false);
    await w.ready(guest, room, true);
    assert.deepEqual(w.received(room.host, 'player_ready_changed').filter((e) => e.uuid === guest).map((e) => e.readyRevision), [1, 2, 3]);
});

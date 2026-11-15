'use strict';

// 방 설정 바꾸기 시험 — 방장만·전원 알림·준비 풀림·같은 내용·정원 줄이기·구성·시간·허용 밖·지운 3칸 거절·버전·시작 뒤·옛 탭·같은 요청·결과 다시 묻기·옛 버전 준비·시작
// 목록 A01-B-125~154 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "방 설정 바꾸기"), 돌리기: node --env-file=.env.test --test tests/flow/a01a-room-settings-update.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, customRoles, makeInviteService, admitByInvite } = require('./a01a-world');

// 그 방 사람마다 받은 설정 바뀜 알림
const updatesOf = (w, uuids) => uuids.map((u) => w.received(u, 'room_settings_updated'));
// 준비한 사람 uuid (방장이 보는 명단)
const readyUuids = async (w, by) => (await w.currentRoom(by)).players.filter((p) => p.isReady).map((p) => p.uuid).sort();

test('A01-B-125 5명 방, 방장이 정원 10→8 → 답 changed:true·settingsVersion 2, 다섯 사람 모두 room_settings_updated(정원 8)', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b125', n: 5, maxPlayers: 10, readyAll: false });
    const reply = await w.update(room.host, { maxPlayers: 8 });
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.changed, true);
    assert.equal(reply.settingsVersion, 2);
    for (const [i, got] of updatesOf(w, room.uuids).entries()) {
        assert.equal(got.length, 1, `${room.uuids[i]} 알림 수`);
        assert.equal(got[0].settings.maxPlayers, 8);
    }
});

test('A01-B-126 6명 방 손님 5명 준비 → 방장이 토론 60→90 → 방송 players 전원 isReady:false, canStart:false', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b126', n: 6, readyAll: false });
    for (const g of room.guests) assert.equal((await w.ready(g, true)).ok, true);
    const reply = await w.update(room.host, { dayDiscussionTime: 90 });
    assert.equal(reply.ok, true, reply.message);
    const [payload] = w.received(room.host, 'room_settings_updated');
    assert.ok(payload, '방송 없음');
    assert.deepEqual(payload.players.filter((p) => p.isReady !== false).map((p) => p.uuid), []);
    assert.equal(payload.players.length, 6);
    assert.equal(payload.canStart, false);
});

test('A01-B-127 5명 방 손님이 update_room_settings → NOT_HOST "방장만 설정을 변경할 수 있습니다.", 설정·준비 그대로, 방송 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b127', n: 5, readyUuids: ['b127-1', 'b127-2'] });
    const before = await w.currentRoom(room.host);
    const reply = await w.update(room.guests[0], { maxPlayers: 8 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_HOST');
    assert.equal(reply.message, '방장만 설정을 변경할 수 있습니다.');
    const after = await w.currentRoom(room.host);
    assert.deepEqual(after.settings, before.settings);
    assert.equal(after.settingsVersion, before.settingsVersion);
    assert.deepEqual(await readyUuids(w, room.host), ['b127-1', 'b127-2']);
    assert.deepEqual(updatesOf(w, room.uuids).flat(), []);
});

test('A01-B-128 5명 방 4명 준비, 방장이 지금 설정 그대로 저장 → changed:false, 버전 그대로, 준비 4명 그대로, 방송 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b128', n: 5, readyUuids: ['b128-1', 'b128-2', 'b128-3', 'b128-4'] });
    const reply = await w.update(room.host, {});
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.changed, false);
    assert.equal(reply.settingsVersion, 1);
    assert.equal((await w.currentRoom(room.host)).settingsVersion, 1);
    assert.deepEqual(await readyUuids(w, room.host), ['b128-1', 'b128-2', 'b128-3', 'b128-4']);
    assert.deepEqual(updatesOf(w, room.uuids).flat(), []);
});

// 7명 방 정원 줄이기
const SHRINK_CASES = [
    ['A01-B-129', 6, false],
    ['A01-B-130', 7, true],
    ['A01-B-131', 8, true],
];
for (const [no, maxPlayers, pass] of SHRINK_CASES) {
    test(`${no} 7명 방 → 정원 ${maxPlayers} ${pass ? '됨' : 'MAX_PLAYERS_BELOW_OCCUPANCY "현재 인원(7명)보다 적은 정원으로는 변경할 수 없습니다."'}`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 7, maxPlayers: 10, readyAll: false });
        const reply = await w.update(room.host, { maxPlayers });
        if (pass) {
            assert.equal(reply.ok, true, reply.message);
            assert.equal((await w.currentRoom(room.host)).settings.maxPlayers, maxPlayers);
        } else {
            assert.equal(reply.ok, false);
            assert.equal(reply.code, 'MAX_PLAYERS_BELOW_OCCUPANCY');
            assert.equal(reply.message, '현재 인원(7명)보다 적은 정원으로는 변경할 수 없습니다.');
            assert.equal((await w.currentRoom(room.host)).settings.maxPlayers, 10);
        }
    });
}

test('A01-B-132 6명 + 초대 입장 중 1명 → 정원 6 → 거절 "현재 인원(7명)…"', async (t) => {
    const invites = makeInviteService();
    const w = makeWorld(t, { depsOverrides: { gameInviteService: invites.service } });
    const room = await w.openRoom({ prefix: 'b132', n: 6, maxPlayers: 10, readyAll: false });
    const pending = await admitByInvite(w, invites, { uuid: 'b132-guest', roomHolder: room.host, point: 'decision' });
    const reply = await w.update(room.host, { maxPlayers: 6 });
    pending.open();
    await pending.reply;
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'MAX_PLAYERS_BELOW_OCCUPANCY');
    assert.match(reply.message, /^현재 인원\(7명\)/);
});

// 5명 방 구성 바꾸기: 처음 구성 → 바꿀 칸 → 저장 설정에 있어야 할 것
const COMPOSITION_CASES = [
    ['A01-B-133', '광대 2→1', { jokerCount: 2 }, { jokerCount: 1 }, { jokerCount: 1, roleCompositionMode: 'auto' }],
    ['A01-B-134', '자동→직접 J1D1', { jokerCount: 1 }, customRoles({ JOKER: 1, DOCTOR: 1 }),
        { roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } }],
    ['A01-B-135', '직접→자동', customRoles({ JOKER: 1, DOCTOR: 1 }), { roleCompositionMode: 'auto', roleCounts: undefined },
        { roleCompositionMode: 'auto', roleCounts: undefined }],
];
for (const [no, label, initial, change, expected] of COMPOSITION_CASES) {
    test(`${no} 5명 방 구성 ${label} → 저장 설정이 새 값, 버전 +1`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 5, readyAll: false, ...initial });
        const reply = await w.update(room.host, change);
        assert.equal(reply.ok, true, reply.message);
        const now = await w.currentRoom(room.host);
        for (const [key, value] of Object.entries(expected)) {
            if (value === undefined) assert.equal(Object.hasOwn(now.settings, key), false, `${key}가 남음`);
            else assert.deepEqual(now.settings[key], value, key);
        }
        assert.equal(now.settingsVersion, 2);
    });
}

// 5명 방 시간 바꾸기 (전원 준비였다가 풀림)
const TIME_CASES = [
    ['A01-B-136', '토론 60→150', { dayDiscussionTime: 150 }, 'dayDiscussionTime', 150],
    ['A01-B-137', '재판 60→15', { tribunalTime: 15 }, 'tribunalTime', 15],
];
for (const [no, label, change, key, value] of TIME_CASES) {
    test(`${no} 5명 방 ${label} → 저장, 준비 풀림`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 5 });
        const reply = await w.update(room.host, change);
        assert.equal(reply.ok, true, reply.message);
        const now = await w.currentRoom(room.host);
        assert.equal(now.settings[key], value);
        assert.deepEqual(await readyUuids(w, room.host), []);
    });
}

// 허용 밖 값 → INVALID_REQUEST, 설정·준비·버전 그대로
const INVALID_CASES = [
    ['A01-B-138', '정원 11', { maxPlayers: 11 }],
    ['A01-B-139', '토론 151', { dayDiscussionTime: 151 }],
];
for (const [no, label, change] of INVALID_CASES) {
    test(`${no} ${label} → INVALID_REQUEST, 설정·준비·버전 그대로`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 5 });
        const before = await w.currentRoom(room.host);
        const reply = await w.update(room.host, change);
        assert.equal(reply.ok, false);
        assert.equal(reply.code, 'INVALID_REQUEST');
        const after = await w.currentRoom(room.host);
        assert.deepEqual(after.settings, before.settings);
        assert.equal(after.settingsVersion, before.settingsVersion);
        assert.equal(after.players.every((p) => p.isReady), true, '준비가 풀림');
    });
}

// 지운 3칸 실은 바꾸기는 거절 (반장 결정 2026-11-16: 모르는 칸이 있으면 거절)
const REMOVED_CASES = [
    ['A01-B-140', 'lightsOut', true],
    ['A01-B-141', 'soulBetting', true],
    ['A01-B-142', 'voteReveal', false],
];
for (const [no, key, value] of REMOVED_CASES) {
    test(`${no} [지금 동작] ${key}: ${value} + 정원 10→9 바꾸기 → 거절 "변경할 수 없는 설정이 포함되어 있습니다.", 정원 10 그대로, 준비 안 풀림`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 5, maxPlayers: 10 });
        const reply = await w.update(room.host, { maxPlayers: 9, [key]: value });
        assert.equal(reply.ok, false);
        assert.equal(reply.message, '변경할 수 없는 설정이 포함되어 있습니다.');
        const after = await w.currentRoom(room.host);
        assert.equal(after.settings.maxPlayers, 10);
        assert.equal(after.players.every((p) => p.isReady), true, '준비가 풀림');
    });
}

test('A01-B-143 버전 2인 방에 expectedSettingsVersion 1 → SETTINGS_VERSION_CONFLICT + 최신 room', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b143', n: 5, readyAll: false });
    assert.equal((await w.update(room.host, { maxPlayers: 9 })).settingsVersion, 2);
    const reply = await w.update(room.host, { maxPlayers: 8 }, { version: 1 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SETTINGS_VERSION_CONFLICT');
    assert.equal(reply.room?.settingsVersion, 2);
    assert.equal(reply.room.settings.maxPlayers, 9);
});

test('A01-B-144 5명 방 시작 → 옛 방 id로 바꾸기 → ok:false(ALREADY_IN_GAME), 판 설정 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b144', n: 5, maxPlayers: 10 });
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    const started = await w.start(room.host);
    assert.equal(started.ok, true, started.message);
    const reply = await w.emit(room.host, 'update_room_settings', payload);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ALREADY_IN_GAME');
    // 판 설정 = 사람이 다시 붙으면 받는 시작 내용의 방 설정
    const session = w.byId.getSessionById(started.gameId);
    const shown = w.core.buildGameStartedPayload(session, room.host).state.roomSettingsSource.settings;
    assert.equal(shown.maxPlayers, 10);
});

test('A01-B-145 방 나간 사람이 바꾸기 → NOT_IN_ROOM', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b145', n: 5, readyAll: false });
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    w.sock(room.host).trigger('leave_room');
    const reply = await w.emit(room.host, 'update_room_settings', payload);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_IN_ROOM');
});

test('A01-B-146 내 방 아닌 방 id → ROOM_NOT_FOUND', async (t) => {
    const w = makeWorld(t);
    const mine = await w.openRoom({ prefix: 'b146a', n: 1, readyAll: false });
    const other = await w.openRoom({ prefix: 'b146b', n: 1, readyAll: false });
    const reply = await w.update(mine.host, { maxPlayers: 8 }, { roomId: other.roomId });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ROOM_NOT_FOUND');
});

test('A01-B-147 [지금 동작] 같은 계정 새 탭이 붙은 뒤 옛 소켓으로 바꾸기 → STALE_SOCKET', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b147', n: 5, readyAll: false });
    const oldSocket = w.sock(room.host);
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    w.connect(room.host, `sock-${room.host}-2`);
    const reply = await w.emit(room.host, 'update_room_settings', payload, oldSocket);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'STALE_SOCKET');
});

test('A01-B-148 [지금 동작] 같은 requestId·같은 내용 두 번 → 둘째 replayed:true·같은 버전, 방송은 한 번만', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b148', n: 5, readyAll: false });
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    const first = await w.emit(room.host, 'update_room_settings', payload);
    const second = await w.emit(room.host, 'update_room_settings', payload);
    assert.equal(first.ok, true, first.message);
    assert.equal(second.ok, true, second.message);
    assert.equal(second.replayed, true);
    assert.equal(second.settingsVersion, first.settingsVersion);
    for (const got of updatesOf(w, room.uuids)) assert.equal(got.length, 1);
});

test('A01-B-149 [지금 동작] 같은 requestId·다른 정원 → REQUEST_ID_REUSED', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b149', n: 5, readyAll: false });
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    assert.equal((await w.emit(room.host, 'update_room_settings', payload)).ok, true);
    const reply = await w.emit(room.host, 'update_room_settings', { ...payload, maxPlayers: 9 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'REQUEST_ID_REUSED');
});

test('A01-B-150 저장 뒤 get_room_settings_update_result → status APPLIED + 최신 room', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b150', n: 5, readyAll: false });
    const payload = await w.updatePayload(room.host, { maxPlayers: 8 });
    assert.equal((await w.emit(room.host, 'update_room_settings', payload)).ok, true);
    const reply = await w.emit(room.host, 'get_room_settings_update_result', { roomId: payload.roomId, requestId: payload.requestId });
    assert.equal(reply.ok, true);
    assert.equal(reply.status, 'APPLIED');
    assert.equal(reply.room?.settingsVersion, 2);
    assert.equal(reply.room.settings.maxPlayers, 8);
});

test('A01-B-151 모르는 requestId로 결과 묻기 → status UNKNOWN', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b151', n: 5, readyAll: false });
    const reply = await w.emit(room.host, 'get_room_settings_update_result', { roomId: room.roomId, requestId: 'never-sent' });
    assert.equal(reply.ok, true);
    assert.equal(reply.status, 'UNKNOWN');
});

test('A01-B-152 설정 바뀐 뒤 손님이 옛 버전으로 set_ready → 거절, 준비 안 됨 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b152', n: 5, readyAll: false });
    assert.equal((await w.update(room.host, { maxPlayers: 8 })).ok, true);
    const guest = room.guests[0];
    const reply = await w.ready(guest, true, { roomId: room.roomId, version: 1 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SETTINGS_VERSION_CONFLICT');
    assert.deepEqual(await readyUuids(w, room.host), []);
});

test('A01-B-153 5명 전원 준비 → 방장이 설정 바꿈 → 옛 버전으로 start_game → ROOM_STATE_CHANGED + 새 settingsVersion, 판 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b153', n: 5 });
    assert.equal((await w.update(room.host, { maxPlayers: 8 })).ok, true);
    const reply = await w.start(room.host, { roomId: room.roomId, version: 1 });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ROOM_STATE_CHANGED');
    assert.equal(reply.settingsVersion, 2);
    assert.equal(w.nobodyStarted(room.uuids), true);
});

test('A01-B-154 [지금 동작] 5명 + 초대 입장 중 1명 → 바꾸기 → 확정 5명만 room_settings_updated', async (t) => {
    const invites = makeInviteService();
    const w = makeWorld(t, { depsOverrides: { gameInviteService: invites.service } });
    const room = await w.openRoom({ prefix: 'b154', n: 5, maxPlayers: 10, readyAll: false });
    const pending = await admitByInvite(w, invites, { uuid: 'b154-guest', roomHolder: room.host, point: 'receipt' });
    // 들어오는 사람은 명단에 들었지만 아직 확정 전
    assert.ok((await w.currentRoom(room.host)).players.some((p) => p.uuid === 'b154-guest'), '명단에 아직 안 들어옴');
    const reply = await w.update(room.host, { maxPlayers: 8 });
    pending.open();
    await pending.reply;
    assert.equal(reply.ok, true, reply.message);
    for (const [i, got] of updatesOf(w, room.uuids).entries()) assert.equal(got.length, 1, `${room.uuids[i]} 알림 수`);
    assert.equal(w.received('b154-guest', 'room_settings_updated').length, 0);
});

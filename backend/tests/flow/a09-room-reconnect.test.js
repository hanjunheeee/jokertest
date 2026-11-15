'use strict';

// 대기방 끊김 15초 흐름 시험 — 14.9초엔 남음·15초엔 빠짐·방 물으면 그대로·방장 넘김·혼자면 방 지움·나가기는 바로·끊긴 사람 있으면 시작 거절
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-309~316, 돌리기: node --env-file=.env.test --test tests/flow/a09-room-reconnect.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

const { matchmaking, MM, mf } = H;

// 대기방 세상: 가짜 시계(전역) + 가짜 소켓·io + 접속 목록, 방 만들기·코드 입장·준비는 진짜 핸들러
function makeRoomWorld(t) {
    H.hardReset();
    const clock = H.installClock();
    H.installFakeStores();
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    H.gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        H.hardReset();
        H.restoreFakeStores();
        H.restoreClock();
    });
    const sockets = new Map();
    const history = new Map();
    let seq = 0;
    // 계정 하나 접속 (접속 목록에 이 소켓을 지금 소켓으로 적음)
    const connect = (uuid) => {
        seq += 1;
        const s = mf.createFakeSocket(uuid, { id: `sock-${uuid}-${seq}` });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        history.set(uuid, [...(history.get(uuid) ?? []), s]);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const got = (uuid, event) => (history.get(uuid) ?? []).flatMap((s) => s.received)
        .filter((e) => e.event === event).map((e) => e.payload);

    // 방 만들기 → 나머지 코드 입장 → 전원 준비 (방장 = 첫 사람, 들어온 차례 = 배열 차례)
    async function openRoom({ prefix, n, accessType = 'code' }) {
        const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, {
            accessType, maxPlayers: Math.max(n, 5), jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
        });
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        return { ...created.room, host, guests, uuids };
    }

    // 소켓 끊김 (서버 대기방 끊김 처리 → 15초 기다림)
    const disconnect = (uuid) => {
        const s = sock(uuid);
        s.connected = false;
        matchmaking.onDisconnect(io, s, uuid);
    };
    // 새 소켓으로 다시 붙음 (접속 때 서버가 방 채널 다시 넣기)
    const reconnectSocket = async (uuid) => {
        const s = connect(uuid);
        await matchmaking.resyncRoomChannelOnReconnect(s, uuid);
        return s;
    };
    const currentRoom = (uuid) => new Promise((resolve) => MM.handleGetCurrentRoom(uuid, resolve));
    const members = async (viewer) => (await currentRoom(viewer)).room.players.map((p) => p.uuid);

    return { clock, io, connect, sock, got, openRoom, disconnect, reconnectSocket, currentRoom, members };
}

test('A09-B-309 5명 방 손님 끊김 → 14.9초에 방 명단 그대로', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr309', n: 5 });
    const x = room.guests[0];
    w.disconnect(x);
    w.clock.advance(14_900);
    assert.equal((await w.members(room.host)).includes(x), true);
    assert.equal(w.got(room.host, 'player_left_room').length, 0);
});

test('A09-B-310 6명 방 손님 끊김 15초 → 방 사람들 player_left_room, 명단에서 빠짐', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr310', n: 6 });
    const x = room.guests[0];
    w.disconnect(x);
    w.clock.advance(14_999);
    assert.equal(w.got(room.host, 'player_left_room').length, 0);
    w.clock.advance(1);
    for (const u of room.uuids.filter((u) => u !== x)) {
        assert.equal(w.got(u, 'player_left_room').filter((p) => p.uuid === x).length, 1, u);
    }
    assert.equal((await w.members(room.host)).includes(x), false);
});

test('A09-B-311 7명 방 10초에 붙어 get_current_room → 15초 지나도 명단 그대로', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr311', n: 7 });
    const x = room.guests[0];
    w.disconnect(x);
    w.clock.advance(10_000);
    await w.reconnectSocket(x);
    const mine = await w.currentRoom(x);
    assert.equal(mine.room?.roomId, room.roomId);
    w.clock.advance(10_000);
    assert.equal((await w.members(room.host)).includes(x), true);
    assert.equal(w.got(room.host, 'player_left_room').length, 0);
});

test('A09-B-312 8명 방 방장 끊겨 15초 → host_changed 방장 = 남은 사람 중 먼저 들어온 사람', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr312', n: 8 });
    w.disconnect(room.host);
    w.clock.advance(15_000);
    const watcher = room.guests.at(-1);
    assert.equal(w.got(watcher, 'host_changed').at(-1)?.hostUuid, room.guests[0]);
});

test('A09-B-313 혼자인 공개 방에서 끊겨 15초 → 방 목록에서 사라짐', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr313', n: 1, accessType: 'open' });
    const listed = () => new Promise((resolve) => MM.handleGetPublicRooms((r) => resolve(r.rooms.map((x) => x.id))));
    assert.equal((await listed()).includes(room.roomId), true);
    w.disconnect(room.host);
    w.clock.advance(15_000);
    assert.equal((await listed()).includes(room.roomId), false);
});

test('A09-B-314 6명 방 leave_room → 15초 없이 바로 player_left_room', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr314', n: 6 });
    const x = room.guests[0];
    MM.removeFromRoom(w.io, w.sock(x), x);
    assert.equal(w.got(room.host, 'player_left_room').filter((p) => p.uuid === x).length, 1);
    assert.equal((await w.members(room.host)).includes(x), false);
});

test('A09-B-315 6명 방 손님 1명 끊김(15초 안) + 방장 시작 → 거절, 글 "일부 참가자와의 연결을 확인할 수 없습니다"', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr315', n: 6 });
    w.disconnect(room.guests[0]);
    w.clock.advance(5_000);
    const reply = await mf.callAsPromise(MM.handleStartGame, w.io, w.sock(room.host), room.host, mf.startPayload(room));
    assert.equal(reply.ok, false);
    assert.ok(reply.message?.includes('일부 참가자와의 연결을 확인할 수 없습니다'), `글: ${reply.message}`);
});

test('A09-B-316 [지금 동작] 5명 방 10초에 소켓만 붙음(get_current_room 안 함) → 15초에 빠짐', async (t) => {
    const w = makeRoomWorld(t);
    const room = await w.openRoom({ prefix: 'a09rr316', n: 5 });
    const x = room.guests[0];
    w.disconnect(x);
    w.clock.advance(10_000);
    await w.reconnectSocket(x);
    w.clock.advance(5_000);
    assert.equal(w.got(room.host, 'player_left_room').filter((p) => p.uuid === x).length, 1);
    assert.equal((await w.members(room.host)).includes(x), false);
});

'use strict';

// 접속 표시 흐름 시험(시험 DB 씀) — 접속·끊김 때 접속 중인 친구에게만 알림, 새 탭 밀어내기·빠른 다시 접속, 친구 목록·검색의 접속 칸
// 목록 A13-B-101~112 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-presence.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, befriend } = W;
const presence = require('../../socket/connection/presence');
const presenceService = require('../../services/presence/status');
const friendService = require('../../services/friend');
const emitter = require('../../socket/emitter');
const mf = require('../helpers/matchmakingFixtures');

const noDb = W.useTestDb(test);

// 접속 세상: 가짜 io를 보내기 창구에, 접속 목록은 서버 진짜 목록(emitter)
function makeWorld(t) {
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    emitter.onlineUsers.clear();
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    let seq = 0;
    // 소켓 하나 접속 (서버 접속 처리 그대로)
    async function connect(uuid) {
        seq += 1;
        const s = mf.createFakeSocket(uuid, { id: `a13p-${uuid.slice(0, 8)}-${seq}` });
        s.disconnect = () => { s.connected = false; };
        s.data.user = { uuid, sessionId: `sess-${uuid}` };
        s.rooms.add(emitter.userChannelOf(uuid));
        io.sockets.sockets.set(s.id, s);
        await presence.handleConnection(io, s, uuid);
        return s;
    }
    // 소켓 끊김 (서버 끊김 처리 그대로)
    async function disconnect(uuid, s) {
        s.connected = false;
        await presence.handleDisconnect(io, s, uuid);
    }
    return { io, connect, disconnect };
}

// 그 소켓이 받은 접속 표시 알림 (나에 대한 것만)
const statusSeen = (s, aboutUuid) => s.received.filter((e) => e.event === 'friend_status_change' && e.payload.uuid === aboutUuid).map((e) => e.payload.status);
const savedStatus = async (uuid) => (await db.OnlinePresence.findByPk(uuid, { raw: true }))?.status ?? null;

// 친구 3명 중 2명 접속, 나 접속
async function threeFriendsTwoOnline(t) {
    const w = makeWorld(t);
    const me = await createUser('me');
    const friends = [await createUser('f1'), await createUser('f2'), await createUser('f3')];
    for (const f of friends) await befriend(me, f);
    const on1 = await w.connect(friends[0]);
    const on2 = await w.connect(friends[1]);
    // 접속 안 한 친구: 채널은 있지만 끊긴 소켓 (받으면 안 됨)
    const off = mf.createFakeSocket(friends[2], { id: 'a13p-off' });
    off.rooms.add(emitter.userChannelOf(friends[2]));
    off.connected = false;
    w.io.sockets.sockets.set(off.id, off);
    const mine = await w.connect(me);
    return { w, me, on1, on2, off, mine };
}

test('A13-B-101 친구 3명 중 2명 접속, 나 접속 → 그 2명만 friend_status_change ONLINE 1번씩, 접속 안 한 친구 0번', async (t) => {
    if (noDb(t)) return;
    const { me, on1, on2, off } = await threeFriendsTwoOnline(t);
    assert.deepEqual(statusSeen(on1, me), ['ONLINE']);
    assert.deepEqual(statusSeen(on2, me), ['ONLINE']);
    assert.deepEqual(statusSeen(off, me), []);
});

test('A13-B-102 위 상태에서 내 소켓 끊김 → 그 2명에게 OFFLINE 1번씩', async (t) => {
    if (noDb(t)) return;
    const { w, me, on1, on2, mine } = await threeFriendsTwoOnline(t);
    await w.disconnect(me, mine);
    assert.deepEqual(statusSeen(on1, me).filter((s) => s === 'OFFLINE'), ['OFFLINE']);
    assert.deepEqual(statusSeen(on2, me).filter((s) => s === 'OFFLINE'), ['OFFLINE']);
});

test('A13-B-103 친구 0명이 접속 → friend_status_change 0번', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const loner = await createUser('lone');
    const other = await createUser('oth');
    const otherSock = await w.connect(other);
    await w.connect(loner);
    assert.equal(w.io.broadcasts.filter((b) => b.event === 'friend_status_change' && b.payload.uuid === loner).length, 0);
    assert.deepEqual(statusSeen(otherSock, loner), []);
});

test('A13-B-104 같은 계정 두 번째 소켓 접속 → 옛 소켓 끊김, 친구에게 OFFLINE 0번, 마지막 저장 ONLINE', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    const fs = await w.connect(friend);
    const oldSock = await w.connect(me);
    await w.connect(me);
    // 밀려난 옛 소켓의 끊김 처리
    await w.disconnect(me, oldSock);
    assert.deepEqual(statusSeen(fs, me).filter((s) => s === 'OFFLINE'), []);
    assert.equal(await savedStatus(me), 'ONLINE');
});

test('A13-B-105 끊김과 다시 접속을 겹쳐 보냄(저장이 늦게 끝나게) → 마지막 저장 ONLINE, 친구가 마지막에 받은 값 ONLINE', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    const fs = await w.connect(friend);
    const first = await w.connect(me);
    // 저장을 늦게 끝나게 (진짜 저장은 그대로 함)
    const realSet = presenceService.setPresence;
    t.mock.method(presenceService, 'setPresence', async (...args) => {
        for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
        return realSet(...args);
    });
    // 친구 찾기 DB 답이 오는 차례를 고정: 끊김 쪽 답이 다시 접속 쪽 답보다 늦게 옴 (그냥 두면 그때그때 바뀜)
    const realFriends = presenceService.getAcceptedFriendUuids;
    let lookups = 0;
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async (...args) => {
        lookups += 1;
        const slow = lookups === 1;
        const found = await realFriends(...args);
        for (let i = 0; i < (slow ? 60 : 0); i += 1) await new Promise((resolve) => setImmediate(resolve));
        return found;
    });
    first.connected = false;
    const dropping = presence.handleDisconnect(w.io, first, me);
    const again = w.connect(me);
    await Promise.all([dropping, again]);
    assert.equal(await savedStatus(me), 'ONLINE', '마지막 저장');
    assert.equal(statusSeen(fs, me).at(-1), 'ONLINE', `친구가 받은 차례: ${statusSeen(fs, me).join(',')}`);
});

test('A13-B-106 나에게 신청만 보내 놓은 사람(친구 아님) 접속 → 나에게 0번', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const me = await createUser('me');
    const asker = await createUser('ask');
    await db.FriendRequest.create({ requester_id: asker, receiver_id: me, status: 'PENDING' });
    const mine = await w.connect(me);
    await w.connect(asker);
    assert.deepEqual(statusSeen(mine, asker), []);
});

// 친구 목록에서 그 친구 줄
const friendRow = async (me, friend) => (await friendService.getFriendList(me)).find((f) => f.id === friend);

test('A13-B-107 친구 목록: 접속 줄 ONLINE + 이 서버 접속 목록에 있음 → status ONLINE · online true', async (t) => {
    if (noDb(t)) return;
    makeWorld(t);
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    await db.OnlinePresence.create({ user_id: friend, status: 'ONLINE', last_active_at: new Date(), server_id: 'main' });
    emitter.onlineUsers.set(friend, 'a13p-listed');
    const row = await friendRow(me, friend);
    assert.equal(row.status, 'ONLINE');
    assert.equal(row.online, true);
});

test('A13-B-108 친구 목록: 접속 줄 ONLINE인데 접속 목록에 없음(서버 다시 켠 뒤) → OFFLINE · online false', async (t) => {
    if (noDb(t)) return;
    makeWorld(t);
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    await db.OnlinePresence.create({ user_id: friend, status: 'ONLINE', last_active_at: new Date(), server_id: 'main' });
    const row = await friendRow(me, friend);
    assert.equal(row.status, 'OFFLINE');
    assert.equal(row.online, false);
});

test('A13-B-109 한 번도 접속 안 한 친구 → 친구 목록 OFFLINE', async (t) => {
    if (noDb(t)) return;
    makeWorld(t);
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    assert.equal((await friendRow(me, friend)).status, 'OFFLINE');
});

// 검색 결과에서 그 사람 줄 (닉네임 전체로 찾음)
const searchRow = async (me, uuid) => (await friendService.searchUsers(await W.nicknameOf(uuid), me)).find((u) => u.id === uuid);

test('A13-B-110 한 번도 접속 안 한 사람 검색 → status UNKNOWN', async (t) => {
    if (noDb(t)) return;
    makeWorld(t);
    const me = await createUser('me');
    const other = await createUser('srch');
    const row = await searchRow(me, other);
    assert.ok(row, '검색에 안 나옴');
    assert.equal(row.status, 'UNKNOWN');
});

test('A13-B-111 검색: 접속 줄 ONLINE · 접속 목록 없음 → OFFLINE', async (t) => {
    if (noDb(t)) return;
    makeWorld(t);
    const me = await createUser('me');
    const other = await createUser('srch');
    await db.OnlinePresence.create({ user_id: other, status: 'ONLINE', last_active_at: new Date(), server_id: 'main' });
    const row = await searchRow(me, other);
    assert.ok(row, '검색에 안 나옴');
    assert.equal(row.status, 'OFFLINE');
});

test('A13-B-112 소켓 서버가 안 켜진 때(io 없음) + 접속 줄 ONLINE → 친구 목록 ONLINE', async (t) => {
    if (noDb(t)) return;
    emitter.setIo(null);
    emitter.onlineUsers.clear();
    const me = await createUser('me');
    const friend = await createUser('fr');
    await befriend(me, friend);
    await db.OnlinePresence.create({ user_id: friend, status: 'ONLINE', last_active_at: new Date(), server_id: 'main' });
    assert.equal((await friendRow(me, friend)).status, 'ONLINE');
});

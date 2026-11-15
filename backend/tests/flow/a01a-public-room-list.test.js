'use strict';

// 공개 방 목록 시험 — 공개·코드 방이 목록에 뜸, 코드는 안 실림, 가득 참 경계, 0.5초 묶음, 목록 묻기, 설정 바뀜·시작 반영
// 목록 A01-B-113~124 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "공개 방 목록에 뜨는 것"), 돌리기: node --env-file=.env.test --test tests/flow/a01a-public-room-list.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a01a-world');

// 가짜 시계 (목록 방송 0.5초 묶음이 setTimeout·Date.now를 씀) + 로비에 있는 구경꾼 하나
function listWorld(t, options = {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 });
    const w = makeWorld(t, options);
    w.connect('watcher');
    // 구경꾼이 받은 마지막 목록 방송의 방들
    const lastSeen = () => w.received('watcher', 'public_rooms_updated').at(-1)?.rooms ?? [];
    const advance = (ms) => t.mock.timers.tick(ms);
    return { w, lastSeen, advance };
}

// 이름 "가나다"로 만드는 가짜 계정
const NAMED = { userRepository: { findByUuid: async (uuid) => ({ uuid, nickname: '가나다' }) } };

test('A01-B-113 공개 방 만듦 → 0.5초 안 public_rooms_updated 항목 { id, current:1, max:10, title:가나다의 방, accessType:open, status:waiting, settings }', async (t) => {
    const { w, lastSeen, advance } = listWorld(t, { depsOverrides: NAMED });
    w.connect('maker');
    const reply = await w.create('maker', { accessType: 'open', maxPlayers: 10 });
    assert.equal(reply.ok, true, reply.message);
    advance(500);
    const item = lastSeen().find((r) => r.id === reply.room.roomId);
    assert.ok(item, '0.5초 안 목록 방송에 방이 없음');
    const { settings, ...rest } = item;
    assert.deepEqual(
        { id: rest.id, current: rest.current, max: rest.max, title: rest.title, accessType: rest.accessType, status: rest.status },
        { id: reply.room.roomId, current: 1, max: 10, title: '가나다의 방', accessType: 'open', status: 'waiting' },
    );
    assert.equal(settings?.maxPlayers, 10);
});

test('A01-B-114 코드 방 만듦 → 목록 항목 accessType:code', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    w.connect('maker');
    const reply = await w.create('maker', { accessType: 'code' });
    advance(500);
    const item = lastSeen().find((r) => r.id === reply.room.roomId);
    assert.ok(item, '코드 방이 목록에 없음');
    assert.equal(item.accessType, 'code');
});

test('A01-B-115 코드 방·공개 방 목록 항목 → roomCode·code 칸 없음', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    w.connect('a');
    w.connect('b');
    const open = await w.create('a', { accessType: 'open' });
    const coded = await w.create('b', { accessType: 'code' });
    advance(500);
    const items = lastSeen().filter((r) => r.id === open.room.roomId || r.id === coded.room.roomId);
    assert.equal(items.length, 2);
    for (const item of items) {
        assert.equal(Object.hasOwn(item, 'roomCode'), false, `${item.accessType} 항목에 roomCode`);
        assert.equal(Object.hasOwn(item, 'code'), false, `${item.accessType} 항목에 code`);
        assert.equal(JSON.stringify(item).includes(open.room.roomCode) || JSON.stringify(item).includes(coded.room.roomCode), false);
    }
});

// 가득 참 표시 경계: 정원·지금 인원 → status
const FULL_CASES = [
    ['A01-B-116', 5, 4, 'waiting'],
    ['A01-B-117', 5, 5, 'full'],
    ['A01-B-118', 10, 9, 'waiting'],
    ['A01-B-119', 10, 10, 'full'],
];
for (const [no, maxPlayers, n, status] of FULL_CASES) {
    test(`${no} 정원 ${maxPlayers} 방 ${n}명 → ${status}`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n, maxPlayers, accessType: 'open', readyAll: false });
        const listed = await w.publicRooms(room.host);
        const item = listed.rooms.find((r) => r.id === room.roomId);
        assert.equal(item?.current, n);
        assert.equal(item.status, status);
    });
}

test('A01-B-120 0.5초 안 방 3개 만듦 → 마지막 public_rooms_updated에 3개 다 있음', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    const ids = [];
    for (const uuid of ['r1', 'r2', 'r3']) {
        w.connect(uuid);
        const reply = await w.create(uuid, { accessType: 'open' });
        ids.push(reply.room.roomId);
        advance(100);
    }
    advance(500);
    const seen = lastSeen().map((r) => r.id);
    for (const id of ids) assert.ok(seen.includes(id), `마지막 방송에 ${id} 없음`);
});

test('A01-B-121 get_public_rooms → { ok:true, rooms }, 방송과 같은 항목', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    w.connect('a');
    w.connect('b');
    await w.create('a', { accessType: 'open' });
    await w.create('b', { accessType: 'code' });
    advance(500);
    const reply = await w.publicRooms('watcher');
    assert.equal(reply.ok, true);
    const byId = (rooms) => [...rooms].sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual(byId(reply.rooms), byId(lastSeen()));
    assert.equal(reply.rooms.length, 2);
});

test('A01-B-122 방장이 정원 10→8 → 다음 방송 항목 max:8, settings 새 값', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    const room = await w.openRoom({ prefix: 'b122', n: 1, maxPlayers: 10, accessType: 'open', readyAll: false });
    advance(500);
    const changed = await w.update(room.host, { maxPlayers: 8 });
    assert.equal(changed.ok, true, changed.message);
    advance(500);
    const item = lastSeen().find((r) => r.id === room.roomId);
    assert.equal(item?.max, 8);
    assert.equal(item.settings.maxPlayers, 8);
});

test('A01-B-123 방장이 open→code → 다음 방송 항목 accessType:code', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    const room = await w.openRoom({ prefix: 'b123', n: 1, accessType: 'open', readyAll: false });
    advance(500);
    const changed = await w.update(room.host, { accessType: 'code' });
    assert.equal(changed.ok, true, changed.message);
    advance(500);
    assert.equal(lastSeen().find((r) => r.id === room.roomId)?.accessType, 'code');
});

test('A01-B-124 5명 방 시작 → 다음 방송에 그 방 없음', async (t) => {
    const { w, lastSeen, advance } = listWorld(t);
    const room = await w.openRoom({ prefix: 'b124', n: 5, accessType: 'open' });
    advance(500);
    assert.ok(lastSeen().some((r) => r.id === room.roomId), '시작 전 목록에 방이 없음');
    const started = await w.start(room.host);
    assert.equal(started.ok, true, started.message);
    advance(500);
    assert.equal(lastSeen().some((r) => r.id === room.roomId), false);
});

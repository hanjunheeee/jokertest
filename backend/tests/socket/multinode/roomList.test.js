// 조각 4 공개 방 목록·다음 방·빠른 매칭 시험: 스냅샷 보내기·받기·합치기, 0.5초 묶음, 죽은 Node 빼기, 새 Node 읽기, Redis 죽음·살아남
// MN-011·028·080~085·087·088·101 (086은 진짜 Redis 통합 시험), 메모리 Redis 위 n1(이 프로세스)·n2
const test = require('node:test')
const assert = require('node:assert/strict')
const h = require('./roomJoinSetup')

const { keys, settle, cluster, roomListSync } = h
const { flushPublicRoomList } = require('../../../socket/matchmaking/room/view')

// 받은 목록 방송을 세는 가짜 io (local이 있으면 local로 보냄 → 그쪽만 셈)
function listIo() {
    const sent = []
    const local = { emit: (event, payload) => sent.push({ event, payload }) }
    return { sent, local, emit: () => { throw new Error('io.emit 쓰면 안 됨 (Redis 탐)') }, to: () => ({ emit() {} }), sockets: { sockets: new Map() } }
}
const lists = (io) => io.sent.filter((e) => e.event === 'public_rooms_updated').map((e) => e.payload.rooms)
const remoteRoom = (id, extra = {}) => ({ id, current: 1, max: 8, title: `${id} 방`, accessType: 'open', status: 'waiting', ...extra })
const snapshot = (n2, rooms, at = Date.now()) => n2.bus.publish(cluster.BUS_TYPES.ROOMS_SNAPSHOT, { node: 'n2', bootEpoch: n2.bootEpoch, rooms, at })

test('MN-088: 합치기 — 내 방 먼저, 같은 방 id면 최신 스냅샷 것, 순서는 Node 이름 순', () => {
    const merged = roomListSync.mergeRoomLists([{ id: 'a', node: 'n1' }], [
        { node: 'n3', at: 10, rooms: [{ id: 'x', v: 'old' }, { id: 'a', v: 'dup' }] },
        { node: 'n2', at: 20, rooms: [{ id: 'x', v: 'new' }, { id: 'y' }] },
    ])
    assert.deepEqual(merged, [{ id: 'a', node: 'n1' }, { id: 'x', v: 'new', node: 'n2' }, { id: 'y', node: 'n2' }])
})

test('n1 방이 바뀌면 rooms.snapshot 버스 + rooms:node:n1 키 (항목에 node 칸, MN-085)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const got = []
    n2.bus.on(cluster.BUS_TYPES.ROOMS_SNAPSHOT, (msg) => got.push(msg))
    const { io, answer } = await h.createRoom('host-open', 'open')
    flushPublicRoomList(io)
    await h.waitFor(() => got.length > 0)
    assert.equal(got.at(-1).node, 'n1')
    assert.deepEqual(got.at(-1).rooms.map((r) => [r.id, r.node]), [[answer.room.roomId, 'n1']])
    assert.equal((await n2.directory.read(keys().roomsNode('n1'))).value.rooms[0].id, answer.room.roomId)
})

test('MN-082·085·087: get_public_rooms 답에 n2 방도 (node n2, 꽉 참 상태 그대로)', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await h.createRoom('host-mine', 'open')
    await snapshot(n2, [remoteRoom('far-1', { status: 'full', current: 8 })])
    await h.waitFor(() => roomListSync.__remoteSnapshotsForTests().has('n2'))
    const answer = await new Promise((resolve) => h.handleGetPublicRooms(resolve))
    assert.deepEqual(answer.rooms.map((r) => [r.node, r.status]), [['n1', 'waiting'], ['n2', 'full']])
})

test('MN-080·081·086(단위): 받은 스냅샷 여러 개 → 내 Node 사람에게 0.5초에 한 번 io.local로, 마지막 상태는 꼭 감', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    const io = listIo()
    roomListSync.bindRoomListIo(io)
    for (let k = 1; k <= 5; k += 1) {
        await snapshot(n2, [remoteRoom(`v${k}`)], Date.now() + k)
        await h.tick(10)
    }
    assert.equal(lists(io).length, 1)
    await h.waitFor(() => lists(io).length === 2, 2000)
    assert.deepEqual(lists(io).at(-1).map((r) => r.id), ['v5'])
    // 5초마다 오는 같은 내용은 다시 안 보냄
    await snapshot(n2, [remoteRoom('v5')], Date.now() + 10)
    await h.tick(600)
    assert.equal(lists(io).length, 2)
})

test('MN-084: 새로 켠 Node는 rooms:node:<id> 키로 바로 전체 목록', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await n2.directory.write(keys().roomsNode('n2'), { node: 'n2', bootEpoch: n2.bootEpoch, rooms: [remoteRoom('early')], at: Date.now() }, { ttlMs: 15000 })
    const io = listIo()
    roomListSync.bindRoomListIo(io)
    await h.waitFor(() => lists(io).length === 1)
    assert.deepEqual(lists(io)[0].map((r) => r.id), ['early'])
})

test('MN-083: 죽은 Node(하트비트 없음) 스냅샷은 빠지고 목록 다시 보냄', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    roomListSync.__setRoomListTimingForTests({ deadGraceMs: 0 })
    t.after(() => roomListSync.__setRoomListTimingForTests({ deadGraceMs: 4000 }))
    const io = listIo()
    roomListSync.bindRoomListIo(io)
    await snapshot(n2, [remoteRoom('bye')])
    await h.waitFor(() => roomListSync.__remoteSnapshotsForTests().has('n2'))
    await n2.close()
    await cluster.nodes.refresh()
    await h.tick(5)
    await roomListSync.__tickRoomListForTests()
    assert.equal(roomListSync.__remoteSnapshotsForTests().has('n2'), false)
    await h.waitFor(() => lists(io).some((rooms) => rooms.length === 0), 2000)
})

test('MN-101: Redis 죽으면 내 방만, 살아나면 내 스냅샷 다시 보냄', async (t) => {
    const { n2, hub } = await h.startRoomNodes(t)
    await h.createRoom('host-r', 'open')
    await snapshot(n2, [remoteRoom('far')])
    await h.waitFor(() => roomListSync.__remoteSnapshotsForTests().has('n2'))
    hub.setDown(true)
    const during = await new Promise((resolve) => h.handleGetPublicRooms(resolve))
    assert.deepEqual(during.rooms.map((r) => r.node), ['n1'])
    const before = hub.published.length
    roomListSync.bindRoomListIo(listIo())
    hub.setDown(false)
    await h.waitFor(() => hub.published.slice(before).some((p) => p.message.includes('"rooms.snapshot"')), 3000)
})

test('MN-011: 판에서 나간 사람이 n1에서 n2 판 다음 방을 물으면 { ok:false, code ROOM_ON_OTHER_NODE, node n2 }', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    await n2.directory.write(keys().game('g-n2'), 'n2', { ttlMs: 60000 })
    const answer = await new Promise((resolve) => h.matchmaking.__testables.handleGetPartyMatchingRoom('u-left', { gameId: 'g-n2' }, resolve))
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(answer.node, 'n2')
    // 어디에도 없는 판이면 예전처럼 빈 답
    const none = await new Promise((resolve) => h.matchmaking.__testables.handleGetPartyMatchingRoom('u-left', { gameId: 'g-none' }, resolve))
    assert.deepEqual(none, { ok: true, gameId: 'g-none', room: null })
})

test('MN-028: 빠른 매칭 켜도 Node 여러 개면 matchmaking_disabled + 경고 한 번', async (t) => {
    await h.startRoomNodes(t)
    h.matchmaking.__setRandomMatchmakingEnabledForTests(true)
    t.after(() => h.matchmaking.__setRandomMatchmakingEnabledForTests(false))
    const warns = t.mock.method(console, 'warn', () => {})
    const socket = h.createFakeSocket('u-quick')
    await h.matchmaking.__testables.handleJoinMatchmaking(h.createFakeIo([socket]), socket, 'u-quick')
    await h.matchmaking.__testables.handleJoinMatchmaking(h.createFakeIo([socket]), socket, 'u-quick')
    assert.equal(socket.emitted.filter((e) => e.event === 'matchmaking_disabled').length, 2)
    assert.equal(warns.mock.calls.filter((c) => String(c.arguments[0]).includes('빠른 매칭')).length, 1)
})

test('단일 모드(REDIS_URL 없음): 목록은 io.emit 그대로, node 칸 없음, 스냅샷 안 보냄', async (t) => {
    h.matchmaking.__resetStateForTests()
    t.after(() => h.matchmaking.__resetStateForTests())
    const sent = []
    const io = { emit: (event, payload) => sent.push(payload), local: { emit: () => { throw new Error('단일 모드는 io.emit') } }, to: () => ({ emit() {} }), sockets: { sockets: new Map() } }
    await h.createRoom('host-single', 'open', null)
    const { emitPublicRoomList } = require('../../../socket/matchmaking/room/view')
    emitPublicRoomList(io)
    flushPublicRoomList(io)
    assert.equal(cluster.mode(), 'off')
    assert.equal(sent.length, 1)
    assert.equal('node' in sent[0].rooms[0], false)
    await settle()
})

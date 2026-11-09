// 방 만들기 이동 시험 (MN-114 방 만들기 쪽), draining Node에서 방 만들기는 덜 바쁜 다른 Node로 보냄
// 메모리 Redis 위 n1(이 프로세스 matchmaking)·n2, 갈 곳 없음·Redis 죽음·단일 모드는 예전처럼 여기서 만듦
const test = require('node:test')
const assert = require('node:assert/strict')
const h = require('./roomJoinSetup')
const { playerRoom, gameRooms } = require('../../../socket/matchmaking/core/state')
const { rejectCreateOnDrainingNode } = require('../../../socket/matchmaking/cluster/roomRouting')

const { cluster, waitFor } = h
const { quietLog } = require('./setup')

// n1 draining 켜고 시험 끝에 끔
function drainSelf(t) {
    cluster.nodes.setDraining(true)
    t.after(() => cluster.nodes.setDraining(false))
}

test('MN-114: draining n1에서 방 만들기 → ack ROOM_ON_OTHER_NODE + node n2, 방·자리 안 만듦', async (t) => {
    await h.startRoomNodes(t)
    drainSelf(t)

    const { answer } = await h.createRoom('host-drain', 'code')

    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(answer.node, 'n2')
    assert.equal(typeof answer.message, 'string')
    assert.equal(playerRoom.has('host-drain'), false)
    assert.equal(gameRooms.size, 0)
})

test('MN-114: 다른 Node도 draining이면 갈 곳 없음 → 여기서 그대로 만듦', async (t) => {
    const { n2 } = await h.startRoomNodes(t)
    drainSelf(t)
    n2.nodes.setDraining(true)
    await waitFor(async () => { await cluster.nodes.refresh(); return cluster.nodes.list().find((n) => n.id === 'n2')?.draining })

    const { answer } = await h.createRoom('host-stay', 'code')

    assert.equal(answer.ok, true)
    assert.equal(playerRoom.has('host-stay'), true)
})

test('MN-114: 결과 화면 방장(끝난 판)은 draining이어도 여기서 만듦 (파티 자동 입장이 같은 Node라)', async (t) => {
    await h.startRoomNodes(t)
    drainSelf(t)
    const gameSession = require('../../../game-core/gameSession')
    t.mock.method(gameSession, 'getEndedGameId', (uuid) => (uuid === 'host-party' ? 'g-ended' : null))

    const { answer } = await h.createRoom('host-party', 'code')

    assert.equal(answer.ok, true)
})

test('MN-114: draining 아님 → 여기서 만듦 (이동 없음)', async (t) => {
    await h.startRoomNodes(t)
    const { answer } = await h.createRoom('host-normal', 'code')
    assert.equal(answer.ok, true)
})

test('MN-114: Redis 죽음 동안 draining이어도 여기서 만듦 (Node 목록을 못 믿음)', async (t) => {
    const { hub } = await h.startRoomNodes(t)
    drainSelf(t)
    hub.setDown(true)
    assert.equal(cluster.isShared(), false)
    assert.equal(rejectCreateOnDrainingNode(() => assert.fail('답하면 안 됨')), false)
})

test('MN-114: 단일 모드 → 기다림 없이 바로 false, 답 안 함 (지금과 같음)', async (t) => {
    await cluster.init({ env: {}, log: quietLog })
    t.after(() => cluster.close())
    cluster.nodes.setDraining(true)
    t.after(() => cluster.nodes.setDraining(false))
    assert.equal(rejectCreateOnDrainingNode(() => assert.fail('답하면 안 됨')), false)
})

test('MN-114 봇: create_room 답이 ROOM_ON_OTHER_NODE면 n2로 옮긴 뒤 한 번만 다시 (화면과 같음)', async () => {
    const { Bot } = require('../../../scripts/loadtest/bot')
    const noop = () => {}
    const bot = new Bot({ origin: 'http://x', account: {}, index: 0, stats: { latency: noop, error: noop, rejection: noop } })
    const sent = []
    const listeners = new Map()
    const answers = [{ ok: false, code: 'ROOM_ON_OTHER_NODE', node: 'n2' }, { ok: false, code: 'ROOM_ON_OTHER_NODE', node: 'n3' }]
    bot.socket = {
        io: { opts: {} },
        timeout() { return this },
        async emitWithAck(event) { sent.push({ event, node: this.io.opts.query?.node ?? null }); return answers.shift() ?? { ok: true } },
        on(event, fn) { listeners.set(event, fn) },
        off(event) { listeners.delete(event) },
        disconnect() {},
        connect() { queueMicrotask(() => listeners.get('connect')?.()) },
    }

    const reply = await bot.request('create_room', {})

    assert.deepEqual(sent, [{ event: 'create_room', node: null }, { event: 'create_room', node: 'n2' }])
    assert.equal(reply.code, 'ROOM_ON_OTHER_NODE')
})

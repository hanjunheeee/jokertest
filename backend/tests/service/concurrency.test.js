const test = require('node:test')
const assert = require('node:assert/strict')

const concurrency = require('../../service/concurrency.service')
const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocket = require('../../socket/gameSession')
const socketModule = require('../../socket/socket')
const presenceService = require('../../service/presence.service')
const userRepository = require('../../repositories/user.repositories')

function resetAll() {
    concurrency.stopConcurrentSnapshotScheduler({ clearIntervalFn: () => {} })
    gameSessionCore.__resetStateForTests()
    gameSessionSocket.__resetStateForTests()
    socketModule.__getOnlineUsersForTests().clear()
    gameSessionSocket.setOnlineUsersRegistry(socketModule.__getOnlineUsersForTests())
}

function stubSocketDbEffects(t) {
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(userRepository, 'recordLogout', async () => {})
}

function createIo() {
    const sockets = new Map()
    return {
        sockets: { sockets },
        to: () => ({ emit() {} }),
        in: () => ({ socketsLeave() {} }),
    }
}

function createSocket(io, id, uuid) {
    const handlers = {}
    const socket = {
        id,
        data: { user: { uuid } },
        rooms: new Set(),
        on(event, handler) { handlers[event] = handler },
        emit() {},
        join(room) { this.rooms.add(room) },
        disconnect() {},
        handlers,
    }
    io.sockets.sockets.set(id, socket)
    return socket
}

function startSession(id, uuids) {
    const room = {
        id,
        players: new Map(uuids.map((uuid) => [uuid, { uuid, nickname: uuid, isReady: true }])),
        settings: { jokerCount: 0 },
    }
    const prepared = gameSessionCore.prepareGameSession(room)
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)
    return prepared.session
}

test('live registries derive total/lobby/in_game/room_count without duplicate state', () => {
    resetAll()
    const onlineUsers = new Map([['a', 'socket-a'], ['b', 'socket-b'], ['lobby', 'socket-c']])
    startSession('room-presence', ['a', 'b'])

    const gameSnapshot = gameSessionSocket.getActiveGamePresenceSnapshot()
    assert.equal(gameSnapshot.room_count, 1)
    assert.deepEqual(gameSnapshot.participantUuids, new Set(['a', 'b']))
    assert.deepEqual(concurrency.getCurrentSnapshot(onlineUsers, gameSnapshot), {
        total: 3,
        lobby: 1,
        in_game: 2,
        room_count: 1,
    })
    resetAll()
})

test('canonical replacement and stale disconnect keep one unique online user', (t) => {
    resetAll()
    stubSocketDbEffects(t)
    t.after(resetAll)
    const io = createIo()
    const first = createSocket(io, 'socket-1', 'same-user')
    const second = createSocket(io, 'socket-2', 'same-user')

    socketModule.__testables.registerConnectionHandlers(io, first)
    socketModule.__testables.registerConnectionHandlers(io, second)
    assert.equal(first.data.forcedLogout, true)
    assert.equal(socketModule.__getOnlineUsersForTests().size, 1)

    first.handlers.disconnect()
    assert.equal(socketModule.__getOnlineUsersForTests().size, 1)
    assert.deepEqual(
        concurrency.getCurrentSnapshot(
            socketModule.__getOnlineUsersForTests(),
            gameSessionSocket.getActiveGamePresenceSnapshot(),
        ),
        { total: 1, lobby: 1, in_game: 0, room_count: 0 },
    )

    second.handlers.disconnect()
    assert.equal(socketModule.__getOnlineUsersForTests().size, 0)
})

test('snapshot scheduler uses configured interval, exact model fields, unref, stop, and survives DB failure', async () => {
    resetAll()
    const onlineUsers = new Map([['a', 'socket-a']])
    const getGameSnapshot = () => ({ room_count: 0, participantUuids: new Set() })
    const calls = []
    let tick
    let unrefCalled = false
    let cleared = false
    const timer = { unref() { unrefCalled = true } }
    const model = {
        async create(values) {
            calls.push(values)
            if (calls.length === 1) throw new Error('db unavailable')
            return values
        },
    }

    concurrency.startConcurrentSnapshotScheduler({
        onlineUsers,
        getGameSnapshot,
        model,
        now: () => new Date('2026-08-30T00:00:00.000Z'),
        intervalMs: 25,
        setIntervalFn(callback, ms) {
            assert.equal(ms, 25)
            tick = callback
            return timer
        },
    })
    assert.equal(unrefCalled, true)

    tick()
    await new Promise((resolve) => setImmediate(resolve))
    tick()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls.length, 2, 'a failed DB write does not stop later ticks')
    assert.deepEqual(Object.keys(calls[1]).sort(), ['captured_at', 'in_game', 'lobby', 'room_count', 'total'])
    assert.deepEqual(calls[1], {
        captured_at: new Date('2026-08-30T00:00:00.000Z'),
        total: 1,
        lobby: 1,
        in_game: 0,
        room_count: 0,
    })

    concurrency.stopConcurrentSnapshotScheduler({
        clearIntervalFn(handle) {
            assert.equal(handle, timer)
            cleared = true
        },
    })
    assert.equal(cleared, true)
    assert.equal(concurrency.resolveIntervalMs(undefined), 60_000)
})

const test = require('node:test')
const assert = require('node:assert/strict')

const socketModule = require('../socket/socket')
const gameSessionSocketLayer = require('../socket/gameSession')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('../socket/matchmaking')
const presenceService = require('../service/presence.service')
const userRepository = require('../repositories/user.repositories')
const concurrentUsers = require('../service/concurrentUsers.service')
const scheduler = require('../service/concurrentSnapshot.scheduler')
const concurrentSnapshotRepository = require('../repositories/concurrentSnapshot.repositories')

// ---------------------------------------------------------------------------
// 하네스 — concurrentUsers.test.js와 같은 방식으로 실제 소켓 배선만 구동한다.
// ---------------------------------------------------------------------------

function resetAll() {
    // 이 파일이 거는 타이머는 전부 주입된 가짜라(실제 setInterval을 쓰는 경로가 없다) 해제도
    // no-op으로 충분하다 — 스케줄러의 intervalId만 null로 되돌리면 다음 테스트가 다시 걸 수 있다.
    scheduler.stopConcurrentSnapshotScheduler({ clearIntervalFn: () => {} })
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    concurrentUsers.__resetConcurrentStateForTests()
    socketModule.__getOnlineUsersForTests().clear()
    gameSessionSocketLayer.setOnlineUsersRegistry(socketModule.__getOnlineUsersForTests())
}

function stubDbSideEffects(t) {
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(userRepository, 'recordLogout', async () => {})
}

function createFakeIo() {
    const sockets = new Map()
    return {
        sockets: { sockets },
        to() {
            return { emit() {} }
        },
        in() {
            return {
                socketsLeave(roomId) {
                    for (const s of sockets.values()) s.rooms?.delete(roomId)
                },
            }
        },
    }
}

function createFakeSocket(io, id, uuid) {
    const handlers = {}
    const socket = {
        id,
        data: { user: { uuid } },
        rooms: new Set(),
        handlers,
        on(event, cb) {
            handlers[event] = cb
        },
        emit() {},
        join(roomId) {
            this.rooms.add(roomId)
        },
        disconnect() {},
    }
    io.sockets.sockets.set(id, socket)
    return socket
}

/** DB에 닿지 않는 저장소 대역 — 받은 레코드를 그대로 모아 둔다. */
function createRecordingRepository() {
    const saved = []
    return {
        saved,
        async createSnapshot(record) {
            saved.push(record)
            return record
        },
    }
}

/** 항상 실패하는 저장소 대역 — DB 장애를 재현한다. */
function createFailingRepository() {
    let attempts = 0
    return {
        get attempts() {
            return attempts
        },
        async createSnapshot() {
            attempts += 1
            throw new Error('DB unavailable')
        },
    }
}

// ---------------------------------------------------------------------------
// AC-02 — 설정된 주기(기본 60초)마다 5개 필드를 갖춘 레코드가 저장된다
// ---------------------------------------------------------------------------

test('AC-02 스케줄러는 기본 60초 주기로 스냅샷을 저장한다', async (t) => {
    resetAll()
    t.after(resetAll)

    const repository = createRecordingRepository()
    let scheduledIntervalMs = null
    let tick = null
    const setIntervalFn = (cb, ms) => {
        tick = cb
        scheduledIntervalMs = ms
        return { unref() {} }
    }

    scheduler.startConcurrentSnapshotScheduler({ repository, setIntervalFn })
    assert.equal(scheduledIntervalMs, 60_000, '기본 주기는 60초다')
    assert.equal(scheduledIntervalMs, scheduler.DEFAULT_SNAPSHOT_INTERVAL_MS)
    assert.equal(repository.saved.length, 0, '기동만으로는 아직 저장하지 않는다')

    // 두 번째 기동은 타이머를 다시 걸지 않는다(멱등) — 주기가 두 벌 돌면 표본이 중복된다.
    let secondStartScheduled = false
    scheduler.startConcurrentSnapshotScheduler({
        repository,
        setIntervalFn: () => {
            secondStartScheduled = true
            return { unref() {} }
        },
    })
    assert.equal(secondStartScheduled, false)

    for (let i = 0; i < 3; i += 1) {
        tick()
        await new Promise((resolve) => setImmediate(resolve))
    }
    assert.equal(repository.saved.length, 3, '주기마다 한 건씩 저장된다')

    // 멈춘 뒤에는 더 이상 타이머가 남지 않는다.
    let clearedId = null
    scheduler.stopConcurrentSnapshotScheduler({ clearIntervalFn: (id) => { clearedId = id } })
    assert.notEqual(clearedId, null)
})

test('AC-02 각 레코드는 captured_at·total·lobby·in_game·room_count를 담는다', async (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-snap-a', 'snap-a')
    const b = createFakeSocket(io, 'socket-snap-b', 'snap-b')
    socketModule.__testables.registerConnectionHandlers(io, a)
    socketModule.__testables.registerConnectionHandlers(io, b)

    const room = {
        id: 'room-snap',
        players: new Map([
            ['snap-a', { uuid: 'snap-a', nickname: 'A', isReady: true }],
            ['snap-b', { uuid: 'snap-b', nickname: 'B', isReady: true }],
        ]),
        settings: { jokerCount: 0 },
    }
    const prepared = gameSessionCore.prepareGameSession(room)
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)

    const repository = createRecordingRepository()
    const capturedAtMs = 1_700_000_000_000
    const ok = await scheduler.captureConcurrentSnapshot({ repository, nowFn: () => capturedAtMs })

    assert.equal(ok, true)
    assert.equal(repository.saved.length, 1)

    const record = repository.saved[0]
    assert.deepEqual(Object.keys(record).sort(), ['captured_at', 'in_game', 'lobby', 'room_count', 'total'])
    assert.equal(record.captured_at instanceof Date, true)
    assert.equal(record.captured_at.getTime(), capturedAtMs)
    assert.equal(record.total, 2)
    assert.equal(record.lobby, 0)
    assert.equal(record.in_game, 2)
    assert.equal(record.room_count, 1)
    assert.equal(record.total, record.lobby + record.in_game)
})

test('AC-02 실제 저장소는 concurrent_snapshots 모델에 5개 필드를 그대로 넘긴다', async (t) => {
    const db = require('../models')
    const originalModel = db.ConcurrentSnapshot

    // 모델 스키마 자체가 AC-02의 5개 필드를 갖고 있는지 먼저 확인한다(DB 연결은 하지 않는다).
    assert.equal(originalModel.tableName, 'concurrent_snapshots')
    for (const field of ['captured_at', 'total', 'lobby', 'in_game', 'room_count']) {
        assert.notEqual(originalModel.rawAttributes[field], undefined, `${field} 컬럼이 없다`)
    }

    const created = []
    db.ConcurrentSnapshot = {
        async create(values) {
            created.push(values)
            return values
        },
    }
    t.after(() => {
        db.ConcurrentSnapshot = originalModel
    })

    const captured_at = new Date(1_700_000_000_000)
    await concurrentSnapshotRepository.createSnapshot({
        captured_at,
        total: 5,
        lobby: 3,
        in_game: 2,
        room_count: 1,
    })

    assert.deepEqual(created, [{ captured_at, total: 5, lobby: 3, in_game: 2, room_count: 1 }])
})

// ---------------------------------------------------------------------------
// AC-03 — DB 저장이 실패해도 연결·해제와 로비·게임 로직은 정상 동작한다
// ---------------------------------------------------------------------------

test('AC-03 스냅샷 저장이 실패해도 예외가 새어나가지 않고 false만 돌려준다', async (t) => {
    resetAll()
    t.after(resetAll)

    const repository = createFailingRepository()
    const result = await scheduler.captureConcurrentSnapshot({ repository })

    assert.equal(result, false)
    assert.equal(repository.attempts, 1)
})

test('AC-03 스냅샷 저장이 계속 실패해도 연결·해제와 로비·게임 로직이 정상 처리된다', async (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const repository = createFailingRepository()
    let tick = null
    scheduler.startConcurrentSnapshotScheduler({
        repository,
        setIntervalFn: (cb) => {
            tick = cb
            return { unref() {} }
        },
    })

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-fail-a', 'fail-a')
    const b = createFakeSocket(io, 'socket-fail-b', 'fail-b')

    // 연결 — 저장 실패가 진행 중이어도 카운터는 정상적으로 오른다.
    socketModule.__testables.registerConnectionHandlers(io, a)
    tick()
    await new Promise((resolve) => setImmediate(resolve))
    socketModule.__testables.registerConnectionHandlers(io, b)
    tick()
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 2, lobby: 2, in_game: 0, room_count: 0 })
    assert.equal(socketModule.__getOnlineUsersForTests().size, 2)

    // 게임 로직 — 세션 시작·종료가 저장 실패와 무관하게 그대로 동작한다.
    const room = {
        id: 'room-fail',
        players: new Map([
            ['fail-a', { uuid: 'fail-a', nickname: 'A', isReady: true }],
            ['fail-b', { uuid: 'fail-b', nickname: 'B', isReady: true }],
        ]),
        settings: { jokerCount: 0 },
    }
    const prepared = gameSessionCore.prepareGameSession(room)
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)
    a.data.activeGameId = prepared.session.id
    b.data.activeGameId = prepared.session.id

    tick()
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 2, lobby: 0, in_game: 2, room_count: 1 })

    let ack = null
    gameSessionSocketLayer.__testables.handleLeaveGameSession(io, a, 'fail-a', { gameId: prepared.session.id }, (res) => {
        ack = res
    })
    assert.equal(ack.ok, true)
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().gameSessions.length,
        0,
        '세션 종료가 스냅샷 실패에 막히지 않는다',
    )

    // 해제 — 저장 실패가 반복돼도 카운터가 정확히 0으로 돌아온다.
    a.handlers.disconnect()
    tick()
    await new Promise((resolve) => setImmediate(resolve))
    b.handlers.disconnect()
    tick()
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 0, lobby: 0, in_game: 0, room_count: 0 })
    assert.equal(socketModule.__getOnlineUsersForTests().size, 0)
    assert.equal(repository.attempts >= 5, true, '주기마다 저장을 계속 재시도했다')
})

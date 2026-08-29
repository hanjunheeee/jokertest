const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const socketModule = require('../socket/socket')
const gameSessionSocketLayer = require('../socket/gameSession')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('../socket/matchmaking')
const presenceService = require('../service/presence.service')
const userRepository = require('../repositories/user.repositories')
const concurrentUsers = require('../service/concurrentUsers.service')

// ---------------------------------------------------------------------------
// 테스트 하네스 — 실제 Socket.IO 서버 없이 소켓 계층의 연결/해제 배선만 구동한다.
// ---------------------------------------------------------------------------

/**
 * 프로세스 재시작과 동치인 상태로 되돌린다 — 모든 인메모리 registry를 비우고, socket.js가
 * 모듈 로드 시 하던 registry 주입을 다시 해 준다(__resetStateForTests가 null로 되돌리므로).
 */
function resetAll() {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    concurrentUsers.__resetConcurrentStateForTests()
    socketModule.__getOnlineUsersForTests().clear()
    gameSessionSocketLayer.setOnlineUsersRegistry(socketModule.__getOnlineUsersForTests())
}

/** 연결 경로의 DB 부수효과(presence upsert·친구 조회·로그아웃 기록)를 전부 막는다. */
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

/** 실제 connection 배선을 그대로 태운다(handleConnection은 첫 await 전에 카운터를 갱신한다). */
function connect(io, socket) {
    socketModule.__testables.registerConnectionHandlers(io, socket)
}

/** 실제 disconnect 배선을 그대로 태운다(gameSession → handleDisconnect → matchmaking 순서). */
function disconnect(socket) {
    socket.handlers.disconnect()
}

/** 방 하나로 GameSession을 시작하고 참가자 소켓에 canonical gameId를 결합한다(matchmaking 대역). */
function startGameSession(roomId, participants) {
    const room = {
        id: roomId,
        players: new Map(
            participants.map(({ uuid }) => [uuid, { uuid, nickname: uuid, isReady: true }]),
        ),
        settings: { jokerCount: 0 },
    }
    const prepared = gameSessionCore.prepareGameSession(room)
    assert.equal(prepared.ok, true)
    gameSessionCore.commitGameSession(prepared.session)
    for (const { socket } of participants) socket.data.activeGameId = prepared.session.id
    return prepared.session
}

// ---------------------------------------------------------------------------
// AC-01 — 같은 계정의 다중 소켓/탭은 고유 카운터를 1만 움직인다
// ---------------------------------------------------------------------------

test('AC-01 같은 계정이 두 소켓으로 연결돼도 고유 카운터는 1만 증가하고, 모두 해제될 때 1만 감소한다', (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const io = createFakeIo()
    const first = createFakeSocket(io, 'socket-tab-1', 'user-a')
    connect(io, first)

    assert.equal(concurrentUsers.getConcurrentState().total, 1)
    assert.equal(socketModule.__getOnlineUsersForTests().size, 1)

    // 같은 계정의 두 번째 탭. handleConnection이 registry를 새 소켓으로 갱신하고 이전 소켓을
    // 강제 종료(forcedLogout)한다 — 그 강제 종료된 소켓의 지연 disconnect까지 재현한다.
    const second = createFakeSocket(io, 'socket-tab-2', 'user-a')
    connect(io, second)

    assert.equal(concurrentUsers.getConcurrentState().total, 1, '두 번째 탭은 고유 카운터를 늘리지 않는다')
    assert.equal(first.data.forcedLogout, true)

    disconnect(first)
    assert.equal(
        concurrentUsers.getConcurrentState().total,
        1,
        '강제 종료된 이전 소켓의 disconnect는 살아있는 새 소켓의 카운트를 지우지 않는다',
    )
    assert.equal(socketModule.__getOnlineUsersForTests().size, 1)

    disconnect(second)
    assert.equal(concurrentUsers.getConcurrentState().total, 0, '마지막 소켓이 해제될 때 1만 감소한다')
    assert.equal(socketModule.__getOnlineUsersForTests().size, 0, '카운터와 registry가 어긋나지 않는다')
})

test('AC-01 서로 다른 계정은 각각 고유 카운터를 1씩 움직인다', (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-a', 'user-a')
    const b = createFakeSocket(io, 'socket-b', 'user-b')

    connect(io, a)
    connect(io, b)
    assert.equal(concurrentUsers.getConcurrentState().total, 2)
    assert.deepEqual(concurrentUsers.__getConnectedUuidsForTests(), new Set(['user-a', 'user-b']))

    disconnect(a)
    assert.equal(concurrentUsers.getConcurrentState().total, 1)
    disconnect(b)
    assert.equal(concurrentUsers.getConcurrentState().total, 0)
})

// ---------------------------------------------------------------------------
// AC-04 — 재시작 직후 0에서 시작하고 유령 데이터가 없다
// ---------------------------------------------------------------------------

test('AC-04 재시작 직후 모든 접속자 카운터는 0이고 이전 상태의 유령이 남지 않는다', (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-ghost-a', 'ghost-a')
    const b = createFakeSocket(io, 'socket-ghost-b', 'ghost-b')
    connect(io, a)
    connect(io, b)
    startGameSession('room-ghost', [{ uuid: 'ghost-a', socket: a }, { uuid: 'ghost-b', socket: b }])
    assert.notEqual(concurrentUsers.getConcurrentState().total, 0)

    // 프로세스 재시작 — 인메모리 상태가 통째로 사라지는 것을 재현한다(어떤 저장소에서도
    // 복원하지 않는다는 것이 이 카운터의 계약이다).
    resetAll()

    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 0, lobby: 0, in_game: 0, room_count: 0 })
    assert.equal(socketModule.__getOnlineUsersForTests().size, 0)
    assert.equal(concurrentUsers.__getConnectedUuidsForTests().size, 0)
})

test('AC-04 카운터 모듈은 스냅샷 저장소를 읽지 않는다(부팅 시 복원 경로가 없다)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'service', 'concurrentUsers.service.js'), 'utf8')
    assert.equal(/require\([^)]*concurrentSnapshot/.test(source), false)
    assert.equal(/require\([^)]*models/.test(source), false)
    assert.equal(/require\([^)]*repositories/.test(source), false)
})

// ---------------------------------------------------------------------------
// AC-06 — 전이마다 total = lobby + in_game, in_game/room_count가 실제와 일치
// ---------------------------------------------------------------------------

test('AC-06 연결·게임 시작·게임 종료·해제 전이마다 total = lobby + in_game 불변식이 유지된다', (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const seen = []
    const observe = (label) => {
        const state = concurrentUsers.getConcurrentState()
        assert.equal(state.total, state.lobby + state.in_game, `${label}: total = lobby + in_game`)
        seen.push([label, state])
        return state
    }

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-inv-a', 'inv-a')
    const b = createFakeSocket(io, 'socket-inv-b', 'inv-b')

    assert.deepEqual(observe('시작 전'), { total: 0, lobby: 0, in_game: 0, room_count: 0 })

    connect(io, a)
    assert.deepEqual(observe('A 연결'), { total: 1, lobby: 1, in_game: 0, room_count: 0 })

    connect(io, b)
    assert.deepEqual(observe('B 연결'), { total: 2, lobby: 2, in_game: 0, room_count: 0 })

    const session = startGameSession('room-inv', [{ uuid: 'inv-a', socket: a }, { uuid: 'inv-b', socket: b }])
    assert.deepEqual(observe('게임 시작'), { total: 2, lobby: 0, in_game: 2, room_count: 1 })

    // 명시적 이탈(leave_game_session) — finalizeGameSessionEnd 한 곳으로 수렴하는 종료 경로다.
    let ack = null
    gameSessionSocketLayer.__testables.handleLeaveGameSession(io, a, 'inv-a', { gameId: session.id }, (res) => {
        ack = res
    })
    assert.equal(ack.ok, true)
    assert.deepEqual(observe('게임 종료'), { total: 2, lobby: 2, in_game: 0, room_count: 0 })

    disconnect(a)
    assert.deepEqual(observe('A 해제'), { total: 1, lobby: 1, in_game: 0, room_count: 0 })

    disconnect(b)
    assert.deepEqual(observe('B 해제'), { total: 0, lobby: 0, in_game: 0, room_count: 0 })

    assert.equal(seen.length, 7)
})

test('AC-06 게임 중 끊긴 참가자는 total에서 빠지지만 그 세션은 room_count에 남는다', (t) => {
    resetAll()
    stubDbSideEffects(t)
    t.after(resetAll)

    const io = createFakeIo()
    const a = createFakeSocket(io, 'socket-grace-a', 'grace-a')
    const b = createFakeSocket(io, 'socket-grace-b', 'grace-b')
    connect(io, a)
    connect(io, b)
    const session = startGameSession('room-grace', [{ uuid: 'grace-a', socket: a }, { uuid: 'grace-b', socket: b }])

    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 2, lobby: 0, in_game: 2, room_count: 1 })

    // A만 끊긴다 — 세션은 종료되지 않고 재접속 유예만 걸린다.
    disconnect(a)
    assert.notEqual(gameSessionSocketLayer.__testables.getDisconnectGraceRun(session.id, 'grace-a'), undefined)
    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 1, lobby: 0, in_game: 1, room_count: 1 })

    // 남은 참가자까지 끊겨 접속자가 0이 돼도 세션 자체는 아직 살아 있다(유예 중).
    disconnect(b)
    assert.deepEqual(concurrentUsers.getConcurrentState(), { total: 0, lobby: 0, in_game: 0, room_count: 1 })
})

// ---------------------------------------------------------------------------
// AC-05 — 내부 조회 함수만 제공하고 HTTP·소켓으로는 노출하지 않는다
// ---------------------------------------------------------------------------

test('AC-05 getConcurrentState는 내부 함수로만 제공되고 HTTP·소켓 경로에 연결되지 않는다', () => {
    assert.equal(typeof concurrentUsers.getConcurrentState, 'function')
    assert.deepEqual(Object.keys(concurrentUsers.getConcurrentState()).sort(), [
        'in_game',
        'lobby',
        'room_count',
        'total',
    ])

    // 소켓 계층은 카운터를 갱신하기만 하고 조회 결과를 클라이언트로 내보내지 않는다.
    assert.equal(socketModule.getConcurrentState, undefined)
    assert.equal(gameSessionSocketLayer.getConcurrentState, undefined)

    const backendDir = path.join(__dirname, '..')
    const collectJsFiles = (dir) => {
        if (!fs.existsSync(dir)) return []
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) return collectJsFiles(full)
            return entry.name.endsWith('.js') ? [full] : []
        })
    }

    // HTTP 노출 금지 — 라우트·컨트롤러 어디에서도 이 서비스를 참조하지 않는다.
    for (const file of [
        ...collectJsFiles(path.join(backendDir, 'routes')),
        ...collectJsFiles(path.join(backendDir, 'controller')),
    ]) {
        const source = fs.readFileSync(file, 'utf8')
        assert.equal(source.includes('concurrentUsers'), false, `${file}이 동시 접속 서비스를 참조한다`)
        assert.equal(source.includes('getConcurrentState'), false, `${file}이 동시 접속 상태를 노출한다`)
    }

    // broadcast 금지 — 소켓 모듈들은 조회 함수 자체를 부르지 않는다(갱신 API만 쓴다).
    for (const file of collectJsFiles(path.join(backendDir, 'socket'))) {
        if (file.includes('__tests__')) continue
        const source = fs.readFileSync(file, 'utf8')
        assert.equal(source.includes('getConcurrentState'), false, `${file}이 동시 접속 상태를 조회한다`)
    }
})

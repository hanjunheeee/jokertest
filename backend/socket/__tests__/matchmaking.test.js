const test = require('node:test')
const assert = require('node:assert/strict')

// userRepository는 실제 DB(Sequelize)에 접근하고, require 시점에 backend/models(DATABASE_URL
// 필요)까지 함께 불러온다. node:test의 mock.module()로 가로채는 방법을 먼저 시도했으나
// --experimental-test-module-mocks 플래그를 켜도 원본 모듈이 그대로 로드되며 Sequelize
// 초기화가 실패해(직접 실행해 확인) 이 프로젝트 구조에서는 쓸 수 없었다. 대신 matchmaking.js가
// 제공하는 __setUserRepositoryForTests로 내부 참조만 교체하는 의존성 주입 방식을 쓴다.
let fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })

const matchmaking = require('../matchmaking')
matchmaking.__setUserRepositoryForTests({
    findByUuid: (...args) => fakeFindByUuid(...args),
})
const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleJoinMatchmaking,
    leaveSocketRoomSafely,
} = matchmaking.__testables

function deferred() {
    let resolve
    const promise = new Promise((res) => { resolve = res })
    return { promise, resolve }
}

/** callback을 받는 핸들러를 Promise로 감싼다(ack 콜백을 test에서 await하기 위함). */
function callAsPromise(handler, ...args) {
    return new Promise((resolve) => handler(...args, resolve))
}

/**
 * 실제 socket.io 서버 없이 emit/join/leave/to/connected만 흉내내는 최소 fake Socket.
 * joinGate를 넘기면 join()이 그 Promise가 풀릴 때까지 대기한다 — join 대기 중 다른 요청이
 * 상태를 바꾸는 레이스(정원 경쟁, 방 삭제/교체, disconnect 등)를 결정적으로 재현하기 위함이다.
 */
function createFakeSocket(uuid, { id = `sock-${uuid}`, joinShouldReject = false, joinGate = null } = {}) {
    const socket = {
        id,
        data: { user: { uuid } },
        emitted: [],
        joined: [],
        left: [],
        // 프로퍼티로 두어 테스트 중간에 socket.joinShouldReject = false / socket.connected = false
        // 처럼 값을 바꿀 수 있게 한다(클로저로 캡처하면 나중에 바꿔도 반영되지 않음).
        joinShouldReject,
        connected: true,
        async join(roomId) {
            if (joinGate) await joinGate
            if (socket.joinShouldReject) throw new Error('join 실패(테스트 주입)')
            socket.joined.push(roomId)
        },
        async leave(roomId) {
            socket.left.push(roomId)
        },
        emit(event, payload) {
            socket.emitted.push({ event, payload })
        },
        to(roomId) {
            return {
                emit(event, payload) {
                    socket.emitted.push({ event, payload, broadcastTo: roomId })
                },
            }
        },
    }
    return socket
}

function createFakeIo(sockets = []) {
    const socketMap = new Map(sockets.map((s) => [s.id, s]))
    const broadcasts = []
    return {
        sockets: { sockets: socketMap },
        broadcasts,
        to(roomId) {
            return {
                emit(event, payload) {
                    broadcasts.push({ roomId, event, payload })
                },
            }
        },
    }
}

function validSettingsPayload(overrides = {}) {
    return {
        accessType: 'open',
        maxPlayers: 8,
        jokerCount: 2,
        lightsOut: false,
        soulBetting: false,
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        voteReveal: true,
        ...overrides,
    }
}

test.beforeEach(() => {
    matchmaking.__resetStateForTests()
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
})

// ── create_room ──────────────────────────────────────────────────────────

test('create_room: 인증 uuid가 host/player로 쓰이고 payload의 uuid/hostUuid는 무시된다', async () => {
    const socket = createFakeSocket('uuid-A')
    const io = createFakeIo([socket])

    const res = await callAsPromise(
        handleCreateRoom, io, socket, 'uuid-A',
        validSettingsPayload({ uuid: 'attacker', hostUuid: 'attacker' })
    )

    assert.equal(res.ok, true)
    assert.equal(res.room.hostUuid, 'uuid-A')
    assert.deepEqual(res.room.players.map((p) => p.uuid), ['uuid-A'])

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
    assert.equal(snapshot.playerRoom[0][0], 'uuid-A')
})

test('create_room: 정상 생성 시 Socket room 가입과 Map 반영이 이루어지고, ack에 내부 필드가 없다', async () => {
    const socket = createFakeSocket('uuid-B')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-B', validSettingsPayload())

    assert.equal(res.ok, true)
    assert.deepEqual(Object.keys(res.room).sort(), ['hostUuid', 'players', 'roomCode', 'roomId'])
    assert.equal(socket.joined.length, 1)
    assert.equal(socket.joined[0], res.room.roomId)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.title, 'user-uuid-B의 방')
    assert.equal(room.accessType, 'open')
    assert.equal(room.settings.maxPlayers, 8)
})

test('create_room: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', () => {
    const before = matchmaking.__getStateSnapshotForTests()
    const socket = createFakeSocket('uuid-C')
    const io = createFakeIo([socket])

    handleCreateRoom(io, socket, 'uuid-C', validSettingsPayload(), undefined)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('create_room: 동일 사용자의 빠른 더블클릭/동시 요청에서 방이 하나만 생성된다', async () => {
    const socket = createFakeSocket('uuid-D')
    const io = createFakeIo([socket])
    const payload = validSettingsPayload()

    const p1 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const p2 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const [r1, r2] = await Promise.all([p1, p2])

    const results = [r1, r2]
    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)
    assert.equal(successes.length, 1)
    assert.equal(failures.length, 1)
    assert.match(failures[0].message, /처리 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
})

test('create_room: 이미 방에 있는 사용자는 거부된다', async () => {
    const socket = createFakeSocket('uuid-E')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /이미 참여 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1) // 두 번째 시도로 방이 더 생기지 않음
})

test('create_room: 매칭 대기열에 남은 사용자는 자동 제거되지 않고 거부된다', async () => {
    matchmaking.__seedMatchmakingQueueForTests('uuid-F', { uuid: 'uuid-F', nickname: 'x', socketId: 'sock-F' })
    const socket = createFakeSocket('uuid-F')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-F', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /매칭 대기열/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 1) // 자동으로 큐에서 빠지지 않음(정책)
    assert.equal(snapshot.gameRooms.length, 0)
})

test('create_room: 사용자 조회가 null을 반환하면 실패 응답을 보낸다', async () => {
    fakeFindByUuid = async () => null
    const socket = createFakeSocket('uuid-G')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-G', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /사용자 정보/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0) // 예약 해제 확인
})

test('create_room: 사용자 조회가 예외를 던지면 예약이 해제되고 고정 오류 메시지를 응답한다', async () => {
    fakeFindByUuid = async () => { throw new Error('DB 커넥션 실패(내부 상세)') }
    const socket = createFakeSocket('uuid-H')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.equal(res.message, '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.')
    assert.ok(!res.message.includes('DB 커넥션')) // 내부 오류 상세가 노출되지 않음

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    // 예약이 실제로 풀렸는지 재시도로 재확인
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(retry.ok, true)
})

test('create_room: socket.join() 실패 시 gameRooms/playerRoom에 흔적이 남지 않고 재시도가 가능하다', async () => {
    const socket = createFakeSocket('uuid-I', { joinShouldReject: true })
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(res.ok, false)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    socket.joinShouldReject = false
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(retry.ok, true)
})

// ── join_room_by_code ───────────────────────────────────────────────────

test('join_room_by_code: 빈 코드/존재하지 않는 방을 거부한다', async () => {
    const socket = createFakeSocket('uuid-J')
    const io = createFakeIo([socket])

    await handleJoinRoomByCode(io, socket, 'uuid-J', '  ')
    assert.match(socket.emitted.at(-1).payload.message, /코드를 입력/)

    await handleJoinRoomByCode(io, socket, 'uuid-J', 'ZZZZZZ')
    assert.match(socket.emitted.at(-1).payload.message, /찾을 수 없습니다/)
})

test('join_room_by_code: 방별 maxPlayers를 적용해 4인 방의 5번째 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }))
    const { roomCode } = created.room

    for (const uuid of ['uuid-p1', 'uuid-p2', 'uuid-p3']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.players.length, 4) // host + 3명 = 정원 4 도달

    const fifthSocket = createFakeSocket('uuid-p4')
    io.sockets.sockets.set(fifthSocket.id, fifthSocket)
    await handleJoinRoomByCode(io, fifthSocket, 'uuid-p4', roomCode)
    assert.match(fifthSocket.emitted.at(-1).payload.message, /가득 찼습니다/)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.gameRooms[0][1].players.length, 4) // 5번째는 반영되지 않음
})

test('join_room_by_code: settings가 없는 구버전(랜덤 매칭) 방은 기존 매칭 정원으로 fallback한다', async () => {
    // 랜덤 매칭이 만들던 형태를 그대로 재현(settings 없음)
    matchmaking.__seedRoomForTests({
        id: 'legacy-room',
        code: 'LEGACY1',
        hostUuid: 'uuid-legacy-host',
        players: new Map([['uuid-legacy-host', { uuid: 'uuid-legacy-host', nickname: 'host' }]]),
    })

    const socket = createFakeSocket('uuid-legacy-join')
    const io = createFakeIo([socket])
    await handleJoinRoomByCode(io, socket, 'uuid-legacy-join', 'LEGACY1')

    assert.ok(socket.emitted.some((e) => e.event === 'room_joined'))
})

test('join_room_by_code: 동일 사용자의 join+join 동시 요청 중 하나만 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-host2')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host2', validSettingsPayload())
    const { roomCode } = created.room

    const joiner = createFakeSocket('uuid-joiner')
    io.sockets.sockets.set(joiner.id, joiner)

    await Promise.all([
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
    ])

    const joinedEvents = joiner.emitted.filter((e) => e.event === 'room_joined')
    assert.equal(joinedEvents.length, 1)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 2) // host + joiner, 중복 커밋 없음
})

test('create_room과 join_room_by_code를 같은 사용자로 교차 실행해도 한 방에만 소속된다', async () => {
    // 지연 가능한 fake repository로 두 작업의 await 구간을 겹치게 만든다.
    const gate = deferred()
    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const hostSocket = createFakeSocket('uuid-host3')
    const io = createFakeIo([hostSocket])
    // 정원 확보를 위해 먼저 방을 하나 만들어둔다(다른 host로, 지연 없이).
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const preCreated = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host3', validSettingsPayload())
    const { roomCode } = preCreated.room

    // 이제부터 지연 걸기
    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const uuid = 'uuid-cross'
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)

    const createPromise = callAsPromise(handleCreateRoom, io, socket, uuid, validSettingsPayload())
    const joinPromise = handleJoinRoomByCode(io, socket, uuid, roomCode)

    gate.resolve() // 두 요청 모두 동시에 조회를 마치게 함
    const createResult = await createPromise
    await joinPromise

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const roomsContainingUuid = snapshot.gameRooms.filter(([, room]) => room.players.some(([pUuid]) => pUuid === uuid))
    assert.equal(roomsContainingUuid.length, 1) // 정확히 한 방에만 소속

    // pendingRoomTransitions 공유 잠금 덕분에 둘 중 하나만 실제로 반영됐어야 한다.
    if (createResult.ok) {
        assert.equal(roomsContainingUuid[0][0], createResult.room.roomId)
    }
})

// ── get_current_room ────────────────────────────────────────────────────

test('get_current_room: 참가 중인 방이 없으면 room:null을 반환한다', async () => {
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-none')
    assert.deepEqual(res, { ok: true, room: null })
})

test('get_current_room: 실제 참가자면 방 정보를 반환한다', async () => {
    const socket = createFakeSocket('uuid-K')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-K', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-K')
    assert.equal(res.ok, true)
    assert.equal(res.room.roomId, created.room.roomId)
})

test('get_current_room: 생성이 아직 처리 중이면 pending:true를 반환한다', async () => {
    const gate = deferred()
    fakeFindByUuid = () => gate.promise

    const socket = createFakeSocket('uuid-pending')
    const io = createFakeIo([socket])

    // await하지 않고 호출해 "처리 중" 상태를 만든다(콜백은 나중에 확인).
    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-pending', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-pending')
    assert.deepEqual(res, { ok: true, room: null, pending: true })

    gate.resolve({ nickname: 'x' })
    await createPromise
})

test('get_current_room: playerRoom만 있고 실제 room.players에 없는 stale 매핑은 정리되고 null을 반환한다', async () => {
    matchmaking.__seedPlayerRoomForTests('uuid-stale', 'room-없음')
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-stale')
    assert.deepEqual(res, { ok: true, room: null })

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.length, 0) // 정리됨
})

test('get_current_room: callback이 없는 요청은 상태를 바꾸지 않는다', () => {
    matchmaking.__seedPlayerRoomForTests('uuid-L', 'room-없음')
    const before = matchmaking.__getStateSnapshotForTests()
    handleGetCurrentRoom('uuid-L', undefined)
    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before) // stale 매핑 정리조차 일어나지 않음(부수효과 없음)
})

// ── 랜덤 매칭 비활성화 ────────────────────────────────────────────────────

test('join_matchmaking: 큐에 등록되지 않고 matchmaking_disabled를 응답한다', async () => {
    const socket = createFakeSocket('uuid-M')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'uuid-M')

    assert.equal(socket.emitted.length, 1)
    assert.equal(socket.emitted[0].event, 'matchmaking_disabled')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 0)
})

// ── 연결 종료 cleanup(기존 로직 재검증) ───────────────────────────────────

test('onDisconnect: 방장 혼자 있는 방에서 종료하면 방과 매핑이 삭제된다', async () => {
    const socket = createFakeSocket('uuid-solo')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-solo', validSettingsPayload())

    matchmaking.onDisconnect(io, 'uuid-solo')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect: 참가자가 있는 상태에서 방장이 종료하면 host_changed와 player_left_room이 발생한다', async () => {
    const hostSocket = createFakeSocket('uuid-host4')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host4', validSettingsPayload())

    const joiner = createFakeSocket('uuid-joiner2')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-joiner2', created.room.roomCode)

    matchmaking.onDisconnect(io, 'uuid-host4')

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    const playerLeft = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-joiner2')
    assert.ok(playerLeft)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms[0][1].hostUuid, 'uuid-joiner2')
})

// ── P0: 생성 도중 연결 종료 ──────────────────────────────────────────────

test('create_room: 사용자 조회를 기다리는 동안 연결이 끊기면 방이 커밋되지 않는다', async () => {
    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const socket = createFakeSocket('uuid-disc')
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc', validSettingsPayload())

    // 조회 대기 중 연결이 끊긴 상황을 흉내낸다. 이 시점에 실제 onDisconnect가 실행돼도
    // playerRoom에는 아직 아무것도 없어 정리할 게 없다고 판단하고 지나간다.
    socket.connected = false
    matchmaking.onDisconnect(io, 'uuid-disc')

    gate.resolve({ nickname: 'x' }) // 조회가 뒤늦게 돌아옴
    const res = await createPromise

    assert.equal(res.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0) // 재시도 가능한 상태로 남아야 함
})

test('create_room: socket.join 대기 중 연결이 끊기면 Socket room을 정리하고 Map에 흔적을 남기지 않는다', async () => {
    const gate = deferred()
    const socket = createFakeSocket('uuid-disc2', { joinGate: gate.promise })
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc2', validSettingsPayload())

    // 사용자 조회(gate가 걸리지 않은 기본 fakeFindByUuid)가 끝나 "조회 후" 연결 확인을 통과하고
    // socket.join(joinGate)에서 막 대기를 시작한 시점까지 한 tick 양보한 뒤에 연결을 끊는다.
    // 여기서 바로 connected=false를 주면 "조회 후" 체크에서 먼저 걸려 join 자체가
    // 호출되지 않으므로, join 이후 체크를 검증하려면 이 순서가 필요하다.
    await Promise.resolve()
    socket.connected = false
    gate.resolve()
    const res = await createPromise

    assert.equal(res.ok, false)
    assert.equal(socket.left.length, 1) // join 이후 connected 재확인에서 걸려 leave됨
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('create_room: 성공 후 store 반영을 가정하는 room 객체는 재사용 가능한 형태를 유지한다(성공 콜백은 Map 커밋 이후에만 호출)', async () => {
    const socket = createFakeSocket('uuid-cb')
    const io = createFakeIo([socket])
    let callbackCallCount = 0
    const wrappedCallback = (res) => { callbackCallCount += 1; return res }

    const result = await new Promise((resolve) => {
        handleCreateRoom(io, socket, 'uuid-cb', validSettingsPayload(), (res) => {
            wrappedCallback(res)
            resolve(res)
        })
    })

    assert.equal(result.ok, true)
    assert.equal(callbackCallCount, 1) // 정상 경로에서 콜백이 정확히 한 번만 호출됨
})

// ── P1: 코드 참가 - 예상 못한 예외에서도 Socket room을 정리한다 ────────────

test('join_room_by_code: socket.join() 실패 시 방 상태가 변하지 않고 실패 응답을 보낸다', async () => {
    const hostSocket = createFakeSocket('uuid-jjhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-jjhost', validSettingsPayload())

    const joiner = createFakeSocket('uuid-jjoin', { joinShouldReject: true })
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-jjoin', created.room.roomCode)

    assert.match(joiner.emitted.at(-1).payload.message, /참여하지 못했습니다/)
    const after = matchmaking.__getStateSnapshotForTests()
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 1) // 새 참가자는 반영되지 않음
    assert.equal(after.pendingRoomTransitions.length, 0)
})

test('join_room_by_code: join 이후 커밋 전 예상 못한 예외가 나면 Socket room에서도 나간다', async () => {
    const io = createFakeIo([])
    const roomId = 'room-exc'
    const roomCode = 'EXC123'
    // settings 접근 자체가 예외를 던지도록 만들어, "join은 성공했지만 정원 검사(커밋 전) 단계에서
    // 예상 못한 예외가 발생하는" 상황을 흉내낸다.
    const brokenSettings = new Proxy({}, {
        get() { throw new Error('설정 조회 실패(테스트 주입)') },
    })
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-exchost',
        players: new Map([['uuid-exchost', { uuid: 'uuid-exchost', nickname: 'host' }]]),
        settings: brokenSettings,
    })

    const joiner = createFakeSocket('uuid-excjoin')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-excjoin', roomCode)

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /참여하지 못했습니다/)
    assert.equal(joiner.left.length, 1) // join 후 커밋 전 예외 → Socket room에서 정리됨
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 1) // 새 참가자는 반영되지 않음
})

// ── P1: 정원 레이스 — 실제 동시 참가 시나리오 ───────────────────────────────

test('join_room_by_code: 마지막 한 자리에 서로 다른 두 사용자가 동시 참가해도 정원을 넘기지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-lasthost')
    const io = createFakeIo([hostSocket])
    // maxPlayers는 검증기가 UI와 동일하게 4~10만 허용하므로 정원 4로 만들고 2명을 먼저
    // 채워 남은 자리를 1개로 좁힌다(host + pre1 + pre2 = 3명, 정원 4).
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-lasthost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre1', 'uuid-pre2']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const gateA = deferred()
    const gateB = deferred()
    const socketA = createFakeSocket('uuid-raceA', { joinGate: gateA.promise })
    const socketB = createFakeSocket('uuid-raceB', { joinGate: gateB.promise })
    io.sockets.sockets.set(socketA.id, socketA)
    io.sockets.sockets.set(socketB.id, socketB)

    const joinA = handleJoinRoomByCode(io, socketA, 'uuid-raceA', roomCode)
    const joinB = handleJoinRoomByCode(io, socketB, 'uuid-raceB', roomCode)

    // 둘 다 socket.join 대기 상태에 들어간 뒤 동시에 풀어준다.
    gateA.resolve()
    gateB.resolve()
    await Promise.all([joinA, joinB])

    const succeeded = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_joined'))
    const failed = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_join_failed'))
    assert.equal(succeeded.length, 1)
    assert.equal(failed.length, 1)
    assert.match(failed[0].emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4) // 정원 초과 없음
})

test('join_room_by_code: join 대기 중 다른 참가자가 먼저 마지막 자리를 채우면 정원 초과로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-fillhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-fillhost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre3', 'uuid-pre4']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }
    // host + pre3 + pre4 = 3명, 남은 자리 1개

    const gate = deferred()
    const laggingJoiner = createFakeSocket('uuid-lag', { joinGate: gate.promise })
    io.sockets.sockets.set(laggingJoiner.id, laggingJoiner)
    const joinPromise = handleJoinRoomByCode(io, laggingJoiner, 'uuid-lag', roomCode)

    // laggingJoiner가 socket.join 대기 중인 사이 다른 사용자가 먼저 마지막 자리를 채운다.
    const fastJoiner = createFakeSocket('uuid-fast')
    io.sockets.sockets.set(fastJoiner.id, fastJoiner)
    await handleJoinRoomByCode(io, fastJoiner, 'uuid-fast', roomCode)

    gate.resolve()
    await joinPromise

    assert.match(laggingJoiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4)
    assert.equal(laggingJoiner.left.length, 1) // join은 됐지만 정원 초과로 leave까지 마쳐야 함
})

test('join_room_by_code: join 대기 중 방이 삭제되면 참가를 거부하고 Socket room에서 나간다', async () => {
    const hostSocket = createFakeSocket('uuid-delhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-delhost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-deljoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-deljoin', roomCode)

    // handleJoinRoomByCode가 사용자 조회를 마치고 방을 code로 찾은 뒤 socket.join(joinGate)
    // 대기에 들어갈 때까지 한 tick 양보한다. 여기서 바로 방을 지우면 아직 방 조회 자체가
    // 실행되기 전이라 "방 삭제 후 join" 상황이 아니라 "애초에 없던 방" 상황이 돼버린다.
    await Promise.resolve()
    // join이 대기하는 동안 방장이 방을 삭제한 상황을 흉내낸다.
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
})

test('join_room_by_code: join 대기 중 같은 id의 다른 Room 객체로 교체되면 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-swaphost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-swaphost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-swapjoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-swapjoin', roomCode)

    // 방 조회가 끝나고 socket.join(joinGate) 대기에 들어갈 때까지 한 tick 양보한다(위와 동일한 이유).
    await Promise.resolve()
    // join이 대기하는 동안 같은 roomId를 가진 "다른" 객체로 바꿔치기한다(참조 동등성 깨짐).
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-swaphost',
        players: new Map([['uuid-swaphost', { uuid: 'uuid-swaphost', nickname: 'host' }]]),
        settings: validSettingsPayload(),
    })
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
})

// ── leaveSocketRoomSafely: leave의 다양한 반환/예외 형태를 모두 흡수한다 ────

test('leaveSocketRoomSafely: leave가 undefined/resolved Promise/동기 예외/reject 무엇을 반환해도 예외를 던지지 않는다', async () => {
    const cases = [
        () => undefined,
        () => Promise.resolve(),
        () => { throw new Error('동기 예외') },
        () => Promise.reject(new Error('비동기 reject')),
    ]
    for (const leave of cases) {
        const fakeSocket = { leave }
        await assert.doesNotReject(() => leaveSocketRoomSafely(fakeSocket, 'room-x', '[테스트]'))
    }
})

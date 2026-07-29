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
// game-core/gameSession.js는 matchmaking.js와 별도 모듈이라 자체 registry(gameSessions/
// playerSession/roomGameSession)를 갖는다 — matchmaking.__resetStateForTests()로는 초기화되지
// 않으므로 이 파일의 beforeEach에서 별도로 초기화한다(테스트 간 상태 누수 방지).
const gameSession = require('../../game-core/gameSession')
const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleGetPublicRooms,
    handleJoinPublicRoom,
    handleJoinMatchmaking,
    handleStartGame,
    handleSetReady,
    leaveSocketRoomSafely,
} = matchmaking.__testables

function deferred() {
    let resolve
    const promise = new Promise((res) => { resolve = res })
    return { promise, resolve }
}

// createFakeSocket/createFakeIo/callAsPromise/validSettingsPayload/countingCallback/
// setupReadyRoomForStart는 backend/socket/__tests__/gameSession.test.js도 실제
// handleStartGame 등을 구동하는 통합 테스트에서 그대로 재사용해야 해서 공유 fixture
// 파일로 추출했다(동작 변경 없음 — 순수 이동).
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    countingCallback,
    setupReadyRoomForStart,
} = require('./testHelpers/matchmakingFixtures')

test.beforeEach(() => {
    matchmaking.__resetStateForTests()
    gameSession.__resetStateForTests()
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
    assert.deepEqual(Object.keys(res.room).sort(), ['canStart', 'hostUuid', 'players', 'roomCode', 'roomId'])
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

    matchmaking.onDisconnect(io, socket, 'uuid-solo')

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

    matchmaking.onDisconnect(io, hostSocket, 'uuid-host4')

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    const playerLeft = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-joiner2')
    assert.ok(playerLeft)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms[0][1].hostUuid, 'uuid-joiner2')
})

// ── onDisconnect ABA 방지 (socket.data.activeRoomId 결합) ───────────────────

test('onDisconnect(ABA): 방을 삭제하고 다른 Socket으로 새 Room을 만든 뒤 도착한 오래된 Socket의 지연 disconnect는 새 Room을 건드리지 않는다', async () => {
    const uuid = 'aba-mm-uuid'
    const staleSocket = createFakeSocket(uuid)
    const io = createFakeIo([staleSocket])
    await callAsPromise(handleCreateRoom, io, staleSocket, uuid, validSettingsPayload())

    const { handleDeleteRoom } = matchmaking.__testables
    handleDeleteRoom(io, uuid) // Room A 삭제 → playerRoom에서 uuid 제거됨

    const freshSocket = createFakeSocket(uuid, { id: 'sock-aba-mm-uuid-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    const createdB = await callAsPromise(handleCreateRoom, io, freshSocket, uuid, validSettingsPayload())
    assert.equal(createdB.ok, true)

    io.broadcasts.length = 0
    // 오래된 staleSocket의 지연 disconnect가 뒤늦게 도착한다 — activeRoomId는 여전히
    // Room A를 가리키므로(생성 시점에 결합된 값), 현재 playerRoom(Room B)과 달라 무시된다.
    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.ok(snapshot.gameRooms.some(([id]) => id === createdB.room.roomId), 'Room B가 그대로 남아있어야 한다')
    assert.equal(snapshot.playerRoom.some(([u, roomId]) => u === uuid && roomId === createdB.room.roomId), true)
    assert.equal(io.broadcasts.some((b) => b.event === 'player_left_room' || b.event === 'host_changed'), false)
})

test('onDisconnect(ABA): activeRoomId 결합이 없는 레거시 Socket의 disconnect는 기존처럼 현재 Room을 무조건 정리한다', async () => {
    const uuid = 'legacy-mm-uuid'
    matchmaking.__seedRoomForTests({
        id: 'legacy-room-aba',
        code: 'LEGACYABA',
        hostUuid: uuid,
        players: new Map([[uuid, { uuid, nickname: 'x', isReady: false }]]),
    })
    matchmaking.__seedPlayerRoomForTests(uuid, 'legacy-room-aba')
    const socketWithoutBinding = createFakeSocket(uuid) // activeRoomId를 한 번도 심어주지 않은 소켓
    const io = createFakeIo([socketWithoutBinding])

    matchmaking.onDisconnect(io, socketWithoutBinding, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect(ABA): 오래된 Socket A의 지연 disconnect는 같은 uuid로 새로 큐에 등록된 Socket B의 항목을 지우지 않는다', async () => {
    const uuid = 'aba-queue-uuid'
    const staleSocket = createFakeSocket(uuid, { id: 'sock-aba-queue-old' })
    const io = createFakeIo([staleSocket])

    // Socket A가 큐에 등록한 상태를 흉내낸다.
    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: staleSocket.id })

    // 같은 uuid가 다른 Socket B로 새로 큐에 등록된 뒤(예: 재접속), A의 disconnect가 뒤늦게 도착한다.
    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: 'sock-aba-queue-new' })

    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, queued] = snapshot.matchmakingQueue.find(([u]) => u === uuid) ?? []
    assert.ok(queued, 'Socket B의 큐 항목이 남아있어야 한다')
    assert.equal(queued.socketId, 'sock-aba-queue-new')
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
    matchmaking.onDisconnect(io, socket, 'uuid-disc')

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

// ── 공개방 회귀 테스트: Room 교체 경쟁 조건 ─────────────────────────────────
// 이 테스트는 수정 전 코드에서 먼저 실행해 실패(버그 재현)를 확인한 뒤, 최소 수정을
// 적용하고 다시 실행해 통과를 확인하는 용도다. 결과는 최종 보고에 그대로 남긴다.

test('공개방 입장: 선택한 open 방(A)이 대기 중 삭제되고 같은 코드의 code 방(B)이 생기면 참가가 거부되고 B에 반영되지 않는다', async () => {
    const hostASocket = createFakeSocket('uuid-raceAhost')
    const io = createFakeIo([hostASocket])
    const createdA = await callAsPromise(handleCreateRoom, io, hostASocket, 'uuid-raceAhost', validSettingsPayload())
    const roomAId = createdA.room.roomId
    const roomACode = createdA.room.roomCode

    // 사용자 조회를 지연시켜, 그 사이 A 삭제 + B(같은 코드) 생성을 끼워 넣을 수 있게 한다.
    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const joinerSocket = createFakeSocket('uuid-racejoiner')
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    const joinPromise = handleJoinPublicRoom(io, joinerSocket, 'uuid-racejoiner', { roomId: roomAId })

    // handleJoinPublicRoom → handleJoinRoomByCode가 findByUuid 대기 지점까지 진행되도록 한 tick 양보한다.
    await Promise.resolve()

    // 대기 중 A를 지우고, 같은 roomCode를 가진 code 방 B를 새로 만든다.
    matchmaking.__removeRoomForTests(roomAId)
    matchmaking.__seedRoomForTests({
        id: 'room-B',
        code: roomACode,
        hostUuid: 'uuid-hostB',
        title: 'B',
        accessType: 'code',
        players: new Map([['uuid-hostB', { uuid: 'uuid-hostB', nickname: 'hostB' }]]),
        settings: {
            maxPlayers: 8, jokerCount: 2, lightsOut: false, soulBetting: false,
            dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, voteReveal: true,
        },
    })

    gate.resolve({ nickname: 'user-uuid-racejoiner' })
    await joinPromise

    // 요청은 실패해야 한다.
    const failedEvent = joinerSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.ok(failedEvent, '참가가 거부되어야 하는데 실패 이벤트가 없습니다')

    // B의 players/playerRoom에 참가자가 반영되면 안 된다.
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, roomB] = snapshot.gameRooms.find(([id]) => id === 'room-B')
    assert.ok(roomB)
    assert.equal(roomB.players.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)
    assert.equal(snapshot.playerRoom.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)

    // 사용자가 B의 Socket room에 최종적으로 남아있으면 안 된다.
    assert.equal(joinerSocket.currentRooms.has('room-B'), false)
})

// ── set_ready: 준비 상태 데이터 모델과 멱등 계약 ────────────────────────────

test('set_ready: 새로 생성/참가한 플레이어는 기본적으로 준비 안 됨 상태다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-host', validSettingsPayload())
    assert.equal(created.room.players[0].isReady, false)

    const joiner = createFakeSocket('uuid-ready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-joiner', created.room.roomCode)
    const joinedPayload = joiner.emitted.find((e) => e.event === 'room_joined').payload
    const joinerEntry = joinedPayload.players.find((p) => p.uuid === 'uuid-ready-joiner')
    assert.equal(joinerEntry.isReady, false)
})

test('set_ready: 동일한 목표 상태로 두 번 요청해도 결과가 같고 두 번째 요청은 방송하지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-idem')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-idem', validSettingsPayload())

    const res1 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', { isReady: true })
    assert.equal(res1.ok, true)
    assert.equal(res1.isReady, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)

    const res2 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', { isReady: true })
    assert.equal(res2.ok, true)
    assert.equal(res2.isReady, true)
    // 값이 이미 같으므로 두 번째 요청에서는 방송이 추가로 발생하지 않는다(멱등성).
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)
})

test('set_ready: isReady가 boolean이 아니면 상태 변경 없이 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badtype')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badtype', validSettingsPayload())

    for (const badValue of ['true', 1, null, undefined, {}, []]) {
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badtype', { isReady: badValue })
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badtype')
    assert.equal(player.isReady, false) // 잘못된 형식의 요청은 어느 것도 반영되지 않는다
})

test('set_ready: payload 자체가 null·문자열·배열이면 구조분해 예외 없이 명시적으로 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badpayload')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badpayload', validSettingsPayload())

    for (const badPayload of [null, 'not-an-object', ['isReady', true]]) {
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badpayload', badPayload)
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badpayload')
    assert.equal(player.isReady, false)
})

test('set_ready: payload에 다른 uuid를 넣어도 무시되고 요청자(인증된 uuid) 본인만 바뀐다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-self-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-self-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-ready-self-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-self-joiner', created.room.roomCode)

    // hostSocket으로 요청하면서 payload에는 joiner의 uuid를 흉내낸 값을 함께 보낸다.
    const res = await callAsPromise(
        handleSetReady, io, hostSocket, 'uuid-ready-self-host',
        { isReady: true, uuid: 'uuid-ready-self-joiner' },
    )
    assert.equal(res.ok, true)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    const [, hostPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-host')
    const [, joinerPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-joiner')
    assert.equal(hostPlayer.isReady, true) // 실제 인증된 요청자만 변경됨
    assert.equal(joinerPlayer.isReady, false) // payload의 uuid는 애초에 읽히지 않음
})

test('set_ready: 방에 참여하지 않은 사용자의 요청은 거부된다', async () => {
    const io = createFakeIo([])
    const socket = createFakeSocket('uuid-ready-outside')
    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-outside', { isReady: true })
    assert.equal(res.ok, false)
    assert.match(res.message, /참여 중인 방이 없습니다/)
})

test('set_ready: 방이 이미 삭제된 뒤 도착한 요청은 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-ready-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-deleted', { isReady: true })
    assert.equal(res.ok, false)
})

test('set_ready: callback이 없는 요청은 실제 Room·참가자가 있어도 isReady/canStart/Map 무엇도 바꾸지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-nocb')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    handleSetReady(io, socket, 'uuid-ready-nocb', { isReady: true }, undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-nocb')
    assert.equal(player.isReady, false) // 콜백이 없어 검증 이전 단계에서 그대로 반환되어야 한다
    assert.equal(created.room.canStart, false)
})

test('set_ready: 요청자는 ack만 받고, 같은 방의 다른 참가자는 player_ready_changed만 받는다(요청자 자신은 받지 않음)', async () => {
    // 공용 createFakeSocket의 socket.to(room).emit()은 broadcastTo 태그만 요청자 자신의
    // emitted 목록에 남기고 실제로 다른 fake socket에 전달하지 않는다(다른 테스트들은 그것으로
    // 충분했다). 이번엔 "다른 참가자가 실제로 수신하는지"를 검증해야 하므로, 이 테스트에서만
    // join된 다른 소켓에 실제로 전달하는 socket.to()로 국소적으로 교체한다.
    const registry = new Map()
    function makeDeliveringSocket(uuid) {
        const s = createFakeSocket(uuid)
        s.to = (roomId) => ({
            emit(event, payload) {
                for (const other of registry.values()) {
                    if (other === s) continue
                    if (other.currentRooms.has(roomId)) other.emitted.push({ event, payload })
                }
            },
        })
        registry.set(uuid, s)
        return s
    }

    const hostSocket = makeDeliveringSocket('uuid-ready-recv-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-recv-host', validSettingsPayload())

    const joiner = makeDeliveringSocket('uuid-ready-recv-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-recv-joiner', created.room.roomCode)

    hostSocket.emitted.length = 0 // room_joined 등 이전 이벤트는 이번 검증과 무관하므로 비운다
    joiner.emitted.length = 0

    const ack = await callAsPromise(handleSetReady, io, hostSocket, 'uuid-ready-recv-host', { isReady: true })
    assert.equal(ack.ok, true)

    // 요청자(host) 자신은 player_ready_changed를 받지 않는다 — ack로만 결과를 안다.
    assert.equal(hostSocket.emitted.some((e) => e.event === 'player_ready_changed'), false)

    // 같은 방의 다른 참가자(joiner)는 player_ready_changed를 실제로 받는다.
    const received = joiner.emitted.find((e) => e.event === 'player_ready_changed')
    assert.ok(received)
    assert.equal(received.payload.uuid, 'uuid-ready-recv-host')
    assert.equal(received.payload.isReady, true)
})

// ── canStart: 참가/퇴장/방장변경 시 즉시 재계산 ─────────────────────────────

// jokerCount는 최소 1만 허용되므로(ALLOWED_JOKER_COUNT), "비-광대 최소 1명"을 항상 만족하려면
// 아래 canStart 테스트들은 인원을 2명 이상으로 유지한다(1명뿐이면 players.length(1) <= jokerCount(1)
// 이 되어 준비 여부와 무관하게 항상 canStart가 false로 계산되기 때문).

test('canStart: 전원 준비된 방에 새 참가자가 들어오면(기본 미준비) canStart가 다시 false로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-a-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-a-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-a-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-a-joinerA', created.room.roomCode)

    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-a-host', { isReady: true })
    const joinerAReady = await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-a-joinerA', { isReady: true })
    assert.equal(joinerAReady.canStart, true) // host+joinerA 2명 모두 준비 완료 → 시작 가능

    const joinerB = createFakeSocket('uuid-canstart-a-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-a-joinerB', created.room.roomCode)

    const joinedBroadcast = joinerB.emitted.find((e) => e.event === 'player_joined_room')
    assert.equal(joinedBroadcast.payload.canStart, false) // 새 참가자는 기본 미준비라 다시 false
})

test('canStart: 미준비 참가자가 나가면 canStart가 다시 true로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-b-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-b-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-b-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-b-joinerA', created.room.roomCode)
    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-b-host', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-b-joinerA', { isReady: true })
    // 여기까지 host+joinerA 모두 준비 완료 → canStart는 true인 상태다.

    const joinerB = createFakeSocket('uuid-canstart-b-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-b-joinerB', created.room.roomCode)
    // joinerB는 미준비 상태로 참가해 canStart를 다시 false로 만든다.

    matchmaking.onDisconnect(io, joinerB, 'uuid-canstart-b-joinerB')

    const leftBroadcast = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(leftBroadcast)
    assert.equal(leftBroadcast.payload.canStart, true) // 미준비였던 joinerB가 나가 다시 host+joinerA만 남음
})

test('canStart: 방장이 종료로 바뀌어도 남은 참가자의 준비 상태는 유지되고 canStart가 새 구성 기준으로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-c-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-c-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-c-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-c-joinerA', created.room.roomCode)
    const joinerB = createFakeSocket('uuid-canstart-c-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-c-joinerB', created.room.roomCode)

    // 곧 새 방장이 될 joinerA와 나머지 joinerB를 준비 완료 상태로 만든다.
    // 곧 사라질 host는 미준비 상태로 둔다(방장 변경과 준비 상태가 무관함을 함께 확인).
    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-c-joinerA', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerB, 'uuid-canstart-c-joinerB', { isReady: true })

    matchmaking.onDisconnect(io, hostSocket, 'uuid-canstart-c-host') // 방장 종료 → joinerA가 새 방장

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-canstart-c-joinerA')
    assert.equal(hostChanged.payload.canStart, true) // 남은 joinerA+joinerB 모두 준비 완료 상태 그대로 유지되어 충족

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, joinerAPlayer] = room.players.find(([uuid]) => uuid === 'uuid-canstart-c-joinerA')
    assert.equal(joinerAPlayer.isReady, true) // 방장 변경으로 준비 상태가 초기화되지 않는다
})

// ── start_game: 게임 시작 가드(ack 계약, 성공 처리는 다음 슬라이스) ────────

test('start_game: 참여 중인 방이 없으면 ROOM_NOT_FOUND로 ack가 정확히 한 번 온다', async () => {
    const socket = createFakeSocket('uuid-start-noroom')
    const io = createFakeIo([socket])
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()

    await handleStartGame(io, socket, 'uuid-start-noroom', callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방이 이미 삭제된 상태에서의 요청은 ROOM_NOT_FOUND로 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-start-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-start-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, socket, 'uuid-start-deleted')
    assert.equal(res.ok, false)
    assert.equal(res.code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방장이 아닌 사용자의 요청은 NOT_HOST로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-start-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-joiner', created.room.roomCode)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, joiner, 'uuid-start-joiner', callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'NOT_HOST')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 운영 최소 인원 기준으로 인원이 미달이면 MIN_PLAYERS_NOT_MET으로 ack가 정확히 한 번 온다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '2' // 개발 환경 기본값(1명)로는 항상 충족되므로 임시로 올린다
    try {
        const hostSocket = createFakeSocket('uuid-start-min')
        const io = createFakeIo([hostSocket])
        await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-start-min', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const beforeSession = gameSession.__getStateSnapshotForTests()
        const { callback, getCalls, getResponse } = countingCallback()
        await handleStartGame(io, hostSocket, 'uuid-start-min', callback)

        assert.equal(getCalls(), 1)
        assert.equal(getResponse().ok, false)
        assert.equal(getResponse().code, 'MIN_PLAYERS_NOT_MET')
        assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 실제 참가 인원이 광대 수 이하이면(비-광대 0명) MIN_PLAYERS_NOT_MET으로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-start-joker')
    const io = createFakeIo([hostSocket])
    // maxPlayers=4, jokerCount=1로 생성한 뒤 host 1명만 있는 상태(참가 인원 1 <= jokerCount 1)를 재현한다.
    await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-joker', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-start-joker')
    assert.equal(res.ok, false)
    assert.equal(res.code, 'MIN_PLAYERS_NOT_MET')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 정원(4)이 운영 최소 인원(5)보다 작아도 정원만큼 채우고 전원 준비하면 인원 조건을 통과한다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '5'
    try {
        const hostSocket = createFakeSocket('uuid-cap-host')
        const io = createFakeIo([hostSocket])
        const created = await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-cap-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const { roomCode } = created.room

        const sockets = { 'uuid-cap-host': hostSocket }
        for (const uuid of ['uuid-cap-p1', 'uuid-cap-p2', 'uuid-cap-p3']) {
            const s = createFakeSocket(uuid)
            io.sockets.sockets.set(s.id, s)
            await handleJoinRoomByCode(io, s, uuid, roomCode)
            sockets[uuid] = s
        }
        // host + 3명 = 정원 4명, 운영 최소 인원(5)에는 못 미치지만 정원 기준으로는 충족해야 한다.

        for (const [uuid, s] of Object.entries(sockets)) {
            await callAsPromise(handleSetReady, io, s, uuid, { isReady: true })
        }

        const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-cap-host')
        assert.equal(res.ok, true) // 인원 미달로 막히지 않고 GameSession 전환까지 성공한다
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 준비하지 않은 참가자가 있으면 PLAYERS_NOT_READY로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-notready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-notready-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joiner = createFakeSocket('uuid-start-notready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-notready-joiner', created.room.roomCode)

    // 호스트만 준비하고 joiner는 준비하지 않은 채로 둔다.
    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-start-notready-host', { isReady: true })

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-notready-host', callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYERS_NOT_READY')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', async () => {
    // 방장 권한까지 통과할 수 있는 정상 방을 만들어, "검사 자체가 실행되긴 하지만 callback이
    // 없어 응답도 상태 변경도 하지 않는지"를 확인한다(가장 앞단 검사가 우선임을 재확인).
    const hostSocket = createFakeSocket('uuid-start-nocb')
    const io = createFakeIo([hostSocket])
    await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    await handleStartGame(io, hostSocket, 'uuid-start-nocb', undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.length, 0) // 이제 start_game은 ack로만 응답하므로 emit 자체가 없어야 한다
})

// ── start_game: 성공 경로(GameSession 전환) ─────────────────────────────

// setupReadyRoomForStart는 handleCreateRoom/handleJoinRoomByCode/handleSetReady를
// 인자로 받는다(공유 fixture는 matchmaking.js를 require하지 않으므로) — 이 파일
// 상단에서 이미 matchmaking.__testables로 꺼내 둔 지역 변수를 그대로 묶어 넘긴다.
const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }

test('start_game: 모든 조건을 충족하면 GameSession을 생성하고 참가자별로 역할이 다른 개별 game_started를 전달한다', async () => {
    const hostSocket = createFakeSocket('uuid-start-ok-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket } = await setupReadyRoomForStart(io, 'uuid-start-ok-host', 'uuid-start-ok-joiner', readyRoomHandlers)

    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-ok-host', callback)

    // (a) ack 정확히 1회, ok:true
    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, true)
    assert.equal(typeof getResponse().gameId, 'string')

    // (b) game-core registry에 세션 1개
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1)

    // (c) gameRooms/playerRoom에서 Room 제거
    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(roomSnapshot.gameRooms.length, 0)
    assert.equal(roomSnapshot.playerRoom.length, 0)

    // (d) public_rooms_updated 방송 발생
    assert.equal(io.broadcasts.some((b) => b.event === 'public_rooms_updated'), true)

    // (e) 각 참가자 소켓이 game_started를 정확히 1회 받음
    const hostGameStarted = hostSocket.emitted.filter((e) => e.event === 'game_started')
    const joinerGameStarted = joinerSocket.emitted.filter((e) => e.event === 'game_started')
    assert.equal(hostGameStarted.length, 1)
    assert.equal(joinerGameStarted.length, 1)

    // (f) 공용 players[] 모든 원소에 role/team 키가 없음
    for (const { payload } of [...hostGameStarted, ...joinerGameStarted]) {
        for (const player of payload.state.players) {
            assert.equal(Object.hasOwn(player, 'role'), false)
            assert.equal(Object.hasOwn(player, 'team'), false)
        }
    }

    const hostPayload = hostGameStarted[0].payload
    const joinerPayload = joinerGameStarted[0].payload

    // (g) role 키를 가진 위치는 state.self.role 하나뿐
    assert.equal((JSON.stringify(hostPayload).match(/"role"/g) ?? []).length, 1)
    assert.equal((JSON.stringify(joinerPayload).match(/"role"/g) ?? []).length, 1)

    // (h) state.self.uuid가 수신 소켓의 uuid와 일치
    assert.equal(hostPayload.state.self.uuid, 'uuid-start-ok-host')
    assert.equal(joinerPayload.state.self.uuid, 'uuid-start-ok-joiner')

    // (i) state.self.role이 내부 세션의 실제 배정과 일치 — jokerCount:1/2명이므로 역할이 서로 다르다
    const roles = [hostPayload.state.self.role, joinerPayload.state.self.role]
    assert.equal(roles.includes('JOKER'), true)
    assert.equal(roles.includes('CITIZEN'), true)
})

test('start_game: 참가자 중 한 명의 소켓이 connected:false이면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-pu-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket } = await setupReadyRoomForStart(io, 'uuid-pu-host', 'uuid-pu-joiner', readyRoomHandlers)
    joinerSocket.connected = false // 참가자 중 한 명의 연결이 끊긴 상태를 재현

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    // setupReadyRoomForStart 자체가 create_room/join_room_by_code로 이미 public_rooms_updated를
    // 방송하므로, "이 실패 요청이 새 방송을 만들지 않는지"는 호출 전 개수와 비교해야 한다.
    const broadcastCountBefore = io.broadcasts.length
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-pu-host', callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(io.broadcasts.length, broadcastCountBefore)
})

test('start_game: 참가자 중 한 명의 소켓이 Room channel에 join되어 있지 않으면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-nc-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-nc-host', 'uuid-nc-joiner', readyRoomHandlers)
    // connected:true이지만 Room의 Socket.IO channel에는 join되어 있지 않은 상태를 재현한다
    // (force_disconnect 이후 재연결했지만 아직 이전 room에 다시 join하지 않은 짧은 구간 등).
    joinerSocket.rooms.delete(room.roomId)

    const before = matchmaking.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-nc-host', callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
})

test('start_game: 동일 uuid의 정상적인 복수 소켓 모두에게 game_started가 전달된다', async () => {
    const hostSocket = createFakeSocket('uuid-multi-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-multi-host', 'uuid-multi-joiner', readyRoomHandlers)

    // 같은 uuid로 인증된 두 번째 소켓이 이미 같은 channel에 join된 상태(연결 전환 중 짧은 구간)를 재현한다.
    const joinerSecondSocket = createFakeSocket('uuid-multi-joiner', { id: 'sock-uuid-multi-joiner-2' })
    joinerSecondSocket.rooms.add(room.roomId)
    io.sockets.sockets.set(joinerSecondSocket.id, joinerSecondSocket)

    const { getResponse, callback } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-multi-host', callback)

    assert.equal(getResponse().ok, true)
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
    assert.equal(joinerSecondSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
})

test('start_game: payload 사전 생성 단계에서 예외가 나면 INTERNAL_ERROR로 응답하고 모든 상태가 불변이며 game_started가 전달되지 않는다', async (t) => {
    const hostSocket = createFakeSocket('uuid-payloaderr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket } = await setupReadyRoomForStart(io, 'uuid-payloaderr-host', 'uuid-payloaderr-joiner', readyRoomHandlers)

    // node:test의 MockTracker는 테스트 종료 시 자동으로 원래 함수를 복원하므로, 이 mock이
    // 같은 프로세스의 후속 테스트로 새어 나가지 않는다(수동 try/finally 복원 불필요).
    t.mock.method(gameSession, 'buildGameStartedPayload', () => {
        throw new Error('테스트 강제 실패')
    })

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-payloaderr-host', callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'INTERNAL_ERROR')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(joinerSocket.emitted.some((e) => e.event === 'game_started'), false)
})

test('start_game: notify 중 한 참가자의 emit이 실패해도 나머지는 정상 수신하고 host ack은 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-notifyerr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket } = await setupReadyRoomForStart(io, 'uuid-notifyerr-host', 'uuid-notifyerr-joiner', readyRoomHandlers)
    joinerSocket.emit = () => { throw new Error('emit 실패(테스트 주입)') }

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-notifyerr-host', callback)

    assert.equal(getResponse().ok, true)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), true)
})

test('start_game: 참가자 중 한 명이 이미 다른 GameSession에 속해 있으면 새 Room 전체가 PLAYER_ALREADY_IN_SESSION으로 거부된다', async () => {
    // 첫 번째 Room을 정상적으로 GameSession으로 전환시킨다.
    const firstHost = createFakeSocket('uuid-pais-shared')
    const io = createFakeIo([firstHost])
    await setupReadyRoomForStart(io, 'uuid-pais-shared', 'uuid-pais-first-joiner', readyRoomHandlers)
    const firstStart = await callAsPromise(handleStartGame, io, firstHost, 'uuid-pais-shared')
    assert.equal(firstStart.ok, true) // 전제조건: 첫 세션 전환 성공

    // "uuid-pais-shared"는 이제 GameSession에 속해 있다. 같은 uuid가 참가한 새 Room을 만든다
    // (GameSession 전환으로 playerRoom에서는 이미 정리됐으므로 새 Room 생성 자체는 허용된다).
    const newHost = createFakeSocket('uuid-pais-new-host')
    io.sockets.sockets.set(newHost.id, newHost)
    const newRoom = await callAsPromise(
        handleCreateRoom, io, newHost, 'uuid-pais-new-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const sharedSocket = createFakeSocket('uuid-pais-shared', { id: 'sock-uuid-pais-shared-2' })
    io.sockets.sockets.set(sharedSocket.id, sharedSocket)
    await handleJoinRoomByCode(io, sharedSocket, 'uuid-pais-shared', newRoom.room.roomCode)
    await callAsPromise(handleSetReady, io, newHost, 'uuid-pais-new-host', { isReady: true })
    await callAsPromise(handleSetReady, io, sharedSocket, 'uuid-pais-shared', { isReady: true })

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, newHost, 'uuid-pais-new-host', callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYER_ALREADY_IN_SESSION')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 성공 후 같은 uuid로 get_current_room을 조회하면 room:null이 온다', async () => {
    const hostSocket = createFakeSocket('uuid-gcr-host')
    const io = createFakeIo([hostSocket])
    await setupReadyRoomForStart(io, 'uuid-gcr-host', 'uuid-gcr-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-gcr-host')
    assert.equal(startResult.ok, true)

    const current = await callAsPromise(handleGetCurrentRoom, 'uuid-gcr-host')
    assert.equal(current.room, null)
})

test('start_game: 게임 시작 후 공개방 목록에 그 방이 더 이상 없다', async () => {
    const hostSocket = createFakeSocket('uuid-list-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-list-host', 'uuid-list-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-list-host')
    assert.equal(startResult.ok, true)

    const list = await callAsPromise(handleGetPublicRooms)
    assert.equal(list.rooms.some((r) => r.id === room.roomId), false)
})

process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    seedActiveGameForAccount,
} = require('./testHelpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleJoinPublicRoom,
    handleJoinMatchmaking,
} = matchmaking.__testables
const { ALREADY_IN_GAME_MESSAGE } = matchmaking

let findByUuidCalls = 0
const fakeUserRepository = {
    async findByUuid(uuid) {
        findByUuidCalls += 1
        return { uuid, nickname: `nick-${uuid}` }
    },
}
const fakeEconomyService = {
    async getPublicProfileLoadouts(userIds) {
        return Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
    },
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    matchmaking.__setUserRepositoryForTests(fakeUserRepository)
    matchmaking.__setEconomyServiceForTests(fakeEconomyService)
    findByUuidCalls = 0
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    matchmaking.__setUserRepositoryForTests(null)
    matchmaking.__setEconomyServiceForTests(null)
    matchmaking.__setRandomMatchmakingEnabledForTests(null)
})

async function createRoomAsFreeAccount(io, uuid, overrides = {}) {
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    const response = await callAsPromise(handleCreateRoom, io, socket, uuid, validSettingsPayload(overrides))
    assert.equal(response.ok, true, '사전 준비용 방 생성은 성공해야 한다')
    return { socket, room: response.room }
}

function joinFailures(socket) {
    return socket.emitted.filter((e) => e.event === 'room_join_failed')
}

test('AC-01: 활성 게임에 속한 계정의 create_room은 ALREADY_IN_GAME으로 거부된다', async () => {
    const session = seedActiveGameForAccount(['ac01-a', 'ac01-b'])

    const socket = createFakeSocket('ac01-a')
    const io = createFakeIo([socket])

    const response = await callAsPromise(handleCreateRoom, io, socket, 'ac01-a', validSettingsPayload())

    assert.deepEqual(response, {
        ok: false,
        code: 'ALREADY_IN_GAME',
        message: ALREADY_IN_GAME_MESSAGE,
        gameId: session.id,
    })

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(snapshot.gameRooms, [])
    assert.deepEqual(snapshot.playerRoom, [])
    assert.deepEqual(snapshot.pendingRoomTransitions, [])
    assert.deepEqual(socket.joined, [])
    assert.deepEqual(socket.emitted, [])
    assert.equal(findByUuidCalls, 0)
})

test('AC-01: 설정 payload가 유효해도(검증 실패와 무관하게) 인게임 계정은 거부된다', async () => {
    seedActiveGameForAccount(['ac01v-a', 'ac01v-b'])

    const socket = createFakeSocket('ac01v-a')
    const io = createFakeIo([socket])

    const response = await callAsPromise(
        handleCreateRoom, io, socket, 'ac01v-a', validSettingsPayload({ maxPlayers: 6, jokerCount: 1 }),
    )

    assert.equal(response.code, 'ALREADY_IN_GAME')
})

test('AC-02: 활성 게임에 속한 계정의 join_room_by_code는 ALREADY_IN_GAME으로 거부된다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac02-host')
    const session = seedActiveGameForAccount(['ac02-joiner', 'ac02-peer'])

    const socket = createFakeSocket('ac02-joiner')
    io.sockets.sockets.set(socket.id, socket)

    await handleJoinRoomByCode(io, socket, 'ac02-joiner', room.roomCode)

    assert.deepEqual(joinFailures(socket).map((e) => e.payload), [
        { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id },
    ])

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, seededRoom] = snapshot.gameRooms.find(([id]) => id === room.roomId)
    assert.deepEqual(seededRoom.players.map(([uuid]) => uuid), ['ac02-host'])
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === 'ac02-joiner'), false)
    assert.deepEqual(snapshot.pendingRoomTransitions, [])
    assert.deepEqual(socket.joined, [])
})

test('AC-03: 활성 게임에 속한 계정의 join_public_room은 ALREADY_IN_GAME으로 한 번만 거부된다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac03-host')
    const session = seedActiveGameForAccount(['ac03-joiner', 'ac03-peer'])

    const socket = createFakeSocket('ac03-joiner')
    io.sockets.sockets.set(socket.id, socket)

    await handleJoinPublicRoom(io, socket, 'ac03-joiner', { roomId: room.roomId })

    assert.deepEqual(joinFailures(socket).map((e) => e.payload), [
        { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id },
    ])
    assert.deepEqual(socket.joined, [])
})

test('AC-03: 없는 roomId로 들어와도 인게임 계정에게는 ROOM_NOT_FOUND가 아니라 ALREADY_IN_GAME이 간다', async () => {
    seedActiveGameForAccount(['ac03n-a', 'ac03n-b'])

    const socket = createFakeSocket('ac03n-a')
    const io = createFakeIo([socket])

    await handleJoinPublicRoom(io, socket, 'ac03n-a', { roomId: 'no-such-room' })

    assert.equal(joinFailures(socket)[0].payload.code, 'ALREADY_IN_GAME')
})

test('AC-03: 활성 게임에 속한 계정의 join_matchmaking은 큐에 들어가지 않고 ALREADY_IN_GAME으로 거부된다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    const session = seedActiveGameForAccount(['ac03m-a', 'ac03m-b'])

    const socket = createFakeSocket('ac03m-a')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'ac03m-a')

    assert.deepEqual(joinFailures(socket).map((e) => e.payload), [
        { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id },
    ])
    assert.equal(socket.emitted.some((e) => e.event === 'matchmaking_queued'), false)
    assert.equal(socket.emitted.some((e) => e.event === 'match_found'), false)
    assert.deepEqual(matchmaking.__getStateSnapshotForTests().matchmakingQueue, [])
    assert.equal(findByUuidCalls, 0)
})

test('AC-04: 네 경로가 모두 같은 code/message/gameId로 ALREADY_IN_GAME을 알린다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    const session = seedActiveGameForAccount(['ac04-a', 'ac04-b'])

    const socket = createFakeSocket('ac04-a')
    const io = createFakeIo([socket])

    const ackResponse = await callAsPromise(handleCreateRoom, io, socket, 'ac04-a', validSettingsPayload())
    await handleJoinRoomByCode(io, socket, 'ac04-a', 'ABC123')
    await handleJoinPublicRoom(io, socket, 'ac04-a', { roomId: 'any-room-id' })
    await handleJoinMatchmaking(io, socket, 'ac04-a')

    const expectedPayload = { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id }

    const failures = joinFailures(socket)
    assert.equal(failures.length, 3)
    for (const failure of failures) assert.deepEqual(failure.payload, expectedPayload)
    assert.equal(socket.emitted.length, 3)

    assert.deepEqual(ackResponse, { ok: false, ...expectedPayload })
    const { ok, ...ackPayload } = ackResponse
    assert.equal(ok, false)
    assert.deepEqual(ackPayload, failures[0].payload)
})

test('AC-06: 게임 미소속 계정의 create_room은 기존대로 성공하고 예약도 해제된다', async () => {
    const socket = createFakeSocket('ac06-host')
    const io = createFakeIo([socket])

    const response = await callAsPromise(handleCreateRoom, io, socket, 'ac06-host', validSettingsPayload())

    assert.equal(response.ok, true)
    assert.equal(Object.hasOwn(response, 'code'), false, '성공 응답 형태는 그대로다')
    assert.equal(typeof response.room.roomCode, 'string')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(snapshot.playerRoom, [['ac06-host', response.room.roomId]])
    assert.deepEqual(snapshot.pendingRoomTransitions, [])
    assert.deepEqual(socket.joined, [response.room.roomId])
})

test('AC-06: 게임 미소속 계정의 코드 참가는 기존대로 성공한다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac06j-host')

    const socket = createFakeSocket('ac06j-joiner')
    io.sockets.sockets.set(socket.id, socket)
    await handleJoinRoomByCode(io, socket, 'ac06j-joiner', room.roomCode)

    assert.deepEqual(joinFailures(socket), [])
    assert.equal(socket.emitted.some((e) => e.event === 'room_joined'), true)
    assert.deepEqual(matchmaking.__getStateSnapshotForTests().playerRoom.map(([uuid]) => uuid).sort(), [
        'ac06j-host',
        'ac06j-joiner',
    ])
})

test('AC-06: 게이트 추가로 기존 실패 코드가 뒤바뀌지 않는다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac06f-host')

    const hostRetrySocket = createFakeSocket('ac06f-host', { id: 'sock-ac06f-host-2' })
    await handleJoinRoomByCode(io, hostRetrySocket, 'ac06f-host', room.roomCode)
    assert.equal(joinFailures(hostRetrySocket)[0].payload.code, 'ALREADY_IN_ROOM')

    const strangerSocket = createFakeSocket('ac06f-stranger')
    await handleJoinRoomByCode(io, strangerSocket, 'ac06f-stranger', 'ZZZZZZ')
    assert.equal(joinFailures(strangerSocket)[0].payload.code, 'ROOM_CODE_MISMATCH')

    const emptyCodeSocket = createFakeSocket('ac06f-empty')
    await handleJoinRoomByCode(io, emptyCodeSocket, 'ac06f-empty', '   ')
    assert.equal(joinFailures(emptyCodeSocket)[0].payload.code, 'CODE_REQUIRED')

    const publicSocket = createFakeSocket('ac06f-public')
    await handleJoinPublicRoom(io, publicSocket, 'ac06f-public', { roomId: 'gone' })
    assert.equal(joinFailures(publicSocket)[0].payload.code, 'ROOM_NOT_FOUND')

    const badPayloadSocket = createFakeSocket('ac06f-bad')
    await handleJoinPublicRoom(io, badPayloadSocket, 'ac06f-bad', null)
    assert.equal(joinFailures(badPayloadSocket)[0].payload.code, 'INVALID_REQUEST')
})

test('AC-06: 코드 방을 join_public_room으로 우회하려는 요청은 여전히 ROOM_CODE_MISMATCH다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac06c-host', { accessType: 'code' })

    const socket = createFakeSocket('ac06c-joiner')
    await handleJoinPublicRoom(io, socket, 'ac06c-joiner', { roomId: room.roomId })

    assert.equal(joinFailures(socket)[0].payload.code, 'ROOM_CODE_MISMATCH')
})

test('AC-03: 랜덤 매칭이 비활성이어도 인게임 계정은 ALREADY_IN_GAME으로 먼저 거부된다', async () => {
    const session = seedActiveGameForAccount(['ac06m-a', 'ac06m-b'])

    const socket = createFakeSocket('ac06m-a')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'ac06m-a')

    assert.deepEqual(joinFailures(socket).map((e) => e.payload), [
        { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id },
    ])
})

test('AC-06: 랜덤 매칭이 비활성이면 게임 미소속 계정은 기존대로 matchmaking_disabled를 받는다', async () => {
    const socket = createFakeSocket('ac06m-free')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'ac06m-free')

    assert.deepEqual(socket.emitted.map((e) => e.event), ['matchmaking_disabled'])
})

test('AC-06: 게임 미소속 계정은 매칭 큐에 기존대로 등록된다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)

    const socket = createFakeSocket('ac06q-a')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'ac06q-a')

    assert.equal(socket.emitted.some((e) => e.event === 'matchmaking_queued'), true)
    assert.equal(joinFailures(socket).length, 0)
})

test('AC-06: 유예 만료로 배제된 계정은 새 방을 만들 수 있다', async () => {
    const session = seedActiveGameForAccount(
        ['ff-1', 'ff-2', 'ff-3', 'ff-4', 'ff-5'],
        { roomId: 'room-forfeit' },
    )
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid

    const result = gameSessionCore.commitDisconnectElimination(session, victimUuid)
    assert.equal(result.ok, true)
    assert.equal(result.terminal, null, '남은 인원이 충분해 세션은 계속 진행 중이어야 한다')
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, victimUuid), true)

    const socket = createFakeSocket(victimUuid)
    const io = createFakeIo([socket])
    const response = await callAsPromise(handleCreateRoom, io, socket, victimUuid, validSettingsPayload())

    assert.equal(response.ok, true)

    const stillPlayingUuid = [...session.players.keys()].find((uuid) => uuid !== victimUuid)
    const peerSocket = createFakeSocket(stillPlayingUuid)
    const peerResponse = await callAsPromise(
        handleCreateRoom, io, peerSocket, stillPlayingUuid, validSettingsPayload(),
    )
    assert.equal(peerResponse.code, 'ALREADY_IN_GAME')
})

test('AC-06: 게임이 끝나 세션 정리가 완료된 계정은 다시 방을 만들 수 있다', async () => {
    seedActiveGameForAccount(['ac06e-a', 'ac06e-b'], { roomId: 'room-ended' })

    const socket = createFakeSocket('ac06e-a')
    const io = createFakeIo([socket])

    const blocked = await callAsPromise(handleCreateRoom, io, socket, 'ac06e-a', validSettingsPayload())
    assert.equal(blocked.code, 'ALREADY_IN_GAME')

    assert.equal(gameSessionCore.endGameSessionForPlayer('ac06e-a', 'PLAYER_LEFT').ok, true)

    const allowed = await callAsPromise(handleCreateRoom, io, socket, 'ac06e-a', validSettingsPayload())
    assert.equal(allowed.ok, true)
})

test('AC-06: phase ENDED인 판의 방장은 leave 없이 create_room 할 수 있다', async () => {
    const session = seedActiveGameForAccount(['ended-host', 'ended-join'], { roomId: 'room-ended-phase' })
    session.phase = 'ENDED'
    session.hostUuid = 'ended-host'

    const hostSocket = createFakeSocket('ended-host')
    hostSocket.rooms.add(session.channelId)
    const io = createFakeIo([hostSocket])

    const response = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'ended-host', validSettingsPayload(),
    )
    assert.equal(response.ok, true)
    assert.notEqual(response.code, 'ALREADY_IN_GAME')
})

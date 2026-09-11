const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
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

/**
 * 인게임(활성 GameSession 소속) 계정의 방 생성·참가 차단 전용 스펙.
 *
 * matchmaking.test.js와 파일을 나눈 이유: 이 파일의 모든 시나리오는 matchmaking registry와
 * game-core의 세션 registry를 함께 세팅해야 하고(그래서 beforeEach가 두 모듈을 모두 초기화한다),
 * 기존 파일의 셋업은 세션 상태를 전혀 다루지 않는다.
 *
 * 응답 형식의 원본은 코드가 ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME, 문구가
 * matchmaking.ALREADY_IN_GAME_MESSAGE다 — 이 파일은 문구를 복붙하지 않고 그 상수를 참조한다.
 */

let findByUuidCalls = 0
const fakeUserRepository = {
    async findByUuid(uuid) {
        findByUuidCalls += 1
        return { uuid, nickname: `nick-${uuid}` }
    },
}
// F-13(AC-05): economy.service.js도 실제 호출 시 backend/models(실제 DB)가 필요해
// userRepository와 같은 이유로 fake를 주입한다.
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

/** 인게임이 아닌 계정으로 실제 방을 하나 만들어 두고 그 payload를 돌려준다. */
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

// ---------------------------------------------------------------------------
// AC-01 — create_room
// ---------------------------------------------------------------------------

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

    // 예약(pendingRoomTransitions)·Socket room 가입·Map 커밋 어느 것도 일어나지 않는다 —
    // 게이트가 그 모든 것보다 앞선 동기 구간에 있으므로 되돌릴 상태 자체가 생기지 않는다.
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(snapshot.gameRooms, [])
    assert.deepEqual(snapshot.playerRoom, [])
    assert.deepEqual(snapshot.pendingRoomTransitions, [])
    assert.deepEqual(socket.joined, [])
    assert.deepEqual(socket.emitted, [])
    // 사용자 조회(await)에 닿기 전에 막힌다.
    assert.equal(findByUuidCalls, 0)
})

test('AC-01: 설정 payload가 유효해도(검증 실패와 무관하게) 인게임 계정은 거부된다', async () => {
    seedActiveGameForAccount(['ac01v-a', 'ac01v-b'])

    const socket = createFakeSocket('ac01v-a')
    const io = createFakeIo([socket])

    // 정원·광대 수까지 모두 유효한 payload다 — 사유가 입력 검증 실패로 오인될 여지가 없다.
    const response = await callAsPromise(
        handleCreateRoom, io, socket, 'ac01v-a', validSettingsPayload({ maxPlayers: 6, jokerCount: 1 }),
    )

    assert.equal(response.code, 'ALREADY_IN_GAME')
})

// ---------------------------------------------------------------------------
// AC-02 — join_room_by_code
// ---------------------------------------------------------------------------

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

    // 방에도, 역방향 매핑에도, 예약에도 흔적이 없다.
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, seededRoom] = snapshot.gameRooms.find(([id]) => id === room.roomId)
    assert.deepEqual(seededRoom.players.map(([uuid]) => uuid), ['ac02-host'])
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === 'ac02-joiner'), false)
    assert.deepEqual(snapshot.pendingRoomTransitions, [])
    assert.deepEqual(socket.joined, [])
})

// ---------------------------------------------------------------------------
// AC-03 — join_public_room / join_matchmaking
// ---------------------------------------------------------------------------

test('AC-03: 활성 게임에 속한 계정의 join_public_room은 ALREADY_IN_GAME으로 한 번만 거부된다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoomAsFreeAccount(io, 'ac03-host')
    const session = seedActiveGameForAccount(['ac03-joiner', 'ac03-peer'])

    const socket = createFakeSocket('ac03-joiner')
    io.sockets.sockets.set(socket.id, socket)

    await handleJoinPublicRoom(io, socket, 'ac03-joiner', { roomId: room.roomId })

    // 차단되면 handleJoinRoomByCode 위임 자체를 하지 않으므로 실패가 두 번 나가지 않는다.
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

    // 게이트가 방 조회보다 앞에 있어야만 사용자가 실제로 해결해야 하는 사유가 안정적으로 간다.
    assert.equal(joinFailures(socket)[0].payload.code, 'ALREADY_IN_GAME')
})

test('AC-03: 활성 게임에 속한 계정의 join_matchmaking은 큐에 들어가지 않고 ALREADY_IN_GAME으로 거부된다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    const session = seedActiveGameForAccount(['ac03m-a', 'ac03m-b'])

    const socket = createFakeSocket('ac03m-a')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'ac03m-a')

    // 이 경로는 원래 중복 소속을 조용히 무시했지만, 인게임 거부만은 명시적으로 알린다.
    assert.deepEqual(joinFailures(socket).map((e) => e.payload), [
        { code: 'ALREADY_IN_GAME', message: ALREADY_IN_GAME_MESSAGE, gameId: session.id },
    ])
    assert.equal(socket.emitted.some((e) => e.event === 'matchmaking_queued'), false)
    assert.equal(socket.emitted.some((e) => e.event === 'match_found'), false)
    assert.deepEqual(matchmaking.__getStateSnapshotForTests().matchmakingQueue, [])
    assert.equal(findByUuidCalls, 0)
})

// ---------------------------------------------------------------------------
// AC-04 — 단일 형식
// ---------------------------------------------------------------------------

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

    // join 계열 세 경로: 기존 계약 그대로 room_join_failed 이벤트 하나씩, 페이로드는 완전히 동일.
    const failures = joinFailures(socket)
    assert.equal(failures.length, 3)
    for (const failure of failures) assert.deepEqual(failure.payload, expectedPayload)
    // room_join_failed 외의 다른 이벤트는 하나도 나가지 않았다(예: matchmaking_queued).
    assert.equal(socket.emitted.length, 3)

    // create_room만 채널이 ack callback이다 — 채널은 각자의 기존 계약을 따르되 code/message
    // 쌍 자체는 join 계열과 글자 하나까지 같다.
    assert.deepEqual(ackResponse, { ok: false, ...expectedPayload })
    const { ok, ...ackPayload } = ackResponse
    assert.equal(ok, false)
    assert.deepEqual(ackPayload, failures[0].payload)
})

// ---------------------------------------------------------------------------
// AC-06 — 게임에 소속되지 않은 계정의 기존 동작
// ---------------------------------------------------------------------------

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

    // 이미 대기방에 있는 계정(인게임 아님) → 여전히 ALREADY_IN_ROOM
    const hostRetrySocket = createFakeSocket('ac06f-host', { id: 'sock-ac06f-host-2' })
    await handleJoinRoomByCode(io, hostRetrySocket, 'ac06f-host', room.roomCode)
    assert.equal(joinFailures(hostRetrySocket)[0].payload.code, 'ALREADY_IN_ROOM')

    // 어느 방과도 맞지 않는 코드 → 여전히 ROOM_CODE_MISMATCH
    const strangerSocket = createFakeSocket('ac06f-stranger')
    await handleJoinRoomByCode(io, strangerSocket, 'ac06f-stranger', 'ZZZZZZ')
    assert.equal(joinFailures(strangerSocket)[0].payload.code, 'ROOM_CODE_MISMATCH')

    // 코드 없이 들어온 요청 → 여전히 CODE_REQUIRED
    const emptyCodeSocket = createFakeSocket('ac06f-empty')
    await handleJoinRoomByCode(io, emptyCodeSocket, 'ac06f-empty', '   ')
    assert.equal(joinFailures(emptyCodeSocket)[0].payload.code, 'CODE_REQUIRED')

    // 없는 공개 방 → 여전히 ROOM_NOT_FOUND
    const publicSocket = createFakeSocket('ac06f-public')
    await handleJoinPublicRoom(io, publicSocket, 'ac06f-public', { roomId: 'gone' })
    assert.equal(joinFailures(publicSocket)[0].payload.code, 'ROOM_NOT_FOUND')

    // payload 형태 자체가 잘못된 요청 → 여전히 INVALID_REQUEST(게이트보다 앞선다)
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
    // 배제된 계정은 원래 세션에 다시 들어갈 수 없는데(resyncSessionRouting이 거부) playerSession
    // 매핑은 그 세션이 끝날 때까지 남는다 — 활성 소속으로 취급하면 돌아갈 곳도 새로 만들 곳도
    // 없는 상태로 묶이므로, 게이트는 배제된 계정을 인게임으로 보지 않는다.
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

    // 반면 같은 세션의 배제되지 않은 참가자는 여전히 차단된다.
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

    // 이탈로 세션 정리가 끝나면 playerSession 매핑이 사라지고 게이트도 함께 풀린다 —
    // 종료된 게임의 잔재 때문에 계정이 영구히 방 생성 불가 상태에 빠지지 않는다.
    assert.equal(gameSessionCore.endGameSessionForPlayer('ac06e-a', 'PLAYER_LEFT').ok, true)

    const allowed = await callAsPromise(handleCreateRoom, io, socket, 'ac06e-a', validSettingsPayload())
    assert.equal(allowed.ok, true)
})

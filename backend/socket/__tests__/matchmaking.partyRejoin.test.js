process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocketLayer = require('../gameSession')
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
    readyPayload,
    startPayload,
    seedActiveGameForAccount,
} = require('./testHelpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleGetCurrentRoom,
    handleGetPartyMatchingRoom,
    handleSetReady,
    handleStartGame,
} = matchmaking.__testables
const { handleLeaveGameSession } = gameSessionSocketLayer.__testables

function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') {
                return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            }
            return Reflect.get(target, prop, receiver)
        },
    })
}

const fakeUserRepository = {
    async findByUuid(uuid) {
        return { uuid, nickname: `nick-${uuid}` }
    },
}
const fakeEconomyService = {
    async getPublicProfileLoadouts(userIds) {
        return Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
    },
    async getGameStartLoadouts(userIds) {
        return Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null,
            profileBorderId: null,
            cardFrameId: null,
            accountSkinIds: {},
        }]))
    },
    async getEmojiPalette() {
        return { slots: Array(8).fill(null), owned: [] }
    },
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    const registry = createConventionFollowingRegistry()
    gameSessionSocketLayer.setOnlineUsersRegistry(registry)
    matchmaking.setOnlineUsersRegistry(registry)
    matchmaking.__setUserRepositoryForTests(fakeUserRepository)
    matchmaking.__setEconomyServiceForTests(fakeEconomyService)
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    matchmaking.__setUserRepositoryForTests(null)
    matchmaking.__setEconomyServiceForTests(null)
})

function seedEndedGame(hostUuid, guestUuid) {
    const session = seedActiveGameForAccount([hostUuid, guestUuid])
    session.hostUuid = hostUuid
    session.phase = 'ENDED'
    session.winResult = { winner: 'CITIZEN' }
    return session
}

test('ENDED 판 방장이 create_room 하면 참가자가 get_party_matching_room으로 새 방을 조회한다', async () => {
    const io = createFakeIo()
    const hostUuid = 'host-ended'
    const guestUuid = 'guest-ended'
    const endedSession = seedEndedGame(hostUuid, guestUuid)

    const hostSocket = createFakeSocket(hostUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)

    const createResponse = await callAsPromise(
        handleCreateRoom,
        io,
        hostSocket,
        hostUuid,
        validSettingsPayload(),
    )
    assert.equal(createResponse.ok, true)
    assert.ok(createResponse.room?.roomCode)

    const guestSocket = createFakeSocket(guestUuid)
    io.sockets.sockets.set(guestSocket.id, guestSocket)

    const lookup = await callAsPromise(
        handleGetPartyMatchingRoom,
        guestUuid,
        { gameId: endedSession.id },
    )
    assert.equal(lookup.ok, true)
    assert.equal(lookup.gameId, endedSession.id)
    assert.equal(lookup.room?.roomCode, createResponse.room.roomCode)
    assert.equal(lookup.room?.roomId, createResponse.room.roomId)
})

test('ENDED 판 방장 create_room 시 참가자는 클라이언트 join 없이 playerRoom에 자동 등록된다', async () => {
    const io = createFakeIo()
    const hostUuid = 'host-auto'
    const guestUuid = 'guest-auto'
    seedEndedGame(hostUuid, guestUuid)

    const hostSocket = createFakeSocket(hostUuid)
    const guestSocket = createFakeSocket(guestUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    io.sockets.sockets.set(guestSocket.id, guestSocket)

    const createResponse = await callAsPromise(
        handleCreateRoom,
        io,
        hostSocket,
        hostUuid,
        validSettingsPayload(),
    )
    assert.equal(createResponse.ok, true)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const guestCurrent = await callAsPromise(handleGetCurrentRoom, guestUuid)
    assert.ok(guestCurrent.room, '참가자가 자동 재입장되지 않았다')
    assert.equal(guestCurrent.room.roomCode, createResponse.room.roomCode)
    assert.equal(guestCurrent.room.roomId, createResponse.room.roomId)
})

test('ENDED 판에서 로비로 이탈(leave_game_session)하면 자동 재입장된 대기방에서도 제거되고 player_left_room이 방송된다', async () => {
    const io = createFakeIo()
    const hostUuid = 'host-lobby-leave'
    const guestUuid = 'guest-lobby-leave'
    const endedSession = seedEndedGame(hostUuid, guestUuid)

    const hostSocket = createFakeSocket(hostUuid)
    const guestSocket = createFakeSocket(guestUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    io.sockets.sockets.set(guestSocket.id, guestSocket)

    const createResponse = await callAsPromise(
        handleCreateRoom,
        io,
        hostSocket,
        hostUuid,
        validSettingsPayload(),
    )
    assert.equal(createResponse.ok, true)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const guestBeforeLeave = await callAsPromise(handleGetCurrentRoom, guestUuid)
    assert.ok(guestBeforeLeave.room, '전제: 방장 create_room 후 참가자가 자동 재입장돼 있어야 한다')

    const broadcastsBefore = io.broadcasts.length
    const leaveResponse = await callAsPromise(
        handleLeaveGameSession,
        io,
        guestSocket,
        guestUuid,
        { gameId: endedSession.id },
    )
    assert.deepEqual(leaveResponse, { ok: true })

    const guestAfterLeave = await callAsPromise(handleGetCurrentRoom, guestUuid)
    assert.equal(guestAfterLeave.room, null, '로비로 간 참가자는 대기방에 남아 있으면 안 된다')

    const hostAfterLeave = await callAsPromise(handleGetCurrentRoom, hostUuid)
    assert.ok(hostAfterLeave.room, '방장은 대기방에 남아 있어야 한다')
    assert.equal(hostAfterLeave.room.players.length, 1)
    assert.equal(hostAfterLeave.room.players[0].uuid, hostUuid)

    const leftEvents = io.broadcasts.slice(broadcastsBefore).filter((b) => b.event === 'player_left_room')
    assert.equal(leftEvents.length, 1)
    assert.equal(leftEvents[0].payload.uuid, guestUuid)
    assert.equal(leftEvents[0].roomId, createResponse.room.roomId)
})

test('ENDED 판에서 대기방으로 복귀한 뒤 전원 준비하면 start_game이 성공한다', async () => {
    const io = createFakeIo()
    const hostUuid = 'host-restart'
    const guestUuid = 'guest-restart'
    seedEndedGame(hostUuid, guestUuid)

    const hostSocket = createFakeSocket(hostUuid)
    const guestSocket = createFakeSocket(guestUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    io.sockets.sockets.set(guestSocket.id, guestSocket)

    const createResponse = await callAsPromise(
        handleCreateRoom,
        io,
        hostSocket,
        hostUuid,
        validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(createResponse.ok, true)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const guestCurrent = await callAsPromise(handleGetCurrentRoom, guestUuid)
    assert.ok(guestCurrent.room, '전제: 참가자가 자동 재입장돼 있어야 한다')

    const room = createResponse.room
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(room))
    await callAsPromise(handleSetReady, io, guestSocket, guestUuid, readyPayload(room))

    const startResponse = await callAsPromise(
        handleStartGame,
        io,
        hostSocket,
        hostUuid,
        startPayload(room),
    )
    assert.equal(startResponse.ok, true, startResponse.message ?? startResponse.code)
    assert.ok(hostSocket.emitted.some((e) => e.event === 'game_started'))
    assert.ok(guestSocket.emitted.some((e) => e.event === 'game_started'))
})

test('get_party_matching_room은 gameId 없이도 ENDED 판 참가자의 소속 gameId로 조회한다', async () => {
    const io = createFakeIo()
    const hostUuid = 'host-ended-2'
    const guestUuid = 'guest-ended-2'
    seedEndedGame(hostUuid, guestUuid)

    const hostSocket = createFakeSocket(hostUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    const createResponse = await callAsPromise(
        handleCreateRoom,
        io,
        hostSocket,
        hostUuid,
        validSettingsPayload(),
    )
    assert.equal(createResponse.ok, true)

    const lookup = await callAsPromise(handleGetPartyMatchingRoom, guestUuid, {})
    assert.equal(lookup.ok, true)
    assert.ok(lookup.gameId)
    assert.equal(lookup.room?.roomCode, createResponse.room.roomCode)
})

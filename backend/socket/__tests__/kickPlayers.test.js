process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})
const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const kickReceiptStore = require('../kickReceiptStore')
const channelMembership = require('../channelMembership')
const gameResultRepository = require('../../repositories/gameResult.repositories')

const {
    createFakeSocket,
    createFakeIo,
    callAsPromise,
    validSettingsPayload,
    readyPayload,
    startPayload,
    countingCallback,
} = require('./testHelpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleSetReady,
    handleStartGame,
    handleKickRoomPlayer,
} = matchmaking.__testables

const {
    handleKickGamePlayer,
    handleGetKickResult,
    handleLeaveGameSession,
    handleGetSessionSnapshot,
} = gameSessionSocketLayer.__testables

const CODES = kickReceiptStore.KICK_ERROR_CODES
const EVENTS = kickReceiptStore.KICK_EVENTS
const BOOT = kickReceiptStore.BOOT_EPOCH

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `nick-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }])),
    getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            return Reflect.get(target, prop, receiver)
        },
    })
}

const conventionSocketId = (uuid) => `sock-${uuid}`

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ recorded: true }))
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => ({ granted: [] }))
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests()
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests()
})

let requestSeq = 0
function nextRequestId() {
    requestSeq += 1
    return `kick-req-${requestSeq}`
}

function snapshotRooms() {
    return JSON.stringify(matchmaking.__getStateSnapshotForTests())
}

async function setupRoom(hostUuid, joinerUuids, settingsOverrides = {}) {
    const hostSocket = createFakeSocket(hostUuid)
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid,
        validSettingsPayload({ maxPlayers: 8, jokerCount: 1, ...settingsOverrides }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    const sockets = { [hostUuid]: hostSocket }
    for (const joinerUuid of joinerUuids) {
        const joinerSocket = createFakeSocket(joinerUuid)
        io.sockets.sockets.set(joinerSocket.id, joinerSocket)
        sockets[joinerUuid] = joinerSocket
        await handleJoinRoomByCode(io, joinerSocket, joinerUuid, created.room.roomCode)
    }

    const current = await callAsPromise(handleGetCurrentRoom, hostUuid)
    assert.equal(current.room.roomId, created.room.roomId)
    return { io, sockets, hostSocket, room: current.room }
}

function seatOf(room, uuid) {
    return room.players.find((player) => player.uuid === uuid)
}

function roomKickPayload(room, hostUuid, targetUuid, overrides = {}) {
    return {
        requestId: nextRequestId(),
        bootEpoch: room.bootEpoch,
        roomId: room.roomId,
        roomInstanceId: room.roomInstanceId,
        requesterMembershipId: seatOf(room, hostUuid).membershipId,
        targetUuid,
        targetMembershipId: seatOf(room, targetUuid).membershipId,
        ...overrides,
    }
}

const kickRoom = (io, socket, uuid, payload) =>
    callAsPromise(handleKickRoomPlayer, io, socket, uuid, payload)
        .then((res) => res, (err) => { throw err })

function kickRoomPlayer(io, socket, uuid, payload, getCurrentSocketId = conventionSocketId) {
    const { callback, getResponse, getCalls } = countingCallback()
    handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId)
    return { response: getResponse(), calls: getCalls() }
}

function kickGamePlayer(io, socket, uuid, payload) {
    const { callback, getResponse, getCalls } = countingCallback()
    handleKickGamePlayer(io, socket, uuid, payload, callback)
    return { response: getResponse(), calls: getCalls() }
}

function getKickResult(io, socket, uuid, payload) {
    const { callback, getResponse } = countingCallback()
    handleGetKickResult(io, socket, uuid, payload, callback)
    return getResponse()
}

function commitDeterministicSession({ roomId, gameId, hostUuid, uuids }) {
    const players = new Map(uuids.map((uuid) => [uuid, {
        uuid, nickname: `nick-${uuid}`, isReady: true, membershipId: `mem-${uuid}`,
    }]))
    const prepared = gameSessionCore.prepareGameSession(
        { id: roomId, instanceId: `inst-${roomId}`, hostUuid, players, settings: { jokerCount: 1 } },
        { randomFn: () => 0, gameIdFn: () => gameId },
    )
    assert.equal(prepared.ok, true, JSON.stringify(prepared))
    gameSessionCore.commitGameSession(prepared.session)
    gameSessionCore.__testables.enterDayPhase(prepared.session)
    return prepared.session
}

function gameKickPayload(session, hostUuid, targetUuid, overrides = {}) {
    return {
        requestId: nextRequestId(),
        bootEpoch: BOOT,
        roomId: session.roomId,
        roomInstanceId: session.roomInstanceId,
        requesterMembershipId: session.players.get(hostUuid).membershipId,
        targetUuid,
        targetMembershipId: session.players.get(targetUuid).membershipId,
        gameId: session.id,
        ...overrides,
    }
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

function trackDisconnect(socket) {
    const calls = []
    socket.disconnect = (close) => { calls.push(close) }
    return calls
}

function setupSessionAtDayVote({ roomId, gameId, hostUuid, uuids }) {
    const session = commitDeterministicSession({ roomId, gameId, hostUuid, uuids })
    gameSessionCore.enterDayVotePhase(session)

    const sockets = {}
    for (const uuid of uuids) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        sockets[uuid] = socket
    }
    const io = createFakeIo(Object.values(sockets))
    return { session, io, sockets }
}

function castDayVote(io, sockets, uuid, gameId, targetId) {
    return callAsPromise(
        gameSessionSocketLayer.__testables.handleSubmitDayVote,
        io, sockets[uuid], uuid, { gameId, targetId },
    )
}

function castTribunalVote(io, sockets, uuid, session, vote) {
    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleCastTribunalVote(
        io, sockets[uuid], uuid, { gameId: session.id, dayIndex: session.dayIndex, vote }, callback,
    )
    const response = getResponse()
    assert.equal(response.ok, true, JSON.stringify(response))
    return response
}

function deliveredCount(sockets, event) {
    return Object.values(sockets)
        .reduce((total, socket) => total + socket.emitted.filter((e) => e.event === event).length, 0)
}

function clearDelivered(sockets) {
    for (const socket of Object.values(sockets)) socket.emitted.length = 0
}

test('AC-01(대기방): 방장이 아닌 참가자의 추방 요청은 NOT_HOST로 거부되고 서버 상태·방송이 전혀 바뀌지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-1', ['kj-1', 'kj-2'])
    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const forged = roomKickPayload(room, 'kh-1', 'kj-2')
    const { response, calls } = kickRoomPlayer(io, sockets['kj-1'], 'kj-1', forged)

    assert.equal(calls, 1)
    assert.equal(response.ok, false)
    assert.ok([CODES.NOT_HOST, CODES.STALE_MEMBERSHIP].includes(response.code), response.code)
    assert.equal(snapshotRooms(), before)
    assert.equal(io.broadcasts.length, broadcastsBefore)
})

test('AC-01(대기방): 자기 소속으로 정직하게 보낸 비방장 요청도 NOT_HOST다', async () => {
    const { io, sockets, room } = await setupRoom('kh-2', ['kj-3', 'kj-4'])
    const before = snapshotRooms()

    const payload = roomKickPayload(room, 'kh-2', 'kj-4', {
        requesterMembershipId: seatOf(room, 'kj-3').membershipId,
    })
    const { response } = kickRoomPlayer(io, sockets['kj-3'], 'kj-3', payload)

    assert.equal(response.code, CODES.NOT_HOST)
    assert.equal(snapshotRooms(), before)
})

test('AC-01(대기방): canonical 소켓이 교체된 옛 소켓의 방장 요청은 STALE_SOCKET이고 상태가 불변이다', async () => {
    const { io, sockets, room } = await setupRoom('kh-3', ['kj-5'])
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(
        io, sockets['kh-3'], 'kh-3', roomKickPayload(room, 'kh-3', 'kj-5'),
        (uuid) => (uuid === 'kh-3' ? 'sock-new-login' : `sock-${uuid}`),
    )

    assert.equal(response.code, CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)
})

test('AC-01(대기방): 다른 방을 가리키는 요청은 ROOM_NOT_FOUND이고 그 방도 이 방도 바뀌지 않는다', async () => {
    const a = await setupRoom('kh-4', ['kj-6'])
    const b = await setupRoom('kh-5', ['kj-7'])
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(a.io, a.sockets['kh-4'], 'kh-4', {
        requestId: nextRequestId(),
        bootEpoch: b.room.bootEpoch,
        roomId: b.room.roomId,
        roomInstanceId: b.room.roomInstanceId,
        requesterMembershipId: seatOf(a.room, 'kh-4').membershipId,
        targetUuid: 'kj-7',
        targetMembershipId: seatOf(b.room, 'kj-7').membershipId,
    })

    assert.equal(response.code, CODES.ROOM_NOT_FOUND)
    assert.equal(snapshotRooms(), before)
})

test('AC-01(배선): registerMatchmakingHandlers로 실제 배선한 kick_room_player는 직접 호출과 같은 결과를 낸다', async () => {
    const { io, sockets, room } = await setupRoom('kh-6', ['kj-8'])
    matchmaking.registerMatchmakingHandlers(io, sockets['kh-6'], 'kh-6', { getCurrentSocketId: conventionSocketId })

    const { callback, getResponse, getCalls } = countingCallback()
    sockets['kh-6'].trigger(EVENTS.KICK_ROOM_PLAYER, roomKickPayload(room, 'kh-6', 'kj-8'), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, true)
    assert.equal(getResponse().status, 'KICKED')
    const rooms = matchmaking.__getStateSnapshotForTests().gameRooms
    assert.equal(rooms.find(([id]) => id === room.roomId)[1].players.length, 1)
})

test('AC-01(게임): 방장이 아닌 참가자의 진행 중 추방은 NOT_HOST이고 생존·roster가 불변이다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-g1', gameId: 'game-g1', hostUuid: 'g1-a', uuids: ['g1-a', 'g1-b', 'g1-c', 'g1-d'],
    })
    const io = createFakeIo([])

    const honest = kickGamePlayer(io, createFakeSocket('g1-b'), 'g1-b', gameKickPayload(session, 'g1-b', 'g1-c'))
    assert.equal(honest.response.code, CODES.NOT_HOST)

    const forged = kickGamePlayer(io, createFakeSocket('g1-b'), 'g1-b', gameKickPayload(session, 'g1-a', 'g1-c'))
    assert.equal(forged.response.ok, false)
    assert.equal(forged.response.code, CODES.STALE_MEMBERSHIP)

    assert.equal(session.players.get('g1-c').alive, true)
    assert.equal(session.players.size, 4)
    assert.equal(io.broadcasts.length, 0)
})

test('AC-01(게임): 방장 권한은 서버 세션이 승계한 hostUuid 하나로만 판정된다 — 방장이 빠지면 새 방장만 성공한다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-g2', gameId: 'game-g2', hostUuid: 'g2-a', uuids: ['g2-a', 'g2-b', 'g2-c', 'g2-d'],
    })
    const io = createFakeIo([])
    assert.equal(session.hostUuid, 'g2-a')

    handleLeaveGameSession(io, createFakeSocket('g2-a'), 'g2-a', { gameId: session.id }, countingCallback().callback)
    assert.equal(session.hostUuid, 'g2-b')

    const oldHost = kickGamePlayer(io, createFakeSocket('g2-a'), 'g2-a', gameKickPayload(session, 'g2-b', 'g2-c'))
    assert.equal(oldHost.response.ok, false)

    const newHost = kickGamePlayer(io, createFakeSocket('g2-b'), 'g2-b', gameKickPayload(session, 'g2-b', 'g2-c'))
    assert.equal(newHost.response.ok, true)
    assert.equal(gameSessionCore.isParticipatingInSession(session, 'g2-c'), false)
})

test('AC-02: 방장이 추방하면 서버 Map·계정 소속·채널이 함께 정리되고 잔류자의 준비 상태는 보존된다', async () => {
    const { io, sockets, room } = await setupRoom('kh-7', ['kj-9', 'kj-10'], { maxPlayers: 4 })
    await callAsPromise(handleSetReady, io, sockets['kh-7'], 'kh-7', readyPayload(room))
    await callAsPromise(handleSetReady, io, sockets['kj-9'], 'kj-9', readyPayload(room))
    const readyBefore = (await callAsPromise(handleGetCurrentRoom, 'kj-9')).room
    assert.equal(seatOf(readyBefore, 'kj-9').isReady, true)

    const { response } = kickRoomPlayer(io, sockets['kh-7'], 'kh-7', roomKickPayload(room, 'kh-7', 'kj-10'))

    assert.equal(response.ok, true)
    assert.equal(response.status, 'KICKED')
    assert.equal(response.targetUuid, 'kj-10')

    const state = matchmaking.__getStateSnapshotForTests()
    const stored = state.gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.length, 2)
    assert.equal(stored.players.some(([uuid]) => uuid === 'kj-10'), false)
    assert.equal(state.playerRoom.some(([uuid]) => uuid === 'kj-10'), false)
    assert.equal(sockets['kj-10'].rooms.has(room.roomId), false)
    assert.equal(sockets['kj-9'].rooms.has(room.roomId), true)

    const after = (await callAsPromise(handleGetCurrentRoom, 'kj-9')).room
    assert.equal(seatOf(after, 'kj-9').isReady, true)
    assert.equal(seatOf(after, 'kh-7').isReady, true)
    assert.equal(typeof after.canStart, 'boolean')
})

test('AC-02: 추방은 대상에게 room_kicked 개인 사건을, 잔류자에게 player_left_room과 공개 목록 갱신을 전달한다', async () => {
    const { io, sockets, room } = await setupRoom('kh-8', ['kj-11', 'kj-12'])
    const targetSeat = seatOf(room, 'kj-12')
    io.broadcasts.length = 0
    sockets['kj-12'].emitted.length = 0

    kickRoomPlayer(io, sockets['kh-8'], 'kh-8', roomKickPayload(room, 'kh-8', 'kj-12'))

    const kicked = sockets['kj-12'].emitted.filter((e) => e.event === EVENTS.ROOM_KICKED)
    assert.equal(kicked.length, 1)
    assert.equal(kicked[0].payload.roomId, room.roomId)
    assert.equal(kicked[0].payload.roomInstanceId, room.roomInstanceId)
    assert.equal(kicked[0].payload.bootEpoch, BOOT)
    assert.equal(kicked[0].payload.targetUuid, 'kj-12')
    assert.equal(kicked[0].payload.targetMembershipId, targetSeat.membershipId)

    const left = io.broadcasts.filter((b) => b.event === 'player_left_room')
    assert.equal(left.length, 1)
    assert.equal(left[0].payload.uuid, 'kj-12')
    assert.equal(left[0].payload.membershipId, targetSeat.membershipId)
    assert.equal(io.broadcasts.filter((b) => b.event === 'public_rooms_updated').length, 1)
})

test('AC-02: 개인 통지가 throw해도 제거는 한 번 그대로 끝나고 영수증은 성공으로 남는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-9', ['kj-13', 'kj-14'])
    sockets['kj-14'].emitShouldThrowOn = EVENTS.ROOM_KICKED
    const payload = roomKickPayload(room, 'kh-9', 'kj-14')

    const { response } = kickRoomPlayer(io, sockets['kh-9'], 'kh-9', payload)

    assert.equal(response.ok, true)
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.length, 2)
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_left_room').length, 1)

    const looked = getKickResult(io, sockets['kh-9'], 'kh-9', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.ok, true)
    assert.equal(looked.status, 'KICKED')
})

test('AC-02: 방장이 마지막 참가자를 추방해 방이 사라져도 영수증은 남아 원 요청자가 결과를 확인할 수 있다', async () => {
    const { io, sockets, room } = await setupRoom('kh-10', ['kj-15'])
    const payload = roomKickPayload(room, 'kh-10', 'kj-15')

    kickRoomPlayer(io, sockets['kh-10'], 'kh-10', payload)
    matchmaking.__testables.removeFromRoom(io, sockets['kh-10'], 'kh-10')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.length, 0)

    const looked = getKickResult(io, sockets['kh-10'], 'kh-10', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.ok, true)
    assert.equal(looked.status, 'KICKED')
    assert.equal(looked.replayed, true)
})

test('AC-03: 진행 중 생존자 추방은 DISCONNECT 사망 1회와 참여 종료 1회를 만들고 roster·잔류자 세션은 그대로다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g3', gameId: 'game-g3', hostUuid: 'g3-a', uuids: ['g3-a', 'g3-b', 'g3-c', 'g3-d'],
    })
    const io = createFakeIo([])

    const { response } = kickGamePlayer(io, createFakeSocket('g3-a'), 'g3-a', gameKickPayload(session, 'g3-a', 'g3-d'))

    assert.equal(response.ok, true)
    assert.equal(session.players.get('g3-d').alive, false)
    assert.equal(session.players.get('g3-d').deathReason, 'DISCONNECT')
    assert.equal(session.players.get('g3-d').isParticipating, false)
    assert.equal(session.players.size, 4)
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'session_participation_changed').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_ended').length, 0)

    const state = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(state.playerSession.some(([uuid]) => uuid === 'g3-d'), false)
    for (const stayer of ['g3-a', 'g3-b', 'g3-c']) {
        assert.equal(state.playerSession.some(([uuid]) => uuid === stayer), true)
    }
})

test('AC-03(A-06): 이미 사망했지만 참여 중인 대상도 추방할 수 있고, 기존 사망 원인과 사망 사건 수가 보존된다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g4', gameId: 'game-g4', hostUuid: 'g4-a', uuids: ['g4-a', 'g4-b', 'g4-c', 'g4-d'],
    })
    const io = createFakeIo([])
    const victim = session.players.get('g4-d')
    victim.alive = false
    victim.deathReason = 'EXECUTION'

    const { response } = kickGamePlayer(io, createFakeSocket('g4-a'), 'g4-a', gameKickPayload(session, 'g4-a', 'g4-d'))

    assert.equal(response.ok, true)
    assert.equal(victim.deathReason, 'EXECUTION')
    assert.equal(victim.isParticipating, false)
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 0)
    assert.equal(io.broadcasts.filter((b) => b.event === 'session_participation_changed').length, 1)
})

test('AC-03: 추방과 명시적 이탈은 같은 초기 상태에서 **같은** 사망·전적 레코드를 만든다', () => {
    const kicked = commitDeterministicSession({
        roomId: 'room-g5', gameId: 'game-g5', hostUuid: 'g5-a', uuids: ['g5-a', 'g5-b', 'g5-c', 'g5-d'],
    })
    const left = commitDeterministicSession({
        roomId: 'room-g6', gameId: 'game-g6', hostUuid: 'g5-a2', uuids: ['g5-a2', 'g5-b2', 'g5-c2', 'g5-d2'],
    })
    const io = createFakeIo([])

    kickGamePlayer(io, createFakeSocket('g5-a'), 'g5-a', gameKickPayload(kicked, 'g5-a', 'g5-d'))
    handleLeaveGameSession(io, createFakeSocket('g5-d2'), 'g5-d2', { gameId: left.id }, countingCallback().callback)

    const normalize = (session, suffix) => gameSessionCore
        .buildGameResultRecord(session, { completed: false, endedAt: 0 })
        .players
        .map((row) => ({
            user_id: row.user_id.replace(suffix, ''),
            role: row.role,
            team: row.team,
            won: row.won,
            is_alive: row.is_alive,
            death_reason: row.death_reason,
        }))

    assert.deepEqual(normalize(kicked, /$^/), normalize(left, /2$/))
    const row = normalize(kicked, /$^/).find((r) => r.user_id === 'g5-d')
    assert.equal(row.is_alive, false)
    assert.equal(row.death_reason, 'DISCONNECT')
})

test('AC-03: 진행 중 추방 뒤에도 잔류자의 스냅샷에는 사망한 이탈자가 roster에 남고 isParticipating만 false다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g7', gameId: 'game-g7', hostUuid: 'g7-a', uuids: ['g7-a', 'g7-b', 'g7-c', 'g7-d'],
    })
    const io = createFakeIo([])
    kickGamePlayer(io, createFakeSocket('g7-a'), 'g7-a', gameKickPayload(session, 'g7-a', 'g7-d'))

    const stayerSocket = createFakeSocket('g7-b')
    stayerSocket.rooms.add(session.channelId)
    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, stayerSocket, 'g7-b', { gameId: session.id }, callback)
    const snapshot = getResponse()

    assert.equal(snapshot.ok, true)
    assert.equal(snapshot.players.length, 4)
    const departed = snapshot.players.find((p) => p.uuid === 'g7-d')
    assert.equal(departed.isAlive, false)
    assert.equal(departed.isParticipating, false)
    const stayer = snapshot.players.find((p) => p.uuid === 'g7-b')
    assert.equal(stayer.isAlive, true)
    assert.equal(stayer.isParticipating, true)
    assert.equal(snapshot.hostUuid, 'g7-a')
    assert.ok(snapshot.participationRevision >= 1)
})

test('AC-04: 자기 자신을 추방하는 요청은 SELF_KICK이고 상태가 불변이다', async () => {
    const { io, sockets, room } = await setupRoom('kh-11', ['kj-16'])
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(io, sockets['kh-11'], 'kh-11', roomKickPayload(room, 'kh-11', 'kh-11', {
        targetMembershipId: seatOf(room, 'kh-11').membershipId,
    }))

    assert.equal(response.code, CODES.SELF_KICK)
    assert.equal(snapshotRooms(), before)
})

test('AC-04: 이미 나간 대상에 대한 신규 추방은 멱등 성공이 아니라 ALREADY_LEFT 거부다', async () => {
    const { io, sockets, room } = await setupRoom('kh-12', ['kj-17', 'kj-18'])
    matchmaking.__testables.removeFromRoom(io, sockets['kj-18'], 'kj-18')

    const { response } = kickRoomPlayer(io, sockets['kh-12'], 'kh-12', roomKickPayload(room, 'kh-12', 'kj-18'))

    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.ALREADY_LEFT)
})

test('AC-04: 같은 문자열 roomId의 새 방 인스턴스를 가리키는 옛 명령은 ROOM_NOT_FOUND다', async () => {
    const { io, sockets, room } = await setupRoom('kh-13', ['kj-19'])

    const { response } = kickRoomPlayer(io, sockets['kh-13'], 'kh-13', roomKickPayload(room, 'kh-13', 'kj-19', {
        roomInstanceId: 'instance-from-an-older-room',
    }))

    assert.equal(response.code, CODES.ROOM_NOT_FOUND)
    assert.equal(matchmaking.__getStateSnapshotForTests()
        .gameRooms.find(([id]) => id === room.roomId)[1].players.length, 2)
})

test('AC-04: 옛 boot의 명령은 새 상태에 실행되지 않고 STALE_BOOT이며 그 requestId 조회는 UNKNOWN이다', async () => {
    const { io, sockets, room } = await setupRoom('kh-14', ['kj-20'])
    const payload = roomKickPayload(room, 'kh-14', 'kj-20', { bootEpoch: 'boot-from-a-previous-process' })

    const { response } = kickRoomPlayer(io, sockets['kh-14'], 'kh-14', payload)

    assert.equal(response.code, CODES.STALE_BOOT)
    assert.equal(matchmaking.__getStateSnapshotForTests()
        .gameRooms.find(([id]) => id === room.roomId)[1].players.length, 2)

    const looked = getKickResult(io, sockets['kh-14'], 'kh-14', {
        bootEpoch: 'boot-from-a-previous-process', requestId: payload.requestId,
    })
    assert.equal(looked.status, 'UNKNOWN')
})

test('AC-04: 같은 requestId·같은 입력의 재전달은 역사적 결과만 돌려주고 제거·방송을 다시 하지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-15', ['kj-21', 'kj-22'])
    const payload = roomKickPayload(room, 'kh-15', 'kj-22')

    const first = kickRoomPlayer(io, sockets['kh-15'], 'kh-15', payload)
    const stateAfterFirst = snapshotRooms()
    const broadcastsAfterFirst = io.broadcasts.length
    const targetEmitsAfterFirst = sockets['kj-22'].emitted.length

    const second = kickRoomPlayer(io, sockets['kh-15'], 'kh-15', { ...payload })

    assert.equal(first.response.ok, true)
    assert.equal(second.response.ok, true)
    assert.equal(second.response.status, 'KICKED')
    assert.equal(second.response.replayed, true)
    assert.equal(second.response.requestId, payload.requestId)
    assert.equal(snapshotRooms(), stateAfterFirst)
    assert.equal(io.broadcasts.length, broadcastsAfterFirst)
    assert.equal(sockets['kj-22'].emitted.length, targetEmitsAfterFirst)
})

test('AC-04: 같은 requestId로 다른 입력을 보내면 REQUEST_ID_REUSED로 거부되고 아무 것도 실행되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-16', ['kj-23', 'kj-24'])
    const payload = roomKickPayload(room, 'kh-16', 'kj-23')
    kickRoomPlayer(io, sockets['kh-16'], 'kh-16', payload)
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(io, sockets['kh-16'], 'kh-16', {
        ...payload,
        targetUuid: 'kj-24',
        targetMembershipId: seatOf(room, 'kj-24').membershipId,
    })

    assert.equal(response.code, CODES.REQUEST_ID_REUSED)
    assert.equal(snapshotRooms(), before)
})

test('AC-04: 이미 제거된 소속을 **새 requestId**로 다시 추방하면 거부된다', async () => {
    const { io, sockets, room } = await setupRoom('kh-17', ['kj-25', 'kj-26'])
    kickRoomPlayer(io, sockets['kh-17'], 'kh-17', roomKickPayload(room, 'kh-17', 'kj-26'))
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(io, sockets['kh-17'], 'kh-17', roomKickPayload(room, 'kh-17', 'kj-26'))

    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.ALREADY_LEFT)
    assert.equal(snapshotRooms(), before)
})

test('AC-04: 확인하는 사이 대상이 나갔다 다시 들어오면 옛 확인으로 새 소속을 추방하지 않는다(STALE_MEMBERSHIP)', async () => {
    const { io, sockets, room } = await setupRoom('kh-18', ['kj-27'], { maxPlayers: 4 })
    const stalePayload = roomKickPayload(room, 'kh-18', 'kj-27')

    matchmaking.__testables.removeFromRoom(io, sockets['kj-27'], 'kj-27')
    const rejoinSocket = createFakeSocket('kj-27', { id: 'sock-kj-27-again' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await handleJoinRoomByCode(io, rejoinSocket, 'kj-27', room.roomCode)

    const { response } = kickRoomPlayer(io, sockets['kh-18'], 'kh-18', stalePayload)

    assert.equal(response.code, CODES.STALE_MEMBERSHIP)
    const current = (await callAsPromise(handleGetCurrentRoom, 'kh-18')).room
    assert.equal(seatOf(current, 'kj-27') !== undefined, true)
    assert.notEqual(seatOf(current, 'kj-27').membershipId, stalePayload.targetMembershipId)
})

test('AC-04(조회): 결과는 **원 요청자 본인의 현재 소켓**에만 돌려준다 — 다른 계정은 UNKNOWN, 옛 소켓은 STALE_SOCKET', async () => {
    const { io, sockets, room } = await setupRoom('kh-19', ['kj-28', 'kj-29'])
    const payload = roomKickPayload(room, 'kh-19', 'kj-29')
    kickRoomPlayer(io, sockets['kh-19'], 'kh-19', payload)

    const other = getKickResult(io, sockets['kj-28'], 'kj-28', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(other.status, 'UNKNOWN')

    gameSessionSocketLayer.setOnlineUsersRegistry(new Map([['kh-19', 'sock-new-login']]))
    const stale = getKickResult(io, sockets['kh-19'], 'kh-19', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(stale.ok, false)
    assert.equal(stale.code, CODES.STALE_SOCKET)
})

test('AC-04(조회): 알 수 없는 키·형태 오류를 성공이나 미실행으로 단정하지 않는다', async () => {
    const { io, sockets } = await setupRoom('kh-20', ['kj-30'])

    const unknown = getKickResult(io, sockets['kh-20'], 'kh-20', { bootEpoch: BOOT, requestId: 'never-sent' })
    assert.deepEqual(unknown, { ok: true, status: 'UNKNOWN', bootEpoch: BOOT, requestId: 'never-sent' })

    for (const bad of [null, 'x', 42, [], {}, { bootEpoch: BOOT }, { requestId: 'r' }, { bootEpoch: BOOT, requestId: 'r', extra: 'x' }]) {
        const res = getKickResult(io, sockets['kh-20'], 'kh-20', bad)
        assert.equal(res.ok, false, JSON.stringify(bad))
        assert.equal(res.code, CODES.INVALID_REQUEST)
    }
})

test('AC-04(A-08): 기한 안의 결정은 재조회할 수 있고, 기한을 넘긴 기록은 UNKNOWN이 된다', async () => {
    const { io, sockets } = await setupRoom('kh-21', ['kj-31'])
    const key = kickReceiptStore.kickReceiptKey(BOOT, 'kh-21', 'ttl-req')
    const result = { ok: true, status: 'KICKED', requestId: 'ttl-req' }

    kickReceiptStore.__seedKickReceiptForTests(key, {
        command: 'ROOM', fingerprint: 'fp', result,
        decidedAt: Date.now(), expiresAt: Date.now() + 1_000,
    })
    assert.equal(getKickResult(io, sockets['kh-21'], 'kh-21', { bootEpoch: BOOT, requestId: 'ttl-req' }).status, 'KICKED')

    kickReceiptStore.__seedKickReceiptForTests(key, {
        command: 'ROOM', fingerprint: 'fp', result,
        decidedAt: Date.now() - kickReceiptStore.KICK_RECEIPT_TTL_MS - 1, expiresAt: Date.now() - 1,
    })
    assert.equal(getKickResult(io, sockets['kh-21'], 'kh-21', { bootEpoch: BOOT, requestId: 'ttl-req' }).status, 'UNKNOWN')
})

test('AC-04(A-08): 유효 영수증이 상한에 차면 기존 기록을 축출하지 않고 새 추방을 거부한다(상태 변경 전에)', async () => {
    const { io, sockets, room } = await setupRoom('kh-22', ['kj-32'])

    const expiresAt = Date.now() + kickReceiptStore.KICK_RECEIPT_TTL_MS
    for (let i = 0; i < kickReceiptStore.KICK_RECEIPT_MAX_ENTRIES; i += 1) {
        kickReceiptStore.__seedKickReceiptForTests(
            kickReceiptStore.kickReceiptKey(BOOT, 'someone-else', `cap-${i}`),
            { command: 'ROOM', fingerprint: `fp-${i}`, result: { ok: true }, decidedAt: Date.now(), expiresAt },
        )
    }
    const before = snapshotRooms()

    const { response } = kickRoomPlayer(io, sockets['kh-22'], 'kh-22', roomKickPayload(room, 'kh-22', 'kj-32'))

    assert.equal(response.code, CODES.RECEIPT_CAPACITY)
    assert.equal(snapshotRooms(), before)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), kickReceiptStore.KICK_RECEIPT_MAX_ENTRIES)
})

test('AC-04(형태): 허용 목록 밖의 키·비문자열·빈 문자열 payload는 INVALID_REQUEST이고 아무 것도 실행하지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-23', ['kj-33'])
    const before = snapshotRooms()
    const valid = roomKickPayload(room, 'kh-23', 'kj-33')

    const badPayloads = [
        null, 'x', 42, [],
        { ...valid, extraKey: 'nope' },
        { ...valid, targetUuid: 123 },
        { ...valid, requestId: '' },
        { ...valid, roomInstanceId: '   ' },
        { ...valid, gameId: 'game-not-allowed-here' },
        (() => { const p = { ...valid }; delete p.targetMembershipId; return p })(),
    ]
    for (const payload of badPayloads) {
        const { response } = kickRoomPlayer(io, sockets['kh-23'], 'kh-23', payload)
        assert.equal(response.code, CODES.INVALID_REQUEST, JSON.stringify(payload))
    }
    assert.equal(snapshotRooms(), before)
})

test('AC-04(게임): 종료된 세션과 이미 빠진 대상에 대한 신규 추방은 거부된다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g8', gameId: 'game-g8', hostUuid: 'g8-a', uuids: ['g8-a', 'g8-b', 'g8-c', 'g8-d'],
    })
    const io = createFakeIo([])

    kickGamePlayer(io, createFakeSocket('g8-a'), 'g8-a', gameKickPayload(session, 'g8-a', 'g8-d'))
    const again = kickGamePlayer(io, createFakeSocket('g8-a'), 'g8-a', gameKickPayload(session, 'g8-a', 'g8-d'))
    assert.equal(again.response.code, CODES.ALREADY_LEFT)

    session.phase = 'ENDED'
    const ended = kickGamePlayer(io, createFakeSocket('g8-a'), 'g8-a', gameKickPayload(session, 'g8-a', 'g8-c'))
    assert.equal(ended.response.code, CODES.GAME_ALREADY_ENDED)
    assert.equal(session.players.get('g8-c').alive, true)
})

test('AC-05(대기방): 추방 뒤 도착한 대상의 자발적 이탈은 두 번째 제거·방송을 만들지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-24', ['kj-34', 'kj-35'])
    kickRoomPlayer(io, sockets['kh-24'], 'kh-24', roomKickPayload(room, 'kh-24', 'kj-35'))
    const leftBefore = io.broadcasts.filter((b) => b.event === 'player_left_room').length

    matchmaking.__testables.removeFromRoom(io, sockets['kj-35'], 'kj-35')

    assert.equal(io.broadcasts.filter((b) => b.event === 'player_left_room').length, leftBefore)
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.length, 2)
})

test('AC-05(게임): 추방과 명시적 이탈이 겹쳐도 사망·참여 종료는 각각 정확히 한 번이다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g9', gameId: 'game-g9', hostUuid: 'g9-a', uuids: ['g9-a', 'g9-b', 'g9-c', 'g9-d'],
    })
    const io = createFakeIo([])

    kickGamePlayer(io, createFakeSocket('g9-a'), 'g9-a', gameKickPayload(session, 'g9-a', 'g9-d'))
    const { callback, getResponse } = countingCallback()
    handleLeaveGameSession(io, createFakeSocket('g9-d'), 'g9-d', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'session_participation_changed').length, 1)
})

test('AC-05(게임): 대상이 먼저 나간 뒤 도착한 추방은 ALREADY_LEFT이고 새 사망을 만들지 않는다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g10', gameId: 'game-g10', hostUuid: 'g10-a', uuids: ['g10-a', 'g10-b', 'g10-c', 'g10-d'],
    })
    const io = createFakeIo([])
    const payload = gameKickPayload(session, 'g10-a', 'g10-d')

    handleLeaveGameSession(io, createFakeSocket('g10-d'), 'g10-d', { gameId: session.id }, countingCallback().callback)
    const { response } = kickGamePlayer(io, createFakeSocket('g10-a'), 'g10-a', payload)

    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.ALREADY_LEFT)
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 1)
})

test('AC-05: 시작 외형 조회 중 추방이 끼어들면 그 시작 요청은 ROOM_STATE_CHANGED로 실패한다', async () => {
    let releaseLoadouts
    const blocked = new Promise((resolve) => { releaseLoadouts = resolve })
    let entered
    const enteredPromise = new Promise((resolve) => { entered = resolve })
    matchmaking.__setEconomyServiceForTests({
        getPublicProfileLoadouts: async (userIds) =>
            Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
        getGameStartLoadouts: async (userIds) => {
            entered()
            await blocked
            return Object.fromEntries(userIds.map((id) => [id, {
                profilePhotoId: null, profileBorderId: null, cardFrameId: null,
                skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
            }]))
        },
        getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
    })

    const { io, sockets, room } = await setupRoom('kh-25', ['kj-36', 'kj-37'], { maxPlayers: 4 })
    for (const uuid of ['kh-25', 'kj-36', 'kj-37']) {
        await callAsPromise(handleSetReady, io, sockets[uuid], uuid, readyPayload(room))
    }

    const { callback, getResponse } = countingCallback()
    const starting = handleStartGame(io, sockets['kh-25'], 'kh-25', startPayload(room), callback, conventionSocketId)
    await enteredPromise

    const kicked = kickRoomPlayer(io, sockets['kh-25'], 'kh-25', roomKickPayload(room, 'kh-25', 'kj-37'))
    assert.equal(kicked.response.ok, true)

    releaseLoadouts()
    await starting

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('AC-06(대기방): 추방은 영구 차단이 아니다 — 같은 방에 다시 들어올 수 있고 새 소속·미준비로 시작한다', async () => {
    const { io, sockets, room } = await setupRoom('kh-26', ['kj-38'], { maxPlayers: 4 })
    await callAsPromise(handleSetReady, io, sockets['kj-38'], 'kj-38', readyPayload(room))
    const oldMembershipId = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-38')).room, 'kj-38').membershipId

    kickRoomPlayer(io, sockets['kh-26'], 'kh-26', roomKickPayload(room, 'kh-26', 'kj-38'))

    const rejoinSocket = createFakeSocket('kj-38', { id: 'sock-kj-38-again' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await handleJoinRoomByCode(io, rejoinSocket, 'kj-38', room.roomCode)

    const seat = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-38')).room, 'kj-38')
    assert.notEqual(seat, undefined)
    assert.notEqual(seat.membershipId, oldMembershipId)
    assert.equal(seat.isReady, false)
})

test('AC-06(대기방): 단순 재조회(재연결)는 새 소속 식별자를 발급하지 않는다', async () => {
    const { room } = await setupRoom('kh-27', ['kj-39'])
    const first = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-39')).room, 'kj-39').membershipId
    const second = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-39')).room, 'kj-39').membershipId
    assert.equal(first, second)
    assert.equal(first, seatOf(room, 'kj-39').membershipId)
})

test('AC-06(대기방): 추방된 대상이 다시 들어온 뒤 도착한 옛 사건은 새 소속을 제거하지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-28', ['kj-40'], { maxPlayers: 4 })
    const staleKick = roomKickPayload(room, 'kh-28', 'kj-40')
    kickRoomPlayer(io, sockets['kh-28'], 'kh-28', staleKick)

    const rejoinSocket = createFakeSocket('kj-40', { id: 'sock-kj-40-again' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await handleJoinRoomByCode(io, rejoinSocket, 'kj-40', room.roomCode)
    const newSeat = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-40')).room, 'kj-40')

    const replay = kickRoomPlayer(io, sockets['kh-28'], 'kh-28', { ...staleKick })
    assert.equal(replay.response.replayed, true)

    const still = seatOf((await callAsPromise(handleGetCurrentRoom, 'kj-40')).room, 'kj-40')
    assert.equal(still.membershipId, newSeat.membershipId)
    assert.equal(rejoinSocket.rooms.has(room.roomId), true)
})

test('AC-06(게임): 진행 중 추방된 대상의 같은 gameId 복귀는 거부되고 비밀이 하나도 실리지 않는다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-g11', gameId: 'game-g11', hostUuid: 'g11-a', uuids: ['g11-a', 'g11-b', 'g11-c', 'g11-d'],
    })
    const io = createFakeIo([])
    kickGamePlayer(io, createFakeSocket('g11-a'), 'g11-a', gameKickPayload(session, 'g11-a', 'g11-d'))

    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, 'g11-d'), true)

    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, createFakeSocket('g11-d'), 'g11-d', { gameId: session.id }, callback)
    const denied = getResponse()

    assert.equal(denied.ok, false)
    const serialized = JSON.stringify(denied)
    for (const secret of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'role', 'team', 'allies']) {
        assert.equal(serialized.includes(secret), false, `${secret}가 거부 응답에 실렸다`)
    }
})

test('AC-06(게임): 추방된 계정은 다른 새 게임에는 참여할 수 있고, 옛 게임 정리가 그 새 소속을 지우지 않는다', () => {
    const oldSession = commitDeterministicSession({
        roomId: 'room-g12', gameId: 'game-g12', hostUuid: 'g12-a', uuids: ['g12-a', 'g12-b', 'g12-c', 'g12-d'],
    })
    const io = createFakeIo([])
    kickGamePlayer(io, createFakeSocket('g12-a'), 'g12-a', gameKickPayload(oldSession, 'g12-a', 'g12-d'))
    assert.equal(gameSessionCore.__getStateSnapshotForTests().playerSession.some(([u]) => u === 'g12-d'), false)

    const newSession = commitDeterministicSession({
        roomId: 'room-g13', gameId: 'game-g13', hostUuid: 'g12-d', uuids: ['g12-d', 'g13-b', 'g13-c', 'g13-d'],
    })
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().playerSession.find(([u]) => u === 'g12-d')[1],
        newSession.id,
    )

    gameSessionCore.endGameSessionForPlayer('g12-a', 'PLAYER_LEFT', oldSession.id)
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().playerSession.find(([u]) => u === 'g12-d')[1],
        newSession.id,
    )
})

test('AC-05: 재동기화의 join이 끝나기 전에 추방이 확정되면 그 채널 가입은 되돌려진다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs1', gameId: 'game-rs1', hostUuid: 'rs1-a', uuids: ['rs1-a', 'rs1-b', 'rs1-c', 'rs1-d'],
    })

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const targetSocket = createFakeSocket('rs1-d', { joinGate })
    const io = createFakeIo([targetSocket])
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(targetSocket, 'rs1-d')
    await targetSocket.joinCalled

    const kicked = kickGamePlayer(io, createFakeSocket('rs1-a'), 'rs1-a', gameKickPayload(session, 'rs1-a', 'rs1-d'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    releaseJoin()
    await resyncing

    assert.equal(targetSocket.rooms.has(session.channelId), false, '배제된 계정이 경기 채널에 남았다')
    assert.ok(targetSocket.left.includes(session.channelId))
    assert.equal(targetSocket.data.activeGameId ?? null, null)
})

test('AC-05: 그 사이 아무 일도 없었다면 재동기화는 채널 가입을 그대로 유지한다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs2', gameId: 'game-rs2', hostUuid: 'rs2-a', uuids: ['rs2-a', 'rs2-b', 'rs2-c', 'rs2-d'],
    })

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const socket = createFakeSocket('rs2-d', { joinGate })
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(socket, 'rs2-d')
    await socket.joinCalled
    releaseJoin()
    await resyncing

    assert.equal(socket.rooms.has(session.channelId), true)
    assert.deepEqual(socket.left, [])
    assert.equal(socket.data.activeGameId, session.id)
})

test('AC-05: join 완료 전에 canonical 소켓이 교체되면 남이 된 연결의 가입은 되돌려진다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs3', gameId: 'game-rs3', hostUuid: 'rs3-a', uuids: ['rs3-a', 'rs3-b', 'rs3-c', 'rs3-d'],
    })

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const oldSocket = createFakeSocket('rs3-d', { joinGate })
    const io = createFakeIo([oldSocket])
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(oldSocket, 'rs3-d')
    await oldSocket.joinCalled

    const newSocket = createFakeSocket('rs3-d', { id: 'sock-rs3-d-new' })
    io.sockets.sockets.set(newSocket.id, newSocket)
    gameSessionSocketLayer.setOnlineUsersRegistry(new Map([['rs3-d', newSocket.id]]))

    releaseJoin()
    await resyncing

    assert.equal(oldSocket.rooms.has(session.channelId), false, '남이 된 연결이 경기 채널에 남았다')
    assert.deepEqual(oldSocket.left, [session.channelId])
})

test('AC-06: 이미 배제된 계정의 재접속은 채널 가입 자체를 시작하지 않는다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs4', gameId: 'game-rs4', hostUuid: 'rs4-a', uuids: ['rs4-a', 'rs4-b', 'rs4-c', 'rs4-d'],
    })
    const io = createFakeIo([])
    kickGamePlayer(io, createFakeSocket('rs4-a'), 'rs4-a', gameKickPayload(session, 'rs4-a', 'rs4-d'))

    const socket = createFakeSocket('rs4-d')
    await gameSessionSocketLayer.resyncSessionRouting(socket, 'rs4-d')

    assert.deepEqual(socket.joined, [])
    assert.deepEqual(socket.left, [])
    assert.equal(socket.data.activeGameId ?? null, null)
    assert.equal(session.phase !== 'ENDED', true)
})

test('AC-06: 무효 가입을 되돌리는 leave가 **비동기로 거부**되면 그 연결을 끊는다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs5', gameId: 'game-rs5', hostUuid: 'rs5-a', uuids: ['rs5-a', 'rs5-b', 'rs5-c', 'rs5-d'],
    })

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const targetSocket = createFakeSocket('rs5-d', { joinGate })
    targetSocket.leave = async () => { throw new Error('leave 실패(테스트 주입)') }
    const disconnects = trackDisconnect(targetSocket)

    const io = createFakeIo([targetSocket])
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(targetSocket, 'rs5-d')
    await targetSocket.joinCalled

    kickGamePlayer(io, createFakeSocket('rs5-a'), 'rs5-a', gameKickPayload(session, 'rs5-a', 'rs5-d'))

    releaseJoin()
    await resyncing
    await flushMicrotasks()

    assert.ok(disconnects.length >= 1, '비동기 leave 거부 뒤 연결이 끊기지 않았다')
    assert.ok(disconnects.every((close) => close === true))
})

test('AC-04: NOT_HOST로 거부된 요청은 그 뒤 방장이 되어 같은 ID로 다시 보내도 실행되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('rk-1', ['rk-2', 'rk-3'])

    const payload = roomKickPayload(room, 'rk-1', 'rk-3', {
        requesterMembershipId: seatOf(room, 'rk-2').membershipId,
    })
    const first = kickRoomPlayer(io, sockets['rk-2'], 'rk-2', payload)
    assert.equal(first.response.code, CODES.NOT_HOST)

    matchmaking.__testables.removeFromRoom(io, sockets['rk-1'], 'rk-1')
    const afterHostChange = (await callAsPromise(handleGetCurrentRoom, 'rk-2')).room
    assert.equal(afterHostChange.hostUuid, 'rk-2', '방장 승계가 일어나야 이 시험이 의미를 갖는다')

    const replay = kickRoomPlayer(io, sockets['rk-2'], 'rk-2', payload)
    assert.equal(replay.response.ok, false)
    assert.equal(replay.response.code, CODES.NOT_HOST)
    assert.equal(replay.response.replayed, true, '역사적 결정이 아니라 현재 상태로 다시 판정됐다')

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.some(([uuid]) => uuid === 'rk-3'), true)

    const looked = getKickResult(io, sockets['rk-2'], 'rk-2', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.ok, false)
    assert.equal(looked.code, CODES.NOT_HOST)
})

test('AC-04: 본인 추방·이미 나간 대상의 거부도 같은 ID로는 다시 판정되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('rk-4', ['rk-5'])

    const selfPayload = roomKickPayload(room, 'rk-4', 'rk-5', {
        targetUuid: 'rk-4',
        targetMembershipId: seatOf(room, 'rk-4').membershipId,
    })
    assert.equal(kickRoomPlayer(io, sockets['rk-4'], 'rk-4', selfPayload).response.code, CODES.SELF_KICK)
    const replayed = kickRoomPlayer(io, sockets['rk-4'], 'rk-4', selfPayload).response
    assert.equal(replayed.code, CODES.SELF_KICK)
    assert.equal(replayed.replayed, true)

    const gonePayload = roomKickPayload(room, 'rk-4', 'rk-5')
    matchmaking.__testables.removeFromRoom(io, sockets['rk-5'], 'rk-5')
    assert.equal(kickRoomPlayer(io, sockets['rk-4'], 'rk-4', gonePayload).response.code, CODES.ALREADY_LEFT)
    const goneReplay = kickRoomPlayer(io, sockets['rk-4'], 'rk-4', gonePayload).response
    assert.equal(goneReplay.code, CODES.ALREADY_LEFT)
    assert.equal(goneReplay.replayed, true)
})

function seedForeignReceipts(count, prefix) {
    const now = Date.now()
    const expiresAt = now + kickReceiptStore.KICK_RECEIPT_TTL_MS
    for (let index = 0; index < count; index += 1) {
        kickReceiptStore.__seedKickReceiptForTests(
            kickReceiptStore.kickReceiptKey(BOOT, 'someone-else', `${prefix}-${index}`),
            {
                command: 'ROOM',
                fingerprint: `fp-${prefix}-${index}`,
                result: { ok: true, status: 'KICKED' },
                decidedAt: now,
                expiresAt,
            },
        )
    }
}

function snapshotSession(session) {
    return JSON.stringify({
        phase: session.phase,
        hostUuid: session.hostUuid,
        dayIndex: session.dayIndex,
        participationRevision: session.participationRevision ?? 0,
        players: [...session.players.values()].map((player) => ({
            uuid: player.uuid,
            alive: player.alive,
            deathReason: player.deathReason ?? null,
            isParticipating: player.isParticipating !== false,
            membershipId: player.membershipId ?? null,
        })),
    })
}

const REJECTION_LIMIT = kickReceiptStore.KICK_REJECTION_RECEIPT_MAX_ENTRIES

test('AC-04(대기방·마지막 거부 자리): 기록된 NOT_HOST는 방장 승계 뒤에도 그대로이고 아무 것도 실행되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('rk-8', ['rk-9', 'rk-10'])
    seedForeignReceipts(REJECTION_LIMIT - 1, 'sat-room')

    const payload = roomKickPayload(room, 'rk-8', 'rk-10', {
        requesterMembershipId: seatOf(room, 'rk-9').membershipId,
    })
    const first = kickRoomPlayer(io, sockets['rk-9'], 'rk-9', payload)
    assert.equal(first.response.code, CODES.NOT_HOST)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT, '거부가 기록되지 않았다')

    matchmaking.__testables.removeFromRoom(io, sockets['rk-8'], 'rk-8')
    assert.equal((await callAsPromise(handleGetCurrentRoom, 'rk-9')).room.hostUuid, 'rk-9')

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length
    const replay = kickRoomPlayer(io, sockets['rk-9'], 'rk-9', payload)

    assert.equal(replay.response.ok, false)
    assert.equal(replay.response.code, CODES.NOT_HOST, '포화 근처의 거부가 승계 뒤에 실행됐다')
    assert.equal(replay.response.replayed, true)
    assert.equal(snapshotRooms(), before)
    assert.equal(io.broadcasts.length, broadcastsBefore)
    const looked = getKickResult(io, sockets['rk-9'], 'rk-9', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.code, CODES.NOT_HOST)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT)
})

test('AC-04(대기방·포화): 거부를 보존할 수 없으면 확정 거부 대신 **미결정**으로 답한다', async () => {
    const { io, sockets, room } = await setupRoom('rk-11', ['rk-12', 'rk-13'])
    seedForeignReceipts(REJECTION_LIMIT, 'full-room')
    const before = snapshotRooms()

    const payload = roomKickPayload(room, 'rk-11', 'rk-13', {
        requesterMembershipId: seatOf(room, 'rk-12').membershipId,
    })
    const { response } = kickRoomPlayer(io, sockets['rk-12'], 'rk-12', payload)

    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.RECEIPT_CAPACITY, '보존되지 않는 확정 거부를 돌려줬다')
    assert.equal(snapshotRooms(), before)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT)
    const looked = getKickResult(io, sockets['rk-12'], 'rk-12', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.status, 'UNKNOWN', '미결정인데 결과가 확정된 것처럼 보인다')
})

test('AC-04(게임·마지막 거부 자리): 기록된 NOT_HOST는 방장 승계 뒤에도 그대로이고 판은 그대로다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-gr1', gameId: 'game-gr1', hostUuid: 'gr1-a', uuids: ['gr1-a', 'gr1-b', 'gr1-c', 'gr1-d'],
    })
    const io = createFakeIo([])
    seedForeignReceipts(REJECTION_LIMIT - 1, 'sat-game')

    const payload = gameKickPayload(session, 'gr1-b', 'gr1-d')
    const first = kickGamePlayer(io, createFakeSocket('gr1-b'), 'gr1-b', payload)
    assert.equal(first.response.code, CODES.NOT_HOST)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT, '거부가 기록되지 않았다')

    handleLeaveGameSession(io, createFakeSocket('gr1-a'), 'gr1-a', { gameId: session.id }, countingCallback().callback)
    assert.equal(session.hostUuid, 'gr1-b')

    const before = snapshotSession(session)
    const broadcastsBefore = io.broadcasts.length
    const replay = kickGamePlayer(io, createFakeSocket('gr1-b'), 'gr1-b', payload)

    assert.equal(replay.response.ok, false)
    assert.equal(replay.response.code, CODES.NOT_HOST, '포화 근처의 거부가 승계 뒤에 실행됐다')
    assert.equal(replay.response.replayed, true)
    assert.equal(snapshotSession(session), before)
    assert.equal(io.broadcasts.length, broadcastsBefore)
    assert.equal(gameSessionCore.isParticipatingInSession(session, 'gr1-d'), true)

    const looked = getKickResult(io, createFakeSocket('gr1-b'), 'gr1-b', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.code, CODES.NOT_HOST)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT)
})

test('AC-04(게임·포화): 거부를 보존할 수 없으면 확정 거부 대신 **미결정**으로 답하고 판은 그대로다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-gr2', gameId: 'game-gr2', hostUuid: 'gr2-a', uuids: ['gr2-a', 'gr2-b', 'gr2-c', 'gr2-d'],
    })
    const io = createFakeIo([])
    seedForeignReceipts(REJECTION_LIMIT, 'full-game')
    const before = snapshotSession(session)

    const payload = gameKickPayload(session, 'gr2-b', 'gr2-d')
    const { response } = kickGamePlayer(io, createFakeSocket('gr2-b'), 'gr2-b', payload)

    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.RECEIPT_CAPACITY, '보존되지 않는 확정 거부를 돌려줬다')
    assert.equal(snapshotSession(session), before)
    assert.equal(io.broadcasts.length, 0)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT)
    const looked = getKickResult(io, createFakeSocket('gr2-b'), 'gr2-b', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.status, 'UNKNOWN')
})

test('AC-04(A-08): 거부 기록은 커밋 자리를 잠식하지 않는다 — 수위를 넘어도 실제 추방은 그대로 성공한다', async () => {
    const { io, sockets, room } = await setupRoom('rk-6', ['rk-7'])

    let decided = 0
    let firstDecidedRequestId = null
    for (let index = 0; index < REJECTION_LIMIT + 50; index += 1) {
        const selfPayload = roomKickPayload(room, 'rk-6', 'rk-7', {
            targetUuid: 'rk-6',
            targetMembershipId: seatOf(room, 'rk-6').membershipId,
        })
        const { response } = kickRoomPlayer(io, sockets['rk-6'], 'rk-6', selfPayload)
        assert.equal(response.ok, false)
        if (response.code === CODES.SELF_KICK) {
            decided += 1
            if (firstDecidedRequestId === null) firstDecidedRequestId = selfPayload.requestId
        } else {
            assert.equal(response.code, CODES.RECEIPT_CAPACITY)
        }
    }
    assert.equal(decided, REJECTION_LIMIT, '거부가 수위를 넘겨 기록됐거나 모자라게 기록됐다')
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT)
    assert.equal(
        getKickResult(io, sockets['rk-6'], 'rk-6', { bootEpoch: BOOT, requestId: firstDecidedRequestId }).code,
        CODES.SELF_KICK,
    )

    const { response } = kickRoomPlayer(io, sockets['rk-6'], 'rk-6', roomKickPayload(room, 'rk-6', 'rk-7'))
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(response.status, 'KICKED')
})

test('AC-04(게임): 진행 중 추방의 영수증은 **어떤 방송보다 먼저** 확정된다', () => {
    const session = commitDeterministicSession({
        roomId: 'room-rc1', gameId: 'game-rc1', hostUuid: 'rc1-a', uuids: ['rc1-a', 'rc1-b', 'rc1-c', 'rc1-d'],
    })
    const payload = gameKickPayload(session, 'rc1-a', 'rc1-d')
    const receiptKey = kickReceiptStore.kickReceiptKey(BOOT, 'rc1-a', payload.requestId)

    const observed = []
    const io = {
        sockets: { sockets: new Map() },
        broadcasts: [],
        to() {
            return {
                emit(event) {
                    observed.push({ event, hadReceipt: kickReceiptStore.lookupKickReceipt(receiptKey) !== null })
                },
            }
        },
    }

    const { response } = kickGamePlayer(io, createFakeSocket('rc1-a'), 'rc1-a', payload)

    assert.equal(response.ok, true)
    assert.ok(observed.length >= 2, '사망·참여 변화 방송이 실제로 일어나야 한다')
    for (const entry of observed) {
        assert.equal(entry.hadReceipt, true, `${entry.event} 방송 시점에 영수증이 아직 없었다`)
    }
})

test('AC-05(게임): 추방 대상의 채널 leave가 비동기로 거부되면 그 연결을 끊는다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rc2', gameId: 'game-rc2', hostUuid: 'rc2-a', uuids: ['rc2-a', 'rc2-b', 'rc2-c', 'rc2-d'],
    })
    const targetSocket = createFakeSocket('rc2-d')
    targetSocket.leave = async () => { throw new Error('leave 실패(테스트 주입)') }
    const disconnects = trackDisconnect(targetSocket)
    const io = createFakeIo([targetSocket])

    const { response } = kickGamePlayer(io, createFakeSocket('rc2-a'), 'rc2-a', gameKickPayload(session, 'rc2-a', 'rc2-d'))
    await flushMicrotasks()

    assert.equal(response.ok, true)
    assert.equal(session.players.get('rc2-d').isParticipating, false)
    assert.deepEqual(disconnects, [true])
})

function deferred() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

test('AC-05(게임): 추방된 대상이 **새 대기방**을 가진 뒤 도착한 옛 채널 정리 실패는 그 연결을 끊지 않는다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-own1', gameId: 'game-own1', hostUuid: 'own1-a', uuids: ['own1-a', 'own1-b', 'own1-c', 'own1-d'],
    })
    const targetSocket = createFakeSocket('own1-d')
    const gate = deferred()
    targetSocket.leave = () => gate.promise
    const disconnects = trackDisconnect(targetSocket)
    const io = createFakeIo([targetSocket])

    const kicked = kickGamePlayer(io, createFakeSocket('own1-a'), 'own1-a', gameKickPayload(session, 'own1-a', 'own1-d'))
    assert.equal(kicked.response.ok, true)

    const created = await callAsPromise(
        handleCreateRoom, io, targetSocket, 'own1-d', validSettingsPayload({ maxPlayers: 8, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    gate.reject(new Error('leave 실패(테스트 주입)'))
    await flushMicrotasks()

    assert.deepEqual(disconnects, [], '옛 이탈의 늦은 거부가 새 소속의 연결을 끊었다')
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.find(([u]) => u === 'own1-d')?.[1], created.room.roomId)
})

test('AC-06(대기방): 옛 이탈의 leave가 **늦게 끝나며** 새 소속의 채널까지 떼면 그 가입을 되돌린다', async () => {
    const { io, sockets, room } = await setupRoom('own2-h', ['own2-t'])
    const targetSocket = sockets['own2-t']
    const gate = deferred()
    targetSocket.leave = (channelId) => gate.promise.then(() => { targetSocket.rooms.delete(channelId) })
    const disconnects = trackDisconnect(targetSocket)

    const kicked = kickRoomPlayer(io, sockets['own2-h'], 'own2-h', roomKickPayload(room, 'own2-h', 'own2-t'))
    assert.equal(kicked.response.ok, true)
    assert.equal(targetSocket.rooms.has(room.roomId), true, '아직 이탈이 끝나지 않았다')

    await handleJoinRoomByCode(io, targetSocket, 'own2-t', room.roomCode)
    const reseated = (await callAsPromise(handleGetCurrentRoom, 'own2-t')).room
    assert.equal(reseated.roomId, room.roomId)
    assert.notEqual(seatOf(reseated, 'own2-t').membershipId, seatOf(room, 'own2-t').membershipId)

    gate.resolve()
    await flushMicrotasks()

    assert.deepEqual(disconnects, [])
    assert.equal(targetSocket.rooms.has(room.roomId), true, '옛 이탈의 늦은 완료가 새 소속의 채널을 떼어 갔다')
})

test('AC-06(대기방): 같은 방에 다시 앉은 뒤 도착한 옛 이탈의 **거부**도 그 연결을 끊지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('own3-h', ['own3-t'])
    const targetSocket = sockets['own3-t']
    const gate = deferred()
    targetSocket.leave = () => gate.promise
    const disconnects = trackDisconnect(targetSocket)

    kickRoomPlayer(io, sockets['own3-h'], 'own3-h', roomKickPayload(room, 'own3-h', 'own3-t'))
    await handleJoinRoomByCode(io, targetSocket, 'own3-t', room.roomCode)

    gate.reject(new Error('leave 실패(테스트 주입)'))
    await flushMicrotasks()

    assert.deepEqual(disconnects, [], '늦은 거부가 새 소속의 연결을 끊었다')
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.find(([u]) => u === 'own3-t')?.[1], room.roomId)
    assert.equal(targetSocket.rooms.has(room.roomId), true)
})

test('AC-03: roster 첫 참가자가 바로 그 이탈자여도 이탈 직후 낮 투표 판정이 실행된다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv1', gameId: 'game-dv1', hostUuid: 'dv1-h',
        uuids: ['dv1-t', 'dv1-h', 'dv1-b', 'dv1-c'],
    })

    for (const voter of ['dv1-h', 'dv1-b', 'dv1-c', 'dv1-t']) {
        await castDayVote(io, sockets, voter, session.id, 'dv1-t')
    }
    assert.equal(session.dayVoteResolution, null, '이탈 전에는 제한시간까지 기다린다')

    kickGamePlayer(io, sockets['dv1-h'], 'dv1-h', gameKickPayload(session, 'dv1-h', 'dv1-t'))

    assert.notEqual(session.dayVoteResolution, null, '이탈 직후 재평가가 일어나지 않았다')
    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
    assert.equal(session.phase, 'NIGHT')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 3, '판정 결과는 정확히 한 번씩 전달된다')
    assert.equal(sockets['dv1-t'].emitted.filter((e) => e.event === 'day_vote_resolved').length, 0)
})

test('AC-03: 이탈 뒤 **마지막 제출**이 들어오면 그 제출 직후 낮 투표가 한 번 판정된다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv2', gameId: 'game-dv2', hostUuid: 'dv2-h',
        uuids: ['dv2-t', 'dv2-h', 'dv2-b', 'dv2-c'],
    })

    await castDayVote(io, sockets, 'dv2-h', session.id, 'dv2-c')
    await castDayVote(io, sockets, 'dv2-b', session.id, 'dv2-c')

    kickGamePlayer(io, sockets['dv2-h'], 'dv2-h', gameKickPayload(session, 'dv2-h', 'dv2-t'))
    assert.equal(session.dayVoteResolution, null, '아직 dv2-c가 제출하지 않았다')
    assert.equal(session.phase, 'DAY')

    await castDayVote(io, sockets, 'dv2-c', session.id, null)

    assert.notEqual(session.dayVoteResolution, null, '마지막 제출 직후 재평가가 일어나지 않았다')
    assert.equal(session.dayVoteResolution.outcome, 'TRIBUNAL')
    assert.equal(session.dayVoteResolution.tribunalTargetUuid, 'dv2-c')
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 3)
})

function failVotePersistenceFor(failingUuid) {
    const attempts = []
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async ({ userId }) => {
        attempts.push(userId)
        if (userId === failingUuid) throw new Error('투표 참여 저장 실패(테스트 주입)')
        return { recorded: true }
    })
    return attempts
}

test('AC-03: 이탈 뒤 마지막 제출이 **비기권**이면 그 제출 직후 한 번 판정된다(저장 성공)', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv4', gameId: 'game-dv4', hostUuid: 'dv4-h',
        uuids: ['dv4-t', 'dv4-h', 'dv4-b', 'dv4-c'],
    })

    await castDayVote(io, sockets, 'dv4-h', session.id, 'dv4-c')
    await castDayVote(io, sockets, 'dv4-b', session.id, 'dv4-c')
    kickGamePlayer(io, sockets['dv4-h'], 'dv4-h', gameKickPayload(session, 'dv4-h', 'dv4-t'))
    assert.equal(session.dayVoteResolution, null, '아직 dv4-c가 제출하지 않았다')

    const ack = await castDayVote(io, sockets, 'dv4-c', session.id, 'dv4-b')

    assert.equal(ack.ok, true)
    assert.notEqual(session.dayVoteResolution, null, '비기권 마지막 제출 직후 재평가가 일어나지 않았다')
    assert.equal(session.dayVoteResolution.tribunalTargetUuid, 'dv4-c')
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 3, '판정 결과는 참가자마다 한 번씩이다')
})

test('AC-03: 마지막 비기권 제출의 **참여 저장이 실패해도** 이탈로 짧아진 라운드는 그 자리에서 판정된다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv5', gameId: 'game-dv5', hostUuid: 'dv5-h',
        uuids: ['dv5-t', 'dv5-h', 'dv5-b', 'dv5-c'],
    })
    const attempts = failVotePersistenceFor('dv5-c')

    await castDayVote(io, sockets, 'dv5-h', session.id, 'dv5-c')
    await castDayVote(io, sockets, 'dv5-b', session.id, 'dv5-c')
    kickGamePlayer(io, sockets['dv5-h'], 'dv5-h', gameKickPayload(session, 'dv5-h', 'dv5-t'))
    assert.equal(session.dayVoteResolution, null)

    const ack = await castDayVote(io, sockets, 'dv5-c', session.id, 'dv5-b')

    assert.equal(ack.ok, false)
    assert.equal(ack.code, 'VOTE_PERSIST_FAILED')
    assert.deepEqual(attempts, ['dv5-h', 'dv5-b', 'dv5-c'], '저장은 세 번 시도됐어야 한다')

    assert.notEqual(session.dayVoteResolution, null, '저장 실패가 이탈 후 완료 재평가를 삼켰다')
    assert.equal(session.dayVoteResolution.tribunalTargetUuid, 'dv5-c')
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 3)
})

test('AC-03(경계): 이탈이 없던 라운드는 마지막 비기권 제출의 저장이 실패해도 판정되지 않는다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv6', gameId: 'game-dv6', hostUuid: 'dv6-h',
        uuids: ['dv6-h', 'dv6-b', 'dv6-c', 'dv6-d'],
    })
    failVotePersistenceFor('dv6-d')

    await castDayVote(io, sockets, 'dv6-h', session.id, 'dv6-c')
    await castDayVote(io, sockets, 'dv6-b', session.id, 'dv6-c')
    await castDayVote(io, sockets, 'dv6-c', session.id, 'dv6-b')
    const ack = await castDayVote(io, sockets, 'dv6-d', session.id, 'dv6-c')

    assert.equal(ack.ok, false)
    assert.equal(ack.code, 'VOTE_PERSIST_FAILED')
    assert.equal(session.dayVoteResolution, null, '이탈이 없는 라운드의 기존 대기 계약이 깨졌다')
    assert.equal(session.phase, 'DAY')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 0)
})

test('AC-03(경계): 이탈이 없던 라운드는 전원이 투표해도 제출 직후에 판정되지 않는다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv3', gameId: 'game-dv3', hostUuid: 'dv3-h',
        uuids: ['dv3-h', 'dv3-b', 'dv3-c', 'dv3-d'],
    })

    for (const voter of ['dv3-h', 'dv3-b', 'dv3-c', 'dv3-d']) {
        await castDayVote(io, sockets, voter, session.id, null)
    }

    assert.equal(session.dayVoteResolution, null, '이탈이 없는 라운드의 기존 대기 계약이 깨졌다')
    assert.equal(session.phase, 'DAY')
    assert.equal(deliveredCount(sockets, 'day_vote_resolved'), 0)
})

test('AC-03: 재판 유권자 이탈 뒤 마지막 제출이 들어오면 그 제출 직후 재판이 한 번 판정된다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-tv1', gameId: 'game-tv1', hostUuid: 'tv1-h',
        uuids: ['tv1-t', 'tv1-h', 'tv1-b', 'tv1-c', 'tv1-d'],
    })

    for (const voter of ['tv1-t', 'tv1-h', 'tv1-b', 'tv1-c']) {
        await castDayVote(io, sockets, voter, session.id, 'tv1-d')
    }
    await castDayVote(io, sockets, 'tv1-d', session.id, null)
    await callAsPromise(
        gameSessionSocketLayer.__testables.handleResolveDayVote,
        io, sockets['tv1-h'], 'tv1-h', { gameId: session.id, dayIndex: session.dayIndex },
    )
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, 'tv1-d')
    clearDelivered(sockets)

    castTribunalVote(io, sockets, 'tv1-h', session, 'NOT_GUILTY')
    castTribunalVote(io, sockets, 'tv1-b', session, 'NOT_GUILTY')
    kickGamePlayer(io, sockets['tv1-h'], 'tv1-h', gameKickPayload(session, 'tv1-h', 'tv1-t'))

    assert.equal(session.tribunal.resolved !== true, true, '아직 tv1-c가 제출하지 않았다')
    assert.equal(session.phase, 'TRIBUNAL')

    castTribunalVote(io, sockets, 'tv1-c', session, 'NOT_GUILTY')

    assert.equal(session.tribunal.resolved, true, '마지막 제출 직후 재판 재평가가 일어나지 않았다')
    assert.equal(session.tribunal.outcome, 'NOT_GUILTY')
    assert.equal(session.tribunal.executedUuid, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get('tv1-d').alive, true, '무죄는 아무도 처형하지 않는다')
    assert.equal(deliveredCount(sockets, 'tribunal_vote_resolved'), 4, '판정 결과는 참가자마다 한 번씩이다')
})

test('AC-03: 피고 이탈의 개인 진행 사건은 새 단계(NIGHT)를 싣고 취소 사건보다 먼저·더 큰 순서값으로 나간다', async () => {
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-sp1', gameId: 'game-sp1', hostUuid: 'sp1-h',
        uuids: ['sp1-h', 'sp1-b', 'sp1-c', 'sp1-d'],
    })

    for (const voter of ['sp1-h', 'sp1-b', 'sp1-c']) {
        await castDayVote(io, sockets, voter, session.id, 'sp1-d')
    }
    await castDayVote(io, sockets, 'sp1-d', session.id, null)
    await callAsPromise(
        gameSessionSocketLayer.__testables.handleResolveDayVote,
        io, sockets['sp1-h'], 'sp1-h', { gameId: session.id, dayIndex: session.dayIndex },
    )
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, 'sp1-d')

    const dayIndexAtTribunal = session.dayIndex
    const seqBefore = session.selfProgressSeq
    clearDelivered(sockets)
    io.broadcasts.length = 0

    const hostSocket = sockets['sp1-h']
    const originalEmit = hostSocket.emit.bind(hostSocket)
    const timeline = []
    hostSocket.emit = (...args) => {
        timeline.push({ event: args[0], broadcastsBefore: io.broadcasts.length })
        return originalEmit(...args)
    }

    const { response } = kickGamePlayer(io, hostSocket, 'sp1-h', gameKickPayload(session, 'sp1-h', 'sp1-d'))
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, dayIndexAtTribunal, '취소는 같은 날의 밤으로만 넘긴다')

    const selfEntry = timeline.find((e) => e.event === 'session_self_progress')
    const cancelIndex = io.broadcasts.findIndex((b) => b.event === 'tribunal_vote_resolved')
    assert.ok(selfEntry, '개인 진행 사건이 나가지 않았다')
    assert.ok(cancelIndex >= 0, '재판 취소 사건이 나가지 않았다')
    assert.ok(cancelIndex >= selfEntry.broadcastsBefore, '개인 진행 사건이 단계 사건보다 뒤에 나갔다')

    const selfPayload = hostSocket.emitted.find((e) => e.event === 'session_self_progress').payload
    assert.equal(selfPayload.phase, 'NIGHT')
    assert.equal(selfPayload.dayIndex, dayIndexAtTribunal)
    assert.ok(selfPayload.selfProgressSeq > seqBefore, '개인 순서값이 오르지 않았다')

    assert.equal(sockets['sp1-d'].emitted.filter((e) => e.event === 'session_self_progress').length, 0)
})

test('AC-06: 빠른 매칭으로 확정된 참가자도 새 소속·준비 false와 공통 방 응답을 받는다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    try {
        const socket = createFakeSocket('mm-1')
        const io = createFakeIo([socket])
        await matchmaking.__testables.handleJoinMatchmaking(io, socket, 'mm-1')

        const found = socket.emitted.find((e) => e.event === 'match_found')
        assert.ok(found, '큐가 방으로 확정되지 않았다')

        for (const key of ['roomId', 'roomCode', 'roomInstanceId', 'bootEpoch', 'hostUuid', 'canStart', 'settings', 'settingsVersion']) {
            assert.ok(Object.hasOwn(found.payload, key), `match_found에 ${key}가 없다`)
        }
        assert.equal(found.payload.bootEpoch, BOOT)

        const seated = found.payload.players.find((p) => p.uuid === 'mm-1')
        assert.ok(typeof seated.membershipId === 'string' && seated.membershipId.length > 0)
        assert.equal(seated.isReady, false)

        const current = (await callAsPromise(handleGetCurrentRoom, 'mm-1')).room
        assert.equal(current.roomId, found.payload.roomId)
        assert.equal(seatOf(current, 'mm-1').membershipId, seated.membershipId)
        assert.equal(seatOf(current, 'mm-1').isReady, false)
    } finally {
        matchmaking.__setRandomMatchmakingEnabledForTests(null)
    }
})

function recipientsOf(io, broadcast) {
    const excluded = new Set(broadcast.excluded ?? [])
    return [...io.sockets.sockets.values()]
        .filter((socket) => socket.rooms?.has?.(broadcast.roomId) && !excluded.has(socket.id))
        .map((socket) => socket.id)
        .sort()
}

test('AC-06(대기방): 떼지 못한 옛 채널은 연결을 끊지 않고 **전달에서 제외**된다', async () => {
    const { io, sockets, room } = await setupRoom('own-h', ['own-t', 'own-k'])
    const target = sockets['own-t']
    const disconnects = trackDisconnect(target)

    target.leave = async () => { throw new Error('leave 실패(테스트 주입)') }

    const { response } = kickRoomPlayer(io, sockets['own-h'], 'own-h', roomKickPayload(room, 'own-h', 'own-t'))
    assert.equal(response.ok, true, JSON.stringify(response))

    matchmaking.__seedRoomForTests({
        id: 'own-other', instanceId: 'own-other-inst', hostUuid: 'own-t',
        players: new Map([['own-t', { uuid: 'own-t', nickname: 'n', isReady: false, membershipId: 'mem-other' }]]),
        settings: { maxPlayers: 8 },
    })
    matchmaking.__seedPlayerRoomForTests('own-t', 'own-other')

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(disconnects.length, 0, '새 소속을 가진 연결을 옛 정리가 끊었다')
    assert.equal(target.rooms.has(room.roomId), true)
    const before = io.broadcasts.length
    matchmaking.__testables.removeFromRoom(io, sockets['own-k'], 'own-k')
    const after = io.broadcasts.slice(before).filter((b) => b.roomId === room.roomId)
    assert.ok(after.length > 0, '이후 방 방송이 하나도 없어 제외를 관측할 수 없다')
    for (const broadcast of after) {
        assert.ok(
            (broadcast.excluded ?? []).includes(target.id),
            `${broadcast.event} 방송이 배제된 옛 채널 구독을 제외하지 않았다`,
        )
        assert.equal(
            recipientsOf(io, broadcast).includes(target.id), false,
            `${broadcast.event}가 배제된 계정에게 실제로 전달된다`,
        )
    }
    assert.ok(recipientsOf(io, after[0]).includes(sockets['own-h'].id))
})

test('AC-05(대기방): 옛 소켓의 이탈 정리는 **새 canonical 소켓**의 채널 가입을 되살리지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('can-h', ['can-t'])
    const oldSocket = sockets['can-t']

    const newSocket = createFakeSocket('can-t', { id: 'sock-can-t-new' })
    io.sockets.sockets.set(newSocket.id, newSocket)
    newSocket.rooms.add(room.roomId)
    matchmaking.setOnlineUsersRegistry(new Map([['can-t', newSocket.id]]))

    try {
        const departed = matchmaking.__testables.commitRoomDeparture(io, oldSocket, 'can-t', 'LEFT_ROOM')
        matchmaking.__seedRoomForTests({
            id: room.roomId, instanceId: room.roomInstanceId, hostUuid: 'can-h',
            players: new Map([
                ['can-h', { uuid: 'can-h', nickname: 'n', isReady: false, membershipId: 'mem-h' }],
                ['can-t', { uuid: 'can-t', nickname: 'n', isReady: false, membershipId: 'mem-new' }],
            ]),
            settings: { maxPlayers: 8 },
        })
        matchmaking.__seedPlayerRoomForTests('can-t', room.roomId)

        matchmaking.__testables.notifyRoomDeparture(io, departed, [oldSocket])
        await flushMicrotasks()
        await flushMicrotasks()

        assert.equal(
            oldSocket.rooms.has(room.roomId), false,
            'canonical이 아닌 옛 소켓의 채널 가입이 되살아났다',
        )
        assert.equal(newSocket.rooms.has(room.roomId), true, '새 canonical 소켓의 가입이 사라졌다')
    } finally {
        matchmaking.setOnlineUsersRegistry(null)
    }
})

test('AC-05(게임): 되돌린 가입이 완료되기 전에 그 소속마저 배제되면 채널에 남지 않는다', async () => {
    const uuids = ['rj-h', 'rj-t']
    const session = commitDeterministicSession({
        roomId: 'room-rj', gameId: 'game-rj', hostUuid: 'rj-h', uuids,
    })
    const target = createFakeSocket('rj-t')
    const io = createFakeIo([createFakeSocket('rj-h'), target])
    target.rooms.add(session.channelId)

    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    target.join = async (channelId) => {
        await joinGate
        target.joined.push(channelId)
        target.rooms.add(channelId)
    }

    gameSessionSocketLayer.__testables.detachSocketFromChannel(
        target, session.channelId, '[테스트 채널 정리]', { gameId: session.id },
        {
            ownsChannel: () => !gameSessionCore.isForfeitedFromSession(session.id, 'rj-t'),
            keepsConnection: () => true,
        },
    )
    await flushMicrotasks()
    assert.equal(target.rooms.has(session.channelId), false, 'leave가 끝나지 않았다')

    const departed = gameSessionCore.commitParticipantDeparture(session, 'rj-t', { reason: 'KICKED_BY_HOST' })
    assert.equal(departed.ok, true, JSON.stringify(departed))

    releaseJoin()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(
        target.rooms.has(session.channelId), false,
        '되돌린 가입이 완료된 뒤 배제된 소켓이 채널에 그대로 남았다',
    )
})

test('AC-02/AC-05: player_left_room·host_changed는 방 인스턴스와 서버 기동을 함께 싣는다', async () => {
    const { io, sockets, room } = await setupRoom('res-h', ['res-a', 'res-b'])

    const before = io.broadcasts.length
    const kicked = kickRoomPlayer(io, sockets['res-h'], 'res-h', roomKickPayload(room, 'res-h', 'res-a'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    const left = io.broadcasts.slice(before).find((b) => b.event === 'player_left_room')
    assert.ok(left, 'player_left_room이 방송되지 않았다')
    assert.equal(left.payload.roomId, room.roomId)
    assert.equal(left.payload.roomInstanceId, room.roomInstanceId)
    assert.equal(left.payload.bootEpoch, room.bootEpoch)
    assert.equal(left.payload.membershipId, seatOf(room, 'res-a').membershipId)

    const beforeHost = io.broadcasts.length
    matchmaking.__testables.removeFromRoom(io, sockets['res-h'], 'res-h')
    const hostChanged = io.broadcasts.slice(beforeHost).find((b) => b.event === 'host_changed')
    assert.ok(hostChanged, 'host_changed가 방송되지 않았다')
    assert.equal(hostChanged.payload.roomId, room.roomId)
    assert.equal(hostChanged.payload.roomInstanceId, room.roomInstanceId)
    assert.equal(hostChanged.payload.bootEpoch, room.bootEpoch)
    assert.equal(typeof hostChanged.payload.settingsVersion, 'number')
})

test('AC-03: 이탈 방송은 공개 진행 수를 싣고, 정규화된 본인 표는 개인 전송으로만 간다', async () => {
    const uuids = ['pg-h', 'pg-a', 'pg-b', 'pg-c']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-pg', gameId: 'game-pg', hostUuid: 'pg-h', uuids,
    })

    await castDayVote(io, sockets, 'pg-a', session.id, 'pg-c')
    clearDelivered(sockets)
    const beforeBroadcasts = io.broadcasts.length

    const kicked = kickGamePlayer(io, sockets['pg-h'], 'pg-h', gameKickPayload(session, 'pg-h', 'pg-c'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    const changed = io.broadcasts.slice(beforeBroadcasts)
        .find((b) => b.event === 'session_participation_changed')
    assert.ok(changed, 'session_participation_changed가 방송되지 않았다')
    assert.equal(changed.payload.progress.kind, 'DAY_VOTE')
    assert.equal(changed.payload.progress.requiredCount, 3)
    assert.equal(changed.payload.progress.doneCount, 1)
    assert.equal(JSON.stringify(changed.payload).includes('dayVoteTargetUuid'), false)

    const selfEvents = sockets['pg-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(selfEvents.length, 1)
    assert.equal(selfEvents[0].payload.self.hasSubmittedDayVote, true)
    assert.equal(selfEvents[0].payload.self.dayVoteTargetUuid, null, '사라진 표적이 그대로 남았다')
    assert.equal(selfEvents[0].payload.participationRevision, changed.payload.participationRevision)

    const otherSelf = sockets['pg-b'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(otherSelf.length, 1)
    assert.equal(otherSelf[0].payload.self.hasSubmittedDayVote, false)
    assert.equal(otherSelf[0].payload.self.dayVoteTargetUuid, null)
    assert.equal(sockets['pg-c'].emitted.filter((e) => e.event === 'session_self_progress').length, 0)
})

test('AC-03: 이탈 뒤의 평범한 제출도 서버가 본인 값을 다시 말해 준다(화면이 미제출로 남지 않는다)', async () => {
    const uuids = ['rs-h', 'rs-a', 'rs-b', 'rs-c']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-rs', gameId: 'game-rs', hostUuid: 'rs-h', uuids,
    })

    const kicked = kickGamePlayer(io, sockets['rs-h'], 'rs-h', gameKickPayload(session, 'rs-h', 'rs-c'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    const atDeparture = sockets['rs-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(atDeparture.length, 1)
    assert.equal(atDeparture[0].payload.self.hasSubmittedDayVote, false)
    const departureSeq = atDeparture[0].payload.selfProgressSeq
    assert.ok(Number.isInteger(departureSeq), '개인 전송에 순서값이 없다')

    clearDelivered(sockets)

    const ack = await castDayVote(io, sockets, 'rs-a', session.id, 'rs-b')
    assert.equal(ack.ok, true, JSON.stringify(ack))

    const afterSubmit = sockets['rs-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(afterSubmit.length, 1, '제출 뒤 본인 값을 다시 말해 주지 않았다')
    assert.equal(afterSubmit[0].payload.self.hasSubmittedDayVote, true)
    assert.equal(afterSubmit[0].payload.self.dayVoteTargetUuid, 'rs-b')
    assert.equal(afterSubmit[0].payload.progress.doneCount, 1)
    assert.equal(afterSubmit[0].payload.participationRevision, atDeparture[0].payload.participationRevision)
    assert.ok(afterSubmit[0].payload.selfProgressSeq > departureSeq,
        '제출이 이탈 당시 값보다 새롭다는 근거가 없다')

    assert.equal(sockets['rs-b'].emitted.filter((e) => e.event === 'session_self_progress').length, 0)
    assert.equal(JSON.stringify(afterSubmit[0].payload).includes('rs-h'), false)
})

test('AC-03: 토론 준비도 같은 갱신을 받는다(준비 수가 이탈 당시 값에 멈추지 않는다)', async () => {
    const uuids = ['dr-h', 'dr-a', 'dr-b', 'dr-c']
    const session = commitDeterministicSession({
        roomId: 'room-dr', gameId: 'game-dr', hostUuid: 'dr-h', uuids,
    })
    const sockets = {}
    for (const uuid of uuids) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        sockets[uuid] = socket
    }
    const io = createFakeIo(Object.values(sockets))

    const kicked = kickGamePlayer(io, sockets['dr-h'], 'dr-h', gameKickPayload(session, 'dr-h', 'dr-c'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    const atDeparture = sockets['dr-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(atDeparture.length, 1)
    assert.equal(atDeparture[0].payload.progress.kind, 'DAY_DISCUSSION')
    assert.equal(atDeparture[0].payload.progress.requiredCount, 3)
    assert.equal(atDeparture[0].payload.self.isDayVoteReady, false)

    clearDelivered(sockets)
    const ready = await callAsPromise(
        gameSessionSocketLayer.__testables.handleAcknowledgeDayVoteReady,
        io, sockets['dr-a'], 'dr-a', { gameId: session.id },
    )
    assert.equal(ready.ok, true, JSON.stringify(ready))

    const afterReady = sockets['dr-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(afterReady.length, 1, '준비 뒤 본인 값을 다시 말해 주지 않았다')
    assert.equal(afterReady[0].payload.self.isDayVoteReady, true)
    assert.equal(afterReady[0].payload.progress.doneCount, 1)
    assert.equal(afterReady[0].payload.progress.requiredCount, 3)
    assert.ok(afterReady[0].payload.selfProgressSeq > atDeparture[0].payload.selfProgressSeq)
})

test('AC-03: 참여 변화 payload 조립이 실패해도 확정된 추방·개인 진행·ACK·영수증은 그대로다', async (t) => {
    const uuids = ['iso-h', 'iso-a', 'iso-b', 'iso-c']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-iso', gameId: 'game-iso', hostUuid: 'iso-h', uuids,
    })
    const original = gameSessionCore.buildParticipationChangedPayload
    gameSessionCore.buildParticipationChangedPayload = () => { throw new Error('조립 실패(테스트 주입)') }
    t.after(() => { gameSessionCore.buildParticipationChangedPayload = original })

    const payload = gameKickPayload(session, 'iso-h', 'iso-c')
    const kicked = kickGamePlayer(io, sockets['iso-h'], 'iso-h', payload)

    assert.equal(kicked.calls, 1)
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    assert.equal(session.players.get('iso-c').isParticipating, false)
    assert.equal(session.players.get('iso-c').alive, false)
    assert.equal(session.phase, 'DAY', '비종결 판이 종결로 바뀌었다')

    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'session_participation_changed').length, 0)
    assert.equal(sockets['iso-a'].emitted.filter((e) => e.event === 'session_self_progress').length, 1)

    const replay = getKickResult(io, sockets['iso-h'], 'iso-h',
        { bootEpoch: payload.bootEpoch, requestId: payload.requestId })
    assert.equal(replay.ok, true, JSON.stringify(replay))
    assert.equal(replay.status, 'KICKED')
    assert.equal(replay.replayed, true)
})

test('AC-03: 종결 커밋 뒤 payload 조립이 실패해도 종결 저장과 결과 방송은 그대로 일어난다', async (t) => {
    const uuids = ['isoT-h', 'isoT-a', 'isoT-b']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-isoT', gameId: 'game-isoT', hostUuid: 'isoT-h', uuids,
    })
    const persistCalls = []
    const originalPersist = gameResultRepository.persistGameResultRecord
    gameResultRepository.persistGameResultRecord = async (record) => {
        persistCalls.push(record)
        return { persisted: true, gameId: record.result.id }
    }
    const originalBuild = gameSessionCore.buildParticipationChangedPayload
    gameSessionCore.buildParticipationChangedPayload = () => { throw new Error('조립 실패(테스트 주입)') }
    t.after(() => {
        gameResultRepository.persistGameResultRecord = originalPersist
        gameSessionCore.buildParticipationChangedPayload = originalBuild
    })

    const payload = gameKickPayload(session, 'isoT-h', 'isoT-b')
    const kicked = kickGamePlayer(io, sockets['isoT-h'], 'isoT-h', payload)
    await flushMicrotasks()

    assert.equal(kicked.calls, 1)
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    assert.equal(session.phase, 'ENDED')
    assert.equal(persistCalls.length, 1, '종결 저장이 통지 실패에 함께 삼켜졌다')
    assert.equal(persistCalls[0].result.id, session.id)
    assert.equal(persistCalls[0].result.completed, true)
    const eliminated = io.broadcasts.filter((b) => b.event === 'player_eliminated')
    assert.equal(eliminated.length, 1)
    assert.ok(eliminated[0].payload.winResult, '종결 결과가 실리지 않았다')

    const replay = getKickResult(io, sockets['isoT-h'], 'isoT-h',
        { bootEpoch: payload.bootEpoch, requestId: payload.requestId })
    assert.equal(replay.status, 'KICKED')
})

test('AC-03: 스냅샷도 같은 공개 진행 수와 **본인** 정규화 표를 복원한다', async () => {
    const uuids = ['sn-h', 'sn-a', 'sn-b', 'sn-c']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-sn', gameId: 'game-sn', hostUuid: 'sn-h', uuids,
    })
    await castDayVote(io, sockets, 'sn-a', session.id, 'sn-c')
    kickGamePlayer(io, sockets['sn-h'], 'sn-h', gameKickPayload(session, 'sn-h', 'sn-c'))

    const snapshot = gameSessionCore.getSessionSnapshotForPlayer('sn-a', session.id).snapshot
    assert.equal(snapshot.progress.kind, 'DAY_VOTE')
    assert.equal(snapshot.progress.requiredCount, 3)
    assert.equal(snapshot.self.hasSubmittedDayVote, true)
    assert.equal(snapshot.self.dayVoteTargetUuid, null)

    const otherSnapshot = gameSessionCore.getSessionSnapshotForPlayer('sn-b', session.id).snapshot
    assert.equal(otherSnapshot.self.hasSubmittedDayVote, false)
    assert.equal(JSON.stringify(otherSnapshot.players).includes('dayVoteTargetUuid'), false)
})

function createLeaveDenyingSocket(id, { joinedChannels = [] } = {}) {
    const rooms = new Set(joinedChannels)
    const socket = {
        id,
        rooms,
        currentRooms: rooms,
        emitted: [],
        disconnectCalls: 0,
        leaveCalls: 0,
        joinCalls: 0,
        async leave() {
            socket.leaveCalls += 1
            throw new Error('leave 실패(테스트 주입)')
        },
        async join(channelId) {
            socket.joinCalls += 1
            rooms.add(channelId)
        },
        emit(event, payload) { socket.emitted.push({ event, payload }) },
        disconnect() { socket.disconnectCalls += 1 },
    }
    return socket
}

async function settleChannelRetries(times = 8) {
    for (let i = 0; i < times; i += 1) await flushMicrotasks()
}

test('AC-06: 유효한 전달 제외는 수위(1024)를 넘어도 하나도 축출되지 않는다', async () => {
    const channelId = 'chan-capacity'
    const total = channelMembership.CHANNEL_EXCLUSION_ALARM_ENTRIES + 1 // 1025
    const sockets = []

    for (let i = 0; i < total; i += 1) {
        const socket = createLeaveDenyingSocket(`cap-sock-${i}`, { joinedChannels: [channelId] })
        sockets.push(socket)
        channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
            ownsChannel: () => false,
            keepsConnection: () => true,
        })
    }
    await settleChannelRetries()

    assert.equal(channelMembership.getChannelExclusions(channelId).length, total,
        '수위를 넘긴 유효 배제가 축출됐다(무단 전달이 다시 열린다)')
    for (const socket of sockets) {
        assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), true,
            `${socket.id}의 배제가 사라졌다`)
        assert.equal(socket.disconnectCalls, 0)
    }

    const allowed = createLeaveDenyingSocket('cap-allowed', { joinedChannels: [channelId] })
    const io = createFakeIo([allowed, ...sockets])
    channelMembership.emitToChannel(io, channelId, 'player_left_room', { roomId: channelId })
    const broadcast = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(broadcast, '방송이 발생하지 않았다')
    assert.equal(broadcast.excluded.length, total)
})

test('AC-06: 연결이 끝나면 그 소켓의 모든 배제가 해제된다(목록의 실제 상한은 생명주기다)', async () => {
    const socket = createLeaveDenyingSocket('life-sock', { joinedChannels: ['chan-a', 'chan-b'] })
    for (const channelId of ['chan-a', 'chan-b']) {
        channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
            ownsChannel: () => false,
            keepsConnection: () => true,
        })
    }
    await settleChannelRetries()
    assert.equal(channelMembership.isSocketExcludedFromChannel('chan-a', 'life-sock'), true)
    assert.equal(channelMembership.isSocketExcludedFromChannel('chan-b', 'life-sock'), true)

    channelMembership.releaseSocketFromAllChannels('life-sock')

    assert.deepEqual(channelMembership.getChannelExclusions('chan-a'), [])
    assert.deepEqual(channelMembership.getChannelExclusions('chan-b'), [])
})

test('AC-06: except을 지원하지 않는 adapter에서는 허용된 수신자에게만 개별 전달하고 배제된 소켓에는 보내지 않는다', async () => {
    const channelId = 'chan-noexcept'
    const denied = createLeaveDenyingSocket('ne-denied', { joinedChannels: [channelId] })
    const allowedA = createLeaveDenyingSocket('ne-allowed-a', { joinedChannels: [channelId] })
    const allowedB = createLeaveDenyingSocket('ne-allowed-b', { joinedChannels: [channelId] })
    const outsider = createLeaveDenyingSocket('ne-outsider', { joinedChannels: ['other-chan'] })

    channelMembership.detachSocketFromChannel(denied, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    await settleChannelRetries()
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, denied.id), true)

    const channelWideEmits = []
    const io = {
        sockets: { sockets: new Map([denied, allowedA, allowedB, outsider].map((s) => [s.id, s])) },
        to: () => ({ emit: (event, payload) => channelWideEmits.push({ event, payload }) }),
    }

    const errors = []
    const originalError = console.error
    console.error = (...args) => errors.push(args)
    try {
        channelMembership.emitToChannel(io, channelId, 'player_left_room', { roomId: channelId })
    } finally {
        console.error = originalError
    }

    assert.equal(channelWideEmits.length, 0, '배제를 적용할 수 없는데 채널 전체로 방송했다')
    assert.equal(denied.emitted.length, 0, '배제된 소켓이 방송을 받았다')
    assert.equal(allowedA.emitted.filter((e) => e.event === 'player_left_room').length, 1)
    assert.equal(allowedB.emitted.filter((e) => e.event === 'player_left_room').length, 1)
    assert.equal(outsider.emitted.length, 0)
    assert.equal(errors.some(([, fields]) => fields?.code === 'CHANNEL_EXCLUDE_FALLBACK'), true,
        '제외 우회 경로가 기록되지 않았다')
})

test('AC-06: 제외도 열거도 불가능하면 그 방송을 버린다(fail-closed)', async () => {
    const channelId = 'chan-blind'
    const denied = createLeaveDenyingSocket('blind-denied', { joinedChannels: [channelId] })
    channelMembership.detachSocketFromChannel(denied, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    const channelWideEmits = []
    const io = { to: () => ({ emit: (event, payload) => channelWideEmits.push({ event, payload }) }) }

    const errors = []
    const originalError = console.error
    console.error = (...args) => errors.push(args)
    try {
        channelMembership.emitToChannel(io, channelId, 'player_left_room', { roomId: channelId })
    } finally {
        console.error = originalError
    }

    assert.equal(channelWideEmits.length, 0, '배제를 적용할 수 없는데 방송을 보냈다')
    assert.equal(denied.emitted.length, 0)
    assert.equal(errors.some(([, fields]) => fields?.code === 'CHANNEL_EMIT_DROPPED_FAIL_CLOSED'), true)
})

test('AC-06: 배제가 없는 정상 경로의 방송은 기존과 완전히 같다(발신자 제외 포함)', () => {
    const channelId = 'chan-normal'
    const sender = createLeaveDenyingSocket('normal-sender', { joinedChannels: [channelId] })
    const io = createFakeIo([sender])
    const senderBroadcasts = []
    sender.to = () => ({ emit: (event, payload) => senderBroadcasts.push({ event, payload }) })

    channelMembership.emitToChannel(io, channelId, 'player_ready_changed', { uuid: 'x' },
        { senderSocket: sender })

    assert.equal(senderBroadcasts.length, 1)
    assert.equal(senderBroadcasts[0].event, 'player_ready_changed')
    assert.equal(io.broadcasts.length, 0)
})

test('AC-06: 같은 채널에 정당하게 다시 들어온 소속은 옛 leave가 거부돼도 제외·끊기 대상이 아니다', async () => {
    const channelId = 'chan-readmit'
    const socket = createLeaveDenyingSocket('readmit-sock', { joinedChannels: [channelId] })

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => true,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), false,
        '정당한 같은 채널 재입장이 전달에서 제외됐다')
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])
    assert.equal(socket.disconnectCalls, 0)
    assert.equal(socket.leaveCalls, 1)
    assert.equal(socket.rooms.has(channelId), true, '정상 소속의 채널 가입이 사라졌다')
})

test('AC-06: 같은 채널 재입장에서 가입이 떨어져 있으면 되돌려 놓는다(끊지 않는다)', async () => {
    const channelId = 'chan-readmit-restore'
    const socket = createLeaveDenyingSocket('readmit-restore-sock')

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => true,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    assert.equal(socket.rooms.has(channelId), true, '정당한 새 소속의 가입이 되돌려지지 않았다')
    assert.equal(socket.joinCalls, 1)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), false)
    assert.equal(socket.disconnectCalls, 0)
})

test('AC-06: **다른** 채널의 새 소속은 연결을 지키고 옛 채널의 전달에서만 빠진다', async () => {
    const oldChannel = 'chan-old'
    const socket = createLeaveDenyingSocket('other-chan-sock', { joinedChannels: [oldChannel, 'chan-new'] })

    channelMembership.detachSocketFromChannel(socket, oldChannel, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    assert.equal(socket.disconnectCalls, 0, '다른 채널의 새 소속을 가진 연결을 끊었다')
    assert.equal(channelMembership.isSocketExcludedFromChannel(oldChannel, socket.id), true)
    assert.equal(channelMembership.isSocketExcludedFromChannel('chan-new', socket.id), false)
    assert.equal(socket.leaveCalls, channelMembership.MAX_CHANNEL_LEAVE_ATTEMPTS)
})

test('AC-06: 방 채널 방송(player_ready_changed)도 배제된 소켓에는 전달되지 않고 잔류자에게는 실제로 전달된다', async () => {
    const { io, sockets, room } = await setupRoom('ready-x-h', ['ready-x-a', 'ready-x-b'])

    channelMembership.excludeSocketFromChannel(room.roomId, sockets['ready-x-a'].id)
    for (const socket of Object.values(sockets)) socket.emitted.length = 0

    const ack = await callAsPromise(
        handleSetReady, io, sockets['ready-x-h'], 'ready-x-h', readyPayload(room))
    assert.equal(ack.ok, true, JSON.stringify(ack))

    const received = (uuid) => sockets[uuid].emitted.filter((e) => e.event === 'player_ready_changed').length
    assert.equal(received('ready-x-a'), 0, '배제된 소켓이 방 채널 방송을 받았다')
    assert.equal(received('ready-x-b'), 1)
    assert.equal(received('ready-x-h'), 0)
})

test('F-23(AC-04): 한 소유자가 제외를 풀어도 다른 소유자의 제외는 남는다', () => {
    const channelId = 'chan-owner-tokens'
    const socketId = 'sock-owner-tokens'
    const detachOwner = channelMembership.createChannelExclusionOwner('detach')
    const admissionOwner = channelMembership.createChannelExclusionOwner('admission')
    assert.notEqual(detachOwner, admissionOwner, '토큰은 시도마다 달라야 한다')

    channelMembership.excludeSocketFromChannel(channelId, socketId, detachOwner)
    channelMembership.excludeSocketFromChannel(channelId, socketId, admissionOwner)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socketId), true)

    channelMembership.releaseChannelExclusion(channelId, socketId, detachOwner)
    assert.equal(
        channelMembership.isSocketExcludedFromChannel(channelId, socketId), true,
        '한 흐름의 해제가 아직 유효한 다른 흐름의 제외까지 지웠다',
    )
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [socketId])

    channelMembership.releaseChannelExclusion(channelId, socketId, admissionOwner)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socketId), false)
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])
})

test('F-23(AC-04): 같은 소유자의 중복 제외는 한 번만 세고, 남의 토큰으로는 풀 수 없다', () => {
    const channelId = 'chan-owner-idempotent'
    const socketId = 'sock-owner-idempotent'
    const owner = channelMembership.createChannelExclusionOwner('detach')
    const stranger = channelMembership.createChannelExclusionOwner('detach')

    channelMembership.excludeSocketFromChannel(channelId, socketId, owner)
    channelMembership.excludeSocketFromChannel(channelId, socketId, owner)
    channelMembership.releaseChannelExclusion(channelId, socketId, stranger)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socketId), true)

    channelMembership.releaseChannelExclusion(channelId, socketId, owner)
    assert.equal(
        channelMembership.isSocketExcludedFromChannel(channelId, socketId), false,
        '같은 소유자의 중복 등록이 두 번 세어져 한 번의 해제로 풀리지 않았다',
    )
})

test('F-23(AC-04): 연결이 끝나면 소유자와 무관하게 그 소켓의 모든 제외가 사라진다', () => {
    const socketId = 'sock-owner-disconnect'
    const ownerA = channelMembership.createChannelExclusionOwner('detach')
    const ownerB = channelMembership.createChannelExclusionOwner('admission')
    channelMembership.excludeSocketFromChannel('chan-own-1', socketId, ownerA)
    channelMembership.excludeSocketFromChannel('chan-own-1', socketId, ownerB)
    channelMembership.excludeSocketFromChannel('chan-own-2', socketId, ownerA)

    channelMembership.releaseSocketFromAllChannels(socketId)

    assert.deepEqual(channelMembership.getChannelExclusions('chan-own-1'), [])
    assert.deepEqual(channelMembership.getChannelExclusions('chan-own-2'), [])
})

test('AC-06: 살아 있는 소속이 하나도 없으면 떼지 못한 연결을 끊고 배제를 정리한다', async () => {
    const channelId = 'chan-dead'
    const socket = createLeaveDenyingSocket('dead-sock', { joinedChannels: [channelId] })
    channelMembership.excludeSocketFromChannel('chan-stale', socket.id)

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => false,
    })
    await settleChannelRetries()

    assert.equal(socket.disconnectCalls, 1, '남은 근거가 없는 연결을 끊지 않았다')
    assert.deepEqual(channelMembership.getChannelExclusions('chan-stale'), [])
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])
})

function createDeferredLeaveSocket(id, { joinedChannels = [] } = {}) {
    const rooms = new Set(joinedChannels)
    const pending = []
    const socket = {
        id,
        rooms,
        currentRooms: rooms,
        emitted: [],
        leaveCalls: 0,
        joinCalls: 0,
        disconnectCalls: 0,
        leave(channelId) {
            socket.leaveCalls += 1
            return new Promise((resolve, reject) => pending.push({ channelId, resolve, reject }))
        },
        async join(channelId) { socket.joinCalls += 1; rooms.add(channelId) },
        emit(event, payload) { socket.emitted.push({ event, payload }) },
        disconnect() { socket.disconnectCalls += 1 },
    }
    socket.settleLeave = (ok = true) => {
        const next = pending.shift()
        if (!next) return false
        if (ok) { rooms.delete(next.channelId); next.resolve() } else next.reject(new Error('leave 거부'))
        return true
    }
    return socket
}

test('AC-05/AC-06: leave가 끝나기 **전에도** 그 소켓은 채널 전달에서 빠진다', async () => {
    const channelId = 'chan-pending'
    const leaving = createDeferredLeaveSocket('pending-sock', { joinedChannels: [channelId] })
    const staying = createDeferredLeaveSocket('staying-sock', { joinedChannels: [channelId] })
    const io = createFakeIo([leaving, staying])

    channelMembership.detachSocketFromChannel(leaving, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => true,
    })

    assert.equal(leaving.leaveCalls, 1)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, leaving.id), true,
        '떼는 동안 제외가 없어 제거된 소켓이 방송을 받는다')

    channelMembership.emitToChannel(io, channelId, 'player_left_room', { roomId: channelId })
    const duringLeave = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.deepEqual(duringLeave.excluded, [leaving.id])

    leaving.settleLeave(true)
    await settleChannelRetries()
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, leaving.id), false)
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])

    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, staying.id), false)
})

test('AC-05/AC-06: leave도 끊기도 실패하면 제외를 남긴다(끊긴 것을 확인하기 전에 풀지 않는다)', async () => {
    const channelId = 'chan-both-fail'
    const socket = createLeaveDenyingSocket('both-fail-sock', { joinedChannels: [channelId] })
    socket.disconnect = () => { socket.disconnectCalls += 1; throw new Error('disconnect 실패(테스트 주입)') }

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => false,
    })
    await settleChannelRetries()

    assert.equal(socket.disconnectCalls, 1)
    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), true,
        '끊기 실패인데 전달 제외가 사라졌다')

    const io = createFakeIo([socket])
    channelMembership.emitToChannel(io, channelId, 'player_left_room', { roomId: channelId })
    assert.deepEqual(io.broadcasts.at(-1).excluded, [socket.id])
})

test('AC-05/AC-06: 소유권이 계속 뒤바뀌어도 정리는 유한 번에 끝난다', async () => {
    const channelId = 'chan-alternating'
    const socket = createDeferredLeaveSocket('alternating-sock', { joinedChannels: [channelId] })
    let owns = false
    const settleLeave = socket.settleLeave
    socket.settleLeave = (ok = true) => {
        const settled = settleLeave(ok)
        if (settled) owns = !owns
        return settled
    }
    const join = socket.join
    socket.join = async (id) => { await join(id); owns = !owns }

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => owns,
        keepsConnection: () => true,
    })

    for (let i = 0; i < 12; i += 1) {
        await settleChannelRetries(4)
        if (!socket.settleLeave(true)) break
    }
    await settleChannelRetries(12)

    assert.ok(socket.leaveCalls <= 3, `왕복이 끝나지 않았다(leaveCalls=${socket.leaveCalls})`)
    assert.ok(socket.joinCalls <= 2, `되돌리기가 끝나지 않았다(joinCalls=${socket.joinCalls})`)
    if (!owns) {
        assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), true)
    }
    assert.equal(socket.disconnectCalls, 0, '정당한 연결을 끊었다')
})

const { resyncRoomChannelOnReconnect } = matchmaking

function fixedSocketRegistry(entries) {
    return new Map(Object.entries(entries))
}

function gateFirstJoin(socket) {
    let release = null
    const gate = new Promise((resolve) => { release = resolve })
    let markCalled = null
    const called = new Promise((resolve) => { markCalled = resolve })
    const original = socket.join.bind(socket)
    let gated = false
    socket.join = async (channelId) => {
        if (!gated) {
            gated = true
            markCalled()
            await gate
        }
        return original(channelId)
    }
    return { release: () => release(), called }
}

test('AC-06: 재가입이 끝나기 전에 추방되면 그 가입은 되돌아가고 추방된 대상은 방송을 받지 않는다', async (t) => {
    const host = 'resync-host'
    const target = 'resync-target'
    const { io, sockets, room } = await setupRoom(host, [target])

    const reconnected = createFakeSocket(target, { id: 'sock-resync-target-2' })
    const gate = gateFirstJoin(reconnected)
    io.sockets.sockets.set(reconnected.id, reconnected)
    matchmaking.setOnlineUsersRegistry(fixedSocketRegistry({ [host]: `sock-${host}`, [target]: reconnected.id }))
    t.after(() => matchmaking.setOnlineUsersRegistry(null))

    const resync = resyncRoomChannelOnReconnect(reconnected, target)
    await gate.called // join 안에서 gate를 기다리는 중이다

    const kicked = kickRoomPlayer(io, sockets[host], host, roomKickPayload(room, host, target))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    gate.release()
    await resync
    await settleChannelRetries()

    const stillJoined = reconnected.rooms.has(room.roomId)
    io.broadcasts.length = 0
    channelMembership.emitToChannel(io, room.roomId, 'player_left_room', { roomId: room.roomId })
    const excluded = io.broadcasts.at(-1).excluded ?? []
    assert.equal(stillJoined && !excluded.includes(reconnected.id), false,
        '추방된 소켓이 방 채널 방송을 받는다')
})

test('AC-06: 재가입 대기 중 같은 방에 **새 소속**으로 다시 앉으면 그 채널은 보존된다', async (t) => {
    const host = 'resync2-host'
    const target = 'resync2-target'
    const { io, sockets, room } = await setupRoom(host, [target])

    const reconnected = createFakeSocket(target, { id: 'sock-resync2-target-2' })
    const gate = gateFirstJoin(reconnected)
    io.sockets.sockets.set(reconnected.id, reconnected)
    matchmaking.setOnlineUsersRegistry(fixedSocketRegistry({ [host]: `sock-${host}`, [target]: reconnected.id }))
    t.after(() => matchmaking.setOnlineUsersRegistry(null))

    const resync = resyncRoomChannelOnReconnect(reconnected, target)
    await gate.called

    const kicked = kickRoomPlayer(io, sockets[host], host, roomKickPayload(room, host, target))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    await handleJoinRoomByCode(io, reconnected, target, room.roomCode)
    const rejoined = await callAsPromise(handleGetCurrentRoom, target)
    assert.equal(rejoined.room.roomId, room.roomId)
    assert.notEqual(seatOf(rejoined.room, target).membershipId, seatOf(room, target).membershipId)

    gate.release()
    await resync
    await settleChannelRetries()

    assert.equal(reconnected.rooms.has(room.roomId), true, '새 정상 소속의 채널 가입이 떼어졌다')
    assert.equal(channelMembership.isSocketExcludedFromChannel(room.roomId, reconnected.id), false)
})

test('AC-06: 재가입 대기 중 **다른 방**으로 옮겨 가도 그 연결을 끊지 않는다', async (t) => {
    const host = 'resync3-host'
    const target = 'resync3-target'
    const { io, sockets, room } = await setupRoom(host, [target])

    const reconnected = createFakeSocket(target, { id: 'sock-resync3-target-2' })
    const gate = gateFirstJoin(reconnected)
    io.sockets.sockets.set(reconnected.id, reconnected)
    const disconnects = trackDisconnect(reconnected)
    matchmaking.setOnlineUsersRegistry(fixedSocketRegistry({ [host]: `sock-${host}`, [target]: reconnected.id }))
    t.after(() => matchmaking.setOnlineUsersRegistry(null))

    const resync = resyncRoomChannelOnReconnect(reconnected, target)
    await gate.called

    const kicked = kickRoomPlayer(io, sockets[host], host, roomKickPayload(room, host, target))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))
    const ownRoom = await callAsPromise(
        handleCreateRoom, io, reconnected, target, validSettingsPayload({ maxPlayers: 8, jokerCount: 1 }))
    assert.equal(ownRoom.ok, true, JSON.stringify(ownRoom))

    gate.release()
    await resync
    await settleChannelRetries()

    assert.deepEqual(disconnects, [], '다른 방의 정상 소속을 가진 연결을 끊었다')
    assert.equal(reconnected.rooms.has(ownRoom.room.roomId), true, '새 방의 채널까지 떼어졌다')
})

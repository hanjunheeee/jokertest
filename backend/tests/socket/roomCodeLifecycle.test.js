process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})
const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocketLayer = require('../../socket/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors')
const { generateUniqueRoomCode } = require('../../utils/roomCode')

matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    readyPayload,
    startPayload,
    countingCallback,
} = require('../helpers/matchmakingFixtures')

const {
    handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame,
    validateJoinRoomByCodeRequest, isRoomCodeReserved, isStartedRoomMark,
} = matchmaking.__testables

const KNOWN_STARTED_ROOM_MARK_TTL_MS = 30 * 60 * 1000

async function withClockAdvancedPastMarkTtl(run) {
    const realNow = Date.now
    const advancedTo = realNow() + KNOWN_STARTED_ROOM_MARK_TTL_MS + 60 * 1000
    Date.now = () => advancedTo
    try {
        await run()
    } finally {
        Date.now = realNow
    }
}

function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            return Reflect.get(target, prop, receiver)
        },
    })
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: uuid }) })
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
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests()
})

function connect(io, uuid) {
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    return socket
}

async function startRealSession(hostUuid, joinerUuid, settings = {}) {
    const hostSocket = createFakeSocket(hostUuid)
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid,
        validSettingsPayload({ maxPlayers: 4, jokerCount: 1, ...settings }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    const joinerSocket = connect(io, joinerUuid)
    await handleJoinRoomByCode(io, joinerSocket, joinerUuid, created.room.roomCode)
    await callAsPromise(handleSetReady, io, hostSocket, hostUuid, readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerSocket, joinerUuid, readyPayload(created.room))

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, hostUuid, startPayload(created.room), callback)
    const started = getResponse()
    assert.equal(started.ok, true, JSON.stringify(started))

    gameSessionSocketLayer.registerGameHandlers(io, hostSocket, hostUuid)
    gameSessionSocketLayer.registerGameHandlers(io, joinerSocket, joinerUuid)
    return { io, hostSocket, joinerSocket, room: created.room, roomCode: created.room.roomCode }
}

async function leaveGameSession(socket, gameId) {
    const { callback, getResponse } = countingCallback()
    socket.trigger('leave_game_session', { gameId }, callback)
    await new Promise((resolve) => setImmediate(resolve))
    const response = getResponse()
    assert.equal(response?.ok, true, `이탈 요청이 실패했다: ${JSON.stringify(response)}`)
    return true
}

function lastJoinFailure(socket) {
    const failures = socket.emitted.filter((entry) => entry.event === 'room_join_failed')
    return failures.length > 0 ? failures[failures.length - 1].payload : null
}

function matchmakingState() {
    const snapshot = matchmaking.__getStateSnapshotForTests()
    return {
        gameRooms: new Map(snapshot.gameRooms),
        playerRoom: new Map(snapshot.playerRoom),
    }
}

function liveSession(uuid) {
    const target = gameSessionCore.getDisconnectGraceTarget(uuid)
    assert.ok(target, `살아 있는 세션을 찾지 못했다: ${uuid}`)
    return target.session
}

test('F-24(AC-01): 시작 payload와 재접속 스냅샷이 대기방과 같은 방 코드를 싣는다', async () => {
    const { io, hostSocket, joinerSocket, roomCode } = await startRealSession('ac01-host', 'ac01-join')

    for (const socket of [hostSocket, joinerSocket]) {
        const started = socket.emitted.find((entry) => entry.event === 'game_started')
        assert.ok(started, '참가자가 game_started를 받지 못했다')
        assert.equal(started.payload.state.roomCode, roomCode)
    }

    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(
        io, joinerSocket, 'ac01-join', {}, callback,
    )
    const snapshot = getResponse()
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot))
    assert.equal(snapshot.roomCode, roomCode)
})

test('F-24(AC-01): 시작 payload의 코드는 서버 값이고, 응답을 변형해도 세션이 오염되지 않는다', async () => {
    const { io, joinerSocket, roomCode } = await startRealSession('ac01b-host', 'ac01b-join')

    const first = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(io, joinerSocket, 'ac01b-join', {}, first.callback)
    const snapshot = first.getResponse()
    snapshot.roomCode = 'ZZZZZZ'

    const second = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(io, joinerSocket, 'ac01b-join', {}, second.callback)
    assert.equal(second.getResponse().roomCode, roomCode, '응답 변형이 canonical 세션을 오염시켰다')
})

test('F-24(AC-02): 진행 중인 판의 코드로 들어오려는 외부 계정은 ROOM_ALREADY_STARTED로 거부되고 어떤 소속도 생기지 않는다', async () => {
    const { io, roomCode } = await startRealSession('ac02-host', 'ac02-join')

    const outsider = connect(io, 'ac02-outsider')
    await handleJoinRoomByCode(io, outsider, 'ac02-outsider', roomCode)

    const failure = lastJoinFailure(outsider)
    assert.equal(failure?.code, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, JSON.stringify(failure))
    assert.equal(outsider.rooms.size, 0)
    assert.equal(outsider.emitted.filter((e) => e.event === 'room_joined').length, 0)
    assert.equal(matchmakingState().playerRoom.has('ac02-outsider'), false)
})

test('F-24(AC-02): 실제 TTL이 지나 시작 표식이 스스로 만료돼도 진행 중인 판의 코드는 여전히 ROOM_ALREADY_STARTED다', async () => {
    const { io, roomCode } = await startRealSession('ac02b-host', 'ac02b-join')

    assert.equal(isStartedRoomMark(`code:${roomCode}`), true, '전제: 시작 표식이 남아 있어야 한다')

    await withClockAdvancedPastMarkTtl(async () => {
        assert.equal(isStartedRoomMark(`code:${roomCode}`), false, 'TTL이 지났는데 표식이 살아 있다')

        const outsider = connect(io, 'ac02b-outsider')
        await handleJoinRoomByCode(io, outsider, 'ac02b-outsider', roomCode)

        const failure = lastJoinFailure(outsider)
        assert.equal(
            failure?.code, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED,
            '표식이 만료되자 진행 중인 판이 "코드 불일치"로 바뀌었다',
        )
    })
})

test('F-24(AC-02): 종료 뒤 첫 이탈은 코드 예약을 풀지 않고, 마지막 이탈과 표식 만료가 모두 지나야 재발급된다', async () => {
    const { io, hostSocket, joinerSocket, roomCode } =
        await startRealSession('ac02c-host', 'ac02c-join')
    const gameId = liveSession('ac02c-join').id

    const fixed = { generator: () => roomCode, isReserved: isRoomCodeReserved }
    assert.equal(generateUniqueRoomCode(new Map(), fixed), null, '진행 중인 판의 코드가 재발급됐다')

    gameSessionCore.__testables.finalizeGameSession(liveSession('ac02c-join'), { winner: 'CITIZEN' })

    assert.equal(await leaveGameSession(hostSocket, gameId), true)
    assert.notEqual(
        gameSessionCore.getRoomCodeSessionState({ roomCode }), null,
        '한 명이 나갔다고 세션이 사라졌다 — 남은 참가자의 결과 화면이 코드를 잃는다',
    )
    assert.equal(generateUniqueRoomCode(new Map(), fixed), null, '첫 이탈만으로 코드 예약이 풀렸다')

    assert.equal(await leaveGameSession(joinerSocket, gameId), true)
    assert.equal(
        gameSessionCore.getRoomCodeSessionState({ roomCode }), null,
        '마지막 참가자가 나갔는데 세션이 남아 있다',
    )
    assert.equal(isStartedRoomMark(`code:${roomCode}`), true)
    assert.equal(generateUniqueRoomCode(new Map(), fixed), null, '표식이 유효한데 코드가 재발급됐다')

    await withClockAdvancedPastMarkTtl(async () => {
        assert.equal(
            generateUniqueRoomCode(new Map(), fixed), roomCode,
            '모든 예약이 사라졌는데도 코드가 재발급되지 않았다',
        )
    })
})

test('F-24(AC-02): 연결이 교체돼도 기존 참가자는 코드 없이 같은 판으로 복원되고, 교체된 옛 연결은 거부된다', async () => {
    const { io, joinerSocket, roomCode } = await startRealSession('ac02f-host', 'ac02f-join')
    const gameId = liveSession('ac02f-join').id
    const channelId = liveSession('ac02f-join').channelId

    const replacement = createFakeSocket('ac02f-join', { id: 'sock-ac02f-join-reconnected' })
    io.sockets.sockets.delete(joinerSocket.id)
    io.sockets.sockets.set(replacement.id, replacement)
    gameSessionSocketLayer.setOnlineUsersRegistry(new Map([
        ['ac02f-host', 'sock-ac02f-host'],
        ['ac02f-join', replacement.id],
    ]))

    await gameSessionSocketLayer.resyncSessionRouting(replacement, 'ac02f-join')
    gameSessionSocketLayer.registerGameHandlers(io, replacement, 'ac02f-join')

    const restored = countingCallback()
    replacement.trigger('get_session_snapshot', { gameId }, restored.callback)
    const snapshot = restored.getResponse()
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot))
    assert.equal(snapshot.gameId, gameId)
    assert.equal(snapshot.roomCode, roomCode, '교체 연결이 그 판의 코드를 되찾지 못했다')
    assert.equal(replacement.rooms.has(channelId), true, '교체 연결이 게임 채널에 다시 붙지 않았다')

    const stale = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(
        io, joinerSocket, 'ac02f-join', { gameId }, stale.callback,
    )
    assert.equal(stale.getResponse().ok, false)
    assert.equal(stale.getResponse().code, 'STALE_SOCKET')
})

test('F-24(AC-02): 종료된 판의 코드는 진행 중과 구분되는 SESSION_ENDED로 거부된다', async () => {
    const { io, roomCode } = await startRealSession('ac02d-host', 'ac02d-join')

    gameSessionCore.__testables.finalizeGameSession(liveSession('ac02d-join'), { winner: 'CITIZEN' })

    const outsider = connect(io, 'ac02d-outsider')
    await handleJoinRoomByCode(io, outsider, 'ac02d-outsider', roomCode)

    const failure = lastJoinFailure(outsider)
    assert.equal(failure?.code, ROOM_JOIN_ERROR_CODES.SESSION_ENDED, JSON.stringify(failure))
    assert.equal(matchmakingState().playerRoom.has('ac02d-outsider'), false)

    assert.equal(
        generateUniqueRoomCode(new Map(), { generator: () => roomCode, isReserved: isRoomCodeReserved }),
        null,
        '종료된 판의 코드가 곧바로 재발급됐다',
    )
})

test('F-24(AC-02): 기존 참가자는 코드가 아니라 서버 참가 매핑으로 복원되고, 배제된 계정은 코드가 있어도 복원되지 않는다', async () => {
    const { io, joinerSocket, roomCode } = await startRealSession('ac02e-host', 'ac02e-join')

    const ok = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(io, joinerSocket, 'ac02e-join', {}, ok.callback)
    assert.equal(ok.getResponse().ok, true)

    const outsider = connect(io, 'ac02e-outsider')
    gameSessionSocketLayer.registerGameHandlers(io, outsider, 'ac02e-outsider')
    const denied = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(
        io, outsider, 'ac02e-outsider', { roomCode }, denied.callback,
    )
    const response = denied.getResponse()
    assert.equal(response.ok, false)
    for (const key of ['players', 'self', 'phase', 'roomCode']) {
        assert.equal(Object.hasOwn(response, key), false, `거부 응답에 ${key}가 실렸다`)
    }
})

test('F-24(AC-03): 등록된 join_room_by_code는 비객체·무인자·관전 의도 입력을 INVALID_REQUEST로 거부하고 socket.join을 한 번도 부르지 않는다', async () => {
    const hostSocket = createFakeSocket('ac03-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'ac03-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, true)

    const rejected = [
        ['spectator=true', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, spectator: true })],
        ['spectator=false', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, spectator: false })],
        ['role', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, role: 'spectator' })],
        ['mode', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, mode: 'spectator' })],
        ['options', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, options: {} })],
        ['빈 roomId', (socket) => socket.trigger('join_room_by_code', { roomCode: created.room.roomCode, roomId: '' })],
        ['null', (socket) => socket.trigger('join_room_by_code', null)],
        ['배열', (socket) => socket.trigger('join_room_by_code', [])],
        ['문자열', (socket) => socket.trigger('join_room_by_code', 'AB2C3D')],
        ['undefined', (socket) => socket.trigger('join_room_by_code', undefined)],
        ['무인자', (socket) => socket.trigger('join_room_by_code')],
    ]

    for (const [index, [label, send]] of rejected.entries()) {
        const socket = connect(io, `ac03-outsider-${index}`)
        const uuid = socket.id.replace('sock-', '')
        const joinCalls = []
        const originalJoin = socket.join.bind(socket)
        socket.join = (roomId) => {
            joinCalls.push(roomId)
            return originalJoin(roomId)
        }

        matchmaking.registerMatchmakingHandlers(io, socket, uuid)
        send(socket)
        const failure = lastJoinFailure(socket)
        assert.equal(
            failure?.code, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
            `거부되지 않았다: ${label} → ${JSON.stringify(failure)}`,
        )
        assert.equal(failure.message, matchmaking.JOIN_REQUEST_INVALID_MESSAGE)
        assert.deepEqual(joinCalls, [], `거부된 요청(${label})이 socket.join을 불렀다`)
        assert.equal(socket.rooms.size, 0, `거부된 요청이 채널에 가입했다: ${label}`)
        assert.equal(socket.emitted.filter((e) => e.event === 'room_joined').length, 0)
        assert.equal(matchmakingState().playerRoom.has(uuid), false)
    }

    assert.equal(matchmakingState().gameRooms.get(created.room.roomId).players.length, 1)
})

test('F-24(AC-03): 허용 형태의 요청은 그대로 통과해 실제로 입장한다(거부가 정상 경로를 막지 않는다)', async () => {
    const hostSocket = createFakeSocket('ac03b-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'ac03b-host',
        validSettingsPayload({ accessType: 'code', maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    const joiner = connect(io, 'ac03b-join')
    matchmaking.registerMatchmakingHandlers(io, joiner, 'ac03b-join')
    joiner.trigger('join_room_by_code', { roomCode: created.room.roomCode, roomId: created.room.roomId })
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(lastJoinFailure(joiner), null, '정상 요청이 거부됐다')
    assert.equal(matchmakingState().playerRoom.get('ac03b-join'), created.room.roomId)
})

test('F-24(AC-03): 코드 누락은 형태 오류가 아니라 기존 CODE_REQUIRED 경로를 유지한다', async () => {
    const socket = createFakeSocket('ac03c-user')
    const io = createFakeIo([socket])
    matchmaking.registerMatchmakingHandlers(io, socket, 'ac03c-user')

    socket.trigger('join_room_by_code', {})
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(lastJoinFailure(socket)?.code, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED)
})

test('F-24(AC-03): 형태 판정 자체는 값이 아니라 "무엇을 보냈는가"만 본다', () => {
    assert.deepEqual(
        validateJoinRoomByCodeRequest({ roomCode: 'AB2C3D' }),
        { ok: true, roomCode: 'AB2C3D', roomId: null },
    )
    assert.deepEqual(
        validateJoinRoomByCodeRequest({ roomCode: 'AB2C3D', roomId: 'room-1' }),
        { ok: true, roomCode: 'AB2C3D', roomId: 'room-1' },
    )
    assert.equal(validateJoinRoomByCodeRequest({ roomCode: '' }).ok, true)
    for (const payload of [null, undefined, [], 'x', 7, { roomCode: 'AB2C3D', extra: 1 }]) {
        assert.equal(validateJoinRoomByCodeRequest(payload).ok, false, JSON.stringify(payload))
    }
})

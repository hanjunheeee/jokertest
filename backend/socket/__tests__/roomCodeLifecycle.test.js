// F-24 (AC-01 / AC-02 / AC-03) — 방 코드의 수명과 코드 참가 경계를 **실제 요청 경로**로 확인한다.
//
// 세 가지를 붙잡는다.
//   AC-01  시작·재접속 payload에 그 판의 코드가 실려, 진행 중·종료 직후 화면이 보여줄 값이 있다.
//   AC-02  진행/종료된 판의 코드로는 신규 참가가 거부되고, 그 코드는 새 방에 재발급되지 않는다.
//          기존 참가자의 재접속은 코드가 아니라 서버 참가 매핑으로만 복원된다.
//   AC-03  코드 참가 요청은 **등록 경계**에서 형태가 판정되고, 거부는 어떤 소속도 만들지 않는다.
//
// 대역은 사용자 조회·외형 조회·초대 정리 세 개(전부 실제 MySQL을 요구하는 바깥 경계)뿐이다.
// 코드 생성·예약·입장 판정·세션 registry는 전부 실제 코드가 돈다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')
const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocketLayer = require('../gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../roomJoinErrors')
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
} = require('./testHelpers/matchmakingFixtures')

const {
    handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame,
    validateJoinRoomByCodeRequest, isRoomCodeReserved,
} = matchmaking.__testables

/** spectatorAccess.test.js와 같은 관례의 registry(권한의 근거가 아니라 id 조회일 뿐이다). */
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

/** 실제 create_room → join_room_by_code → set_ready → start_game 으로 2인 판을 시작한다. */
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

/** 이 소켓이 받은 room_join_failed 중 마지막 것. */
function lastJoinFailure(socket) {
    const failures = socket.emitted.filter((entry) => entry.event === 'room_join_failed')
    return failures.length > 0 ? failures[failures.length - 1].payload : null
}

/** 스냅샷은 entries 배열을 돌려준다 — 조회 편의를 위해 Map으로 되돌린다. */
function matchmakingState() {
    const snapshot = matchmaking.__getStateSnapshotForTests()
    return {
        gameRooms: new Map(snapshot.gameRooms),
        playerRoom: new Map(snapshot.playerRoom),
    }
}

/**
 * 지금 registry에 살아 있는 **실제** 세션 객체를 얻는다.
 *
 * 스냅샷(__getStateSnapshotForTests)은 사본이라 그것을 바꿔도 registry는 그대로다. 유예 대상
 * 조회는 순수 조회이면서 살아 있는 참조를 돌려주므로, 여기서 그 통로를 빌려 쓴다.
 */
function liveSession(uuid) {
    const target = gameSessionCore.getDisconnectGraceTarget(uuid)
    assert.ok(target, `살아 있는 세션을 찾지 못했다: ${uuid}`)
    return target.session
}

// ── AC-01: 코드가 시작·재접속 payload까지 이어진다 ────────────────────────────

test('F-24(AC-01): 시작 payload와 재접속 스냅샷이 대기방과 같은 방 코드를 싣는다', async () => {
    const { io, hostSocket, joinerSocket, roomCode } = await startRealSession('ac01-host', 'ac01-join')

    // 시작 payload — 참가자 각자가 받은 개인 game_started에 같은 코드가 있어야 한다.
    for (const socket of [hostSocket, joinerSocket]) {
        const started = socket.emitted.find((entry) => entry.event === 'game_started')
        assert.ok(started, '참가자가 game_started를 받지 못했다')
        assert.equal(started.payload.state.roomCode, roomCode)
    }

    // 재접속(새로고침) 경로 — 서버 참가 매핑만으로 같은 값을 다시 얻는다.
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

// ── AC-02: 진행·종료된 판의 코드 ─────────────────────────────────────────────

test('F-24(AC-02): 진행 중인 판의 코드로 들어오려는 외부 계정은 ROOM_ALREADY_STARTED로 거부되고 어떤 소속도 생기지 않는다', async () => {
    const { io, roomCode } = await startRealSession('ac02-host', 'ac02-join')

    const outsider = connect(io, 'ac02-outsider')
    await handleJoinRoomByCode(io, outsider, 'ac02-outsider', roomCode)

    const failure = lastJoinFailure(outsider)
    assert.equal(failure?.code, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, JSON.stringify(failure))
    // 거부는 채널 가입도 소속도 만들지 않는다.
    assert.equal(outsider.rooms.size, 0)
    assert.equal(outsider.emitted.filter((e) => e.event === 'room_joined').length, 0)
    assert.equal(matchmakingState().playerRoom.has('ac02-outsider'), false)
})

test('F-24(AC-02): 시작 표식이 만료돼도 진행 중인 판의 코드는 여전히 ROOM_ALREADY_STARTED다', async () => {
    const { io, roomCode } = await startRealSession('ac02b-host', 'ac02b-join')

    // 표식만 지운다(세션은 그대로 진행 중이다) — TTL 만료와 같은 상태를 만든다.
    matchmaking.__resetStartedRoomMarksForTests()

    const outsider = connect(io, 'ac02b-outsider')
    await handleJoinRoomByCode(io, outsider, 'ac02b-outsider', roomCode)

    const failure = lastJoinFailure(outsider)
    assert.equal(
        failure?.code, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED,
        '표식이 사라지자 진행 중인 판이 "코드 불일치"로 바뀌었다',
    )
})

test('F-24(AC-02): 진행 중인 판의 코드는 새 방에 재발급되지 않고, 모든 예약이 사라진 뒤에는 다시 쓸 수 있다', async () => {
    const { roomCode } = await startRealSession('ac02c-host', 'ac02c-join')

    // 생성기를 고정해 "그 코드밖에 못 뽑는" 상황을 만든다 — 예약이 있으면 retry를 소진하고
    // null이 나와야 하고(그 경우 방 생성 자체가 실패한다), 예약이 없으면 그대로 발급된다.
    const fixed = { generator: () => roomCode, isReserved: isRoomCodeReserved }
    assert.equal(generateUniqueRoomCode(new Map(), fixed), null, '진행 중인 판의 코드가 재발급됐다')

    // 세션과 표식이 모두 사라지면 예약도 사라진다.
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStartedRoomMarksForTests()
    assert.equal(generateUniqueRoomCode(new Map(), fixed), roomCode, '예약이 없는데도 재발급되지 않았다')
})

test('F-24(AC-02): 종료된 판의 코드는 진행 중과 구분되는 SESSION_ENDED로 거부된다', async () => {
    const { io, roomCode } = await startRealSession('ac02d-host', 'ac02d-join')

    // 실제 종결 경로(finalizeGameSession)로 ENDED를 만든다 — phase만 손으로 바꾸면 winResult가
    // 없는, 프로덕션에 존재하지 않는 상태가 된다.
    gameSessionCore.__testables.finalizeGameSession(liveSession('ac02d-join'), { winner: 'CITIZEN' })

    const outsider = connect(io, 'ac02d-outsider')
    await handleJoinRoomByCode(io, outsider, 'ac02d-outsider', roomCode)

    const failure = lastJoinFailure(outsider)
    assert.equal(failure?.code, ROOM_JOIN_ERROR_CODES.SESSION_ENDED, JSON.stringify(failure))
    assert.equal(matchmakingState().playerRoom.has('ac02d-outsider'), false)

    // 종료된 판의 코드도 registry에 남아 있는 동안은 예약이다(A-09).
    assert.equal(
        generateUniqueRoomCode(new Map(), { generator: () => roomCode, isReserved: isRoomCodeReserved }),
        null,
        '종료된 판의 코드가 곧바로 재발급됐다',
    )
})

test('F-24(AC-02): 기존 참가자는 코드가 아니라 서버 참가 매핑으로 복원되고, 배제된 계정은 코드가 있어도 복원되지 않는다', async () => {
    const { io, joinerSocket, roomCode } = await startRealSession('ac02e-host', 'ac02e-join')

    // 적격 참가자: 코드를 쓰지 않고 스냅샷만으로 같은 판을 복원한다.
    const ok = countingCallback()
    gameSessionSocketLayer.__testables.handleGetSessionSnapshot(io, joinerSocket, 'ac02e-join', {}, ok.callback)
    assert.equal(ok.getResponse().ok, true)

    // 그 판의 참가자가 아닌 계정은 코드를 알아도 스냅샷을 받지 못한다(공개 상태도 없다).
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

// ── AC-03: 등록 경계의 형태 판정 ──────────────────────────────────────────────

test('F-24(AC-03): 등록된 join_room_by_code는 roomCode·roomId 외 최상위 키를 INVALID_REQUEST로 거부한다', async () => {
    const hostSocket = createFakeSocket('ac03-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'ac03-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, true)

    const rejected = [
        { roomCode: created.room.roomCode, spectator: true },
        { roomCode: created.room.roomCode, spectator: false },
        { roomCode: created.room.roomCode, role: 'spectator' },
        { roomCode: created.room.roomCode, mode: 'spectator' },
        { roomCode: created.room.roomCode, options: {} },
        { roomCode: created.room.roomCode, roomId: '' },
        null,
        [],
        'AB2C3D',
    ]

    for (const payload of rejected) {
        const socket = connect(io, `ac03-outsider-${rejected.indexOf(payload)}`)
        const uuid = socket.id.replace('sock-', '')
        matchmaking.registerMatchmakingHandlers(io, socket, uuid)
        socket.trigger('join_room_by_code', payload)
        // 등록 경계의 거부는 동기다 — await 없이 이미 응답이 나가 있어야 한다.
        const failure = lastJoinFailure(socket)
        assert.equal(
            failure?.code, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
            `거부되지 않았다: ${JSON.stringify(payload)} → ${JSON.stringify(failure)}`,
        )
        assert.equal(failure.message, matchmaking.JOIN_REQUEST_INVALID_MESSAGE)
        // 거부가 socket.join·room_joined·소속을 하나도 만들지 않았다.
        assert.equal(socket.rooms.size, 0, `거부된 요청이 채널에 가입했다: ${JSON.stringify(payload)}`)
        assert.equal(socket.emitted.filter((e) => e.event === 'room_joined').length, 0)
        assert.equal(matchmakingState().playerRoom.has(uuid), false)
    }

    // 방은 그대로다 — 거부된 요청들이 정원이나 명단을 건드리지 않았다.
    assert.equal(matchmakingState().gameRooms.get(created.room.roomId).players.length, 1)
})

test('F-24(AC-03): 허용 형태의 요청은 그대로 통과해 실제로 입장한다(거부가 정상 경로를 막지 않는다)', async () => {
    const hostSocket = createFakeSocket('ac03b-host')
    const io = createFakeIo([hostSocket])
    // 목록에서 고른 비밀 방을 지목하는 요청(roomCode + roomId)이 허용 형태의 상한이다 —
    // 그 방은 실제로 accessType='code'여야 기존 입장 계약을 통과한다.
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'ac03b-host',
        validSettingsPayload({ accessType: 'code', maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    const joiner = connect(io, 'ac03b-join')
    matchmaking.registerMatchmakingHandlers(io, joiner, 'ac03b-join')
    joiner.trigger('join_room_by_code', { roomCode: created.room.roomCode, roomId: created.room.roomId })
    // 등록 리스너는 비동기 핸들러를 부르므로 정착을 기다린다.
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
    // 값 검증은 여기서 하지 않는다 — 빈 코드는 형태로는 정상이고 CODE_REQUIRED 경로로 간다.
    assert.equal(validateJoinRoomByCodeRequest({ roomCode: '' }).ok, true)
    for (const payload of [null, undefined, [], 'x', 7, { roomCode: 'AB2C3D', extra: 1 }]) {
        assert.equal(validateJoinRoomByCodeRequest(payload).ok, false, JSON.stringify(payload))
    }
})

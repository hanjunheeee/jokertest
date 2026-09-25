// AC-04 / SPLIT-2 — "게임 참가자가 아닌 사용자는 관전 목적으로 입장하거나 공개 상태를
// 구독할 수 없다"를 **실제 요청 경계와 실제 수신 기록**으로 확인한다.
//
// 이 파일이 다른 스위트와 다른 점은 두 가지다.
//   1. 제외 대상의 수신 0을 단언할 때 **같은 사건의 정상 수신 1**을 항상 함께 단언한다.
//      제외 대상만 검사하면 전달기가 아무에게도 보내지 않는 결함을 그대로 통과시킨다(A-05).
//   2. 수신은 io.broadcasts(발신 시도 기록)가 아니라 소켓의 received(실제 전달)로만 센다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
// CO S-1(AC-02): 게임 시작 경로가 계정 전적 저장소도 호출한다 — 대역이 없으면 이 순수 단위
// 스위트가 실제 MySQL 접속을 시도한다(economyService 대역과 같은 이유).
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})

// 게임 시작·방 소멸에서 fire-and-forget으로 도는 초대 정리는 실제 MySQL을 요구한다.
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
    handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame, handleAcceptGameInvite,
} = matchmaking.__testables
const {
    handleLeaveGameSession,
    handleGetSessionSnapshot,
    finalizeGameSessionEnd,
    __setEvaluateAchievementsForTests,
} = gameSessionSocketLayer.__testables

/**
 * 미등록 uuid에도 관례적인 socket id(`sock-${uuid}`)를 돌려주는 registry.
 *
 * gameSession.test.js와 같은 관례다. **권한의 근거는 아니다** — 이 registry가 id를 돌려줘도,
 * namespace에 그 id로 등록된 객체가 바로 그 소켓이어야만 canonical로 인정된다(AC-04).
 */
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

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    // 실제 업적 평가는 DB를 친다 — 늦게 정착한 거부가 다음 시험에 섞이지 않게 즉시 끝내는 대역을 둔다.
    __setEvaluateAchievementsForTests(async () => {})
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
    __setEvaluateAchievementsForTests()
})

/** 이 계정의 연결을 만들어 io에 **실제로 등록**한다(등록되지 않은 객체는 canonical이 아니다). */
function connect(io, uuid, options = {}) {
    const socket = createFakeSocket(uuid, options)
    io.sockets.sockets.set(socket.id, socket)
    return socket
}

/** 실제 create_room → join_room_by_code → set_ready → start_game 경로로 2인 판을 시작한다. */
async function startRealTwoPlayerSession(hostUuid, joinerUuid) {
    const hostSocket = createFakeSocket(hostUuid)
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
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
    // 실제 배선(연결 소유권 기록 포함)을 등록한다.
    gameSessionSocketLayer.registerGameHandlers(io, hostSocket, hostUuid)
    gameSessionSocketLayer.registerGameHandlers(io, joinerSocket, joinerUuid)
    return { io, hostSocket, joinerSocket, room: created.room, gameId: started.gameId, channelId: created.room.roomId }
}

// ═══════════════════════════════════════════════════════════════════════════
// AC-04 — 입장 거부 (방 코드 · 공개 목록)
// ═══════════════════════════════════════════════════════════════════════════

test('AC-04: 시작된 방의 코드로 들어오려는 외부 계정은 거부되고 어떤 소속도 생기지 않는다', async () => {
    const { io, room, channelId } = await startRealTwoPlayerSession('spec-h1', 'spec-j1')
    const outsider = connect(io, 'spec-out1')

    await handleJoinRoomByCode(io, outsider, 'spec-out1', room.roomCode)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.some(([id]) => id === room.roomId), false, '시작된 방은 대기방 registry에 남지 않는다')
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === 'spec-out1'), false)
    assert.equal(outsider.rooms.has(channelId), false, '거부된 요청은 방송 채널에도 남지 않는다')
    // 거부 사유는 클라이언트에게 실제로 전달된다.
    assert.equal(outsider.countReceived('room_join_failed') >= 1, true)
    assert.equal(outsider.countReceived('room_joined'), 0)
})

// ═══════════════════════════════════════════════════════════════════════════
// AC-04 — 공개 상태 구독 거부 (get_session_snapshot · 실제 방송 수신)
// ═══════════════════════════════════════════════════════════════════════════

test('AC-04: 참가자가 아닌 계정의 get_session_snapshot은 공개 상태를 하나도 돌려주지 않는다(정상 참가자는 성공한다)', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h2', 'spec-j2')
    const outsider = connect(io, 'spec-out2')
    gameSessionSocketLayer.registerGameHandlers(io, outsider, 'spec-out2')

    const denied = countingCallback()
    handleGetSessionSnapshot(io, outsider, 'spec-out2', { gameId }, denied.callback)
    const deniedResponse = denied.getResponse()

    assert.equal(deniedResponse.ok, false)
    // 실패 응답에는 phase·players·winResult 같은 공개 상태가 한 조각도 실리지 않는다.
    assert.deepEqual(Object.keys(deniedResponse).sort(), ['code', 'message', 'ok'])

    // 양성 대조 — 같은 요청을 정상 참가자가 보내면 성공한다.
    const allowed = countingCallback()
    handleGetSessionSnapshot(io, hostSocket, 'spec-h2', { gameId }, allowed.callback)
    assert.equal(allowed.getResponse().ok, true)
})

test('AC-04: 위조로 게임 채널에 가입한 외부 계정은 공개 사건을 실제로 한 건도 받지 못한다(참가자는 받는다)', async () => {
    const { io, hostSocket, joinerSocket, gameId, channelId } = await startRealTwoPlayerSession('spec-h3', 'spec-j3')
    const outsider = connect(io, 'spec-out3')
    // 클라이언트가 스스로 채널에 들어온 상태를 흉내낸다(서버 판정이 유일한 경계여야 한다).
    outsider.rooms.add(channelId)

    const before = {
        host: hostSocket.countReceived('player_eliminated'),
        joiner: joinerSocket.countReceived('player_eliminated'),
    }
    // 실제 생산 경로로 공개 사건을 만든다 — 시험이 결과 이름을 직접 emit하지 않는다.
    const leave = countingCallback()
    handleLeaveGameSession(io, joinerSocket, 'spec-j3', { gameId }, leave.callback)
    assert.equal(leave.getResponse().ok, true)

    assert.equal(outsider.countReceived('player_eliminated'), 0, '채널 가입만으로 공개 사건을 받으면 안 된다')
    assert.equal(outsider.countReceived('session_participation_changed'), 0)
    // 양성 대조 — 적격 잔류자는 같은 사건을 정확히 한 번 받는다.
    assert.equal(hostSocket.countReceived('player_eliminated') - before.host, 1)
    assert.equal(joinerSocket.countReceived('player_eliminated') - before.joiner, 0,
        '이탈을 커밋한 계정은 그 첫 공개 사건부터 받지 않는다')
})

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-2 — 이탈 후 제외 대상의 실제 수신 0 / 잔류자의 실제 수신 1
// ═══════════════════════════════════════════════════════════════════════════

test('SPLIT-2: 이탈 커밋 뒤 이탈자는 첫 공개 사건부터 실제 수신 0이고 적격 잔류자는 1이다', async () => {
    const { io, hostSocket, joinerSocket, gameId } = await startRealTwoPlayerSession('spec-h4', 'spec-j4')

    const leave = countingCallback()
    handleLeaveGameSession(io, hostSocket, 'spec-h4', { gameId }, leave.callback)

    assert.equal(leave.getResponse().ok, true)
    assert.equal(hostSocket.countReceived('session_participation_changed'), 0)
    assert.equal(joinerSocket.countReceived('session_participation_changed'), 1)
    assert.ok(io)
})

// ═══════════════════════════════════════════════════════════════════════════
// AC-04 — 연결 소유권 (namespace 제거 후 disconnect · 활성 요청 권한과의 분리)
// ═══════════════════════════════════════════════════════════════════════════

/** 실제 Socket.IO의 _onclose 순서를 재현한다: namespace 제거 → rooms 비움 → connected=false. */
function simulateSocketIoClose(io, socket) {
    io.sockets.sockets.delete(socket.id)
    socket.rooms.clear()
    socket.connected = false
}

test('AC-04: namespace에서 제거된 정상 disconnect는 등록 소유권으로 처리돼 재접속 유예가 시작된다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h5', 'spec-j5')

    simulateSocketIoClose(io, hostSocket)
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'spec-h5')

    assert.notEqual(
        gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h5'), undefined,
        'namespace 제거를 전부 stale로 처리하면 정상 새로고침이 유예도 종료도 얻지 못한다',
    )
})

test('AC-04: 등록 소유권이 없는 제거된 객체의 disconnect는 아무 것도 처리하지 않는다', async () => {
    const { io, gameId } = await startRealTwoPlayerSession('spec-h6', 'spec-j6')
    // registerGameHandlers를 거치지 않은(=소유권을 기록한 적 없는) 위조 객체.
    const forged = createFakeSocket('spec-h6')
    forged.data.activeGameId = gameId
    forged.connected = false

    await gameSessionSocketLayer.onDisconnect(io, forged, 'spec-h6')

    assert.equal(gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h6'), undefined)
})

test('AC-04: 같은 id의 새 객체가 등록된 뒤 도착한 옛 객체의 disconnect는 거부된다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h7', 'spec-j7')
    // 같은 id로 다른 객체가 namespace를 차지한다(연결 교체).
    const replacement = createFakeSocket('spec-h7')
    io.sockets.sockets.set(replacement.id, replacement)
    gameSessionSocketLayer.registerGameHandlers(io, replacement, 'spec-h7')

    hostSocket.connected = false
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'spec-h7')

    assert.equal(gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h7'), undefined)
})

test('AC-04: 옛 연결의 늦은 중복 disconnect는 두 번 처리되지 않는다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h8', 'spec-j8')

    simulateSocketIoClose(io, hostSocket)
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'spec-h8')
    const first = gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h8')
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'spec-h8')
    const second = gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h8')

    assert.notEqual(first, undefined)
    assert.equal(second, first)
})

test('AC-04: 제거된 소켓이 등록 소유권을 가졌어도 활성 요청은 STALE_SOCKET이다(같은 구성의 현재 연결은 성공한다)', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h9', 'spec-j9')
    simulateSocketIoClose(io, hostSocket)

    const denied = countingCallback()
    handleGetSessionSnapshot(io, hostSocket, 'spec-h9', { gameId }, denied.callback)
    assert.equal(denied.getResponse().code, 'STALE_SOCKET',
        '제거 후 disconnect를 허용하는 증거를 활성 요청 권한으로 재사용하면 안 된다')

    // 양성 대조 — 같은 계정이 다시 붙은 현재 연결은 같은 요청에 성공한다.
    const reconnected = connect(io, 'spec-h9')
    gameSessionSocketLayer.registerGameHandlers(io, reconnected, 'spec-h9')
    await gameSessionSocketLayer.resyncSessionRouting(reconnected, 'spec-h9')
    const allowed = countingCallback()
    handleGetSessionSnapshot(io, reconnected, 'spec-h9', { gameId }, allowed.callback)
    assert.equal(allowed.getResponse().ok, true)
})

test('AC-04: registry가 다시 주입되면 이전 등록 소유권은 더 이상 disconnect를 정당화하지 못한다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('spec-h10', 'spec-j10')
    simulateSocketIoClose(io, hostSocket)

    // 다른 등록부로 교체된다(런타임 재초기화·다른 시험의 주입).
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'spec-h10')

    assert.equal(gameSessionSocketLayer.__testables.getDisconnectGraceRun(gameId, 'spec-h10'), undefined)
})

// ═══════════════════════════════════════════════════════════════════════════
// AC-04 — 종료 알림의 수신 수명 (core → finalizer 계약)
// ═══════════════════════════════════════════════════════════════════════════

test('AC-04: 종료 알림은 cleanupUuids의 적격 잔류자에게만 가고 이탈자·외부인은 받지 못한다', async () => {
    const { io, hostSocket, joinerSocket, gameId, channelId } = await startRealTwoPlayerSession('spec-h11', 'spec-j11')
    const outsider = connect(io, 'spec-out11')
    outsider.rooms.add(channelId)

    // 실제 core 종료 분기를 그대로 소비한다(시험이 game_ended를 직접 만들지 않는다).
    const result = gameSessionCore.endGameSessionForPlayer('spec-h11', 'PARTICIPANT_LEFT', gameId)
    assert.equal(result.ok, true)
    assert.equal(result.sessionDeleted, true)
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().gameSessions.length, 0,
        '이 분기는 registry를 먼저 비운다 — 그래서 일반 routing 일치를 강제하면 정상 수신자가 사라진다',
    )

    finalizeGameSessionEnd(io, result.session, result.reason, 'spec-h11', result.cleanupUuids)

    // 양성 대조: cleanupUuids에 포함된 정상 연결 잔류자는 정확히 한 번 받는다.
    assert.equal(joinerSocket.countReceived('game_ended'), 1)
    assert.deepEqual(joinerSocket.received.filter((e) => e.event === 'game_ended')[0].payload,
        { gameId, reason: result.reason })
    // 이 종료를 촉발한 이탈자와 외부인은 받지 못한다.
    assert.equal(hostSocket.countReceived('game_ended'), 0)
    assert.equal(outsider.countReceived('game_ended'), 0)
})

test('AC-04: cleanupUuids가 비어 있으면 종료 알림의 적격 수신자는 아무도 없다', async () => {
    const { io, hostSocket, joinerSocket, gameId } = await startRealTwoPlayerSession('spec-h12', 'spec-j12')
    const result = gameSessionCore.endGameSessionForPlayer('spec-h12', 'PARTICIPANT_LEFT', gameId)
    assert.equal(result.ok, true)

    finalizeGameSessionEnd(io, result.session, result.reason, 'spec-h12', [])

    assert.equal(joinerSocket.countReceived('game_ended'), 0,
        'cleanupUuids 부재를 roster 전체 허용으로 대체하면 안 된다')
    assert.equal(hostSocket.countReceived('game_ended'), 0)
})

test('AC-04: 먼저 이탈해 새 대기방에 들어간 계정은 옛 종료 알림을 받지 않고, 잔류자는 그대로 받는다', async () => {
    const { io, hostSocket, joinerSocket, gameId } = await startRealTwoPlayerSession('spec-h13', 'spec-j13')

    // host가 먼저 명시적으로 이탈해 **새 대기방**을 만든다(전부 실제 경로다).
    const leave = countingCallback()
    handleLeaveGameSession(io, hostSocket, 'spec-h13', { gameId }, leave.callback)
    assert.equal(leave.getResponse().ok, true)
    const newRoom = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'spec-h13', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(newRoom.ok, true, JSON.stringify(newRoom))
    assert.equal(hostSocket.rooms.has(newRoom.room.roomId), true, '새 소속의 채널 가입이 먼저 성립해 있어야 한다')

    /**
     * SPLIT-2 양성 대조 — 새 소속의 **정상 사건이 실제로 도착한다**.
     *
     * 채널 가입만 확인하면 아래 "옛 종료 0"은 전달 경로가 통째로 끊긴 경우에도 그대로
     * 참이다(A-05). 새 방의 실제 생산 방송(다른 계정의 코드 참가 → player_joined_room)을
     * 한 번 받는 것으로만 "이 연결이 지금 살아 있는 수신자"임이 증명된다.
     */
    // 옛 방에서 이미 받은 같은 이름의 사건이 있으므로 **증가분**으로 센다.
    const joinedBefore = hostSocket.countReceived('player_joined_room')
    const newcomer = connect(io, 'spec-n13')
    await handleJoinRoomByCode(io, newcomer, 'spec-n13', newRoom.room.roomCode)
    assert.equal(newcomer.countReceived('room_joined'), 1, '전제: 새 참가자의 입장 자체가 성립해야 한다')
    assert.equal(hostSocket.countReceived('player_joined_room') - joinedBefore, 1,
        '새 소속의 정상 사건이 실제로 도착하지 않으면 "옛 종료 0"은 전달 불능과 구별되지 않는다')

    // 그 뒤 판이 종료된다. cleanupUuids에 이미 나가 새 소속을 가진 계정이 섞여 들어와도,
    // **정리 전에 고정한 제외 사실**이 그를 종료 수신 후보에서 뺀다.
    const result = gameSessionCore.endGameSessionForPlayer('spec-j13', 'PARTICIPANT_LEFT', gameId)
    assert.equal(result.ok, true)
    finalizeGameSessionEnd(io, result.session, result.reason, 'spec-x13', ['spec-h13', 'spec-j13'])

    assert.equal(hostSocket.countReceived('game_ended'), 0,
        '새 소속으로 옮긴 계정이 옛 종료 알림을 받으면 지금 보고 있는 화면이 정리되고 로비로 쫓겨난다')
    // 양성 대조 — 같은 종료 전달에서 적격 잔류자는 정확히 한 번 받는다.
    assert.equal(joinerSocket.countReceived('game_ended'), 1)
    // 그 전달이 새 소속 쪽 수신을 건드리지도 않았다(양성 대조가 한 번에 머문다).
    assert.equal(hostSocket.countReceived('player_joined_room') - joinedBefore, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// AC-04 — 초대 수락의 durable 확정 뒤 신원 검증과 자기 publication 보상 (A-07)
// ═══════════════════════════════════════════════════════════════════════════

const SPEC_INVITE_ID = 'spec-invite-1'

/**
 * 초대 SQL 경계의 최소 대역 — **publish 직후·durable 영수증 직전**에서 멈출 수 있다.
 *
 * 실제 서비스와 같은 계약만 지킨다: finalizeAcceptedEntry가 잠금 안에서 동기 publish()를
 * 부르고, 그 뒤에 durable 영수증을 쓴다. recordEntryInterrupted는 실제 구현의 조건부 UPDATE
 * 술어(attempt 소유 + entry_outcome='UNCONFIRMED')를 그대로 옮긴다 — 그래야 "역사적
 * PUBLISHED를 임의로 INTERRUPTED로 바꾸지 않는다"를 시험이 실제로 구별한다.
 */
function createAcceptGateStub({ roomId, roomInstanceId, afterPublish }) {
    let signalPublished
    const published = new Promise((resolve) => { signalPublished = resolve })
    const state = { attemptId: null, entryOutcome: null, interruptions: [] }
    return {
        state,
        published,
        async getAttemptOutcome({ inviteId }) {
            if (inviteId !== SPEC_INVITE_ID) return { known: false }
            return {
                known: true,
                staleAttempt: false,
                invite: { inviteId, status: 'PENDING', entryOutcome: state.entryOutcome },
                roomId,
                roomInstanceId,
                bootEpoch: matchmaking.__getBootEpochForTests(),
                entryOutcome: state.entryOutcome,
            }
        },
        async recordAcceptDecision({ attemptId }) {
            state.attemptId = attemptId
            state.entryOutcome = 'UNCONFIRMED'
            return { ok: true, roomId, roomInstanceId }
        },
        async finalizeAcceptedEntry({ attemptId, publish }) {
            if (state.attemptId !== attemptId) return { ok: false, code: 'STALE_ATTEMPT', published: false }
            const committed = publish()
            if (!committed.ok) {
                state.entryOutcome = 'INTERRUPTED'
                return { ok: false, code: committed.code, published: false }
            }
            signalPublished()
            await afterPublish
            state.entryOutcome = 'PUBLISHED'
            return { ok: true, alreadyPublished: false }
        },
        async recordEntryInterrupted({ attemptId, reason }) {
            state.interruptions.push({ attemptId, reason })
            if (state.attemptId !== attemptId) return false
            if (state.entryOutcome !== 'UNCONFIRMED') return false
            state.entryOutcome = 'INTERRUPTED'
            return true
        },
        async cancelPendingInvitesForRoom() { return [] },
        async cancelPendingInvitesBetween() { return [] },
    }
}

test('AC-04: durable 확정 뒤 신원이 어긋나면 성공 ACK가 0이고 자기 publication이 반드시 보상된다', async (t) => {
    const io = createFakeIo([])
    const hostSocket = connect(io, 'spec-h15')
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'spec-h15', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))
    const guestSocket = connect(io, 'spec-g15')
    const guestSocketIdAtRequest = guestSocket.id

    const [, storedRoom] = matchmaking.__getStateSnapshotForTests()
        .gameRooms.find(([id]) => id === created.room.roomId)

    let releaseAfterPublish
    const afterPublish = new Promise((resolve) => { releaseAfterPublish = resolve })
    const service = createAcceptGateStub({
        roomId: created.room.roomId, roomInstanceId: storedRoom.instanceId, afterPublish,
    })
    matchmaking.__setGameInviteServiceForTests(service)
    t.after(() => matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} }))

    const accepting = callAsPromise(
        handleAcceptGameInvite, io, guestSocket, 'spec-g15', { inviteId: SPEC_INVITE_ID },
    )

    // publish는 끝났고 영수증은 아직 없다 — 두 Map에 들어간 **미확정 소속**의 구간이다.
    await service.published
    const midway = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(midway.playerRoom.find(([uuid]) => uuid === 'spec-g15'), ['spec-g15', created.room.roomId],
        '전제: publish가 실제로 두 Map에 소속을 넣어야 이 회귀가 의미를 갖는다')

    // 영수증을 기다리는 사이 이 연결의 신원이 어긋난다(연결 객체의 id 교체).
    guestSocket.id = `${guestSocketIdAtRequest}-r2`
    releaseAfterPublish()
    const ack = await accepting

    // ① 성공 ACK는 0이다.
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true)

    // ② 자기 publication이 실제로 보상됐다 — 미확정 소속이 두 Map 어디에도 남지 않는다.
    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.playerRoom.some(([uuid]) => uuid === 'spec-g15'), false,
        '검증 실패 경로가 자기 publication을 되돌리지 않으면 유령 참가자가 방에 남는다')
    const [, roomAfter] = after.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(new Map(roomAfter.players).has('spec-g15'), false)
    assert.equal(after.roomAdmissionAttempts.some(([uuid]) => uuid === 'spec-g15'), false)

    // ③ 그 연결은 방송 채널에도 남지 않고 확정 사건을 한 건도 받지 못한다.
    assert.equal(guestSocket.rooms.has(created.room.roomId), false)
    assert.equal(guestSocket.countReceived('player_joined_room'), 0)

    // ④ 양성 대조 — 정상 참가자(방장)는 그 보상 방송을 실제로 한 번 받는다.
    assert.equal(hostSocket.countReceived('player_left_room'), 1,
        '보상이 방 인원 변화를 기존 참가자에게 알리지 않았다')

    // ⑤ 역사적 PUBLISHED는 그대로 둔다 — 영수증은 정직하게 남기고 지금 연결의 입장만 주장하지 않는다.
    assert.equal(service.state.entryOutcome, 'PUBLISHED')
    assert.deepEqual(service.state.interruptions, [])
})

test('AC-04: 한 수신자의 emit 도중 다음 대상의 참여가 끝나면 그 다음 대상은 옛 종료를 받지 않는다', async () => {
    const { io, hostSocket, joinerSocket, gameId, channelId } = await startRealTwoPlayerSession('spec-h14', 'spec-j14')

    const result = gameSessionCore.endGameSessionForPlayer('spec-x14', 'PARTICIPANT_LEFT', gameId)
    // 참가자가 아닌 uuid로는 종료되지 않는다 — 실제 참가자로 다시 종료한다.
    assert.equal(result.ok, false)
    const ended = gameSessionCore.endGameSessionForPlayer('spec-h14', 'PARTICIPANT_LEFT', gameId)
    assert.equal(ended.ok, true)

    /**
     * 첫 수신자(host)의 emit **안에서** 다음 대상(joiner)의 참여를 끝낸다.
     *
     * 전달 직전 재검사가 없으면 이 전이는 관측되지 않는다 — collectIneligibleChannelSocketIds가
     * 루프 시작 시점에 한 번 계산한 목록에는 joiner가 여전히 적격으로 들어 있기 때문이다.
     */
    let moved = false
    const originalEmit = hostSocket.emit.bind(hostSocket)
    hostSocket.emit = (event, payload) => {
        const out = originalEmit(event, payload)
        if (event === 'game_ended' && !moved) {
            moved = true
            gameSessionCore.commitParticipantDeparture(ended.session, 'spec-j14', { reason: 'PLAYER_LEFT' })
        }
        return out
    }

    finalizeGameSessionEnd(io, ended.session, ended.reason, null, ['spec-h14', 'spec-j14'])

    // 양성 대조 — 첫 대상에게는 실제로 전달됐다(전달기 자체는 동작한다).
    assert.equal(hostSocket.countReceived('game_ended'), 1)
    assert.equal(moved, true, '전이가 실제로 첫 emit 안에서 일어났다')
    assert.equal(joinerSocket.countReceived('game_ended'), 0,
        '한 번 계산한 제외 목록만으로 개별 전송을 확정하면 이 전이를 놓친다')
    assert.equal(channelId.length > 0, true)
})

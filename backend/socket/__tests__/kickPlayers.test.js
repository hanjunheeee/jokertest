/**
 * F-21: 방장 추방(kick_room_player · kick_game_player · get_kick_result)의 소켓 계약 검증.
 *
 * 방·세션은 실제 handleCreateRoom/handleJoinRoomByCode/handleSetReady/handleStartGame과
 * 실제 prepareGameSession/commitGameSession으로 만든다 — registry를 손으로 심지 않는다.
 * 대역은 SQL(userRepository·economyService·gameInviteService)과 소켓 전송뿐이고, 권한·영수증·
 * 소속·경합 판정은 전부 프로덕션 경로 그대로 돈다.
 */

// backend/models는 require 시점에 DATABASE_URL을 **파싱만** 한다(연결은 시도하지 않는다).
// 같은 디렉터리의 다른 스위트와 같은 관례로 더미 폴백을 둔다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')
const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const kickReceiptStore = require('../kickReceiptStore')
const channelMembership = require('../channelMembership')

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
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

/**
 * createFakeSocket의 기본 규약(socket.id === `sock-${uuid}`)을 그대로 따르는 registry.
 * canonical 소켓 교체 자체를 검증하는 시험만 실제 Map을 명시적으로 주입한다.
 * (backend/socket/__tests__/gameSession.test.js의 같은 헬퍼와 같은 이유·같은 구현이다.)
 */
function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            return Reflect.get(target, prop, receiver)
        },
    })
}

/** 대기방 추방의 getCurrentSocketId 주입값 — 위 registry와 같은 규약을 쓴다. */
const conventionSocketId = (uuid) => `sock-${uuid}`

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    // 낮 투표 제출은 D-09 참여 저장과 F-12 업적 평가를 부른다 — 둘 다 실제 DB 왕복이라
    // 대역으로 갈아끼운다(판정·방송 경로는 프로덕션 그대로 돈다).
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

// ── 공통 픽스처 ──────────────────────────────────────────────────────────────

let requestSeq = 0
function nextRequestId() {
    requestSeq += 1
    return `kick-req-${requestSeq}`
}

/** 서버가 들고 있는 방 상태의 **깊은** 복사본 — 참조 비교로 무변경을 오판하지 않는다. */
function snapshotRooms() {
    return JSON.stringify(matchmaking.__getStateSnapshotForTests())
}

/**
 * host + joiner들로 실제 대기방 하나를 만든다. 모든 값(roomInstanceId·bootEpoch·membershipId)은
 * **서버 응답에서만** 읽는다 — 테스트가 registry를 몰래 들여다보면 공개 계약을 검증하지 못한다.
 */
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

/** 방 응답에서 그 uuid의 현재 참가자 항목을 찾는다. */
function seatOf(room, uuid) {
    return room.players.find((player) => player.uuid === uuid)
}

/** kick_room_player payload — 값은 전부 서버 응답에서 온다. */
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

/** handleKickRoomPlayer는 callback을 마지막에서 두 번째로 받는다(뒤에 getCurrentSocketId). */
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

/**
 * 결정적인 진행 중 세션 하나. 역할 배정이 고정돼야 "추방과 일반 이탈의 결과가 같다"를
 * 두 세션 사이에서 비교할 수 있다(randomFn 고정).
 */
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
    // ROLE_REVEAL에서 벗어나 평범한 낮으로 둔다 — 이 스위트가 보려는 것은 역할 확인 전이가
    // 아니라 이탈 그 자체다.
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

/** 대기 중인 microtask(비동기 leave 거부 처리 등)를 흘려보낸다. */
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

/** fake socket에 disconnect 기록기를 붙인다(헬퍼의 기본 socket에는 없는 메서드다). */
function trackDisconnect(socket) {
    const calls = []
    socket.disconnect = (close) => { calls.push(close) }
    return calls
}

/**
 * 진행 중인 세션 하나를 **DAY_VOTE 구간**에 세우고 참가자별 소켓까지 배선한다.
 * 상태는 전부 실제 core 전이(enterDayPhase → enterDayVotePhase)로만 만든다.
 */
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

/** 실제 cast_day_vote 핸들러로 한 표를 제출한다. */
function castDayVote(io, sockets, uuid, gameId, targetId) {
    return callAsPromise(
        gameSessionSocketLayer.__testables.handleSubmitDayVote,
        io, sockets[uuid], uuid, { gameId, targetId },
    )
}

/** 실제 cast_tribunal_vote 핸들러로 한 표를 제출한다(동기 ack다). */
function castTribunalVote(io, sockets, uuid, session, vote) {
    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleCastTribunalVote(
        io, sockets[uuid], uuid, { gameId: session.id, dayIndex: session.dayIndex, vote }, callback,
    )
    const response = getResponse()
    assert.equal(response.ok, true, JSON.stringify(response))
    return response
}

/** 참가자 소켓들이 직접 받은 그 이벤트의 총 수(채널 방송이 아니라 개별 emit 경로다). */
function deliveredCount(sockets, event) {
    return Object.values(sockets)
        .reduce((total, socket) => total + socket.emitted.filter((e) => e.event === event).length, 0)
}

function clearDelivered(sockets) {
    for (const socket of Object.values(sockets)) socket.emitted.length = 0
}

// ═════════════════════════════════════════════════════════════════════════════
// AC-01 — 방장이 아닌 사용자의 추방 요청은 거부된다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-01(대기방): 방장이 아닌 참가자의 추방 요청은 NOT_HOST로 거부되고 서버 상태·방송이 전혀 바뀌지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-1', ['kj-1', 'kj-2'])
    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    // 비방장이 payload의 requesterMembershipId에 **방장의 소속을 위조**해 넣어도 통하지 않는다 —
    // 신원은 인증 경계가 넘겨준 uuid 하나뿐이다.
    const forged = roomKickPayload(room, 'kh-1', 'kj-2')
    const { response, calls } = kickRoomPlayer(io, sockets['kj-1'], 'kj-1', forged)

    assert.equal(calls, 1)
    assert.equal(response.ok, false)
    // 위조한 소속이 요청자 본인의 것이 아니므로 소속 검사가 먼저 걸린다 — 어느 쪽이든 거부다.
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
        // 같은 계정의 새 로그인이 canonical 소켓을 가져간 상태를 재현한다.
        (uuid) => (uuid === 'kh-3' ? 'sock-new-login' : `sock-${uuid}`),
    )

    assert.equal(response.code, CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)
})

test('AC-01(대기방): 다른 방을 가리키는 요청은 ROOM_NOT_FOUND이고 그 방도 이 방도 바뀌지 않는다', async () => {
    const a = await setupRoom('kh-4', ['kj-6'])
    const b = await setupRoom('kh-5', ['kj-7'])
    const before = snapshotRooms()

    // A의 방장이 B의 방 식별자로 B의 참가자를 추방하려 한다.
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

    // 자기 소속으로 정직하게 보낸 비방장 요청이다 — 소속 검사는 통과하고 **권한 검사에서만**
    // 막힌다는 것을 고정한다(위조 payload는 그 아래에서 따로 본다).
    const honest = kickGamePlayer(io, createFakeSocket('g1-b'), 'g1-b', gameKickPayload(session, 'g1-b', 'g1-c'))
    assert.equal(honest.response.code, CODES.NOT_HOST)

    // 방장의 소속을 위조해 넣어도 통하지 않는다 — 신원은 인증 경계가 넘겨준 uuid 하나뿐이다.
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

    // 방장이 스스로 나가면 아직 참여 중인 첫 참가자가 새 방장이 된다.
    handleLeaveGameSession(io, createFakeSocket('g2-a'), 'g2-a', { gameId: session.id }, countingCallback().callback)
    assert.equal(session.hostUuid, 'g2-b')

    // 이전 방장은 이제 권한이 없다(애초에 이 판에서 빠졌다).
    const oldHost = kickGamePlayer(io, createFakeSocket('g2-a'), 'g2-a', gameKickPayload(session, 'g2-b', 'g2-c'))
    assert.equal(oldHost.response.ok, false)

    const newHost = kickGamePlayer(io, createFakeSocket('g2-b'), 'g2-b', gameKickPayload(session, 'g2-b', 'g2-c'))
    assert.equal(newHost.response.ok, true)
    assert.equal(gameSessionCore.isParticipatingInSession(session, 'g2-c'), false)
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-02 — 대기방 추방의 실제 퇴장·인원·준비 동기화
// ═════════════════════════════════════════════════════════════════════════════

test('AC-02: 방장이 추방하면 서버 Map·계정 소속·채널이 함께 정리되고 잔류자의 준비 상태는 보존된다', async () => {
    const { io, sockets, room } = await setupRoom('kh-7', ['kj-9', 'kj-10'], { maxPlayers: 4 })
    // 잔류자가 준비를 마친 상태에서 추방한다 — 준비는 방장 권한과 독립적인 사실이다.
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
    // 대상 소켓만 채널에서 빠진다.
    assert.equal(sockets['kj-10'].rooms.has(room.roomId), false)
    assert.equal(sockets['kj-9'].rooms.has(room.roomId), true)

    // 잔류자의 준비 값은 추방으로 바뀌지 않는다.
    const after = (await callAsPromise(handleGetCurrentRoom, 'kj-9')).room
    assert.equal(seatOf(after, 'kj-9').isReady, true)
    assert.equal(seatOf(after, 'kh-7').isReady, true)
    // 화면이 스스로 계산하지 않는다 — canStart는 서버가 준 값 그대로다.
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
    // 사건에는 **제거 전에 캡처한** 값이 실린다 — 제거 뒤에는 다시 만들 수 없다.
    assert.equal(kicked[0].payload.roomId, room.roomId)
    assert.equal(kicked[0].payload.roomInstanceId, room.roomInstanceId)
    assert.equal(kicked[0].payload.bootEpoch, BOOT)
    assert.equal(kicked[0].payload.targetUuid, 'kj-12')
    assert.equal(kicked[0].payload.targetMembershipId, targetSeat.membershipId)

    const left = io.broadcasts.filter((b) => b.event === 'player_left_room')
    assert.equal(left.length, 1)
    assert.equal(left[0].payload.uuid, 'kj-12')
    // 어느 **소속**이 빠졌는지도 함께 실린다 — 같은 계정이 곧바로 다시 들어와도 잔류자 화면이
    // 새 참가자를 지우지 않게 하는 값이다.
    assert.equal(left[0].payload.membershipId, targetSeat.membershipId)
    assert.equal(io.broadcasts.filter((b) => b.event === 'public_rooms_updated').length, 1)
})

test('AC-02: 개인 통지가 throw해도 제거는 한 번 그대로 끝나고 영수증은 성공으로 남는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-9', ['kj-13', 'kj-14'])
    sockets['kj-14'].emitShouldThrowOn = EVENTS.ROOM_KICKED
    const payload = roomKickPayload(room, 'kh-9', 'kj-14')

    const { response } = kickRoomPlayer(io, sockets['kh-9'], 'kh-9', payload)

    // 전달 실패는 관측 가능한 오류로 남을 뿐, 이미 확정한 커밋을 되돌리지 않는다.
    assert.equal(response.ok, true)
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.length, 2)
    // 잔류자 방송도 막히지 않는다(통지가 각각 격리돼 있다).
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_left_room').length, 1)

    // 결과 재조회도 성공으로 답한다.
    const looked = getKickResult(io, sockets['kh-9'], 'kh-9', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.ok, true)
    assert.equal(looked.status, 'KICKED')
})

test('AC-02: 방장이 마지막 참가자를 추방해 방이 사라져도 영수증은 남아 원 요청자가 결과를 확인할 수 있다', async () => {
    const { io, sockets, room } = await setupRoom('kh-10', ['kj-15'])
    const payload = roomKickPayload(room, 'kh-10', 'kj-15')

    kickRoomPlayer(io, sockets['kh-10'], 'kh-10', payload)
    // 방장도 나가 방이 실제로 사라진다.
    matchmaking.__testables.removeFromRoom(io, sockets['kh-10'], 'kh-10')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.length, 0)

    const looked = getKickResult(io, sockets['kh-10'], 'kh-10', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(looked.ok, true)
    assert.equal(looked.status, 'KICKED')
    assert.equal(looked.replayed, true)
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 진행 중 추방은 일반 이탈과 같은 사망·전적 규칙을 쓴다
// ═════════════════════════════════════════════════════════════════════════════

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
    // roster는 유지된다 — 전적 레코드와 snapshot의 명단이 판마다 달라지면 안 된다.
    assert.equal(session.players.size, 4)
    assert.equal(io.broadcasts.filter((b) => b.event === 'player_eliminated').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'session_participation_changed').length, 1)
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_ended').length, 0)

    // 잔류자의 소속은 그대로다.
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
    // 처형으로 이미 죽은 참가자. 생존이 아니라는 이유로 추방 대상에서 빠지면 안 된다.
    const victim = session.players.get('g4-d')
    victim.alive = false
    victim.deathReason = 'EXECUTION'

    const { response } = kickGamePlayer(io, createFakeSocket('g4-a'), 'g4-a', gameKickPayload(session, 'g4-a', 'g4-d'))

    assert.equal(response.ok, true)
    // EXECUTION을 DISCONNECT로 덮어쓰면 그 판의 전적이 거짓이 된다.
    assert.equal(victim.deathReason, 'EXECUTION')
    assert.equal(victim.isParticipating, false)
    // 사망은 다시 일어나지 않는다 — 참여 종료만 공개된다.
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

    // 역할 배정이 고정돼 있으므로 두 판의 유일한 차이는 uuid 접미사뿐이다.
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
    // 그리고 그 공통 결과가 실제로 "이탈자만 DISCONNECT 사망"이다(둘 다 빈 값이 아님을 고정).
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

    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, createFakeSocket('g7-b'), 'g7-b', { gameId: session.id }, callback)
    const snapshot = getResponse()

    assert.equal(snapshot.ok, true)
    assert.equal(snapshot.players.length, 4)
    const departed = snapshot.players.find((p) => p.uuid === 'g7-d')
    assert.equal(departed.isAlive, false)
    assert.equal(departed.isParticipating, false)
    // 생존과 참여는 끝까지 분리된다 — 살아 있는 잔류자는 둘 다 true다.
    const stayer = snapshot.players.find((p) => p.uuid === 'g7-b')
    assert.equal(stayer.isAlive, true)
    assert.equal(stayer.isParticipating, true)
    // 공개 계약: 방장과 참여 세대는 서버 값 그대로다.
    assert.equal(snapshot.hostUuid, 'g7-a')
    assert.ok(snapshot.participationRevision >= 1)
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-04 — 본인·이미 이탈·무효한 방·중복 요청은 거부된다
// ═════════════════════════════════════════════════════════════════════════════

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

    // 일반 leave의 멱등 성공과 달리, "이미 없는 대상"을 성공으로 답하면 방장이 자기 명령이
    // 실제로 누군가를 내보냈다고 믿게 된다.
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
    // 재전달은 재방송하지 않는다.
    assert.equal(snapshotRooms(), stateAfterFirst)
    assert.equal(io.broadcasts.length, broadcastsAfterFirst)
    assert.equal(sockets['kj-22'].emitted.length, targetEmitsAfterFirst)
})

test('AC-04: 같은 requestId로 다른 입력을 보내면 REQUEST_ID_REUSED로 거부되고 아무 것도 실행되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('kh-16', ['kj-23', 'kj-24'])
    const payload = roomKickPayload(room, 'kh-16', 'kj-23')
    kickRoomPlayer(io, sockets['kh-16'], 'kh-16', payload)
    const before = snapshotRooms()

    // 같은 requestId, 다른 대상.
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

    // 방장이 확인 창을 띄운 사이 대상이 스스로 나갔다가 같은 방으로 다시 들어온다.
    matchmaking.__testables.removeFromRoom(io, sockets['kj-27'], 'kj-27')
    const rejoinSocket = createFakeSocket('kj-27', { id: 'sock-kj-27-again' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await handleJoinRoomByCode(io, rejoinSocket, 'kj-27', room.roomCode)

    const { response } = kickRoomPlayer(io, sockets['kh-18'], 'kh-18', stalePayload)

    assert.equal(response.code, CODES.STALE_MEMBERSHIP)
    // 새 소속은 그대로 남는다.
    const current = (await callAsPromise(handleGetCurrentRoom, 'kh-18')).room
    assert.equal(seatOf(current, 'kj-27') !== undefined, true)
    assert.notEqual(seatOf(current, 'kj-27').membershipId, stalePayload.targetMembershipId)
})

test('AC-04(조회): 결과는 **원 요청자 본인의 현재 소켓**에만 돌려준다 — 다른 계정은 UNKNOWN, 옛 소켓은 STALE_SOCKET', async () => {
    const { io, sockets, room } = await setupRoom('kh-19', ['kj-28', 'kj-29'])
    const payload = roomKickPayload(room, 'kh-19', 'kj-29')
    kickRoomPlayer(io, sockets['kh-19'], 'kh-19', payload)

    // 같은 requestId로 다른 계정이 물어도 자기 키가 아니다(키에 인증 uuid가 들어간다).
    const other = getKickResult(io, sockets['kj-28'], 'kj-28', { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(other.status, 'UNKNOWN')

    // canonical 소켓이 교체된 옛 소켓은 아예 읽지 못한다.
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

    // 만료 직전: 그대로 답한다.
    kickReceiptStore.__seedKickReceiptForTests(key, {
        command: 'ROOM', fingerprint: 'fp', result,
        decidedAt: Date.now(), expiresAt: Date.now() + 1_000,
    })
    assert.equal(getKickResult(io, sockets['kh-21'], 'kh-21', { bootEpoch: BOOT, requestId: 'ttl-req' }).status, 'KICKED')

    // 기한 경과: 없는 것으로 본다(성공도 미실행도 단정하지 않는다).
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
    // 자리가 없는데 소속을 먼저 제거하면 결과를 영영 알 수 없는 요청이 생긴다.
    assert.equal(snapshotRooms(), before)
    // 유효 기록은 하나도 버려지지 않았다.
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

// ═════════════════════════════════════════════════════════════════════════════
// AC-05 — 추방과 자발적 이탈의 경합
// ═════════════════════════════════════════════════════════════════════════════

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
    // 대상이 거의 동시에 나가기를 눌렀다 — 기존 멱등 성공 계약은 그대로다.
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
    })

    const { io, sockets, room } = await setupRoom('kh-25', ['kj-36', 'kj-37'], { maxPlayers: 4 })
    for (const uuid of ['kh-25', 'kj-36', 'kj-37']) {
        await callAsPromise(handleSetReady, io, sockets[uuid], uuid, readyPayload(room))
    }

    const { callback, getResponse } = countingCallback()
    const starting = handleStartGame(io, sockets['kh-25'], 'kh-25', startPayload(room), callback, conventionSocketId)
    await enteredPromise

    // 외형 조회를 기다리는 사이 방장이 한 명을 추방한다.
    const kicked = kickRoomPlayer(io, sockets['kh-25'], 'kh-25', roomKickPayload(room, 'kh-25', 'kj-37'))
    assert.equal(kicked.response.ok, true)

    releaseLoadouts()
    await starting

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.__getStateSnapshotForTests().gameSessions.length, 0)
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-06 — 재입장 허용 여부가 확정된 정책대로 적용된다
// ═════════════════════════════════════════════════════════════════════════════

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
    // 새 참가는 언제나 준비 안 됨으로 시작한다(이전 준비 이력과 무관).
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

    // 늦게 도착한 같은 명령의 재전달 — 역사적 결과만 돌려주고 새 소속은 건드리지 않는다.
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

    // 배제 사실은 forfeitedUuids에 남는다 — playerSession을 푼 것만으로는 "한 번도 없던 사람"과
    // 구분되지 않아 안내를 만들 수 없다.
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

    // 추방된 계정이 전혀 다른 새 판에 들어간다.
    const newSession = commitDeterministicSession({
        roomId: 'room-g13', gameId: 'game-g13', hostUuid: 'g12-d', uuids: ['g12-d', 'g13-b', 'g13-c', 'g13-d'],
    })
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().playerSession.find(([u]) => u === 'g12-d')[1],
        newSession.id,
    )

    // 옛 판의 마지막 정리가 새 소속을 건드리면 안 된다.
    gameSessionCore.endGameSessionForPlayer('g12-a', 'PLAYER_LEFT', oldSession.id)
    assert.equal(
        gameSessionCore.__getStateSnapshotForTests().playerSession.find(([u]) => u === 'g12-d')[1],
        newSession.id,
    )
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-05/AC-06 — 비동기 채널 재동기화(resyncSessionRouting)와 추방의 경합
//
// socket.join은 adapter에 따라 비동기다. 그 사이에 이 계정이 세션에서 빠지면(추방·이탈),
// 완료 뒤 다시 검사하지 않는 한 **배제된 계정이 그 경기의 모든 방송을 계속 받는 채널에
// 남는다**. 아래 시험들은 그 재검사를 재현 순서로 고정한다.
// ═════════════════════════════════════════════════════════════════════════════

test('AC-05: 재동기화의 join이 끝나기 전에 추방이 확정되면 그 채널 가입은 되돌려진다', async () => {
    const session = commitDeterministicSession({
        roomId: 'room-rs1', gameId: 'game-rs1', hostUuid: 'rs1-a', uuids: ['rs1-a', 'rs1-b', 'rs1-c', 'rs1-d'],
    })

    // 대상이 재접속해 채널 재가입을 시작한다 — join은 gate가 풀릴 때까지 끝나지 않는다.
    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    const targetSocket = createFakeSocket('rs1-d', { joinGate })
    const io = createFakeIo([targetSocket])
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(targetSocket, 'rs1-d')
    await targetSocket.joinCalled

    // 그 사이 방장이 대상을 추방한다(커밋은 동기 구간에서 끝난다).
    const kicked = kickGamePlayer(io, createFakeSocket('rs1-a'), 'rs1-a', gameKickPayload(session, 'rs1-a', 'rs1-d'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    // 이제서야 join이 완료된다. 재검사가 자신이 남긴 가입만 되돌려야 한다.
    releaseJoin()
    await resyncing

    // 추방의 채널 정리는 join이 아직 끝나지 않은 그 순간에 이미 지나갔다(그때는 가입 상태가
    // 아니었다) — 그래서 join 완료 뒤의 재검사가 없으면 이 소켓은 채널에 그대로 남는다.
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
    // 규약상 canonical socket.id는 `sock-<uuid>`다 — 다른 id의 연결은 이미 교체된 옛 연결이다.
    const oldSocket = createFakeSocket('rs3-d', { id: 'sock-rs3-d-old', joinGate })
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(oldSocket, 'rs3-d')
    await oldSocket.joinCalled
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
    // adapter가 Promise를 돌려주고 그것이 거부되는 경우다 — try/catch로는 잡히지 않는다.
    targetSocket.leave = async () => { throw new Error('leave 실패(테스트 주입)') }
    const disconnects = trackDisconnect(targetSocket)

    const io = createFakeIo([targetSocket])
    const resyncing = gameSessionSocketLayer.resyncSessionRouting(targetSocket, 'rs5-d')
    await targetSocket.joinCalled

    // join이 아직 끝나지 않은 사이에 추방이 확정된다.
    kickGamePlayer(io, createFakeSocket('rs5-a'), 'rs5-a', gameKickPayload(session, 'rs5-a', 'rs5-d'))

    releaseJoin()
    await resyncing
    await flushMicrotasks()

    // 채널에서 떼지 못했으므로 배제된 계정이 그대로 방송을 받는다 — 연결을 끊는 것이
    // 유일한 정리다(재접속은 forfeited 검사가 다시 막는다). 추방의 채널 정리와 재동기화의
    // 되돌리기가 각각 독립적으로 시도하므로 호출이 여러 번일 수 있고, 어느 쪽이든 강제 종료다.
    assert.ok(disconnects.length >= 1, '비동기 leave 거부 뒤 연결이 끊기지 않았다')
    assert.ok(disconnects.every((close) => close === true))
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-04 — 거부도 **결정**이다: 기록하지 않으면 현재 상태가 바뀐 뒤 같은 요청이 실행된다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-04: NOT_HOST로 거부된 요청은 그 뒤 방장이 되어 같은 ID로 다시 보내도 실행되지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('rk-1', ['rk-2', 'rk-3'])

    // 비방장 rk-2가 rk-3의 추방을 시도한다 — 거부된다.
    const payload = roomKickPayload(room, 'rk-1', 'rk-3', {
        requesterMembershipId: seatOf(room, 'rk-2').membershipId,
    })
    const first = kickRoomPlayer(io, sockets['rk-2'], 'rk-2', payload)
    assert.equal(first.response.code, CODES.NOT_HOST)

    // 방장이 나가 rk-2가 새 방장이 된다(승계는 서버가 한다).
    matchmaking.__testables.removeFromRoom(io, sockets['rk-1'], 'rk-1')
    const afterHostChange = (await callAsPromise(handleGetCurrentRoom, 'rk-2')).room
    assert.equal(afterHostChange.hostUuid, 'rk-2', '방장 승계가 일어나야 이 시험이 의미를 갖는다')

    // **같은 requestId·같은 입력**을 다시 보낸다. 지금은 방장이지만 과거의 결정은 그대로다.
    const replay = kickRoomPlayer(io, sockets['rk-2'], 'rk-2', payload)
    assert.equal(replay.response.ok, false)
    assert.equal(replay.response.code, CODES.NOT_HOST)
    assert.equal(replay.response.replayed, true, '역사적 결정이 아니라 현재 상태로 다시 판정됐다')

    // 대상은 그대로 방에 남아 있다 — 거부는 아무도 내보내지 않는다.
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
    assert.equal(stored.players.some(([uuid]) => uuid === 'rk-3'), true)

    // 결과 조회도 같은 거부를 돌려준다(성공으로 승격되지 않는다).
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

    // 이미 나간 대상에 대한 거부도 마찬가지다.
    const gonePayload = roomKickPayload(room, 'rk-4', 'rk-5')
    matchmaking.__testables.removeFromRoom(io, sockets['rk-5'], 'rk-5')
    assert.equal(kickRoomPlayer(io, sockets['rk-4'], 'rk-4', gonePayload).response.code, CODES.ALREADY_LEFT)
    const goneReplay = kickRoomPlayer(io, sockets['rk-4'], 'rk-4', gonePayload).response
    assert.equal(goneReplay.code, CODES.ALREADY_LEFT)
    assert.equal(goneReplay.replayed, true)
})

/** 남의 결정으로 표를 count개까지 채운다(전부 유효·미만료). 판정은 프로덕션 경로 그대로다. */
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

/** 진행 중 세션의 관측 가능한 전부(깊은 복사본) — 참조 비교로 무변경을 오판하지 않는다. */
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
    // 거부 수위의 **바로 아래**까지 남의 결정으로 채운다 — 이 거부가 마지막 한 자리를 쓴다.
    // 포화 직전에도 결정은 반드시 보존돼야 한다는 것이 이 시험의 전부다.
    seedForeignReceipts(REJECTION_LIMIT - 1, 'sat-room')

    const payload = roomKickPayload(room, 'rk-8', 'rk-10', {
        requesterMembershipId: seatOf(room, 'rk-9').membershipId,
    })
    const first = kickRoomPlayer(io, sockets['rk-9'], 'rk-9', payload)
    assert.equal(first.response.code, CODES.NOT_HOST)
    assert.equal(kickReceiptStore.__getKickReceiptCountForTests(), REJECTION_LIMIT, '거부가 기록되지 않았다')

    // 방장이 나가 요청자가 새 방장이 된다.
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
    // 조회도 같은 결정을 그대로 돌려주고, 유효 기록은 하나도 축출되지 않았다.
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

    // 기록되지 않는 NOT_HOST는 그 자리에서 거짓이 된다(승계 뒤 같은 요청이 실행될 수 있고,
    // 기한 안의 재조회도 UNKNOWN이다). 결정하지 못했다면 결정했다고 답하지 않는다.
    assert.equal(response.ok, false)
    assert.equal(response.code, CODES.RECEIPT_CAPACITY, '보존되지 않는 확정 거부를 돌려줬다')
    assert.equal(snapshotRooms(), before)
    // 유효 기록은 축출되지 않았고 새 기록도 생기지 않았다.
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

    // 방장이 스스로 나가 요청자가 새 방장이 된다.
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

    // 인증만 된 계정이면 누구나 무효한 요청을 무한히 보낼 수 있다 — 거부 기록이 커밋용
    // 자리까지 먹으면 그 자체가 추방 차단 수단이 된다. 수위를 넘은 요청은 **결정하지 않고**
    // 미결정으로 답하므로(위 두 시험), 기록되지 않은 확정 거부는 하나도 생기지 않는다.
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
    // 맨 처음의 결정은 그 뒤 2000여 건의 요청에도 축출되지 않았다.
    assert.equal(
        getKickResult(io, sockets['rk-6'], 'rk-6', { bootEpoch: BOOT, requestId: firstDecidedRequestId }).code,
        CODES.SELF_KICK,
    )

    // 그 뒤에도 실제 추방은 그대로 성공한다.
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

    // 방송이 나가는 **그 순간** 영수증이 이미 있는지 관측한다. 커밋과 기록 사이에 emit이 끼면
    // 그중 하나의 throw가 "이미 내보냈는데 기록은 없는" 상태를 만든다.
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

    // 전달 실패는 이미 확정된 커밋을 되돌리지 않는다.
    assert.equal(response.ok, true)
    assert.equal(session.players.get('rc2-d').isParticipating, false)
    assert.deepEqual(disconnects, [true])
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-05/AC-06 — 옛 채널 정리의 **늦은 완료·늦은 거부**는 새 소속의 것이 아니다
//
// leave가 비동기면 그 결과는 정리를 시작한 순간의 사실이 아니다. 기다리는 사이 같은 소켓이
// 새 소속(같은 방 재입장·새 대기방)을 가지면, 늦은 거부의 disconnect는 **새 소속의 연결**을
// 끊고 늦은 완료는 **새 소속의 채널 가입**을 대신 떼어 간다.
// ═════════════════════════════════════════════════════════════════════════════

/** 바깥에서 결말을 정하는 Promise 하나. */
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
    // 비동기 adapter: 이탈의 성패는 **나중에** 알려진다.
    targetSocket.leave = () => gate.promise
    const disconnects = trackDisconnect(targetSocket)
    const io = createFakeIo([targetSocket])

    const kicked = kickGamePlayer(io, createFakeSocket('own1-a'), 'own1-a', gameKickPayload(session, 'own1-a', 'own1-d'))
    assert.equal(kicked.response.ok, true)

    // 추방된 계정이 로비로 돌아가 **새 방**을 만들었다 — 지금 이 연결은 그 방의 것이다.
    const created = await callAsPromise(
        handleCreateRoom, io, targetSocket, 'own1-d', validSettingsPayload({ maxPlayers: 8, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, JSON.stringify(created))

    // 이제서야 옛 게임 채널 이탈이 거부된다.
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
    // 실제 채널 제거가 완료 시점에 일어나는 adapter를 재현한다.
    targetSocket.leave = (channelId) => gate.promise.then(() => { targetSocket.rooms.delete(channelId) })
    const disconnects = trackDisconnect(targetSocket)

    const kicked = kickRoomPlayer(io, sockets['own2-h'], 'own2-h', roomKickPayload(room, 'own2-h', 'own2-t'))
    assert.equal(kicked.response.ok, true)
    assert.equal(targetSocket.rooms.has(room.roomId), true, '아직 이탈이 끝나지 않았다')

    // 추방된 계정이 **같은 방에 새 소속으로** 다시 들어왔다(새 membershipId를 받는다).
    await handleJoinRoomByCode(io, targetSocket, 'own2-t', room.roomCode)
    const reseated = (await callAsPromise(handleGetCurrentRoom, 'own2-t')).room
    assert.equal(reseated.roomId, room.roomId)
    assert.notEqual(seatOf(reseated, 'own2-t').membershipId, seatOf(room, 'own2-t').membershipId)

    // 이제서야 옛 이탈이 끝나며 채널에서 뗀다 — 그 대상은 이미 새 소속의 가입이다.
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

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 이탈로 분모가 줄어든 낮 투표·재판의 완료 재평가
//
// 두 시점이 있다: **이탈 직후**(이미 전원 제출인 경우)와 **뒤따르는 마지막 제출 직후**.
// 이탈이 없는 라운드의 기존 계약("전원 투표해도 deadline 또는 명시적 판정까지 대기")은
// 그대로 남아야 한다 — 아래 마지막 시험이 그 경계를 고정한다.
// ═════════════════════════════════════════════════════════════════════════════

test('AC-03: roster 첫 참가자가 바로 그 이탈자여도 이탈 직후 낮 투표 판정이 실행된다', async () => {
    // roster 순서의 첫 항목이 추방 대상이다 — 판정 요청자를 roster 첫 항목으로 고르면
    // playerSession 매핑이 이미 풀려 있어 판정이 조용히 통째로 건너뛰어진다.
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-dv1', gameId: 'game-dv1', hostUuid: 'dv1-h',
        uuids: ['dv1-t', 'dv1-h', 'dv1-b', 'dv1-c'],
    })

    // 생존자 전원이 이탈 대상에게 투표한다.
    for (const voter of ['dv1-h', 'dv1-b', 'dv1-c', 'dv1-t']) {
        await castDayVote(io, sockets, voter, session.id, 'dv1-t')
    }
    assert.equal(session.dayVoteResolution, null, '이탈 전에는 제한시간까지 기다린다')

    kickGamePlayer(io, sockets['dv1-h'], 'dv1-h', gameKickPayload(session, 'dv1-h', 'dv1-t'))

    // 이탈자를 겨눈 표가 기권으로 정규화되고 남은 세 명이 전원 제출이므로 그 자리에서 판정된다.
    assert.notEqual(session.dayVoteResolution, null, '이탈 직후 재평가가 일어나지 않았다')
    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
    assert.equal(session.phase, 'NIGHT')
    // 판정 결과는 **그 순간 채널에 남아 있는** 참가자에게 한 번씩 간다. 추방된 대상은 영수증
    // 확정 직후 채널에서 떨어졌으므로 이 방송을 받지 않는다(남은 세 명뿐이다).
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

/**
 * 지정한 계정의 투표 참여 저장만 거부하는 대역. 나머지 계정은 그대로 성공한다 —
 * "마지막 한 표의 저장만 실패했다"를 정확히 재현하기 위함이다(실제 DB는 쓰지 않는다).
 */
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

    // 비기권 최초 라운드 제출은 참여 저장을 **await한 뒤에** ack된다(기권 경로와 다른 길이다).
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

    // 실패 ACK의 사실은 그대로다 — 재시도 가능한 저장 실패다(성공으로 바꾸지 않는다).
    assert.equal(ack.ok, false)
    assert.equal(ack.code, 'VOTE_PERSIST_FAILED')
    assert.deepEqual(attempts, ['dv5-h', 'dv5-b', 'dv5-c'], '저장은 세 번 시도됐어야 한다')

    // 표는 이미 core에 커밋됐으므로 완료 재평가는 저장 성패와 무관하게 똑같이 일어난다 —
    // 그러지 않으면 이 라운드는 DB 사정 하나로 deadline까지 멈춘 채 남는다.
    assert.notEqual(session.dayVoteResolution, null, '저장 실패가 이탈 후 완료 재평가를 삼켰다')
    assert.equal(session.dayVoteResolution.tribunalTargetUuid, 'dv5-c')
    assert.equal(session.phase, 'TRIBUNAL')
    // 판정·방송은 성공 경로와 **같은 한 번**이다(중복 판정·중복 방송이 없다).
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
    // 저장 실패 경로를 재평가에 이은 것이 이탈 없는 라운드의 기존 대기 계약을 건드리지 않는다.
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

    // 정상 경로로 재판까지 간다 — 나머지 전원이 tv1-d를 지목하고(본인은 자기 자신을 지목할
    // 수 없으므로 기권) 방장이 판정을 요청한다.
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

    // 피고를 제외한 유권자는 t·h·b·c 넷이다. 둘이 제출한 뒤 t가 추방된다.
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

// ═════════════════════════════════════════════════════════════════════════════
// AC-06 — 큐 생산자도 다른 세 생산자와 같은 소속·준비·응답 계약을 쓴다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-06: 빠른 매칭으로 확정된 참가자도 새 소속·준비 false와 공통 방 응답을 받는다', async () => {
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    try {
        const socket = createFakeSocket('mm-1')
        const io = createFakeIo([socket])
        await matchmaking.__testables.handleJoinMatchmaking(io, socket, 'mm-1')

        const found = socket.emitted.find((e) => e.event === 'match_found')
        assert.ok(found, '큐가 방으로 확정되지 않았다')

        // 공통 방 응답(buildRoomPayload)의 키가 전부 실린다 — 이 화면이 곧 대기방 화면이다.
        for (const key of ['roomId', 'roomCode', 'roomInstanceId', 'bootEpoch', 'hostUuid', 'canStart', 'settings', 'settingsVersion']) {
            assert.ok(Object.hasOwn(found.payload, key), `match_found에 ${key}가 없다`)
        }
        assert.equal(found.payload.bootEpoch, BOOT)

        const seated = found.payload.players.find((p) => p.uuid === 'mm-1')
        assert.ok(typeof seated.membershipId === 'string' && seated.membershipId.length > 0)
        // 재입장은 언제나 준비하지 않은 상태다(AC-06).
        assert.equal(seated.isReady, false)

        // 같은 계정이 그 방을 다시 조회해도 서버가 같은 값을 돌려준다.
        const current = (await callAsPromise(handleGetCurrentRoom, 'mm-1')).room
        assert.equal(current.roomId, found.payload.roomId)
        assert.equal(seatOf(current, 'mm-1').membershipId, seated.membershipId)
        assert.equal(seatOf(current, 'mm-1').isReady, false)
    } finally {
        matchmaking.__setRandomMatchmakingEnabledForTests(null)
    }
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-05/AC-06 — 채널 소유권: 비동기 **완료 이후**의 재검사와 전달 제외
//
// 이 블록이 보려는 것은 "연결이 끊겼는가"가 아니라 **실제 채널 가입과 실제 수신자**다.
// disconnect 0회만 단언하면, 떼지 못한 옛 채널이 그대로 남아 배제된 계정이 방송을 계속
// 받는 상태를 그대로 통과시킨다.
// ═════════════════════════════════════════════════════════════════════════════

/** 그 방송이 실제로 닿는 소켓 id들 — 채널 가입자에서 전달 제외를 뺀 집합이다. */
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

    // 채널 이탈이 **실제로 실패**한다(비동기 거부). 제한된 재시도도 전부 실패한다.
    target.leave = async () => { throw new Error('leave 실패(테스트 주입)') }

    const { response } = kickRoomPlayer(io, sockets['own-h'], 'own-h', roomKickPayload(room, 'own-h', 'own-t'))
    assert.equal(response.ok, true, JSON.stringify(response))

    // 그 사이 이 계정이 **다른 방**의 참가자가 됐다 — 이 연결을 끊으면 새 소속이 방송을 잃는다.
    matchmaking.__seedRoomForTests({
        id: 'own-other', instanceId: 'own-other-inst', hostUuid: 'own-t',
        players: new Map([['own-t', { uuid: 'own-t', nickname: 'n', isReady: false, membershipId: 'mem-other' }]]),
        settings: { maxPlayers: 8 },
    })
    matchmaking.__seedPlayerRoomForTests('own-t', 'own-other')

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // 1) 새 소속이 있으므로 연결은 살아 있다.
    assert.equal(disconnects.length, 0, '새 소속을 가진 연결을 옛 정리가 끊었다')
    // 2) 그런데 옛 채널 가입은 **실제로 남아 있다**(leave가 끝내 실패했다).
    assert.equal(target.rooms.has(room.roomId), true)
    // 3) 그래서 그 방의 이후 방송은 이 소켓을 빼고 나가야 한다. 남아 있다는 이유로 배제된
    //    계정이 계속 받으면, SUPERSEDED를 기록한 것만으로는 아무것도 막지 못한 것이다.
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
    // 4) 잔류자는 그대로 받는다 — 제외가 정상 참가자의 방송을 잠식하지 않는다.
    assert.ok(recipientsOf(io, after[0]).includes(sockets['own-h'].id))
})

test('AC-05(대기방): 옛 소켓의 이탈 정리는 **새 canonical 소켓**의 채널 가입을 되살리지 않는다', async () => {
    const { io, sockets, room } = await setupRoom('can-h', ['can-t'])
    const oldSocket = sockets['can-t']

    // 같은 계정의 새 로그인이 canonical 소켓을 가져갔고, 그 새 소켓이 같은 방에 앉아 있다.
    const newSocket = createFakeSocket('can-t', { id: 'sock-can-t-new' })
    io.sockets.sockets.set(newSocket.id, newSocket)
    newSocket.rooms.add(room.roomId)
    // canonical 등록부도 새 소켓을 가리킨다.
    matchmaking.setOnlineUsersRegistry(new Map([['can-t', newSocket.id]]))

    try {
        // 옛 소켓의 leave가 늦게 끝난다. 계정 소속만 보면 "아직 앉아 있다"이므로 예전 구현은
        // **옛 소켓의** 가입을 되돌려 놓았다(유령 청취자가 된다).
        const departed = matchmaking.__testables.commitRoomDeparture(io, oldSocket, 'can-t', 'LEFT_ROOM')
        // 제거 직후 같은 계정이 새 소속으로 그 방에 다시 앉은 상태를 만든다.
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

    // leave는 성공한다. 그 완료 시점에 이 소켓이 **아직 정상 소속**이라 가입을 되돌리는데,
    // 그 되돌리는 join은 우리가 풀어 줄 때까지 매달려 있다.
    let releaseJoin
    const joinGate = new Promise((resolve) => { releaseJoin = resolve })
    target.join = async (channelId) => {
        await joinGate
        target.joined.push(channelId)
        target.rooms.add(channelId)
    }

    gameSessionSocketLayer.__testables.detachSocketFromChannel(
        target, session.channelId, '[테스트 채널 정리]', { gameId: session.id },
        // 되돌리기 판정은 "지금 이 판에서 배제되지 않았는가"다 — 아래에서 실제로 배제한다.
        {
            ownsChannel: () => !gameSessionCore.isForfeitedFromSession(session.id, 'rj-t'),
            keepsConnection: () => true,
        },
    )
    await flushMicrotasks()
    assert.equal(target.rooms.has(session.channelId), false, 'leave가 끝나지 않았다')

    // join이 매달려 있는 사이 그 소속이 배제된다(추방/이탈).
    const departed = gameSessionCore.commitParticipantDeparture(session, 'rj-t', { reason: 'KICKED_BY_HOST' })
    assert.equal(departed.ok, true, JSON.stringify(departed))

    // 이제 join이 완료된다 — 완료 후 재검사가 없으면 **권한을 잃은 소켓이 채널에 남는다**.
    releaseJoin()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(
        target.rooms.has(session.channelId), false,
        '되돌린 가입이 완료된 뒤 배제된 소켓이 채널에 그대로 남았다',
    )
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-02/AC-05 — 잔류자 사건의 방 인스턴스·기동 경계
// ═════════════════════════════════════════════════════════════════════════════

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

    // 방장이 나가면 승계 → host_changed도 같은 경계를 실어야 한다.
    const beforeHost = io.broadcasts.length
    matchmaking.__testables.removeFromRoom(io, sockets['res-h'], 'res-h')
    const hostChanged = io.broadcasts.slice(beforeHost).find((b) => b.event === 'host_changed')
    assert.ok(hostChanged, 'host_changed가 방송되지 않았다')
    assert.equal(hostChanged.payload.roomId, room.roomId)
    assert.equal(hostChanged.payload.roomInstanceId, room.roomInstanceId)
    assert.equal(hostChanged.payload.bootEpoch, room.bootEpoch)
    // F-20 설정 사건 호환은 그대로 — 기존 필드를 뺏지 않는다.
    assert.equal(typeof hostChanged.payload.settingsVersion, 'number')
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 이탈이 바꾼 분모와 **본인** 제출 상태
// ═════════════════════════════════════════════════════════════════════════════

test('AC-03: 이탈 방송은 공개 진행 수를 싣고, 정규화된 본인 표는 개인 전송으로만 간다', async () => {
    const uuids = ['pg-h', 'pg-a', 'pg-b', 'pg-c']
    const { session, io, sockets } = setupSessionAtDayVote({
        roomId: 'room-pg', gameId: 'game-pg', hostUuid: 'pg-h', uuids,
    })

    // pg-a가 pg-c를 찍는다. 그 뒤 pg-c가 추방되면 이 표는 기권으로 정규화된다.
    await castDayVote(io, sockets, 'pg-a', session.id, 'pg-c')
    clearDelivered(sockets)
    const beforeBroadcasts = io.broadcasts.length

    const kicked = kickGamePlayer(io, sockets['pg-h'], 'pg-h', gameKickPayload(session, 'pg-h', 'pg-c'))
    assert.equal(kicked.response.ok, true, JSON.stringify(kicked.response))

    // 1) 공개 방송에는 진행 수만 있고 누가 무엇을 냈는지는 없다.
    const changed = io.broadcasts.slice(beforeBroadcasts)
        .find((b) => b.event === 'session_participation_changed')
    assert.ok(changed, 'session_participation_changed가 방송되지 않았다')
    assert.equal(changed.payload.progress.kind, 'DAY_VOTE')
    // 이탈자를 뺀 생존 투표자가 분모다(3명) — 화면이 스스로 세면 4로 남는다.
    assert.equal(changed.payload.progress.requiredCount, 3)
    assert.equal(changed.payload.progress.doneCount, 1)
    assert.equal(JSON.stringify(changed.payload).includes('dayVoteTargetUuid'), false)

    // 2) 본인 표는 개인 전송으로만 간다 — 그 값이 canonical하게 기권(null)이다.
    const selfEvents = sockets['pg-a'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(selfEvents.length, 1)
    assert.equal(selfEvents[0].payload.self.hasSubmittedDayVote, true)
    assert.equal(selfEvents[0].payload.self.dayVoteTargetUuid, null, '사라진 표적이 그대로 남았다')
    assert.equal(selfEvents[0].payload.participationRevision, changed.payload.participationRevision)

    // 3) 아직 내지 않은 사람에게도 자기 값만 간다(남의 표는 어디에도 없다).
    const otherSelf = sockets['pg-b'].emitted.filter((e) => e.event === 'session_self_progress')
    assert.equal(otherSelf.length, 1)
    assert.equal(otherSelf[0].payload.self.hasSubmittedDayVote, false)
    assert.equal(otherSelf[0].payload.self.dayVoteTargetUuid, null)
    // 추방된 당사자에게는 이 개인 전송을 보내지 않는다(이미 참여가 끝났다).
    assert.equal(sockets['pg-c'].emitted.filter((e) => e.event === 'session_self_progress').length, 0)
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

    // 남의 스냅샷에는 남의 표가 없다 — 본인 필드만 실린다.
    const otherSnapshot = gameSessionCore.getSessionSnapshotForPlayer('sn-b', session.id).snapshot
    assert.equal(otherSnapshot.self.hasSubmittedDayVote, false)
    assert.equal(JSON.stringify(otherSnapshot.players).includes('dayVoteTargetUuid'), false)
})

// ═════════════════════════════════════════════════════════════════════════════
// AC-05/AC-06 — 채널 전달 제외의 수명 · fail-closed 전달 · 실패 처리 분기
//
// 대상은 socket/channelMembership.js다. 여기서 만들어지는 "배제"는 곧 **거부의 증거**다 —
// leave가 실제로 실패했고 그 연결을 끊을 수도 없을 때(새 소속이 있다) 그 (채널, 소켓) 쌍을
// 전달에서 빼는 것이 남은 유일한 수단이다. 그래서 그 증거는 용량을 이유로 사라져서는 안 되고,
// 제외할 수 없는 adapter에서는 보내지 않는 쪽을 택해야 한다.
//
// 배제는 손으로 Set에 심지 않는다 — **실제 leave 거부**로 만든다(그것이 유일한 생산 경로다).
// ═════════════════════════════════════════════════════════════════════════════

/** leave가 **항상 거부되는** 소켓. 배제가 만들어지는 실제 조건을 그대로 재현한다. */
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

/** 대기 중인 leave 거부 연쇄(최대 3회 재시도)가 모두 정착할 때까지 비운다. */
async function settleChannelRetries(times = 8) {
    for (let i = 0; i < times; i += 1) await flushMicrotasks()
}

test('AC-06: 유효한 전달 제외는 수위(1024)를 넘어도 하나도 축출되지 않는다', async () => {
    const channelId = 'chan-capacity'
    const total = channelMembership.CHANNEL_EXCLUSION_ALARM_ENTRIES + 1 // 1025
    const sockets = []

    // 각각 이 채널의 소속은 아니지만(ownsChannel=false) 다른 채널의 새 소속을 가졌다
    // (keepsConnection=true) — 끊을 수 없으므로 배제가 유일한 수단인 상태다.
    for (let i = 0; i < total; i += 1) {
        const socket = createLeaveDenyingSocket(`cap-sock-${i}`, { joinedChannels: [channelId] })
        sockets.push(socket)
        channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
            ownsChannel: () => false,
            keepsConnection: () => true,
        })
    }
    await settleChannelRetries()

    // 축출이 있었다면 여기가 1024로 깎인다(이전 구현의 실제 동작이다).
    assert.equal(channelMembership.getChannelExclusions(channelId).length, total,
        '수위를 넘긴 유효 배제가 축출됐다(무단 전달이 다시 열린다)')
    for (const socket of sockets) {
        assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), true,
            `${socket.id}의 배제가 사라졌다`)
        // 새 소속이 있으므로 끊지 않는다 — 배제는 끊기의 대체 수단이다.
        assert.equal(socket.disconnectCalls, 0)
    }

    // 실제 방송에서도 전원이 빠진다.
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

    // 프로덕션에서는 matchmaking.js::onDisconnect가 모든 소켓에서 이것을 부른다.
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

    // except을 제공하지 않는 adapter(채널 전체 방송만 가능하다).
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

    // 채널 전체 방송은 일어나지 않았다 — 그것이 곧 배제된 소켓에 흘려보내는 경로였다.
    assert.equal(channelWideEmits.length, 0, '배제를 적용할 수 없는데 채널 전체로 방송했다')
    assert.equal(denied.emitted.length, 0, '배제된 소켓이 방송을 받았다')
    // 정상 참가자는 **실제로** 받는다(fail-closed가 정상 전달을 없애지 않는다).
    assert.equal(allowedA.emitted.filter((e) => e.event === 'player_left_room').length, 1)
    assert.equal(allowedB.emitted.filter((e) => e.event === 'player_left_room').length, 1)
    // 그 채널에 없는 소켓에는 가지 않는다.
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
    // except도 없고 구성원을 훑을 registry도 없다.
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

    // senderSocket.to(channelId) 경로를 그대로 쓴다 — io 전체 방송으로 바뀌지 않는다.
    assert.equal(senderBroadcasts.length, 1)
    assert.equal(senderBroadcasts[0].event, 'player_ready_changed')
    assert.equal(io.broadcasts.length, 0)
})

// ── handleFailure: ownsChannel과 keepsConnection은 서로 다른 질문이다 ─────────

test('AC-06: 같은 채널에 정당하게 다시 들어온 소속은 옛 leave가 거부돼도 제외·끊기 대상이 아니다', async () => {
    const channelId = 'chan-readmit'
    const socket = createLeaveDenyingSocket('readmit-sock', { joinedChannels: [channelId] })

    // 옛 이탈의 정리가 도는 사이 이 소켓은 **같은 채널**의 정상 소속이 됐다.
    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => true,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    assert.equal(channelMembership.isSocketExcludedFromChannel(channelId, socket.id), false,
        '정당한 같은 채널 재입장이 전달에서 제외됐다')
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])
    assert.equal(socket.disconnectCalls, 0)
    // 재시도로 자기 소속을 다시 떼려 들지 않는다(1회 시도 후 소유권을 보고 멈춘다).
    assert.equal(socket.leaveCalls, 1)
    assert.equal(socket.rooms.has(channelId), true, '정상 소속의 채널 가입이 사라졌다')
})

test('AC-06: 같은 채널 재입장에서 가입이 떨어져 있으면 되돌려 놓는다(끊지 않는다)', async () => {
    const channelId = 'chan-readmit-restore'
    // leave가 가입을 떼어낸 뒤 거부된 상태를 재현한다(rooms에 채널이 없다).
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
        // 옛 채널의 소속은 아니다. 하지만 다른 채널의 새 소속이 있다.
        ownsChannel: () => false,
        keepsConnection: () => true,
    })
    await settleChannelRetries()

    assert.equal(socket.disconnectCalls, 0, '다른 채널의 새 소속을 가진 연결을 끊었다')
    assert.equal(channelMembership.isSocketExcludedFromChannel(oldChannel, socket.id), true)
    // 새 채널은 건드리지 않는다.
    assert.equal(channelMembership.isSocketExcludedFromChannel('chan-new', socket.id), false)
    assert.equal(socket.leaveCalls, channelMembership.MAX_CHANNEL_LEAVE_ATTEMPTS)
})

test('AC-06: 방 채널 방송(player_ready_changed)도 배제된 소켓에는 전달되지 않고 잔류자에게는 실제로 전달된다', async () => {
    const { io, sockets, room } = await setupRoom('ready-x-h', ['ready-x-a', 'ready-x-b'])

    // 떼지 못한 옛 소속이 이 방 채널에 남아 있는 상태(배제의 생산 경로 자체는 위 시험들이 덮는다).
    channelMembership.excludeSocketFromChannel(room.roomId, sockets['ready-x-a'].id)
    for (const socket of Object.values(sockets)) socket.emitted.length = 0

    const ack = await callAsPromise(
        handleSetReady, io, sockets['ready-x-h'], 'ready-x-h', readyPayload(room))
    assert.equal(ack.ok, true, JSON.stringify(ack))

    const received = (uuid) => sockets[uuid].emitted.filter((e) => e.event === 'player_ready_changed').length
    // 배제된 소켓에는 가지 않는다 — 추방된 계정이 자기가 쫓겨난 방의 준비 상태를 계속 받지 않는다.
    assert.equal(received('ready-x-a'), 0, '배제된 소켓이 방 채널 방송을 받았다')
    // 정상 잔류자는 **실제로** 받는다(fail-closed가 정상 전달을 없애지 않는다).
    assert.equal(received('ready-x-b'), 1)
    // 발신자 제외는 그대로다 — 요청자는 ACK로만 결과를 안다.
    assert.equal(received('ready-x-h'), 0)
})

test('AC-06: 살아 있는 소속이 하나도 없으면 떼지 못한 연결을 끊고 배제를 정리한다', async () => {
    const channelId = 'chan-dead'
    const socket = createLeaveDenyingSocket('dead-sock', { joinedChannels: [channelId] })
    // 먼저 다른 채널의 배제를 하나 만들어 둔다.
    channelMembership.excludeSocketFromChannel('chan-stale', socket.id)

    channelMembership.detachSocketFromChannel(socket, channelId, '[테스트 채널 정리]', {}, {
        ownsChannel: () => false,
        keepsConnection: () => false,
    })
    await settleChannelRetries()

    assert.equal(socket.disconnectCalls, 1, '남은 근거가 없는 연결을 끊지 않았다')
    // 끊은 뒤에는 더 뺄 대상 자체가 없다 — 목록을 남기지 않는다.
    assert.deepEqual(channelMembership.getChannelExclusions('chan-stale'), [])
    assert.deepEqual(channelMembership.getChannelExclusions(channelId), [])
})

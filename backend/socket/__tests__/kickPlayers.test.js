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
})

test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
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

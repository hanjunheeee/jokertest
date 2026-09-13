'use strict';

// F-19 AC-06 — 초대 수락 → 실제 대기방 입장의 상태·fault 표를 실제 matchmaking 경로로
// 검증한다.
//
// 여기서 확인하는 것은 **입장 계약**이다(A-10):
//   1) 역사적 수락 결정 · 2) 역사적 publication 영수증 · 3) 현재 canonical membership
// 이 셋은 서로 다른 사실이고, 성공 입장은 (2)와 (3)이 함께 있을 때만 인정한다.
//
// gameInvite 서비스는 호출할 때마다 실제 MySQL 트랜잭션을 연다. DB 없이 이 상태 기계를
// 결정적으로 재현하기 위해 matchmaking.__setGameInviteServiceForTests로 참조만 교체한다
// (userRepositoryRef·economyServiceRef와 완전히 같은 관례). 교체한 것은 **SQL 경계뿐**이고,
// 예약·정원·두 Map·socket 채널·ready/start 협조·get_current_room은 전부 실제 코드다.

// backend/models는 require 시점에 DATABASE_URL을 **파싱만** 한다(연결은 시도하지 않는다).
// 이 파일은 SQL 경계를 전부 대역으로 교체하므로 실제 쿼리는 한 번도 실행되지 않는다 —
// f17/friend.service.test.js와 같은 관례로, 파일 하나만 실행해도 되도록 자립시킨다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')

matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }),
})
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }])),
})

const gameSessionCore = require('../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../roomJoinErrors')
const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleStartGame,
    handleSetReady,
    handleDeleteRoom,
    handleAcceptGameInvite,
    handleGetGameInviteResult,
} = matchmaking.__testables

const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
} = require('./testHelpers/matchmakingFixtures')

function deferred() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

const HOST = 'host-uuid'
const GUEST = 'guest-uuid'
const OTHER = 'other-uuid'
const INVITE_ID = 'invite-1'

/**
 * 초대 SQL 경계의 시험 대역.
 *
 * 실제 서비스와 같은 계약만 지킨다: getAttemptOutcome은 초대가 가리키는 방·boot을 알려주고,
 * recordAcceptDecision은 역사적 결정을 확정하며, finalizeAcceptedEntry는 잠금 안에서
 * 동기 publish()를 부른 뒤 durable 영수증을 쓴다. 각 단계마다 gate를 끼워 그 사이에
 * 방 삭제·정원 경합·세션 종료·canonical 교체가 끼어드는 순간을 결정적으로 만든다.
 */
function createInviteServiceStub({ roomId, roomInstanceId, bootEpoch, gates = {} } = {}) {
    const state = {
        status: 'PENDING',
        attemptId: null,
        entryOutcome: null,
        endReason: null,
        interruptions: [],
        cancelledRooms: [],
        decisionCalls: 0,
        finalizeCalls: 0,
    }

    const service = {
        state,
        async getAttemptOutcome({ receiverId, inviteId, attemptId }) {
            if (inviteId !== INVITE_ID) return { known: false }
            if (receiverId !== GUEST) return { known: false }
            if (attemptId !== undefined && state.attemptId !== attemptId) {
                return { known: true, staleAttempt: true, invite: { inviteId, status: state.status } }
            }
            return {
                known: true,
                staleAttempt: false,
                invite: { inviteId, status: state.status, entryOutcome: state.entryOutcome },
                roomId,
                roomInstanceId,
                bootEpoch,
                entryOutcome: state.entryOutcome,
            }
        },
        async recordAcceptDecision({ attemptId }) {
            state.decisionCalls += 1
            if (gates.beforeDecision) await gates.beforeDecision
            if (state.status !== 'PENDING') {
                const error = new Error('이미 처리된 초대입니다.')
                error.status = 409
                throw error
            }
            state.status = 'ACCEPTED'
            state.attemptId = attemptId
            state.entryOutcome = 'UNCONFIRMED'
            return { ok: true, roomId, roomInstanceId }
        },
        async finalizeAcceptedEntry({ attemptId, publish, unpublish }) {
            state.finalizeCalls += 1
            if (gates.beforeFinalize) await gates.beforeFinalize
            if (state.attemptId !== attemptId) return { ok: false, code: 'STALE_ATTEMPT', published: false }
            if (gates.blockBeforeEntry) {
                state.entryOutcome = 'INTERRUPTED'
                state.endReason = 'BLOCKED_BEFORE_ENTRY'
                return { ok: false, code: 'BLOCKED', published: false }
            }

            const committed = publish()
            if (!committed.ok) {
                state.entryOutcome = 'INTERRUPTED'
                state.endReason = committed.code
                return { ok: false, code: committed.code, published: false }
            }

            if (gates.receiptShouldFail) {
                // 영수증 쓰기/커밋 실패 — 방금 넣은 두 Map을 **동기적으로** 되돌려야 한다.
                unpublish()
                return { ok: false, code: 'RECEIPT_FAILED', published: true, unknown: true }
            }
            state.entryOutcome = 'PUBLISHED'
            return { ok: true, alreadyPublished: false }
        },
        async recordEntryInterrupted({ attemptId, reason }) {
            state.interruptions.push({ attemptId, reason })
            if (state.entryOutcome === 'PUBLISHED') return false
            state.entryOutcome = 'INTERRUPTED'
            state.endReason = reason
            return true
        },
        async cancelPendingInvitesForRoom(targetRoomId, reason) {
            state.cancelledRooms.push({ roomId: targetRoomId, reason })
            return []
        },
        async cancelPendingInvitesBetween() { return [] },
    }
    return service
}

/**
 * 방장이 방 하나를 만들고, 초대 대역이 그 방을 가리키게 맞춘다.
 * maxPlayers는 실제 검증 범위(4~10)를 지켜야 하므로, "가득 찬 방"은 정원 축소가 아니라
 * 실제 참가자로 채워서 만든다(fillWith).
 */
async function setupRoomWithInvite(t, { maxPlayers = 4, gates = {}, fillWith = [], allReady = false } = {}) {
    const hostSocket = createFakeSocket(HOST)
    const guestSocket = createFakeSocket(GUEST)
    const io = createFakeIo([hostSocket, guestSocket])

    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, HOST, validSettingsPayload({ maxPlayers, jokerCount: 1 }),
    )
    assert.equal(created.ok, true, created.message)

    const fillerSockets = []
    for (const uuid of fillWith) {
        const socket = createFakeSocket(uuid)
        io.sockets.sockets.set(socket.id, socket)
        await handleJoinRoomByCode(io, socket, uuid, created.room.roomCode)
        fillerSockets.push(socket)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)

    const service = createInviteServiceStub({
        roomId: created.room.roomId,
        roomInstanceId: room.instanceId,
        bootEpoch: matchmaking.__getBootEpochForTests(),
        gates,
    })
    matchmaking.__setGameInviteServiceForTests(service)
    t.after(() => matchmaking.__setGameInviteServiceForTests(null))

    if (allReady) {
        await callAsPromise(handleSetReady, io, hostSocket, HOST, { isReady: true })
        for (let i = 0; i < fillerSockets.length; i += 1) {
            await callAsPromise(handleSetReady, io, fillerSockets[i], fillWith[i], { isReady: true })
        }
    }

    return { io, hostSocket, guestSocket, fillerSockets, room: created.room, service }
}

test.beforeEach(() => {
    matchmaking.__resetStateForTests()
    gameSessionCore.__resetStateForTests?.()
    matchmaking.__setGameInviteServiceForTests(null)
})

test.afterEach(() => {
    matchmaking.__resetStateForTests()
    matchmaking.__setGameInviteServiceForTests(null)
})

// ---------------------------------------------------------------------------
// 정상 경로
// ---------------------------------------------------------------------------

test('AC-06: 수락이 확정되면 두 Map·실제 채널·성공 ACK가 함께 성립하고 예약은 남지 않는다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t)

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    assert.equal(ack.ok, true)
    assert.equal(ack.room.roomId, room.roomId)
    assert.deepEqual(ack.room.players.map((p) => p.uuid).sort(), [GUEST, HOST].sort())
    assert.equal(service.state.entryOutcome, 'PUBLISHED')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(snapshot.playerRoom.find(([uuid]) => uuid === GUEST), [GUEST, room.roomId])
    assert.equal(snapshot.roomAdmissionAttempts.length, 0, '확정 뒤에는 미확정 시도가 남지 않는다')
    assert.equal(guestSocket.rooms.has(room.roomId), true)

    // 초대 수락은 room_joined를 발행하지 않는다 — 이동 소유자는 클라이언트 한 경계뿐이다.
    assert.equal(guestSocket.emitted.some((e) => e.event === 'room_joined'), false)
    assert.equal(guestSocket.emitted.some((e) => e.event === 'player_joined_room' && e.broadcastTo === room.roomId), true)
})

test('AC-06: 확정 뒤 get_current_room은 정상 소속을 돌려준다(pending 아님)', async (t) => {
    const { io, guestSocket, room } = await setupRoomWithInvite(t)
    await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    const current = await callAsPromise(handleGetCurrentRoom, GUEST)
    assert.equal(current.ok, true)
    assert.equal(current.pending, undefined)
    assert.equal(current.room.roomId, room.roomId)
})

// ---------------------------------------------------------------------------
// 상태표 (1) 최초 검증 실패 — 아무 흔적도 남기지 않는다
// ---------------------------------------------------------------------------

test('상태표 1: 방이 이미 사라졌으면 예약도 만들지 않고 실패 ACK만 남는다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t)
    matchmaking.__removeRoomForTests(room.roomId)

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
    assert.equal(service.state.decisionCalls, 0, 'SQL 결정 자체가 시작되지 않아야 한다')
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.roomAdmissionAttempts.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(guestSocket.joined.length, 0, '실제 방송 room에 가입하지 않는다')
})

test('상태표 1: 이미 다른 방에 소속돼 있으면 거부된다', async (t) => {
    const { io, guestSocket, room } = await setupRoomWithInvite(t)
    // 게스트가 먼저 일반 코드 참가로 그 방에 들어간 상태를 만든다.
    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM)
})

test('상태표 1: 정원이 이미 찼으면 예약 없이 ROOM_FULL이다', async (t) => {
    // 정원 4를 실제 참가자 4명(host + 3)으로 채운다 — 정원 자체는 서버 허용 범위를 지킨다.
    const { io, guestSocket, service } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1', 'filler-2', 'filler-3'],
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL)
    assert.equal(service.state.decisionCalls, 0)
})

// ---------------------------------------------------------------------------
// 예약이 살아 있는 동안의 협조(정원·ready·start·get_current_room)
// ---------------------------------------------------------------------------

test('AC-06: 예약 중에는 인원 한 자리를 차지해 마지막 자리 일반 입장이 거부된다', async (t) => {
    const beforeDecision = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1', 'filler-2'],
        gates: { beforeDecision: beforeDecision.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    // 예약이 잡힐 때까지 microtask를 흘린다.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const reserved = matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts
    assert.equal(reserved.length, 1)
    assert.equal(reserved[0][1].phase, 'reserved')

    // 정원 4인 방에 확정 3명 + 예약 1명 → 마지막 자리 일반 입장은 거부돼야 한다.
    const otherSocket = createFakeSocket(OTHER)
    io.sockets.sockets.set(otherSocket.id, otherSocket)
    await handleJoinRoomByCode(io, otherSocket, OTHER, room.roomCode)
    const failed = otherSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.equal(failed?.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL)

    beforeDecision.resolve()
    const ack = await accepting
    assert.equal(ack.ok, true)
})

test('AC-06: 예약만 있는 계정의 get_current_room은 room:null·pending:true다', async (t) => {
    const beforeDecision = deferred()
    const { io, guestSocket } = await setupRoomWithInvite(t, { gates: { beforeDecision: beforeDecision.promise } })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const current = await callAsPromise(handleGetCurrentRoom, GUEST)
    assert.deepEqual(current, { ok: true, room: null, pending: true })

    beforeDecision.resolve()
    await accepting
})

test('AC-06: 예약 중에는 canStart=false이고 start_game이 ADMISSION_IN_PROGRESS로 거부된다', async (t) => {
    const beforeDecision = deferred()
    // 광대 1 설정에서 시작하려면 실제 인원이 2명 이상이어야 한다 — 예약 때문이 아니라
    // 인원 조건 때문에 거부되는 경우와 구분하려고 filler를 함께 준비시킨다.
    const { io, hostSocket, guestSocket } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1'], allReady: true,
        gates: { beforeDecision: beforeDecision.promise },
    })

    // 예약이 없을 때는 실제로 시작 가능한 상태였음을 먼저 확인한다.
    assert.equal((await callAsPromise(handleGetCurrentRoom, HOST)).room.canStart, true)

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const current = await callAsPromise(handleGetCurrentRoom, HOST)
    assert.equal(current.room.canStart, false, '확정되지 않은 입장이 있으면 시작할 수 없다')

    const started = await callAsPromise(handleStartGame, io, hostSocket, HOST)
    assert.equal(started.ok, false)
    assert.equal(started.code, 'ADMISSION_IN_PROGRESS')

    beforeDecision.resolve()
    await accepting
})

test('AC-06: 영수증 미확정 publication 상태의 계정은 ready를 바꿀 수 없다', async (t) => {
    const beforeFinalize = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, { gates: { beforeFinalize: beforeFinalize.promise } })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    // finalize 직전까지 microtask를 흘린다(publish는 아직 실행되지 않았다 — phase는 reserved).
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const ready = await callAsPromise(handleSetReady, io, guestSocket, GUEST, { isReady: true })
    assert.equal(ready.ok, false, '입장 확정 전에는 준비 상태를 바꿀 수 없다')

    beforeFinalize.resolve()
    await accepting
    // 확정 이후에는 정상적으로 바뀐다.
    const readyAfter = await callAsPromise(handleSetReady, io, guestSocket, GUEST, { isReady: true })
    assert.equal(readyAfter.ok, true)
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
        .players.find(([uuid]) => uuid === GUEST)[1].isReady, true)
})

// ---------------------------------------------------------------------------
// 상태표 (3)(5) 결정 이후 · 확정 이전의 무효화
// ---------------------------------------------------------------------------

test('상태표 3: 결정 이후 방이 삭제되면 뒤늦은 publication이 0이고 예약도 사라진다', async (t) => {
    const beforeFinalize = deferred()
    const { io, hostSocket, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { beforeFinalize: beforeFinalize.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    handleDeleteRoom(io, HOST)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0,
        '방 삭제는 그 방을 향한 미확정 시도를 즉시 무효화한다')

    beforeFinalize.resolve()
    const ack = await accepting

    assert.equal(ack.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(guestSocket.rooms.has(room.roomId), false, '실패하면 실제 채널에서도 나가야 한다')
    assert.notEqual(service.state.entryOutcome, 'PUBLISHED')
    void hostSocket
})

test('상태표 5: 두 번째 잠금에서 차단이 확인되면 역사적 ACCEPTED는 남고 입장만 INTERRUPTED다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, { gates: { blockBeforeEntry: true } })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    assert.equal(ack.ok, false)
    assert.equal(ack.code, 'BLOCKED')
    assert.equal(service.state.status, 'ACCEPTED', '역사적 수락 결정은 되돌리지 않는다')
    assert.equal(service.state.entryOutcome, 'INTERRUPTED')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === GUEST), false)
    assert.equal(snapshot.gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST), false)
    assert.equal(guestSocket.rooms.has(room.roomId), false)
})

// ---------------------------------------------------------------------------
// 상태표 (6) Map publication 이후 영수증 실패 — 동기 보상
// ---------------------------------------------------------------------------

test('상태표 6: 영수증 확정 실패는 두 Map을 동기 제거하고 성공 ACK를 내지 않는다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, { gates: { receiptShouldFail: true } })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true, '확정 여부를 모를 때는 실패가 아니라 UNKNOWN으로 알린다')
    assert.notEqual(service.state.entryOutcome, 'PUBLISHED')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === GUEST), false)
    assert.equal(snapshot.gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST), false)
    assert.equal(guestSocket.rooms.has(room.roomId), false)
    assert.equal(snapshot.roomAdmissionAttempts.length, 0)
})

// ---------------------------------------------------------------------------
// 상태표 (4) disconnect · canonical 교체
// ---------------------------------------------------------------------------

test('상태표 4: 결정 중 disconnect하면 자기 예약이 즉시 사라지고 publication이 0이다', async (t) => {
    const beforeFinalize = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { beforeFinalize: beforeFinalize.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    guestSocket.connected = false
    matchmaking.onDisconnect(io, guestSocket, GUEST)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)
    // 확정되지 않은 입장에는 재접속 유예가 없다.
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), [])

    beforeFinalize.resolve()
    const ack = await accepting
    assert.equal(ack.ok, false)
    assert.equal(matchmaking.__getStateSnapshotForTests()
        .gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST), false)
    assert.notEqual(service.state.entryOutcome, 'PUBLISHED')
})

test('상태표 4: canonical 소켓이 교체되면 미확정 채널을 복구하지 않는다', async (t) => {
    const beforeFinalize = deferred()
    const { io, guestSocket } = await setupRoomWithInvite(t, { gates: { beforeFinalize: beforeFinalize.promise } })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const replacement = createFakeSocket(GUEST, { id: 'sock-guest-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await matchmaking.resyncRoomChannelOnReconnect(replacement, GUEST)

    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)
    assert.deepEqual(replacement.joined, [], '확정되지 않은 입장 채널은 복구되지 않는다')

    beforeFinalize.resolve()
    const ack = await accepting
    assert.equal(ack.ok, false)
})

// ---------------------------------------------------------------------------
// 세션 종료 정리 — playerRoom이 없어도 예약을 즉시 무효화한다
// ---------------------------------------------------------------------------

test('AC-06: 세션 종료 정리는 playerRoom이 없는 예약도 즉시 무효화한다', async (t) => {
    const beforeFinalize = deferred()
    const { io, guestSocket } = await setupRoomWithInvite(t, { gates: { beforeFinalize: beforeFinalize.promise } })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 1)
    matchmaking.cleanupRoomStateForSessionParticipants(io, [GUEST])
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)

    beforeFinalize.resolve()
    const ack = await accepting
    assert.equal(ack.ok, false)
})

// ---------------------------------------------------------------------------
// 중복 요청 · 결과 재조회
// ---------------------------------------------------------------------------

test('AC-06: 처리 중 같은 초대를 다시 수락하면 두 번째는 REQUEST_IN_PROGRESS로 거부된다', async (t) => {
    const beforeDecision = deferred()
    const { io, guestSocket, service } = await setupRoomWithInvite(t, { gates: { beforeDecision: beforeDecision.promise } })

    const first = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const second = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(second.ok, false)
    assert.equal(second.code, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS)

    beforeDecision.resolve()
    assert.equal((await first).ok, true)
    assert.equal(service.state.decisionCalls, 1, '연타가 두 번째 수락 결정을 만들지 않는다')
})

test('AC-06: 결과 재조회는 durable 영수증과 현재 소속이 모두 맞을 때만 entered=true다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t)
    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, true)

    const entered = await callAsPromise(
        handleGetGameInviteResult, GUEST, { inviteId: INVITE_ID, attemptId: ack.attemptId },
    )
    assert.equal(entered.entered, true)
    assert.equal(entered.room.roomId, room.roomId)

    // 확정 영수증(PUBLISHED)은 역사로 남지만 현재 소속이 사라지면 성공이 아니다(A-10).
    matchmaking.__removeRoomForTests(room.roomId)
    const afterGone = await callAsPromise(
        handleGetGameInviteResult, GUEST, { inviteId: INVITE_ID, attemptId: ack.attemptId },
    )
    assert.equal(service.state.entryOutcome, 'PUBLISHED')
    assert.equal(afterGone.entered, false, '과거 PUBLISHED만으로 옛 대기방 이동을 정당화하지 않는다')
    assert.equal(afterGone.room, null)
})

test('AC-06: 다른 시도 id로 물으면 staleAttempt로 답하고 입장을 주장하지 않는다', async (t) => {
    const { io, guestSocket } = await setupRoomWithInvite(t)
    await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })

    const result = await callAsPromise(
        handleGetGameInviteResult, GUEST, { inviteId: INVITE_ID, attemptId: 'adm-someone-else' },
    )
    assert.equal(result.staleAttempt, true)
    assert.equal(result.entered, false)
})

// ---------------------------------------------------------------------------
// boot epoch — 재시작을 넘는 재실행 금지(A-11)
// ---------------------------------------------------------------------------

test('A-11: 옛 boot epoch의 초대는 같은 코드의 새 방으로 입장하지 못한다', async (t) => {
    const hostSocket = createFakeSocket(HOST)
    const guestSocket = createFakeSocket(GUEST)
    const io = createFakeIo([hostSocket, guestSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, HOST, validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)

    const service = createInviteServiceStub({
        roomId: created.room.roomId,
        roomInstanceId: room.instanceId,
        bootEpoch: 'boot-from-a-previous-process',
    })
    matchmaking.__setGameInviteServiceForTests(service)
    t.after(() => matchmaking.__setGameInviteServiceForTests(null))

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, 'SERVER_RESTARTED')
    assert.equal(service.state.decisionCalls, 0)
})

test('A-11: 같은 roomId라도 방 인스턴스가 다르면 입장하지 않는다', async (t) => {
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t)
    // 초대가 기억한 인스턴스와 현재 방의 인스턴스를 어긋나게 만든다(방이 사라졌다가
    // 같은 식별자로 다시 생긴 상황의 재현).
    const original = service.getAttemptOutcome
    service.getAttemptOutcome = async (args) => {
        const result = await original.call(service, args)
        return result.known && !result.staleAttempt
            ? { ...result, roomInstanceId: 'instance-from-an-older-room' }
            : result
    }

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
    assert.equal(matchmaking.__getStateSnapshotForTests()
        .gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST), false)
})

// ---------------------------------------------------------------------------
// 입력 검증
// ---------------------------------------------------------------------------

test('AC-06: 잘못된 payload는 어떤 상태도 바꾸지 않고 거부된다', async (t) => {
    const { io, guestSocket } = await setupRoomWithInvite(t)

    for (const payload of [null, 'invite-1', [], {}, { inviteId: 123 }]) {
        const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, payload)
        assert.equal(ack.ok, false)
        assert.equal(ack.code, 'INVALID_REQUEST')
    }
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)
})

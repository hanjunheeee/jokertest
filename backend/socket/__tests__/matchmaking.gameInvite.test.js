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
    // F-20(AC-04): set_ready/start_game은 roomId·expectedSettingsVersion을 필수로 요구한다.
    readyPayload,
    startPayload,
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

            // publish 직후 · durable 영수증 직전에서 멈춘다. 두 Map에는 들어갔지만 영수증은
            // 아직 없는 구간을 결정적으로 재현한다(원격 SQL이 아직 응답하지 않은 상태).
            if (gates.afterPublish) await gates.afterPublish

            if (gates.receiptShouldFail) {
                // 영수증 쓰기/커밋 실패 — 방금 넣은 두 Map을 **동기적으로** 되돌려야 한다.
                unpublish()
                return { ok: false, code: 'RECEIPT_FAILED', published: true, unknown: true }
            }
            state.entryOutcome = 'PUBLISHED'
            return { ok: true, alreadyPublished: false }
        },
        /**
         * 실제 서비스의 **조건부 UPDATE 술어를 그대로** 옮긴다(review5 #2).
         *
         * gameInvite.service.js::recordEntryInterrupted는 한 문장으로
         *   WHERE id=? AND attempt_id=? AND entry_outcome='UNCONFIRMED'
         * 를 쓰고 영향받은 행 수를 돌려준다. 예전 대역은 attempt 소유와 UNCONFIRMED를
         * 확인하지 않고 무조건 INTERRUPTED를 적어서, 실제로는 **0행이라 아무것도 기록되지
         * 않는** 경우(결정이 아직 attempt_id를 설치하기 전)를 성공으로 위장했다.
         */
        async recordEntryInterrupted({ attemptId, reason }) {
            state.interruptions.push({ attemptId, reason })
            if (typeof attemptId !== 'string' || attemptId.length === 0) return false
            if (state.attemptId !== attemptId) return false
            if (state.entryOutcome !== 'UNCONFIRMED') return false
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
async function setupRoomWithInvite(t, {
    maxPlayers = 4, gates = {}, fillWith = [], allReady = false, guestSocketOptions = {},
} = {}) {
    const hostSocket = createFakeSocket(HOST)
    const guestSocket = createFakeSocket(GUEST, guestSocketOptions)
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
        await callAsPromise(handleSetReady, io, hostSocket, HOST, readyPayload(created.room))
        for (let i = 0; i < fillerSockets.length; i += 1) {
            await callAsPromise(handleSetReady, io, fillerSockets[i], fillWith[i], readyPayload(created.room))
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
    const { io, hostSocket, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1'], allReady: true,
        gates: { beforeDecision: beforeDecision.promise },
    })

    // 예약이 없을 때는 실제로 시작 가능한 상태였음을 먼저 확인한다.
    assert.equal((await callAsPromise(handleGetCurrentRoom, HOST)).room.canStart, true)

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const current = await callAsPromise(handleGetCurrentRoom, HOST)
    assert.equal(current.room.canStart, false, '확정되지 않은 입장이 있으면 시작할 수 없다')

    const started = await callAsPromise(handleStartGame, io, hostSocket, HOST, startPayload(room))
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

    const ready = await callAsPromise(handleSetReady, io, guestSocket, GUEST, readyPayload(room))
    assert.equal(ready.ok, false, '입장 확정 전에는 준비 상태를 바꿀 수 없다')

    beforeFinalize.resolve()
    await accepting
    // 확정 이후에는 정상적으로 바뀐다.
    const readyAfter = await callAsPromise(handleSetReady, io, guestSocket, GUEST, readyPayload(room))
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

// ---------------------------------------------------------------------------
// 상태표 4 · JOIN_TIMEOUT 뒤 늦게 성공한 채널 가입
//
// 제한 시간은 **애플리케이션 대기의 상한**일 뿐이다 — 어댑터의 socket.join은 그 뒤에
// 성공할 수 있다. 그대로 두면 두 Map에는 없는데 실제 방송 room에만 남아 다른 참가자의
// 사건을 계속 받는 "유령 청취자"가 된다. 반대로 무조건 leave하면 그 사이에 정상 경로로
// 다시 들어온 **더 새로운 소속**의 채널을 끊는다. 세 경우를 모두 확인한다.
// ---------------------------------------------------------------------------

/** 늦은 join 완료 → 정리 콜백까지 실제로 돌게 이벤트 루프를 몇 틱 흘린다. */
async function drainTicks(times = 4) {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

test('상태표 4: JOIN_TIMEOUT 뒤 늦게 성공한 채널 가입은 정리된다', async (t) => {
    // 실제 5초를 기다리지 않고 같은 timeout 경로를 돈다(판정 로직은 프로덕션 그대로).
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true, 'timeout은 실패가 아니라 모름이다')

    // 아직 가입 자체가 끝나지 않았다 — 어디에도 없다.
    assert.equal(guestSocket.rooms.has(room.roomId), false)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)

    // 이제 어댑터가 늦게 성공한다.
    joinGate.resolve()
    await drainTicks()

    assert.equal(
        guestSocket.rooms.has(room.roomId), false,
        '두 Map에는 없는데 실제 방송 room에만 남으면 다른 참가자의 사건을 계속 받는다',
    )
    assert.deepEqual(guestSocket.left, [room.roomId], '늦게 성공한 가입은 정확히 한 번 정리된다')
    assert.equal(
        matchmaking.__getStateSnapshotForTests()
            .gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST),
        false,
    )
    assert.equal(service.state.entryOutcome, 'INTERRUPTED')
})

test('상태표 4: 늦은 가입 정리가 그 사이 확정된 새 소속을 끊지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)

    // timeout 뒤, 늦은 완료가 오기 전에 같은 계정이 정상 경로로 그 방의 확정 참가자가 됐다.
    // 여기서는 정리 판정이 실제로 보는 사실 하나(canonical membership)만 세운다.
    matchmaking.__seedPlayerRoomForTests(GUEST, room.roomId)

    joinGate.resolve()
    await drainTicks()

    assert.deepEqual(guestSocket.left, [], '확정된 새 소속의 채널을 끊으면 방송을 못 받는다')
})

test('상태표 4: 소켓이 교체된 뒤의 늦은 가입은 새 소켓의 채널을 건드리지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)

    // 재접속으로 canonical 소켓이 바뀌었다 — 옛 소켓의 늦은 완료는 옛 소켓만 정리한다.
    const replacement = createFakeSocket(GUEST, { id: 'sock-guest-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await replacement.join(room.roomId)

    joinGate.resolve()
    await drainTicks()

    assert.deepEqual(guestSocket.left, [room.roomId])
    assert.deepEqual(replacement.left, [], '새 소켓의 채널은 옛 시도가 건드리지 않는다')
    assert.equal(replacement.rooms.has(room.roomId), true)
})

test('상태표 4: 교체 소켓이 같은 방의 확정 참가자가 돼도 옛 소켓의 늦은 가입은 정리된다', async (t) => {
    // CODEX-2 보수 회귀. 예전 판정은 playerRoom.get(uuid) === roomId만 보고 물러났다 —
    // 그 소속을 만든 것이 **교체 소켓**인데도 옛 소켓의 채널이 그대로 남아, 두 연결이
    // 같은 방 방송을 받는 유령 청취자가 생겼다.
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true)

    // 재접속한 새 소켓이 정상 경로로 그 방의 확정 참가자가 됐다 — 소속도 새 소켓의 것이다.
    const replacement = createFakeSocket(GUEST, { id: 'sock-guest-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await replacement.join(room.roomId)
    replacement.data.activeRoomId = room.roomId
    matchmaking.__seedPlayerRoomForTests(GUEST, room.roomId)

    joinGate.resolve()
    await drainTicks()

    assert.deepEqual(
        guestSocket.left, [room.roomId],
        '소속이 있다는 사실은 **옛** 소켓의 채널을 남길 근거가 아니다',
    )
    assert.equal(guestSocket.rooms.has(room.roomId), false)
    assert.deepEqual(replacement.left, [], '새 연결의 채널은 그대로 남는다')
    assert.equal(replacement.rooms.has(room.roomId), true)
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([uuid]) => uuid === GUEST)?.[1],
        room.roomId,
        '유효한 새 소속 자체는 지우지 않는다',
    )
})

// ---------------------------------------------------------------------------
// review5 #1 · 기한 경과와 publication 소유권
//
// 시도의 기한(ADMISSION_TOTAL_TIMEOUT_MS)은 **애플리케이션 대기의 상한**이다. Date.now()가
// 그 값을 넘는 순간은 정확하지만, withAdmissionTimeout의 setTimeout은 이벤트 루프가 밀리면
// 그보다 늦게 실행된다. 그 창에 들어오는 get_current_room·ready·start·인원 판정이 전부
// getAdmissionAttempt를 지나므로, 기한 경과 처리가 "토큰만 버리는" 것이면:
//
//   · 영수증 없는 publication이 **정상 소속**으로 보이고,
//   · 그 소속을 되돌릴 소유자가 사라져 뒤이은 timeout 정리가 아무것도 하지 못한다.
// ---------------------------------------------------------------------------

test('review5 #1: 영수증이 지연되는 동안 기한이 지나도 미확정 소속을 정상 소속으로 답하지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 200, total: 200 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    // 영수증 직전에서 멈춘다 — 두 Map에는 들어갔지만 durable 영수증은 아직 없다.
    const afterPublish = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { afterPublish: afterPublish.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await drainTicks()

    const published = matchmaking.__getStateSnapshotForTests()
    assert.equal(published.roomAdmissionAttempts[0]?.[1].phase, 'published', 'publish까지 진행돼야 한다')
    assert.equal(published.playerRoom.find(([uuid]) => uuid === GUEST)?.[1], room.roomId)

    // 원격 SQL이 아직 응답하지 않은 채 기한만 지났다(가상 시계 전진).
    matchmaking.__expireAdmissionAttemptForTests(GUEST)

    const current = await callAsPromise(handleGetCurrentRoom, GUEST)
    assert.deepEqual(
        current, { ok: true, room: null, pending: true },
        '영수증 없는 입장을 정상 소속으로 답하면 화면이 확정되지 않은 입장을 확정된 것으로 표시한다',
    )

    // 기한이 지났다는 이유로 토큰만 버리면 이 publication을 되돌릴 소유자가 사라진다.
    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 1,
        '미확정 publication의 소유권은 기한이 지나도 남아 있어야 되돌릴 수 있다',
    )

    // 이제 실제 RECEIPT_TIMEOUT이 정착한다 — 미확정 소속은 반드시 회수돼야 한다.
    const ack = await accepting
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true, 'timeout은 실패가 아니라 모름이다')

    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.playerRoom.find(([uuid]) => uuid === GUEST), undefined, '미확정 소속이 남았다')
    assert.equal(
        after.gameRooms.find(([id]) => id === room.roomId)[1].players.some(([uuid]) => uuid === GUEST),
        false, '미확정 참가자가 방 목록에 남았다',
    )
    assert.equal(guestSocket.rooms.has(room.roomId), false, '미확정 채널이 남으면 유령 청취자가 된다')
    assert.equal(after.roomAdmissionAttempts.length, 0)
    assert.equal(service.state.entryOutcome, 'INTERRUPTED', '무효화된 시도의 durable 상태를 맞춰야 한다')

    afterPublish.resolve()
    await drainTicks()
})

test('review5 #1: 늦게 도착한 옛 시도의 보상이 그 사이 확정된 새 소속을 지우지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 120, total: 120 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const afterPublish = deferred()
    const { io, hostSocket, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { afterPublish: afterPublish.promise, receiptShouldFail: true },
    })

    // 옛 시도는 publish까지 갔다가 RECEIPT_TIMEOUT으로 끝난다 — 소속은 회수된다.
    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)

    // 그 뒤 같은 계정이 **정상 경로로** 같은 방의 확정 참가자가 됐다.
    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
        '정상 입장이 성립해야 이 시험이 의미가 있다',
    )
    hostSocket.emitted.length = 0
    guestSocket.left.length = 0

    // 이제서야 옛 시도의 서비스가 깨어나 unpublish를 부른다(늦게 끝난 원격 트랜잭션).
    afterPublish.resolve()
    await drainTicks()

    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(
        after.playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
        '옛 시도의 늦은 보상이 더 새로운 확정 소속을 지웠다',
    )
    assert.equal(
        after.gameRooms.find(([id]) => id === room.roomId)[1].players.some(([u]) => u === GUEST),
        true, '확정 참가자가 방 목록에서 사라졌다',
    )
    assert.equal(guestSocket.rooms.has(room.roomId), true, '확정된 새 소속의 채널을 끊으면 방송을 못 받는다')
    assert.deepEqual(guestSocket.left, [], '새 소속의 채널을 끊으면 안 된다')
    assert.equal(
        hostSocket.emitted.some((e) => e.event === 'player_left_room'), false,
        '실제로 나가지 않은 참가자의 이탈을 방송하면 다른 참가자의 화면이 거짓이 된다',
    )
})

/**
 * F-21(AC-05/AC-06) 소유권 경계의 고정.
 *
 * "실패한 초대 시도의 채널 정리가 그 사이 정상 입장한 **새 소속**의 채널을 뗀다"는 지적을
 * 실제 경로로 재현하려 한 시험이다. 재현되지 않는다 — 그 이유를 여기서 고정한다:
 * handleAcceptGameInvite는 계정 단위 전이 잠금(pendingRoomTransitions)을 **핸들러 전체**
 * 동안 쥐고 있고(finally에서만 놓는다), 다른 입장 생산자는 전부 그 잠금을 먼저 본다.
 * 그래서 publish와 실패 정리 사이에 같은 계정의 새 소속이 성립할 수 없다.
 *
 * 이 시험은 그 잠금 자체를 단언한다 — 잠금이 사라지면(또는 정리가 잠금 밖으로 나가면) 여기서
 * 먼저 깨진다. 정리 경로의 소유권 검사(isAccountSeatedInRoom)는 그 경우를 대비한 방어다.
 */
test('F-21(AC-05/AC-06): 초대 수락이 진행 중인 계정은 새 소속을 만들 수 없다(실패 정리가 겨눌 새 소속이 없다)', async (t) => {
    const afterPublish = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { afterPublish: afterPublish.promise, receiptShouldFail: true },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await drainTicks()
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
        'publish까지는 가야 이 시험이 의미를 갖는다',
    )

    // 원격 영수증을 기다리는 동안 그 미확정 소속이 회수됐다(명시적 이탈).
    matchmaking.__testables.removeFromRoom(io, guestSocket, GUEST)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)
    guestSocket.emitted.length = 0

    // 그래도 같은 계정은 새 소속을 만들 수 없다 — 시도는 아직 끝나지 않았다.
    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    const failed = guestSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.equal(failed?.payload?.code, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)

    // 이제 옛 시도가 실패로 끝난다. 겨눌 새 소속이 없으므로 정리는 자기 잔여물만 건드린다.
    afterPublish.resolve()
    const ack = await accepting
    await drainTicks()

    assert.equal(ack.ok, false, '실패한 시도를 성공으로 바꾸지 않는다')
    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.playerRoom.find(([u]) => u === GUEST), undefined)
    assert.equal(guestSocket.rooms.has(room.roomId), false, '미확정 채널이 남으면 유령 청취자가 된다')
    assert.equal(service.state.entryOutcome, 'INTERRUPTED', '실패한 시도의 durable 상태는 그대로 맞춘다')
})

// ---------------------------------------------------------------------------
// review5 #2 · 늦게 커밋된 수락 결정의 정직한 정착
//
// recordEntryInterrupted는 id + attempt_id + entry_outcome='UNCONFIRMED' 한 문장이다(경합
// 보호). 그래서 **결정이 아직 attempt_id를 설치하기 전**에 부르면 0행이라 아무것도 적히지
// 않는다. 그 뒤 늦은 결정이 커밋되면 ACCEPTED/UNCONFIRMED가 영구히 남는다 — 아무도 입장하지
// 않았는데 "입장 결과 미확정"으로 굳는다.
// ---------------------------------------------------------------------------

test('review5 #2: 결정이 늦게 커밋되면 실패한 시도를 뒤늦게라도 정직하게 정착시킨다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 60, total: 60 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    // 결정이 잠금을 얻거나 커밋하기 **전에** 멈춘다.
    const beforeDecision = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { beforeDecision: beforeDecision.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true)

    // 이 시점의 보상은 조건부 UPDATE가 0행이다 — 아직 attempt_id가 설치되지 않았다.
    assert.equal(service.state.attemptId, null)
    assert.equal(service.state.entryOutcome, null)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)

    // 이제 원격 트랜잭션이 늦게 깨어나 결정을 커밋한다.
    beforeDecision.resolve()
    await drainTicks(8)

    assert.equal(service.state.status, 'ACCEPTED', '역사적 결정 자체는 그대로 보존한다')
    assert.equal(
        service.state.entryOutcome, 'INTERRUPTED',
        '늦게 커밋된 결정이 ACCEPTED/UNCONFIRMED로 영구히 남으면 아무도 입장하지 않은 시도가 미확정으로 굳는다',
    )

    // 입장을 지어내지 않는다 — 어떤 Map에도, 어떤 채널에도 들어가지 않았다.
    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.playerRoom.find(([u]) => u === GUEST), undefined)
    assert.equal(
        after.gameRooms.find(([id]) => id === room.roomId)[1].players.some(([u]) => u === GUEST), false,
    )
    assert.equal(guestSocket.rooms.has(room.roomId), false)
    assert.equal(service.state.finalizeCalls, 0, '결정이 정착하기 전에 끝난 시도는 finalize로 가지 않는다')
})

test('review5 #2: 늦은 보상이 더 새로운 시도나 확정된 영수증을 덮지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 60, total: 60 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const beforeDecision = deferred()
    const gates = { beforeDecision: beforeDecision.promise }
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, { gates })

    const first = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(first.ok, false)

    // 옛 결정이 깨어나기 전에, 같은 초대가 **새 시도**로 확정 입장까지 마쳤다.
    service.state.status = 'PENDING'
    service.state.attemptId = null
    service.state.entryOutcome = null
    gates.beforeDecision = null
    const second = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(second.ok, true, '새 시도는 정상적으로 확정돼야 한다')
    assert.equal(service.state.entryOutcome, 'PUBLISHED')
    const newAttemptId = service.state.attemptId

    // 이제 옛 결정이 늦게 깨어난다.
    beforeDecision.resolve()
    await drainTicks(8)

    assert.equal(service.state.attemptId, newAttemptId, '늦은 보상이 새 시도의 attempt를 덮었다')
    assert.equal(
        service.state.entryOutcome, 'PUBLISHED',
        '확정된 영수증을 늦은 보상이 INTERRUPTED로 뒤집으면 실제 참가자의 입장이 거짓이 된다',
    )
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
        '확정된 소속은 그대로 남아야 한다',
    )
})

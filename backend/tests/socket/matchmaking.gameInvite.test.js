'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) =>
        new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})

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
    getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
})

const gameSessionCore = require('../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors')
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
    readyPayload,
    startPayload,
} = require('../helpers/matchmakingFixtures')

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

            if (gates.afterPublish) await gates.afterPublish

            if (gates.receiptShouldFail) {
                unpublish()
                return { ok: false, code: 'RECEIPT_FAILED', published: true, unknown: true }
            }
            state.entryOutcome = 'PUBLISHED'
            return { ok: true, alreadyPublished: false }
        },
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
    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM)
})

test('상태표 1: 정원이 이미 찼으면 예약 없이 ROOM_FULL이다', async (t) => {
    const { io, guestSocket, service } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1', 'filler-2', 'filler-3'],
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.code, ROOM_JOIN_ERROR_CODES.ROOM_FULL)
    assert.equal(service.state.decisionCalls, 0)
})

test('AC-06: 예약 중에는 인원 한 자리를 차지해 마지막 자리 일반 입장이 거부된다', async (t) => {
    const beforeDecision = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1', 'filler-2'],
        gates: { beforeDecision: beforeDecision.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const reserved = matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts
    assert.equal(reserved.length, 1)
    assert.equal(reserved[0][1].phase, 'reserved')

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
    const { io, hostSocket, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 4, fillWith: ['filler-1'], allReady: true,
        gates: { beforeDecision: beforeDecision.promise },
    })

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
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    const ready = await callAsPromise(handleSetReady, io, guestSocket, GUEST, readyPayload(room))
    assert.equal(ready.ok, false, '입장 확정 전에는 준비 상태를 바꿀 수 없다')

    beforeFinalize.resolve()
    await accepting
    const readyAfter = await callAsPromise(handleSetReady, io, guestSocket, GUEST, readyPayload(room))
    assert.equal(readyAfter.ok, true)
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === room.roomId)[1]
        .players.find(([uuid]) => uuid === GUEST)[1].isReady, true)
})

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

test('AC-06: 잘못된 payload는 어떤 상태도 바꾸지 않고 거부된다', async (t) => {
    const { io, guestSocket } = await setupRoomWithInvite(t)

    for (const payload of [null, 'invite-1', [], {}, { inviteId: 123 }]) {
        const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, payload)
        assert.equal(ack.ok, false)
        assert.equal(ack.code, 'INVALID_REQUEST')
    }
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)
})

async function drainTicks(times = 4) {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

test('상태표 4: JOIN_TIMEOUT 뒤 늦게 성공한 채널 가입은 정리된다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true, 'timeout은 실패가 아니라 모름이다')

    assert.equal(guestSocket.rooms.has(room.roomId), false)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)

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
    matchmaking.__setAdmissionTimeoutsForTests({ step: 40, total: 4000 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const joinGate = deferred()
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        guestSocketOptions: { joinGate: joinGate.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true)

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

test('AC-04(보수): 실패 정리의 늦은 소유권 재검사는 같은 채널에 정상 재소속한 소켓의 가입을 복원한다', async (t) => {
    const { io, hostSocket, guestSocket, room } = await setupRoomWithInvite(t, {
        gates: { blockBeforeEntry: true },
    })
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const leaveGate = deferred()
    const originalLeave = guestSocket.leave.bind(guestSocket)
    guestSocket.leave = async (channelId) => {
        await leaveGate.promise
        return originalLeave(channelId)
    }

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(guestSocket.rooms.has(room.roomId), true, '전제: 실패 시점에 채널 가입은 아직 남아 있다')
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.some(([uuid]) => uuid === GUEST), false,
        '전제: 실패한 시도는 소속을 남기지 않는다',
    )

    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([uuid]) => uuid === GUEST)?.[1],
        room.roomId, '전제: 정상 입장이 성립해야 한다',
    )

    leaveGate.resolve()
    await drainTicks()

    assert.equal(
        guestSocket.rooms.has(room.roomId), true,
        '늦은 실패 정리가 정상 재소속의 채널 가입을 되돌려 주지 않았다',
    )
    assert.equal(
        channelMembership.isSocketExcludedFromChannel(room.roomId, guestSocket.id), false,
        '정상 참가자가 전달 제외에 남았다',
    )

    const before = guestSocket.countReceived('player_ready_changed')
    await callAsPromise(handleSetReady, io, hostSocket, HOST, readyPayload(room))
    assert.equal(
        guestSocket.countReceived('player_ready_changed') - before, 1,
        '복원된 채널로 방송이 전달되지 않았다',
    )
})

function received(socket, event) {
    return socket.received.filter((entry) => entry.event === event).length
}

const channelMembership = require('../../socket/channelMembership')
function broadcastThroughProductionBoundary(io, roomId, event, payload) {
    channelMembership.emitToChannel(io, roomId, event, payload)
}

test('F-23(AC-04): join 완료 → publish 전 → 영수증 대기 구간의 방송은 확정 전 입장자에게 한 번도 닿지 않는다', async (t) => {
    const beforeFinalize = deferred()
    const afterPublish = deferred()
    const { io, hostSocket, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 6,
        fillWith: ['invite-delivery-peer'],
        gates: { beforeFinalize: beforeFinalize.promise, afterPublish: afterPublish.promise },
    })
    const peerSocket = io.sockets.sockets.get('sock-invite-delivery-peer')
    assert.ok(peerSocket, '양성 대조로 쓸 정상 참가자 소켓이 있어야 한다')

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await drainTicks()

    assert.equal(guestSocket.rooms.has(room.roomId), true, '전제: 채널에는 이미 가입돼 있다')
    broadcastThroughProductionBoundary(io, room.roomId, 'probe_before_publish', { roomId: room.roomId })
    await callAsPromise(handleSetReady, io, hostSocket, HOST, readyPayload(room))

    beforeFinalize.resolve()
    await drainTicks()

    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts[0]?.[1].phase, 'published',
        '전제: publish까지 진행된 상태여야 한다',
    )
    broadcastThroughProductionBoundary(io, room.roomId, 'probe_after_publish', { roomId: room.roomId })
    await callAsPromise(handleSetReady, io, hostSocket, HOST, readyPayload(room, false))

    assert.equal(received(guestSocket, 'probe_before_publish'), 0, 'publish 전 방송이 확정 전 입장자에게 닿았다')
    assert.equal(received(guestSocket, 'probe_after_publish'), 0, '영수증 대기 중 방송이 확정 전 입장자에게 닿았다')
    assert.equal(received(guestSocket, 'player_ready_changed'), 0, '확정 전 입장자가 준비 변경을 받았다')
    assert.equal(received(peerSocket, 'probe_before_publish'), 1, '정상 참가자가 방송을 받지 못했다')
    assert.equal(received(peerSocket, 'probe_after_publish'), 1, '정상 참가자가 방송을 받지 못했다')
    assert.ok(received(peerSocket, 'player_ready_changed') >= 1, '정상 참가자가 준비 변경을 받지 못했다')

    afterPublish.resolve()
    const ack = await accepting
    assert.equal(ack.ok, true, ack.message)

    broadcastThroughProductionBoundary(io, room.roomId, 'probe_after_confirm', { roomId: room.roomId })
    assert.equal(received(guestSocket, 'probe_after_confirm'), 1, '확정된 참가자가 방송을 받지 못했다')
    assert.equal(received(guestSocket, 'probe_before_publish'), 0)
    assert.equal(received(guestSocket, 'probe_after_publish'), 0)
})

test('F-23(AC-04): 영수증 실패로 끝난 시도는 성공 ACK도 없고, 같은 소켓의 다음 정상 입장은 방송을 정상 수신한다', async (t) => {
    const { io, guestSocket, room } = await setupRoomWithInvite(t, {
        maxPlayers: 6, gates: { receiptShouldFail: true },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false, '영수증 실패가 성공 ACK로 전달됐다')

    broadcastThroughProductionBoundary(io, room.roomId, 'probe_after_failure', { roomId: room.roomId })
    assert.equal(received(guestSocket, 'probe_after_failure'), 0, '실패한 입장자가 방송을 받았다')

    const joined = await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    assert.equal(joined?.ok ?? true, true, `정상 재입장이 거부됐다: ${JSON.stringify(joined)}`)
    broadcastThroughProductionBoundary(io, room.roomId, 'probe_after_rejoin', { roomId: room.roomId })
    assert.equal(
        received(guestSocket, 'probe_after_rejoin'), 1,
        '폐기된 옛 제외 토큰이 남아 새 정상 소속이 방송을 받지 못한다',
    )
})

test('review5 #1: 영수증이 지연되는 동안 기한이 지나도 미확정 소속을 정상 소속으로 답하지 않는다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 200, total: 200 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const afterPublish = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { afterPublish: afterPublish.promise },
    })

    const accepting = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await drainTicks()

    const published = matchmaking.__getStateSnapshotForTests()
    assert.equal(published.roomAdmissionAttempts[0]?.[1].phase, 'published', 'publish까지 진행돼야 한다')
    assert.equal(published.playerRoom.find(([uuid]) => uuid === GUEST)?.[1], room.roomId)

    matchmaking.__expireAdmissionAttemptForTests(GUEST)

    const current = await callAsPromise(handleGetCurrentRoom, GUEST)
    assert.deepEqual(
        current, { ok: true, room: null, pending: true },
        '영수증 없는 입장을 정상 소속으로 답하면 화면이 확정되지 않은 입장을 확정된 것으로 표시한다',
    )

    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 1,
        '미확정 publication의 소유권은 기한이 지나도 남아 있어야 되돌릴 수 있다',
    )

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

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)

    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
        '정상 입장이 성립해야 이 시험이 의미가 있다',
    )
    hostSocket.emitted.length = 0
    guestSocket.left.length = 0

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

    matchmaking.__testables.removeFromRoom(io, guestSocket, GUEST)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)
    guestSocket.emitted.length = 0

    await handleJoinRoomByCode(io, guestSocket, GUEST, room.roomCode)
    const failed = guestSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.equal(failed?.payload?.code, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS)
    assert.equal(matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST), undefined)

    afterPublish.resolve()
    const ack = await accepting
    await drainTicks()

    assert.equal(ack.ok, false, '실패한 시도를 성공으로 바꾸지 않는다')
    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.playerRoom.find(([u]) => u === GUEST), undefined)
    assert.equal(guestSocket.rooms.has(room.roomId), false, '미확정 채널이 남으면 유령 청취자가 된다')
    assert.equal(service.state.entryOutcome, 'INTERRUPTED', '실패한 시도의 durable 상태는 그대로 맞춘다')
})

test('review5 #2: 결정이 늦게 커밋되면 실패한 시도를 뒤늦게라도 정직하게 정착시킨다', async (t) => {
    matchmaking.__setAdmissionTimeoutsForTests({ step: 60, total: 60 })
    t.after(() => matchmaking.__setAdmissionTimeoutsForTests())

    const beforeDecision = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { beforeDecision: beforeDecision.promise },
    })

    const ack = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(ack.ok, false)
    assert.equal(ack.unknown, true)

    assert.equal(service.state.attemptId, null)
    assert.equal(service.state.entryOutcome, null)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomAdmissionAttempts.length, 0)

    beforeDecision.resolve()
    await drainTicks(8)

    assert.equal(service.state.status, 'ACCEPTED', '역사적 결정 자체는 그대로 보존한다')
    assert.equal(
        service.state.entryOutcome, 'INTERRUPTED',
        '늦게 커밋된 결정이 ACCEPTED/UNCONFIRMED로 영구히 남으면 아무도 입장하지 않은 시도가 미확정으로 굳는다',
    )

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

    service.state.status = 'PENDING'
    service.state.attemptId = null
    service.state.entryOutcome = null
    gates.beforeDecision = null
    const second = await callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    assert.equal(second.ok, true, '새 시도는 정상적으로 확정돼야 한다')
    assert.equal(service.state.entryOutcome, 'PUBLISHED')
    const newAttemptId = service.state.attemptId

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

test('F-21(AC-06): 영수증 확정 뒤 소속이 **다른 membership**으로 바뀌었으면 성공을 주장하지 않는다', async (t) => {
    const afterPublish = deferred()
    const { io, guestSocket, room, service } = await setupRoomWithInvite(t, {
        gates: { afterPublish: afterPublish.promise },
    })

    const pending = callAsPromise(handleAcceptGameInvite, io, guestSocket, GUEST, { inviteId: INVITE_ID })
    await drainTicks(8)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, seatedRoom] = snapshot.gameRooms.find(([id]) => id === room.roomId)
    const publishedMembershipId = seatedRoom.players.find(([u]) => u === GUEST)?.[1]?.membershipId
    assert.ok(publishedMembershipId, 'publish가 소속 식별자를 발급하지 않았다')

    matchmaking.__seedRoomForTests({
        id: room.roomId,
        instanceId: seatedRoom.instanceId,
        hostUuid: HOST,
        players: new Map([
            [HOST, { uuid: HOST, nickname: 'host', isReady: false, membershipId: 'mem-host' }],
            [GUEST, { uuid: GUEST, nickname: 'guest', isReady: false, membershipId: 'mem-guest-new' }],
        ]),
        settings: seatedRoom.settings,
    })
    matchmaking.__seedPlayerRoomForTests(GUEST, room.roomId)

    const beforeBroadcasts = io.broadcasts.length
    afterPublish.resolve()
    const response = await pending

    assert.equal(response.ok, false, '옛 초대가 남의 소속을 자기 성공으로 주장했다')
    assert.equal(response.unknown, true)
    const joined = io.broadcasts.slice(beforeBroadcasts).filter((b) => b.event === 'player_joined_room')
    assert.deepEqual(joined, [])
    assert.equal(guestSocket.emitted.filter((e) => e.event === 'player_joined_room').length, 0)
    assert.equal(
        matchmaking.__getStateSnapshotForTests().playerRoom.find(([u]) => u === GUEST)?.[1], room.roomId,
    )
    assert.equal(service.state.entryOutcome, 'PUBLISHED')
})

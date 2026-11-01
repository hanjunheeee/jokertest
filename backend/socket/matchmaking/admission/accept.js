// 초대 수락 입장 파일
// 초대 수락 → 자리 잡기 → 명단 넣기 → 영수증 + 결과 다시 묻기 (지도 23)
const kickReceiptStore = require('../../kickReceiptStore')
const gameSession = require('../../../game-core/gameSession')
const channelMembership = require('../../channelMembership')
const { ADMISSION_DEFAULT_STEP_TIMEOUT_MS, ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS, BOOT_EPOCH } = require('../core/constants')
const { rejectIfInActiveGame } = require('../join/guards')
const { playerRoom, matchmakingQueue, gameRooms, roomAdmissionAttempts, publishedAdmissions } = require('../core/state')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { getAdmissionAttempt, nextAttemptId, withAdmissionTimeout, countRoomOccupancy, compensateInvalidatedAttempt, releasePublishedAdmission } = require('./attempts')
const { acquireRoomTransition, getRoomTransitionGeneration, releaseRoomTransition } = require('../join/transition')
const { deps } = require('../core/deps')
const { getSupportedRoomSizes } = require('../core/config')
const { loadRoomParticipantProfile, computeCanStart, emitPublicRoomList, buildRoomPayload } = require('../room/view')
const { scheduleLateJoinCleanup, removePublishedAdmission } = require('./release')
const { isCanonicalSocketWhenObservable, isAccountSeatedInRoom, detachSocketFromChannel, isCanonicalSocketForAccount, hasRoomMembership, hasLiveGameMembership } = require('../room/membership')

// 입장 단계 하나 기다리는 시간 (시험이 줄임)
let ADMISSION_STEP_TIMEOUT_MS = ADMISSION_DEFAULT_STEP_TIMEOUT_MS

// 입장 전체 기다리는 시간 (시험이 줄임)
let ADMISSION_TOTAL_TIMEOUT_MS = ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS

// 시험용: 입장 대기 시간 바꾸기
function __setAdmissionTimeoutsForTests({ step, total } = {}) {
    ADMISSION_STEP_TIMEOUT_MS = Number.isFinite(step) ? step : ADMISSION_DEFAULT_STEP_TIMEOUT_MS
    ADMISSION_TOTAL_TIMEOUT_MS = Number.isFinite(total) ? total : ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS
}

// 초대 수락 입장: 자리 미리 잡고 단계마다 시간 제한, 실패하면 되돌림
async function handleAcceptGameInvite(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    let answered = false
    const respond = (result) => {
        if (answered) return
        answered = true
        try { callback(result) } catch (ackError) { console.error('[초대 수락 ack 실패]', ackError) }
    }

    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        respond({ ok: false, code: 'INVALID_REQUEST', message: '잘못된 요청입니다.' })
        return
    }

    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) => respond({ ok: false, code, message, gameId }))) return
    if (playerRoom.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }
    if (getAdmissionAttempt(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }

    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const attemptId = nextAttemptId()
    const startedAt = Date.now()
    const remaining = () => Math.max(0, ADMISSION_TOTAL_TIMEOUT_MS - (Date.now() - startedAt))
    const step = (promise, code) => withAdmissionTimeout(
        promise, Math.min(ADMISSION_STEP_TIMEOUT_MS, remaining() || 1), code,
    )

    let attempt = null
    let joinedRoomId = null
    const admissionExclusionOwner = channelMembership.createChannelExclusionOwner('admission')
    let admissionExclusionChannelId = null
    let admissionExclusionSocketId = null
    const releaseAdmissionExclusion = () => {
        if (admissionExclusionChannelId === null || admissionExclusionSocketId === null) return
        channelMembership.releaseChannelExclusion(
            admissionExclusionChannelId, admissionExclusionSocketId, admissionExclusionOwner,
        )
        admissionExclusionChannelId = null
        admissionExclusionSocketId = null
    }
    const socketIdAtRequest = socket.id

    try {
        const peek = await step(
            deps.gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId }), 'PEEK_TIMEOUT',
        )
        if (!peek.known) {
            respond({ ok: false, code: 'INVITE_NOT_FOUND', message: '초대를 찾을 수 없습니다.' })
            return
        }
        if (peek.bootEpoch !== BOOT_EPOCH) {
            respond({ ok: false, code: 'SERVER_RESTARTED', message: '초대가 더 이상 유효하지 않습니다.' })
            return
        }

        const room = gameRooms.get(peek.roomId)
        if (!room || (room.instanceId ?? room.id) !== peek.roomInstanceId) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, message: '방을 찾을 수 없습니다.' })
            return
        }
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        if (countRoomOccupancy(room, uuid) >= maxPlayers) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL, message: '방이 가득 찼습니다.' })
            return
        }
        attempt = {
            attemptId,
            accountUuid: uuid,
            inviteId,
            roomId: room.id,
            room,
            roomInstanceId: room.instanceId ?? room.id,
            bootEpoch: BOOT_EPOCH,
            generation: generationAtRequest,
            socketId: socket.id,
            phase: 'reserved',
            expiresAt: startedAt + ADMISSION_TOTAL_TIMEOUT_MS,
        }
        roomAdmissionAttempts.set(uuid, attempt)

        attempt.decisionPromise = Promise.resolve(
            deps.gameInviteService.recordAcceptDecision({ receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH }),
        ).then(
            (value) => { attempt.decisionSettled = true; return value },
            (error) => { attempt.decisionSettled = true; throw error },
        )
        attempt.decisionPromise.catch(() => {})
        await step(attempt.decisionPromise, 'DECISION_TIMEOUT')
        if (getAdmissionAttempt(uuid) !== attempt) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        const [user, accountProfile] = await step(Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ]), 'PROFILE_TIMEOUT')
        if (!user) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }
        if (getAdmissionAttempt(uuid) !== attempt || !socket.connected) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        admissionExclusionChannelId = room.id
        admissionExclusionSocketId = socket.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, admissionExclusionOwner)
        const joinPromise = Promise.resolve(socket.join(room.id))
        try {
            await step(joinPromise, 'JOIN_TIMEOUT')
            joinedRoomId = room.id
        } catch (joinError) {
            scheduleLateJoinCleanup(io, socket, room.id, uuid, attempt, joinPromise)
            throw joinError
        }

        if (socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !isCanonicalSocketWhenObservable(io, uuid, socket, room.id)) {
            if (!isAccountSeatedInRoom(uuid, room.id)) {
                detachSocketFromChannel(socket, room.id, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isAccountSeatedInRoom(uuid, room.id)
                        && isCanonicalSocketForAccount(io, uuid, socket, room.id),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            compensateInvalidatedAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        const player = { uuid, nickname: user.nickname, isReady: false, ...accountProfile }

        const publish = () => {
            if (getAdmissionAttempt(uuid) !== attempt) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.invalidated) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.bootEpoch !== BOOT_EPOCH) return { ok: false, code: 'SERVER_RESTARTED' }
            if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return { ok: false, code: 'SESSION_ENDED' }
            if (!socket.connected || attempt.socketId !== socket.id || socket.id !== socketIdAtRequest) {
                return { ok: false, code: 'DISCONNECTED' }
            }
            if (socket.data?.user?.uuid !== uuid) return { ok: false, code: 'DISCONNECTED' }
            if (!isCanonicalSocketWhenObservable(io, uuid, socket, room.id)) return { ok: false, code: 'DISCONNECTED' }
            if (socket.rooms && !socket.rooms.has(room.id)) return { ok: false, code: 'CHANNEL_LOST' }
            const current = gameRooms.get(attempt.roomId)
            if (current !== room || (current.instanceId ?? current.id) !== attempt.roomInstanceId) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND }
            }
            if (playerRoom.has(uuid)) return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM }
            const routing = gameSession.getActiveSessionRoutingInfo(uuid)
            if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME }
            }
            if (countRoomOccupancy(current, uuid) >= (current.settings?.maxPlayers ?? getSupportedRoomSizes()[0])) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL }
            }
            player.membershipId = kickReceiptStore.nextMembershipId()
            attempt.publicationMembershipId = player.membershipId
            current.players.set(uuid, player)
            playerRoom.set(uuid, current.id)
            attempt.phase = 'published'
            publishedAdmissions.set(uuid, attempt)
            socket.data.activeRoomId = current.id
            return { ok: true }
        }
        const unpublish = () => removePublishedAdmission(io, socket, attempt)

        const finalized = await withAdmissionTimeout(
            deps.gameInviteService.finalizeAcceptedEntry({
                receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH, publish, unpublish,
            }),
            Math.max(1, remaining()),
            'RECEIPT_TIMEOUT',
        )

        if (!finalized.ok) {
            if (attempt.phase === 'published') removePublishedAdmission(io, socket, attempt)
            roomAdmissionAttempts.delete(uuid)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isAccountSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({
                ok: false,
                code: finalized.code,
                unknown: finalized.unknown === true,
                message: finalized.unknown === true
                    ? '입장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'
                    : '방에 입장하지 못했습니다.',
            })
            return
        }

        const current = gameRooms.get(attempt.roomId)
        const seated = room.players.get(uuid)
        const stillCurrentAttempt = roomAdmissionAttempts.get(uuid) === attempt && !attempt.invalidated
        const stillOwnsPublication = publishedAdmissions.get(uuid) === attempt
        if (!stillCurrentAttempt || !stillOwnsPublication
            || socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !socket.connected
            || !isCanonicalSocketWhenObservable(io, uuid, socket, room.id)
            || (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id))
            || current !== room || playerRoom.get(uuid) !== room.id || !seated
            || (attempt.publicationMembershipId !== undefined
                && seated.membershipId !== attempt.publicationMembershipId)) {
            if (attempt.phase === 'published') removePublishedAdmission(io, socket, attempt)
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            releasePublishedAdmission(attempt)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isAccountSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({ ok: false, code: 'UNKNOWN', unknown: true, message: '입장 결과를 확인하지 못했습니다.' })
            return
        }

        roomAdmissionAttempts.delete(uuid)
        releasePublishedAdmission(attempt)
        releaseAdmissionExclusion()

        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...seated }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
        respond({ ok: true, room: buildRoomPayload(room), inviteId, attemptId })
    } catch (error) {
        const timedOut = typeof error?.admissionTimeout === 'string'
        if (!timedOut) console.error('[초대 수락 처리 실패]', error)

        const registered = roomAdmissionAttempts.get(uuid) === attempt
        const own = registered || (attempt && !attempt.invalidated) ? attempt : null
        if (own) {
            if (registered) roomAdmissionAttempts.delete(uuid)
            if (own.phase === 'published') removePublishedAdmission(io, socket, own)
            compensateInvalidatedAttempt(own, timedOut ? error.admissionTimeout : 'ACCEPT_FAILED')
        }
        if (joinedRoomId) {
            const cleanupChannelId = joinedRoomId
            if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isAccountSeatedInRoom(uuid, cleanupChannelId)
                        && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
        }
        respond({
            ok: false,
            code: timedOut ? 'UNKNOWN' : (error?.code ?? 'INTERNAL_ERROR'),
            unknown: timedOut,
            message: error?.status && error?.message ? error.message : '방에 입장하지 못했습니다.',
        })
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        if (attempt && roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
        releaseAdmissionExclusion()
    }
}

// 수락 결과 ack 잃었을 때 결과 다시 알려 주기
async function handleGetGameInviteResult(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    const attemptId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.attemptId : undefined
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        callback({ ok: false, code: 'INVALID_REQUEST' })
        return
    }

    if (getAdmissionAttempt(uuid)) {
        callback({ ok: true, pending: true, entered: false })
        return
    }

    const outcome = await deps.gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId, attemptId })
    if (!outcome.known) {
        callback({ ok: false, code: 'INVITE_NOT_FOUND' })
        return
    }
    if (outcome.staleAttempt) {
        callback({ ok: true, entered: false, invite: outcome.invite, staleAttempt: true })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const entered = outcome.entryOutcome === 'PUBLISHED'
        && outcome.bootEpoch === BOOT_EPOCH
        && room !== null && room !== undefined
        && room.id === outcome.roomId
        && (room.instanceId ?? room.id) === outcome.roomInstanceId
        && room.players.has(uuid)

    callback({
        ok: true,
        entered,
        invite: outcome.invite,
        room: entered ? buildRoomPayload(room) : null,
    })
}

// 시험용: 입장 시도 하나 심기
function __seedAdmissionAttemptForTests(uuid, attempt) {
    const seeded = {
        attemptId: attempt.attemptId ?? nextAttemptId(),
        accountUuid: uuid,
        inviteId: attempt.inviteId ?? null,
        roomId: attempt.roomId,
        room: gameRooms.get(attempt.roomId) ?? null,
        roomInstanceId: attempt.roomInstanceId ?? gameRooms.get(attempt.roomId)?.instanceId ?? attempt.roomId,
        bootEpoch: BOOT_EPOCH,
        generation: getRoomTransitionGeneration(uuid),
        socketId: attempt.socketId ?? null,
        phase: attempt.phase ?? 'reserved',
        expiresAt: Date.now() + ADMISSION_TOTAL_TIMEOUT_MS,
    }
    roomAdmissionAttempts.set(uuid, seeded)
    if (seeded.phase === 'published') publishedAdmissions.set(uuid, seeded)
}

module.exports = {
    ADMISSION_STEP_TIMEOUT_MS,
    ADMISSION_TOTAL_TIMEOUT_MS,
    __setAdmissionTimeoutsForTests,
    handleAcceptGameInvite,
    handleGetGameInviteResult,
    __seedAdmissionAttemptForTests,
}

// 초대 수락 입장 파일
// accept_game_invite·get_game_invite_result 받기, matchmaking.js가 붙임 (지도 23)
// 순서: 초대 확인 → 자리 잡기 → 수락 기록 → 채널 넣기 → 영수증 안에서 명단 넣기
const kickReceiptStore = require('../../kickReceiptStore')
const gameSession = require('../../../game-core/gameSession')
const channelMembership = require('../../channelMembership')
const { ADMISSION_STEP_MS, ADMISSION_TOTAL_MS, BOOT_EPOCH } = require('../core/constants')
const { rejectIfInGame } = require('../join/guards')
const { playerRoom, matchmakingQueue, gameRooms, roomAdmissionAttempts, publishedAdmissions } = require('../core/state')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { getAdmissionAttempt, nextAttemptId, withAdmissionTimeout, countRoomOccupancy, compensateAttempt, releasePublished } = require('./attempts')
const { acquireRoomTransition, getGeneration, releaseRoomTransition } = require('../join/transition')
const { deps } = require('../core/deps')
const { getSupportedRoomSizes } = require('../core/config')
const { loadPlayerProfile, computeCanStart, emitPublicRoomList, buildRoomPayload } = require('../room/view')
const { scheduleLateJoinCleanup, removePublished } = require('./release')
const { isCanonicalOrUnknown, isSeatedInRoom, detachSocketFromChannel, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership } = require('../room/membership')

// 입장 단계 하나 기다리는 시간 (시험이 줄임)
let STEP_TIMEOUT_MS = ADMISSION_STEP_MS

// 입장 전체 기다리는 시간 (시험이 줄임)
let TOTAL_TIMEOUT_MS = ADMISSION_TOTAL_MS

// 시험용: 입장 대기 시간 바꾸기
function __setAdmissionTimeoutsForTests({ step, total } = {}) {
    STEP_TIMEOUT_MS = Number.isFinite(step) ? step : ADMISSION_STEP_MS
    TOTAL_TIMEOUT_MS = Number.isFinite(total) ? total : ADMISSION_TOTAL_MS
}

// 초대 수락 입장: 자리 미리 잡고 단계마다 시간 제한, 실패하면 되돌림
async function handleAcceptGameInvite(io, socket, uuid, payload, callback) {
    // 답 받을 곳 없으면 시작 안 함 (결과 못 알리는 입장 막기)
    if (typeof callback !== 'function') return

    let answered = false
    // 답은 한 번만, callback이 던져도 밖으로 안 샘
    const respond = (result) => {
        if (answered) return
        answered = true
        try { callback(result) } catch (ackError) { console.error('[초대 수락 ack 실패]', ackError) }
    }

    // 요청 모양: 초대 id 글자만 받음 (방은 서버가 초대 행에서 찾음)
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        respond({ ok: false, code: 'INVALID_REQUEST', message: '잘못된 요청입니다.' })
        return
    }

    // 게임·방·줄에 이미 있으면 자리 잡기 전에 바로 거절 (지도 23-⑥)
    if (rejectIfInGame(uuid, ({ code, message, gameId }) => respond({ ok: false, code, message, gameId }))) return
    if (playerRoom.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }
    // 다른 입장 시도 중이거나 처리 중 토큰 있으면 거절, 수락 두 번 누름 막기 (지도 23-⑤)
    if (getAdmissionAttempt(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }

    // 세대 번호 기억 (그사이 판 끝 정리되면 명단 넣기 거절)
    const generationAtRequest = getGeneration(uuid)
    const attemptId = nextAttemptId()
    const startedAt = Date.now()
    // 전체 대기 중 남은 시간
    const remaining = () => Math.max(0, TOTAL_TIMEOUT_MS - (Date.now() - startedAt))
    // 단계 하나 기다리기: 단계 한도와 남은 시간 중 짧은 쪽, 다 썼으면 1ms로 바로 시간 초과
    const step = (promise, code) => withAdmissionTimeout(
        promise, Math.min(STEP_TIMEOUT_MS, remaining() || 1), code,
    )

    // 입장 시도·채널 붙은 방 기억 (실패 때 되돌릴 대상)
    let attempt = null
    let joinedRoomId = null
    const admissionExclusionOwner = channelMembership.createChannelExclusionOwner('admission')
    let exclusionChannelId = null
    let exclusionSocketId = null
    // 방송 제외 풀기, 건 적 있을 때 한 번만
    const releaseExclusion = () => {
        if (exclusionChannelId === null || exclusionSocketId === null) return
        channelMembership.releaseChannelExclusion(
            exclusionChannelId, exclusionSocketId, admissionExclusionOwner,
        )
        exclusionChannelId = null
        exclusionSocketId = null
    }
    // 요청 받은 소켓 id 기억 (그사이 새 탭이 소켓 바꾸면 거절용)
    const socketIdAtRequest = socket.id

    try {
        // 초대 먼저 엿보기 (DB): 내 초대인지·어느 방인지·서버 재시작 전 초대인지
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

        // 초대한 그 방(같은 인스턴스)이 아직 있고 자리 남았는지
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
        // 정원 본 직후 await 없이 자리 잡기, 코드 입장이 마지막 자리 못 채감 (지도 23-⑦)
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
            expiresAt: startedAt + TOTAL_TIMEOUT_MS,
        }
        roomAdmissionAttempts.set(uuid, attempt)

        // 초대를 이 시도로 수락 기록 (DB, 이미 처리된 초대·차단이면 거절)
        // 끝남 표시: 되돌리기가 이 기록 끝난 뒤에 중단 기록하려고 봄
        attempt.decisionPromise = Promise.resolve(
            deps.gameInviteService.recordAcceptDecision({ receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH }),
        ).then(
            (value) => { attempt.decisionSettled = true; return value },
            (error) => { attempt.decisionSettled = true; throw error },
        )
        // 시간 초과로 먼저 빠져도 처리 안 된 거절 경고 안 나게
        attempt.decisionPromise.catch(() => {})
        await step(attempt.decisionPromise, 'DECISION_TIMEOUT')
        // 기다린 사이 시도가 없어졌으면 (나가기·끊김·판 끝 정리·방 없어짐·기한) 중단
        if (getAdmissionAttempt(uuid) !== attempt) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        // 계정·프로필 읽기, 계정 없으면 거절
        const [user, accountProfile] = await step(Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadPlayerProfile(uuid),
        ]), 'PROFILE_TIMEOUT')
        if (!user) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }
        // 기다린 사이 시도 없어졌거나 연결 끊겼으면 중단
        if (getAdmissionAttempt(uuid) !== attempt || !socket.connected) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        // 채널 넣기 전에 방송 제외 걸기, 확정 전엔 방 방송 못 받게 (지도 23-⑧)
        exclusionChannelId = room.id
        exclusionSocketId = socket.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, admissionExclusionOwner)
        const joinPromise = Promise.resolve(socket.join(room.id))
        // join 시간 초과면 나중에 붙어도 떼게 예약하고 실패로 넘김
        try {
            await step(joinPromise, 'JOIN_TIMEOUT')
            joinedRoomId = room.id
        } catch (joinError) {
            scheduleLateJoinCleanup(io, socket, room.id, uuid, attempt, joinPromise)
            throw joinError
        }

        // join 사이 소켓·신원 바뀜이나 새 탭 교체면 채널 떼고 시도 없애고 중단 기록
        if (socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !isCanonicalOrUnknown(io, uuid, socket, room.id)) {
            // 다른 길로 이미 앉았으면 채널 그대로 둠
            if (!isSeatedInRoom(uuid, room.id)) {
                detachSocketFromChannel(socket, room.id, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isSeatedInRoom(uuid, room.id)
                        && isCanonicalSocket(io, uuid, socket, room.id),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            compensateAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        const player = { uuid, nickname: user.nickname, isReady: false, ...accountProfile }

        // 명단 넣기: 영수증 트랜잭션 안에서 불림, await 없이 다 다시 보고 넣음 (지도 23-⑨)
        const publish = () => {
            // 내 시도가 아직 살아 있고 같은 서버·같은 세대인지
            if (getAdmissionAttempt(uuid) !== attempt) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.invalidated) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.bootEpoch !== BOOT_EPOCH) return { ok: false, code: 'SERVER_RESTARTED' }
            if (getGeneration(uuid) !== generationAtRequest) return { ok: false, code: 'SESSION_ENDED' }
            // 같은 소켓·같은 계정·주인 소켓이고 채널에 붙어 있는지
            if (!socket.connected || attempt.socketId !== socket.id || socket.id !== socketIdAtRequest) {
                return { ok: false, code: 'DISCONNECTED' }
            }
            if (socket.data?.user?.uuid !== uuid) return { ok: false, code: 'DISCONNECTED' }
            if (!isCanonicalOrUnknown(io, uuid, socket, room.id)) return { ok: false, code: 'DISCONNECTED' }
            if (socket.rooms && !socket.rooms.has(room.id)) return { ok: false, code: 'CHANNEL_LOST' }
            // 같은 방 그대로·다른 방 없음·게임 중 아님 (기권한 판은 통과)·자리 남음
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
            // 여기부터 진짜 바뀜: 명단에 넣고 시도를 published로, 되돌릴 권리 잡음
            player.membershipId = kickReceiptStore.nextMembershipId()
            attempt.publicationMembershipId = player.membershipId
            current.players.set(uuid, player)
            playerRoom.set(uuid, current.id)
            attempt.phase = 'published'
            publishedAdmissions.set(uuid, attempt)
            socket.data.activeRoomId = current.id
            return { ok: true }
        }
        // 넣은 뒤 영수증 저장이 터지면 명단에서 다시 뺌
        const unpublish = () => removePublished(io, socket, attempt)

        // 영수증 저장 + 명단 넣기 (DB가 차단 다시 봄), 남은 전체 시간만 기다림
        const finalized = await withAdmissionTimeout(
            deps.gameInviteService.finalizeAcceptedEntry({
                receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH, publish, unpublish,
            }),
            Math.max(1, remaining()),
            'RECEIPT_TIMEOUT',
        )

        // 실패면 넣었던 명단·시도·채널 되돌림, 결과 모름이면 다시 물으라고 답함
        if (!finalized.ok) {
            if (attempt.phase === 'published') removePublished(io, socket, attempt)
            roomAdmissionAttempts.delete(uuid)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                // 다른 길로 이미 앉았으면 채널 그대로 둠
                if (!isSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocket(io, uuid, socket, cleanupChannelId),
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

        // 영수증 기다린 사이 시도·소켓·채널·방·자리 중 하나라도 바뀌었으면
        // 되돌리고 결과 모름으로 답함 (다시 물으면 지금 명단 기준으로 답함)
        const current = gameRooms.get(attempt.roomId)
        const seated = room.players.get(uuid)
        const stillCurrentAttempt = roomAdmissionAttempts.get(uuid) === attempt && !attempt.invalidated
        const stillOwnsPublication = publishedAdmissions.get(uuid) === attempt
        if (!stillCurrentAttempt || !stillOwnsPublication
            || socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !socket.connected
            || !isCanonicalOrUnknown(io, uuid, socket, room.id)
            || (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id))
            || current !== room || playerRoom.get(uuid) !== room.id || !seated
            || (attempt.publicationMembershipId !== undefined
                && seated.membershipId !== attempt.publicationMembershipId)) {
            if (attempt.phase === 'published') removePublished(io, socket, attempt)
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            releasePublished(attempt)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                // 다른 길로 이미 앉았으면 채널 그대로 둠
                if (!isSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocket(io, uuid, socket, cleanupChannelId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({ ok: false, code: 'UNKNOWN', unknown: true, message: '입장 결과를 확인하지 못했습니다.' })
            return
        }

        // 성공: 시도·되돌릴 권리·방송 제외 다 풂 (검증 다 끝난 뒤라 이제 방 방송 받음)
        roomAdmissionAttempts.delete(uuid)
        releasePublished(attempt)
        releaseExclusion()

        // 방 사람들한테 (나 빼고) 새 사람, 목록 갱신, 나한테 방 정보
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...seated }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
        respond({ ok: true, room: buildRoomPayload(room), inviteId, attemptId })
    } catch (error) {
        // 시간 초과는 예상한 실패라 로그 안 남김
        const timedOut = typeof error?.admissionTimeout === 'string'
        if (!timedOut) console.error('[초대 수락 처리 실패]', error)

        // 내 시도면 지우고 명단 되돌리고 초대에 중단 기록 (다른 곳이 없앤 시도면 그쪽이 이미 함)
        const registered = roomAdmissionAttempts.get(uuid) === attempt
        const own = registered || (attempt && !attempt.invalidated) ? attempt : null
        if (own) {
            if (registered) roomAdmissionAttempts.delete(uuid)
            if (own.phase === 'published') removePublished(io, socket, own)
            compensateAttempt(own, timedOut ? error.admissionTimeout : 'ACCEPT_FAILED')
        }
        // 붙었던 채널 떼기 (다른 길로 이미 앉았으면 그대로)
        if (joinedRoomId) {
            const cleanupChannelId = joinedRoomId
            if (!isSeatedInRoom(uuid, cleanupChannelId)) {
                detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isSeatedInRoom(uuid, cleanupChannelId)
                        && isCanonicalSocket(io, uuid, socket, cleanupChannelId),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
        }
        // 시간 초과는 들어갔는지 모르니 결과 모름, 서비스가 낸 오류면 그 문구 그대로
        respond({
            ok: false,
            code: timedOut ? 'UNKNOWN' : (error?.code ?? 'INTERNAL_ERROR'),
            unknown: timedOut,
            message: error?.status && error?.message ? error.message : '방에 입장하지 못했습니다.',
        })
    } finally {
        // 어느 길로 끝나든 토큰·남은 시도·방송 제외 정리
        releaseRoomTransition(uuid, transitionToken)
        if (attempt && roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
        releaseExclusion()
    }
}

// 수락 결과 ack 잃었을 때 결과 다시 알려 주기 (지도 23-⑩)
async function handleGetGameInviteResult(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    // 요청 모양: 초대 id 필수, 시도 id는 보냈으면 그 시도 결과만 봄
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    const attemptId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.attemptId : undefined
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        callback({ ok: false, code: 'INVALID_REQUEST' })
        return
    }

    // 아직 입장 처리 중이면 기다리라고 답함
    if (getAdmissionAttempt(uuid)) {
        callback({ ok: true, pending: true, entered: false })
        return
    }

    // 초대 결과 읽기 (DB), 내 초대 아니면 없음, 다른 시도 결과면 옛 시도라고 답함
    const outcome = await deps.gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId, attemptId })
    if (!outcome.known) {
        callback({ ok: false, code: 'INVITE_NOT_FOUND' })
        return
    }
    if (outcome.staleAttempt) {
        callback({ ok: true, entered: false, invite: outcome.invite, staleAttempt: true })
        return
    }

    // 들어감 = PUBLISHED 기록 + 같은 서버 + 지금 그 방(같은 인스턴스) 명단에 있음
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

// 시험용: 입장 시도 하나 심기 (published면 되돌릴 권리까지)
function __seedAdmissionAttemptForTests(uuid, attempt) {
    const seeded = {
        attemptId: attempt.attemptId ?? nextAttemptId(),
        accountUuid: uuid,
        inviteId: attempt.inviteId ?? null,
        roomId: attempt.roomId,
        room: gameRooms.get(attempt.roomId) ?? null,
        roomInstanceId: attempt.roomInstanceId ?? gameRooms.get(attempt.roomId)?.instanceId ?? attempt.roomId,
        bootEpoch: BOOT_EPOCH,
        generation: getGeneration(uuid),
        socketId: attempt.socketId ?? null,
        phase: attempt.phase ?? 'reserved',
        expiresAt: Date.now() + TOTAL_TIMEOUT_MS,
    }
    roomAdmissionAttempts.set(uuid, seeded)
    if (seeded.phase === 'published') publishedAdmissions.set(uuid, seeded)
}

module.exports = {
    STEP_TIMEOUT_MS,
    TOTAL_TIMEOUT_MS,
    __setAdmissionTimeoutsForTests,
    handleAcceptGameInvite,
    handleGetGameInviteResult,
    __seedAdmissionAttemptForTests,
}

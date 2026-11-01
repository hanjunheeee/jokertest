const crypto = require('crypto')
const { generateRoomCode, generateUniqueRoomCode } = require('../utils/roomCode')
const { validateCreateRoomPayload } = require('../validations/room/create')
const {
    validateUpdateRoomSettingsPayload,
    buildEditableSettingsView,
    buildRoomSettingsView,
    settingsContainNonAllowlistedKeys,
    fingerprintUpdateSettings,
    fingerprintUpdateRequest,
    isRoomSettingsIdentifier,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    PRESERVED_ROOM_SETTING_KEYS,
} = require('../validations/room/updateSettings')
const { ROOM_JOIN_ERROR_CODES } = require('./roomJoinErrors')
const gameSession = require('../game-core/gameSession')
const {
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
} = require('../game-core/roleComposition')
const gameInviteModule = require('../services/friend/gameInvite')
const kickReceiptStore = require('./kickReceiptStore')
const channelMembership = require('./channelMembership')
// 대기방·매칭 장부는 matchmaking/state
const {
    matchmakingQueue,
    gameRooms,
    playerRoom,
    partyMatchingRoomByGameId,
    pendingRoomTransitions,
    roomAdmissionAttempts,
    publishedAdmissions,
    roomSettingsUpdateResults,
    roomTransitionGeneration,
    startedRoomMarks,
    pendingRoomRemovals,
    roomPresenceConfirmedTick,
} = require('./matchmaking/core/state')
// 인원 규칙·자동 매칭 켜기는 matchmaking/config
const {
    isRandomMatchmakingEnabled,
    __setRandomMatchmakingEnabledForTests,
    getMinPlayers,
    getSupportedRoomSizes,
} = require('./matchmaking/core/config')
// 방 전환 잠금·세대 번호는 matchmaking/transition
const {
    acquireRoomTransition,
    releaseRoomTransition,
    getRoomTransitionGeneration,
    bumpRoomTransitionGeneration,
} = require('./matchmaking/join/transition')
// 설정 버전·저장 영수증은 matchmaking/settingsReceipts
const {
    INITIAL_SETTINGS_VERSION,
    getSettingsVersion,
    SETTINGS_UPDATE_RESULT_TTL_MS,
    settingsUpdateResultKey,
    pruneSettingsUpdateResults,
    recordSettingsUpdateResult,
    forgetSettingsUpdateResultsForRoom,
} = require('./matchmaking/settings/receipts')
// 시작된 방 표시는 matchmaking/startedMarks
const {
    rememberStartedRoom,
    __resetStartedRoomMarksForTests,
    isStartedRoomMark,
} = require('./matchmaking/join/startedMarks')
// 바깥 의존 주입구는 matchmaking/deps
const {
    deps,
    setOnlineUsersRegistry,
    __setGameInviteServiceForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
} = require('./matchmaking/core/deps')
// matchmaking 상수
const {
    BOOT_EPOCH,
    PARTY_MATCHING_ROOM_TTL_MS,
    ROOM_RECONNECT_GRACE_MS,
    ADMISSION_DEFAULT_STEP_TIMEOUT_MS,
    ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS,
} = require('./matchmaking/core/constants')
// 자리·소켓 확인은 matchmaking/membership
const {
    isRoomOwnedByAnotherSocket,
    isCanonicalSocketForAccount,
    isCanonicalSocketWhenObservable,
    isAccountSeatedInRoom,
    hasRoomMembership,
    hasLiveGameMembership,
    detachSocketFromChannel,
    leaveSocketRoomSafely,
    findLiveSocketForUuid,
    findAllLiveSocketsForUuid,
    resolveParticipantSockets,
} = require('./matchmaking/room/membership')
// 입장 요청 검사·실패 알림은 matchmaking/joinGuards
const {
    emitRoomJoinFailed,
    ALREADY_IN_GAME_MESSAGE,
    rejectIfInActiveGame,
    JOIN_REQUEST_INVALID_MESSAGE,
    validateJoinRoomByCodeRequest,
    describeStartedRoomJoinFailure,
    isRoomCodeReserved,
} = require('./matchmaking/join/guards')
// 입장 시도 기록은 matchmaking/admission
const {
    nextAttemptId,
    releasePublishedAdmission,
    getAdmissionAttempt,
    invalidateAdmissionAttempt,
    compensateInvalidatedAttempt,
    invalidateAdmissionAttemptsForRoom,
    hasPendingAdmissionForRoom,
    countRoomOccupancy,
    withAdmissionTimeout,
} = require('./matchmaking/admission/attempts')
// 방 정보·공개 방 목록은 matchmaking/roomView
const {
    computeCanStart,
    buildRoomPayload,
    loadRoomParticipantProfile,
    buildPublicRoomList,
    emitPublicRoomList,
} = require('./matchmaking/room/view')
// 입장 되돌리기·방 초대 취소는 matchmaking/release
const {
    removePublishedAdmission,
    scheduleLateJoinCleanup,
    cancelInvitesForRoomAsync,
} = require('./matchmaking/admission/release')
// 자동 매칭 줄은 matchmaking/queue
const {
    handleJoinMatchmaking,
    handleLeaveMatchmaking,
} = require('./matchmaking/join/queue')
// 방 설정 저장 받기는 matchmaking/settingsHandlers
const {
    handleUpdateRoomSettings,
    handleGetRoomSettingsUpdateResult,
} = require('./matchmaking/settings/handlers')
// 준비 버튼은 matchmaking/ready
const {
    handleSetReady,
} = require('./matchmaking/room/ready')
// 게임 시작은 matchmaking/start
const {
    handleStartGame,
} = require('./matchmaking/room/start')
// 끝난 판 다음 방은 matchmaking/party
const {
    handleGetPartyMatchingRoom,
    notifyEndedSessionPartyOfMatchingRoom,
} = require('./matchmaking/join/party')
// 방 나가기·끊김 유예는 matchmaking/leave
const {
    commitRoomDeparture,
    notifyRoomDeparture,
    removeFromRoom,
    resetRoomPresenceTick,
} = require('./matchmaking/room/leave')
// 강퇴·방 삭제는 matchmaking/host
const {
    handleKickRoomPlayer,
    handleDeleteRoom,
} = require('./matchmaking/room/host')
// 끊김·재접속은 matchmaking/reconnect
const {
    resyncRoomChannelOnReconnect,
    onDisconnect,
    handleGetCurrentRoom,
} = require('./matchmaking/room/reconnect')
// 방 입장은 matchmaking/join
const {
    handleJoinRoomByCode,
    handleJoinPublicRoom,
    handleGetPublicRooms,
} = require('./matchmaking/join/join')
// 방 만들기는 matchmaking/create
const {
    handleCreateRoom,
} = require('./matchmaking/join/create')
// 초대 수락 입장은 matchmaking/accept
const {
    __setAdmissionTimeoutsForTests,
    handleAcceptGameInvite,
    handleGetGameInviteResult,
    __seedAdmissionAttemptForTests,
} = require('./matchmaking/admission/accept')
// 게임 시작·끝 정리는 matchmaking/sessionCleanup
const {
    cleanupRoomStateForSessionParticipants,
} = require('./matchmaking/room/sessionCleanup')

function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('join_room_by_code', (payload) => {
        const validated = validateJoinRoomByCodeRequest(payload)
        if (!validated.ok) {
            emitRoomJoinFailed(socket, validated.code, validated.message)
            return undefined
        }
        const { roomCode, roomId } = validated
        return handleJoinRoomByCode(
            io,
            socket,
            uuid,
            roomCode,
            roomId ? { roomId, accessType: 'code' } : null,
        ).catch((err) =>
            console.error('\x1b[31m[방 코드 참가 에러]\x1b[0m', err)
        )
    })
    socket.on('create_room', (payload, callback) => handleCreateRoom(io, socket, uuid, payload, callback))
    socket.on('get_current_room', (payload, callback) => handleGetCurrentRoom(uuid, callback))
    socket.on('get_party_matching_room', (payload, callback) =>
        handleGetPartyMatchingRoom(uuid, payload, callback))
    socket.on('get_public_rooms', (payload, callback) => handleGetPublicRooms(callback))
    socket.on('join_public_room', (payload) =>
        handleJoinPublicRoom(io, socket, uuid, payload).catch((err) =>
            console.error('\x1b[31m[공개 방 참가 에러]\x1b[0m', err)
        )
    )
    socket.on('delete_room',       () => handleDeleteRoom(io, uuid))
    socket.on('start_game', (payload, callback) =>
        handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    )
    socket.on('set_ready', (payload, callback) => handleSetReady(io, socket, uuid, payload, callback))
    socket.on(ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, (payload, callback) =>
        handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on(ROOM_SETTINGS_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, (payload, callback) =>
        handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_ROOM_PLAYER, (payload, callback) =>
        handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on('accept_game_invite', (payload, callback) =>
        handleAcceptGameInvite(io, socket, uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 수락 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'INTERNAL_ERROR', message: '초대를 처리하지 못했습니다.' }) } catch {}
            }
        })
    )
    socket.on('get_game_invite_result', (payload, callback) =>
        handleGetGameInviteResult(uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 결과 조회 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'UNKNOWN' }) } catch {}
            }
        })
    )
}

gameInviteModule.__setRoomAccessForRuntime({
    bootEpoch: BOOT_EPOCH,

    getRoomIdForUser: (uuid) => playerRoom.get(uuid) ?? null,

    describeRoomForInvite: (roomId) => {
        const room = gameRooms.get(roomId)
        if (!room) return null
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        return {
            roomId: room.id,
            roomInstanceId: room.instanceId ?? room.id,
            hostUuid: room.hostUuid,
            occupancy: countRoomOccupancy(room),
            maxPlayers,
            isFull: countRoomOccupancy(room) >= maxPlayers,
        }
    },

    describeReceiverAvailability: (uuid) => {
        const routing = gameSession.getActiveSessionRoutingInfo(uuid)
        if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
            return { available: false, code: 'RECEIVER_IN_GAME' }
        }
        if (playerRoom.has(uuid)) return { available: false, code: 'RECEIVER_IN_ROOM' }
        if (matchmakingQueue.has(uuid)) return { available: false, code: 'RECEIVER_IN_QUEUE' }
        if (pendingRoomTransitions.has(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        if (getAdmissionAttempt(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        return { available: true, code: null }
    },
})

function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
    roomAdmissionAttempts.clear()
    publishedAdmissions.clear()
    startedRoomMarks.clear()
    roomSettingsUpdateResults.clear()
    partyMatchingRoomByGameId.clear()
    kickReceiptStore.__resetKickReceiptsForTests()
    channelMembership.__resetChannelExclusionsForTests()
    for (const pending of pendingRoomRemovals.values()) clearTimeout(pending.timer)
    pendingRoomRemovals.clear()
    roomPresenceConfirmedTick.clear()
    resetRoomPresenceTick()
}

function __flushRoomRetentionForTests() {
    for (const pending of [...pendingRoomRemovals.values()]) {
        clearTimeout(pending.timer)
        pending.run()
    }
}

function __getPendingRoomRemovalsForTests() {
    return [...pendingRoomRemovals.entries()].map(([uuid, { roomId }]) => [uuid, roomId])
}

function __getStateSnapshotForTests() {
    return {
        matchmakingQueue: [...matchmakingQueue.entries()],
        gameRooms: [...gameRooms.entries()].map(([id, room]) => [
            id,
            {
                ...room,
                players: [...room.players.entries()],
                settings: room.settings === undefined || room.settings === null
                    ? room.settings
                    : JSON.parse(JSON.stringify(room.settings)),
            },
        ]),
        playerRoom: [...playerRoom.entries()],
        roomSettingsUpdateResults: [...roomSettingsUpdateResults.entries()].map(([key, entry]) => [key, {
            roomId: entry.roomId,
            changed: entry.changed,
            settingsVersion: entry.settingsVersion,
        }]),
        pendingRoomTransitions: [...pendingRoomTransitions.keys()],
        roomAdmissionAttempts: [...roomAdmissionAttempts.entries()].map(([uuid, attempt]) => [uuid, {
            attemptId: attempt.attemptId,
            inviteId: attempt.inviteId,
            roomId: attempt.roomId,
            roomInstanceId: attempt.roomInstanceId,
            phase: attempt.phase,
            socketId: attempt.socketId,
        }]),
        bootEpoch: BOOT_EPOCH,
    }
}

function __seedMatchmakingQueueForTests(uuid, entry) {
    matchmakingQueue.set(uuid, entry)
}

function __seedRoomForTests(room) {
    gameRooms.set(room.id, room)
}

function __seedPlayerRoomForTests(uuid, roomId) {
    playerRoom.set(uuid, roomId)
}

function __removeRoomForTests(roomId) {
    const room = gameRooms.get(roomId)
    if (room) {
        room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    }
    gameRooms.delete(roomId)
    invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_GONE')
    forgetSettingsUpdateResultsForRoom(roomId)
}

function __getBootEpochForTests() {
    return BOOT_EPOCH
}

function __expireAdmissionAttemptForTests(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt) attempt.expiresAt = Date.now() - 1
}

module.exports = {
    registerMatchmakingHandlers,
    setOnlineUsersRegistry,
    onDisconnect,
    resyncRoomChannelOnReconnect,
    cleanupRoomStateForSessionParticipants,
    hasRoomMembership,
    ROOM_RECONNECT_GRACE_MS,
    __resetStateForTests,
    __flushRoomRetentionForTests,
    __getPendingRoomRemovalsForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __getBootEpochForTests,
    __seedAdmissionAttemptForTests,
    __expireAdmissionAttemptForTests,
    __resetStartedRoomMarksForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
    __setGameInviteServiceForTests,
    __setAdmissionTimeoutsForTests,
    __setRandomMatchmakingEnabledForTests,
    ALREADY_IN_GAME_MESSAGE,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    JOIN_REQUEST_INVALID_MESSAGE,
    KICK_EVENTS: kickReceiptStore.KICK_EVENTS,
    KICK_ERROR_CODES: kickReceiptStore.KICK_ERROR_CODES,
    __testables: {
        handleCreateRoom,
        handleJoinRoomByCode,
        validateJoinRoomByCodeRequest,
        isRoomCodeReserved,
        isStartedRoomMark,
        handleGetCurrentRoom,
        handleGetPartyMatchingRoom,
        handleGetPublicRooms,
        handleJoinPublicRoom,
        handleJoinMatchmaking,
        handleDeleteRoom,
        handleStartGame,
        handleSetReady,
        handleUpdateRoomSettings,
        handleGetRoomSettingsUpdateResult,
        leaveSocketRoomSafely,
        handleAcceptGameInvite,
        handleGetGameInviteResult,
        countRoomOccupancy,
        hasPendingAdmissionForRoom,
        removeFromRoom,
        handleKickRoomPlayer,
        commitRoomDeparture,
        notifyRoomDeparture,
    },
}

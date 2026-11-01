// 대기방·매칭 소켓 입구 파일
// 방·매칭 사건 등록 + 초대 서비스에 방 읽는 길 연결, socket.js·connection/presence가 부름
// 판 쪽(gameSession delivery/eligibility·departure/end)은 방 소속 확인·판 끝 정리만 씀
const {
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
} = require('../validations/room/updateSettings')
const gameSession = require('../game-core/gameSession')
const gameInviteModule = require('../services/friend/gameInvite')
const kickReceiptStore = require('./kickReceiptStore')
const channelMembership = require('./channelMembership')
// 대기방·매칭 장부 (초대 연결·시험 손잡이가 씀)
const {
    matchmakingQueue,
    gameRooms,
    playerRoom,
    partyRoomByGameId,
    pendingRoomTransitions,
    roomAdmissionAttempts,
    publishedAdmissions,
    roomSettingsUpdateResults,
    startedRoomMarks,
    pendingRoomRemovals,
    presenceConfirmedTick,
} = require('./matchmaking/core/state')
// 방 크기 규칙·자동 매칭 켜기
const {
    __setRandomMatchmakingEnabledForTests,
    getSupportedRoomSizes,
} = require('./matchmaking/core/config')
// 설정 저장 영수증 지우기 (시험 방 지우기용)
const {
    forgetSettingsResults,
} = require('./matchmaking/settings/receipts')
// 시작돼 사라진 방 표시
const {
    __resetStartedMarksForTests,
    isStartedRoomMark,
} = require('./matchmaking/join/startedMarks')
// 바깥 의존 주입구 (접속 목록·시험 가짜 서비스)
const {
    setOnlineUsersRegistry,
    __setGameInviteServiceForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
} = require('./matchmaking/core/deps')
// matchmaking 상수
const {
    BOOT_EPOCH,
    ROOM_RECONNECT_GRACE_MS,
} = require('./matchmaking/core/constants')
// 방 자리·소켓 확인
const {
    hasRoomMembership,
    leaveSocketRoomSafely,
} = require('./matchmaking/room/membership')
// 입장 요청 검사·실패 알림
const {
    emitRoomJoinFailed,
    ALREADY_IN_GAME_MESSAGE,
    JOIN_REQUEST_INVALID_MESSAGE,
    validateJoinRoomByCodeRequest,
    isRoomCodeReserved,
} = require('./matchmaking/join/guards')
// 초대 입장 시도 기록·방 인원 세기
const {
    getAdmissionAttempt,
    invalidateRoomAttempts,
    hasPendingAdmission,
    countRoomOccupancy,
} = require('./matchmaking/admission/attempts')
// 자동 매칭 줄
const {
    handleJoinMatchmaking,
    handleLeaveMatchmaking,
} = require('./matchmaking/join/queue')
// 방 설정 저장 받기·저장 결과 다시 묻기
const {
    handleUpdateRoomSettings,
    handleGetRoomSettingsUpdateResult,
} = require('./matchmaking/settings/handlers')
// 준비 버튼
const {
    handleSetReady,
} = require('./matchmaking/room/ready')
// 게임 시작
const {
    handleStartGame,
} = require('./matchmaking/room/start')
// 끝난 판 다음 방
const {
    handleGetPartyMatchingRoom,
} = require('./matchmaking/join/party')
// 방 나가기 (확정·알림 따로 부를 수 있음)
const {
    commitRoomDeparture,
    notifyRoomDeparture,
    removeFromRoom,
    resetRoomPresenceTick,
} = require('./matchmaking/room/leave')
// 방장 강퇴·방 지우기
const {
    handleKickRoomPlayer,
    handleDeleteRoom,
} = require('./matchmaking/room/host')
// 끊김·재접속·지금 방 묻기
const {
    resyncRoomChannelOnReconnect,
    onDisconnect,
    handleGetCurrentRoom,
} = require('./matchmaking/room/reconnect')
// 코드·공개 방 입장, 공개 방 목록
const {
    handleJoinRoomByCode,
    handleJoinPublicRoom,
    handleGetPublicRooms,
} = require('./matchmaking/join/join')
// 방 만들기
const {
    handleCreateRoom,
} = require('./matchmaking/join/create')
// 초대 수락 입장
const {
    __setAdmissionTimeoutsForTests,
    handleAcceptGameInvite,
    handleGetGameInviteResult,
    __seedAdmissionAttemptForTests,
} = require('./matchmaking/admission/accept')
// 판 끝·판 나가기·게임 추방 때 대기방 흔적 정리
const {
    cleanupRoomStateForSessionParticipants,
} = require('./matchmaking/room/sessionCleanup')

// 소켓 하나에 방·매칭 사건 받기 등록, async 처리기는 catch로 에러만 남김 (처리 안 된 거절 막기)
// getCurrentSocketId = 계정의 지금 소켓 id, 옛 탭 요청 거르려고 방장 행동·설정·시작에 넘김
function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    // 자동 매칭 줄 서기·빠지기
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    // 코드 입장: 요청 모양 틀리면 실패 알림만 보내고 끝 (ack 없는 사건)
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
    // 방 만들기·지금 방·다음 방·공개 방 목록·공개 방 입장
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
    // 방 안 행동: 방장 지우기·시작, 준비, 설정 저장·결과 묻기, 나가기, 강퇴
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
    // 초대 수락·결과 묻기: 터지면 ack로 실패 답 (안 하면 화면이 답을 계속 기다림)
    socket.on('accept_game_invite', (payload, callback) =>
        handleAcceptGameInvite(io, socket, uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 수락 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'INTERNAL_ERROR', message: '초대를 처리하지 못했습니다.' }) } catch { /* 응답 보내기 실패는 무시 (에러는 위에서 남김) */ }
            }
        })
    )
    socket.on('get_game_invite_result', (payload, callback) =>
        handleGetGameInviteResult(uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 결과 조회 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'UNKNOWN' }) } catch { /* 응답 보내기 실패는 무시 (에러는 위에서 남김) */ }
            }
        })
    )
}

// 초대 서비스에 방 상태 읽는 함수 묶음 넣어 줌 (이 파일 처음 불릴 때 한 번)
// 서비스가 socket을 거꾸로 require 안 하게 하려는 것
gameInviteModule.__setRoomAccessForRuntime({
    bootEpoch: BOOT_EPOCH,

    // 보내는 사람이 지금 있는 방 id
    getRoomIdForUser: (uuid) => playerRoom.get(uuid) ?? null,

    // 초대에 실을 방 정보 (인원엔 입장 중 자리도 셈)
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

    // 받는 사람이 초대 받을 수 있는지: 판·방·줄·방 전환·입장 중이면 못 받음
    describeReceiverAvailability: (uuid) => {
        // 판에 있으면 거절 (기권한 판은 통과, 끝난 결과 화면은 아직 판에 있는 것으로 봄)
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

// 시험용: 장부·영수증·제외 기록 전부 비우고 끊김 예약 타이머 끔 (세대 번호 장부는 그대로)
function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
    roomAdmissionAttempts.clear()
    publishedAdmissions.clear()
    startedRoomMarks.clear()
    roomSettingsUpdateResults.clear()
    partyRoomByGameId.clear()
    kickReceiptStore.__resetKickReceiptsForTests()
    channelMembership.__resetChannelExclusionsForTests()
    for (const pending of pendingRoomRemovals.values()) clearTimeout(pending.timer)
    pendingRoomRemovals.clear()
    presenceConfirmedTick.clear()
    resetRoomPresenceTick()
}

// 시험용: 15초 안 기다리고 끊김 빼기 예약 바로 실행
function __flushRoomRetentionForTests() {
    for (const pending of [...pendingRoomRemovals.values()]) {
        clearTimeout(pending.timer)
        pending.run()
    }
}

// 시험용: 끊김 빼기 예약 목록 [uuid, 방 id]
function __getPendingRoomRemovalsForTests() {
    return [...pendingRoomRemovals.entries()].map(([uuid, { roomId }]) => [uuid, roomId])
}

// 시험용: 장부 복사본 (설정은 깊은 복사, 시험이 고쳐도 진짜 장부 안 바뀌게)
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

// 시험용: 매칭 줄에 바로 넣기 (검사 없이)
function __seedMatchmakingQueueForTests(uuid, entry) {
    matchmakingQueue.set(uuid, entry)
}

// 시험용: 방 바로 넣기
function __seedRoomForTests(room) {
    gameRooms.set(room.id, room)
}

// 시험용: 소속 장부 바로 넣기
function __seedPlayerRoomForTests(uuid, roomId) {
    playerRoom.set(uuid, roomId)
}

// 시험용: 알림 없이 방 지우기 (소속·입장 시도·영수증만 같이 정리, 초대는 안 건드림)
function __removeRoomForTests(roomId) {
    const room = gameRooms.get(roomId)
    if (room) {
        room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    }
    gameRooms.delete(roomId)
    invalidateRoomAttempts(roomId, 'ROOM_GONE')
    forgetSettingsResults(roomId)
}

// 시험용: 이 서버 부팅 번호
function __getBootEpochForTests() {
    return BOOT_EPOCH
}

// 시험용: 입장 시도 기한 지난 걸로 만들기 (다음 조회 때 사라짐, 명단에 넣은 시도는 안 사라짐)
function __expireAdmissionAttemptForTests(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt) attempt.expiresAt = Date.now() - 1
}

// 앞 6개는 socket.js·connection·판 쪽이 씀, 나머지는 시험용 (ROOM_RECONNECT_GRACE_MS는 쓰는 곳 없음)
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
    __resetStartedMarksForTests,
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
        hasPendingAdmission,
        removeFromRoom,
        handleKickRoomPlayer,
        commitRoomDeparture,
        notifyRoomDeparture,
    },
}

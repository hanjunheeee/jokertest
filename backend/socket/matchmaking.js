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
// 대기방·매칭 장부 (초대 연결이 씀)
const {
    matchmakingQueue,
    gameRooms,
    playerRoom,
    pendingRoomTransitions,
} = require('./matchmaking/core/state')
// 방 크기 규칙·자동 매칭 켜기
const {
    __setRandomMatchmakingEnabledForTests,
    getSupportedRoomSizes,
} = require('./matchmaking/core/config')
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
// 코드 입장
const {
    handleJoinRoomByCode,
} = require('./matchmaking/join/join')
// 공개방 고르기 입장, 공개 방 목록
const {
    handleJoinPublicRoom,
    handleGetPublicRooms,
} = require('./matchmaking/join/publicRooms')
// 방 만들기
const {
    handleCreateRoom,
} = require('./matchmaking/join/create')
// 초대 수락 입장
const {
    handleAcceptGameInvite,
} = require('./matchmaking/admission/accept')
// 초대 입장 기다리는 시간 (시험이 줄임)
const {
    __setAdmissionTimeoutsForTests,
} = require('./matchmaking/admission/timeouts')
// 초대 수락 결과 다시 묻기
const {
    handleGetGameInviteResult,
} = require('./matchmaking/admission/result')
// 판 끝·판 나가기·게임 추방 때 대기방 흔적 정리
const {
    cleanupRoomStateForSessionParticipants,
} = require('./matchmaking/room/sessionCleanup')
// 점검 중 거절 (방 만들기·시작·코드 입장·자동 매칭만)
const { rejectDuringMaintenance } = require('./matchmaking/join/maintenanceGate')

// 소켓 하나에 방·매칭 사건 받기 등록, async 처리기는 catch로 에러만 남김 (처리 안 된 거절 막기)
// getCurrentSocketId = 계정의 지금 소켓 id, 옛 탭 요청 거르려고 방장 행동·설정·시작에 넘김
function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    // 자동 매칭 줄 서기·빠지기
    socket.on('join_matchmaking', () => {
        if (rejectDuringMaintenance(socket, null)) return undefined
        return handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    })
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    // 코드 입장: 요청 모양 틀리면 실패 알림만 보내고 끝 (ack 없는 사건)
    socket.on('join_room_by_code', (payload) => {
        if (rejectDuringMaintenance(socket, null)) return undefined
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
    socket.on('create_room', (payload, callback) => {
        if (rejectDuringMaintenance(socket, typeof callback === 'function' ? callback : () => {})) return undefined
        return handleCreateRoom(io, socket, uuid, payload, callback)
    })
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
    // 방 지우기: 답 함수만 보낸 요청도 받음 (payload 자리에 함수)
    socket.on('delete_room', (payload, callback) =>
        handleDeleteRoom(io, uuid, {
            socket,
            callback: typeof callback === 'function' ? callback : (typeof payload === 'function' ? payload : null),
            getCurrentSocketId,
        }))
    socket.on('start_game', (payload, callback) => {
        if (rejectDuringMaintenance(socket, typeof callback === 'function' ? callback : () => {})) return undefined
        return handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    })
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

// 시험 손잡이 (장부 비우기·넣기·복사본, matchmaking/testHooks.js)
const {
    __resetStateForTests,
    __flushRoomRetentionForTests,
    __getPendingRoomRemovalsForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __getBootEpochForTests,
    __expireAdmissionAttemptForTests,
    __seedAdmissionAttemptForTests,
} = require('./matchmaking/testHooks')

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

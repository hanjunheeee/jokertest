// 대기방·매칭 소켓 입구 파일
// 방·매칭 사건 등록 + 초대 서비스에 방 읽는 길 연결, socket.js·connection/presence가 부름
// 판 쪽(gameSession delivery/eligibility·departure/end)은 방 소속 확인·판 끝 정리만 씀
const {
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
} = require('../validations/room/updateSettings')
const gameInviteModule = require('../services/friend/gameInvite')
const kickReceiptStore = require('./kickReceiptStore')
// 방 크기 규칙·자동 매칭 켜기
const {
    __setRandomMatchmakingEnabledForTests,
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
    ROOM_RECONNECT_GRACE_MS,
} = require('./matchmaking/core/constants')
// 방 자리·소켓 확인
const {
    hasRoomMembership,
    leaveSocketRoomSafely,
} = require('./matchmaking/room/membership')
// 입장 요청 검사 문구
const {
    ALREADY_IN_GAME_MESSAGE,
    JOIN_REQUEST_INVALID_MESSAGE,
    validateJoinRoomByCodeRequest,
    isRoomCodeReserved,
} = require('./matchmaking/join/guards')
// 초대 입장 시도 기록·방 인원 세기
const {
    hasPendingAdmission,
    countRoomOccupancy,
} = require('./matchmaking/admission/attempts')
// 자동 매칭 줄
const {
    handleJoinMatchmaking,
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
// Node 여러 개: 초대 방 접근자(다른 Node는 RPC)·공개 방 목록 합치기·빠른 매칭 끄기
const { createInviteAccess } = require('./matchmaking/cluster/inviteAccess')
const { bindRoomListIo } = require('./matchmaking/cluster/roomListSync')
const { isRandomMatchAllowed } = require('./matchmaking/join/queue')
// 사건 등록 (방 밖·방 안·초대), 초대 서비스에 넘길 방 읽기
const { registerLobbyEvents, registerRoomEvents, registerInviteEvents } = require('./matchmaking/registerEvents')
const { inviteRoomReaders } = require('./matchmaking/admission/inviteRoomReaders')

// 소켓 하나에 방·매칭 사건 받기 등록 (방 밖 → 방 안 → 초대 차례, matchmaking/registerEvents.js)
// getCurrentSocketId = 계정의 지금 소켓 id, 옛 탭 요청 거르려고 방장 행동·설정·시작에 넘김
function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    // Node 여러 개: 다른 Node 방 목록을 이 io로 보냄 + 빠른 매칭 켜 놨으면 경고 (단일 모드는 아무것도 안 함)
    bindRoomListIo(io)
    isRandomMatchAllowed()
    registerLobbyEvents(io, socket, uuid)
    registerRoomEvents(io, socket, uuid, getCurrentSocketId)
    registerInviteEvents(io, socket, uuid)
}

// 초대 서비스에 방 상태 읽는 함수 묶음 넣어 줌 (이 파일 처음 불릴 때 한 번)
// 서비스가 socket을 거꾸로 require 안 하게 하려는 것, Node 여러 개면 내 Node에 없을 때 다른 Node에 RPC (cluster/inviteAccess.js)
gameInviteModule.__setRoomAccessForRuntime(createInviteAccess(inviteRoomReaders))

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

// 입장 요청 검사 파일
// 코드 입장 요청 모양 검사 + 입장 실패 알리기 (지도 01-①②⑤)
const gameSession = require('../../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { isStartedRoomMark } = require('./startedMarks')

// 입장 실패는 전부 room_join_failed 한 통로로 보냄
function emitRoomJoinFailed(socket, code, message, details = {}) {
    socket.emit('room_join_failed', { code, message, ...details })
}

// 게임 중이라 거절할 때 문구
const ALREADY_IN_GAME_MESSAGE = '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.'

// 진행 중 게임에 있으면 거절
function rejectIfInGame(uuid, respond) {
    if (!gameSession.isMatchmakingBlocked(uuid)) return false
    const routing = gameSession.getActiveSessionRoutingInfo(uuid)
    if (!routing) return false
    respond({
        code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME,
        message: ALREADY_IN_GAME_MESSAGE,
        gameId: routing.gameId,
    })
    return true
}

// 코드 입장 요청에 허용하는 키
const JOIN_BY_CODE_KEYS = Object.freeze(['roomCode', 'roomId'])

// 요청 모양 틀렸을 때 문구
const JOIN_REQUEST_INVALID_MESSAGE = '잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.'

// 코드 입장 요청 검사 (객체인지·다른 키 없는지·코드 모양)
function validateJoinRoomByCodeRequest(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            ok: false,
            code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
            message: JOIN_REQUEST_INVALID_MESSAGE,
        }
    }
    for (const key of Object.keys(payload)) {
        if (!JOIN_BY_CODE_KEYS.includes(key)) {
            return {
                ok: false,
                code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
                message: JOIN_REQUEST_INVALID_MESSAGE,
            }
        }
    }
    if (Object.hasOwn(payload, 'roomId')) {
        if (typeof payload.roomId !== 'string' || payload.roomId.length === 0) {
            return {
                ok: false,
                code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
                message: JOIN_REQUEST_INVALID_MESSAGE,
            }
        }
    }
    return { ok: true, roomCode: payload.roomCode, roomId: payload.roomId ?? null }
}

// "이미 시작" vs "이미 끝남" 실패 이유 고르기
function describeJoinFailure(phase) {
    if (phase === 'ENDED') {
        return [ROOM_JOIN_ERROR_CODES.SESSION_ENDED, '이미 끝난 게임의 방입니다.']
    }
    return [ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.']
}

// 이 코드가 지금 열린 방이나 시작된 방에 쓰이는지
function isRoomCodeReserved(code) {
    if (gameSession.getRoomCodeSessionState({ roomCode: code }) !== null) return true
    return isStartedRoomMark(`code:${code}`)
}

module.exports = {
    emitRoomJoinFailed,
    ALREADY_IN_GAME_MESSAGE,
    rejectIfInGame,
    JOIN_BY_CODE_KEYS,
    JOIN_REQUEST_INVALID_MESSAGE,
    validateJoinRoomByCodeRequest,
    describeJoinFailure,
    isRoomCodeReserved,
}

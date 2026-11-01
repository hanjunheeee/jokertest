// 입장 요청 검사 파일
// 게임 중 거절·코드 입장 요청 검사·실패 알림·코드 겹침 확인 (지도 01-①②⑤ · 09-⑥)
// matchmaking.js(코드 입장 받기)·join·create·queue·accept·room/host·settings가 사용
const gameSession = require('../../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { isStartedRoomMark } = require('./startedMarks')

// 입장 실패는 전부 room_join_failed 한 통로로 보냄
function emitRoomJoinFailed(socket, code, message, details = {}) {
    socket.emit('room_join_failed', { code, message, ...details })
}

// 게임 중이라 거절할 때 문구
const ALREADY_IN_GAME_MESSAGE = '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.'

// 진행 중 게임에 있으면 거절, 판 id 같이 알려 줌 (기권·끝난 판은 통과)
function rejectIfInGame(uuid, respond) {
    // 막힌 사람만 판 찾음
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

// 코드 입장 요청에 허용하는 키 (uuid 같은 다른 키 끼워 넣기 막기)
const JOIN_BY_CODE_KEYS = Object.freeze(['roomCode', 'roomId'])

// 요청 모양 틀렸을 때 문구
const JOIN_REQUEST_INVALID_MESSAGE = '잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.'

// 코드 입장 요청 검사 (객체인지·다른 키 없는지·roomId 모양, 코드 값은 입장 쪽이 다듬음)
function validateJoinRoomByCodeRequest(payload) {
    // 객체만 받음
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            ok: false,
            code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
            message: JOIN_REQUEST_INVALID_MESSAGE,
        }
    }
    // 허용 키 말고 다른 키 있으면 거절
    for (const key of Object.keys(payload)) {
        if (!JOIN_BY_CODE_KEYS.includes(key)) {
            return {
                ok: false,
                code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
                message: JOIN_REQUEST_INVALID_MESSAGE,
            }
        }
    }
    // roomId는 보냈으면 빈 글자 아닌 글자여야 함
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

// 이 코드를 판(진행·끝남)이나 시작 표시가 잡고 있는지, 대기방 코드는 generateUniqueRoomCode가 봄
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

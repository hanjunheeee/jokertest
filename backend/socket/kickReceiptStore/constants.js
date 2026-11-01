// 추방 상수 파일
// 영수증 보관 시간·개수 한도, 추방 명령·이벤트·거절 코드, 요청 허용 키, 추방 영수증 폴더·gameSession·matchmaking이 씀

// 영수증 보관 시간 10분 (같은 요청 다시 오면 같은 답)
const KICK_RECEIPT_TTL_MS = 10 * 60 * 1000

// 영수증 전체 한도, 판단 거절 영수증은 그 절반까지만 (거절이 자리를 다 먹지 않게)
const KICK_RECEIPT_MAX_ENTRIES = 4096
const KICK_REJECTION_RECEIPT_MAX_ENTRIES = Math.floor(KICK_RECEIPT_MAX_ENTRIES / 2)

// 요청 식별자 칸 최대 길이
const MAX_IDENTIFIER_LENGTH = 128

const KICK_COMMANDS = Object.freeze({
    ROOM: 'ROOM',
    GAME: 'GAME',
})

const KICK_EVENTS = Object.freeze({
    KICK_ROOM_PLAYER: 'kick_room_player',
    KICK_GAME_PLAYER: 'kick_game_player',
    GET_KICK_RESULT: 'get_kick_result',
    ROOM_KICKED: 'room_kicked',
    GAME_KICKED: 'game_kicked',
})

const KICK_ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    STALE_SOCKET: 'STALE_SOCKET',
    STALE_BOOT: 'STALE_BOOT',
    REQUEST_ID_REUSED: 'REQUEST_ID_REUSED',
    RECEIPT_CAPACITY: 'RECEIPT_CAPACITY',
    NOT_IN_ROOM: 'NOT_IN_ROOM',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    NOT_HOST: 'NOT_HOST',
    ADMISSION_PENDING: 'ADMISSION_PENDING',
    SELF_KICK: 'SELF_KICK',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    ALREADY_LEFT: 'ALREADY_LEFT',
    STALE_MEMBERSHIP: 'STALE_MEMBERSHIP',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    GAME_ALREADY_ENDED: 'GAME_ALREADY_ENDED',
    ALREADY_IN_GAME: 'ALREADY_IN_GAME',
    UNKNOWN: 'UNKNOWN',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
})

// 추방 요청 허용 키: 방 추방, 게임 추방은 판 id 하나 더 (전부 필수)
const ROOM_KICK_KEYS = [
    'requestId', 'bootEpoch', 'roomId', 'roomInstanceId',
    'requesterMembershipId', 'targetUuid', 'targetMembershipId',
]
const GAME_KICK_KEYS = [...ROOM_KICK_KEYS, 'gameId']

// 추방 결과 조회 허용 키
const KICK_RESULT_QUERY_KEYS = ['bootEpoch', 'requestId']

module.exports = {
    KICK_RECEIPT_TTL_MS,
    KICK_RECEIPT_MAX_ENTRIES,
    KICK_REJECTION_RECEIPT_MAX_ENTRIES,
    MAX_IDENTIFIER_LENGTH,
    KICK_COMMANDS,
    KICK_EVENTS,
    KICK_ERROR_CODES,
    ROOM_KICK_KEYS,
    GAME_KICK_KEYS,
    KICK_RESULT_QUERY_KEYS,
}

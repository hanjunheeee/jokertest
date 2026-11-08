// 추방 상수 파일, 영수증 보관 시간·개수 한도 + 추방 종류·사건 이름·거절 코드·요청 허용 키
// 같은 폴더 receipts·validate·index가 씀
// index 거쳐 matchmaking 대기방 추방·gameSession 결과 조회가 씀 (게임 중 추방은 2026-11-09 없앰)

// 영수증 보관 시간 10분 (같은 요청 다시 오면 같은 답)
const KICK_RECEIPT_TTL_MS = 10 * 60 * 1000

// 영수증 전체 한도, 판단 거절 영수증은 그 절반까지만 (거절이 자리를 다 먹지 않게)
const KICK_RECEIPT_MAX_ENTRIES = 4096
const KICK_REJECTION_RECEIPT_MAX_ENTRIES = Math.floor(KICK_RECEIPT_MAX_ENTRIES / 2)

// 요청 식별자 칸 최대 길이
const MAX_IDENTIFIER_LENGTH = 128

// 추방 종류: 대기방 추방만 (영수증 지문에도 들어감)
const KICK_COMMANDS = Object.freeze({
    ROOM: 'ROOM',
})

// 추방 사건 이름 (시험도 이 표 읽음)
const KICK_EVENTS = Object.freeze({
    KICK_ROOM_PLAYER: 'kick_room_player',
    GET_KICK_RESULT: 'get_kick_result',
    ROOM_KICKED: 'room_kicked',
})

// 추방 거절 코드 모음, 대기방 추방·결과 조회가 씀
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
    ALREADY_LEFT: 'ALREADY_LEFT',
    STALE_MEMBERSHIP: 'STALE_MEMBERSHIP',
    ALREADY_IN_GAME: 'ALREADY_IN_GAME',
    UNKNOWN: 'UNKNOWN',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
})

// 추방 요청 허용 키: 대기방 추방 (전부 필수)
const ROOM_KICK_KEYS = [
    'requestId', 'bootEpoch', 'roomId', 'roomInstanceId',
    'requesterMembershipId', 'targetUuid', 'targetMembershipId',
]

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
    KICK_RESULT_QUERY_KEYS,
}

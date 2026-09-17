const crypto = require('crypto')

/**
 * F-21: 방장 추방의 **입력 검증·프로세스 기동 식별·영수증**을 소유하는 단일 모듈이다.
 *
 * 대기방 추방(backend/socket/matchmaking.js)과 진행 중 추방(backend/socket/gameSession.js)이
 * 같은 규칙을 각자 적어 두면 한쪽만 고쳐져 조용히 갈라진다 — 두 경로가 **같은 bootEpoch**와
 * **같은 영수증 표**를 공유해야, 대기방에서 시작해 게임으로 넘어간 방장의 재조회가 명령
 * 종류와 무관하게 하나의 답을 갖는다.
 *
 * 이 모듈은 방·세션 registry를 전혀 알지 못한다(순수 메모리 표와 순수 검증). 권한·현재 상태
 * 판단은 호출부의 몫이고, 여기서는 "이 요청이 형태상 유효한가 · 같은 키의 과거 결정이
 * 무엇이었나 · 새 결정을 담을 자리가 있는가"만 답한다.
 */

/**
 * 이 프로세스 기동을 식별한다. matchmaking.js의 초대 입장(admission)도 같은 값을 쓴다 —
 * 두 곳이 각자 randomUUID()를 만들면 같은 서버 기동인데도 서로 다른 boot으로 보여, 클라이언트가
 * 한 화면에서 받은 두 값이 어긋난다. 재시작하면 값이 달라지므로 옛 boot의 명령은 새 상태에
 * 실행되지 않고(A-08), 그 requestId 조회는 UNKNOWN이 된다.
 */
const BOOT_EPOCH = crypto.randomUUID()

/** 결정 시점부터의 보존 기간. 방 소멸·시작·방장 교체로는 지우지 않는다(A-08). */
const KICK_RECEIPT_TTL_MS = 10 * 60 * 1000

/** 유효 영수증 상한. 이 수를 넘으면 유효 기록을 **축출하지 않고** 새 커밋을 거부한다(A-08). */
const KICK_RECEIPT_MAX_ENTRIES = 4096

/** 식별자 최대 길이 — updateRoomSettingsValidation과 같은 기준이다. */
const MAX_IDENTIFIER_LENGTH = 128

/** 추방 명령의 종류. 영수증 지문에 들어가므로 같은 requestId로 다른 종류를 보내면 충돌이다. */
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

/**
 * 실패 사유 코드의 단일 원천. 클라이언트는 이 문자열로만 분기하고 메시지로 분기하지 않는다.
 *
 * NOT_A_PARTICIPANT/ALREADY_LEFT를 나누는 이유: 전자는 "그 방/게임의 참가자였던 적이 없다",
 * 후자는 "참가자였지만 이미 빠졌다"이고, 후자만 "화면을 새로고침하면 사라져 있다"는 안내가
 * 맞는다. 일반 leave의 멱등 성공과 달리 신규 kick은 둘 다 거부다(AC-04).
 */
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

/**
 * `[bootEpoch, requesterUuid, requestId]` → {
 *   fingerprint, command, decidedAt, expiresAt, result
 * }
 *
 * 키에 **방/게임 식별자가 없다**는 점이 설정 변경 영수증과 다르다. 추방의 재조회는 "그 방이
 * 아직 있는가"와 무관해야 하고(방이 사라져도 원 요청자는 자기 명령의 결과를 알 수 있어야
 * 한다), 방 식별자를 키에 넣으면 같은 requestId로 다른 방을 가리킨 두 번째 요청이 **다른
 * 키**가 되어 충돌 거부가 성립하지 않는다.
 */
const kickReceipts = new Map()

function isIdentifier(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_IDENTIFIER_LENGTH
        && value.trim().length > 0
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 세 값을 구분자로 이어 붙이면 식별자에 그 구분자가 섞였을 때 서로 다른 세 쌍이 같은 키가
 * 될 수 있다. JSON 배열은 각 조각의 경계를 따옴표로 보존한다(settingsUpdateResultKey와 동일).
 */
function kickReceiptKey(bootEpoch, requesterUuid, requestId) {
    return JSON.stringify([bootEpoch, requesterUuid, requestId])
}

/** 기한이 지난 기록을 걷어낸다(조회·기록·용량 판정이 모두 먼저 부른다). */
function pruneKickReceipts(now = Date.now()) {
    for (const [key, entry] of kickReceipts) {
        if (entry.expiresAt <= now) kickReceipts.delete(key)
    }
}

/**
 * 이 키의 과거 결정(있으면). 만료된 기록은 없는 것으로 본다 — 없다는 사실로 성공/미실행을
 * 단정하지 않는 것은 **호출부**의 계약이다(여기서는 null만 돌려준다).
 */
function lookupKickReceipt(key) {
    pruneKickReceipts()
    return kickReceipts.get(key) ?? null
}

/**
 * 새 결정을 담을 자리가 있는가. **상태를 바꾸기 전에** 묻는다 — 자리가 없는데 소속을 먼저
 * 제거하면 "실제로는 추방됐는데 결과를 영영 알 수 없는" 요청이 생긴다(A-08).
 *
 * 유효 기록을 축출하지 않는다는 점이 설정 변경 영수증(가장 오래된 것부터 버림)과 다르다.
 * 추방은 되돌릴 수 없는 결정이라, 결과를 잃는 쪽보다 새 요청을 거부하는 쪽이 안전하다.
 */
function hasKickReceiptCapacity() {
    pruneKickReceipts()
    return kickReceipts.size < KICK_RECEIPT_MAX_ENTRIES
}

/**
 * 결정을 기록하는 유일한 경계. 이미 있는 키는 덮어쓰지 않는다 — 같은 키의 두 번째 결정은
 * 정의상 존재할 수 없고(호출부가 조회 → 충돌 거부 → 커밋 순서를 지킨다), 덮어쓰면 재조회가
 * 어느 결정을 말하는지 알 수 없게 된다.
 */
function recordKickReceipt(key, { command, fingerprint, result, now = Date.now() }) {
    if (kickReceipts.has(key)) return kickReceipts.get(key)
    const entry = {
        command,
        fingerprint,
        result,
        decidedAt: now,
        expiresAt: now + KICK_RECEIPT_TTL_MS,
    }
    kickReceipts.set(key, entry)
    return entry
}

/**
 * 정규화된 전체 입력의 지문. 같은 키·다른 입력을 충돌로 판정하는 유일한 근거라, **모든**
 * 필수 필드와 명령 종류가 들어간다. 배열 JSON이라 조각 경계가 보존된다.
 */
function fingerprintKickRequest(command, value) {
    return JSON.stringify([
        command,
        value.bootEpoch,
        value.roomId,
        value.roomInstanceId,
        value.requesterMembershipId,
        value.targetUuid,
        value.targetMembershipId,
        value.gameId ?? null,
    ])
}

const ROOM_KICK_KEYS = [
    'requestId', 'bootEpoch', 'roomId', 'roomInstanceId',
    'requesterMembershipId', 'targetUuid', 'targetMembershipId',
]
const GAME_KICK_KEYS = [...ROOM_KICK_KEYS, 'gameId']

function fail(code, message) {
    return { ok: false, code, message }
}

/**
 * kick_room_player / kick_game_player payload를 검증합니다. 보정하지 않고 거부만 합니다
 * (통과한 값은 받은 그대로 키·지문이 된다).
 *
 * 허용 목록 밖의 최상위 키는 조용히 무시하지 않고 거부한다 — 무시하면 클라이언트는 "무언가
 * 더 보냈다"고 믿는데 서버는 다르게 해석하는 상태가 된다(설정 변경 검증과 같은 관례).
 *
 * @param {unknown} payload - 클라이언트가 보낸 값(신뢰하지 않음)
 * @param {'ROOM'|'GAME'} command
 */
function validateKickPayload(payload, command) {
    if (!isPlainObject(payload)) return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')

    const allowed = command === KICK_COMMANDS.GAME ? GAME_KICK_KEYS : ROOM_KICK_KEYS
    for (const key of Object.keys(payload)) {
        if (!allowed.includes(key)) return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }
    for (const key of allowed) {
        if (!isIdentifier(payload[key])) return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }

    const value = {}
    for (const key of allowed) value[key] = payload[key]
    if (command !== KICK_COMMANDS.GAME) value.gameId = null
    return { ok: true, value }
}

/**
 * get_kick_result payload 검증 — {bootEpoch, requestId}만 받는다. 조회는 저장 요청과 **같은
 * 술어**로 식별자를 검사한다(저장이 만들 수 없는 키를 묻는 요청이 정상 응답을 받지 않게).
 */
function validateKickResultQuery(payload) {
    if (!isPlainObject(payload)) return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    for (const key of Object.keys(payload)) {
        if (key !== 'bootEpoch' && key !== 'requestId') {
            return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        }
    }
    if (!isIdentifier(payload.bootEpoch) || !isIdentifier(payload.requestId)) {
        return fail(KICK_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
    }
    return { ok: true, value: { bootEpoch: payload.bootEpoch, requestId: payload.requestId } }
}

/** 서버가 발급하는 소속 식별자. 참가자 객체마다 하나이며 재연결로는 새로 발급하지 않는다. */
function nextMembershipId() {
    return crypto.randomUUID()
}

/** 테스트 전용: 영수증 표를 비운다. BOOT_EPOCH는 프로세스 수명이라 바뀌지 않는다. */
function __resetKickReceiptsForTests() {
    kickReceipts.clear()
}

/** 테스트 전용: 현재 유효 영수증 수(만료분을 걷어낸 뒤). */
function __getKickReceiptCountForTests() {
    pruneKickReceipts()
    return kickReceipts.size
}

/**
 * 테스트 전용: 용량 경계 시험이 4096개를 실제 소켓 왕복으로 만들지 않아도 되도록, 결정된
 * 영수증을 직접 심는다. 판정 로직(용량·TTL·충돌)은 프로덕션 경로 그대로다.
 */
function __seedKickReceiptForTests(key, entry) {
    kickReceipts.set(key, entry)
}

module.exports = {
    BOOT_EPOCH,
    KICK_RECEIPT_TTL_MS,
    KICK_RECEIPT_MAX_ENTRIES,
    KICK_COMMANDS,
    KICK_EVENTS,
    KICK_ERROR_CODES,
    kickReceiptKey,
    pruneKickReceipts,
    lookupKickReceipt,
    hasKickReceiptCapacity,
    recordKickReceipt,
    fingerprintKickRequest,
    validateKickPayload,
    validateKickResultQuery,
    nextMembershipId,
    __resetKickReceiptsForTests,
    __getKickReceiptCountForTests,
    __seedKickReceiptForTests,
}

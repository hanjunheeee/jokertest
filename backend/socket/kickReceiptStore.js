const crypto = require('crypto')

const BOOT_EPOCH = crypto.randomUUID()

const KICK_RECEIPT_TTL_MS = 10 * 60 * 1000

const KICK_RECEIPT_MAX_ENTRIES = 4096

const KICK_REJECTION_RECEIPT_MAX_ENTRIES = Math.floor(KICK_RECEIPT_MAX_ENTRIES / 2)

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

function kickReceiptKey(bootEpoch, requesterUuid, requestId) {
    return JSON.stringify([bootEpoch, requesterUuid, requestId])
}

function pruneKickReceipts(now = Date.now()) {
    for (const [key, entry] of kickReceipts) {
        if (entry.expiresAt <= now) kickReceipts.delete(key)
    }
}

function lookupKickReceipt(key) {
    pruneKickReceipts()
    return kickReceipts.get(key) ?? null
}

function hasKickReceiptCapacity() {
    pruneKickReceipts()
    return kickReceipts.size < KICK_RECEIPT_MAX_ENTRIES
}

function hasKickRejectionCapacity() {
    pruneKickReceipts()
    return kickReceipts.size < KICK_REJECTION_RECEIPT_MAX_ENTRIES
}

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

function nextMembershipId() {
    return crypto.randomUUID()
}

function __resetKickReceiptsForTests() {
    kickReceipts.clear()
}

function __getKickReceiptCountForTests() {
    pruneKickReceipts()
    return kickReceipts.size
}

function __seedKickReceiptForTests(key, entry) {
    kickReceipts.set(key, entry)
}

module.exports = {
    BOOT_EPOCH,
    KICK_RECEIPT_TTL_MS,
    KICK_RECEIPT_MAX_ENTRIES,
    KICK_REJECTION_RECEIPT_MAX_ENTRIES,
    KICK_COMMANDS,
    KICK_EVENTS,
    KICK_ERROR_CODES,
    kickReceiptKey,
    pruneKickReceipts,
    lookupKickReceipt,
    hasKickReceiptCapacity,
    hasKickRejectionCapacity,
    recordKickReceipt,
    fingerprintKickRequest,
    validateKickPayload,
    validateKickResultQuery,
    nextMembershipId,
    __resetKickReceiptsForTests,
    __getKickReceiptCountForTests,
    __seedKickReceiptForTests,
}

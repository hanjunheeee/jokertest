// 추방 영수증 보관함 파일
// 요청별 결정 기록(만료·한도) + 요청 지문, 부팅 id·자리 id 만들기, gameSession·matchmaking 추방 처리가 씀
const crypto = require('crypto')
const {
    KICK_RECEIPT_TTL_MS,
    KICK_RECEIPT_MAX_ENTRIES,
    KICK_REJECTION_RECEIPT_MAX_ENTRIES,
} = require('./constants')

// 이 서버 프로세스 id (재시작 뒤 옛 요청 거르기)
const BOOT_EPOCH = crypto.randomUUID()

// 영수증 키 → { command, fingerprint, result, decidedAt, expiresAt }
const kickReceipts = new Map()

// 영수증 키: 부팅 id + 요청자 + 요청 id
function kickReceiptKey(bootEpoch, requesterUuid, requestId) {
    return JSON.stringify([bootEpoch, requesterUuid, requestId])
}

// 만료된 영수증 지우기
function pruneKickReceipts(now = Date.now()) {
    for (const [key, entry] of kickReceipts) {
        if (entry.expiresAt <= now) kickReceipts.delete(key)
    }
}

// 영수증 찾기 (만료 먼저 지움), 없으면 null
function lookupKickReceipt(key) {
    pruneKickReceipts()
    return kickReceipts.get(key) ?? null
}

// 성공 영수증 남길 자리 있는지
function hasKickReceiptCapacity() {
    pruneKickReceipts()
    return kickReceipts.size < KICK_RECEIPT_MAX_ENTRIES
}

// 판단 거절 영수증 남길 자리 있는지 (전체 한도의 절반까지)
function hasKickRejectionCapacity() {
    pruneKickReceipts()
    return kickReceipts.size < KICK_REJECTION_RECEIPT_MAX_ENTRIES
}

// 영수증 남기기, 이미 있으면 처음 것 그대로 (같은 요청은 같은 답)
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

// 요청 지문: 같은 요청 id로 내용만 바꿔 다시 보내면 거절하려고 씀
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

// 새 자리 id (방·판에 들어올 때마다 새로, 옛 자리 추방 막기)
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
    kickReceiptKey,
    pruneKickReceipts,
    lookupKickReceipt,
    hasKickReceiptCapacity,
    hasKickRejectionCapacity,
    recordKickReceipt,
    fingerprintKickRequest,
    nextMembershipId,
    __resetKickReceiptsForTests,
    __getKickReceiptCountForTests,
    __seedKickReceiptForTests,
}

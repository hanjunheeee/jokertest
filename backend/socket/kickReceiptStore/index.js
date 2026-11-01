// 추방 영수증 입구
// 추방 상수·영수증 보관함·요청 모양 검사를 묶어 내보냄, socket gameSession·matchmaking·시험이 폴더 이름으로 부름
const {
    KICK_RECEIPT_TTL_MS,
    KICK_RECEIPT_MAX_ENTRIES,
    KICK_REJECTION_RECEIPT_MAX_ENTRIES,
    KICK_COMMANDS,
    KICK_EVENTS,
    KICK_ERROR_CODES,
} = require('./constants')
const {
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
} = require('./receipts')
const { validateKickPayload, validateKickResultQuery } = require('./validate')

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

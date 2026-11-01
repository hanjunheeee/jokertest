// socket 공통 도구 입구
// 요청 모양 검사·단계 격리·ack 답·겹 Map 도구를 한 번에 내보냄 (gameSession·matchmaking 같이 씀)
const { isPlainObject, isNonEmptyString, hasOnlyKeys } = require('./shape')
const { isolate, isolateOr, tryOr, attempt, isolateWithError, logRejection } = require('./isolate')
const {
    REPLY_MESSAGES,
    rejectedReply,
    staleSocketReply,
    invalidPayloadReply,
    internalErrorReply,
    respond,
    labeledResponder,
} = require('./replies')
const { getOrCreate, deleteNested } = require('./maps')

module.exports = {
    isPlainObject,
    isNonEmptyString,
    hasOnlyKeys,
    isolate,
    isolateOr,
    tryOr,
    attempt,
    isolateWithError,
    logRejection,
    REPLY_MESSAGES,
    rejectedReply,
    staleSocketReply,
    invalidPayloadReply,
    internalErrorReply,
    respond,
    labeledResponder,
    getOrCreate,
    deleteNested,
}

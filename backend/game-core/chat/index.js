// 채팅 입구, 상수·규칙·보내기 묶어서 내보냄
// gameSession.js·setup이 이 입구로 가져다 사용
// 글자 수·간격·채널 목록
const {
    CHAT_MAX_LENGTH, CHAT_MIN_INTERVAL_MS, EMOJI_MIN_INTERVAL_MS, CHAT_COMMIT_MAX_AGE_MS, BAD_CHARS,
    CHAT_CHANNELS, RATE_FIELD,
} = require('./constants')
// 글 검사·채널 정하기·받는 사람
const {
    sanitizeChatText, isInvalidClockValue, getChatRateLimitMap, resolveGameChatChannel,
    getChatRecipientUuids,
} = require('./rules')
// 채팅 prepare/commit
const {
    prepareJokerChatMessage, commitJokerChatMessage, prepareGameChatMessage, commitGameChatMessage,
} = require('./messages')

module.exports = {
    CHAT_MAX_LENGTH, CHAT_MIN_INTERVAL_MS, EMOJI_MIN_INTERVAL_MS, CHAT_COMMIT_MAX_AGE_MS, BAD_CHARS,
    CHAT_CHANNELS, RATE_FIELD,
    sanitizeChatText, isInvalidClockValue, getChatRateLimitMap, resolveGameChatChannel,
    getChatRecipientUuids,
    prepareJokerChatMessage, commitJokerChatMessage, prepareGameChatMessage, commitGameChatMessage,
}
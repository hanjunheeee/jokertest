// 채팅 규칙 파일
// 글 검사 + 채널·속도 제한 정하기, chat/messages.js가 사용
const { GAME_ROLES } = require('../core/roles')
const { CHAT_MAX_LENGTH, BAD_CHARS, CHAT_CHANNELS, RATE_FIELD } = require('./constants')

// 줄바꿈 맞추고 앞뒤 공백 자름, 빈 글·긴 글 거절
function sanitizeChatText(rawText) {
    if (typeof rawText !== 'string') return { ok: false, code: 'INVALID_CHARACTERS' }
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (BAD_CHARS.test(normalized)) {
        return { ok: false, code: 'INVALID_CHARACTERS' }
    }
    const trimmed = normalized.trim()
    if (trimmed.length === 0) return { ok: false, code: 'EMPTY_MESSAGE' }
    if (trimmed.length > CHAT_MAX_LENGTH) return { ok: false, code: 'MESSAGE_TOO_LONG' }
    return { ok: true, text: trimmed }
}

// 채널에 맞는 속도 제한 기록 꺼냄
function getChatRateLimitMap(session, channel) {
    const field = RATE_FIELD[channel]
    return field ? session[field] : undefined
}

// 산 사람만, 낮·재판 때만 낮 채널 사용
function resolveGameChatChannel(session, actor) {
    if (actor.alive !== true) return { ok: false, code: 'NOT_ELIGIBLE' }
    if (session.phase !== 'DAY' && session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }
    return { ok: true, channel: CHAT_CHANNELS.DAY }
}

// 받는 사람: 낮은 전원, 역할 채널은 같은 역할 산 사람 (광대는 죽어도 받음)
function getChatRecipientUuids(session, channel) {
    const uuids = []
    const roleChannel = Object.values(GAME_ROLES).includes(channel)
    for (const player of session.players.values()) {
        if (channel === CHAT_CHANNELS.DAY) {
            uuids.push(player.uuid)
        } else if (roleChannel && player.role === channel) {
            if (player.alive === true || channel === CHAT_CHANNELS.JOKER) uuids.push(player.uuid)
        }
    }
    return uuids
}

module.exports = {
    sanitizeChatText,
    getChatRateLimitMap,
    resolveGameChatChannel,
    getChatRecipientUuids,
}
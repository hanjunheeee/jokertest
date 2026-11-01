// 채팅 규칙 파일
// 글 검사 + 채널·속도 제한 정하기, chat/messages.js가 사용
const { GAME_ROLES } = require('../core/roles')
const { CHAT_MAX_LENGTH, BAD_CHARS, CHAT_CHANNELS, RATE_FIELD } = require('./constants')

// 줄바꿈 맞추고 앞뒤 공백 자름, 빈 글·긴 글 거절
function sanitizeChatText(rawText) {
    // 글자가 아닌 값은 거절
    if (typeof rawText !== 'string') return { ok: false, code: 'INVALID_CHARACTERS' }
    // 줄바꿈 \r\n·\r을 \n 하나로 맞춤
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // 안 보이는 문자 있으면 고쳐 주지 않고 거절
    if (BAD_CHARS.test(normalized)) {
        return { ok: false, code: 'INVALID_CHARACTERS' }
    }
    // 공백 자른 뒤 1~150자인지 (지도 13-③)
    const trimmed = normalized.trim()
    if (trimmed.length === 0) return { ok: false, code: 'EMPTY_MESSAGE' }
    if (trimmed.length > CHAT_MAX_LENGTH) return { ok: false, code: 'MESSAGE_TOO_LONG' }
    return { ok: true, text: trimmed }
}

// 시계 값이 못 쓰는 숫자인지 (0 이상 정수만 씀, 시험에서 시계 바꿔 끼울 때 대비)
// 채팅 prepare/commit이 보낸 시각·지금 시각 볼 때 사용
function isInvalidClockValue(value) {
    return !Number.isFinite(value) || !Number.isInteger(value) || value < 0
}

// 채널에 맞는 속도 제한 기록 꺼냄
function getChatRateLimitMap(session, channel) {
    // 모르는 채널이면 undefined (부른 쪽이 거절)
    const field = RATE_FIELD[channel]
    return field ? session[field] : undefined
}

// 산 사람만, 낮·재판 때만 낮 채널 사용
function resolveGameChatChannel(session, actor) {
    // 채널은 보낸 값 말고 서버가 생사·단계로 정함 (지도 13-④)
    if (actor.alive !== true) return { ok: false, code: 'NOT_ELIGIBLE' }
    if (session.phase !== 'DAY' && session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }
    return { ok: true, channel: CHAT_CHANNELS.DAY }
}

// 받는 사람: 낮은 전원, 역할 채널은 같은 역할 산 사람 (광대는 죽어도 받음)
function getChatRecipientUuids(session, channel) {
    const uuids = []
    // 역할 이름인 채널인지
    const roleChannel = Object.values(GAME_ROLES).includes(channel)
    for (const player of session.players.values()) {
        // 낮 채널: 판에 있는 사람 전부 (죽은 사람은 읽기만)
        if (channel === CHAT_CHANNELS.DAY) {
            uuids.push(player.uuid)
        } else if (roleChannel && player.role === channel) {
            // 역할 채널: 같은 역할 중 산 사람, 광대는 죽어도
            if (player.alive === true || channel === CHAT_CHANNELS.JOKER) uuids.push(player.uuid)
        }
    }
    return uuids
}

module.exports = {
    sanitizeChatText,
    isInvalidClockValue,
    getChatRateLimitMap,
    resolveGameChatChannel,
    getChatRecipientUuids,
}
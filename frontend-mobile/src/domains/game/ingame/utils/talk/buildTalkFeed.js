// 카톡형 채팅방 한 줄 목록 만들기: 채팅 말·시스템 알림·이모티콘을 시각 순으로 섞음
// useTalkFeed가 씀, 순수 함수라 tests/talk에서 바로 시험

// 밤 같은 직업 채널 이름 (줄 채널이 이것이면 조커 말풍선)
const ROLE_CHANNELS = new Set(["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"])

// 줄 모양: 채널이 붙어 있으면 그것으로 (죽은 사람 = 회색, 같은 직업 = 조커색), 없으면 목록 전체 joker 값
// 예: { channel: "DEAD" } → { joker: false, dead: true }, { channel: "JOKER" } → { joker: true, dead: false }
function lineLook(message, joker) {
    if (message.channel === "DEAD") return { joker: false, dead: true }
    if (ROLE_CHANNELS.has(message.channel)) return { joker: true, dead: false }
    if (message.channel === "DAY") return { joker: false, dead: false }
    return { joker, dead: false }
}

// 시각이 이상하면 맨 뒤로 (정렬은 같은 시각끼리 들어온 순서 유지)
function sortKey(at) {
    return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY
}

// messages: 채팅 세션 목록 { id, playerId, senderName, text, sentAt, channel? } (죽은 뒤엔 낮·죽은 사람 말이 섞여 옴)
// notices: 알림 { id, at, text }, emojis: 받은 이모티콘 { id, at, playerId, itemId }
// joker: 지금 목록이 밤 조커 채팅인지 (밤엔 세션 목록이 통째로 조커 채팅으로 바뀜)
export function buildTalkFeed({ messages = [], notices = [], emojis = [], localPlayerId = null, joker = false, nameOf = () => "" }) {
    const chatLines = messages.map((message) => ({
        kind: "chat",
        id: `chat-${message.id}`,
        at: message.sentAt,
        playerId: message.playerId,
        name: message.senderName ?? "",
        text: message.text ?? "",
        mine: localPlayerId !== null && message.playerId === localPlayerId,
        ...lineLook(message, joker),
    }))

    const noticeLines = notices.map((notice) => ({
        kind: "system",
        id: `system-${notice.id}`,
        at: notice.at,
        text: notice.text,
        mine: false,
        joker: false,
    }))

    const emojiLines = emojis.map((emoji) => ({
        kind: "emoji",
        id: `emoji-${emoji.id}`,
        at: emoji.at,
        playerId: emoji.playerId,
        name: nameOf(emoji.playerId),
        itemId: emoji.itemId,
        mine: localPlayerId !== null && emoji.playerId === localPlayerId,
        joker: false,
    }))

    return [...chatLines, ...noticeLines, ...emojiLines].sort((a, b) => sortKey(a.at) - sortKey(b.at))
}

// 바로 앞 줄과 같은 사람이 이어 말하면 초상·닉네임을 한 번만 (카톡처럼 묶음)
export function startsGroup(line, previous) {
    if (line.kind === "system") return false
    if (!previous || previous.kind === "system") return true
    return previous.playerId !== line.playerId || previous.joker !== line.joker || previous.dead !== line.dead
}

// 채팅 상수 파일
// 글자 수·간격·채널 목록, chat·판 열기 검사·socket 채팅이 사용
const { GAME_ROLES } = require('../core/rules/roles')

// 채팅 한 줄 최대 150자
const CHAT_MAX_LENGTH = 150

// 채팅 사이 최소 0.5초
const CHAT_MIN_INTERVAL_MS = 500

// 이모티콘 사이 최소 1초
const EMOJI_MIN_INTERVAL_MS = 1000

// prepare 뒤 5초 넘으면 commit 거절
const CHAT_COMMIT_MAX_AGE_MS = 5000

// 안 보이는 제어 문자·글 방향 바꾸는 문자 막기
const BAD_CHARS =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

// 채널 목록: 낮 · 죽은 사람 · 역할별
const CHAT_CHANNELS = Object.freeze({
    DAY: 'DAY',
    DEAD: 'DEAD',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, role])),
})

// 채널별 속도 제한 기록 칸, 역할 채널은 전부 한 칸 같이 사용
const RATE_FIELD = Object.freeze({
    DAY: 'dayChatRateLimit',
    DEAD: 'deadChatRateLimit',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, 'jokerChatRateLimit'])),
})

module.exports = {
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    EMOJI_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    BAD_CHARS,
    CHAT_CHANNELS,
    RATE_FIELD,
}
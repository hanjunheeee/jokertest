// 매칭 설정 파일
// 방 인원 규칙 + 자동 매칭 켜기 (개발 환경이면 작은 방도 허용)

// 운영 최소 인원 5명
const OFFICIAL_MIN_PLAYERS = 5

// 운영 방 크기
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]

// 개발용 방 크기 (1·2명 방도 가능)
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

// 자동 매칭 기본값: 꺼짐
const RANDOM_MATCH_ENABLED = false

// 시험이 자동 매칭 켜고 끄는 덮어쓰기 (운영은 null)
let randomMatchOverride = null

// 자동 매칭 켜졌는지
function isRandomMatchEnabled() {
    return randomMatchOverride ?? RANDOM_MATCH_ENABLED
}

// 시험용: 자동 매칭 덮어쓰기
function __setRandomMatchmakingEnabledForTests(value) {
    randomMatchOverride = value ?? null
}

// 운영 아니면 개발 규칙 사용
function isDevMatchmaking() {
    return process.env.NODE_ENV !== 'production'
}

// 최소 인원 (개발이면 GAME_DEV_MIN_PLAYERS, 기본 1)
function getMinPlayers() {
    if (!isDevMatchmaking()) return OFFICIAL_MIN_PLAYERS
    const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)
    return Number.isInteger(configured) && configured > 0 ? configured : 1
}

// 고를 수 있는 방 크기
function getSupportedRoomSizes() {
    return isDevMatchmaking() ? DEVELOPMENT_ROOM_SIZES : OFFICIAL_ROOM_SIZES
}

module.exports = {
    OFFICIAL_MIN_PLAYERS,
    OFFICIAL_ROOM_SIZES,
    DEVELOPMENT_ROOM_SIZES,
    RANDOM_MATCH_ENABLED,
    isRandomMatchEnabled,
    __setRandomMatchmakingEnabledForTests,
    isDevMatchmaking,
    getMinPlayers,
    getSupportedRoomSizes,
}

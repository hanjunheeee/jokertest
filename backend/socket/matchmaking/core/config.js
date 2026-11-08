// 매칭 설정 파일
// 인원 규칙·자동 매칭 스위치, 입장·초대·줄·시작·방 정보가 사용

const { isProduction } = require('../../../config/nodeEnv')

// 운영 최소 인원 5명
const OFFICIAL_MIN_PLAYERS = 5

// 운영 방 크기, 큰 것부터 둠 (줄 채우기·기본 정원이 이 순서에 기댐)
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]

// 개발용 방 크기 (1·2명 방도 가능)
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

// 자동 매칭 기본 꺼짐 (화면이 아직 매칭 결과를 안 받음)
const RANDOM_MATCH_ENABLED = false

// 시험이 자동 매칭 켜고 끄는 덮어쓰기 (운영은 null)
let randomMatchOverride = null

// 자동 매칭 켜졌는지
function isRandomMatchEnabled() {
    return randomMatchOverride ?? RANDOM_MATCH_ENABLED
}

// 시험용: 자동 매칭 덮어쓰기 (null이면 기본값)
function __setRandomMatchmakingEnabledForTests(value) {
    randomMatchOverride = value ?? null
}

// 운영 아니면 개발 규칙 사용 (운영 판정은 config/nodeEnv 한 곳, 모르는 값은 시작 때 막음)
function isDevMatchmaking() {
    return !isProduction()
}

// 최소 인원 (개발이면 GAME_DEV_MIN_PLAYERS, 기본 1)
function getMinPlayers() {
    if (!isDevMatchmaking()) return OFFICIAL_MIN_PLAYERS
    const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)
    return Number.isInteger(configured) && configured > 0 ? configured : 1
}

// 시작에 필요한 인원: 운영은 늘 5명, 개발은 개발 최소와 정원 중 작은 것 (시작 판정·시작 가능 표시가 같이 씀)
function getRequiredPlayers(maxPlayers) {
    const configuredMinimum = getMinPlayers()
    if (!isDevMatchmaking()) return configuredMinimum
    return Math.min(configuredMinimum, maxPlayers ?? configuredMinimum)
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
    getRequiredPlayers,
    getSupportedRoomSizes,
}

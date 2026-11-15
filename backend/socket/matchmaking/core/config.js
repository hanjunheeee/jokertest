// 매칭 설정 파일
// 인원 규칙·자동 매칭 스위치, 입장·초대·줄·시작·방 정보가 사용

// 최소 인원 5명 (개발·시험도 같은 규칙)
const OFFICIAL_MIN_PLAYERS = 5

// 방 크기, 큰 것부터 둠 (줄 채우기·기본 정원이 이 순서에 기댐)
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]

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

// 최소 인원 (NODE_ENV와 상관없이 늘 5명)
function getMinPlayers() {
    return OFFICIAL_MIN_PLAYERS
}

// 시작에 필요한 인원: 늘 5명 (시작 판정·시작 가능 표시가 같이 씀, 부르는 쪽이 넘기는 정원은 안 봄)
function getRequiredPlayers() {
    return OFFICIAL_MIN_PLAYERS
}

// 고를 수 있는 방 크기 (늘 10·8·6·5)
function getSupportedRoomSizes() {
    return OFFICIAL_ROOM_SIZES
}

module.exports = {
    OFFICIAL_MIN_PLAYERS,
    OFFICIAL_ROOM_SIZES,
    RANDOM_MATCH_ENABLED,
    isRandomMatchEnabled,
    __setRandomMatchmakingEnabledForTests,
    getMinPlayers,
    getRequiredPlayers,
    getSupportedRoomSizes,
}

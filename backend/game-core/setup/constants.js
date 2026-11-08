// 판 준비 상수 파일
// 인원 범위(운영·개발)·첫 단계·스킨 짝·색 수, setup·스냅샷·방 설정 검사가 사용

// 역할 → 스킨 직업 id
const ROLE_TO_SKIN_JOB_ID = Object.freeze({
    CITIZEN: 'noble',
    JOKER: 'clown',
    DOCTOR: 'doctor',
    GUARD: 'guard',
    WITCH_HUNTER: 'witchHunter',
})

// 운영 규칙: 한 판 최소 5명 (방 정원·시작·판 만들기 모두 이 값)
const MIN_SUPPORTED_PLAYERS = 5

// 판 최대 10명
const MAX_SUPPORTED_PLAYERS = 10

// 개발 편의: 운영 아니면 판 최소 2명·방 정원 최소 4명까지 허용 (기존 개발·시험 판 그대로)
const DEV_MIN_SUPPORTED_PLAYERS = 2
const DEV_MIN_ROOM_CAPACITY = 4

// 사람별 색 10가지
const PLAYER_THEME_PALETTE_SIZE = 10

// 판 처음 단계: 역할 확인
const INITIAL_GAME_PHASE = 'ROLE_REVEAL'

// 판 처음 날짜 0
const INITIAL_DAY_INDEX = 0

// 운영 규칙인지 (NODE_ENV=production일 때만, 개발 편의 값은 운영에서 무시)
function isProductionRules() {
    return process.env.NODE_ENV === 'production'
}

// 판 만들 수 있는 최소 인원 (운영 5, 개발 2)
function getMinSupportedPlayers() {
    return isProductionRules() ? MIN_SUPPORTED_PLAYERS : DEV_MIN_SUPPORTED_PLAYERS
}

// 방 정원으로 고를 수 있는 최소값 (운영 5, 개발 4)
function getMinRoomCapacity() {
    return isProductionRules() ? MIN_SUPPORTED_PLAYERS : DEV_MIN_ROOM_CAPACITY
}

module.exports = {
    ROLE_TO_SKIN_JOB_ID,
    MIN_SUPPORTED_PLAYERS,
    MAX_SUPPORTED_PLAYERS,
    DEV_MIN_SUPPORTED_PLAYERS,
    DEV_MIN_ROOM_CAPACITY,
    PLAYER_THEME_PALETTE_SIZE,
    INITIAL_GAME_PHASE,
    INITIAL_DAY_INDEX,
    isProductionRules,
    getMinSupportedPlayers,
    getMinRoomCapacity,
}

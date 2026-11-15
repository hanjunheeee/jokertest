// 판 준비 상수 파일
// 인원 범위·첫 단계·스킨 짝·색 수, setup·스냅샷·방 설정 검사가 사용

// 역할 → 스킨 직업 id
const ROLE_TO_SKIN_JOB_ID = Object.freeze({
    CITIZEN: 'noble',
    JOKER: 'clown',
    DOCTOR: 'doctor',
    GUARD: 'guard',
    WITCH_HUNTER: 'witchHunter',
})

// 한 판 최소 5명, 개발·시험도 같음 (방 정원·시작·판 만들기 모두 이 값)
const MIN_SUPPORTED_PLAYERS = 5

// 판 최대 10명
const MAX_SUPPORTED_PLAYERS = 10

// 사람별 색 10가지
const PLAYER_THEME_PALETTE_SIZE = 10

// 판 처음 단계: 역할 확인
const INITIAL_GAME_PHASE = 'ROLE_REVEAL'

// 판 처음 날짜 0
const INITIAL_DAY_INDEX = 0

// 판 만들 수 있는 최소 인원 (NODE_ENV와 상관없이 늘 5)
function getMinSupportedPlayers() {
    return MIN_SUPPORTED_PLAYERS
}

// 방 정원으로 고를 수 있는 최소값 (늘 5)
function getMinRoomCapacity() {
    return MIN_SUPPORTED_PLAYERS
}

module.exports = {
    ROLE_TO_SKIN_JOB_ID,
    MIN_SUPPORTED_PLAYERS,
    MAX_SUPPORTED_PLAYERS,
    PLAYER_THEME_PALETTE_SIZE,
    INITIAL_GAME_PHASE,
    INITIAL_DAY_INDEX,
    getMinSupportedPlayers,
    getMinRoomCapacity,
}

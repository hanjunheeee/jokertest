// 판 준비 상수 파일
// 인원 범위·첫 단계·스킨 짝·색 수, setup·스냅샷이 사용

// 역할 → 스킨 직업 id
const ROLE_TO_SKIN_JOB_ID = Object.freeze({
    CITIZEN: 'noble',
    JOKER: 'clown',
    DOCTOR: 'doctor',
    GUARD: 'guard',
    WITCH_HUNTER: 'witchHunter',
})

// 판 최소 2명
const MIN_SUPPORTED_PLAYERS = 2

// 판 최대 10명
const MAX_SUPPORTED_PLAYERS = 10

// 사람별 색 10가지
const PLAYER_THEME_PALETTE_SIZE = 10

// 판 처음 단계: 역할 확인
const INITIAL_GAME_PHASE = 'ROLE_REVEAL'

// 판 처음 날짜 0
const INITIAL_DAY_INDEX = 0

module.exports = {
    ROLE_TO_SKIN_JOB_ID,
    MIN_SUPPORTED_PLAYERS,
    MAX_SUPPORTED_PLAYERS,
    PLAYER_THEME_PALETTE_SIZE,
    INITIAL_GAME_PHASE,
    INITIAL_DAY_INDEX,
}
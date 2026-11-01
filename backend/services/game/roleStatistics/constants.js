// 직업 통계 상수 파일, 직업 코드·이름·최소 판 수·보상 제외 판 출처
// 집계·랭킹·보상 판정 파일이 같이 씀

// 직업 코드 순서 (같은 승률일 때 고르는 순서로도 씀)
const ROLE_CODES = Object.freeze(['CITIZEN', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 화면에 보이는 직업 이름
const ROLE_KOREAN_NAMES = Object.freeze({
    CITIZEN: '귀족',
    JOKER: '광대',
    DOCTOR: '주치의',
    GUARD: '경비원',
    WITCH_HUNTER: '마녀사냥꾼',
})

// 랭킹에 들어가려면 그 직업으로 이만큼은 해야 함
const RANKING_MIN_GAMES = 10

// 운명의 가면 직업 후보 최소 판 수
const MASK_OF_FATE_MIN_GAMES = 1

// 개발·시험 판은 업적 보상에서 빼기
const EXCLUDED_GAME_SOURCES = new Set(['development', 'test'])

module.exports = {
    ROLE_CODES,
    ROLE_KOREAN_NAMES,
    RANKING_MIN_GAMES,
    MASK_OF_FATE_MIN_GAMES,
    EXCLUDED_GAME_SOURCES,
}

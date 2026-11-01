// 역할 정의 모아 둔 파일
// game-core 안에서 사용, 밖으로는 gameSession.js가 다시 내보냄

// 역할별 팀 · 밤 행동 시작 날짜 · 대상이 살아 있어야 하는지
const ROLE_DEFINITIONS = Object.freeze({
    JOKER: Object.freeze({ team: 'JOKER', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    CITIZEN: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: null, targetMustBeAlive: true }),
    DOCTOR: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    GUARD: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 2, targetMustBeAlive: false }),
})

// 역할 이름 목록 (JOKER: 'JOKER' 식)
const GAME_ROLES = Object.freeze(
    Object.fromEntries(Object.keys(ROLE_DEFINITIONS).map((role) => [role, role])),
)

// 역할 → 팀 (ROLE_DEFINITIONS에서 뽑음)
const ROLE_TEAMS = Object.freeze(
    Object.fromEntries(Object.entries(ROLE_DEFINITIONS).map(([role, def]) => [role, def.team])),
)


module.exports = { ROLE_DEFINITIONS, GAME_ROLES, ROLE_TEAMS }
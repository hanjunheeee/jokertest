// game-core/gameSession.js의 ROLE_DEFINITIONS(team)와 값이 일치해야 한다 — 이 저장소에는
// 백엔드/프런트가 공유하는 상수 모듈이 없어 수동으로 동기화한다(buildPlayerSessionSourceFromGameState.js와
// 동일한 관례).
const INGAME_ROLE_REVEAL_DISPLAY = Object.freeze({
  JOKER: Object.freeze({
    name: "광대",
    teamLabel: "광대 진영",
    description: "밤마다 한 명을 지목해 처치할 수 있습니다. 낮에는 정체를 들키지 않도록 시민인 척 행동하세요.",
  }),
  CITIZEN: Object.freeze({
    name: "시민",
    teamLabel: "시민 진영",
    description: "특별한 능력은 없습니다. 낮 토론과 투표로 광대를 찾아내야 합니다.",
  }),
  DOCTOR: Object.freeze({
    name: "의사",
    teamLabel: "시민 진영",
    description: "밤마다 한 명을 지목해 광대의 공격으로부터 보호할 수 있습니다.",
  }),
  GUARD: Object.freeze({
    name: "경비대",
    teamLabel: "시민 진영",
    description: "밤마다 한 명을 지목해 정체(광대 여부)를 조사할 수 있습니다.",
  }),
  WITCH_HUNTER: Object.freeze({
    name: "마녀사냥꾼",
    teamLabel: "시민 진영",
    description: "둘째 날 밤부터 한 명을 지목해 광대인지 확인할 수 있습니다.",
  }),
})

/** role → { name, teamLabel, description } 표시 메타데이터. 알 수 없는 role이면 null. */
export function getInGameRoleRevealDisplay(role) {
  return INGAME_ROLE_REVEAL_DISPLAY[role] ?? null
}

// 역할별 보여 줄 이름·진영·설명
// utils/roleReveal.js·utils/reduceInGameNightPrivateResult.js가 사용

// 역할 → 이름·진영 글·설명
const ROLE_REVEAL_DISPLAY = Object.freeze({
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
    name: "경비원",
    teamLabel: "시민 진영",
    description: "밤마다 한 명을 지목해 정체(광대 여부)를 조사할 수 있습니다.",
  }),
  WITCH_HUNTER: Object.freeze({
    name: "마녀사냥꾼",
    teamLabel: "시민 진영",
    description: "둘째 날 밤부터 한 명을 지목해 광대인지 확인할 수 있습니다.",
  }),
})

// 역할 → 보여 줄 내용 (모르는 역할이면 null)
export function getRoleRevealDisplay(role) {
  return ROLE_REVEAL_DISPLAY[role] ?? null
}

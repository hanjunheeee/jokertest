/**
 * 그 밤에 재생할 연출 릴을 store state 하나에서만 파생하는 순수 함수.
 *
 * 이 파일의 계약은 한 줄이다: **생사에 따라 역할을 빼지 않는다.** 행동 역할 보유자가 전원
 * 죽어도 그 역할의 칸은 릴에 그대로 남는다 — 칸이 사라지는 순간 관찰자가 "안내가 사라짐 =
 * 그 역할 사망"을 추론할 수 있어 사망자의 역할이 전체에 누출되기 때문이다. 릴의 값은
 * (역할 구성 + 시신 존재 여부 + dayIndex)만의 함수이고, 이 셋은 모두 이미 공개 정보다.
 *
 * 판정과는 별개다 — "지금 내 차례인가"는 여전히 canonical 턴(selectInGameNightTurnRole)이
 * 정하고 행동 패널이 그것만 읽는다. 이 릴은 턴 안내 오버레이와 상태바 문구, 즉 연출에만 쓴다.
 */
import { buildInGameNightTurnReel } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

/**
 * canonical state에서 이 밤의 연출 릴(역할 문자열 배열)을 만든다. 밤이 아니면 빈 배열이다.
 * @param {object|null|undefined} state ingameStore의 서버 세션 미러
 *   (state.phase·dayIndex·players·nightTurnRoles)
 * @flow NIGHT가 아니거나 dayIndex가 유효한 비음수 정수가 아니면 빈 배열이다. 그 외에는 공개
 *   roster에서 사망자 존재 여부만 뽑아(마녀사냥꾼의 시신 규칙용) buildInGameNightTurnReel에
 *   그대로 넘긴다.
 */
export function selectInGameNightTurnReel(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return []
  if (state.phase !== "NIGHT") return []

  const dayIndex = state.dayIndex
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return []

  // 서버 hasAnyDeadPlayer의 공개 roster 사본이다 — 누가 죽었는지는 이미 전원이 보는 정보라
  // 이 판정으로 새로 새는 것은 없다.
  const hasDeadPlayer =
    Array.isArray(state.players) && state.players.some((player) => player?.alive === false)

  return buildInGameNightTurnReel(state.nightTurnRoles, dayIndex, { hasDeadPlayer })
}

/**
 * 지금 canonical하게 어느 밤 역할 턴인지를 store state 하나에서만 읽는 순수 함수.
 *
 * 이 파일이 "현재 역할 턴"의 유일한 출처다. 프런트에는 역할 턴을 앞으로 밀 수 있는 커서도
 * 인덱스도 없다 — 안내를 닫는 것으로는 이 함수의 결과가 절대 바뀌지 않고, 결과가 바뀌는
 * 유일한 길은 canonical state(phase/dayIndex/역할 턴)가 서버발 갱신으로 바뀌는 것뿐이다.
 *
 * 판정 순서:
 *   1. NIGHT가 아니면(ROLE_REVEAL·DAY·TRIBUNAL·ENDED) 역할 턴 자체가 없다 → null.
 *   2. canonical state가 역할 턴을 명시하면 그 값만 쓴다(state.nightTurnRole).
 *   3. 명시하지 않으면 그 밤의 시작 턴 하나로 고정한다 — 서버가 밤을 역할별 턴으로 쪼개
 *      진행하지 않기 때문이다(game-core submitNightAction은 NIGHT 구간 내내 자격 있는
 *      역할의 제출을 받는다). 그래서 이 경로에서는 canonical 역할 턴이 그 밤 동안 바뀌지
 *      않고, 안내도 그 한 장에서 더 나아가지 않는다.
 *   4. 어느 경로로 고른 역할이든 그 밤에 행동 불가능하면(day 0의 마녀사냥꾼) null이다 —
 *      canonical하게 건너뛰는 턴은 한 프레임도 뜨지 않는다.
 */
import {
  getInGameOpeningNightTurnRole,
  isInGameAnnounceableNightTurnRole,
} from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

export function selectInGameNightTurnRole(state) {
  if (state === null || typeof state !== "object") return null
  if (state.phase !== "NIGHT") return null

  const dayIndex = state.dayIndex
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

  // 서버가 언젠가 역할 턴을 명시적으로 방송하게 되면 그 값이 그대로 canonical 턴이 된다.
  // 지금의 백엔드 계약에는 이 필드가 없으므로 정상 경로에서는 아래 시작 턴으로 떨어진다.
  const declared = state.nightTurnRole
  if (typeof declared === "string" && declared.length > 0) {
    return isInGameAnnounceableNightTurnRole(declared, dayIndex) ? declared : null
  }

  return getInGameOpeningNightTurnRole(dayIndex)
}

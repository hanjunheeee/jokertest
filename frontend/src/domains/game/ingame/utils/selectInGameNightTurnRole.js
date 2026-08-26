/**
 * 지금 canonical하게 어느 밤 역할 턴인지를 store state 하나에서만 읽는 순수 함수.
 *
 * 이 파일이 "현재 역할 턴"의 유일한 출처이며, 그 용도는 **판정**뿐이다 — 밤 행동 패널의 턴
 * 게이트(useInGameActionPanel)가 이 값을 읽는다. 밤 턴 안내 오버레이와 상태바 문구, 즉 연출은
 * 이 값을 쓰지 않고 selectInGameNightTurnReel이 담당한다. 둘이 갈라져 있는 이유는 이 값이
 * 생존 필터를 거친 서버 커서라 죽은 역할을 건너뛰기 때문이다 — 연출까지 그 값을 따르면
 * "안내가 사라짐 = 그 역할 사망"으로 사망자의 역할이 누출된다.
 *
 * 결과가 바뀌는 유일한 길은 canonical state(phase/dayIndex/역할 턴)가 서버발 갱신으로 바뀌는
 * 것뿐이다 — 안내를 닫거나 연출 릴이 전진하는 것으로는 조금도 움직이지 않는다.
 *
 * 판정 순서:
 *   1. NIGHT가 아니면(ROLE_REVEAL·DAY·TRIBUNAL·ENDED) 역할 턴 자체가 없다 → null.
 *   2. canonical state가 역할 턴을 명시하면 그 값만 쓴다(state.nightTurnRole).
 *   3. 명시하지 않으면 그 밤의 시작 턴 하나로 고정한다 — 서버가 밤을 역할별 턴으로 쪼개
 *      진행하지 않기 때문이다(game-core submitNightAction은 NIGHT 구간 내내 자격 있는
 *      역할의 제출을 받는다). 그래서 이 경로에서는 canonical 역할 턴이 그 밤 동안 바뀌지
 *      않고, 안내도 그 한 장에서 더 나아가지 않는다.
 *   4. 어느 경로로 고른 역할이든 그 밤에 행동 불가능하면(밤 행동이 없는 CITIZEN) null이다 —
 *      canonical하게 건너뛰는 턴은 한 프레임도 뜨지 않는다. 마녀사냥꾼처럼 서버가 그 밤에
 *      턴 자체를 만들지 않는 역할은 애초에 이 함수의 입력으로 오지 않는다.
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

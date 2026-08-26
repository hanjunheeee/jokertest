/**
 * 상단 day/phase 인디케이터(InGameTimebar)에 함께 띄울 "지금 무슨 상태인가" 문구를
 * canonical state 하나에서만 파생하는 순수 함수.
 *
 * 이 함수 자체에는 소켓 구독도 타이머도 없고, 밤 턴 안내 오버레이의 열림/닫힘과는 완전히
 * 무관하다. 그래서 안내를 닫아도 인디케이터의 문구는 그 자리에 그대로 남는다.
 *
 * NIGHT 문구는 새로 만들지 않고 밤 턴 안내가 쓰는 것을 그대로 재사용한다 — 그 턴의 문구는
 * getInGameNightTurnAnnouncement이 유일한 출처다. 어느 역할을 띄울지는 호출부가 연출 릴의
 * 현재 역할을 넘겨주면 그 값을, 넘기지 않으면 canonical 턴(selectInGameNightTurnRole)을 쓴다 —
 * 실제 화면(InGamePage)은 릴을 넘긴다. 역할 보유자가 죽어도 그 역할의 상태바 문구가 사라지지
 * 않아야 하는데(사라지면 그 역할의 사망이 누출된다), canonical 턴은 죽은 역할을 건너뛰기 때문이다.
 */
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

/**
 * canonical state에서 인디케이터 상태 문구를 파생한다(표시할 것이 없으면 null).
 * @param {object|null|undefined} state ingameStore의 서버 세션 미러(state.phase·dayIndex·nightTurnRole)
 * @param {string|null} [nightTurnRoleOverride] NIGHT 문구를 만들 연출 역할(밤 턴 안내 훅의
 *   statusRole). 유효한 문자열이 아니면 기존대로 canonical 턴에서 파생한다.
 * @flow NIGHT면 override(있으면)나 canonical 역할 턴의 안내 문구를 재사용하고, DAY/TRIBUNAL은
 *   고정 문구를 쓰며, ENDED·ROLE_REVEAL·알 수 없는 phase는 null이다. NIGHT인데 고를 역할이
 *   없으면(CITIZEN처럼 밤 행동이 없어 건너뛰는 턴 · 무효한 dayIndex) 문구를 지어내지 않고
 *   null이다. 서버가 턴을 지목하지 않은 밤은 "턴 없음"이 아니라 그 밤의 시작 턴이다.
 */
export function selectInGameTimebarStatusMessage(state, nightTurnRoleOverride = null) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  if (state.phase === "NIGHT") {
    const role =
      typeof nightTurnRoleOverride === "string" && nightTurnRoleOverride.length > 0
        ? nightTurnRoleOverride
        : selectInGameNightTurnRole(state)
    return getInGameNightTurnAnnouncement(role, state.dayIndex)?.message ?? null
  }

  if (state.phase === "DAY") return INGAME_TIMEBAR_DAY_STATUS_MESSAGE
  if (state.phase === "TRIBUNAL") return INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE

  // ENDED·ROLE_REVEAL과 알 수 없는 phase는 문구를 붙이지 않는다 — 인디케이터의 기존 표시
  // ("제 N일" + phase 아이콘)만 그대로 남는다.
  return null
}

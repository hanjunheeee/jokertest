/**
 * 지금 canonical하게 어느 밤 역할 턴인지를 store state 하나에서만 읽는 순수 함수.
 *
 * 이 파일이 "현재 역할 턴"의 유일한 출처다. 첫 용도는 **판정**이다 — 밤 행동 패널의 턴
 * 게이트(useInGameActionPanel)가 이 값을 읽는다.
 *
 * 연출(밤 턴 안내 오버레이·상태바 문구)은 이 값을 **상한으로만** 읽는다
 * (computeInGameNightTurnReelBarrier). 릴 커서는 이 값이 놓인 칸을 넘지 못하되, 릴의
 * **구성원**은 여전히 selectInGameNightTurnReel이 생사와 무관하게 정한다. 이 구분이 핵심이다 —
 * 이 값은 생존 필터를 거친 서버 커서라 죽은 역할을 건너뛰므로, 이것을 구성원으로 쓰는 순간
 * "안내가 사라짐 = 그 역할 사망"으로 사망자의 역할이 누출된다. 상한으로만 쓰면 죽은 역할의
 * 칸은 릴에 그대로 남아 한 번 재생된 뒤 지나가고, 살아있는 역할의 칸은 그 역할의 제출 전까지
 * 넘어가지 않는다.
 *
 * 결과가 바뀌는 유일한 길은 canonical state(phase/dayIndex/역할 턴)가 서버발 갱신으로 바뀌는
 * 것뿐이다 — 안내를 닫거나 연출 릴이 전진하는 것으로는 조금도 움직이지 않는다.
 *
 * 판정 순서:
 *   1. NIGHT가 아니면(ROLE_REVEAL·DAY·TRIBUNAL·ENDED) 역할 턴 자체가 없다 → null.
 *   2. canonical state가 역할 턴을 명시하면 그 값만 쓴다(state.nightTurnRole).
 *   3. 명시하지 않으면 그 밤의 시작 턴 하나로 고정한다 — 서버는 밤에 들어갈 때 첫 턴을 따로
 *      방송하지 않고, 어느 역할의 제출이 그 역할의 턴을 끝냈을 때만 night_turn_changed를
 *      보내기 때문이다(backend/socket/gameSession.js). 그래서 그 밤의 첫 방송이 오기 전까지는
 *      이 폴백이 canonical 턴이고, 재접속 스냅샷도 이 경로로 떨어진다(스냅샷 payload에는 역할
 *      턴이 실리지 않는다 — applySessionSnapshot).
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

  // night_turn_changed 방송이 store에 반영해 둔 값이 있으면 그것이 그대로 canonical 턴이다
  // (ingameStore.applyNightTurnChanged). 그 밤의 첫 방송 전에는 없으므로 아래 시작 턴으로
  // 떨어진다.
  const declared = state.nightTurnRole
  if (typeof declared === "string" && declared.length > 0) {
    return isInGameAnnounceableNightTurnRole(declared, dayIndex) ? declared : null
  }

  return getInGameOpeningNightTurnRole(dayIndex)
}

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
 *
 * 다만 릴이 **전진하는 속도**는 canonical 턴을 상한으로 따른다
 * (computeInGameNightTurnReelBarrier). 구성과 전진은 다른 축이다: 죽은 역할의 칸은 릴에서
 * 빠지지 않고(그 사실이 비밀), canonical이 그 칸을 건너뛴 결과로 커서가 그 칸을 한 박자 만에
 * 통과할 뿐이다. 보유자가 살아있는 역할의 칸에서는 그 역할의 제출로 canonical이 움직이기
 * 전까지 커서가 멈춘다.
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

/**
 * 릴 커서가 지금 도달할 수 있는 마지막 칸(상한)을 돌려준다 — 커서는 이 칸을 넘지 못한다.
 *
 * 보유자가 살아있는 역할의 턴은 그 역할의 제출이 서버에 닿아 canonical 턴이 움직이기 전까지
 * 절대 넘어가지 않는다는 뜻이다(제출 기반 진행). 반대로 보유자가 전원 사망한 역할은 서버가
 * 그 턴을 건너뛴 canonical을 방송하므로 상한이 그 칸 너머로 뛰고, 중간 칸은 릴에 그대로
 * 남은 채 고정 리듬으로 한 번 재생된 뒤 지나간다 — 이것이 은폐의 유일한 시간 기반 진행이다.
 *
 * @param {string[]|null|undefined} reelRoles 그 밤의 연출 릴(selectInGameNightTurnReel의 결과)
 * @param {string|null|undefined} canonicalTurnRole 지금 canonical 역할 턴
 *   (selectInGameNightTurnRole의 결과)
 * @flow 릴이 배열이 아니거나 비면 0이다. canonical 역할이 비어있지 않은 문자열이고 릴에 있으면
 *   그 인덱스를 돌려준다. 릴에 없으면(구성·시신 판단이 서버와 잠깐 어긋난 창) 마지막 칸을
 *   상한으로 삼는다 — 진행 불능으로 상태바를 첫 역할에 얼려두는 것보다 안전한 열화다.
 * @returns {number} 항상 [0, max(길이-1, 0)] 범위의 정수
 */
export function computeInGameNightTurnReelBarrier(reelRoles, canonicalTurnRole) {
  if (!Array.isArray(reelRoles) || reelRoles.length === 0) return 0

  if (typeof canonicalTurnRole === "string" && canonicalTurnRole.length > 0) {
    const index = reelRoles.indexOf(canonicalTurnRole)
    if (index >= 0) return index
  }

  return reelRoles.length - 1
}

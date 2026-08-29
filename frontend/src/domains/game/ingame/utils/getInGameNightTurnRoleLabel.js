/**
 * 밤 역할 턴을 상태바에 적을 한글 표기로 바꾼다(모르는 역할이면 null).
 *
 * 표기는 안내 문구 사전(INGAME_NIGHT_TURN_ANNOUNCEMENTS) 하나에서만 유도한다 — 상태바가
 * 별도 매핑을 들고 있으면 안내 오버레이는 "광대의 시간입니다"라고 하는데 상태바는 다른 이름을
 * 띄우는 어긋남이 생긴다.
 *
 * dayIndex를 받지 않는다. "그 밤에 행동 가능한가"는 지금 어느 턴인지를 고르는 단계
 * (selectInGameNightTurnRole)에서 이미 끝난 판정이고, 여기까지 온 역할은 화면에 그리기로
 * 결정된 역할이다.
 */
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

export function getInGameNightTurnRoleLabel(role) {
  if (typeof role !== "string" || role.length === 0) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role)?.label ?? null
}

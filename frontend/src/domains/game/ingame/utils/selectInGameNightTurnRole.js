/**
 * 지금 canonical하게 어느 밤 역할 턴인지를 store state 하나에서만 읽는 순수 함수.
 *
 * 이 파일이 "현재 역할 턴"의 유일한 출처다. 프런트에는 역할 턴을 앞으로 밀 수 있는 커서도
 * 인덱스도 없다 — 안내를 닫는 것으로는 이 함수의 결과가 절대 바뀌지 않고, 결과가 바뀌는
 * 유일한 길은 canonical state(phase/dayIndex/역할 턴)가 서버발 갱신으로 바뀌는 것뿐이다.
 *
 * NIGHT여도 night_turn_started가 아직 오지 않았거나 night_turn_ended가 도착한 뒤라면 null이다.
 * 시작 역할을 로컬에서 추정하지 않으며 서버가 명시한 알려진 role만 반환한다.
 */
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

export function selectInGameNightTurnRole(state) {
  if (state === null || typeof state !== "object") return null
  if (state.phase !== "NIGHT") return null

  const dayIndex = state.dayIndex
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

  const declared = state.nightTurnRole
  return typeof declared === "string" && KNOWN_NIGHT_TURN_ROLES.has(declared) ? declared : null
}

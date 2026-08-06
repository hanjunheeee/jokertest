/**
 * DAY/NIGHT 진입 연출의 scope·identity 계산(순수 함수).
 *
 * buildInGameNightTurnAnnouncementIdentity와 같은 관례를 쓴다 — scope에 현재 소켓 세대(epoch)를
 * 포함하는 것까지 같다. 소켓 교체·재연결(connect)마다 세대가 올라가고, 세대가 바뀌면 그때까지
 * 대기·표시 중이던 연출과 아직 도착하지 않은 콜백은 전부 무효가 된다.
 *
 *  - scope    = "어느 게임을, 어느 계정으로, 어느 소켓 세대에서 보고 있는가"
 *               셋 중 하나라도 바뀌면 그 세대의 대기열·표시 상태를 통째로 버린다.
 *  - identity = scope + phase + dayIndex
 *               "계정 uuid + gameId + dayIndex + DAY|NIGHT + 소켓 세대" 하나당 정확히 한 번만
 *               연출한다는 규칙의 키이며, 늦게 도착한 확인·타이머 콜백이 자기 연출의 것인지
 *               확인하는 데도 쓴다(이전 identity의 콜백은 불일치로 무시된다).
 *
 * DAY/NIGHT가 아닌 phase(ROLE_REVEAL·TRIBUNAL·ENDED)에서는 identity가 null이다 — 진입 연출
 * 자체가 존재하지 않는 구간이라는 뜻이다.
 */

const ENTRANCE_PHASES = new Set(["DAY", "NIGHT"])

/** 연출 scope 문자열. 유효하지 않은 입력이면 null(연출 없음). */
export function buildInGamePhaseEntranceScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

/** scope + phase + dayIndex identity. scope가 없거나 진입 연출 대상 phase가 아니면 null. */
export function buildInGamePhaseEntranceIdentity(scope, phase, dayIndex) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!ENTRANCE_PHASES.has(phase)) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  return `${scope}|${phase}|${dayIndex}`
}

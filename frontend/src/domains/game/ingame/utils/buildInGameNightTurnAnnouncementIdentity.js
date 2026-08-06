/**
 * 밤 역할 턴 안내의 scope·identity 계산(순수 함수).
 *
 * buildInGamePhaseEntranceIdentity와 같은 관례를 쓴다:
 *
 *  - scope    = "어느 게임을, 어느 계정으로, 어느 소켓 세대에서 보고 있는가"
 *               셋 중 하나라도 바뀌면(다른 계정·다른 게임·소켓 교체/재연결) 그 세대의
 *               대기·표시 상태를 통째로 버리고, 아직 도착하지 않은 콜백도 전부 무효가 된다.
 *  - identity = scope + dayIndex + canonical 역할 턴
 *               "계정 uuid + gameId + dayIndex + 역할 턴 + 소켓 세대" 하나당 정확히 한 번만
 *               안내한다는 규칙의 키다. 늦게 도착한 타이머·클릭 콜백이 자기 안내의 것인지
 *               확인하는 데도 쓴다(이전 identity의 콜백은 불일치로 아무 일도 하지 않는다).
 *
 * 역할 턴이 없는 구간(NIGHT가 아니거나 canonical하게 건너뛰는 턴)에서는 identity가 null이다.
 */

/** 안내 scope 문자열. 유효하지 않은 입력이면 null(안내 없음). */
export function buildInGameNightTurnAnnouncementScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

/** scope + dayIndex + 역할 턴 identity. 셋 중 하나라도 없으면 null. */
export function buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, role) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  if (typeof role !== "string" || role.length === 0) return null
  return `${scope}|${dayIndex}|${role}`
}

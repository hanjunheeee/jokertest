/**
 * get_session_snapshot ack 응답(또는 실패)이 도착한 시점에 그 결과를 store에 반영해도 되는지
 * 판정한다. isStaleRoleRevealAckResponse의 캡처-후-재확인 관례를 반복 요청(매 connect epoch마다)에
 * 맞게 확장해, mounted 여부 외에 epoch version・gameId・인증 계정 uuid・socket 참조 네 축을
 * 각각 독립적으로 재확인한다 — 어느 하나라도 요청 시점과 응답 시점이 다르면 stale로 간주한다.
 */
export function isStaleSessionSnapshotAckResponse({
  mounted,
  requestEpochVersion,
  currentEpochVersion,
  requestGameId,
  currentGameId,
  requestAuthUuid,
  currentAuthUuid,
  requestSocket,
  currentSocket,
}) {
  if (!mounted) return true
  if (requestEpochVersion !== currentEpochVersion) return true
  if (requestGameId !== currentGameId) return true
  if (requestAuthUuid !== currentAuthUuid) return true
  if (requestSocket !== currentSocket) return true
  return false
}

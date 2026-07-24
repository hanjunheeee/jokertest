/**
 * role-reveal ack 응답(또는 실패)이 도착한 시점에 그 결과를 UI에 반영해도 되는지 판정한다.
 * useMatchingRoom의 isStaleResponse 관례(요청 시점 값 캡처 → 응답 시점 재확인)와 동일한
 * 조건 집합을 순수 함수로 뽑아, React 렌더링 없이 node:test로 검증할 수 있게 한다.
 */
export function isStaleRoleRevealAckResponse({
  mounted,
  requestVersion,
  currentVersion,
  requestSocket,
  currentSocket,
  requestGameId,
  currentGameId,
}) {
  if (!mounted) return true
  if (requestVersion !== currentVersion) return true
  if (requestSocket !== currentSocket) return true
  if (!requestSocket?.connected) return true
  if (currentGameId !== requestGameId) return true
  return false
}

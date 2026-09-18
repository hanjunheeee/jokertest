/**
 * get_session_snapshot ack 응답(또는 실패)이 도착한 시점에 그 결과를 store에 반영해도 되는지
 * 판정한다. isStaleRoleRevealAckResponse의 캡처-후-재확인 관례를 반복 요청(매 connect epoch마다)에
 * 맞게 확장해, mounted 여부 외에 각 신원 축을 **독립적으로** 재확인한다 — 어느 하나라도 요청
 * 시점과 응답 시점이 다르면 stale로 간주한다.
 *
 * F-23(AC-05/AC-06): 축이 네 개로는 부족했다. 다음 세 전이는 기존 네 값이 전부 같은 채로
 * 일어나므로, 옛 응답이 지금 화면을 되돌릴 수 있었다:
 *
 *   - 계정 A→B→A: uuid가 원래대로 돌아온다. **전이 횟수**(identityGeneration)만 그 구간을 드러낸다.
 *   - 같은 판의 소속 교체(이탈→재입장, 추방→재입장): gameId·계정·소켓이 그대로다.
 *     내 **소속 식별자**(membershipId)만 달라진다.
 *   - 같은 Socket 객체의 재연결: 객체 동일성은 유지되고 **id만** 바뀐다.
 *
 * 세 축은 createLeaveGameSessionRequest가 이미 쓰는 것과 **같은 신원 축**이다(두 흐름이 같은
 * 늦은 응답을 두고 경합하므로 판정 기준이 갈리면 한쪽만 통과한다).
 *
 * 전달되지 않은 축은 양쪽 모두 undefined라 항상 같다 — 옛 호출부를 깨지 않는다.
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
  requestIdentityGeneration,
  currentIdentityGeneration,
  requestMembershipId,
  currentMembershipId,
  requestSocketId,
  currentSocketId,
}) {
  if (!mounted) return true
  if (requestEpochVersion !== currentEpochVersion) return true
  if (requestGameId !== currentGameId) return true
  if (requestAuthUuid !== currentAuthUuid) return true
  if (requestSocket !== currentSocket) return true
  if (requestIdentityGeneration !== currentIdentityGeneration) return true
  if (requestMembershipId !== currentMembershipId) return true
  if (requestSocketId !== currentSocketId) return true
  return false
}

/**
 * 도착한 채팅 메시지를 지금 상태에 반영해도 되는지 판정한다(순수 함수).
 *
 * 세 개의 독립적인 관문을 모두 통과해야 한다:
 *   1. 인증 계정 — 지금 로그인된 계정이 있어야 한다. 로그아웃·계정 무효화 직후 도착한
 *      메시지는 소유자가 없는 상태로 흘러들 수 없다(fail-closed). 실제 소유자 일치 검사는
 *      reducer가 상태의 신원과 대조해 한 번 더 한다.
 *   2. gameId — 메시지의 gameId가 지금 실제로 유효한 gameId와 정확히 같아야 한다(이전 게임의
 *      늦게 도착한 메시지를 새 게임 화면에 섞지 않는다).
 *   3. 채널 — 메시지가 온 채널이 canonical self.alive에서 유도된 현재 보기 채널과 같아야 한다.
 *      서버가 이미 수신자를 생존/사망으로 나눠 보내지만, 사망이 확정되기 직전에 발송된 공개
 *      메시지가 사망 직후에 도착하는 경합에서도 사망자 화면에 공개 메시지가 남지 않도록
 *      클라이언트도 같은 규칙을 독립적으로 적용한다(그 반대도 마찬가지).
 *
 * 현재 채널을 아직 모르면(null — 생존 여부 미확정) 어떤 메시지도 받지 않는다(fail-closed).
 */
export function shouldAcceptGameChatMessage({
  messageChannel,
  messageGameId,
  currentGameId,
  currentAuthUuid,
  currentViewChannel,
}) {
  if (typeof currentAuthUuid !== "string" || currentAuthUuid.length === 0) return false
  if (typeof currentGameId !== "string" || currentGameId.length === 0) return false
  if (typeof messageGameId !== "string" || messageGameId.length === 0) return false
  if (messageGameId !== currentGameId) return false
  if (!currentViewChannel) return false
  return messageChannel === currentViewChannel
}

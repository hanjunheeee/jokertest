/**
 * network 모델(parseJokerChatBroadcastPayload의 결과)을 UI 모델로 변환한다.
 * getPlayerById가 null/undefined를 반환하면(현재 GameSession 참가자가 아님) 메시지를
 * 폐기한다(null 반환) — 낙관적 fallback 이름을 붙이지 않는다.
 */
export function toJokerChatUiMessage(networkMessage, getPlayerById) {
  const canonicalPlayer = getPlayerById?.(networkMessage.senderUuid)
  if (!canonicalPlayer) return null

  return {
    id: networkMessage.id,
    playerId: networkMessage.senderUuid,
    senderName: canonicalPlayer.nickname,
    text: networkMessage.text,
    sentAt: networkMessage.sentAt,
  }
}

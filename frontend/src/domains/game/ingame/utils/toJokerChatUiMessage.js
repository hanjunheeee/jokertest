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

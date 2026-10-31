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

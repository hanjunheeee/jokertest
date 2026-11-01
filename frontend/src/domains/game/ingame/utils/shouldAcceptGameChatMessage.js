// 낮 채팅 메시지 받을지 판단: 지금 판 것이고 지금 보는 채널일 때만
// 낮 채팅 받기(attachGameChatListener)가 사용

// 받을 메시지인지 (로그인·지금 판·지금 보는 채널 기준)
export function shouldAcceptGameChatMessage({
  messageChannel,
  messageGameId,
  currentGameId,
  currentAuthUuid,
  currentViewChannel,
}) {
  // 로그인 계정·지금 판이 있어야 함
  if (typeof currentAuthUuid !== "string" || currentAuthUuid.length === 0) return false
  if (typeof currentGameId !== "string" || currentGameId.length === 0) return false
  // 다른 판 메시지면 버림
  if (typeof messageGameId !== "string" || messageGameId.length === 0) return false
  if (messageGameId !== currentGameId) return false
  // 지금 보는 채널 메시지만
  if (!currentViewChannel) return false
  return messageChannel === currentViewChannel
}

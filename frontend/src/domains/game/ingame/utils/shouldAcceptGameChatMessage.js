// 낮·죽은 사람 채팅 메시지 받을지 판단: 지금 판 것이고 지금 받아 둘 채널일 때만
// 낮 채팅 받기(attachGameChatListener)가 사용

// 받을 메시지인지 (로그인·지금 판·지금 보는 채널 기준, 받아 둘 채널 목록이 있으면 그 목록 기준)
export function shouldAcceptGameChatMessage({
  messageChannel,
  messageGameId,
  currentGameId,
  currentAuthUuid,
  currentViewChannel,
  currentReadChannels = null,
}) {
  // 로그인 계정·지금 판이 있어야 함
  if (typeof currentAuthUuid !== "string" || currentAuthUuid.length === 0) return false
  if (typeof currentGameId !== "string" || currentGameId.length === 0) return false
  // 다른 판 메시지면 버림
  if (typeof messageGameId !== "string" || messageGameId.length === 0) return false
  if (messageGameId !== currentGameId) return false
  // 지금 보는 채널 메시지만 (죽은 사람은 죽은 사람 채널 + 낮 채널)
  if (!currentViewChannel) return false
  if (Array.isArray(currentReadChannels)) return currentReadChannels.includes(messageChannel)
  return messageChannel === currentViewChannel
}

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

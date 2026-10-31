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
  requestMembershipEpoch,
  currentMembershipEpoch,
  requestSocketEpoch,
  currentSocketEpoch,
  requestSocketConnected,
  currentSocketConnected,
}) {
  if (!mounted) return true
  if (requestEpochVersion !== currentEpochVersion) return true
  if (requestGameId !== currentGameId) return true
  if (requestAuthUuid !== currentAuthUuid) return true
  if (requestSocket !== currentSocket) return true
  if (requestIdentityGeneration !== currentIdentityGeneration) return true
  if (requestMembershipId !== currentMembershipId) return true
  if (requestSocketId !== currentSocketId) return true
  if (requestMembershipEpoch !== currentMembershipEpoch) return true
  if (requestSocketEpoch !== currentSocketEpoch) return true
  if (requestSocketConnected !== currentSocketConnected) return true
  return false
}

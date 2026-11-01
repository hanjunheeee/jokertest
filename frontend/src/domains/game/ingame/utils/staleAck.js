// 늦게 온 소켓 응답인지 보기 (요청 때 값과 지금 값이 하나라도 다르면 버림)
// 직업 공개·밤 행동·밤 판정·낮 토론·채팅 훅과 스냅샷 동기화가 사용

// 화면·요청 차례·소켓·연결·판이 그대로인지 봄
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

// 스냅샷 응답용: 판·계정·신원 세대·참가 기록·소켓 세대까지 봄
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

export function createLeaveGameSessionRequest({
  getSocket,
  getCurrentGameId,
  getCurrentAccountId = () => null,
  getCurrentMembershipId = () => null,
  getIdentityGeneration = () => null,
  finalize,
  onFailure,
}) {
  return () => {
    const socket = getSocket()
    if (!socket) return false

    const requestedGameId = getCurrentGameId()
    if (!requestedGameId) return false
    const requestedAccountId = getCurrentAccountId()
    const requestedMembershipId = getCurrentMembershipId()
    const requestedIdentityGeneration = getIdentityGeneration()
    const requestedSocketId = socket?.id ?? null

    socket.emit("leave_game_session", { gameId: requestedGameId }, (response) => {
      if (getCurrentGameId() !== requestedGameId) return
      if (getCurrentAccountId() !== requestedAccountId) return
      if (getIdentityGeneration() !== requestedIdentityGeneration) return
      if (getSocket() !== socket) return
      if ((socket?.id ?? null) !== requestedSocketId) return
      if (getCurrentMembershipId() !== requestedMembershipId) return
      if (response?.ok) {
        finalize()
        return
      }
      onFailure?.(response)
    })
    return true
  }
}

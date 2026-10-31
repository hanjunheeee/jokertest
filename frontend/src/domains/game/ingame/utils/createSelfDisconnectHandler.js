export function createSelfDisconnectHandler({
  getActiveSocket,
  registeredSocket,
  registeredGameId,
  getCurrentGameId,
  finalize,
}) {
  return () => {
    if (getActiveSocket() !== registeredSocket) return
    if (getCurrentGameId() !== registeredGameId) return
    finalize()
  }
}

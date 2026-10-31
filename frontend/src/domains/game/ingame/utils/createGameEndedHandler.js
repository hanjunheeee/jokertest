export function createGameEndedHandler({ getCurrentGameId, finalize }) {
  return (payload) => {
    if (!payload || payload.gameId !== getCurrentGameId()) return
    finalize()
  }
}

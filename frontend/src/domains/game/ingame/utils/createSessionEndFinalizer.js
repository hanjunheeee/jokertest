export function createSessionEndFinalizer({ clearGame, clearRoom, navigate }) {
  return () => {
    clearGame()
    clearRoom()
    navigate("/multiplay", { replace: true })
  }
}

/** 실제 소켓에 밤 턴 시작·종료 리스너를 한 쌍으로 등록하고 같은 참조로 해제한다. */
export function attachNightTurnSocketListeners(socket, { onStarted, onEnded }) {
  if (!socket || typeof socket.on !== "function" || typeof socket.off !== "function") return () => {}
  if (typeof onStarted !== "function" || typeof onEnded !== "function") return () => {}

  socket.on("night_turn_started", onStarted)
  socket.on("night_turn_ended", onEnded)

  return () => {
    socket.off("night_turn_started", onStarted)
    socket.off("night_turn_ended", onEnded)
  }
}

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

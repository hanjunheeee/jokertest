// 점검 신호 받기: maintenance_notice, 점검으로 판 끝남(game_ended MAINTENANCE), 점검으로 대기방 닫힘(room_deleted MAINTENANCE)
// 점검 안내 훅이 씀, 판·방 화면의 원래 처리기와 따로 붙음 (원래 처리는 그대로 돎)

// 점검 이유가 아닌 판 끝·방 닫힘은 안 건드림
const isMaintenanceEnd = (payload) => payload?.reason === "MAINTENANCE"
const isMaintenanceClose = (payload) => payload?.code === "MAINTENANCE"

// h: { notice(payload), gameEnded(payload), roomClosed(payload) } → 떼는 함수
export function onMaintenanceSignals(socket, h) {
  const gameEnded = (payload) => {
    if (isMaintenanceEnd(payload)) h.gameEnded(payload)
  }
  const roomClosed = (payload) => {
    if (isMaintenanceClose(payload)) h.roomClosed(payload)
  }
  socket.on("maintenance_notice", h.notice)
  socket.on("game_ended", gameEnded)
  socket.on("room_deleted", roomClosed)
  return () => {
    socket.off("maintenance_notice", h.notice)
    socket.off("game_ended", gameEnded)
    socket.off("room_deleted", roomClosed)
  }
}

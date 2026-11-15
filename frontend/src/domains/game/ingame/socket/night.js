// 밤 소켓: 밤 차례 받기, 밤 행동 보내기 (차례는 다 고르면 서버가 5초 뒤 닫음)
// 밤 행동 훅·스냅샷 동기화·session.js 묶음이 사용
import { listen } from "./connection.js"

// 밤 차례 시작·끝 받기 (소켓·손잡이가 모자라면 아무것도 안 붙임)
export function onNightTurn(socket, { onStarted, onEnded }) {
  if (!socket || typeof socket.on !== "function" || typeof socket.off !== "function") return () => {}
  if (typeof onStarted !== "function" || typeof onEnded !== "function") return () => {}

  socket.on("night_turn_started", onStarted)
  socket.on("night_turn_ended", onEnded)

  return () => {
    socket.off("night_turn_started", onStarted)
    socket.off("night_turn_ended", onEnded)
  }
}

// 밤 차례 시작 받기 (스냅샷 충돌 감시용)
export function onNightNotices(socket, onTurnStart) {
  return listen(socket, "night_turn_started", onTurnStart)
}

// 밤 행동 대상 보내기 (응답 기다림)
export function emitNightAction(socket, ms, gameId, targetId) {
  return socket.timeout(ms).emitWithAck("submit_night_action", { gameId, targetId })
}

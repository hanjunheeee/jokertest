// 밤 소켓: 밤 차례·판정 받기, 밤 행동·판정 요청·성공 연출 확인 보내기
// 밤 관련 훅과 스토어의 성공 연출 확인이 사용
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

// 밤 차례 끝만 받기
export const onNightTurnEnded = (socket, fn) => listen(socket, "night_turn_ended", fn)

// 연출 대기 알림·차례 시작 받기 (스냅샷 충돌 감시용)
export function onNightNotices(socket, onWait, onTurnStart) {
  socket.on("night_presentation_wait", onWait)
  socket.on("night_turn_started", onTurnStart)
  return () => {
    socket.off("night_presentation_wait", onWait)
    socket.off("night_turn_started", onTurnStart)
  }
}

// 밤 판정 세 사건 받기 (판정 끝·개인 결과·결과 적용)
export function onNightResolve(socket, { onResolved, onResult, onApplied }) {
  socket.on("night_actions_resolved", onResolved)
  socket.on("night_action_result", onResult)
  socket.on("night_result_applied", onApplied)
  return () => {
    socket.off("night_actions_resolved", onResolved)
    socket.off("night_action_result", onResult)
    socket.off("night_result_applied", onApplied)
  }
}

// 밤 행동 대상 보내기 (응답 기다림)
export function emitNightAction(socket, ms, gameId, targetId) {
  return socket.timeout(ms).emitWithAck("submit_night_action", { gameId, targetId })
}

// 밤 판정 요청 (응답 기다림)
export function emitResolveNight(socket, ms, gameId) {
  return socket.timeout(ms).emitWithAck("resolve_night", { gameId })
}

// 밤 성공 연출 다 봤다고 알림 (응답은 콜백으로 받음)
export function emitNightSuccessAck(socket, payload, onAck) {
  socket.emit("acknowledge_night_action_success", payload, onAck)
}

// 밤 소켓: 밤 차례·판정 받기, 밤 행동·판정 요청 보내기
// 밤 훅·스냅샷 동기화·session.js 묶음이 사용
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
// 연출 대기 알림은 없어짐 → 첫 손잡이는 받지 않음 (부르는 쪽이 아직 두 개를 넘겨 자리만 둠)
export function onNightNotices(socket, _onWait, onTurnStart) {
  return listen(socket, "night_turn_started", onTurnStart)
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

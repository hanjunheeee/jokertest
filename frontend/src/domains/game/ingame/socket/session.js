// 판 진행 소켓: 공개 사건 받기 묶음, 스냅샷 묻기, 판 나가기·역할 확인·이모지 보내기
// 판 진행 이벤트 훅·스냅샷 동기화·나가기·추방 확인·역할 확인·이모지 훅이 사용
import { onNightTurn } from "./night.js"

// 판 진행 공개 사건과 받을 손잡이 이름 (등록 순서 그대로 둠)
const SESSION_EVENTS = [
  ["game_ended", "gameEnded"],
  ["party_matching_room_ready", "partyRoomReady"],
  ["emoji_shown", "emojiShown"],
  ["player_eliminated", "playerEliminated"],
  ["session_participation_changed", "participationChanged"],
  ["session_self_progress", "selfProgress"],
  ["game_kicked", "gameKicked"],
  ["room_kicked", "roomKicked"],
  ["account_cache_invalidated", "cacheInvalidated"],
  ["game_phase_changed", "phaseChanged"],
  ["night_result_applied", "nightResultApplied"],
  ["night_action_result", "nightActionResult"],
  ["night_action_success", "nightActionSuccess"],
  ["night_presentation_wait", "nightPresentationWait"],
  ["day_vote_resolved", "dayVoteResolved"],
  ["day_phase_changed", "dayPhaseChanged"],
  ["tribunal_vote_resolved", "tribunalVoteResolved"],
]

// 판 진행 공개 사건 받기
// 밤 차례 둘을 먼저 붙이고, 끌 때는 밤 차례를 재판 판정 바로 앞에서 끔 (원래 순서 유지)
export function onSessionEvents(socket, h) {
  const offNightTurn = onNightTurn(socket, { onStarted: h.nightTurnStarted, onEnded: h.nightTurnEnded })
  for (const [event, key] of SESSION_EVENTS) socket.on(event, h[key])
  return () => {
    for (const [event, key] of SESSION_EVENTS.slice(0, -1)) socket.off(event, h[key])
    offNightTurn()
    socket.off("tribunal_vote_resolved", h.tribunalVoteResolved)
  }
}

// 사망 공개 두 사건 받기 (밤 결과 적용·재판 판정)
export function onDeathResults(socket, onNight, onTribunal) {
  socket.on("night_result_applied", onNight)
  socket.on("tribunal_vote_resolved", onTribunal)
  return () => {
    socket.off("night_result_applied", onNight)
    socket.off("tribunal_vote_resolved", onTribunal)
  }
}

// 스냅샷 한 번 묻기 (응답은 콜백으로 받음)
export function askSnapshot(socket, gameId, onAck) {
  socket.emit("get_session_snapshot", { gameId }, onAck)
}

// 스냅샷 묻기 (응답 기다림, 판 id 없으면 빈 요청으로 내 판 찾기)
export function fetchSnapshot(socket, ms, gameId) {
  return socket.timeout(ms).emitWithAck("get_session_snapshot", gameId ? { gameId } : {})
}

// 판 나가기 요청 (응답은 콜백으로 받음)
export function emitLeave(socket, gameId, onAck) {
  socket.emit("leave_game_session", { gameId }, onAck)
}

// 역할 확인 알림 (응답 기다림)
export function emitRoleRevealAck(socket, ms, gameId) {
  return socket.timeout(ms).emitWithAck("acknowledge_role_reveal", { gameId })
}

// 이모지 보내기 (응답 기다림, 시간 제한 없음)
export function emitEmoji(socket, payload) {
  return socket.emitWithAck("send_emoji", payload)
}

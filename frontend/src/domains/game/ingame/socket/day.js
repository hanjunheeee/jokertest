// 낮 소켓: 토론 준비·투표 보내기 (판정 결과는 session.js 묶음이 받음)
// 낮 행동 훅(준비·투표)이 사용, 판정은 표가 다 차면 서버가 5초 뒤 스스로 함

// 토론 끝, 투표 준비됐다고 보내기 (응답 기다림)
export function emitReady(socket, ms, gameId) {
  return socket.timeout(ms).emitWithAck("ready_for_day_vote", { gameId })
}

// 낮 투표 보내기 (시간 제한은 부르는 쪽 컨트롤러가 맡음)
export function emitDayVote(socket, payload) {
  return socket.emitWithAck("cast_day_vote", payload)
}

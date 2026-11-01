// 재판 소켓: 재판 판정 받기, 재판 투표·판정 요청 보내기
// 재판 컨트롤러·추방 연출 훅이 사용
import { listen } from "./connection.js"

// 재판 판정 결과 받기
export const onTribunalResolved = (socket, fn) => listen(socket, "tribunal_vote_resolved", fn)

// 재판 투표 보내기 (시간 제한은 컨트롤러 타이머가 맡음)
export function emitTribunalVote(socket, gameId, dayIndex, vote) {
  return socket.emitWithAck("cast_tribunal_vote", { gameId, dayIndex, vote })
}

// 재판 판정 요청 (시간 제한은 컨트롤러 타이머가 맡음)
export function emitResolveTribunal(socket, gameId, dayIndex) {
  return socket.emitWithAck("resolve_tribunal_vote", { gameId, dayIndex })
}

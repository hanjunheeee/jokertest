// 낮 소켓: 투표 판정 받기, 토론 준비·투표·투표 판정 요청 보내기
// 낮 행동 훅(준비·투표)과 행동 패널의 판정 훅(useDayVoteResolve)이 사용
import { listen } from "./connection.js"

// 낮 투표 판정 결과 받기
export const onDayVoteResolved = (socket, fn) => listen(socket, "day_vote_resolved", fn)

// 토론 끝, 투표 준비됐다고 보내기 (응답 기다림)
export function emitReady(socket, ms, gameId) {
  return socket.timeout(ms).emitWithAck("ready_for_day_vote", { gameId })
}

// 낮 투표 보내기 (시간 제한은 부르는 쪽 컨트롤러가 맡음)
export function emitDayVote(socket, payload) {
  return socket.emitWithAck("cast_day_vote", payload)
}

// 낮 투표 판정 요청 (응답 기다림)
export function emitResolveDayVote(socket, ms, gameId, dayIndex) {
  return socket.timeout(ms).emitWithAck("resolve_day_vote", { gameId, dayIndex })
}

// 추방 소켓: 대기방 추방 요청과 결과 조회 보내기 (응답 기한 있음)
// 추방 요청 훅·결과 조회가 사용 (판 안 추방은 기능을 뺌), 사건 이름 묶음은 useKickPlayerRequest가 다시 내보냄
import { KICK_ACK_TIMEOUT_MS, KICK_NO_RESPONSE } from "../constants/ingameKick.js"

// 추방 사건 이름 (대기방 추방·결과 조회)
export const KICK_EVENTS = Object.freeze({
  ROOM: "kick_room_player",
  RESULT: "get_kick_result",
})

// 응답을 한 번만 넘기고, 기한 안에 안 오면 "응답 없음" 답으로 넘김 (응답 없이 보내는 중에 멈추지 않게)
function withAckDeadline(onAck) {
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    onAck(KICK_NO_RESPONSE)
  }, KICK_ACK_TIMEOUT_MS)
  return (response) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    onAck(response)
  }
}

// 대기방 추방 요청
export function emitKick(socket, request, onAck) {
  socket.emit(KICK_EVENTS.ROOM, request, withAckDeadline(onAck))
}

// 지난 추방 요청 결과 묻기
export function emitKickResult(socket, bootEpoch, requestId, onAck) {
  socket.emit(KICK_EVENTS.RESULT, { bootEpoch, requestId }, withAckDeadline(onAck))
}

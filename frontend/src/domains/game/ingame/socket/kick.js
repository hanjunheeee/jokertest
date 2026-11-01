// 추방 소켓: 방·판 추방 요청과 결과 조회 보내기
// 추방 요청 훅·결과 조회가 사용, 사건 이름 묶음은 useKickPlayerRequest가 다시 내보냄

// 추방 사건 이름 (방 추방·판 추방·결과 조회)
export const KICK_EVENTS = Object.freeze({
  ROOM: "kick_room_player",
  GAME: "kick_game_player",
  RESULT: "get_kick_result",
})

// 추방 요청 (판 안이면 판 추방, 아니면 방 추방)
export function emitKick(socket, scope, request, onAck) {
  socket.emit(scope === "GAME" ? KICK_EVENTS.GAME : KICK_EVENTS.ROOM, request, onAck)
}

// 지난 추방 요청 결과 묻기
export function emitKickResult(socket, bootEpoch, requestId, onAck) {
  socket.emit(KICK_EVENTS.RESULT, { bootEpoch, requestId }, onAck)
}

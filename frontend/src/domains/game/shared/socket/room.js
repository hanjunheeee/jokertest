// 방 만들기 요청·지금 내 방 묻기·로비 입장 알리기
// 방 만들기는 setup createRoomRequest, 내 방 묻기는 그것과 결과 화면 "대기방으로" 훅, 로비 입장은 useLobbyEntryCleanup이 씀
import {
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "../constants/gameSetupSocket.js"

// 지금 내 방 묻기 (방 만들기 응답을 못 받았을 때 방이 생겼는지 확인하는 데도 씀)
export const askRoom = (socket) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})

// 방 만들기 (게임 설정 화면만 씀, 판 끝 뒤엔 서버가 같은 방을 다시 열어 결과 화면은 안 씀)
export const createRoom = (socket, settings) =>
  socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, settings)

// 로비 입장 알리기 (서버가 끝난 판·대기방 자리·처리 중 입장·매칭 줄을 지움, 판 중 산 사람이면 판으로 가라고 답)
// 시간 제한 없이 보냄: 연결 전이면 모아 뒀다 붙을 때 보내서, 이 화면에서 뒤에 누른 입장 요청보다 늘 먼저 감
export const enterLobby = (socket, onAck) => socket.emit("enter_lobby", {}, onAck)

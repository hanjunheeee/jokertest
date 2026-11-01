// 방 만들기 요청·지금 내 방 묻기
// hooks/useCreateRoom이 씀
import {
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "../constants/gameSetupSocket.js"

// 지금 내 방 묻기 (방 만들기 응답을 못 받았을 때 방이 생겼는지 확인)
export const askRoom = (socket) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})

// 방 만들기
export const createRoom = (socket, settings) =>
  socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, settings)

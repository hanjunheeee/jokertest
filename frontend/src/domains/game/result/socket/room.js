// 결과 화면에서 대기방으로 돌아갈 때 보내는 요청: 지금 내 방·방 만들기·판 상태 묻기
// hooks/useGameResultReturnToMatching이 씀
import {
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "@/domains/game/setup/constants/gameSetupSocket.js"

// 지금 내 방 묻기
export const askRoom = (socket) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})

// 방장: 다음 판 방 만들기
export const createRoom = (socket, payload) =>
  socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, payload)

// 끝난 판 id를 모를 때 판 상태 묻기
export const askSnapshot = (socket) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck("get_session_snapshot", {})

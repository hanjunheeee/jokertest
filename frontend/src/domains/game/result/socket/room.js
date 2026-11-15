// 결과 화면에서 같은 방(대기방)으로 돌아가기 보내기·끝난 판 상태 묻기
// hooks/useGameResultReturnToMatching이 씀 (지금 내 방 묻기는 game/shared/socket/room.js)
import {
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
} from "@/domains/game/shared/constants/gameSetupSocket.js"

// 같은 방으로 돌아가기 (답에 방 내용, 거절이면 { ok: false, code, message }), 방 넣기라 방 만들기와 같은 시간 기다림
export const returnToRoom = (socket, gameId) =>
  socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck("return_to_room", { gameId })

// 끝난 판 상태 묻기 (결과 화면 닫힘 시각을 모를 때, 판 id 모르면 빈 요청으로 내 판 찾기)
export const askSnapshot = (socket, gameId = null) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck("get_session_snapshot", gameId ? { gameId } : {})

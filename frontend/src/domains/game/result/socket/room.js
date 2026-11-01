// 결과 화면에서 대기방으로 돌아갈 때 끝난 판 상태 묻기
// hooks/useGameResultReturnToMatching이 씀 (방 묻기·만들기는 game/shared/socket/room.js)
import { CURRENT_ROOM_TIMEOUT_MS } from "@/domains/game/shared/constants/gameSetupSocket.js"

// 끝난 판 id를 모를 때 판 상태 묻기
export const askSnapshot = (socket) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck("get_session_snapshot", {})

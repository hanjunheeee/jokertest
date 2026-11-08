// 빠른 매칭 줄 서기·빠지기 보내기
// hooks/useMatchmakingSearch가 씀
import { getSocket } from "@/shared/socket/socketClient"

// 줄 서기 (소켓 있는지는 부르는 쪽이 먼저 봄)
export const joinQueue = (socket) => socket.emit("join_matchmaking")

// 줄 빠지기: 지금 소켓이 있을 때만
export const leaveQueue = () => getSocket()?.emit("leave_matchmaking")

// 줄 서기 거절 받기 (빠른 매칭 꺼짐·입장 거절), 끊는 함수 돌려줌
export function onQueueRefused(socket, refused) {
  socket.on("matchmaking_disabled", refused)
  socket.on("room_join_failed", refused)
  return () => {
    socket.off("matchmaking_disabled", refused)
    socket.off("room_join_failed", refused)
  }
}

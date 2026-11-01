// 공용 소켓 연결 만들기와 연결 상태(강제 끊김·연결·연결 실패) 받기
// useSocket 훅이 씀, 만든 소켓은 socketClient.js에 넣어 영역 socket/ 함수가 같이 씀
import { io } from "socket.io-client"

// 쿠키 인증으로 웹소켓만 써서 연결
export const connectSocket = (url) =>
  io(url, {
    withCredentials: true,
    transports: ["websocket"],
  })

// 강제 끊김·연결·연결 실패 받기, 끄는 함수 돌려줌 (끌 때는 그 이벤트 손잡이를 전부 지움)
export function onConnection(socket, { forceDisconnect, connect, connectError }) {
  socket.on("force_disconnect", forceDisconnect)
  socket.on("connect", connect)
  socket.on("connect_error", connectError)
  return () => {
    socket.off("force_disconnect")
    socket.off("connect_error")
    socket.off("connect")
  }
}

// 공용 소켓 연결 만들기와 연결 상태(강제 끊김·연결·연결 실패·서버 점검) 받기
// useSocket 훅이 씀, 만든 소켓은 socketClient.js에 넣어 영역 socket/ 함수가 같이 씀
import { io } from "socket.io-client"
import { CONNECTION_SOCKET_EVENTS } from "../constants/connectionSocket.js"

const { FORCE_DISCONNECT, SERVER_SHUTDOWN } = CONNECTION_SOCKET_EVENTS

// 쿠키 인증으로 웹소켓만 써서 연결
export const connectSocket = (url) =>
  io(url, {
    withCredentials: true,
    transports: ["websocket"],
  })

// 강제 끊김·연결·연결 실패·서버 점검 받기, 끄는 함수 돌려줌 (끌 때는 그 이벤트 손잡이를 전부 지움)
// 서버 점검은 안내만 받음: 끊긴 뒤 다시 연결은 socket.io 자동 재접속 그대로
export function onConnection(socket, { forceDisconnect, connect, connectError, serverShutdown }) {
  socket.on(FORCE_DISCONNECT, forceDisconnect)
  socket.on("connect", connect)
  socket.on("connect_error", connectError)
  if (serverShutdown) socket.on(SERVER_SHUTDOWN, serverShutdown)
  return () => {
    socket.off(FORCE_DISCONNECT)
    socket.off("connect_error")
    socket.off("connect")
    socket.off(SERVER_SHUTDOWN)
  }
}

// 공용 소켓 연결 만들기와 연결 상태(강제 끊김·연결·연결 실패·서버 점검) 받기, 접속 거절 WRONG_NODE 따라가기
// useSocket 훅이 씀, 만든 소켓은 socketClient.js에 넣어 영역 socket/ 함수가 같이 씀
import { io } from "socket.io-client"
import {
  CONNECTION_SOCKET_EVENTS,
  NODE_BOUNCE_RETRY_MS,
  NODE_ERROR_CODES,
} from "../constants/connectionSocket.js"
import { clearNodeHint, isNodeId, saveNodeHint } from "./nodeHint.js"

const { FORCE_DISCONNECT, SERVER_SHUTDOWN } = CONNECTION_SOCKET_EVENTS

// 쿠키 인증으로 웹소켓만 써서 연결, Node 힌트가 있을 때만 ?node= 붙임 (단일 서버는 힌트가 없어 예전과 같음)
export const connectSocket = (url, { node = null } = {}) =>
  io(url, {
    withCredentials: true,
    transports: ["websocket"],
    ...(isNodeId(node) ? { query: { node } } : {}),
  })

// 다음 접속이 갈 Node 바꾸기 (null이면 아무 Node), 같은 Socket 객체 그대로 둠
// socket.io는 접속할 때마다 io.opts.query를 읽음 (4.8.1·4.8.3 실측), 처음엔 query 칸이 없어 만들어 넣음
export function pointSocketAtNode(socket, node) {
  const opts = socket?.io?.opts
  if (!opts) return
  if (!opts.query || typeof opts.query !== "object") opts.query = {}
  if (isNodeId(node)) opts.query.node = node
  else delete opts.query.node
}

// 접속 거절이 WRONG_NODE면 알려 준 Node로 다시 붙음
// socket.io는 미들웨어 거절 뒤 스스로 다시 안 붙어서(실측) 여기서 붙여야 함
// 30초에 3번 넘게 튕기면 힌트 버리고 아무 Node로 (한도 넘은 첫 번은 바로, 그 뒤는 5초 쉬고)
// 돌려줌: WRONG_NODE가 아니면 null, 맞으면 다시 붙기 전 기다릴 ms
export function followWrongNode(socket, error, bounces, retryMs = NODE_BOUNCE_RETRY_MS) {
  if (error?.message !== NODE_ERROR_CODES.WRONG_NODE) return null
  const node = error?.data?.node
  const count = bounces.note()
  if (count <= bounces.limit && isNodeId(node)) {
    saveNodeHint(node)
    pointSocketAtNode(socket, node)
    return 0
  }
  clearNodeHint()
  pointSocketAtNode(socket, null)
  return count <= bounces.limit + 1 ? 0 : retryMs
}

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

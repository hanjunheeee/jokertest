// 공용 소켓을 다른 Node로 옮겨 다시 붙이기와 "다른 Node 방" 답 따라가기 (옮긴 뒤 같은 요청 한 번만 다시)
// 방 코드·공개 방 입장 훅, 파티 방 다시 들어가기, 초대 수락 흐름이 씀 (소켓 칸은 socketClient.js 것을 그대로 씀)
import { NODE_ERROR_CODES, NODE_MOVE_TIMEOUT_MS } from "../constants/connectionSocket.js"
import { pointSocketAtNode } from "./connection.js"
import { isNodeId, saveNodeHint } from "./nodeHint.js"
import { getSocket, subscribeSocket } from "./socketClient.js"

// 진행 중 옮기기 { socket, node, promise, fail } (같은 Node로 두 번 부르면 같은 약속을 돌려줌)
let pendingMove = null
let watchingSwap = false

// 공용 소켓이 바뀌면(로그아웃·계정 바뀜) 옛 소켓 옮기기는 실패로 끝냄
function watchSocketSwap() {
  if (watchingSwap) return
  watchingSwap = true
  subscribeSocket(() => {
    if (pendingMove && pendingMove.socket !== getSocket()) pendingMove.fail(new Error("SOCKET_REPLACED"))
  })
}

// 서버 답이 "다른 Node 방"이면 그 Node 이름, 아니면 null
export function nodeToMoveTo(answer) {
  if (answer?.code !== NODE_ERROR_CODES.ROOM_ON_OTHER_NODE) return null
  return isNodeId(answer.node) ? answer.node : null
}

// 지금 소켓을 node로 옮겨 다시 붙음: 같은 Socket 객체에 query만 바꿔 끊고 다시 붙음 (구독자·손잡이 그대로)
// 다시 붙으면(connect) 풀리고, 시간 초과·소켓 바뀜이면 거절
export function moveToNode(node, timeoutMs = NODE_MOVE_TIMEOUT_MS) {
  const socket = getSocket()
  if (!socket) return Promise.reject(new Error("NO_SOCKET"))
  if (!isNodeId(node)) return Promise.reject(new Error("BAD_NODE"))
  if (pendingMove?.socket === socket && pendingMove.node === node) return pendingMove.promise
  if (pendingMove) pendingMove.fail(new Error("MOVE_REPLACED"))
  watchSocketSwap()

  const move = { socket, node }
  move.promise = new Promise((resolve, reject) => {
    let timer = null
    const finish = (error) => {
      clearTimeout(timer)
      socket.off("connect", handleConnect)
      if (pendingMove === move) pendingMove = null
      if (error) reject(error)
      else resolve(socket)
    }
    const handleConnect = () => finish(null)
    move.fail = finish
    timer = setTimeout(() => finish(new Error("NODE_MOVE_TIMEOUT")), timeoutMs)
    socket.on("connect", handleConnect)
  })
  pendingMove = move
  saveNodeHint(node)
  pointSocketAtNode(socket, node)
  socket.disconnect()
  socket.connect()
  return move.promise
}

// 다른 Node 방이라는 답이면 그 Node로 옮긴 뒤 resend 한 번, 옮기기 실패면 fail
// 둘 다 isCurrent()가 참일 때만 부름 (화면 떠남·다른 요청으로 바뀜이면 버림)
// 돌려줌: 옮기기 시작했으면 true (부르는 쪽은 실패 안내를 미룸)
export function followRoomOwner(answer, { isCurrent, resend, fail }) {
  const node = nodeToMoveTo(answer)
  if (!node) return false
  moveToNode(node).then(
    () => { if (isCurrent()) resend() },
    () => { if (isCurrent()) fail() },
  )
  return true
}

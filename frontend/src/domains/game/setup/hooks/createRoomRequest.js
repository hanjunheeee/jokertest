// 방 만들기 요청 한 번 (다른 Node로 옮겨 다시 보내기·거절 알림·응답 못 받으면 생긴 방 찾기)
// useCreateRoom이 씀, 범위 확인·방 들어가기·알림은 훅이 넘겨 줌
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { followRoomOwner, nodeToMoveTo } from "@/shared/socket/nodeMove.js"
import { NODE_MOVE_MESSAGES } from "@/shared/constants/connectionSocket.js"
import {
  CREATE_ROOM_ERROR_MSGS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
} from "../../shared/constants/gameSetupSocket.js"
import { askRoom, createRoom } from "../../shared/socket/room.js"

// 잠깐 기다리기
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 비우는 중인 서버라는 거절이면 알려 준 Node로 옮김 (입장과 같은 함수, MN-114)
// 돌려줌: 옮겼으면 true, 옮기기 실패면 false, 그런 거절 아니면 null
const followCreateNode = (response) => new Promise((resolve) => {
  const moving = followRoomOwner(response, {
    isCurrent: () => true,
    resend: () => resolve(true),
    fail: () => resolve(false),
  })
  if (!moving) resolve(null)
})

// 만들기 응답을 못 받았을 때: 방이 생겼는지 몇 번 물어봄 (서버가 만드는 중이면 기다렸다 다시)
function syncScopeSocket(scope) {
  const socket = getSocket()
  if (!socket) return null
  scope.socket = socket
  scope.socketId = socket.id ?? null
  return socket
}

async function recoverRoom(scope, { isCurrent, enterRoom, showError }) {
  const socket = syncScopeSocket(scope) ?? scope?.socket ?? null
  if (!socket || !isCurrent(scope)) {
    showError(CREATE_ROOM_ERROR_MSGS.NETWORK)
    return
  }

  for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
    if (!isCurrent(scope)) return
    try {
      const res = await askRoom(socket)
      if (!isCurrent(scope)) return

      if (res?.ok && res.room) {
        enterRoom(res.room, scope)
        return
      }

      if (res?.ok && res.pending) {
        await wait(CURRENT_ROOM_POLL_INTERVAL_MS)
        continue
      }

      break
    } catch {
      break
    }
  }

  showError(CREATE_ROOM_ERROR_MSGS.NETWORK)
}

// 방 만들기 보내고 결과 처리, 응답 못 받으면 생긴 방 찾기로 넘어감
// 끝나면 내 요청이 마지막 요청일 때만 release (만드는 중 표시 끔)
// 돌려줌: entered=대기방으로 넣음, failed=거절·복구 실패, aborted=범위 바뀜·취소
export async function runCreate(socket, settings, scope, { scopeRef, isCurrent, enterRoom, showError, release }) {
  const liveSocket = () => syncScopeSocket(scope) ?? getSocket() ?? socket
  let outcome = "aborted"
  try {
    let response = await createRoom(liveSocket(), settings)
    // 그사이 계정·소켓·소속이 바뀌었으면 응답 버림
    if (!isCurrent(scope)) return outcome

    // 다른 Node로 가라는 답이면 옮긴 뒤 한 번만 다시 보냄 (옮기면 소켓 id가 바뀌어 범위에 새로 적음)
    const moved = await followCreateNode(response)
    if (moved !== null) {
      if (scopeRef.current !== scope) return outcome
      syncScopeSocket(scope)
      if (moved && isCurrent(scope)) response = await createRoom(liveSocket(), settings)
      if (!isCurrent(scope)) return outcome
    }

    // 서버가 거절하면 이유 알림 (옮긴 뒤에도 또 옮기라면 옮기기 실패 안내)
    if (!response.ok) {
      showError(nodeToMoveTo(response) || moved === false ? NODE_MOVE_MESSAGES.ROOM_ON_OTHER_NODE : response.message)
      outcome = "failed"
      return outcome
    }

    enterRoom(response.room, scope)
    outcome = "entered"
  } catch {
    // 응답 못 받으면 방이 생겼는지 찾기
    if (!isCurrent(scope)) return outcome
    await recoverRoom(scope, { isCurrent, enterRoom, showError })
    outcome = useMatchingStore.getState().isInRoom ? "entered" : "failed"
  } finally {
    // 내 요청이 마지막 요청일 때만 만드는 중 표시 끔
    if (scopeRef.current === scope) release()
  }
  return outcome
}

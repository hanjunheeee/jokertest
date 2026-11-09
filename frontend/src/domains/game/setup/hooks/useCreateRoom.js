// 방 만들기 요청과 응답 못 받았을 때 생긴 방 찾기
// hooks/useGameSetupPage가 씀
// 요청 때 계정·소켓·소속 범위를 잡아 두고(createRoomScope), 응답 올 때 하나라도 바뀌었으면 그 응답은 버림
// 요청 한 번 흐름(Node 옮기기·생긴 방 찾기)은 createRoomRequest
import { useEffect, useRef, useState } from "react"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { CREATE_ROOM_ERROR_MSGS } from "../../shared/constants/gameSetupSocket.js"
import { leaveRoom } from "../../matching/socket/room.js"
import { captureScope, isScopeCurrent } from "./createRoomScope.js"
import { runCreate } from "./createRoomRequest.js"

// 화면 살아 있는지 표시
function useMountedRef() {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  return mountedRef
}

// 방 들어가기: 끝난 판 지우고 방 넣고 대기방으로
// 그사이 화면을 떠났으면 방을 안 넣고 서버 방에서 나감 (딴 화면에 있는데 방에 묶이지 않게)
function enterOrLeave(room, mountedRef, navigate) {
  if (!mountedRef.current) {
    leaveRoom()
    return
  }
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().setRoom(room)
  navigate("/game-matching")
}

// 방 만들기 상태·동작
export function useCreateRoom({ navigate, accountId, identityGeneration }) {
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false)
  const mountedRef = useMountedRef()

  // 화면을 떠났으면 알림 안 띄움
  const showError = (message) => {
    if (!mountedRef.current) return
    alert(message ?? CREATE_ROOM_ERROR_MSGS.NETWORK)
  }

  // 요청 범위: 마지막 요청 하나만 살아 있음
  const scopeRef = useRef(null)
  const isCurrent = (scope) => isScopeCurrent(scopeRef, scope)

  // 방 들어가기: 범위가 바뀌었으면 안 들어감
  const enterRoom = (room, scope = null) => {
    if (scope !== null && !isCurrent(scope)) return
    enterOrLeave(room, mountedRef, navigate)
  }

  // 만드는 중 표시 끔 (마지막 요청이 끝날 때)
  const release = () => {
    scopeRef.current = null
    creatingRef.current = false
    if (mountedRef.current) setIsCreating(false)
  }

  // 방 만들기: 연타 막고, 소켓 없으면 연결 문제 안내
  const createGame = async (settings) => {
    if (creatingRef.current) return
    const socket = getSocket()
    if (!socket) {
      showError(CREATE_ROOM_ERROR_MSGS.NETWORK)
      return
    }

    creatingRef.current = true
    setIsCreating(true)
    const scope = captureScope(socket, accountId, identityGeneration)
    scopeRef.current = scope
    await runCreate(socket, settings, scope, { scopeRef, isCurrent, enterRoom, showError, release })
  }

  // isBusy: 지금 만드는 중인지 (뒤로 가기 확인용)
  return { isCreating, createGame, isBusy: () => creatingRef.current }
}

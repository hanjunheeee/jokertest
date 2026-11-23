// 방 만들기 요청과 응답 못 받았을 때 생긴 방 찾기
// hooks/useGameSetupPage가 씀
// 요청 때 계정·소켓·소속 범위를 잡아 두고(createRoomScope), 응답 올 때 하나라도 바뀌었으면 그 응답은 버림
// 요청 한 번 흐름(Node 옮기기·생긴 방 찾기)은 createRoomRequest
import { useCallback, useEffect, useRef, useState } from "react"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { clearRejoinGameId } from "@/domains/game/shared/utils/partyMatchingRejoin.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { CREATE_ROOM_ERROR_MSGS } from "../../shared/constants/gameSetupSocket.js"
import { askRoom } from "../../shared/socket/room.js"
import { captureScope, isScopeCurrent } from "./createRoomScope.js"
import { runCreate } from "./createRoomRequest.js"
import { traceMatchingFlow } from "@/domains/game/matching/debug/matchingFlowTrace.js"

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

// 방 만들기 성공 후 대기방으로 (마운트 여부와 무관 — StrictMode 정리 타이밍에도 서버·스토어 맞춤)
function enterAfterCreate(room, navigate) {
  useInGameStore.getState().clearGame()
  clearRejoinGameId(useAuthStore.getState().user?.uuid)
  const store = useMatchingStore.getState()
  store.setRoom(room)
  store.markLocalRoomTrust()
  traceMatchingFlow("create_enter_matching", {
    roomId: useMatchingStore.getState().roomId,
    isInRoom: useMatchingStore.getState().isInRoom,
    trustUntil: useMatchingStore.getState().roomLocalTrustUntil,
  })
  queueMicrotask(() => navigate("/game-matching", { replace: true }))
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
    enterAfterCreate(room, navigate)
  }

  // 만드는 중 화면을 나가면 범위만 끊어 응답이 와도 대기방으로 안 감
  const abandonScope = useCallback(() => {
    scopeRef.current = null
  }, [])

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
    const outcome = await runCreate(socket, settings, scope, { scopeRef, isCurrent, enterRoom, showError, release })

    // enterAfterCreate가 이미 이동 예약함; 스토어만 채워진 경우만 한 번 더
    if (outcome === "entered") return
    if (useMatchingStore.getState().isInRoom) {
      queueMicrotask(() => navigate("/game-matching", { replace: true }))
      return
    }
    // 응답은 못 받았는데 서버에 방만 있는 경우
    if (outcome !== "failed") {
      const afterSocket = getSocket()
      if (!afterSocket) return
      try {
        const res = await askRoom(afterSocket)
        if (res?.ok && res.room) enterAfterCreate(res.room, navigate)
      } catch {
        // runCreate 쪽에서 이미 안내함
      }
    }
  }

  const isBusy = useCallback(() => creatingRef.current, [])

  return { isCreating, createGame, isBusy, abandonScope }
}

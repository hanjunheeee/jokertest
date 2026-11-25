// 방 만들기 요청과 응답 못 받았을 때 생긴 방 찾기
// hooks/useGameSetupPage가 씀
// 요청 때 계정·소켓·소속 범위를 잡아 두고(createRoomScope), 응답 올 때 하나라도 바뀌었으면 그 응답은 버림
// 요청 한 번 흐름(Node 옮기기·생긴 방 찾기)은 createRoomRequest
import { useCallback, useEffect, useRef, useState } from "react"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { CREATE_ROOM_ERROR_MSGS } from "../../shared/constants/gameSetupSocket.js"
import { askRoom } from "../../shared/socket/room.js"
import { leaveRoom } from "../../matching/socket/room.js"
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

// 방 들어가기: 끝난 판 지우고 방 넣고 대기방으로 (서버 확인 전 잠깐 목록으로 안 튕기게 로컬 방을 믿음)
// 그사이 화면을 떠났으면 방을 안 넣고 서버 방에서 나감 (딴 화면에 있는데 방에 묶이지 않게)
function enterOrLeave(room, mountedRef, navigate) {
  if (!mountedRef.current) {
    leaveRoom()
    return
  }
  useInGameStore.getState().clearGame()
  const store = useMatchingStore.getState()
  store.setRoom(room)
  store.markLocalRoomTrust()
  traceMatchingFlow("create_enter_matching", {
    roomId: useMatchingStore.getState().roomId,
    isInRoom: useMatchingStore.getState().isInRoom,
    trustUntil: useMatchingStore.getState().roomLocalTrustUntil,
  })
  // 설정 화면을 기록에 남김 (대기방에서 뒤로 가면 게임 설정 화면, replace 하면 로비로 감)
  queueMicrotask(() => navigate("/game-matching"))
}

// 방 만들기 상태·동작
export function useCreateRoom({ navigate, accountId, identityGeneration }) {
  const [isCreating, setIsCreating] = useState(false)
  // 마지막 실패 까닭 글 (화면 안내 띠가 그림, 다시 누르면 지움)
  const [createError, setCreateError] = useState(null)
  const creatingRef = useRef(false)
  const mountedRef = useMountedRef()

  // 화면을 떠났으면 알림 안 띄움
  // 알림 창만 띄우면 닫은 뒤 까닭(탈주 대기 등)이 안 남고 화면 읽기가 못 읽어서 화면 글로도 남김
  const showError = (message) => {
    if (!mountedRef.current) return
    const text = message ?? CREATE_ROOM_ERROR_MSGS.NETWORK
    setCreateError(text)
    alert(text)
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
    setCreateError(null)
    const scope = captureScope(socket, accountId, identityGeneration)
    scopeRef.current = scope
    const outcome = await runCreate(socket, settings, scope, { scopeRef, isCurrent, enterRoom, showError, release })

    // enterOrLeave가 이미 이동 예약함; 스토어만 채워진 경우만 한 번 더
    // 화면을 떠났거나 계정이 바뀌었으면 아무것도 안 함 (딴 화면·딴 계정을 대기방으로 끌고 가지 않게)
    if (outcome === "entered") return
    if (!mountedRef.current) return
    if ((useAuthStore.getState().user?.uuid ?? null) !== accountId) return
    if (useMatchingStore.getState().isInRoom) {
      queueMicrotask(() => navigate("/game-matching"))
      return
    }
    // 응답은 못 받았는데 서버에 방만 있는 경우 (재연결로 소켓 id만 바뀌어 범위가 끊긴 때 등)
    if (outcome !== "failed") {
      const afterSocket = getSocket()
      if (!afterSocket) return
      try {
        const res = await askRoom(afterSocket)
        if ((useAuthStore.getState().user?.uuid ?? null) !== accountId) return
        if (res?.ok && res.room) enterOrLeave(res.room, mountedRef, navigate)
      } catch {
        // runCreate 쪽에서 이미 안내함
      }
    }
  }

  // isBusy: 지금 만드는 중인지 (뒤로 가기 확인용)
  const isBusy = useCallback(() => creatingRef.current, [])

  return {
    isCreating, createGame, isBusy,
    createError, dismissCreateError: () => setCreateError(null),
  }
}

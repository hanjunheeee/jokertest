// 방 만들기 요청과 응답 못 받았을 때 생긴 방 찾기
// hooks/useGameSetupPage가 씀
// 요청 때 계정·소켓·소속 범위를 잡아 두고, 응답 올 때 하나라도 바뀌었으면 그 응답은 버림
import { useEffect, useRef, useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import {
  CREATE_ROOM_ERROR_MESSAGES,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
} from "../constants/gameSetupSocket.js"
import { isSameScope, readScope } from "../utils/membershipScope.js"
import { askRoom, createRoom } from "../socket/room.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function useCreateRoom({ navigate, accountId, identityGeneration }) {
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 화면을 떠났으면 알림 안 띄움
  const showError = (message) => {
    if (!mountedRef.current) return
    alert(message ?? CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  // 요청 범위: 마지막 요청 하나만 살아 있음
  const scopeRef = useRef(null)
  const captureScope = (socket) => ({
    token: {},
    accountId,
    identityGeneration,
    socket,
    socketId: socket?.id ?? null,
    membership: readScope(),
  })

  // 잡아 둔 범위가 지금도 그대로인지
  const isCurrent = (scope) => {
    if (scope === null || scopeRef.current !== scope) return false
    const auth = useAuthStore.getState()
    if ((auth.user?.uuid ?? null) !== scope.accountId) return false
    if (auth.identityGeneration !== scope.identityGeneration) return false
    const socket = getSocket()
    if (socket !== scope.socket) return false
    if ((socket?.id ?? null) !== scope.socketId) return false
    return isSameScope(readScope(), scope.membership)
  }

  // 방 들어가기: 끝난 판 지우고 방 넣고 대기방으로
  const enterRoom = (room, scope = null) => {
    if (scope !== null && !isCurrent(scope)) return
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room)
    if (!mountedRef.current) return
    navigate("/game-matching")
  }

  // 만들기 응답을 못 받았을 때: 방이 생겼는지 몇 번 물어봄 (서버가 만드는 중이면 기다렸다 다시)
  const recoverRoom = async (scope) => {
    const socket = scope?.socket ?? null
    if (!socket || !isCurrent(scope)) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
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

    showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  // 방 만들기: 연타 막고, 응답 못 받으면 생긴 방 찾기로 넘어감
  const createGame = async (settings) => {
    if (creatingRef.current) return
    const socket = getSocket()
    if (!socket) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    creatingRef.current = true
    setIsCreating(true)
    const scope = captureScope(socket)
    scopeRef.current = scope

    try {
      const response = await createRoom(socket, settings)
      if (!isCurrent(scope)) return

      if (!response.ok) {
        showError(response.message)
        return
      }

      enterRoom(response.room, scope)
    } catch {
      if (!isCurrent(scope)) return
      await recoverRoom(scope)
    } finally {
      // 내 요청이 마지막 요청일 때만 만드는 중 표시 끔
      if (scopeRef.current === scope) {
        scopeRef.current = null
        creatingRef.current = false
        if (mountedRef.current) setIsCreating(false)
      }
    }
  }

  return { isCreating, createGame, isBusy: () => creatingRef.current }
}

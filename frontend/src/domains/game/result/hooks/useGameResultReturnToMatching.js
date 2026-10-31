import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useNextRoomSettingsStore } from "@/domains/game/setup/store/nextRoomSettingsStore.js"
import {
  CREATE_ROOM_ERROR_MESSAGES,
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "@/domains/game/setup/constants/gameSetupSocket.js"
import { resolveNextGameCreateRoomPayload } from "@/domains/game/setup/utils/resolveNextGameCreateRoomPayload.js"
import { persistPartyRejoinGameId } from "@/domains/game/matching/utils/partyMatchingRejoin.js"
import { getSocket } from "@/shared/socket/socketClient.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function useGameResultReturnToMatching() {
  const navigate = useNavigate()
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)
  const [isReturning, setIsReturning] = useState(false)
  const inFlightRef = useRef(false)

  const recoverCurrentRoom = async (socket) => {
    for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const res = await socket
          .timeout(CURRENT_ROOM_TIMEOUT_MS)
          .emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})
        if (res?.ok && res.room) return res.room
        if (res?.ok && res.pending) {
          await wait(CURRENT_ROOM_POLL_INTERVAL_MS)
          continue
        }
        break
      } catch {
        break
      }
    }
    return null
  }

  const requestReturnToMatching = useCallback(async () => {
    if (inFlightRef.current) return

    const socket = getSocket()
    if (!socket || !accountId) {
      window.alert(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    const ingame = useInGameStore.getState()
    const hostUuid = ingame.hostUuid ?? ingame.state?.hostUuid ?? null
    const endedGameId = ingame.gameId ?? ingame.state?.id ?? null
    const isHost = hostUuid === accountId

    inFlightRef.current = true
    setIsReturning(true)
    try {
      let room = null
      try {
        const res = await socket
          .timeout(CURRENT_ROOM_TIMEOUT_MS)
          .emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})
        if (res?.ok && res.room) room = res.room
      } catch {
      }

      useInGameStore.getState().clearGame()

      if (room) {
        useMatchingStore.getState().setRoom(room)
        navigate("/game-matching", { replace: true })
        return
      }

      if (isHost) {
        const payload = resolveNextGameCreateRoomPayload(accountId, readRestoreSource)
        try {
          const response = await socket
            .timeout(CREATE_ROOM_TIMEOUT_MS)
            .emitWithAck(SOCKET_EVENTS.CREATE_ROOM, payload)
          if (response?.ok && response.room) {
            useMatchingStore.getState().setRoom(response.room)
            navigate("/game-matching", { replace: true })
            return
          }
          if (response?.ok === false && response.message) {
            window.alert(response.message)
            return
          }
        } catch {
        }

        const recovered = await recoverCurrentRoom(socket)
        if (recovered) {
          useMatchingStore.getState().setRoom(recovered)
          navigate("/game-matching", { replace: true })
          return
        }

        window.alert(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
        return
      }

      let partyGameId = typeof endedGameId === "string" && endedGameId.length > 0
        ? endedGameId
        : null
      if (!partyGameId) {
        try {
          const snapshot = await socket
            .timeout(CURRENT_ROOM_TIMEOUT_MS)
            .emitWithAck("get_session_snapshot", {})
          if (typeof snapshot?.gameId === "string" && snapshot.gameId.length > 0) {
            partyGameId = snapshot.gameId
          }
        } catch {
        }
      }
      if (partyGameId) persistPartyRejoinGameId(accountId, partyGameId)
      navigate("/game-matching", {
        replace: true,
        state: {
          awaitRoomAfterGameResult: true,
          ...(partyGameId ? { endedGameId: partyGameId } : {}),
        },
      })
    } finally {
      inFlightRef.current = false
      setIsReturning(false)
    }
  }, [accountId, navigate, readRestoreSource])

  return { requestReturnToMatching, isReturning }
}

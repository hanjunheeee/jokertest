/**
 * F-24: 게임 결과 화면 → 매칭 대기실 복귀.
 *
 * 게임이 끝나면 서버가 참가자 전원을 대기방 registry에서 내리므로, 단순히 /game-matching으로
 * 이동하면 get_current_room이 null → onRoomDeleted → /multiplay로 튕긴다. 방장은 F-24
 * 복원 원본(또는 유지 해제 시 기본값)으로 create_room을 보낸 뒤 매칭으로 들어가고, 비방장은
 * 방이 없어도 매칭 화면에 머문다(방장이 새 방을 만들 때까지).
 */
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
        // timeout은 "방 없음"이 아니다 — 방장 재생성 경로로 이어진다.
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
          // ack 유실 — 서버에 방이 만들어졌을 수 있다.
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
          // 스냅샷 실패 — 매칭 화면 폴링이 서버에서 gameId를 다시 묻는다.
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

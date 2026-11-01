// 결과 화면 "대기방으로" 버튼: 방이 남아 있으면 그 방으로, 방장은 다음 판 방을 만들고, 참가자는 방장 방을 기다리러 감
// GameResultPage가 씀
import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useNextRoomSettingsStore } from "@/domains/game/setup/store/nextRoomSettingsStore.js"
import {
  CREATE_ROOM_ERROR_MSGS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
} from "@/domains/game/shared/constants/gameSetupSocket.js"
import { resolveNextGameCreateRoomPayload } from "@/domains/game/setup/utils/resolveNextGameCreateRoomPayload.js"
import { persistRejoinGameId } from "@/domains/game/shared/utils/partyMatchingRejoin.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { askRoom, createRoom } from "@/domains/game/shared/socket/room.js"
import { askSnapshot } from "../socket/room.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 방 만들기 응답을 못 받았을 때: 방이 생겼는지 몇 번 물어봄 (서버가 만드는 중이면 기다렸다 다시)
const findRoom = async (socket) => {
  for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      const res = await askRoom(socket)
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

export function useGameResultReturnToMatching() {
  const navigate = useNavigate()
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)
  const [isReturning, setIsReturning] = useState(false)
  const inFlightRef = useRef(false)

  const requestReturnToMatching = useCallback(async () => {
    if (inFlightRef.current) return

    const socket = getSocket()
    if (!socket || !accountId) {
      window.alert(CREATE_ROOM_ERROR_MSGS.NETWORK)
      return
    }

    // 끝난 판의 방장·판 id (판 정보를 지우기 전에 읽어 둠)
    const ingame = useInGameStore.getState()
    const hostUuid = ingame.hostUuid ?? ingame.state?.hostUuid ?? null
    const endedGameId = ingame.gameId ?? ingame.state?.id ?? null
    const isHost = hostUuid === accountId

    inFlightRef.current = true
    setIsReturning(true)
    try {
      // 이미 방에 들어가 있으면 그 방으로
      let room = null
      try {
        const res = await askRoom(socket)
        if (res?.ok && res.room) room = res.room
      } catch {
        // 응답이 없으면 방이 없다고 보고 아래 경로로 넘어감
      }

      useInGameStore.getState().clearGame()

      if (room) {
        useMatchingStore.getState().setRoom(room)
        navigate("/game-matching", { replace: true })
        return
      }

      // 방장: 유지한 설정(없으면 기본값)으로 다음 판 방 만들기
      if (isHost) {
        const payload = resolveNextGameCreateRoomPayload(accountId, readRestoreSource)
        try {
          const response = await createRoom(socket, payload)
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
          // 응답을 못 받으면 방이 생겼는지 아래에서 다시 물음
        }

        const recovered = await findRoom(socket)
        if (recovered) {
          useMatchingStore.getState().setRoom(recovered)
          navigate("/game-matching", { replace: true })
          return
        }

        window.alert(CREATE_ROOM_ERROR_MSGS.NETWORK)
        return
      }

      // 참가자: 끝난 판 id를 기억하고 방장 방 기다리러 감 (모르면 서버에 물음)
      let partyGameId = typeof endedGameId === "string" && endedGameId.length > 0
        ? endedGameId
        : null
      if (!partyGameId) {
        try {
          const snapshot = await askSnapshot(socket)
          if (typeof snapshot?.gameId === "string" && snapshot.gameId.length > 0) {
            partyGameId = snapshot.gameId
          }
        } catch {
          // 판 id를 못 받으면 기억 없이 대기방으로 감
        }
      }
      if (partyGameId) persistRejoinGameId(accountId, partyGameId)
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

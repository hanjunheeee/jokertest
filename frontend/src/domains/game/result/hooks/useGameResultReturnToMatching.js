// 결과 화면 "대기방으로" 버튼: 방이 남아 있으면 그 방으로, 방장은 다음 판 방을 만들고, 참가자는 방장 방을 기다리러 감
// GameResultPage가 씀(모바일 결과 화면도 같음)
// 끝난 판 나가기(leave_game_session)는 안 보냄: 서버가 끝난 판 나가기 때 대기방 정리·다음 방 알림 문맥까지 지워 파티 방이 깨지기 때문 (known 1-16)
import { useCallback, useEffect, useRef, useState } from "react"
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

// 잠깐 기다리기
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 방 만들기 응답을 못 받았을 때: 방이 생겼는지 몇 번 물어봄 (서버가 만드는 중이면 기다렸다 다시)
const findRoom = async (socket, isCurrent) => {
  for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
    if (!isCurrent()) return null
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

// 이미 들어가 있는 방 묻기 (응답 없으면 방 없다고 봄)
const askCurrentRoom = async (socket) => {
  try {
    const res = await askRoom(socket)
    return res?.ok && res.room ? res.room : null
  } catch {
    return null
  }
}

// 방장: 유지한 설정(없으면 기본값)으로 다음 판 방 만들기, 거절이면 { message }
const createNextRoom = async (socket, accountId, readRestoreSource, isCurrent) => {
  const payload = resolveNextGameCreateRoomPayload(accountId, readRestoreSource)
  try {
    const response = await createRoom(socket, payload)
    if (response?.ok && response.room) return { room: response.room }
    if (response?.ok === false && response.message) return { message: response.message }
  } catch {
    // 응답을 못 받으면 방이 생겼는지 아래에서 다시 물음
  }
  const recovered = await findRoom(socket, isCurrent)
  return recovered ? { room: recovered } : { message: CREATE_ROOM_ERROR_MSGS.NETWORK }
}

// 참가자: 끝난 판 id 알아내기 (모르면 서버에 물음, 못 받으면 null)
const resolvePartyGameId = async (socket, endedGameId) => {
  if (typeof endedGameId === "string" && endedGameId.length > 0) return endedGameId
  try {
    const snapshot = await askSnapshot(socket)
    if (typeof snapshot?.gameId === "string" && snapshot.gameId.length > 0) return snapshot.gameId
  } catch {
    // 판 id를 못 받으면 기억 없이 대기방으로 감
  }
  return null
}

// 대기방으로 돌아가기 상태·동작
export function useGameResultReturnToMatching() {
  const navigate = useNavigate()
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)
  const [isReturning, setIsReturning] = useState(false)
  const inFlightRef = useRef(false)
  // 화면을 떠났으면 늦게 온 응답으로 대기방에 끌고 가지 않음
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 대기방으로 버튼 누름 (누르는 중이면 무시)
  const requestReturnToMatching = useCallback(async () => {
    if (inFlightRef.current) return

    const socket = getSocket()
    // 소켓·계정 없으면 연결 문제 안내
    if (!socket || !accountId) {
      window.alert(CREATE_ROOM_ERROR_MSGS.NETWORK)
      return
    }
    // 응답 뒤에도 같은 화면·같은 계정일 때만 반영
    const isCurrent = () =>
      mountedRef.current && (useAuthStore.getState().user?.uuid ?? null) === accountId

    // 끝난 판의 방장·판 id
    const ingame = useInGameStore.getState()
    const hostUuid = ingame.hostUuid ?? ingame.state?.hostUuid ?? null
    const endedGameId = ingame.gameId ?? ingame.state?.id ?? null
    const isHost = hostUuid === accountId

    // 방에 들어감: 판 정보는 이때 지움 (실패하면 결과 화면이 그대로 남게)
    const enterRoom = (room) => {
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching", { replace: true })
    }

    inFlightRef.current = true
    setIsReturning(true)
    try {
      // 이미 방에 들어가 있으면 그 방으로
      const room = await askCurrentRoom(socket)
      if (!isCurrent()) return
      if (room) {
        enterRoom(room)
        return
      }

      // 방장: 다음 판 방 만들기, 실패면 이유 알리고 결과 화면에 남음
      if (isHost) {
        const created = await createNextRoom(socket, accountId, readRestoreSource, isCurrent)
        if (!isCurrent()) return
        if (created.room) enterRoom(created.room)
        else window.alert(created.message)
        return
      }

      // 참가자: 끝난 판 id를 기억하고 방장 방 기다리러 감
      const partyGameId = await resolvePartyGameId(socket, endedGameId)
      if (!isCurrent()) return
      if (partyGameId) persistRejoinGameId(accountId, partyGameId)
      useInGameStore.getState().clearGame()
      navigate("/game-matching", {
        replace: true,
        state: {
          awaitRoomAfterGameResult: true,
          ...(partyGameId ? { endedGameId: partyGameId } : {}),
        },
      })
    } finally {
      // 끝나면 누르는 중 표시 풂
      inFlightRef.current = false
      if (mountedRef.current) setIsReturning(false)
    }
  }, [accountId, navigate, readRestoreSource])

  return { requestReturnToMatching, isReturning }
}

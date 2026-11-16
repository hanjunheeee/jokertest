// 결과 화면 떠나기: "대기방으로"(같은 방 코드 대기방으로 바로 들어감)와 결과 화면 180초 닫힘(남은 초·서버가 닫으면 로비로)
// GameResultPage가 씀(모바일 결과 화면 useResultPage도 같음)
// 끝난 판 나가기(leave_game_session)는 안 보냄: 돌아가기 요청 하나로 서버가 방에 넣고 끝난 판에서 뺌
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
} from "@/domains/game/shared/constants/gameSetupSocket.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { askRoom } from "@/domains/game/shared/socket/room.js"
import { leaveRoom } from "@/domains/game/matching/socket/room.js"
import { askSnapshot, returnToRoom } from "../socket/room.js"
import { computeResultSecondsLeft, onResultClosed, readResultClosesAt } from "../socket/resultClose.js"

// "대기방으로" 실패 안내 (서버 거절 코드별, 모르는 코드는 서버 글 → 기본 글)
const RETURN_FAILURE_MESSAGES = Object.freeze({
  ROOM_NOT_FOUND: "대기방이 이미 없어져 돌아갈 수 없습니다. '로비로'를 눌러 주세요.",
  ROOM_FULL: "대기방 정원이 가득 차 들어갈 수 없습니다.",
  KICKED_TOO_MANY_TIMES: "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.",
  RESULT_CLOSED: "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.",
  RESULT_TIMEOUT: "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.",
  SESSION_ENDED: "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.",
  SESSION_NOT_FOUND: "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.",
  NOT_A_PARTICIPANT: "이 판에 남아 있지 않아 대기방으로 돌아갈 수 없습니다.",
  NODE_DRAINING: "서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다.",
})
const RETURN_DEFAULT_MESSAGE = "대기방으로 가지 못했습니다. '대기방으로'를 다시 눌러 주세요."
const RETURN_NO_ANSWER_MESSAGE =
  "서버 답이 없어 대기방으로 가지 못했습니다. 연결을 확인한 뒤 '대기방으로'를 다시 눌러 주세요."
const RETURN_OFFLINE_MESSAGE =
  "연결이 끊겨 대기방으로 가지 못했습니다. 연결을 확인한 뒤 '대기방으로'를 다시 눌러 주세요."
const RETURN_NO_GAME_MESSAGE = "끝난 판을 찾지 못해 대기방으로 갈 수 없습니다. '로비로'를 눌러 주세요."
// SESSION_ENDED인데 결과 화면 시간이 남음(또는 모름) = 끊겨 끝난 판에서 빠진 것 (사용자 결정 2026-11-16 일곱째)
const RETURN_DROPPED_MESSAGE = "연결이 끊겨 이 판에서 빠졌습니다. '로비로'를 눌러 주세요."

// 남은 초 다시 세는 간격 (1초 단위로 보여서 반 초마다 봄)
const RESULT_CLOSE_TICK_MS = 500

// 잠깐 기다리기
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 거절·답 없음 글 고르기 (답이 없으면 undefined로 옴), closesAt = 결과 화면 닫힘 시각(모르면 null)
// 서버는 "결과 화면 시간 지남"과 "끊겨 판에서 빠짐"을 같은 SESSION_ENDED로 줌 → 남은 초가 0일 때만 시간 지남 글
// 예: SESSION_ENDED + 남은 120초 → 끊겨 빠짐 글, 남은 0초 → 시간 지남 글, 닫힘 시각 모름 → 끊겨 빠짐 글
function describeReturnFailure(response, closesAt) {
  if (response === undefined) return RETURN_NO_ANSWER_MESSAGE
  const code = typeof response?.code === "string" ? response.code : null
  if (code === "SESSION_ENDED" && computeResultSecondsLeft(closesAt, Date.now()) !== 0) return RETURN_DROPPED_MESSAGE
  if (code && Object.hasOwn(RETURN_FAILURE_MESSAGES, code)) return RETURN_FAILURE_MESSAGES[code]
  if (typeof response?.message === "string" && response.message.length > 0) return response.message
  return RETURN_DEFAULT_MESSAGE
}

// 돌아가기 답을 못 받았거나 거절됐을 때: 이미 방에 들어가 있는지 몇 번 물어봄 (서버가 넣는 중이면 기다렸다 다시)
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

// 대기방으로 돌아가기 상태·동작 (실패 글은 화면이 버튼 위에 그림)
export function useGameResultReturnToMatching() {
  const navigate = useNavigate()
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const [isReturning, setIsReturning] = useState(false)
  const [returnError, setReturnError] = useState(null)
  const inFlightRef = useRef(false)
  // 화면을 떠났으면 늦게 온 답으로 대기방에 끌고 가지 않음
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 대기방으로 버튼 누름 (누르는 중이면 무시), 방장이든 아니든 같은 요청 하나
  const requestReturnToMatching = useCallback(async () => {
    if (inFlightRef.current) return

    const socket = getSocket()
    if (!socket || !accountId || !socket.connected) {
      setReturnError(RETURN_OFFLINE_MESSAGE)
      return
    }
    const ingame = useInGameStore.getState()
    const gameId = ingame.gameId ?? ingame.state?.id ?? null
    if (typeof gameId !== "string" || gameId.length === 0) {
      setReturnError(RETURN_NO_GAME_MESSAGE)
      return
    }
    // 답 뒤에도 같은 화면·같은 계정일 때만 반영
    const isCurrent = () =>
      mountedRef.current && (useAuthStore.getState().user?.uuid ?? null) === accountId

    // 방에 들어감: 판 정보는 이때 지움 (실패하면 결과 화면이 그대로 남게)
    const enterRoom = (room) => {
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching", { replace: true })
    }

    // 8초 넘어 늦게 온 성공 답: 서버엔 방 자리가 생겼는데 화면은 모름
    // 결과 화면에 그대로 있으면 그 방으로, 떠났으면(로비 등) 방에서 나감 (방 만들기 늦은 답과 같은 방식)
    // 이미 방 화면에 있으면(방 찾기로 들어감) 그대로, 계정이 바뀌었으면 새 계정 방을 건드리지 않게 아무것도 안 함
    const handleLateAnswer = (late) => {
      if (!late?.ok || !late.room) return
      if ((useAuthStore.getState().user?.uuid ?? null) !== accountId) return
      if (useMatchingStore.getState().isInRoom) return
      if (mountedRef.current && !inFlightRef.current) {
        enterRoom(late.room)
        return
      }
      if (!mountedRef.current) leaveRoom()
    }

    inFlightRef.current = true
    setIsReturning(true)
    setReturnError(null)
    try {
      let response
      try {
        response = await returnToRoom(socket, gameId, handleLateAnswer)
      } catch {
        response = undefined
      }
      if (!isCurrent()) {
        // 답을 기다리는 사이 화면을 떠남: 성공 답이면 서버 방 자리가 남지 않게 나감
        if (response?.ok && response.room && !mountedRef.current) handleLateAnswer(response)
        return
      }
      if (response?.ok && response.room) {
        enterRoom(response.room)
        return
      }
      // 답이 없었거나 거절이어도 서버가 이미 넣어 둔 방이 있으면 그 방으로
      const recovered = await findRoom(socket, isCurrent)
      if (!isCurrent()) return
      if (recovered) {
        enterRoom(recovered)
        return
      }
      setReturnError(describeReturnFailure(response, readResultClosesAt(useInGameStore.getState().state)))
    } finally {
      // 끝나면 누르는 중 표시 풂
      inFlightRef.current = false
      if (mountedRef.current) setIsReturning(false)
    }
  }, [accountId, navigate])

  // 다른 버튼을 누르면 지난 실패 글 지움
  const clearReturnError = useCallback(() => setReturnError(null), [])

  return { requestReturnToMatching, isReturning, returnError, clearReturnError }
}

// 결과 화면 180초: 서버가 준 닫힘 시각(판 끝 시각 + 180초) 하나로 셈, 서버가 닫으면 판·방 지우고 로비로
// 판 끝 방송을 받을 때 판 상태에 담긴 값을 먼저 씀, 없을 때만(새로고침) 판 상태를 한 번 물어 받음
export function useGameResultCloseTimer() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId ?? null)
  const storeClosesAt = useInGameStore((s) => readResultClosesAt(s.state))
  const [fetched, setFetched] = useState({ gameId: null, closesAt: null })
  const closesAt = storeClosesAt ?? (fetched.gameId === gameId ? fetched.closesAt : null)

  // 늦게 끝나는 이동도 최신 navigate를 쓰게 ref에 둠
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  // 서버가 이 판 결과 화면을 닫음: 판·방 지우고 로비로
  useEffect(() => {
    if (!socket || !gameId) return undefined
    return onResultClosed(socket, (payload) => {
      if (payload === null || typeof payload !== "object") return
      if (payload.gameId !== useInGameStore.getState().gameId) return
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().clearRoom()
      navigateRef.current("/lobby", { replace: true })
    })
  }, [socket, gameId])

  // 닫힘 시각 모르면 판 상태 한 번 묻기 (요청마다 DB 안 봄, 서버 메모리 판 상태)
  const knownForGame = closesAt !== null
  useEffect(() => {
    if (!socket || !gameId || knownForGame) return undefined
    let cancelled = false
    askSnapshot(socket, gameId)
      .then((res) => {
        if (cancelled || !res?.ok) return
        const value = readResultClosesAt(res)
        if (value !== null) setFetched({ gameId, closesAt: value })
      })
      .catch(() => {
        // 답이 없으면 남은 초 없이 둠 (다시 연결되면 소켓이 바뀌어 다시 물음)
      })
    return () => { cancelled = true }
  }, [socket, gameId, knownForGame])

  return { closesAt }
}

// 남은 초 (닫힘 시각 없으면 null): 시계 칸 하나만 반 초마다 다시 그리게 시계 칸 안에서 부름
export function useResultSecondsLeft(closesAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (closesAt === null) return undefined
    const timerId = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      // 닫힘 시각 지나면 더 안 셈 (서버 닫힘 사건을 기다림)
      if (current >= closesAt) window.clearInterval(timerId)
    }, RESULT_CLOSE_TICK_MS)
    return () => window.clearInterval(timerId)
  }, [closesAt])
  return computeResultSecondsLeft(closesAt, now)
}

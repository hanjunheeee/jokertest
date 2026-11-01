// 낮 토론 끝 준비 훅: 준비 요청 보내기와 준비 수 보여 주기
// 행동 패널 훅(useInGameActionPanel)이 사용, 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { onDisconnect } from "../socket/connection.js"
import { emitReady } from "../socket/day.js"

// 준비 응답 기다리는 시간
const ACK_TIMEOUT_MS = 5000

// 준비 상태·오류·준비 수와 준비 보내기 함수 돌려줌
export function useInGameDayDiscussionReady() {
  const gameId = useInGameStore((s) => s.gameId)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const dayPhase = useInGameStore((s) => s.state?.dayPhase)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [readyCount, setReadyCount] = useState(null)
  const [requiredCount, setRequiredCount] = useState(null)

  // 보내는 중·준비됨·요청 세대·화면 살아 있음 (같은 틱 안에서도 바로 보이게 ref)
  const sendingRef = useRef(false)
  const readyRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 세대 올려서 보낸 요청의 응답을 버리고 화면 값을 처음으로
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current = false
    readyRef.current = false
    if (!mountedRef.current) return
    setStatus("idle")
    setError(null)
    setReadyCount(null)
    setRequiredCount(null)
  }

  // 연결이 끊기거나 소켓·판이 바뀌면 처음으로
  useEffect(() => {
    if (!socket) return
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket, gameId])

  // 날짜·낮 단계가 바뀌어도 처음으로
  useEffect(() => {
    invalidate()
  }, [gameId, dayIndex, dayPhase])

  // 준비 보내기 (이미 보내는 중·준비됨이면 막기)
  const submitReady = () => {
    if (sendingRef.current || readyRef.current) return
    const requestSocket = getSocket()
    // 연결 없으면 오류 문구, 판 없으면 안 보냄
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    // 요청 세대·판 잡아 둠 (응답 때 비교)
    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    sendingRef.current = true
    setStatus("sending")
    setError(null)

    // 화면·세대·소켓·연결·판 중 하나라도 바뀌면 옛 응답
    const isStale = () =>
      isStaleRoleRevealAckResponse({
        mounted: mountedRef.current,
        requestVersion,
        currentVersion: versionRef.current,
        requestSocket,
        currentSocket: getSocket(),
        requestGameId,
        currentGameId: useInGameStore.getState().gameId,
      })

    // 받아들여지면 준비 수 저장, 거절·시간 초과면 오류 문구 (옛 응답은 버림)
    emitReady(requestSocket, ACK_TIMEOUT_MS, requestGameId)
      .then((response) => {
        if (isStale()) return
        if (response?.ok) {
          readyRef.current = true
          setStatus("ready")
          setReadyCount(Number.isInteger(response.readyCount) ? response.readyCount : null)
          setRequiredCount(Number.isInteger(response.requiredCount) ? response.requiredCount : null)
        } else {
          setStatus("idle")
          setError(response?.message ?? "투표 준비를 처리하지 못했습니다.")
        }
      })
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError("요청이 응답하지 않습니다. 다시 시도해주세요.")
        }
      })
      // 마지막 요청일 때만 보내는 중 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          sendingRef.current = false
        }
      })
  }

  // 서버가 진행 수를 주면 그 값을 먼저 씀
  const serverProgress = useInGameStore((s) => s.state?.progress ?? null)
  const serverOwnsProgress = serverProgress?.kind === "DAY_DISCUSSION"

  return {
    status,
    error,
    readyCount: serverOwnsProgress ? serverProgress.doneCount : readyCount,
    requiredCount: serverOwnsProgress ? serverProgress.requiredCount : requiredCount,
    submitReady,
  }
}

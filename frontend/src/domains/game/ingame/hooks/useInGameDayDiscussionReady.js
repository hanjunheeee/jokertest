import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"

const ACK_TIMEOUT_MS = 5000

export function useInGameDayDiscussionReady() {
  const gameId = useInGameStore((s) => s.gameId)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const dayPhase = useInGameStore((s) => s.state?.dayPhase)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | sending | ready
  const [error, setError] = useState(null)
  const [readyCount, setReadyCount] = useState(null)
  const [requiredCount, setRequiredCount] = useState(null)

  const sendingRef = useRef(false)
  const readyRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current = false
    readyRef.current = false
    if (!mountedRef.current) return // unmounted: state는 건드리지 않는다
    setStatus("idle")
    setError(null)
    setReadyCount(null)
    setRequiredCount(null)
  }

  useEffect(() => {
    if (!socket) return
    const handleDisconnect = () => invalidate()
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, dayPhase])

  const submitReady = () => {
    if (sendingRef.current || readyRef.current) return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    sendingRef.current = true
    setStatus("sending")
    setError(null)

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

    requestSocket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("ready_for_day_vote", { gameId: requestGameId })
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
      .finally(() => {
        if (requestVersion === versionRef.current) {
          sendingRef.current = false
        }
      })
  }

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

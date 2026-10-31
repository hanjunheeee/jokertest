import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeRoleRevealInvalidatePatch } from "../utils/computeRoleRevealInvalidatePatch.js"
import { computeNightActionSubmitPatch } from "../utils/computeNightActionSubmitPatch.js"

const SUBMIT_TIMEOUT_MS = 5000

export function useInGameNightActionSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [lastSubmittedTargetId, setLastSubmittedTargetId] = useState(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const ackingRef = useRef(false)
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
    ackingRef.current = false
    const patch = computeRoleRevealInvalidatePatch(mountedRef.current)
    if (!patch) return
    setStatus(patch.status)
    setError(patch.error)
    setHasSubmitted(false)
    setLastSubmittedTargetId(null)
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
  }, [socket])

  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, phase, dayIndex])

  const submit = (targetId) => {
    if (ackingRef.current) return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    ackingRef.current = true
    setStatus("submitting")
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
      .timeout(SUBMIT_TIMEOUT_MS)
      .emitWithAck("submit_night_action", { gameId: requestGameId, targetId })
      .then((response) => {
        if (isStale()) return
        const patch = computeNightActionSubmitPatch(response)
        setStatus(patch.status)
        setError(patch.error)
        if (response?.ok) {
          setLastSubmittedTargetId(targetId)
          setHasSubmitted(true)
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
          ackingRef.current = false
        }
      })
  }

  return { status, error, lastSubmittedTargetId, hasSubmitted, submit }
}

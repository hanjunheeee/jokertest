import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeResolveNightAckPatch } from "../utils/computeResolveNightAckPatch.js"
import { computeResolveNightInvalidatePatch } from "../utils/computeResolveNightInvalidatePatch.js"
import { computeResolveNightDayTransitionPatch } from "../utils/computeResolveNightDayTransitionPatch.js"
import { shouldApplyNightBroadcastPayload } from "../utils/shouldApplyNightBroadcastPayload.js"

const RESOLVE_TIMEOUT_MS = 5000

export function useInGameResolveNight() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | resolving | resolved
  const [error, setError] = useState(null)
  const [nightActionResult, setNightActionResult] = useState(null)

  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)
  const appliedNightDayIndexRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightInvalidatePatch(mountedRef.current)
    if (!patch) return // unmounted: state는 건드리지 않는다
    setStatus(patch.status)
    setError(patch.error)
    setNightActionResult(patch.nightActionResult)
  }

  const invalidateForDayTransition = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightDayTransitionPatch(mountedRef.current)
    if (!patch) return // unmounted: state는 건드리지 않는다
    setStatus(patch.status)
    setError(patch.error)
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
    appliedNightDayIndexRef.current = null
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  useEffect(() => {
    if (!socket || !gameId) return

    const handleResolved = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      versionRef.current += 1
      ackingRef.current = false
      if (!mountedRef.current) return
      setStatus("resolved")
      setError(null)
    }

    const handleResult = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
      if (!mountedRef.current) return
      setNightActionResult(payload)
    }

    const handleApplied = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      if (payload.phase !== "DAY" || !Number.isInteger(payload.dayIndex)) return
      const resolvedNightDayIndex = payload.dayIndex - 1
      if (appliedNightDayIndexRef.current !== null && resolvedNightDayIndex <= appliedNightDayIndexRef.current) return
      appliedNightDayIndexRef.current = resolvedNightDayIndex
      invalidateForDayTransition()
    }

    socket.on("night_actions_resolved", handleResolved)
    socket.on("night_action_result", handleResult)
    socket.on("night_result_applied", handleApplied)
    return () => {
      socket.off("night_actions_resolved", handleResolved)
      socket.off("night_action_result", handleResult)
      socket.off("night_result_applied", handleApplied)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  const resolveNight = () => {
    if (ackingRef.current || status !== "idle") return
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
    setStatus("resolving")
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
      .timeout(RESOLVE_TIMEOUT_MS)
      .emitWithAck("resolve_night", { gameId: requestGameId })
      .then((response) => {
        if (isStale()) return
        const patch = computeResolveNightAckPatch(response)
        setStatus(patch.status)
        setError(patch.error)
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

  return { status, error, nightActionResult, resolveNight }
}

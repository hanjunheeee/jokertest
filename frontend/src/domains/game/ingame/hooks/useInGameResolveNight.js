// 밤 판정 요청 훅: 판정 요청 보내기, 판정 끝·개인 결과·낮 넘어감 받아 상태 맞추기
// 행동 패널 훅이 사용, 보내기·받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import {
  computeResolveNightAckPatch,
  computeResolveNightInvalidatePatch,
  computeResolveNightDayTransitionPatch,
  shouldApplyNightBroadcastPayload,
} from "../utils/nightPatches.js"
import { onDisconnect } from "../socket/connection.js"
import { emitResolveNight, onNightResolve } from "../socket/night.js"

const RESOLVE_TIMEOUT_MS = 5000

export function useInGameResolveNight() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
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

  // 세대 올려서 보낸 요청의 응답을 버리고 판정 상태·개인 결과를 처음으로
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightInvalidatePatch(mountedRef.current)
    if (!patch) return
    setStatus(patch.status)
    setError(patch.error)
    setNightActionResult(patch.nightActionResult)
  }

  // 낮으로 넘어갈 때: 개인 결과는 남기고 판정 상태만 처음으로
  const invalidateForDayTransition = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightDayTransitionPatch(mountedRef.current)
    if (!patch) return
    setStatus(patch.status)
    setError(patch.error)
  }

  useEffect(() => {
    if (!socket) return
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket])

  useEffect(() => {
    appliedNightDayIndexRef.current = null
    invalidate()
  }, [gameId])

  // 판정 세 사건 받기 (이미 반영한 밤보다 옛 것은 버림)
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

    return onNightResolve(socket, { onResolved: handleResolved, onResult: handleResult, onApplied: handleApplied })
  }, [socket, gameId])

  // 판정 요청 (응답 기다리는 중이거나 이미 판정 중이면 막기)
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

    emitResolveNight(requestSocket, RESOLVE_TIMEOUT_MS, requestGameId)
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

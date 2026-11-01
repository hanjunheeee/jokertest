// 밤 판정 요청 훅: 판정 요청 보내기, 판정 끝·개인 결과·낮 넘어감 받아 상태 맞추기
// 행동 패널 훅(useInGameActionPanel)이 사용, 보내기·받기는 socket/ 함수를 부름
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

// 판정 응답 기다리는 시간
const RESOLVE_TIMEOUT_MS = 5000

// 밤 판정 상태·개인 결과와 판정 요청 함수
export function useInGameResolveNight() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [nightActionResult, setNightActionResult] = useState(null)

  // 응답 기다리는 중·요청 세대·화면 살아 있음·마지막으로 낮으로 넘긴 밤 날짜
  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)
  const appliedNightDayIndexRef = useRef(null)

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
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

  // 연결 끊기거나 소켓 바뀌면 처음으로
  useEffect(() => {
    if (!socket) return
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket])

  // 판 바뀌면 넘긴 밤 기록도 지우고 처음으로
  useEffect(() => {
    appliedNightDayIndexRef.current = null
    invalidate()
  }, [gameId])

  // 판정 세 사건 받기 (지금 판 것만, 이미 낮으로 넘긴 밤 것은 버림)
  useEffect(() => {
    if (!socket || !gameId) return

    // 판정 끝: 진행 중 요청 응답은 버리고 판정됨으로
    const handleResolved = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      versionRef.current += 1
      ackingRef.current = false
      if (!mountedRef.current) return
      setStatus("resolved")
      setError(null)
    }

    // 개인 결과: 이미 낮으로 넘긴 밤 것이면 버림
    const handleResult = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
      if (!mountedRef.current) return
      setNightActionResult(payload)
    }

    // 낮으로 넘어감: 넘긴 밤 날짜 적고 판정 상태만 처음으로 (같은·옛 밤이면 버림)
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

    ackingRef.current = true
    setStatus("resolving")
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

    // 받아들여지면 판정됨, 거절·시간 초과면 오류 문구 (옛 응답은 버림)
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
      // 마지막 요청일 때만 기다림 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, nightActionResult, resolveNight }
}

// 밤 행동 제출 훅: 고른 대상 보내기와 제출 상태
// 행동 패널·카드 메뉴가 사용, 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { computeRoleRevealInvalidatePatch } from "../utils/roleReveal.js"
import { computeNightActionSubmitPatch } from "../utils/nightPatches.js"
import { onDisconnect } from "../socket/connection.js"
import { emitNightAction } from "../socket/night.js"

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

  // 세대 올려서 보낸 요청의 응답을 버리고 제출 상태를 처음으로
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
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket])

  useEffect(() => {
    invalidate()
  }, [gameId, phase, dayIndex])

  // 대상 보내기 (응답 기다리는 중이면 막기)
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

    emitNightAction(requestSocket, SUBMIT_TIMEOUT_MS, requestGameId, targetId)
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

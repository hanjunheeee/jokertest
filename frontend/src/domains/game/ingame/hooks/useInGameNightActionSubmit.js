// 밤 행동 제출 훅: 고른 대상 보내기와 제출 상태
// 행동 패널 훅이 사용 (카드 메뉴는 행동 컨텍스트로 씀), 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { computeRoleRevealInvalidatePatch } from "../utils/roleReveal.js"
import { computeNightActionSubmitPatch } from "../utils/nightPatches.js"
import { onDisconnect } from "../socket/connection.js"
import { emitNightAction } from "../socket/night.js"

// 제출 응답 기다리는 시간
const SUBMIT_TIMEOUT_MS = 5000

// 밤 행동 제출 상태와 보내기 함수
export function useInGameNightActionSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [lastSubmittedTargetId, setLastSubmittedTargetId] = useState(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // 응답 기다리는 중·요청 세대·화면 살아 있음
  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
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

  // 연결 끊기거나 소켓 바뀌면 처음으로
  useEffect(() => {
    if (!socket) return
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket])

  // 판·단계·날짜가 바뀌면 처음으로
  useEffect(() => {
    invalidate()
  }, [gameId, phase, dayIndex])

  // 대상 보내기 (응답 기다리는 중이면 막기)
  const submit = (targetId) => {
    if (ackingRef.current) return
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
    setStatus("submitting")
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

    // 받아들여지면 낸 대상 저장, 거절·시간 초과면 오류 문구 (옛 응답은 버림)
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
      // 마지막 요청일 때만 기다림 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, lastSubmittedTargetId, hasSubmitted, submit }
}

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeRoleRevealInvalidatePatch } from "../utils/computeRoleRevealInvalidatePatch.js"
import { computeNightActionSubmitPatch } from "../utils/computeNightActionSubmitPatch.js"

const SUBMIT_TIMEOUT_MS = 5000

/**
 * NIGHT 행동 제출(submit_night_action)을 관리한다. useInGameRoleRevealAck와 동일한 늦은
 * 응답 방어 패턴(mounted ref, generation versionRef, requestSocket identity + connected,
 * gameId 일치)을 그대로 재사용한다 — isStaleRoleRevealAckResponse/
 * computeRoleRevealInvalidatePatch는 이름은 role-reveal 전용처럼 보이지만 파라미터가 완전히
 * 범용이라 새로 만들지 않는다.
 *
 * role-reveal과의 차이: 성공해도 'submitted'로 잠그지 않는다(재제출 허용 정책과 일치) —
 * 항상 다시 'idle'로 돌아가 버튼이 계속 활성 상태를 유지한다. lastSubmittedTargetId는
 * 표시용일 뿐 서버 판정에는 관여하지 않는다(JOKER가 금지된 대상을 제출하면 서버는 no-op이지만
 * 클라이언트는 낙관적으로 "제출됨"이라 표시할 수 있음 — 오라클 방지를 위한 의도된 트레이드오프).
 */
export function useInGameNightActionSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | submitting
  const [error, setError] = useState(null)
  const [lastSubmittedTargetId, setLastSubmittedTargetId] = useState(null)

  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 제출을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·gameId
  // 변경·unmount 네 지점 모두 이 함수 하나만 거친다(useInGameRoleRevealAck와 동일한 계약).
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeRoleRevealInvalidatePatch(mountedRef.current)
    if (!patch) return // unmounted: state는 건드리지 않는다
    setStatus(patch.status)
    setError(patch.error)
  }

  // disconnect・socket 객체 교체(재연결)・unmount 시 무효화.
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

  // gameId 변경 시 무효화(이전 gameId를 향한 요청·에러 상태는 새 게임에 넘어가지 않는다).
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

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
        if (response?.ok) setLastSubmittedTargetId(targetId)
      })
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError("요청이 응답하지 않습니다. 다시 시도해주세요.")
        }
      })
      .finally(() => {
        // 이 요청이 아직 자기 세대를 소유할 때만 잠금을 해제한다 — invalidate가 이미
        // 세대를 올려놨다면(disconnect 등) 여기서는 아무것도 하지 않는다. 이래야 이
        // 늦은 finally가 그 사이 시작된 새 요청의 status/error/잠금을 실수로 건드리지 않는다.
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, lastSubmittedTargetId, submit }
}

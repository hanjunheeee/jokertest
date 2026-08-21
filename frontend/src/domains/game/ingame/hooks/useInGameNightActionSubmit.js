import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeNightActionSubmitPatch } from "../utils/computeNightActionSubmitPatch.js"

const SUBMIT_TIMEOUT_MS = 5000

/**
 * NIGHT 행동 제출(submit_night_action)을 관리한다. useInGameRoleRevealAck와 동일한 늦은
 * 응답 방어 패턴(mounted ref, generation versionRef, requestSocket identity + connected,
 * gameId 일치)을 재사용한다 — isStaleRoleRevealAckResponse는 이름은 role-reveal 전용처럼
 * 보이지만 파라미터가 완전히 범용이라 새로 만들지 않는다.
 *
 * 성공하면 'submitted'로 잠긴다(조용한 중복 제출 방지) — role-reveal과 달리 이 잠금은
 * "게임이 끝날 때까지"가 아니라 "canonical NIGHT 턴 정체성(gameId·dayIndex·socket·현재 턴
 * 역할)이 그대로인 동안"만 유효하다. 이 넷 중 하나라도 바뀌면(다음 역할로 턴이 넘어감 포함)
 * invalidate()가 상태를 'idle'로 되돌려 다음 턴을 다시 제출할 수 있게 한다 — 그 전까지는
 * 이미 성공한 제출을 향해 같은 턴에서 또 emitWithAck를 보내지 않는다.
 */
export function useInGameNightActionSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  const nightTurnRole = useInGameStore((s) => selectInGameNightTurnRole(s.state ?? null))
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | submitting | submitted
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

  // 진행 중이던 제출을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·canonical
  // game/day/역할 턴 정체성 변화·unmount 다섯 지점 모두 이 함수 하나만 거친다.
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    if (!mountedRef.current) return // unmounted: state는 건드리지 않는다
    setStatus("idle")
    setError(null)
    setLastSubmittedTargetId(null)
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

  // canonical game/day/역할 턴 정체성이 바뀔 때만 이전 제출 상태를 지운다(요구사항) — 그 외에는
  // 성공 응답이 'submitted'로 남아 같은 턴에서 조용한 중복 제출을 막는다. nightTurnRole이
  // 바뀌는 시점은 "이 배우가 속한 역할의 턴이 실제로 끝난" 시점과 정확히 겹치므로, 이 하나의
  // 조건으로 "다음 역할을 기다리는 중" 표시의 생명주기가 자연히 끝난다.
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, nightTurnRole])

  const submit = (targetId) => {
    if (ackingRef.current || status === "submitted") return
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

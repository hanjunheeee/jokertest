import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeResolveNightAckPatch } from "../utils/computeResolveNightAckPatch.js"
import { computeResolveNightInvalidatePatch } from "../utils/computeResolveNightInvalidatePatch.js"
import { shouldApplyNightBroadcastPayload } from "../utils/shouldApplyNightBroadcastPayload.js"

const RESOLVE_TIMEOUT_MS = 5000

/**
 * NIGHT 행동 판정 요청(resolve_night)을 관리한다. useInGameNightActionSubmit과 동일한 늦은
 * 응답 방어 패턴(mounted ref, generation versionRef, requestSocket identity + connected,
 * gameId 일치)을 재사용하지만, 정책은 반대다 — 판정은 게임당 한 번만 유효하므로 성공하면
 * status를 'resolved'로 잠그고 재요청을 막는다(재제출이 항상 허용되는 밤 행동 제출과 다름).
 *
 * night_actions_resolved(공개 방송)를 구독해 다른 참가자가 먼저 판정을 끝낸 경우에도 이
 * 클라이언트의 입력을 함께 잠근다. night_action_result(개인 결과)는 GUARD/WITCH_HUNTER
 * 본인에게만 도착하므로 그대로 저장해 표시용으로만 쓴다.
 */
export function useInGameResolveNight() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | resolving | resolved
  const [error, setError] = useState(null)
  const [nightActionResult, setNightActionResult] = useState(null)

  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 요청을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·gameId 변경·
  // unmount 네 지점 모두 이 함수 하나만 거친다(useInGameNightActionSubmit과 동일한 계약).
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightInvalidatePatch(mountedRef.current)
    if (!patch) return // unmounted: state는 건드리지 않는다
    setStatus(patch.status)
    setError(patch.error)
    setNightActionResult(patch.nightActionResult)
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

  // gameId 변경 시 무효화(이전 gameId를 향한 요청·판정 상태·개인 결과는 새 게임에 넘어가지 않는다).
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // night_actions_resolved/night_action_result 구독. 자신이 요청자가 아니어도(다른 참가자가
  // 먼저 판정한 경우) 도착하므로, 이 클라이언트의 in-flight 요청 세대도 함께 무효화해
  // 늦게 도착하는 자신의 ack가 이후 상태를 덮어쓰지 않게 한다.
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
      if (!mountedRef.current) return
      setNightActionResult(payload)
    }

    socket.on("night_actions_resolved", handleResolved)
    socket.on("night_action_result", handleResult)
    return () => {
      socket.off("night_actions_resolved", handleResolved)
      socket.off("night_action_result", handleResult)
    }
  }, [socket, gameId])

  const resolveNight = () => {
    // status가 'idle'이 아니면(resolving 중이거나 이미 resolved) 중복 요청을 막는다 — 판정
    // 완료 후 입력 잠금과 동일한 조건이다.
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
        // 이 요청이 아직 자기 세대를 소유할 때만 잠금을 해제한다 — invalidate 또는
        // night_actions_resolved 방송이 이미 세대를 올려놨다면 여기서는 아무것도 하지 않는다.
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, nightActionResult, resolveNight }
}

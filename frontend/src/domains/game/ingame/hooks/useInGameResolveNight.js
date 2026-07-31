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
  // 현재 gameId 안에서 단조 증가하는 "이미 DAY로 적용된 가장 최근 NIGHT의 dayIndex". null이면
  // 아직 적용된 NIGHT이 없다는 뜻이다 — gameId가 바뀔 때만 초기화하고(아래 [gameId] effect),
  // disconnect/unmount로 인한 invalidate()에서는 건드리지 않는다(재연결해도 서버가 이미 확정한
  // 기준은 여전히 유효하다).
  const appliedNightDayIndexRef = useRef(null)

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
  // appliedNightDayIndexRef도 이 새 게임의 초기 폐기 기준(null)으로 되돌린다 — 이전 게임에서
  // 쌓인 dayIndex가 새 게임의 단조 증가 기준으로 이어지면 안 된다.
  useEffect(() => {
    appliedNightDayIndexRef.current = null
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
      // 이미 DAY로 적용된 NIGHT과 같거나 그보다 오래된(<=) private result는 폐기한다 —
      // night_action_result.dayIndex(commit 전 값)와 night_result_applied.dayIndex(commit 후
      // +1된 값)는 항상 전자<후자이므로, 이 비교만으로 "이미 초기화된 뒤 늦게 도착한 개인
      // 결과"를 걸러낼 수 있다.
      if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
      if (!mountedRef.current) return
      setNightActionResult(payload)
    }

    // NIGHT 결과 적용(사망 + DAY 전이) 방송이다. 검증된 최신(dayIndex가 ref보다 큰) 수신만
    // ref를 갱신하고 invalidate()로 status/error/nightActionResult를 초기화하며 in-flight
    // 요청 세대도 무효화한다 — 같거나 오래된 dayIndex는 완전한 no-op이다.
    const handleApplied = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      if (payload.phase !== "DAY" || !Number.isInteger(payload.dayIndex)) return
      if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
      appliedNightDayIndexRef.current = payload.dayIndex
      invalidate()
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

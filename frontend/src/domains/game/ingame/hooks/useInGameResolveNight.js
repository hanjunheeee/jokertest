import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
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
 * 본인에게만 도착하며, 이 훅은 검증만 하고 store의 nightPrivateResult로 넘긴다 — 표시는
 * 오버레이(useInGameNightPrivateResult)가 담당한다.
 *
 * 개인 결과의 stale 판정 기준은 항상 "밤의 dayIndex"다 — 두 방송이 서로 다른 축의 값을
 * 실어 나르기 때문이다(night_action_result.dayIndex = 판정된 밤의 값 N,
 * night_result_applied.dayIndex = 그 밤이 적용돼 들어간 DAY의 값 N+1). 후자를 그대로
 * 기준으로 삼으면 다음 밤(dayIndex N+1)의 개인 결과가 자기 자신과 같은 값이 되어 통째로
 * 폐기된다 — 아래 resolvedNightDayIndexRef가 두 축을 밤 기준으로 통일한다.
 *
 * @flow socket·gameId가 있을 때만 세 방송을 구독한다. 개인 결과는 이미 판정이 끝난 밤의
 *   것이면 버리고, 아니면 store에 넘긴다. 결과 적용 방송은 새 밤일 때만 기준을 올리고
 *   invalidate()로 요청 상태를 되돌린다.
 */
export function useInGameResolveNight() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | resolving | resolved
  const [error, setError] = useState(null)

  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)
  // 현재 gameId 안에서 단조 증가하는 "이미 판정이 적용된 가장 최근 NIGHT의 dayIndex"
  // (= night_result_applied.dayIndex - 1). null이면 아직 적용된 NIGHT이 없다는 뜻이다 —
  // gameId가 바뀔 때만 초기화하고(아래 [gameId] effect), disconnect/unmount로 인한
  // invalidate()에서는 건드리지 않는다(재연결해도 서버가 이미 확정한 기준은 여전히 유효하다).
  //
  // 여기에 night_result_applied.dayIndex(= DAY 값)를 그대로 담으면 안 된다 — 다음 밤의
  // 개인 결과 dayIndex와 정확히 같은 값이 되어, 둘째 밤부터 모든 개인 결과가 폐기된다.
  const resolvedNightDayIndexRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 요청을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·gameId 변경·
  // unmount 네 지점 모두 이 함수 하나만 거친다(useInGameNightActionSubmit과 동일한 계약).
  //
  // 개인 조사 결과는 여기서 지우지 않는다 — 더 이상 이 훅의 소유가 아니라 store의
  // nightPrivateResult이고, disconnect·재연결·unmount로 사라지면 안 되기 때문이다. 새 게임으로의
  // 이월은 store가 gameId 검사와 setGamePayload의 초기화로 직접 막는다.
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeResolveNightInvalidatePatch(mountedRef.current)
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

  // gameId 변경 시 무효화(이전 gameId를 향한 요청·판정 상태는 새 게임에 넘어가지 않는다).
  // resolvedNightDayIndexRef도 이 새 게임의 초기 폐기 기준(null)으로 되돌린다 — 이전 게임에서
  // 쌓인 dayIndex가 새 게임의 단조 증가 기준으로 이어지면 안 된다.
  useEffect(() => {
    resolvedNightDayIndexRef.current = null
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
      // 이미 판정이 적용된 NIGHT과 같거나 그보다 오래된(<=) private result는 폐기한다. 양변이
      // 모두 "밤의 dayIndex"라서 성립하는 비교다 — ref는 night_result_applied.dayIndex에서 1을
      // 빼 밤 기준으로 맞춰 담고(handleApplied), payload.dayIndex는 서버가 commit 전 값(그 밤의
      // dayIndex)을 그대로 실어 보낸다. 그래서 다음 밤의 결과는 항상 크고, 이미 끝난 밤의 늦은
      // 재수신만 걸린다.
      if (resolvedNightDayIndexRef.current !== null && payload.dayIndex <= resolvedNightDayIndexRef.current) return
      // mountedRef는 보지 않는다 — 리스너는 cleanup에서 해제되고, 반영 대상은 컴포넌트 state가
      // 아니라 전역 store이므로 unmount와 무관하다. store가 형태를 한 번 더 검증한다.
      useInGameStore.getState().setNightPrivateResult(payload)
    }

    // NIGHT 결과 적용(사망 + DAY 전이) 방송이다. payload.dayIndex는 이미 +1된 DAY의 값이므로
    // 1을 빼 "판정이 끝난 밤"의 값으로 되돌린 뒤에 기준으로 삼는다(정수 검사가 뺄셈보다 앞선다).
    // 검증된 최신(그 밤이 ref보다 뒤인) 수신만 ref를 갱신하고 invalidate()로 status/error를
    // 초기화하며 in-flight 요청 세대도 무효화한다 — 같은 밤의 중복 방송은 완전한 no-op이다.
    // 개인 조사 결과는 여기서 건드리지 않는다: DAY로 넘어온 지금이 바로 그 결과를 오버레이로
    // 보여줄 시점이다.
    const handleApplied = (payload) => {
      if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
      if (payload.phase !== "DAY" || !Number.isInteger(payload.dayIndex)) return
      const resolvedNightDayIndex = payload.dayIndex - 1
      if (resolvedNightDayIndexRef.current !== null && resolvedNightDayIndex <= resolvedNightDayIndexRef.current) return
      resolvedNightDayIndexRef.current = resolvedNightDayIndex
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

  return { status, error, resolveNight }
}

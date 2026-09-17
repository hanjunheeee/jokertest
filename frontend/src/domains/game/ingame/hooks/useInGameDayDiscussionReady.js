import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"

const ACK_TIMEOUT_MS = 5000

/**
 * DAY_DISCUSSION의 "투표 시작 준비(ready_for_day_vote)" 요청을 관리한다.
 *
 * useInGameRoleRevealAck의 늦은 응답 방어 패턴(mounted/version/잠금 ref + 응답 시점 재확인)을
 * 그대로 따르되 자동 발사는 하지 않는다 — 토론을 언제 끝낼지는 참가자가 정하는 것이므로
 * submitReady를 사용자가 직접 불러야 한다(역할 확인처럼 배경에서 자동으로 나가면 안 된다).
 *
 * 서버는 마지막 한 명의 준비에서만 DAY_VOTE로 전이하고, ack에는 요청자 본인이 본 진행률
 * (readyCount/requiredCount)만 담는다 — 누가 준비했는지는 내려오지 않는다.
 *
 * @flow gameId/dayIndex/dayPhase/socket 중 하나라도 바뀌면 진행 중이던 요청을 무효화해 idle로
 *       되돌리고(다음 낮에 다시 누를 수 있어야 한다), submitReady는 잠금·연결을 확인한 뒤
 *       emitWithAck로 요청해 stale이 아닌 응답만 status/진행률에 반영한다.
 */
export function useInGameDayDiscussionReady() {
  const gameId = useInGameStore((s) => s.gameId)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const dayPhase = useInGameStore((s) => s.state?.dayPhase)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | sending | ready
  const [error, setError] = useState(null)
  const [readyCount, setReadyCount] = useState(null)
  const [requiredCount, setRequiredCount] = useState(null)

  const sendingRef = useRef(false)
  // useInGameRoleRevealAck의 ackedRef와 같은 이유 — status state는 비동기 커밋을 거치므로
  // 무효화 직후의 재요청이 stale한 status 때문에 잘못 건너뛰지 않도록 ref로도 추적한다.
  const readyRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 준비 요청을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·
  // gameId/dayIndex/dayPhase 변경·unmount 모두 이 함수 하나만 거친다.
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current = false
    readyRef.current = false
    if (!mountedRef.current) return // unmounted: state는 건드리지 않는다
    setStatus("idle")
    setError(null)
    setReadyCount(null)
    setRequiredCount(null)
  }

  // disconnect・socket 교체(재연결)・unmount 시 무효화한다. 역할 확인과 달리 "connect"에
  // 자동 재요청을 걸지 않는다 — 재연결됐다는 이유로 사용자가 누르지도 않은 준비가 나가면
  // 토론이 본인 의사와 무관하게 끝나버린다(재접속 후의 준비 여부는 스냅샷이 알려준다).
  useEffect(() => {
    if (!socket) return
    const handleDisconnect = () => invalidate()
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  // 새 낮으로 넘어가거나(dayIndex) 투표가 열리면(dayPhase) 이전 낮의 준비 상태를 폐기한다 —
  // 그래야 다음 토론에서 버튼이 다시 idle로 눌릴 수 있다.
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, dayPhase])

  const submitReady = () => {
    if (sendingRef.current || readyRef.current) return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    sendingRef.current = true
    setStatus("sending")
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
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("ready_for_day_vote", { gameId: requestGameId })
      .then((response) => {
        if (isStale()) return
        if (response?.ok) {
          readyRef.current = true
          setStatus("ready")
          // 서버가 진행률을 함께 내려줄 때만 표시한다 — 값이 없으면 표시를 지운다.
          setReadyCount(Number.isInteger(response.readyCount) ? response.readyCount : null)
          setRequiredCount(Number.isInteger(response.requiredCount) ? response.requiredCount : null)
        } else {
          setStatus("idle")
          setError(response?.message ?? "투표 준비를 처리하지 못했습니다.")
        }
      })
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError("요청이 응답하지 않습니다. 다시 시도해주세요.")
        }
      })
      .finally(() => {
        // 이 요청이 아직 자기 세대를 소유할 때만 잠금을 해제한다(useInGameRoleRevealAck와 동일).
        if (requestVersion === versionRef.current) {
          sendingRef.current = false
        }
      })
  }

  /**
   * F-21(AC-03): 이탈은 준비의 **분모**를 바꾼다.
   *
   * ACK가 실어 준 수치는 그 제출 순간의 사실이다 — 그 뒤 누군가 추방되면 요구 인원이 줄지만
   * 이 화면은 새 ACK를 받을 일이 없어 3/4에 멈춘 채로 남는다(그 낮은 영원히 끝나지 않는 것처럼
   * 보인다). 서버가 참여 변화와 함께 보낸 공개 진행 수가 있으면 그것이 canonical이다.
   */
  const serverProgress = useInGameStore((s) => s.state?.progress ?? null)
  const serverOwnsProgress = serverProgress?.kind === "DAY_DISCUSSION"

  return {
    status,
    error,
    readyCount: serverOwnsProgress ? serverProgress.doneCount : readyCount,
    requiredCount: serverOwnsProgress ? serverProgress.requiredCount : requiredCount,
    submitReady,
  }
}

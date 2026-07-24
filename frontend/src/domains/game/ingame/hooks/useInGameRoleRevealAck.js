import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeRoleRevealInvalidatePatch } from "../utils/computeRoleRevealInvalidatePatch.js"

const ACK_TIMEOUT_MS = 5000

/**
 * ROLE_REVEAL 단계의 "역할 확인" 요청을 관리한다(useMatchingRoom의 startGame/setReady와
 * 동일한 늦은 응답 방어 패턴을 이 훅 하나의 액션에 맞게 적용).
 */
export function useInGameRoleRevealAck() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | acking | acked
  const [error, setError] = useState(null)

  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 확인 요청을 무효화하고 잠금을 즉시 해제한다. disconnect·socket 교체·gameId
  // 변경·unmount 네 지점 모두 이 함수 하나만 거친다.
  //
  // 필수 계약:
  //  - gameId 변경: 이전 acked/error를 폐기하고 새 게임은 idle에서 시작한다.
  //  - Socket 교체: 이전 acked/error를 폐기하고 새 Socket에서 다시 요청할 수 있다.
  //  - disconnect: 요청을 무효화하고 잠금을 풀고 status를 idle, error를 null로 되돌린다.
  //  - unmount: generation 무효화와 ref 잠금 해제만 한다 — React state는 건드리지 않는다.
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
      invalidate() // socket이 바뀌거나 컴포넌트가 사라질 때도 동일하게 무효화
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // gameId 변경 시 무효화(이전 gameId를 향한 요청·완료 상태는 새 게임에 넘어가지 않는다).
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const acknowledge = () => {
    if (ackingRef.current || status === "acked") return
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
    setStatus("acking")
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
      .emitWithAck("acknowledge_role_reveal", { gameId: requestGameId })
      .then((response) => {
        if (isStale()) return
        if (response?.ok) {
          setStatus("acked")
        } else {
          setStatus("idle")
          setError(response?.message ?? "역할 확인을 처리하지 못했습니다.")
        }
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

  return { status, error, acknowledge }
}

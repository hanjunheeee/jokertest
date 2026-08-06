import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeRoleRevealInvalidatePatch } from "../utils/computeRoleRevealInvalidatePatch.js"

const ACK_TIMEOUT_MS = 5000

/**
 * ROLE_REVEAL 단계의 "역할 확인(acknowledge_role_reveal)" 요청을 자동으로 관리한다
 * (useMatchingRoom의 startGame/setReady와 동일한 늦은 응답 방어 패턴을 이 훅 하나의 액션에
 * 맞게 적용). 예전에는 사용자가 버튼을 눌러야만 이 요청이 나갔지만, 지금은 화면 표시(파치먼트
 * 역할 공개 오버레이)와 완전히 분리된 배경 동작으로 gameId가 준비되는 즉시·매 재연결마다
 * 자동으로 나간다 — 서버의 ROLE_REVEAL→NIGHT 전이가 참가자 전원의 ack를 요구하는 계약은
 * 그대로 두되(백엔드 미변경), 그 ack를 "언제 보낼지"만 자동화한다. acknowledge_role_reveal은
 * 이미 ack한 uuid가 다시 요청해도 {ok:true, transitioned:false}를 반환하는 멱등 연산이므로
 * 재연결마다 다시 불러도 안전하다.
 */
export function useInGameRoleRevealAck() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle") // idle | acking | acked
  const [error, setError] = useState(null)

  const ackingRef = useRef(false)
  // status state는 비동기 커밋을 거치므로, 같은 렌더 안에서 invalidate() 직후 곧바로
  // acknowledge()를 불러도 아직 갱신 전 값을 보게 될 수 있다 — 자동 발사 경로가 그 순간의
  // stale status 때문에 잘못 건너뛰지 않도록 acked 여부는 이 ref로 동기적으로 추적한다.
  const ackedRef = useRef(false)
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
    ackedRef.current = false
    const patch = computeRoleRevealInvalidatePatch(mountedRef.current)
    if (!patch) return // unmounted: state는 건드리지 않는다
    setStatus(patch.status)
    setError(patch.error)
  }

  // disconnect・socket 객체 교체(재연결)・unmount 시 무효화 + 재연결마다 자동 재시도.
  // gameId도 deps에 포함해, socket 인스턴스는 그대로인데 gameId만 바뀌는 경우에도 이
  // "connect" 핸들러가 새 gameId를 가리키도록(오래된 gameId를 향한 늦은 자동 요청 방지) 한다.
  useEffect(() => {
    if (!socket) return
    const handleDisconnect = () => invalidate()
    const handleConnect = () => acknowledge()
    socket.on("disconnect", handleDisconnect)
    socket.on("connect", handleConnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
      socket.off("connect", handleConnect)
      invalidate() // socket이 바뀌거나 컴포넌트가 사라질 때도 동일하게 무효화
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  // gameId가 준비되는 즉시 자동으로 확인 요청을 보낸다(이전에는 사용자의 버튼 클릭이
  // 트리거였다 — 이제는 화면 표시와 무관하게 이 훅 혼자 자동으로 처리한다).
  useEffect(() => {
    invalidate()
    if (gameId) acknowledge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const acknowledge = () => {
    if (ackingRef.current || ackedRef.current) return
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
          ackedRef.current = true
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

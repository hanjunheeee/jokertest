import { useEffect, useRef, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { isStaleSessionSnapshotAckResponse } from "../utils/isStaleSessionSnapshotAckResponse.js"

const SESSION_SNAPSHOT_TIMEOUT_MS = 5000

/**
 * 인게임 진입/재접속 시 get_session_snapshot을 요청해 3A의 원자적 복원(useInGameStore의
 * applySessionSnapshot)에 먹인다. 이미 연결된 상태로 활성화되면 즉시 한 번, 이후 매 실제
 * "connect"(재연결)마다 한 번씩만 요청한다 — useInGameRoleRevealAck의 mounted/generation
 * 방어와 useMatchingRoom의 socket・인증 계정 identity 재확인 패턴을 이 반복 요청 흐름에
 * 맞게 결합한다.
 */
export function useInGameSessionSnapshotSync() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

  const mountedRef = useRef(true)
  const epochVersionRef = useRef(0)
  const epochBaseRef = useRef({ socket: undefined, gameId: undefined, authUuid: undefined })
  const requestedVersionRef = useRef(-1)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!socket || !gameId || !authUuid) return

    // StrictMode의 setup→cleanup→setup 재실행은 deps가 완전히 같은 채로 이 effect 본문을
    // 다시 부른다 — 이때는 epochBaseRef와 현재 값이 같으므로 새 세대로 보지 않는다. 반면
    // socket/gameId/authUuid 중 하나라도 실제로 바뀐 재실행은 진짜 새 세대다.
    const base = epochBaseRef.current
    const isNewEpoch = base.socket !== socket || base.gameId !== gameId || base.authUuid !== authUuid
    if (isNewEpoch) {
      epochVersionRef.current += 1
      epochBaseRef.current = { socket, gameId, authUuid }
    }

    const requestSnapshot = () => {
      const requestEpochVersion = epochVersionRef.current
      // 이 세대에서 이미 요청을 보냈다면 다시 보내지 않는다 — StrictMode 이중 호출과, 같은
      // 세대 안에서 connect 핸들러와 "이미 연결됨" 분기가 동시에 조건을 만족하는 경우를
      // 하나의 네트워크 호출로 합친다.
      if (requestedVersionRef.current === requestEpochVersion) return
      requestedVersionRef.current = requestEpochVersion

      const requestSocket = socket
      const requestGameId = gameId
      const requestAuthUuid = authUuid

      requestSocket
        .timeout(SESSION_SNAPSHOT_TIMEOUT_MS)
        .emitWithAck("get_session_snapshot", { gameId: requestGameId })
        .then((response) => {
          const stale = isStaleSessionSnapshotAckResponse({
            mounted: mountedRef.current,
            requestEpochVersion,
            currentEpochVersion: epochVersionRef.current,
            requestGameId,
            currentGameId: useInGameStore.getState().gameId,
            requestAuthUuid,
            currentAuthUuid: useAuthStore.getState().user?.uuid ?? null,
            requestSocket,
            currentSocket: getSocket(),
          })
          if (stale) return
          // 3A가 이미 완성한 원자적 검증/병합(applySessionSnapshotPure)에 그대로 위임한다 —
          // 형태가 잘못됐거나 ok:false인 응답은 그 함수 내부에서 참조 보존 no-op으로 처리되므로
          // 여기서 별도로 응답 형태를 분기하지 않는다.
          useInGameStore.getState().applySessionSnapshot(response)
        })
        .catch(() => {
          // 타임아웃/전송 오류: 조용히 무시한다. 다음 재연결이 새 세대로 다시 요청한다.
        })
    }

    const handleConnect = () => {
      // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(이미 열린 연결에는 절대
      // 다시 발생하지 않는다) — manager 수준의 "reconnect" 리스너는 별도로 두지 않는다.
      epochVersionRef.current += 1
      requestSnapshot()
    }

    socket.on("connect", handleConnect)

    // 이미 연결된 상태로 활성화된 경우를 다루기 위해, 리스너 등록 다음에 connected를 읽는다.
    // requestSnapshot()이 세대당 멱등이므로, 이 분기와 connect 핸들러가 같은 세대에 대해
    // 동시에 유효해지더라도 실제 네트워크 호출은 한 번만 나간다.
    if (socket.connected) {
      requestSnapshot()
    }

    return () => {
      socket.off("connect", handleConnect)
    }
  }, [socket, gameId, authUuid])
}

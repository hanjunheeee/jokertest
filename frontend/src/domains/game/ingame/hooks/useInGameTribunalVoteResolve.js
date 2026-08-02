import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import {
  createTribunalVoteResolveController,
  INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE,
} from "../utils/createTribunalVoteResolveController.js"

/**
 * TRIBUNAL 판정 요청(resolve_tribunal_vote)을 관리하는 얇은 배선 hook이다.
 * useInGameTribunalVoteSubmit과 동일한 구조(controller 생성/폐기, React state 동기화,
 * 무효화 트리거)를 따르되 대상은 제출이 아니라 판정이다. 판정의 공개 결과(outcome/counts/
 * executedUuid, 다른 참가자가 먼저 판정한 경우 포함)는 canonical store(state.tribunal, 소켓
 * 이벤트 tribunal_vote_resolved → applyTribunalResolved 경유)가 이미 반영하므로, 이 hook은
 * "이 클라이언트의 판정 요청" 자체의 생명주기(idle/resolving/resolved/error)만 추적한다.
 */
export function useInGameTribunalVoteResolve() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid)
  const actorUuid = useInGameStore((s) => s.state?.self?.uuid)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [state, setState] = useState(INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE)
  const controllerRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const controller = createTribunalVoteResolveController({
      getSocket,
      onStateChange: (next) => {
        if (isMountedRef.current) setState(next)
      },
      getLatestContext: () => {
        const storeState = useInGameStore.getState()
        return {
          gameId: storeState.gameId,
          dayIndex: storeState.state?.dayIndex,
          phase: storeState.state?.phase,
          actorUuid: storeState.state?.self?.uuid,
          defendantUuid: storeState.state?.tribunal?.defendantUuid,
        }
      },
    })
    controllerRef.current = controller
    setState(controller.getState())

    return () => {
      controller.dispose()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // gameId/dayIndex/phase/피고인/actor 변경 시 진행 중 요청·표시 상태를 무효화한다.
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, phase, defendantUuid, actorUuid])

  useEffect(() => {
    if (!socket) return undefined
    const handleDisconnect = () => controllerRef.current?.invalidate("DISCONNECT")
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
    }
  }, [socket])

  const resolveTribunalVote = () => {
    if (state.status !== "idle") return
    const storeState = useInGameStore.getState()
    controllerRef.current?.resolve({
      gameId: storeState.gameId,
      dayIndex: storeState.state?.dayIndex,
      phase: storeState.state?.phase,
      actorUuid: storeState.state?.self?.uuid,
      defendantUuid: storeState.state?.tribunal?.defendantUuid,
    })
  }

  return {
    status: state.status,
    error: state.error,
    outcome: state.outcome,
    counts: state.counts,
    executedUuid: state.executedUuid,
    resolveTribunalVote,
  }
}

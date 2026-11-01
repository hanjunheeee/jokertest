// 재판 판정 요청 훅: 컨트롤러로 판정 요청 보내고 결과 보여 주기
// 행동 패널이 사용, 끊김 받기는 socket/connection.js를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import {
  createTribunalVoteResolveController,
  INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE,
} from "../utils/createTribunalVoteResolveController.js"
import { onDisconnect } from "../socket/connection.js"

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
  }, [socket])

  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
  }, [gameId, dayIndex, phase, defendantUuid, actorUuid])

  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => controllerRef.current?.invalidate("DISCONNECT"))
    return () => {
      offDisconnect()
    }
  }, [socket])

  // 판정 요청 (스토어의 지금 값으로 보냄)
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

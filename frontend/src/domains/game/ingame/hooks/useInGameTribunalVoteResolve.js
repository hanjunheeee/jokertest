import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import {
  createTribunalVoteResolveController,
  INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE,
} from "../utils/createTribunalVoteResolveController.js"

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

// 재판 판정 요청 훅: 컨트롤러로 판정 요청 보내고 결과 보여 주기
// 행동 패널 훅(useInGameActionPanel)이 사용, 끊김 받기는 socket/connection.js를 부름 (보내기는 컨트롤러)
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import {
  createTribunalVoteResolveController,
  INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE,
} from "../utils/createTribunalVoteResolveController.js"
import { onDisconnect } from "../socket/connection.js"

// 재판 판정 상태·결과와 판정 요청 함수
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

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 소켓마다 판정 컨트롤러 하나 (응답 때 스토어 지금 값과 비교, 소켓 바뀌면 옛 것 버림)
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

  // 판·날짜·단계·피고·내가 바뀌면 진행 중 판정 버림
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
  }, [gameId, dayIndex, phase, defendantUuid, actorUuid])

  // 연결 끊기면 진행 중 판정 버림
  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => controllerRef.current?.invalidate("DISCONNECT"))
    return () => {
      offDisconnect()
    }
  }, [socket])

  // 판정 요청 (판정 중이면 막기, 스토어의 지금 값으로 보냄)
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

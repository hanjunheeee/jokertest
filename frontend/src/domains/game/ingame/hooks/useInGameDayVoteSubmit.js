import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createDayVoteSubmitController } from "../utils/createDayVoteSubmitController.js"
import { INITIAL_DAY_VOTE_SUBMIT_STATE } from "../utils/computeDayVoteSubmitPatch.js"

/**
 * DAY 투표 제출(cast_day_vote)을 관리하는 얇은 배선 hook이다. 경쟁 조건 방어 로직은 전부
 * createDayVoteSubmitController에 있고, 이 hook은 controller 생성/폐기와 React state 동기화만
 * 담당한다 — socket 하나당 controller 하나(controllerRef)이고, socket이 바뀌면 이전
 * controller를 dispose()한 뒤 새 controller를 만든다(재사용하지 않는다).
 */
export function useInGameDayVoteSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [state, setState] = useState(INITIAL_DAY_VOTE_SUBMIT_STATE)
  const controllerRef = useRef(null)

  // socket 하나당 controller 하나 — socket이 바뀌면 이전 controller를 dispose()하고 새로 만든다.
  useEffect(() => {
    if (!socket) return undefined

    const controller = createDayVoteSubmitController({
      emitWithAck: (payload) => socket.emitWithAck("cast_day_vote", payload),
      onStateChange: setState,
    })
    controllerRef.current = controller
    setState(controller.getState())

    return () => {
      controller.dispose()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // gameId/phase/dayIndex 변경 시 진행 중 요청·이전 컨텍스트의 표시 상태를 무효화한다.
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, phase, dayIndex])

  // disconnect 시 무효화 — 재연결 후 새 socket effect가 새 controller를 만든다.
  useEffect(() => {
    if (!socket) return undefined
    const handleDisconnect = () => controllerRef.current?.invalidate("DISCONNECT")
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
    }
  }, [socket])

  const submitDayVote = (targetId) => {
    controllerRef.current?.submit({ gameId, dayIndex, targetId })
  }

  return {
    status: state.status,
    error: state.error,
    hasSubmitted: state.hasSubmitted,
    lastSubmittedTargetId: state.lastSubmittedTargetId,
    submitDayVote,
  }
}

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import { createDayVoteSubmitController } from "../utils/createDayVoteSubmitController.js"
import { INITIAL_DAY_VOTE_SUBMIT_STATE } from "../utils/computeDayVoteSubmitPatch.js"
import { getDayVoteRound } from "../utils/dayVoteRound.js"

/**
 * F-16(AC-01/AC-04/AC-05): 낮 투표 제출 성공 ACK의 사건 봉투를 공통 재생기로 넘긴다.
 *
 * controller가 이미 settle-once·세대 검사를 통과시켰지만, 여기서 한 번 더 **지금 이 순간의**
 * canonical 값과 대조한다. React가 아직 이 훅을 리렌더하지 않은 구간(store 변경 ~ 다음 렌더)
 * 에도 ACK가 도착할 수 있으므로, 렌더 시점 클로저가 아니라 getState()를 직접 읽는다.
 *
 * 어느 검사든 어긋나면 소리만 0이고 투표 상태의 의미는 그대로다(AC-06).
 * 이 함수는 절대 던지지 않는다.
 */
function playDayVoteSubmitSfx(sfxEvent, requestScope, requestSocket) {
  if (sfxEvent === null || typeof sfxEvent !== "object") return

  // ACK echo가 요청 범위와 다르면 다른 요청의 응답이다.
  if (sfxEvent.gameId !== requestScope.gameId) return
  if (sfxEvent.dayIndex !== requestScope.dayIndex) return

  // 소켓 identity와 연결 상태 — 교체·끊김 뒤 도착한 응답에는 소리를 내지 않는다.
  if (requestSocket !== getSocket() || requestSocket?.connected !== true) return

  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  // 서버가 수신 경계에서 확인한 계정과 현재 인증 계정이 모두 일치해야 한다.
  if (sfxEvent.accountId !== accountId) return

  const latest = useInGameStore.getState()
  if (latest.gameId !== requestScope.gameId) return
  const state = latest.state
  if (!state) return
  if (state.dayIndex !== requestScope.dayIndex) return
  if (state.phase !== "DAY") return
  // 라운드가 넘어갔으면(재투표 시작) 이 제출은 지난 라운드의 것이다.
  if (getDayVoteRound(state) !== sfxEvent.round) return

  // actor 본인이 지금도 이 게임의 생존 참가자여야 한다.
  const actorUuid = state.self?.uuid
  if (actorUuid !== accountId) return
  const players = Array.isArray(state.players) ? state.players : []
  if (players.find((player) => player?.uuid === actorUuid)?.alive !== true) return

  dispatchSfxEvent({
    kind: "day-vote-submitted",
    eventId: sfxEvent.eventId,
    accountId,
    gameId: requestScope.gameId,
    origin: "live",
  })
}

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
  const dayVoteRound = useInGameStore((s) => getDayVoteRound(s.state))
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [state, setState] = useState(INITIAL_DAY_VOTE_SUBMIT_STATE)
  const controllerRef = useRef(null)

  // socket 하나당 controller 하나 — socket이 바뀌면 이전 controller를 dispose()하고 새로 만든다.
  useEffect(() => {
    if (!socket) return undefined

    const controller = createDayVoteSubmitController({
      emitWithAck: (payload) => socket.emitWithAck("cast_day_vote", payload),
      onStateChange: setState,
      // 이 controller는 이 socket 하나에 바인딩돼 있으므로 요청 시점 소켓 = 이 socket이다.
      onAccepted: (sfxEvent, requestScope) => playDayVoteSubmitSfx(sfxEvent, requestScope, socket),
    })
    controllerRef.current = controller
    setState(controller.getState())

    return () => {
      controller.dispose()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // 재투표는 phase/dayIndex가 같으므로 round도 요청·표시 상태의 경계에 포함한다.
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, phase, dayIndex, dayVoteRound])

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

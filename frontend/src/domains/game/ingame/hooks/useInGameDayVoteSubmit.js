// 낮 투표 제출 훅: 컨트롤러로 투표 보내기, 받아들여지면 제출 효과음
// 행동 패널·카드 메뉴가 사용, 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import { createDayVoteSubmitController } from "../utils/createDayVoteSubmitController.js"
import { INITIAL_DAY_VOTE_SUBMIT_STATE } from "../utils/computeDayVoteSubmitPatch.js"
import { getDayVoteRound } from "../utils/dayVoteRound.js"
import { onDisconnect } from "../socket/connection.js"
import { emitDayVote } from "../socket/day.js"

// 제출 효과음: 보낸 판·날짜·회차·소켓·본인이 그대로이고 살아 있을 때만
function playDayVoteSubmitSfx(sfxEvent, requestScope, requestSocket) {
  if (sfxEvent === null || typeof sfxEvent !== "object") return

  if (sfxEvent.gameId !== requestScope.gameId) return
  if (sfxEvent.dayIndex !== requestScope.dayIndex) return

  if (requestSocket !== getSocket() || requestSocket?.connected !== true) return

  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  if (sfxEvent.accountId !== accountId) return

  const latest = useInGameStore.getState()
  if (latest.gameId !== requestScope.gameId) return
  const state = latest.state
  if (!state) return
  if (state.dayIndex !== requestScope.dayIndex) return
  if (state.phase !== "DAY") return
  if (getDayVoteRound(state) !== sfxEvent.round) return

  const actorUuid = state.self?.uuid
  if (actorUuid !== accountId) return
  const players = Array.isArray(state.players) ? state.players : []
  if (players.find((player) => player?.uuid === actorUuid)?.alive !== true) return

  dispatchSfxEvent({
    kind: "day-vote-submitted",
    eventId: sfxEvent.eventId,
    accountId,
    gameId: requestScope.gameId,
    origin: sfxEvent.origin,
  })
}

export function useInGameDayVoteSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const dayVoteRound = useInGameStore((s) => getDayVoteRound(s.state))
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [state, setState] = useState(INITIAL_DAY_VOTE_SUBMIT_STATE)
  const controllerRef = useRef(null)

  const serverHasSubmitted = useInGameStore((s) => s.state?.self?.hasSubmittedDayVote)
  const serverSubmittedTargetId = useInGameStore((s) => s.state?.self?.dayVoteTargetUuid)
  const serverSubmissionRound = useInGameStore((s) => s.state?.self?.dayVoteRound)
  const participationRevision = useInGameStore((s) => s.state?.participationRevision ?? 0)

  useEffect(() => {
    if (!socket) return undefined

    const controller = createDayVoteSubmitController({
      emitWithAck: (payload) => emitDayVote(socket, payload),
      onStateChange: setState,
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

  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, phase, dayIndex, dayVoteRound])

  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => controllerRef.current?.invalidate("DISCONNECT"))
    return () => {
      offDisconnect()
    }
  }, [socket])

  useEffect(() => {
    if (participationRevision <= 0) return
    controllerRef.current?.invalidate("PARTICIPATION_CHANGE")
  }, [participationRevision])

  const submitDayVote = (targetId) => {
    controllerRef.current?.submit({ gameId, dayIndex, targetId })
  }

  // 서버가 이번 회차 제출 여부를 주면 그 값을 먼저 씀
  const serverOwnsSubmission = typeof serverHasSubmitted === "boolean"
    && (!Number.isInteger(serverSubmissionRound) || serverSubmissionRound === dayVoteRound)

  return {
    status: state.status,
    error: state.error,
    hasSubmitted: serverOwnsSubmission ? serverHasSubmitted : state.hasSubmitted,
    lastSubmittedTargetId: serverOwnsSubmission
      ? (serverHasSubmitted ? (serverSubmittedTargetId ?? null) : null)
      : state.lastSubmittedTargetId,
    submitDayVote,
  }
}

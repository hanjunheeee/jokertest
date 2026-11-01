// 재판 투표 제출 훅: 컨트롤러로 유죄·무죄 보내기, 받아들여지면 제출 효과음
// 행동 패널·카드 메뉴가 사용, 끊김 받기는 socket/connection.js를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import { createTribunalVoteSubmitController } from "../utils/createTribunalVoteSubmitController.js"
import { INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE } from "../utils/computeTribunalVoteSubmitPatch.js"
import { onDisconnect } from "../socket/connection.js"

const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

// 제출 효과음: 보낸 판·날짜·본인이 그대로이고 재판 중일 때만
function playSubmitSfx(sfxEvent, requestScope) {
  if (sfxEvent === null || typeof sfxEvent !== "object") return
  if (sfxEvent.gameId !== requestScope.gameId) return
  if (sfxEvent.dayIndex !== requestScope.dayIndex) return

  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  if (sfxEvent.accountId !== accountId) return

  const latest = useInGameStore.getState()
  if (latest.gameId !== requestScope.gameId) return
  if (latest.state?.dayIndex !== requestScope.dayIndex) return
  if (latest.state?.phase !== "TRIBUNAL") return
  if (latest.state?.self?.uuid !== accountId) return

  dispatchSfxEvent({
    kind: "tribunal-vote-submitted",
    eventId: sfxEvent.eventId,
    accountId,
    gameId: requestScope.gameId,
    origin: sfxEvent.origin,
  })
}

// 스토어의 지금 값으로 재판 투표 범위 만들기 (컨트롤러가 응답 때 비교)
export function buildLatestTribunalVoteContext() {
  const storeState = useInGameStore.getState()
  const latestGameId = storeState.gameId
  const latestPhase = storeState.state?.phase
  const latestDayIndex = storeState.state?.dayIndex
  const latestDefendantUuid = storeState.state?.tribunal?.defendantUuid
  const actorUuid = storeState.state?.self?.uuid
  const players = storeState.state?.players
  const selfPlayer = Array.isArray(players) ? players.find((player) => player?.uuid === actorUuid) : undefined
  const latestAlive = selfPlayer?.alive === true
  const latestIsDefendant = Boolean(actorUuid) && actorUuid === latestDefendantUuid

  return {
    gameId: latestGameId,
    dayIndex: latestDayIndex,
    phase: latestPhase,
    alive: latestAlive,
    isDefendant: latestIsDefendant,
    defendantUuid: latestDefendantUuid,
    actorUuid,
  }
}

export function useInGameTribunalVoteSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid)
  const actorUuid = useInGameStore((s) => s.state?.self?.uuid)
  const alive = useInGameStore((s) => {
    const uuid = s.state?.self?.uuid
    const players = s.state?.players
    const player = Array.isArray(players) ? players.find((p) => p?.uuid === uuid) : undefined
    return player?.alive === true
  })
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const isDefendant = Boolean(actorUuid) && actorUuid === defendantUuid

  const [state, setState] = useState(INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE)
  const controllerRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const controller = createTribunalVoteSubmitController({
      getSocket,
      onStateChange: (next) => {
        if (isMountedRef.current) setState(next)
      },
      getLatestContext: () => buildLatestTribunalVoteContext(),
      onAccepted: playSubmitSfx,
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
  }, [gameId, dayIndex, phase, alive, isDefendant, defendantUuid, actorUuid])

  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => controllerRef.current?.invalidate("DISCONNECT"))
    return () => {
      offDisconnect()
    }
  }, [socket])

  const submitTribunalVote = (vote) => {
    if (!VALID_VOTES.has(vote)) return
    if (state.status !== "idle") return
    const canonicalActorUuid = useInGameStore.getState().state?.self?.uuid
    controllerRef.current?.submit({ gameId, dayIndex, vote, defendantUuid, actorUuid: canonicalActorUuid })
  }

  // 서버가 진행 수·제출 여부를 주면 그 값을 먼저 씀
  const serverProgress = useInGameStore((s) => s.state?.progress ?? null)
  const serverHasSubmitted = useInGameStore((s) => s.state?.self?.hasSubmittedTribunalVote)
  const serverOwnsProgress = serverProgress?.kind === "TRIBUNAL"

  return {
    status: state.status,
    submittedVote: state.submittedVote,
    error: state.error,
    alive,
    isDefendant,
    hasSubmitted: typeof serverHasSubmitted === "boolean"
      ? serverHasSubmitted
      : state.submittedVote !== null,
    voteCount: serverOwnsProgress ? serverProgress.doneCount : null,
    requiredCount: serverOwnsProgress ? serverProgress.requiredCount : null,
    submitTribunalVote,
  }
}

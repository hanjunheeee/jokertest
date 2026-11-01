// 행동 패널 훅 입구: 밤 행동·낮 준비/투표/판정·재판 투표/판정 요청 훅을 모아 한 값으로 냄
// 조작 Provider(InGameActionProvider)가 컨텍스트 값으로 씀 (판정 계산은 utils/dayVoteResolve.js)
import { useEffect, useMemo, useState } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectInGameNightTurnRole, isInGameNightTurnActor } from "../utils/nightTurn.js"
import { getDayVoteRound } from "../utils/dayVoteRound.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "../utils/dayPhase.js"
import { computePanelLocks } from "../utils/actionPanelLocks.js"
import { useInGameNightActionSubmit } from "./useInGameNightActionSubmit.js"
import { useInGameDayVoteSubmit } from "./useInGameDayVoteSubmit.js"
import { useInGameTribunalVoteSubmit } from "./useInGameTribunalVoteSubmit.js"
import { useInGameResolveNight } from "./useInGameResolveNight.js"
import { useInGameTribunalVoteResolve } from "./useInGameTribunalVoteResolve.js"
import { useInGameDayDiscussionReady } from "./useInGameDayDiscussionReady.js"
import { useActionTargets } from "./actionPanel/useActionTargets.js"
import { useDayVoteResolve } from "./actionPanel/useDayVoteResolve.js"

export {
  computeDayVoteResolveAckPatch,
  computeDayVoteResolveInvalidatePatch,
  parseDayVoteResolvedPayload,
  shouldApplyDayVoteResolvedPayload,
} from "../utils/dayVoteResolve.js"

// 요청 훅 부르는 순서가 effect 순서이므로 바꾸지 않음
export function useInGameActionPanel({ interactionBlocked = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)

  const [selectedNightTargetId, setSelectedNightTargetId] = useState(null)
  const [selectedDayVoteTargetId, setSelectedDayVoteTargetId] = useState(null)

  const myRole = gameState?.self?.role
  const dayIndex = gameState?.dayIndex
  const dayPhase = resolveInGameDayPhase(gameState)
  const dayVoteRound = getDayVoteRound(gameState)

  // 판·날짜·회차가 바뀌면 고른 투표 대상 비움
  useEffect(() => {
    setSelectedDayVoteTargetId(null)
  }, [gameId, dayIndex, dayVoteRound])

  const { nightActionTargets, dayVoteTargets, selfAliveForControls } = useActionTargets(gameState)

  // 최근 사건 6개 (새 것 먼저)
  const latestEvents = useMemo(
    () => [...(gameState?.events ?? [])].slice(-6).reverse(),
    [gameState?.events],
  )

  const nightActionType = getInGameNightActionType(myRole, dayIndex)
  const nightActionLabel = getInGameNightActionLabel(myRole, dayIndex)
  const hasTarget = Boolean(selectedNightTargetId)

  const nightActionSubmit = useInGameNightActionSubmit()
  const dayVoteSubmit = useInGameDayVoteSubmit()
  const resolveNightRequest = useInGameResolveNight()

  const isGameEnded = gameState?.phase === "ENDED"
  const dayVoteResolve = useDayVoteResolve({
    gameId,
    dayIndex,
    dayVoteRound,
    open: !interactionBlocked &&
      !isGameEnded &&
      gameState?.phase === "DAY" &&
      dayPhase === INGAME_DAY_PHASES.VOTE,
  })

  const dayReady = useInGameDayDiscussionReady()
  const tribunalVoteSubmit = useInGameTribunalVoteSubmit()
  const tribunalResolveRequest = useInGameTribunalVoteResolve()

  const nightTurnRole = selectInGameNightTurnRole(gameState ?? null)
  const isNightTurnActor = isInGameNightTurnActor(nightTurnRole, myRole)
  const locks = computePanelLocks({
    interactionBlocked,
    gameState,
    gameId,
    dayIndex,
    dayPhase,
    selfAliveForControls,
    isNightTurnActor,
    resolveNightStatus: resolveNightRequest.status,
    dayVoteResolveStatus: dayVoteResolve.status,
    dayReadyStatus: dayReady.status,
    tribunalVoteSubmit,
    tribunalResolveStatus: tribunalResolveRequest.status,
    connected: Boolean(getSocket()?.connected),
  })

  // 고른 대상으로 투표, 기권은 null
  const submitDayVote = () => {
    if (!selectedDayVoteTargetId) return
    dayVoteSubmit.submitDayVote(selectedDayVoteTargetId)
  }
  const abstainDayVote = () => {
    dayVoteSubmit.submitDayVote(null)
  }

  const resolveTribunalVote = () => {
    tribunalResolveRequest.resolveTribunalVote()
  }

  // 고른 대상으로 밤 행동, 건너뛰기는 null
  const submitNightAction = () => {
    nightActionSubmit.submit(selectedNightTargetId ?? null)
  }
  const skipNightAction = () => {
    nightActionSubmit.submit(null)
  }

  // 서버가 이미 행동했다고 하거나, 이번에 낸 적이 있으면 제출한 것으로 봄
  const nightActionHasSubmitted =
    gameState?.self?.hasActedThisPhase === true || nightActionSubmit.hasSubmitted === true

  return {
    gameState,
    error,
    interactionBlocked,
    selectedNightTargetId,
    setSelectedNightTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus: nightActionSubmit.status,
    nightActionError: nightActionSubmit.error,
    nightActionLastSubmittedTargetId: nightActionSubmit.lastSubmittedTargetId,
    nightActionHasSubmitted,
    selectedDayVoteTargetId,
    setSelectedDayVoteTargetId,
    dayPhase,
    dayVoteTargets,
    dayVoteControlsEnabled: locks.dayVoteControlsEnabled,
    dayReadyStatus: dayReady.status,
    dayReadyError: dayReady.error,
    dayReadyCount: dayReady.readyCount,
    dayReadyRequired: dayReady.requiredCount,
    dayReadyControlsEnabled: locks.dayReadyControlsEnabled,
    selfAliveForControls,
    submitDayReady: dayReady.submitReady,
    submitDayVote,
    abstainDayVote,
    dayVoteStatus: dayVoteSubmit.status,
    dayVoteError: dayVoteSubmit.error,
    dayVoteHasSubmitted: dayVoteSubmit.hasSubmitted,
    dayVoteLastSubmittedTargetId: dayVoteSubmit.lastSubmittedTargetId,
    resolveDayVote: dayVoteResolve.resolve,
    dayVoteResolveStatus: dayVoteResolve.status,
    dayVoteResolveError: dayVoteResolve.error,
    dayVoteResolution: dayVoteResolve.resolution,
    dayVoteResolveLocked: locks.dayVoteResolveLocked,
    dayVoteResolveControlsEnabled: dayVoteResolve.controlsEnabled,
    submitTribunalVote: tribunalVoteSubmit.submitTribunalVote,
    tribunalVoteStatus: tribunalVoteSubmit.status,
    tribunalVoteError: tribunalVoteSubmit.error,
    tribunalVoteSubmittedVote: tribunalVoteSubmit.submittedVote,
    tribunalVoteHasSubmitted: tribunalVoteSubmit.hasSubmitted,
    tribunalVoteIsDefendant: tribunalVoteSubmit.isDefendant,
    tribunalVoteAlive: tribunalVoteSubmit.alive,
    tribunalVoteControlsEnabled: locks.tribunalVoteControlsEnabled,
    resolveTribunalVote,
    tribunalResolveStatus: tribunalResolveRequest.status,
    tribunalResolveError: tribunalResolveRequest.error,
    tribunalResolveOutcome: gameState?.tribunal?.outcome ?? tribunalResolveRequest.outcome,
    tribunalResolveCounts: gameState?.tribunal?.counts ?? tribunalResolveRequest.counts,
    tribunalResolveExecutedUuid: gameState?.tribunal?.executedUuid ?? tribunalResolveRequest.executedUuid,
    tribunalResolveLocked: locks.tribunalResolveLocked,
    tribunalResolveControlsEnabled: locks.tribunalResolveControlsEnabled,
    submitNightAction,
    skipNightAction,
    nightActionAlive: locks.nightActionAlive,
    nightActionsLocked: locks.nightActionsLocked,
    nightTurnRole,
    isNightTurnActor,
    resolveNight: resolveNightRequest.resolveNight,
    resolveNightStatus: resolveNightRequest.status,
    resolveNightError: resolveNightRequest.error,
    nightActionResult: resolveNightRequest.nightActionResult,
  }
}

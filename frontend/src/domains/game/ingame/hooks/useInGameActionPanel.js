import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
  isSelfTargetAllowedForNightAction,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { buildNightActionTargets } from "../utils/buildNightActionTargets.js"
import { buildDayVoteTargets } from "../utils/buildDayVoteTargets.js"
import { resolveInGameSelfAliveForControls } from "../utils/selectInGameSelfAlive.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
import { isInGameNightTurnActor } from "../utils/isInGameNightTurnActor.js"
import { useInGameNightActionSubmit } from "./useInGameNightActionSubmit.js"
import { useInGameDayVoteSubmit } from "./useInGameDayVoteSubmit.js"
import { useInGameTribunalVoteSubmit } from "./useInGameTribunalVoteSubmit.js"
import { useInGameResolveNight } from "./useInGameResolveNight.js"
import { useInGameTribunalVoteResolve } from "./useInGameTribunalVoteResolve.js"
import { useInGameDayDiscussionReady } from "./useInGameDayDiscussionReady.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../utils/dayVoteRound.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "../utils/resolveInGameDayPhase.js"

const DAY_VOTE_RESOLVE_TIMEOUT_MS = 5000

export function computeDayVoteResolveAckPatch(response) {
  if (response?.ok) {
    return {
      status: response.outcome === "REVOTE" ? "idle" : "resolved",
      error: null,
      resolution: { outcome: response.outcome ?? null, tribunalTargetUuid: response.tribunalTargetUuid ?? null },
    }
  }
  return { status: "idle", error: response?.message ?? "?먯젙?섏? 紐삵뻽?듬땲??", resolution: null }
}

export function shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false
  if (!Number.isInteger(dayIndex)) return false
  if (payload.gameId !== gameId) return false
  if (payload.dayIndex !== dayIndex) return false
  return true
}

const DAY_VOTE_RESOLVED_OUTCOMES = new Set(["TRIBUNAL", "TIE", "ABSTAINED", "REVOTE"])
const DAY_VOTE_RESOLVED_PHASES = new Set(["NIGHT", "TRIBUNAL", "DAY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

export function parseDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex })) return null
  if (!DAY_VOTE_RESOLVED_PHASES.has(payload.phase)) return null
  if (!DAY_VOTE_RESOLVED_OUTCOMES.has(payload.outcome)) return null
  if (!isNonNegativeInteger(payload.publicVoteCount)) return null
  if (!isNonNegativeInteger(payload.publicAbstainCount)) return null
  if (payload.publicAbstainCount > payload.publicVoteCount) return null
  const roundFields = parseDayVoteRoundFields(payload)
  if (!roundFields) return null

  if (payload.outcome === "REVOTE") {
    if (payload.phase !== "DAY" || payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  } else if (payload.outcome === "TRIBUNAL") {
    if (payload.phase !== "TRIBUNAL") return null
    if (typeof payload.tribunalTargetUuid !== "string" || payload.tribunalTargetUuid.length === 0) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  } else if (payload.outcome === "TIE") {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  } else {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount !== payload.publicAbstainCount) return null
  }

  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    phase: payload.phase,
    outcome: payload.outcome,
    tribunalTargetUuid: payload.outcome === "TRIBUNAL" ? payload.tribunalTargetUuid : null,
    publicVoteCount: payload.publicVoteCount,
    publicAbstainCount: payload.publicAbstainCount,
    ...roundFields,
  }
}

export function computeDayVoteResolveInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, resolution: null }
}

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
  const dayVoteExcludedUuids = gameState?.dayVoteExcludedUuids

  useEffect(() => {
    setSelectedDayVoteTargetId(null)
  }, [gameId, dayIndex, dayVoteRound])

  const { players: sessionPlayers, localPlayerId } = useInGamePlayerSessionContext()
  const nightActionTargets = useMemo(
    () =>
      buildNightActionTargets(sessionPlayers, {
        localPlayerId,
        selfTargetAllowed: isSelfTargetAllowedForNightAction(myRole),
        role: myRole,
      }),
    [sessionPlayers, localPlayerId, myRole],
  )

  const dayVoteTargets = useMemo(
    () => buildDayVoteTargets(sessionPlayers, { localPlayerId, excludedUuids: dayVoteExcludedUuids }),
    [sessionPlayers, localPlayerId, dayVoteExcludedUuids],
  )
  const localSessionPlayer = sessionPlayers?.find((player) => player.id === localPlayerId)

  const selfAliveForControls = resolveInGameSelfAliveForControls(gameState ?? null, localSessionPlayer)

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

  const dayVoteResolveSocket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const [dayVoteResolveStatus, setDayVoteResolveStatus] = useState("idle") // idle | resolving | resolved
  const [dayVoteResolveError, setDayVoteResolveError] = useState(null)
  const [dayVoteResolution, setDayVoteResolution] = useState(null) // { outcome, tribunalTargetUuid } | null
  const dayVoteAckingRef = useRef(false)
  const dayVoteVersionRef = useRef(0)
  const dayVoteMountedRef = useRef(true)

  useEffect(() => {
    dayVoteMountedRef.current = true
    return () => {
      dayVoteMountedRef.current = false
    }
  }, [])

  const invalidateDayVoteResolve = () => {
    dayVoteVersionRef.current += 1
    dayVoteAckingRef.current = false
    const patch = computeDayVoteResolveInvalidatePatch(dayVoteMountedRef.current)
    if (!patch) return
    setDayVoteResolveStatus(patch.status)
    setDayVoteResolveError(patch.error)
    setDayVoteResolution(patch.resolution)
  }

  useEffect(() => {
    if (!dayVoteResolveSocket) return
    const handleDisconnect = () => invalidateDayVoteResolve()
    dayVoteResolveSocket.on("disconnect", handleDisconnect)
    return () => {
      dayVoteResolveSocket.off("disconnect", handleDisconnect)
      invalidateDayVoteResolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayVoteResolveSocket])

  useEffect(() => {
    invalidateDayVoteResolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, dayVoteRound])

  useEffect(() => {
    if (!dayVoteResolveSocket || !gameId) return
    const handleDayVoteResolved = (payload) => {
      const parsed = parseDayVoteResolvedPayload({ payload, gameId, dayIndex })
      if (!parsed) return
      if ((parsed.round ?? 1) !== dayVoteRound) return
      dayVoteVersionRef.current += 1
      dayVoteAckingRef.current = false
      if (!dayVoteMountedRef.current) return
      setDayVoteResolveStatus(parsed.outcome === "REVOTE" ? "idle" : "resolved")
      setDayVoteResolveError(null)
      setDayVoteResolution({ outcome: parsed.outcome, tribunalTargetUuid: parsed.tribunalTargetUuid })
    }
    dayVoteResolveSocket.on("day_vote_resolved", handleDayVoteResolved)
    return () => {
      dayVoteResolveSocket.off("day_vote_resolved", handleDayVoteResolved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayVoteResolveSocket, gameId, dayIndex, dayVoteRound])

  const isGameEnded = gameState?.phase === "ENDED"

  const dayVoteResolveLocked = dayVoteResolveStatus !== "idle" || interactionBlocked
  const dayVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.VOTE &&
    selfAliveForControls &&
    !dayVoteResolveLocked
  const nightActionAlive = selfAliveForControls
  const nightTurnRole = selectInGameNightTurnRole(gameState ?? null)
  const isNightTurnActor = isInGameNightTurnActor(nightTurnRole, myRole)
  const nightActionsLocked =
    interactionBlocked ||
    isGameEnded ||
    !nightActionAlive ||
    !isNightTurnActor ||
    resolveNightRequest.status !== "idle" ||
    gameState?.phase !== "NIGHT"

  const submitDayVote = () => {
    if (!selectedDayVoteTargetId) return
    dayVoteSubmit.submitDayVote(selectedDayVoteTargetId)
  }

  const abstainDayVote = () => {
    dayVoteSubmit.submitDayVote(null)
  }

  const dayVoteResolveControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.VOTE &&
    dayVoteResolveStatus === "idle"

  const resolveDayVote = () => {
    if (!dayVoteResolveControlsEnabled) return
    if (dayVoteAckingRef.current || dayVoteResolveStatus !== "idle") return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setDayVoteResolveError("?쒕쾭 ?곌껐???뺤씤?????놁뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.")
      return
    }
    if (!gameId || !Number.isInteger(dayIndex)) return

    dayVoteVersionRef.current += 1
    const requestVersion = dayVoteVersionRef.current
    const requestGameId = gameId
    const requestDayIndex = dayIndex
    const requestRound = dayVoteRound

    dayVoteAckingRef.current = true
    setDayVoteResolveStatus("resolving")
    setDayVoteResolveError(null)

    const isStale = () =>
      !dayVoteMountedRef.current ||
      requestVersion !== dayVoteVersionRef.current ||
      requestSocket !== getSocket() ||
      !requestSocket.connected ||
      requestGameId !== useInGameStore.getState().gameId ||
      requestDayIndex !== useInGameStore.getState().state?.dayIndex ||
      requestRound !== getDayVoteRound(useInGameStore.getState().state)

    requestSocket
      .timeout(DAY_VOTE_RESOLVE_TIMEOUT_MS)
      .emitWithAck("resolve_day_vote", { gameId: requestGameId, dayIndex: requestDayIndex })
      .then((response) => {
        if (isStale()) return
        const patch = computeDayVoteResolveAckPatch(response)
        setDayVoteResolveStatus(patch.status)
        setDayVoteResolveError(patch.error)
        setDayVoteResolution(patch.resolution)
      })
      .catch(() => {
        if (!isStale()) {
          setDayVoteResolveStatus("idle")
          setDayVoteResolveError("?붿껌???묐떟?섏? ?딆뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂.")
        }
      })
      .finally(() => {
        if (requestVersion === dayVoteVersionRef.current) {
          dayVoteAckingRef.current = false
        }
      })
  }

  const dayReady = useInGameDayDiscussionReady()
  const dayReadyControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.DISCUSSION &&
    selfAliveForControls &&
    dayReady.status === "idle"

  const tribunalVoteSubmit = useInGameTribunalVoteSubmit()

  const tribunalResolveRequest = useInGameTribunalVoteResolve()

  const tribunalResolveLocked =
    interactionBlocked || tribunalResolveRequest.status !== "idle" || gameState?.tribunal?.resolved === true

  const tribunalVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalVoteSubmit.isDefendant &&
    tribunalVoteSubmit.alive &&
    tribunalVoteSubmit.status === "idle" &&
    !tribunalResolveLocked &&
    Boolean(getSocket()?.connected)

  const resolveTribunalVote = () => {
    tribunalResolveRequest.resolveTribunalVote()
  }

  const tribunalResolveControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalResolveLocked &&
    Boolean(getSocket()?.connected)

  const submitNightAction = () => {
    nightActionSubmit.submit(selectedNightTargetId ?? null)
  }

  const skipNightAction = () => {
    nightActionSubmit.submit(null)
  }

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
    dayVoteControlsEnabled,
    dayReadyStatus: dayReady.status,
    dayReadyError: dayReady.error,
    dayReadyCount: dayReady.readyCount,
    dayReadyRequired: dayReady.requiredCount,
    dayReadyControlsEnabled,
    selfAliveForControls,
    submitDayReady: dayReady.submitReady,
    submitDayVote,
    abstainDayVote,
    dayVoteStatus: dayVoteSubmit.status,
    dayVoteError: dayVoteSubmit.error,
    dayVoteHasSubmitted: dayVoteSubmit.hasSubmitted,
    dayVoteLastSubmittedTargetId: dayVoteSubmit.lastSubmittedTargetId,
    resolveDayVote,
    dayVoteResolveStatus,
    dayVoteResolveError,
    dayVoteResolution,
    dayVoteResolveLocked,
    dayVoteResolveControlsEnabled,
    submitTribunalVote: tribunalVoteSubmit.submitTribunalVote,
    tribunalVoteStatus: tribunalVoteSubmit.status,
    tribunalVoteError: tribunalVoteSubmit.error,
    tribunalVoteSubmittedVote: tribunalVoteSubmit.submittedVote,
    tribunalVoteHasSubmitted: tribunalVoteSubmit.hasSubmitted,
    tribunalVoteIsDefendant: tribunalVoteSubmit.isDefendant,
    tribunalVoteAlive: tribunalVoteSubmit.alive,
    tribunalVoteControlsEnabled,
    resolveTribunalVote,
    tribunalResolveStatus: tribunalResolveRequest.status,
    tribunalResolveError: tribunalResolveRequest.error,
    tribunalResolveOutcome: gameState?.tribunal?.outcome ?? tribunalResolveRequest.outcome,
    tribunalResolveCounts: gameState?.tribunal?.counts ?? tribunalResolveRequest.counts,
    tribunalResolveExecutedUuid: gameState?.tribunal?.executedUuid ?? tribunalResolveRequest.executedUuid,
    tribunalResolveLocked,
    tribunalResolveControlsEnabled,
    submitNightAction,
    skipNightAction,
    nightActionAlive,
    nightActionsLocked,
    nightTurnRole,
    isNightTurnActor,
    resolveNight: resolveNightRequest.resolveNight,
    resolveNightStatus: resolveNightRequest.status,
    resolveNightError: resolveNightRequest.error,
    nightActionResult: resolveNightRequest.nightActionResult,
  }
}

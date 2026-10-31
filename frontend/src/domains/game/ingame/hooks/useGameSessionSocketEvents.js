import { useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useMatchingStore, isCurrentRoomKickEvent } from "../../matching/store/matchingStore.js"
import { rememberPartyMatchingRoomReady } from "../../matching/utils/partyMatchingRejoin.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { refreshAccountCaches, ACCOUNT_CACHE_SCOPES } from "../../../user/utils/accountCacheRefresh.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import {
  getInGameIdentityScopeVersion,
  isCurrentGameKickEvent,
  noteInGameConnectionRebound,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "../store/inGameEmojiBubble.store.js"
import { createGameEndedHandler } from "../utils/createGameEndedHandler.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createSelfDisconnectHandler } from "../utils/createSelfDisconnectHandler.js"
import { parseNightResultAppliedPayload } from "../utils/parseNightResultAppliedPayload.js"
import { parseInGameNightPrivateResultPayload } from "../utils/reduceInGameNightPrivateResult.js"
import { selectInGameSelfAlive } from "../utils/selectInGameSelfAlive.js"
import { parseDayPhaseChangedPayload } from "../utils/parseDayPhaseChangedPayload.js"
import { parseNightTurnStartedPayload } from "../utils/parseNightTurnStartedPayload.js"
import { parseNightTurnEndedPayload } from "../utils/parseNightTurnEndedPayload.js"
import { attachNightTurnSocketListeners } from "../utils/attachNightTurnSocketListeners.js"
import { parsePlayerEliminatedPayload } from "../utils/parsePlayerEliminatedPayload.js"
import { parseDayVoteResolvedPayload } from "./useInGameActionPanel.js"

const VALID_WINNERS = new Set(["CITIZEN", "JOKER"])

function currentAccountId() {
  const { user, isLoggedIn } = useAuthStore.getState()
  return isLoggedIn && user?.uuid ? user.uuid : null
}

function currentReceiptScope() {
  return readInGameReceiptScope({
    accountId: currentAccountId(),
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
}

function isRegistrationScopeCurrent(registered) {
  const now = currentReceiptScope()
  if (registered.socketEpoch !== now.socketEpoch) return false
  if (registered.socketId !== now.socketId) return false
  if (registered.socketConnected !== now.socketConnected) return false
  if (registered.accountId !== null) {
    if (registered.accountId !== now.accountId) return false
    if (registered.identityGeneration !== now.identityGeneration) return false
  }
  if (registered.gameId === null) return true
  if (registered.gameId !== now.gameId) return false
  if (registered.membershipId !== now.membershipId) return false
  if (registered.membershipEpoch !== now.membershipEpoch) return false
  return true
}

function playGameSfx(kind, eventId, gameId, origin = "live") {
  if (typeof eventId !== "string" || eventId.length === 0) return
  if (typeof gameId !== "string" || gameId.length === 0) return
  const accountId = currentAccountId()
  if (accountId === null) return
  dispatchSfxEvent({ kind, eventId, accountId, gameId, origin })
}

function dispatchResultSfxIfEnded(origin = "live") {
  const current = useInGameStore.getState()
  if (!current.gameId || !current.state) return
  if (current.state.phase !== "ENDED") return
  if (!VALID_WINNERS.has(current.state.winResult?.winner)) return
  playGameSfx("game-result", `game:${current.gameId}:result`, current.gameId, origin)
}

function requestAccountCacheRefresh(scopes, options) {
  if (currentAccountId() === null) return
  refreshAccountCaches(scopes, options)
}

function buildFinalizer(navigate) {
  return createSessionEndFinalizer({
    clearGame: () => useInGameStore.getState().clearGame(),
    clearRoom: () => useMatchingStore.getState().clearRoom(),
    navigate,
  })
}

export function useGameSessionSocketEvents() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => {
      setConnectSeq((current) => current + 1)
      noteInGameConnectionRebound()
      useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
    }
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  useEffect(() => {
    if (!socket) return
    const registeredScope = currentReceiptScope()
    const finalize = buildFinalizer(navigate)
    const handleGameEnded = createGameEndedHandler({
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })
    const handlePhaseChanged = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const before = useInGameStore.getState().state
      useInGameStore.getState().applyPhaseChanged(payload)
      const after = useInGameStore.getState()
      if (after.state === before) return
      playGameSfx(
        "game-phase-changed",
        `game:${after.gameId}:phase:${after.state.phase}:${after.state.dayIndex}`,
        after.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    const handleNightResultApplied = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const canonicalPlayerIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const previouslyDeadUuids = new Set((current.state.players ?? []).filter((p) => p.alive === false).map((p) => p.uuid))
      const parsed = parseNightResultAppliedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        canonicalPlayerIds,
        previouslyDeadUuids,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightResultAppliedPayload(parsed, currentReceiptScope())
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    const handleNightActionResult = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseInGameNightPrivateResultPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        phase: current.state.phase,
        selfRole: current.state.self?.role ?? null,
        selfUuid: current.state.self?.uuid ?? null,
        selfAlive: selectInGameSelfAlive(current.state),
      })
      if (!parsed) return
      useInGameStore.getState().setNightPrivateResult(parsed)

      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      const accountId = currentAccountId()
      if (accountId === null || envelope.accountId !== accountId) return
      if (envelope.gameId !== current.gameId) return
      const kind = parsed.actionType === "ASSASSINATE" ? "night-private-failure" : "night-private-result"
      playGameSfx(kind, envelope.eventId, current.gameId, envelope.origin ?? "restore")
    }

    const handleDayVoteResolved = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayVoteResolvedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore
        .getState()
        .applyDayVoteResolvedToPhase(current.gameId, parsed.dayIndex, {
          ...parsed,
          outcome: parsed.outcome,
          defendantUuid: parsed.tribunalTargetUuid,
        })

      const round = Number.isInteger(parsed.round) ? parsed.round : 1
      playGameSfx(
        "day-vote-resolved",
        `game:${current.gameId}:day:${parsed.dayIndex}:round:${round}:day-resolved`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    const handleDayPhaseChanged = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayPhaseChangedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyDayPhaseChanged(parsed)
      playGameSfx(
        "day-phase-changed",
        `game:${current.gameId}:day:${parsed.dayIndex}:dayphase:${parsed.dayPhase}`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    const handleNightTurnStarted = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnStartedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnStarted(parsed)
      playGameSfx(
        "night-turn-started",
        `game:${current.gameId}:day:${parsed.dayIndex}:nightturn:${parsed.role}`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    const handleNightTurnEnded = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnEndedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        nightTurnRole: current.state.nightTurnRole,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnEnded(parsed)
    }

    const detachNightTurnListeners = attachNightTurnSocketListeners(socket, {
      onStarted: handleNightTurnStarted,
      onEnded: handleNightTurnEnded,
    })

    const handleTribunalVoteResolved = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const before = useInGameStore.getState().state
      useInGameStore.getState().applyTribunalResolved(payload, currentReceiptScope())
      const after = useInGameStore.getState()
      if (after.state === before || !after.gameId || !after.state) return
      playGameSfx(
        "tribunal-vote-resolved",
        `game:${after.gameId}:day:${after.state.dayIndex}:tribunal-resolved`,
        after.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    const handlePlayerEliminated = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const players = current.state.players ?? []
      const canonicalPlayerIds = new Set(players.map((p) => p.uuid))
      const previouslyDeadUuids = new Set(players.filter((p) => p.alive === false).map((p) => p.uuid))
      const parsed = parsePlayerEliminatedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        phase: current.state.phase,
        canonicalPlayerIds,
        previouslyDeadUuids,
      })
      if (!parsed) return

      const before = current.state
      useInGameStore.getState().applyPlayerEliminated(parsed, currentReceiptScope())
      if (useInGameStore.getState().state === before) return

      const envelope = payload?.sfxEvent
      const eventId =
        envelope !== null && typeof envelope === "object" && typeof envelope.eventId === "string"
          ? envelope.eventId
          : `game:${current.gameId}:day:${parsed.dayIndex}:victim:${parsed.victimUuid}:eliminated`
      playGameSfx("player-eliminated", eventId, current.gameId, envelope ? (envelope.origin ?? "restore") : "live")
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    const handleNightActionSuccess = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      useInGameStore.getState().receiveNightSuccess(payload, currentReceiptScope())
    }

    const handleNightPresentationWait = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      useInGameStore.getState().receiveNightPresentationWait(payload, currentReceiptScope())
    }

    const handleParticipationChanged = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      useInGameStore.getState().applyParticipationChanged(payload)
    }

    const handleSelfProgress = (payload) => {
      if (currentAccountId() === null) return
      useInGameStore.getState().applySelfProgress(payload)
    }

    const handleGameKicked = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      const accountId = currentAccountId()
      if (accountId === null || payload.targetUuid !== accountId) return
      if (!isCurrentGameKickEvent(useInGameStore.getState(), payload)) return
      useInGameStore.getState().clearGame()
      if (useMatchingStore.getState().isInRoom) return
      navigate("/multiplay", { replace: true })
    }

    const handleRoomKicked = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      const accountId = currentAccountId()
      if (accountId === null || payload.targetUuid !== accountId) return
      if (!isCurrentRoomKickEvent(useMatchingStore.getState(), payload)) return
      useMatchingStore.getState().clearRoom()
      if (useInGameStore.getState().gameId !== null) return
      navigate("/multiplay", { replace: true })
    }

    const handleAccountCacheInvalidated = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      requestAccountCacheRefresh(payload.scopes, { invalidate: true })
    }

    const handleEmojiShown = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      const currentGameId = useInGameStore.getState().gameId
      if (typeof currentGameId !== "string" || currentGameId.length === 0) return
      if (payload.gameId !== currentGameId) return
      if (typeof payload.uuid !== "string" || payload.uuid.length === 0) return
      if (typeof payload.itemId !== "string" || payload.itemId.length === 0) return
      useInGameEmojiBubbleStore.getState().setActiveEmoji(payload.uuid, payload.itemId, payload.sentAt)
    }

    const handlePartyMatchingRoomReady = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      rememberPartyMatchingRoomReady(payload)
    }

    socket.on("game_ended", handleGameEnded)
    socket.on("party_matching_room_ready", handlePartyMatchingRoomReady)
    socket.on("emoji_shown", handleEmojiShown)
    socket.on("player_eliminated", handlePlayerEliminated)
    socket.on("session_participation_changed", handleParticipationChanged)
    socket.on("session_self_progress", handleSelfProgress)
    socket.on("game_kicked", handleGameKicked)
    socket.on("room_kicked", handleRoomKicked)
    socket.on("account_cache_invalidated", handleAccountCacheInvalidated)
    socket.on("game_phase_changed", handlePhaseChanged)
    socket.on("night_result_applied", handleNightResultApplied)
    socket.on("night_action_result", handleNightActionResult)
    socket.on("night_action_success", handleNightActionSuccess)
    socket.on("night_presentation_wait", handleNightPresentationWait)
    socket.on("day_vote_resolved", handleDayVoteResolved)
    socket.on("day_phase_changed", handleDayPhaseChanged)
    socket.on("tribunal_vote_resolved", handleTribunalVoteResolved)
    return () => {
      socket.off("game_ended", handleGameEnded)
      socket.off("party_matching_room_ready", handlePartyMatchingRoomReady)
      socket.off("emoji_shown", handleEmojiShown)
      socket.off("player_eliminated", handlePlayerEliminated)
      socket.off("session_participation_changed", handleParticipationChanged)
      socket.off("session_self_progress", handleSelfProgress)
      socket.off("game_kicked", handleGameKicked)
      socket.off("room_kicked", handleRoomKicked)
      socket.off("account_cache_invalidated", handleAccountCacheInvalidated)
      socket.off("game_phase_changed", handlePhaseChanged)
      socket.off("night_result_applied", handleNightResultApplied)
      socket.off("night_action_result", handleNightActionResult)
      socket.off("night_action_success", handleNightActionSuccess)
      socket.off("night_presentation_wait", handleNightPresentationWait)
      socket.off("day_vote_resolved", handleDayVoteResolved)
      socket.off("day_phase_changed", handleDayPhaseChanged)
      detachNightTurnListeners()
      socket.off("tribunal_vote_resolved", handleTribunalVoteResolved)
    }
  }, [socket, navigate, authUuid, identityGeneration, identityScopeVersion, connectSeq])

  useEffect(() => {
    const refresh = () => requestAccountCacheRefresh(ACCOUNT_CACHE_SCOPES)

    const handleVisibility = () => {
      if (typeof document === "undefined") return
      if (document.visibilityState !== "visible") return
      refresh()
    }

    if (socket) socket.on("connect", refresh)
    if (typeof window !== "undefined") window.addEventListener("focus", refresh)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      if (socket) socket.off("connect", refresh)
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [socket])

  useEffect(() => {
    if (!socket || !gameId) return
    const finalize = buildFinalizer(navigate)
    const handleSelfDisconnect = createSelfDisconnectHandler({
      getActiveSocket: getSocket,
      registeredSocket: socket,
      registeredGameId: gameId,
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })

    socket.on("disconnect", handleSelfDisconnect)
    return () => socket.off("disconnect", handleSelfDisconnect)
  }, [socket, gameId, navigate])
}

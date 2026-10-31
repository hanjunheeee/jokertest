import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { InGameActionContext } from "../context/InGameActionContext.jsx"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { isInGameSelfPlayer } from "../utils/isInGameSelfPlayer.js"
import {
  getInGameIdentityScopeVersion,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getDayVoteRound } from "../utils/dayVoteRound.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
import {
  DAY_DISCUSSION_NOTICE,
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "../constants/actions/ingameActionPanel.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "../utils/resolveInGameDayPhase.js"

export const INGAME_CARD_MENU_ITEM_KINDS = Object.freeze({
  DAY_VOTE: "DAY_VOTE",
  DAY_VOTE_CANCEL: "DAY_VOTE_CANCEL",
  TRIBUNAL_GUILTY: "TRIBUNAL_GUILTY",
  TRIBUNAL_NOT_GUILTY: "TRIBUNAL_NOT_GUILTY",
  NIGHT_ACTION: "NIGHT_ACTION",
  NIGHT_ACTION_CANCEL: "NIGHT_ACTION_CANCEL",
})

export const INGAME_CARD_MENU_DAY_VOTE_LABEL = "투표하기"
export const INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL = "투표취소"
export const INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL = "취소하기"
export const INGAME_CARD_MENU_NIGHT_FALLBACK_LABEL = "밤 행동"

export const INGAME_CARD_MENU_DISABLED_REASONS = Object.freeze({
  selfDead: "사망한 플레이어는 행동할 수 없습니다",
  notTarget: "대상이 아닙니다",
  submitting: "전송 중입니다",
  blocked: "현재 행동할 수 없습니다",
})

const SCOPE_FIELDS = [
  "gameId", "authUuid", "identityGeneration", "identityScopeVersion",
  "phase", "dayPhase", "dayIndex", "dayVoteRound", "nightTurnRole",
]

function isSameScope(left, right) {
  if (!left || !right) return false
  return SCOPE_FIELDS.every((field) => left[field] === right[field])
}

function resolveDisabledReason({ selfAlive, inTargets, submitting }) {
  if (selfAlive === false) return INGAME_CARD_MENU_DISABLED_REASONS.selfDead
  if (inTargets === false) return INGAME_CARD_MENU_DISABLED_REASONS.notTarget
  if (submitting === true) return INGAME_CARD_MENU_DISABLED_REASONS.submitting
  return INGAME_CARD_MENU_DISABLED_REASONS.blocked
}

function resolveCardDayVoteTargetId(ctx) {
  if (!ctx?.dayVoteHasSubmitted) return null
  return ctx.dayVoteLastSubmittedTargetId ?? null
}

function resolveCardNightActionTargetId(ctx) {
  return ctx?.nightActionLastSubmittedTargetId ?? null
}

export function buildInGamePlayerCardMenuItems(ctx, targetId, localPlayerId) {
  if (!ctx) return []
  if (typeof targetId !== "string" || targetId.length === 0) return []
  if (ctx.interactionBlocked) return []

  const gameState = ctx.gameState ?? null
  const phase = gameState?.phase ?? null
  if (phase === "ENDED") return []

  const isSelf = isInGameSelfPlayer(targetId, localPlayerId)
  const selfAlive = ctx.selfAliveForControls !== false
  const items = []
  const resolvedDayPhase = resolveInGameDayPhase({
    phase,
    dayPhase: gameState?.dayPhase ?? ctx.dayPhase ?? null,
  })

  if (phase === "DAY" && resolvedDayPhase === INGAME_DAY_PHASES.VOTE && !isSelf) {
    const inTargets = Array.isArray(ctx.dayVoteTargets)
      && ctx.dayVoteTargets.some((target) => target.id === targetId)
    const submitting = ctx.dayVoteStatus === "submitting"
    const votedForThisPlayer = resolveCardDayVoteTargetId(ctx) === targetId

    if (votedForThisPlayer) {
      const enabled = Boolean(ctx.dayVoteControlsEnabled) && !submitting
      items.push({
        kind: INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL,
        label: INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
        visible: true,
        enabled,
        disabledReason: enabled ? null : resolveDisabledReason({ selfAlive, inTargets: true, submitting }),
      })
    } else {
      const enabled = Boolean(ctx.dayVoteControlsEnabled) && !submitting && inTargets
      items.push({
        kind: INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE,
        label: INGAME_CARD_MENU_DAY_VOTE_LABEL,
        visible: true,
        enabled,
        disabledReason: enabled ? null : resolveDisabledReason({ selfAlive, inTargets, submitting }),
      })
    }
  }

  if (phase === "DAY" && resolvedDayPhase === INGAME_DAY_PHASES.DISCUSSION && !isSelf) {
    items.push({
      kind: INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE,
      label: INGAME_CARD_MENU_DAY_VOTE_LABEL,
      visible: true,
      enabled: false,
      disabledReason: DAY_DISCUSSION_NOTICE,
    })
  }

  if (phase === "TRIBUNAL" && gameState?.tribunal?.defendantUuid === targetId) {
    const submitting = ctx.tribunalVoteStatus === "submitting"
    const enabled = Boolean(ctx.tribunalVoteControlsEnabled) && !submitting
    const disabledReason = enabled
      ? null
      : resolveDisabledReason({ selfAlive: ctx.tribunalVoteAlive !== false && selfAlive, inTargets: true, submitting })
    items.push({
      kind: INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_GUILTY,
      label: TRIBUNAL_VOTE_GUILTY_LABEL,
      vote: "GUILTY",
      visible: true,
      enabled,
      disabledReason,
    })
    items.push({
      kind: INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_NOT_GUILTY,
      label: TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
      vote: "NOT_GUILTY",
      visible: true,
      enabled,
      disabledReason,
    })
  }

  if (phase === "NIGHT" && ctx.isNightTurnActor && !isSelf) {
    const inTargets = Array.isArray(ctx.nightActionTargets)
      && ctx.nightActionTargets.some((target) => target.id === targetId && target.selectable)
    const submitting = ctx.nightActionStatus === "submitting"
    const actedOnThisPlayer = resolveCardNightActionTargetId(ctx) === targetId

    if (actedOnThisPlayer) {
      const enabled = ctx.nightActionsLocked !== true && !submitting
      items.push({
        kind: INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL,
        label: INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
        visible: true,
        enabled,
        disabledReason: enabled ? null : resolveDisabledReason({ selfAlive, inTargets: true, submitting }),
      })
    } else {
      const enabled = ctx.nightActionsLocked !== true && !submitting && inTargets
      items.push({
        kind: INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION,
        label: ctx.nightActionLabel || INGAME_CARD_MENU_NIGHT_FALLBACK_LABEL,
        visible: true,
        enabled,
        disabledReason: enabled ? null : resolveDisabledReason({ selfAlive, inTargets, submitting }),
      })
    }
  }

  return items
}

function findItem(ctx, targetId, localPlayerId, kind) {
  return buildInGamePlayerCardMenuItems(ctx, targetId, localPlayerId).find((item) => item.kind === kind) ?? null
}

const DAY_KIND = INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE
const DAY_CANCEL_KIND = INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL
const NIGHT_KIND = INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION
const NIGHT_CANCEL_KIND = INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL

export function useInGamePlayerCardMenu() {
  const ctx = useContext(InGameActionContext)
  const { localPlayerId } = useInGamePlayerSessionContext()

  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )

  const [openPlayerId, setOpenPlayerId] = useState(null)
  const [, setPendingTick] = useState(0)

  const openPlayerIdRef = useRef(null)
  const generationRef = useRef(0)
  const pendingRef = useRef(null)
  const lockRef = useRef(false)
  const consumedRef = useRef(null)
  const requestIdRef = useRef(0)
  const anchorsRef = useRef(new Map())
  const menuRef = useRef(null)
  const latestContextRef = useRef(null)
  const localPlayerIdRef = useRef(null)
  const mountedRef = useRef(true)

  latestContextRef.current = ctx
  localPlayerIdRef.current = localPlayerId
  openPlayerIdRef.current = openPlayerId

  const gameState = ctx?.gameState ?? null
  const phase = gameState?.phase ?? null
  const dayPhase = ctx?.dayPhase ?? null
  const dayIndex = gameState?.dayIndex ?? null
  const dayVoteRound = getDayVoteRound(gameState)
  const nightTurnRole = ctx?.nightTurnRole ?? null
  const interactionBlocked = Boolean(ctx?.interactionBlocked)
  const isGameEnded = phase === "ENDED"

  const readLiveScope = useCallback(() => {
    const store = useInGameStore.getState()
    const liveGameState = store.state ?? null
    const auth = useAuthStore.getState()
    return {
      gameId: store.gameId ?? null,
      authUuid: auth.user?.uuid ?? null,
      identityGeneration: auth.identityGeneration ?? null,
      identityScopeVersion: getInGameIdentityScopeVersion(),
      phase: liveGameState?.phase ?? null,
      dayPhase: liveGameState?.dayPhase ?? null,
      dayIndex: liveGameState?.dayIndex ?? null,
      dayVoteRound: getDayVoteRound(liveGameState),
      nightTurnRole: selectInGameNightTurnRole(liveGameState),
    }
  }, [])

  const cancelPending = useCallback(() => {
    pendingRef.current = null
    lockRef.current = false
  }, [])

  const closeMenu = useCallback(() => {
    generationRef.current += 1
    cancelPending()
    if (openPlayerIdRef.current === null) return
    openPlayerIdRef.current = null
    setOpenPlayerId(null)
  }, [cancelPending])

  const openMenu = useCallback((playerId) => {
    const live = latestContextRef.current
    if (!live) return
    if (typeof playerId !== "string" || playerId.length === 0) return
    if (live.interactionBlocked) return
    if (live.gameState?.phase === "ENDED") return
    if (buildInGamePlayerCardMenuItems(live, playerId, localPlayerIdRef.current).length === 0) return
    if (openPlayerIdRef.current === playerId) {
      closeMenu()
      return
    }
    cancelPending()
    generationRef.current += 1
    openPlayerIdRef.current = playerId
    setOpenPlayerId(playerId)
  }, [cancelPending, closeMenu])

  const runSelect = useCallback((targetId, kind, generation) => {
    if (lockRef.current) return
    if (pendingRef.current !== null) return
    if (!mountedRef.current) return
    const live = latestContextRef.current
    if (!live) return
    if (openPlayerIdRef.current !== targetId) return
    if (generation !== generationRef.current) return
    if (live.interactionBlocked) return
    if (live.gameState?.phase === "ENDED") return

    const item = findItem(live, targetId, localPlayerIdRef.current, kind)
    if (!item || !item.enabled) return

    const liveScope = readLiveScope()
    const liveDayPhase = resolveInGameDayPhase({
      phase: liveScope.phase,
      dayPhase: useInGameStore.getState().state?.dayPhase ?? liveScope.dayPhase ?? null,
    })
    if ((kind === DAY_KIND || kind === DAY_CANCEL_KIND) && liveDayPhase !== INGAME_DAY_PHASES.VOTE) return
    if ((kind === NIGHT_KIND || kind === NIGHT_CANCEL_KIND) && liveScope.phase !== "NIGHT") return
    if (kind !== DAY_KIND && kind !== DAY_CANCEL_KIND && kind !== NIGHT_KIND && kind !== NIGHT_CANCEL_KIND) {
      if (liveScope.phase !== "TRIBUNAL") return
      if (useInGameStore.getState().state?.tribunal?.defendantUuid !== targetId) return
    }

    lockRef.current = true

    if (kind !== DAY_KIND && kind !== DAY_CANCEL_KIND && kind !== NIGHT_KIND && kind !== NIGHT_CANCEL_KIND) {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      consumedRef.current = requestId
      live.submitTribunalVote(item.vote)
      closeMenu()
      return
    }

    if (kind === DAY_CANCEL_KIND) {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      consumedRef.current = requestId
      live.abstainDayVote?.()
      closeMenu()
      return
    }

    if (kind === NIGHT_CANCEL_KIND) {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      consumedRef.current = requestId
      live.skipNightAction?.()
      closeMenu()
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (kind === DAY_KIND) live.setSelectedDayVoteTargetId(targetId)
    else live.setSelectedNightTargetId(targetId)
    pendingRef.current = { kind, targetId, requestId, generation, scope: liveScope }
    setPendingTick((tick) => tick + 1)
  }, [closeMenu, readLiveScope])

  const getItems = useCallback((playerId) => {
    const live = latestContextRef.current
    const generation = generationRef.current
    return buildInGamePlayerCardMenuItems(live, playerId, localPlayerIdRef.current).map((item) => ({
      ...item,
      onSelect: () => runSelect(playerId, item.kind, generation),
    }))
  }, [runSelect])

  const registerAnchor = useCallback((playerId, node) => {
    if (node === null || node === undefined) {
      anchorsRef.current.delete(playerId)
      return
    }
    anchorsRef.current.set(playerId, node)
  }, [])

  const isOpen = useCallback((playerId) => openPlayerId === playerId, [openPlayerId])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      pendingRef.current = null
      lockRef.current = false
    }
  }, [])

  const scopeKey = [
    gameId, authUuid, identityGeneration, identityScopeVersion,
    phase, dayPhase, dayIndex, dayVoteRound, nightTurnRole,
    interactionBlocked, isGameEnded,
  ].join("|")
  const previousScopeKeyRef = useRef(scopeKey)
  useEffect(() => {
    if (previousScopeKeyRef.current === scopeKey) return
    previousScopeKeyRef.current = scopeKey
    closeMenu()
  }, [scopeKey, closeMenu])

  useEffect(() => {
    if (openPlayerId === null) return undefined
    const handleMouseDown = (event) => {
      const menuNode = menuRef.current
      if (menuNode && menuNode.contains(event.target)) return
      const anchorNode = anchorsRef.current.get(openPlayerId)
      if (anchorNode && anchorNode.contains(event.target)) return
      closeMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return
      closeMenu()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [openPlayerId, closeMenu])

  useEffect(() => {
    const pending = pendingRef.current
    if (pending === null) return
    if (consumedRef.current === pending.requestId) return

    const live = latestContextRef.current
    if (!live) { cancelPending(); return }
    if (pending.generation !== generationRef.current) { cancelPending(); return }
    if (openPlayerIdRef.current !== pending.targetId) { cancelPending(); return }
    if (!isSameScope(pending.scope, readLiveScope())) { cancelPending(); closeMenu(); return }

    const item = findItem(live, pending.targetId, localPlayerIdRef.current, pending.kind)
    if (!item || !item.enabled) { cancelPending(); closeMenu(); return }

    const selected = pending.kind === DAY_KIND ? live.selectedDayVoteTargetId : live.selectedNightTargetId
    if (selected !== pending.targetId) return

    consumedRef.current = pending.requestId
    pendingRef.current = null
    if (pending.kind === DAY_KIND) live.submitDayVote()
    else live.submitNightAction()
    closeMenu()
  })

  return {
    openPlayerId,
    isOpen,
    openMenu,
    closeMenu,
    getItems,
    registerAnchor,
    menuRef,
  }
}

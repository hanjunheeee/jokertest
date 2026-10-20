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

/** 카드 메뉴가 만들 수 있는 항목의 종류. 항목 하나가 정확히 하나의 제출 경로에 대응한다. */
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

/**
 * 비활성 사유 문구. 우선순위는 고정이다(본인 사망 → 대상 목록 부재 → 전송 중 → 그 외 게이트):
 * 사용자가 가장 먼저 알아야 하는 것은 "내가 행동할 수 있는 상태인가"이고, 그 다음이 "이
 * 사람이 대상인가", 마지막이 일시적 잠금이다. 순서를 뒤집으면 사망자에게 "전송 중입니다"가
 * 뜨는 것처럼 사유가 사실과 어긋난다.
 */
export const INGAME_CARD_MENU_DISABLED_REASONS = Object.freeze({
  selfDead: "사망한 플레이어는 행동할 수 없습니다",
  notTarget: "대상이 아닙니다",
  submitting: "전송 중입니다",
  blocked: "현재 행동할 수 없습니다",
})

/**
 * pending 제출이 "같은 판·같은 신원·같은 국면"에서 이어지는지 가르는 아홉 축. 하나라도
 * 달라지면 그 사이에 판이 바뀐 것이므로 보관하던 제출을 버린다.
 */
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

/** 카드 오버레이가 "이 대상에게 이미 투표했는가"를 판단할 때 쓰는 확정 표 대상 id. */
function resolveCardDayVoteTargetId(ctx) {
  if (!ctx?.dayVoteHasSubmitted) return null
  return ctx.dayVoteLastSubmittedTargetId ?? null
}

/** 카드 오버레이가 "이 대상에게 이미 밤 행동을 제출했는가"를 판단할 때 쓰는 확정 대상 id. */
function resolveCardNightActionTargetId(ctx) {
  return ctx?.nightActionLastSubmittedTargetId ?? null
}

/**
 * 한 플레이어 카드에 띄울 메뉴 항목을 계산한다(순수 함수 — 상태를 읽기만 한다).
 *
 * 표시 규칙(운영자 확정):
 *   - 낮 투표    : phase === "DAY" && dayPhase === "DAY_VOTE" && 대상 !== 본인
 *   - 낮 토론    : phase === "DAY" && dayPhase === "DAY_DISCUSSION" && 대상 !== 본인
 *                  (투표하기는 비활성 — 토론 중 안내만 보여준다)
 *   - 재판 투표  : phase === "TRIBUNAL" && 대상 === gameState.tribunal.defendantUuid
 *                  (유죄/무죄 두 항목이 함께 뜬다 — 피고 카드 하나에만 붙는다)
 *   - 밤 행동    : phase === "NIGHT" && 내 역할 턴 && 대상 !== 본인
 *
 * ctx.isGameEnded 같은 필드는 없다 — 종료는 gameState.phase === "ENDED"로 파생하고,
 * 종료·조작 차단 중에는 항목 자체를 만들지 않는다(잠긴 항목조차 보이지 않는다).
 */
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
    // 재판은 "대상 목록"이 없다 — 피고 카드 하나가 곧 대상이므로 inTargets는 항상 true다.
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

/**
 * 플레이어 카드 좌클릭 메뉴 — 보드 전체에서 "메뉴는 한 번에 하나"를 관리하고, 각 카드의
 * 항목을 InGameActionContext 값으로 계산한다.
 *
 * 정확히 한 번 제출하기 위한 세 겹:
 *   1. 동기 lock   — onSelect 진입 즉시 세워 같은 틱의 두 번째 클릭을 거부한다.
 *   2. 세대 카운터 — 닫힘·대상 전환 뒤에 보관됐던 낡은 handler를 무효화한다.
 *   3. 소비 표식   — 요청 id를 submit **전에** 적어, 어떤 재진입도 같은 요청을 두 번 내지 못한다.
 *
 * 그리고 모든 검사는 클릭 시점에 캡처해 둔 값이 아니라 **지금 렌더의 컨텍스트**
 * (latestContextRef)로 다시 한다 — 게이트가 false로 바뀐 뒤 보관해 둔 handler를 호출해도
 * setter·submit이 0회여야 하기 때문이다.
 */
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
  // pendingTick은 "pending이 바뀌었다"를 렌더로 알리는 유일한 신호다. 같은 대상을 다시
  // 고르면 setSelected*가 같은 값이라 리렌더가 일어나지 않으므로, 이 값이 없으면 두 번째
  // 선택의 제출 effect가 영영 돌지 않는다.
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

  // 렌더마다 갱신되는 "지금 값" 거울. 이벤트 핸들러는 캡처된 값이 아니라 이 거울만 읽는다.
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

  /**
   * 지금 이 순간의 범위.
   *
   * 렌더 값(컨텍스트)이 아니라 **store를 직접 읽는다** — store가 바뀌고 React가 아직 이
   * 훅을 리렌더하지 않은 구간에도 보관된 제출이 그 사이에 검사받아야 하기 때문이다(그 구간에
   * 옛 컨텍스트로 판단하면 이미 지나간 국면의 표가 나간다).
   */
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
    // 이 단계·이 대상에 띄울 항목이 하나도 없으면 빈 메뉴를 열지 않는다.
    if (buildInGamePlayerCardMenuItems(live, playerId, localPlayerIdRef.current).length === 0) return
    // 같은 카드를 다시 누르면 토글로 닫는다.
    if (openPlayerIdRef.current === playerId) {
      closeMenu()
      return
    }
    cancelPending()
    generationRef.current += 1
    openPlayerIdRef.current = playerId
    setOpenPlayerId(playerId)
  }, [cancelPending, closeMenu])

  /**
   * 항목 실행. setter·submit보다 **먼저** 모든 게이트를 지금 값으로 동기 재검사하고, 하나라도
   * 어긋나면 setter 0회·submit 0회로 조용히 돌아간다.
   */
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

    // 지금 이 순간의 canonical 국면도 항목별로 정확히 일치해야 한다 — 위 항목 계산은 마지막
    // 렌더의 컨텍스트를 쓰므로, store가 이미 다음 국면으로 넘어간 구간을 여기서 한 번 더 막는다.
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
      // 재판은 대상 선택을 거치지 않는다 — 소비 표식을 먼저 남기고 곧장 한 번 제출한다.
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

  // ── 단계·신원·판 전환에서 닫는다 ──────────────────────────────────────────
  //
  // 이 아홉 축 중 하나라도 바뀌면 사용자가 보고 고른 그 국면이 이미 지났다는 뜻이다. 보관된
  // pending도 함께 버린다(그 제출은 지난 국면의 것이다).
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

  // ── 바깥 클릭·Esc ────────────────────────────────────────────────────────
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

  // ── 보관된 선택을 실제 제출로 잇는다 ─────────────────────────────────────
  //
  // 의존성 배열을 두지 않는다: submit이 최신 선택값을 클로저로 읽으려면 "선택 state가 실제로
  // 반영된 렌더"의 다음 커밋에서 불려야 하는데, 그 렌더를 만드는 값(선택·게이트·범위)이 전부
  // 이 훅 바깥에 있다. 모든 커밋에서 돌되 소비 표식으로 한 번만 통과시킨다.
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
    // 아직 선택 state가 이 대상으로 반영되지 않았다 — 다음 커밋을 기다린다.
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

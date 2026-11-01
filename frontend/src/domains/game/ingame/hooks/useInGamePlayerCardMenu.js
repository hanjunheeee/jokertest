// 플레이어 카드 메뉴 훅 입구: 메뉴 열기·닫기·항목 고르기와 범위가 바뀌면 닫기
// 플레이어 보드가 씀 (항목 만들기는 utils/cardMenu/, 고르기·제출 대기·바깥 닫기는 hooks/cardMenu/)
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { InGameActionContext } from "../context/InGameActionContext.jsx"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import {
  getInGameIdentityScopeVersion,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getDayVoteRound } from "../utils/dayVoteRound.js"
import { buildInGamePlayerCardMenuItems } from "../utils/playerCardMenu.js"
import { selectItem } from "./cardMenu/selectItem.js"
import { useMenuDismiss } from "./cardMenu/useMenuDismiss.js"
import { usePendingSubmit } from "./cardMenu/usePendingSubmit.js"

export {
  INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
  INGAME_CARD_MENU_DAY_VOTE_LABEL,
  INGAME_CARD_MENU_DISABLED_REASONS,
  INGAME_CARD_MENU_ITEM_KINDS,
  INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
  INGAME_CARD_MENU_NIGHT_FALLBACK_LABEL,
} from "../constants/board/playerCardMenu.js"
export { buildInGamePlayerCardMenuItems }

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

  // 콜백이 렌더 값 대신 읽는 최신 값들 (selectItem·usePendingSubmit에 묶어서 넘김)
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
  const r = {
    openPlayerIdRef, generationRef, pendingRef, lockRef, consumedRef,
    requestIdRef, latestContextRef, localPlayerIdRef, mountedRef,
  }

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

  // 제출 대기·잠금 풀기
  const cancelPending = useCallback(() => {
    pendingRef.current = null
    lockRef.current = false
  }, [])

  // 메뉴 닫기 (세대 올려서 열려 있던 항목의 고르기를 무효로 만듦)
  const closeMenu = useCallback(() => {
    generationRef.current += 1
    cancelPending()
    if (openPlayerIdRef.current === null) return
    openPlayerIdRef.current = null
    setOpenPlayerId(null)
  }, [cancelPending])

  // 메뉴 열기 (항목이 없으면 안 열고, 같은 카드를 다시 누르면 닫음)
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
    selectItem(r, {
      targetId,
      kind,
      generation,
      closeMenu,
      bumpPending: () => setPendingTick((tick) => tick + 1),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeMenu])

  // 지금 세대로 항목 만들고 onSelect 붙임
  const getItems = useCallback((playerId) => {
    const live = latestContextRef.current
    const generation = generationRef.current
    return buildInGamePlayerCardMenuItems(live, playerId, localPlayerIdRef.current).map((entry) => ({
      ...entry,
      onSelect: () => runSelect(playerId, entry.kind, generation),
    }))
  }, [runSelect])

  // 카드 노드 등록 (바깥 누름 판단용)
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

  // 판·계정·신원·단계·날짜·회차·밤 차례·조작 막힘·판 끝 중 하나라도 바뀌면 닫음 (첫 렌더는 제외)
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

  useMenuDismiss(openPlayerId, { menuRef, anchorsRef, closeMenu })
  usePendingSubmit(r, { cancelPending, closeMenu })

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

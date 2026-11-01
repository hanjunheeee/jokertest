// 카드 메뉴 제출 대기 훅: 고른 대상이 컨텍스트에 들어오면 그때 투표·밤 행동을 보냄
// 카드 메뉴 훅(useInGamePlayerCardMenu)이 맨 마지막 effect로 부름
import { useEffect } from "react"
import { INGAME_CARD_MENU_ITEM_KINDS as KINDS } from "../../constants/board/playerCardMenu.js"
import { findCardMenuItem, isSameMenuScope } from "../../utils/playerCardMenu.js"
import { readMenuScope } from "./liveScope.js"

// r: 카드 메뉴 훅의 ref 묶음 (렌더마다 확인하므로 의존성 목록 없음)
export function usePendingSubmit(r, { cancelPending, closeMenu }) {
  useEffect(() => {
    const pending = r.pendingRef.current
    if (pending === null) return
    if (r.consumedRef.current === pending.requestId) return

    // 컨텍스트가 없거나 메뉴가 바뀌었으면 대기만 버림
    const live = r.latestContextRef.current
    if (!live) { cancelPending(); return }
    if (pending.generation !== r.generationRef.current) { cancelPending(); return }
    if (r.openPlayerIdRef.current !== pending.targetId) { cancelPending(); return }

    // 범위가 바뀌었거나 항목이 잠겼으면 대기 버리고 닫음
    if (!isSameMenuScope(pending.scope, readMenuScope())) { cancelPending(); closeMenu(); return }
    const target = findCardMenuItem(live, pending.targetId, r.localPlayerIdRef.current, pending.kind)
    if (!target || !target.enabled) { cancelPending(); closeMenu(); return }

    // 고른 대상이 아직 안 들어왔으면 다음 렌더까지 기다림
    const selected = pending.kind === KINDS.DAY_VOTE ? live.selectedDayVoteTargetId : live.selectedNightTargetId
    if (selected !== pending.targetId) return

    r.consumedRef.current = pending.requestId
    r.pendingRef.current = null
    if (pending.kind === KINDS.DAY_VOTE) live.submitDayVote()
    else live.submitNightAction()
    closeMenu()
  })
}

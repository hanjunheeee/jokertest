// 카드 메뉴 항목 고르기: 재판·취소는 바로 보내고, 투표·밤 행동은 대상 고른 뒤 제출 대기로 둠
// 카드 메뉴 훅이 항목 onSelect로 부름 (제출 대기는 usePendingSubmit이 이어 받음)
import { useInGameStore } from "../../store/ingameStore.js"
import { INGAME_CARD_MENU_ITEM_KINDS as KINDS } from "../../constants/board/playerCardMenu.js"
import { findCardMenuItem } from "../../utils/playerCardMenu.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "../../utils/dayPhase.js"
import { readMenuScope } from "./liveScope.js"

const isDayKind = (kind) => kind === KINDS.DAY_VOTE || kind === KINDS.DAY_VOTE_CANCEL
const isNightKind = (kind) => kind === KINDS.NIGHT_ACTION || kind === KINDS.NIGHT_ACTION_CANCEL

// 요청 번호 하나 쓰고 바로 소비한 것으로 적음 (제출 대기 없이 끝나는 항목)
function consumeRequest(r) {
  const requestId = r.requestIdRef.current + 1
  r.requestIdRef.current = requestId
  r.consumedRef.current = requestId
}

// r: 카드 메뉴 훅의 ref 묶음, generation: 항목을 만들 때의 메뉴 세대
export function selectItem(r, { targetId, kind, generation, closeMenu, bumpPending }) {
  // 잠김·대기 중·내려감·다른 카드·옛 세대·조작 막힘·판 끝이면 무시
  if (r.lockRef.current) return
  if (r.pendingRef.current !== null) return
  if (!r.mountedRef.current) return
  const live = r.latestContextRef.current
  if (!live) return
  if (r.openPlayerIdRef.current !== targetId) return
  if (generation !== r.generationRef.current) return
  if (live.interactionBlocked) return
  if (live.gameState?.phase === "ENDED") return

  // 지금 다시 만든 항목도 열려 있어야 함
  const target = findCardMenuItem(live, targetId, r.localPlayerIdRef.current, kind)
  if (!target || !target.enabled) return

  // 스토어의 지금 단계가 항목 종류와 맞아야 함 (재판은 피고까지)
  const liveScope = readMenuScope()
  const liveDayPhase = resolveInGameDayPhase({
    phase: liveScope.phase,
    dayPhase: useInGameStore.getState().state?.dayPhase ?? liveScope.dayPhase ?? null,
  })
  if (isDayKind(kind) && liveDayPhase !== INGAME_DAY_PHASES.VOTE) return
  if (isNightKind(kind) && liveScope.phase !== "NIGHT") return
  if (!isDayKind(kind) && !isNightKind(kind)) {
    if (liveScope.phase !== "TRIBUNAL") return
    if (useInGameStore.getState().state?.tribunal?.defendantUuid !== targetId) return
  }

  r.lockRef.current = true

  // 재판 투표·투표 취소·밤 행동 취소: 바로 보내고 닫음
  if (!isDayKind(kind) && !isNightKind(kind)) {
    consumeRequest(r)
    live.submitTribunalVote(target.vote)
    closeMenu()
    return
  }
  if (kind === KINDS.DAY_VOTE_CANCEL) {
    consumeRequest(r)
    live.abstainDayVote?.()
    closeMenu()
    return
  }
  if (kind === KINDS.NIGHT_ACTION_CANCEL) {
    consumeRequest(r)
    live.skipNightAction?.()
    closeMenu()
    return
  }

  // 투표·밤 행동: 대상만 고르고 제출 대기로 둠 (다음 렌더에서 고른 값이 들어온 뒤 제출)
  const requestId = r.requestIdRef.current + 1
  r.requestIdRef.current = requestId
  if (kind === KINDS.DAY_VOTE) live.setSelectedDayVoteTargetId(targetId)
  else live.setSelectedNightTargetId(targetId)
  r.pendingRef.current = { kind, targetId, requestId, generation, scope: liveScope }
  bumpPending()
}

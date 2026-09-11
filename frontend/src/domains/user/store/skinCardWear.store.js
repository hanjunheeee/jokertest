import { create } from "zustand"
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  SKIN_CARD_WEAR_JOB_TABS,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} from "../constants/skinCardWear/skinCardWearCatalog.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

// F-14(AC-01/AC-03) — profileCustomization.store.js와 같은 계약: 이 store의 applied
// (skinsByJob/cardFrameId)는 서버가 실제로 장착돼 있다고 확인해 준 값의 거울일 뿐이다.
// 낙관적으로 먼저 반영하는 경로는 없다 — economy store의 loadout이 바뀔 때만(fetchSummary
// 조회 성공, equip 성공 후 재조회) applyLoadout이 호출된다. 미장착(null) 직업은 그 직업의
// 기본 스킨으로 대체해 화면이 빈 슬롯으로 열리지 않게 한다(catalog.js
// buildDefaultSkinsByJob과 동일한 기본값 소스).
const resolveSkinsByJobFromServer = (selectedSkinsByJob) =>
  Object.fromEntries(
    SKIN_CARD_WEAR_JOB_TABS.flatMap(({ id }) => {
      const skinId = selectedSkinsByJob?.[id] ?? getDefaultSkinIdForJob(id)
      return skinId ? [[id, skinId]] : []
    }),
  )

/** 스킨&카드 착용 — 직업별 장착 스킨·플레이어 카드. F-14부터는 서버 economy loadout이
 *  유일한 진실이다(useEconomyStore 구독). */
export const useSkinCardWearStore = create((set) => ({
  skinsByJob: buildDefaultSkinsByJob(),
  cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,

  /** 서버가 확정한 loadout만 반영한다(fetchSummary 조회 결과 또는 equip 성공 후 재조회) —
   *  넘기지 않은 값(undefined)은 이전 값을 그대로 둔다. */
  applyLoadout: ({ skinsByJob, cardFrameId }) =>
    set((state) => ({
      skinsByJob: skinsByJob ?? state.skinsByJob,
      cardFrameId: cardFrameId ?? state.cardFrameId,
    })),

  reset: () =>
    set({
      skinsByJob: buildDefaultSkinsByJob(),
      cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    }),
}))

// F-14(AC-01): economy store의 loadout이 바뀔 때마다(fetchSummary 조회 성공, equip 성공 후
// 재조회) 실제 장착 스킨·카드 프레임을 곧바로 반영한다 — profileCustomization.store.js의
// useEconomyStore 구독과 동일한 패턴이다. economy store가 계정 전환/로그아웃 시 이미
// requestGeneration을 올려 이전 응답을 무시하므로(A-08), 여기서는 그 결과로 실제 반영된
// loadout만 구독하면 된다.
useEconomyStore.subscribe((state, prevState) => {
  const nextSkinsByJob = state.loadout.selectedSkinsByJob
  if (nextSkinsByJob !== prevState?.loadout?.selectedSkinsByJob) {
    useSkinCardWearStore.getState().applyLoadout({ skinsByJob: resolveSkinsByJobFromServer(nextSkinsByJob) })
  }
  const nextCardFrameId = state.loadout.selectedCardFrameId
  if (nextCardFrameId !== prevState?.loadout?.selectedCardFrameId) {
    useSkinCardWearStore.getState().applyLoadout({ cardFrameId: nextCardFrameId ?? SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID })
  }
})

// F-14(AC-03): 로그아웃/계정 전환 시 이전 계정의 소유품·장착 캐시를 초기화한다 —
// profileCustomization.store.js와 동일한 패턴. economy store의 위 구독이 같은 틱에
// 반영되기 전에 화면이 먼저 읽어도 이전 계정의 스킨·카드가 보이지 않게 한다.
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useSkinCardWearStore.getState().reset()
  }
})

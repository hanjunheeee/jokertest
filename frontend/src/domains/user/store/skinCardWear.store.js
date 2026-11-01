// 적용된(서버 장착) 직업별 스킨·카드 틀 스토어 (지갑 장착값을 따라감)
// 스킨·카드 장착 창(SkinCardWearOverlay)·시험이 씀
import { create } from "zustand"
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  SKIN_CARD_WEAR_JOB_TABS,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} from "../constants/skinCardWear/skinCardWearCatalog.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

// 서버 직업별 스킨 → 직업마다 값, 없으면 기본 스킨 (기본도 없으면 뺌)
const resolveSkinsByJobFromServer = (selectedSkinsByJob) =>
  Object.fromEntries(
    SKIN_CARD_WEAR_JOB_TABS.flatMap(({ id }) => {
      const skinId = selectedSkinsByJob?.[id] ?? getDefaultSkinIdForJob(id)
      return skinId ? [[id, skinId]] : []
    }),
  )

// 직업별 스킨 내용이 같은지 (객체가 달라도 내용이 같으면 같음)
const skinsByJobContentEqual = (a, b) =>
  SKIN_CARD_WEAR_JOB_TABS.every(({ id }) => (a?.[id] ?? null) === (b?.[id] ?? null))

// 처음 값: 직업별 기본 스킨·기본 카드 틀
export const useSkinCardWearStore = create((set) => ({
  skinsByJob: buildDefaultSkinsByJob(),
  cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,

  // 받은 칸만 바꿈 (안 준 칸은 그대로)
  applyLoadout: ({ skinsByJob, cardFrameId }) =>
    set((state) => ({
      skinsByJob: skinsByJob ?? state.skinsByJob,
      cardFrameId: cardFrameId ?? state.cardFrameId,
    })),

  // 처음 값으로
  reset: () =>
    set({
      skinsByJob: buildDefaultSkinsByJob(),
      cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    }),
}))

// 지갑 장착값이 바뀌면 따라감, 내용이 같으면 안 바꿔 다시 그리기 막기
useEconomyStore.subscribe((state, prevState) => {
  const nextSkinsByJob = state.loadout.selectedSkinsByJob
  if (nextSkinsByJob !== prevState?.loadout?.selectedSkinsByJob) {
    const resolved = resolveSkinsByJobFromServer(nextSkinsByJob)
    if (!skinsByJobContentEqual(resolved, useSkinCardWearStore.getState().skinsByJob)) {
      useSkinCardWearStore.getState().applyLoadout({ skinsByJob: resolved })
    }
  }
  const nextCardFrameId = state.loadout.selectedCardFrameId
  if (nextCardFrameId !== prevState?.loadout?.selectedCardFrameId) {
    const resolvedCardFrameId = nextCardFrameId ?? SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID
    if (resolvedCardFrameId !== useSkinCardWearStore.getState().cardFrameId) {
      useSkinCardWearStore.getState().applyLoadout({ cardFrameId: resolvedCardFrameId })
    }
  }
})

// 계정이 바뀌면 처음 값으로
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useSkinCardWearStore.getState().reset()
  }
})

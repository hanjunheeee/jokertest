import { create } from "zustand"
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  SKIN_CARD_WEAR_JOB_TABS,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} from "../constants/skinCardWear/skinCardWearCatalog.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

const resolveSkinsByJobFromServer = (selectedSkinsByJob) =>
  Object.fromEntries(
    SKIN_CARD_WEAR_JOB_TABS.flatMap(({ id }) => {
      const skinId = selectedSkinsByJob?.[id] ?? getDefaultSkinIdForJob(id)
      return skinId ? [[id, skinId]] : []
    }),
  )

const skinsByJobContentEqual = (a, b) =>
  SKIN_CARD_WEAR_JOB_TABS.every(({ id }) => (a?.[id] ?? null) === (b?.[id] ?? null))

export const useSkinCardWearStore = create((set) => ({
  skinsByJob: buildDefaultSkinsByJob(),
  cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,

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

useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useSkinCardWearStore.getState().reset()
  }
})

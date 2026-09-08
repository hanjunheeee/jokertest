import { create } from "zustand"
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  buildDefaultSkinsByJob,
} from "../constants/skinCardWear/skinCardWearCatalog.js"

/** 스킨&카드 착용 — 직업별 장착 스킨·플레이어 카드 (프론트 전용, 백엔드 연동 전) */
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

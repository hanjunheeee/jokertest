import { create } from "zustand"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"

/** 프로필 사진·테두리 커스터마이징 (프론트 전용, 백엔드 연동 전) */
export const useProfileCustomizationStore = create((set) => ({
  photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
  frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,

  applyCustomization: ({ photoSrc, frameSrc }) =>
    set((state) => ({
      photoSrc: photoSrc ?? state.photoSrc,
      frameSrc: frameSrc ?? state.frameSrc,
    })),

  reset: () =>
    set({
      photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
      frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,
    }),
}))

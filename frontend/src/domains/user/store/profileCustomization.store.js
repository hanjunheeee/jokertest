// 장착한 프로필 사진·테두리 그림 경로 스토어 (지갑 장착값을 따라감)
// 배너 초상(BannerProfilePortrait)·시험이 씀
import { create } from "zustand"
import { PLAYER_PROFILE_ASSETS } from "../../../shared/constants/playerProfileAssets.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  DEFAULT_PROFILE_PHOTO_ITEM_ID,
  borderAssetSrcForItemId,
  photoAssetSrcForItemId,
} from "../constants/profileEditLayout.js"

// 처음 값: 기본 사진·기본 테두리
const initialState = {
  photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
  frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,
  selectedPhotoItemId: DEFAULT_PROFILE_PHOTO_ITEM_ID,
  selectedBorderItemId: DEFAULT_PROFILE_BORDER_ITEM_ID,
}

// 지갑 장착 id를 받아 그림 경로로 바꿔 둠
export const useProfileCustomizationStore = create((set) => ({
  ...initialState,

  // 사진: id 없으면 기본 사진, 그림을 못 찾으면 기본 그림
  applyEquippedPhoto: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID
    set({
      selectedPhotoItemId: resolvedItemId,
      photoSrc: photoAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    })
  },

  // 테두리: id 없으면 기본 테두리, 그림을 못 찾으면 기본 그림
  applyEquippedBorder: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_BORDER_ITEM_ID
    set({
      selectedBorderItemId: resolvedItemId,
      frameSrc: borderAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
    })
  },

  // 처음 값으로
  reset: () => set({ ...initialState }),
}))

// 지갑 장착값이 바뀌면 따라감 (사진·테두리 따로 봄)
useEconomyStore.subscribe((state, prevState) => {
  const nextPhotoId = state.loadout.selectedProfilePhotoId
  if (nextPhotoId !== prevState?.loadout?.selectedProfilePhotoId) {
    useProfileCustomizationStore.getState().applyEquippedPhoto(nextPhotoId)
  }
  const nextBorderId = state.loadout.selectedProfileBorderId
  if (nextBorderId !== prevState?.loadout?.selectedProfileBorderId) {
    useProfileCustomizationStore.getState().applyEquippedBorder(nextBorderId)
  }
})

// 계정이 바뀌면 처음 값으로
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useProfileCustomizationStore.getState().reset()
  }
})

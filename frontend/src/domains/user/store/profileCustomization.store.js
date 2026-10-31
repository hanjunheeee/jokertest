import { create } from "zustand"
import { PLAYER_PROFILE_ASSETS } from "../../../shared/constants/playerProfileAssets.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  DEFAULT_PROFILE_PHOTO_ITEM_ID,
  profileBorderAssetSrcForItemId,
  profilePhotoAssetSrcForItemId,
} from "../constants/profileEditLayout.js"

const initialState = {
  photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
  frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,
  selectedPhotoItemId: DEFAULT_PROFILE_PHOTO_ITEM_ID,
  selectedBorderItemId: DEFAULT_PROFILE_BORDER_ITEM_ID,
}

export const useProfileCustomizationStore = create((set) => ({
  ...initialState,

  applyEquippedPhoto: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID
    set({
      selectedPhotoItemId: resolvedItemId,
      photoSrc: profilePhotoAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    })
  },

  applyEquippedBorder: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_BORDER_ITEM_ID
    set({
      selectedBorderItemId: resolvedItemId,
      frameSrc: profileBorderAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
    })
  },

  reset: () => set({ ...initialState }),
}))

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

useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useProfileCustomizationStore.getState().reset()
  }
})

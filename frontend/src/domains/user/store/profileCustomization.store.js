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

// F-13(AC-01/AC-02) 재검토 대응 — 프로필 사진도 더 이상 프론트 전용 무료 선택이 아니다
// (F-12 A-11 정책 변경: 대기방·인게임에 타인에게 노출하려면 서버가 확정한 값이어야 한다,
// AC-05). 이 store는 사진·테두리 모두 서버(F-08 economy store의 loadout)만을 진실로
// 삼고, 여기서는 그 값을 거울처럼 반영한다 — 로컬에서 먼저 낙관적으로 저장하는 경로는
// 사진·테두리 어느 쪽에도 없다. photoSrc/frameSrc는 오직 applyEquippedPhoto/
// applyEquippedBorder(서버 loadout 조회 결과 또는 실제 equipProfile 성공 결과)로만 바뀐다.

const initialState = {
  photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
  frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,
  selectedPhotoItemId: DEFAULT_PROFILE_PHOTO_ITEM_ID,
  selectedBorderItemId: DEFAULT_PROFILE_BORDER_ITEM_ID,
}

export const useProfileCustomizationStore = create((set) => ({
  ...initialState,

  /** 서버가 실제로 장착돼 있다고 확인해 준 사진 itemId만 반영한다(fetchSummary 조회 결과
   *  또는 equipProfile 성공 결과) — 이 함수를 호출하지 않고는 photoSrc가 바뀌지 않는다. */
  applyEquippedPhoto: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID
    set({
      selectedPhotoItemId: resolvedItemId,
      photoSrc: profilePhotoAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    })
  },

  /** 서버가 실제로 장착돼 있다고 확인해 준 테두리 itemId만 반영한다(fetchSummary 조회
   *  결과 또는 equipProfile 성공 결과) — 이 함수를 호출하지 않고는 frameSrc가 바뀌지 않는다. */
  applyEquippedBorder: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_BORDER_ITEM_ID
    set({
      selectedBorderItemId: resolvedItemId,
      frameSrc: profileBorderAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
    })
  },

  reset: () => set({ ...initialState }),
}))

// AC-06(A-12)/F-13(AC-04): economy store의 loadout이 바뀔 때마다(fetchSummary 조회 성공,
// equipProfile 성공) 실제 장착 사진·테두리를 곧바로 반영한다 — 프로필 수정 편집기를 열지
// 않아도 배너 등 어디서나 복원된 값이 보인다. economy.store.js가 계정 전환/로그아웃 시
// 이미 requestGeneration을 올려 이전 응답을 무시하므로(A-08), 여기서는 그 결과로 실제
// 반영된 loadout만 구독하면 된다 — economy store가 reset()되면 loadout도 초기값(null)으로
// 돌아가 아래 구독이 자연히 기본 사진·테두리로 되돌린다.
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

// 로그아웃/계정 전환 시 로컬 상태도 기본값으로 되돌린다 — economy store의 위 구독이 같은
// 틱에 반영되기 전에 화면이 먼저 읽어도 이전 계정의 사진·테두리가 보이지 않게 한다.
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useProfileCustomizationStore.getState().reset()
  }
})

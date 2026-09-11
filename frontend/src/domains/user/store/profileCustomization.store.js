import { create } from "zustand"
import { PLAYER_PROFILE_ASSETS } from "../../../shared/constants/playerProfileAssets.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  profileBorderAssetSrcForItemId,
} from "../constants/profileEditLayout.js"

// F-12(AC-06) 재검토 대응 — 프로필 사진·테두리 커스터마이징. 사진은 여전히 프론트 전용
// 무료 선택이다(backend/economy/catalog.js의 프로필 사진 16종 전부가 defaultGrant:true라
// 소유권 확인이 필요 없다, A-11 "무료 사진 편집을 보존한다"). 테두리는 더 이상 이 store가
// 진실의 원천이 아니다 — 실제 장착 여부는 서버(F-08 economy.store.js의 loadout)만이
// 진실이고, 여기서는 그 값을 거울처럼 반영한다(A-11: "서버 실패에도 로컬 테두리를 저장하지
// 않는다"). 로컬에서 먼저 낙관적으로 저장하는 applyCustomization({frameSrc}) 같은 경로는
// 더 이상 없다 — frameSrc는 오직 applyEquippedBorder(서버 loadout 조회 결과 또는 실제
// equip 성공 결과)로만 바뀐다.

const initialState = {
  photoSrc: PLAYER_PROFILE_ASSETS.defaultPhoto,
  frameSrc: PLAYER_PROFILE_ASSETS.defaultBorder,
  selectedBorderItemId: DEFAULT_PROFILE_BORDER_ITEM_ID,
}

export const useProfileCustomizationStore = create((set) => ({
  ...initialState,

  /** 무료 프로필 사진 변경 — 서버 소유권 확인이 필요 없다(A-11). */
  applyPhoto: (photoSrc) => set({ photoSrc }),

  /** 서버가 실제로 장착돼 있다고 확인해 준 테두리 itemId만 반영한다(fetchSummary 조회
   *  결과 또는 equip 성공 결과) — 이 함수를 호출하지 않고는 frameSrc가 바뀌지 않는다. */
  applyEquippedBorder: (itemId) => {
    const resolvedItemId = itemId ?? DEFAULT_PROFILE_BORDER_ITEM_ID
    set({
      selectedBorderItemId: resolvedItemId,
      frameSrc: profileBorderAssetSrcForItemId(resolvedItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
    })
  },

  reset: () => set({ ...initialState }),
}))

// AC-06(A-12): economy store의 loadout이 바뀔 때마다(fetchSummary 조회 성공, equip 성공)
// 실제 장착 테두리를 곧바로 반영한다 — 프로필 수정 편집기를 열지 않아도 배너 등 어디서나
// 복원된 값이 보인다. economy.store.js가 계정 전환/로그아웃 시 이미 requestGeneration을
// 올려 이전 응답을 무시하므로(A-08), 여기서는 그 결과로 실제 반영된 loadout만 구독하면
// 된다 — economy store가 reset()되면 loadout도 초기값(null)으로 돌아가 아래 구독이 자연히
// 기본 테두리로 되돌린다.
useEconomyStore.subscribe((state, prevState) => {
  const nextBorderId = state.loadout.selectedProfileBorderId
  if (nextBorderId !== prevState?.loadout?.selectedProfileBorderId) {
    useProfileCustomizationStore.getState().applyEquippedBorder(nextBorderId)
  }
})

// 로그아웃/계정 전환 시 로컬 사진 선택도 기본값으로 되돌린다 — economy store는 사진을 갖고
// 있지 않으므로 여기서 별도로 초기화한다(테두리는 위 economy 구독이 이미 처리한다).
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useProfileCustomizationStore.getState().reset()
  }
})

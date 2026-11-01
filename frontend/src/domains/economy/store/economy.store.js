// 경제 스토어 입구 (create 하는 곳, 액션은 economy/ 아래 묶음별 파일)
// 가게·마이페이지·프로필 꾸미기·스킨 장착·도서관 업적·ProtectedRoute·시험이 씀
import { create } from "zustand"

import { useAuthStore } from "../../auth/store/auth.store.js"
import { initialSeqs, initialState } from "./economy/state.js"
import { summaryActions } from "./economy/summaryActions.js"
import { purchaseActions } from "./economy/purchaseActions.js"
import { loadoutActions } from "./economy/loadoutActions.js"

// 묶음별 액션을 펼쳐 스토어 하나로 만듦, 순번은 초기화로 안 지움
export const useEconomyStore = create((set, get) => ({
  ...initialState,
  ...initialSeqs,
  ...summaryActions(set, get),
  ...purchaseActions(set, get),
  ...loadoutActions(set, get),
}))

// 로그인 계정이 바뀌면 지갑·장착 상태를 비움
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useEconomyStore.getState().reset()
  }
})

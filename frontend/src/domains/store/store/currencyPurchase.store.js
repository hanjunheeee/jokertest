// 재화 충전 흐름 스토어 입구 (계정 구독·페이지 복귀 처리, 흐름은 currency/ 아래 파일)
// storePurchase.store.js가 currencyApi만 가져감, 충전 흐름은 지금 시험만 부름
import { useStore } from "zustand"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { activate, ctx, get, set, store } from "./currency/state.js"
import { loadProducts, startTopup } from "./currency/topup.js"
import { checkOrder, resumeQueue } from "./currency/queue.js"
import { discoverOpenOrders, handleReturn } from "./currency/paymentReturn.js"

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export { currencyApi } from "../api/currency.api.js"

// 로그인 계정이 바뀌면 충전 상태를 처음으로 돌림
useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))
// 결제창에서 뒤로 가기로 캐시된 페이지가 다시 보이면 결제 중 상태를 풀고 줄을 이어 감
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && get().status === "payment") { ctx.creating = false; set({ status: "idle" }); resumeQueue(ctx.generation) }
  })
}

// 충전 흐름 동작 묶음 (지금은 시험만 부름)
export const currencyPurchase = {
  store, activate, loadProducts, startTopup, handleReturn, checkOrder, discoverOpenOrders,
}
// 충전 상태 구독 훅 (지금 부르는 곳 없음)
export const useCurrencyPurchase = () => useStore(store)

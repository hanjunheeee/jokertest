// 재화 충전 흐름 스토어 입구 (계정 구독·페이지 복귀 처리, 흐름은 currency/ 아래 파일)
// 가게 화면·가게 구매 스토어·충전 시험이 이 경로로 씀
import { useStore } from "zustand"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { activate, ctx, get, set, store } from "./currency/state.js"
import { loadProducts, startTopup } from "./currency/topup.js"
import { checkOrder, resumeQueue } from "./currency/queue.js"
import { discoverOpenOrders, handleReturn } from "./currency/paymentReturn.js"

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export { currencyApi } from "../api/currency.api.js"
export { requestTossTestPayment } from "../api/toss.api.js"
export { toCurrencyStoreItem } from "../utils/currencyParse.js"

useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))
// 결제창에서 뒤로 가기로 캐시된 페이지가 다시 보이면 결제 중 상태를 풀고 줄을 이어 감
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && get().status === "payment") { ctx.creating = false; set({ status: "idle" }); resumeQueue(ctx.generation) }
  })
}

export const currencyPurchase = {
  store, activate, loadProducts, startTopup, handleReturn, checkOrder, discoverOpenOrders,
}
export const useCurrencyPurchase = () => useStore(store)

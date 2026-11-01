// 가게 구매 스토어 (구매 흐름은 purchaseController.js, 여기선 요청·잔액 갱신·계정 연결만 붙임)
// StorePanel·StorePanelOverlays·useStorePanel이 씀
import { useStore } from "zustand"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { createPurchaseController } from "./purchaseController.js"
import { currencyApi } from "./currencyPurchase.store.js"
import { purchaseApi } from "../api/currency.api.js"
import { currencyHistory } from "./currencyHistory.store.js"

// 골드 구매 응답의 잔액을 바로 넣고 요약 순번을 올려 늦게 온 요약이 덮지 않게 함
const applyGoldBalances = ({ balanceGold, balanceDiamond }) =>
  useEconomyStore.setState((state) => ({
    balanceGold, balanceDiamond, summaryRequestSeq: state.summaryRequestSeq + 1, status: "ready", error: null,
  }))

// 골드 구매 뒤 잔액 바로 넣고, 요약·거래 내역도 다시 받음
const refreshAfterGold = (result) => {
  applyGoldBalances(result)
  useEconomyStore.getState().fetchSummary()
  currencyHistory.load()
}

// 기기 저장소·요청 함수 넣어 만듦 (골드는 충전 API, 일반은 묶음 구매 API)
export const storePurchase = createPurchaseController({
  storage: () => window.localStorage,
  post: (payload) => purchaseApi.bulk(payload),
  postGold: (payload) => currencyApi.purchaseGold(payload),
  lookup: (id, kind) => kind === "GOLD" ? currencyApi.lookupGoldPurchase(id) : purchaseApi.lookup(id),
  refresh: (result) => result ? refreshAfterGold(result) : useEconomyStore.getState().fetchSummary(),
  randomId: () => crypto.randomUUID(),
})
// 지금 로그인 계정으로 붙이고, 계정이 바뀌면 다시 붙임
storePurchase.activate(useAuthStore.getState().user?.uuid ?? null)
useAuthStore.subscribe((state) => storePurchase.activate(state.user?.uuid ?? null))
// 구매 상태를 화면에서 구독하는 훅
export const useStorePurchase = () => useStore(storePurchase.store)

import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { createPurchaseController } from "./purchaseController.js"
import { currencyApi } from "./currencyPurchase.store.js"

// F-32c: 검증된 골드 구매 응답의 두 잔액을 그대로 economy store에 저장한다. summaryRequestSeq를 올려
// 이전에 시작한 지갑 조회의 늦은 응답이 잔액을 되돌리지 못하게 하고, 소유품·장착 상태는 건드리지 않는다.
const applyGoldBalances = ({ balanceGold, balanceDiamond }) =>
  useEconomyStore.setState((state) => ({
    balanceGold, balanceDiamond, summaryRequestSeq: state.summaryRequestSeq + 1, status: "ready", error: null,
  }))

export const storePurchase = createPurchaseController({
  storage: () => window.localStorage,
  post: (payload) => api.post("/economy/purchases/bulk", payload),
  postGold: (payload) => currencyApi.purchaseGold(payload),
  lookup: (id, kind) => kind === "GOLD" ? currencyApi.lookupGoldPurchase(id) : api.get(`/economy/purchases/${encodeURIComponent(id)}`),
  refresh: (result) => result ? applyGoldBalances(result) : useEconomyStore.getState().fetchSummary(),
  randomId: () => crypto.randomUUID(),
})
storePurchase.activate(useAuthStore.getState().user?.uuid ?? null)
useAuthStore.subscribe((state) => storePurchase.activate(state.user?.uuid ?? null))
export const useStorePurchase = () => useStore(storePurchase.store)

import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { createPurchaseController } from "./purchaseController.js"
import { currencyApi } from "./currencyPurchase.store.js"
import { currencyHistory } from "./currencyHistory.store.js"

const applyGoldBalances = ({ balanceGold, balanceDiamond }) =>
  useEconomyStore.setState((state) => ({
    balanceGold, balanceDiamond, summaryRequestSeq: state.summaryRequestSeq + 1, status: "ready", error: null,
  }))

const refreshAfterGold = (result) => {
  applyGoldBalances(result)
  useEconomyStore.getState().fetchSummary()
  currencyHistory.load()
}

export const storePurchase = createPurchaseController({
  storage: () => window.localStorage,
  post: (payload) => api.post("/economy/purchases/bulk", payload),
  postGold: (payload) => currencyApi.purchaseGold(payload),
  lookup: (id, kind) => kind === "GOLD" ? currencyApi.lookupGoldPurchase(id) : api.get(`/economy/purchases/${encodeURIComponent(id)}`),
  refresh: (result) => result ? refreshAfterGold(result) : useEconomyStore.getState().fetchSummary(),
  randomId: () => crypto.randomUUID(),
})
storePurchase.activate(useAuthStore.getState().user?.uuid ?? null)
useAuthStore.subscribe((state) => storePurchase.activate(state.user?.uuid ?? null))
export const useStorePurchase = () => useStore(storePurchase.store)

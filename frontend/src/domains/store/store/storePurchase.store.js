import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { createPurchaseController } from "./purchaseController.js"

export const storePurchase = createPurchaseController({
  storage: () => window.localStorage,
  post: (payload) => api.post("/economy/purchases/bulk", payload),
  lookup: (id) => api.get(`/economy/purchases/${encodeURIComponent(id)}`),
  refresh: () => useEconomyStore.getState().fetchSummary(),
  randomId: () => crypto.randomUUID(),
})
storePurchase.activate(useAuthStore.getState().user?.uuid ?? null)
useAuthStore.subscribe((state) => storePurchase.activate(state.user?.uuid ?? null))
export const useStorePurchase = () => useStore(storePurchase.store)

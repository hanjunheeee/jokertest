import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { createPurchaseController } from "./purchaseController.js"
import { currencyApi } from "./currencyPurchase.store.js"
import { currencyHistory } from "./currencyHistory.store.js"

// F-32c: 검증된 골드 구매 응답의 두 잔액을 그대로 economy store에 저장한다. summaryRequestSeq를 올려
// 이전에 시작한 지갑 조회의 늦은 응답이 잔액을 되돌리지 못하게 하고, 소유품·장착 상태는 건드리지 않는다.
const applyGoldBalances = ({ balanceGold, balanceDiamond }) =>
  useEconomyStore.setState((state) => ({
    balanceGold, balanceDiamond, summaryRequestSeq: state.summaryRequestSeq + 1, status: "ready", error: null,
  }))

// F-32 BQ: 골드 구매 결과(특히 결과 조회로 복원한 과거 구매)의 두 잔액은 그 구매 시점의 스냅샷이다 —
// 현재 잔액이 아니다. 먼저 이전 지갑 요청을 무효화하고, 같은 동기 구간에서 현재 지갑과 거래 내역을 다시
// 읽는다(계정이 바뀐 뒤에 조회를 시작하지 않는다). 조회 실패는 각 스토어의 재시도 상태에 남고 구매 완료
// 판정·원래 referenceEventId는 바꾸지 않는다.
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

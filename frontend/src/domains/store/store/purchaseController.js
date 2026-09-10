import { createStore } from "zustand/vanilla"

const rejectedCodes = new Set([
  "UNKNOWN_BULK_PURCHASE_FIELD", "UNKNOWN_BULK_PURCHASE_ITEM_FIELD", "INVALID_BULK_PURCHASE_REQUEST",
  "MISSING_REFERENCE_EVENT_ID", "EMPTY_PURCHASE_ITEMS", "INVALID_PURCHASE_ITEM", "DUPLICATE_PURCHASE_ITEM",
  "ITEM_NOT_PURCHASABLE", "INVALID_CURRENCY", "AMOUNT_OUT_OF_RANGE", "ITEM_ALREADY_OWNED",
  "INSUFFICIENT_BALANCE", "BALANCE_LIMIT_EXCEEDED", "REFERENCE_EVENT_CONFLICT",
])
const idle = { status: "idle", referenceEventId: null, itemIds: [], error: null }
const unresolved = (status) => status === "pending" || status === "unknown"

// Persist the original request before sending it. Account changes invalidate late UI responses,
// while the old account retains its request for reconciliation on its next login.
export function createPurchaseController({ storage, post, lookup, refresh, randomId }) {
  let account = null
  let generation = 0
  let busy = false
  const store = createStore(() => ({ ...idle }))
  const key = (id) => `joker:store-purchase:v1:${id}`
  const save = (state) => storage().setItem(key(account), JSON.stringify(state))
  const update = (state) => { save(state); store.setState(state, true) }
  const activate = (id) => {
    if (account === id) return
    account = id
    generation += 1
    busy = false
    let state = { ...idle }
    if (id) {
      try {
        const raw = storage().getItem(key(id))
        if (raw) {
          const saved = JSON.parse(raw)
          if (!Array.isArray(saved.itemIds) || !saved.itemIds.every(x => typeof x === "string")
            || !["idle", "pending", "unknown", "confirmed", "rejected"].includes(saved.status)
            || (unresolved(saved.status) && (!saved.referenceEventId || !saved.itemIds.length))) throw new Error("Invalid record")
          state = { ...saved, status: unresolved(saved.status) ? "unknown" : saved.status }
        }
      } catch {
        state = { ...idle, status: "blocked", error: "이전 구매 기록을 읽지 못했습니다. 저장소를 사용할 수 있는지 확인한 후 다시 로그인해 주세요." }
      }
    }
    store.setState(state, true)
  }
  const run = async (itemIds, checkOnly = false) => {
    if (!account || busy || store.getState().status === "blocked") return
    const previous = store.getState()
    const recovering = unresolved(previous.status)
    if (checkOnly && !recovering) return
    const ids = recovering ? [...previous.itemIds] : [...itemIds]
    if (!ids.length) return
    const request = { referenceEventId: recovering ? previous.referenceEventId : `shop:${randomId()}`, itemIds: ids, status: "pending", error: null }
    const started = generation
    const current = () => started === generation
    busy = true
    try { update(request) } catch {
      busy = false
      store.setState({ ...previous, error: "구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다." }, true)
      return
    }
    try {
      if (recovering) {
        try {
          await lookup(request.referenceEventId)
          if (!current()) return
          update({ ...request, status: "confirmed" })
          await refresh().catch(() => {})
          return
        } catch (error) {
          if (!current()) return
          if (checkOnly || error.code !== "PURCHASE_RESULT_NOT_FOUND") {
            update({ ...request, status: "unknown", error: "아직 구매 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." })
            return
          }
          // A missing result is not a definite rejection. Replay the exact same request key.
        }
      }
      await post({ items: ids.map(itemId => ({ itemId })), referenceEventId: request.referenceEventId })
      if (!current()) return
      update({ ...request, status: "confirmed" })
      await refresh().catch(() => {})
    } catch (error) {
      if (!current()) return
      const state = { ...request, status: rejectedCodes.has(error.code) ? "rejected" : "unknown", error: error.message ?? "구매 결과를 확인하지 못했습니다." }
      // If persistence itself fails after sending, keep the original persisted pending request.
      try { update(state) } catch { store.setState({ ...request, status: "unknown", error: "구매 결과 저장에 실패했습니다. 결과 확인을 눌러 주세요." }, true) }
    } finally {
      if (current()) busy = false
    }
  }
  return { store, activate, prepare: () => { if (!unresolved(store.getState().status) && store.getState().status !== "blocked") store.setState({ ...idle }, true) }, purchase: (ids) => run(ids), check: () => run([], true), retry: () => run(store.getState().itemIds) }
}

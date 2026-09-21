import { createStore } from "zustand/vanilla"

const rejectedCodes = new Set([
  "UNKNOWN_BULK_PURCHASE_FIELD", "UNKNOWN_BULK_PURCHASE_ITEM_FIELD", "INVALID_BULK_PURCHASE_REQUEST",
  "MISSING_REFERENCE_EVENT_ID", "EMPTY_PURCHASE_ITEMS", "INVALID_PURCHASE_ITEM", "DUPLICATE_PURCHASE_ITEM",
  "ITEM_NOT_PURCHASABLE", "INVALID_CURRENCY", "AMOUNT_OUT_OF_RANGE", "ITEM_ALREADY_OWNED",
  "INSUFFICIENT_BALANCE", "BALANCE_LIMIT_EXCEEDED", "REFERENCE_EVENT_CONFLICT",
])
// F-32c: 골드 구매의 알려진 거부. HTTP status·ok:false·code가 모두 맞을 때만 확정 거부로 본다.
const goldRejectedStatus = {
  INSUFFICIENT_DIAMOND: 400, BALANCE_LIMIT_EXCEEDED: 400, INVALID_GOLD_PURCHASE_REQUEST: 400,
  UNKNOWN_GOLD_PURCHASE_FIELD: 400, PRODUCT_NOT_FOUND: 404, PRODUCT_STOPPED: 409, REFERENCE_EVENT_CONFLICT: 409,
}
const goldStatuses = ["pending", "unknown", "confirmed", "rejected", "priceChanged"]
const idle = { status: "idle", referenceEventId: null, itemIds: [], error: null }
const unresolved = (status) => status === "pending" || status === "unknown"
const validText = (value, max) => typeof value === "string" && value.length >= 1 && value.length <= max
const validVersion = (value) => Number.isSafeInteger(value) && value > 0
const isGoldResultMissing = (error) =>
  error?.status === 404 && error?.success === false && error?.code === "PURCHASE_RESULT_NOT_FOUND"

// 저장된 기록을 읽는다. kind가 없으면 기존 itemIds 기록이고, GOLD는 itemIds:[]와 상품·버전을 함께 보존한다.
const restore = (saved) => {
  if (Object.hasOwn(saved, "kind")) {
    if (saved.kind !== "GOLD" || !goldStatuses.includes(saved.status) || !validText(saved.productId, 64)
      || !validVersion(saved.version) || !validText(saved.referenceEventId, 150)
      || !Array.isArray(saved.itemIds) || saved.itemIds.length) throw new Error("Invalid record")
    return {
      kind: "GOLD", status: unresolved(saved.status) ? "unknown" : saved.status, referenceEventId: saved.referenceEventId,
      itemIds: [], productId: saved.productId, version: saved.version,
      code: typeof saved.code === "string" ? saved.code : null, error: typeof saved.error === "string" ? saved.error : null,
    }
  }
  if (!Array.isArray(saved.itemIds) || !saved.itemIds.every(x => typeof x === "string")
    || !["idle", "pending", "unknown", "confirmed", "rejected"].includes(saved.status)
    || (unresolved(saved.status) && (!saved.referenceEventId || !saved.itemIds.length))) throw new Error("Invalid record")
  return { ...saved, status: unresolved(saved.status) ? "unknown" : saved.status }
}

// Persist the original request before sending it. Account changes invalidate late UI responses,
// while the old account retains its request for reconciliation on its next login.
export function createPurchaseController({ storage, post, postGold, lookup, refresh, randomId }) {
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
          state = restore(JSON.parse(raw))
        }
      } catch {
        state = { ...idle, status: "blocked", error: "이전 구매 기록을 읽지 못했습니다. 저장소를 사용할 수 있는지 확인한 후 다시 로그인해 주세요." }
      }
    }
    store.setState(state, true)
  }
  const run = async (itemIds, checkOnly = false) => {
    if (!account || busy || store.getState().status === "blocked" || store.getState().status === "priceChanged") return
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
  // F-32c: 골드 구매. 요청(kind·상품·버전·referenceEventId)을 먼저 저장하고, 미확정 요청은 명시적
  // check/retry에서만 다룬다 — 단순 호출이나 상품 선택 변경은 원래 요청을 바꾸거나 재전송하지 않는다.
  const runGold = async (mode, product) => {
    if (!account || busy) return
    const previous = store.getState()
    if (previous.status === "blocked" || previous.status === "priceChanged") return
    const priorGold = previous.kind === "GOLD"
    const recovering = unresolved(previous.status)
    if (mode === "purchase" && recovering) return
    if (mode === "check" && !(priorGold && recovering)) return
    if (mode === "retry" && !(priorGold && (recovering || previous.status === "rejected"))) return
    const { productId, version } = (mode === "purchase" ? product : previous) ?? {}
    if (!validText(productId, 64) || !validVersion(version)) return
    const request = {
      kind: "GOLD", referenceEventId: recovering && mode !== "purchase" ? previous.referenceEventId : `shop:${randomId()}`,
      itemIds: [], productId, version, status: "pending", error: null, code: null,
    }
    const started = generation
    const current = () => started === generation
    busy = true
    try { update(request) } catch {
      busy = false
      store.setState({ ...previous, error: "구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다." }, true)
      return
    }
    try {
      let result
      if (recovering) {
        try { result = await lookup(request.referenceEventId, "GOLD") } catch (error) {
          if (!current()) return
          // 정상적인 "결과 없음" 응답이 확인된 명시적 retry만 원래 요청을 다시 보낼 수 있다.
          if (mode === "check" || !isGoldResultMissing(error)) {
            update({ ...request, status: "unknown", error: "아직 구매 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." })
            return
          }
        }
      }
      result ??= await postGold({ productId, version, referenceEventId: request.referenceEventId })
      if (!current()) return
      const confirmed = { ...request, status: "confirmed" }
      try { update(confirmed) } catch { store.setState(confirmed, true) }
      try { await refresh(result) } catch { /* 잔액 재시도 UI가 맡는다 */ }
    } catch (error) {
      if (!current()) return
      let state
      if (error.code === "PRODUCT_VERSION_MISMATCH" && error.ok === false && error.status === 409) {
        state = { ...request, status: "priceChanged", error: "상품 정보가 변경되었습니다. 새 조건을 확인해 주세요." }
      } else if (Object.hasOwn(goldRejectedStatus, error.code) && error.ok === false && error.status === goldRejectedStatus[error.code]) {
        state = { ...request, status: "rejected", code: error.code, error: error.message ?? "구매가 거부되었습니다." }
      } else {
        state = { ...request, status: "unknown", error: "구매 결과를 확인하지 못했습니다." }
      }
      try { update(state) } catch { store.setState(state, true) }
    } finally {
      if (current()) busy = false
    }
  }
  // 변경된 가격을 사용자가 다시 확인한 뒤에만 새 요청을 만들 수 있게 priceChanged를 해제한다.
  const acceptPriceChange = () => {
    if (busy || store.getState().status !== "priceChanged") return
    try { update({ ...idle }) } catch {
      store.setState({ ...store.getState(), error: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." }, true)
    }
  }
  const isGold = () => store.getState().kind === "GOLD"
  return {
    store, activate, acceptPriceChange,
    prepare: () => { const { status } = store.getState(); if (!unresolved(status) && status !== "blocked" && status !== "priceChanged") store.setState({ ...idle }, true) },
    purchase: (ids) => run(ids), purchaseGold: (product) => runGold("purchase", product),
    check: () => isGold() ? runGold("check") : run([], true),
    retry: () => isGold() ? runGold("retry") : run(store.getState().itemIds),
  }
}

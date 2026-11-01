// 결제창에서 돌아온 주문 확인과 서버의 진행 중 주문 찾기
// currencyPurchase.store.js가 handleReturn·discoverOpenOrders로 내보냄
import { currencyApi } from "../../api/currency.api.js"
import { CONFIRM_FAILURES } from "../../constants/currencyPurchase.js"
import { parseReturn } from "../../utils/currencyParse.js"
import {
  ctx, discoveryRuns, excluded, inFlightOrders, isActive, recordOf, records, refreshSummary, returnRuns, set, setActive,
} from "./state.js"
import { advance, finishActive, preemptActive, schedulePoll } from "./queue.js"

// 결제 확인 한 번, 서버가 정한 코드·상태의 실패만 실패로 보고 나머지는 결과 모름
const confirmOnce = async ({ orderId, paymentKey, amount }) => {
  try {
    const result = await currencyApi.confirmOrder(orderId, { paymentKey, amount })
    return { kind: result.status === "GRANTED" ? "granted" : "pendingGrant" }
  } catch (error) {
    const status = typeof error?.code === "string" && Object.hasOwn(CONFIRM_FAILURES, error.code) ? CONFIRM_FAILURES[error.code] : null
    if (status !== null && error.ok === false && error.status === status) return { kind: "failed", reason: error.code }
    return { kind: "unknown" }
  }
}

// 돌아온 주문을 맨 앞에 보이고 확인함, 그사이 다른 주문이 보이면 결과를 미뤄 둠
const runReturn = async (ret, run, started) => {
  // 들어올 때 잔액을 아직 안 받았으면 한 번만 받음
  const takeEntryFetch = () => {
    if (!run.entryPending || started !== ctx.generation) return
    run.entryPending = false
    refreshSummary(started)
  }
  // 보이던 주문은 줄로 돌리고, 돌아온 주문을 확인 중으로 보임
  preemptActive(ret.orderId)
  ctx.queue = ctx.queue.filter((id) => id !== ret.orderId)
  const record = recordOf(ret.orderId, ret.amount, "return")
  record.closed = false
  setActive(ret.orderId)
  set({ status: "confirming", reason: null, order: { orderId: ret.orderId, amount: ret.amount }, autoChecks: record.pollCount, lookupFailed: false })
  // 같은 주문 조회가 돌고 있으면 끝날 때까지 기다림
  if (record.getRun) await record.getRun
  if (started !== ctx.generation) return
  // 조회에서 이미 지급을 봤으면 확인 요청을 다시 보내지 않음
  let outcome
  if (record.heldResult === "GRANTED") {
    record.heldResult = null
    outcome = { kind: "granted" }
  } else {
    record.heldResult = null
    outcome = await confirmOnce(ret)
  }
  if (started !== ctx.generation) return
  // 그사이 다른 주문이 보이면 결과·이유를 미뤄 둠
  const shown = isActive(ret.orderId)
  if (outcome.kind === "granted") {
    // 지급 끝: 완료 안내, 잔액 다시 받고 다음 주문으로
    run.entryPending = false
    record.serverStatus = "GRANTED"
    if (!shown) { record.heldResult = "GRANTED"; return }
    set({ status: "done", reason: null })
    const refreshing = refreshSummary(started)
    finishActive(ret.orderId, started)
    await refreshing
  } else if (outcome.kind === "failed") {
    // 실패: 이유 안내 뒤 다음 주문으로
    takeEntryFetch()
    if (!shown) { record.heldReason = outcome.reason; return }
    set({ status: "failed", reason: outcome.reason })
    finishActive(ret.orderId, started)
  } else {
    // 지급 대기·결과 모름: 자동 확인 시작
    record.serverStatus = outcome.kind === "pendingGrant" ? "PENDING_GRANT" : "CONFIRMING"
    takeEntryFetch()
    if (!shown) return
    set({ status: outcome.kind })
    schedulePoll(started, ret.orderId)
  }
}

// 돌아온 주소 하나당 확인은 한 번, 같은 주문의 확인이 돌고 있으면 그걸 같이 기다림
export const handleReturn = (search, { entryNeeded = false } = {}) => {
  // 결제 복귀 주소가 아니거나 로그인 안 했으면 무시
  const ret = parseReturn(search)
  if (!ret || !ctx.account) return Promise.resolve()
  const started = ctx.generation
  // 돌아온 주문은 진행 중 주문 찾기에서 빼서 두 번 보이지 않게 함
  if (ret.orderId && (ret.mode === "fail" || ret.valid)) excluded.add(ret.orderId)
  // 같은 주소면 앞 확인을 같이 씀, 같은 주문이 확인 중이면 그것도 같이 씀
  const key = ret.mode === "fail" ? `fail:${search}` : ret.valid ? `${ret.orderId}:${ret.paymentKey}:${ret.amount}` : `invalid:${search}`
  const existing = returnRuns.get(key)
  if (existing) return existing.promise
  const sharing = ret.mode === "success" && ret.valid ? inFlightOrders.get(ret.orderId) : null
  if (sharing) { returnRuns.set(key, sharing); return sharing.promise }
  const run = { entryPending: Boolean(entryNeeded && ret.mode === "success"), promise: null }
  returnRuns.set(key, run)
  // 다른 주문이 보이는 중이면 실패·잘못된 주소 안내는 띄우지 않음
  const showNotice = !ctx.active
  // 실패 복귀는 취소 안내, 잘못된 주소는 실패 안내, 정상 주소면 결제 확인 시작
  if (ret.mode === "fail") {
    if (showNotice) set({ status: "canceled", reason: "PAYMENT_RETURN_FAILED", order: null })
    run.promise = Promise.resolve()
  } else if (!ret.valid) {
    if (showNotice) set({ status: "failed", reason: "INVALID_RETURN", order: null })
    if (run.entryPending) { run.entryPending = false; run.promise = refreshSummary(started) } else run.promise = Promise.resolve()
  } else {
    inFlightOrders.set(ret.orderId, run)
    run.promise = runReturn(ret, run, started)
    // 확인이 끝나면 확인 중 표시 지움 (새 확인이 들어왔으면 그대로 둠)
    const release = () => { if (inFlightOrders.get(ret.orderId) === run) inFlightOrders.delete(ret.orderId) }
    run.promise.then(release, release)
  }
  return run.promise
}

// 가게에 들어올 때마다 한 번, 처음 보는 진행 중 주문을 줄에 넣고 다음 주문을 보임
export const discoverOpenOrders = (entryId) => {
  // 로그인 안 함·입장 id 없음이면 안 찾음, 같은 입장이면 앞 찾기를 같이 씀
  if (!ctx.account || entryId == null) return Promise.resolve()
  const existing = discoveryRuns.get(entryId)
  if (existing) return existing
  const started = ctx.generation
  const run = currencyApi.listOpenOrders().then(
    (orders) => {
      if (started !== ctx.generation) return
      // 결제 복귀로 온 주문·이미 기록 있는 주문은 뺌
      for (const order of orders) {
        if (excluded.has(order.orderId) || records.has(order.orderId)) continue
        recordOf(order.orderId, order.amount, "discovery", order.status)
        ctx.queue.push(order.orderId)
      }
      const next = advance(started)
      if (next) schedulePoll(started, next)
    },
    // 찾기 실패는 조용히 넘김
    () => {},
  )
  discoveryRuns.set(entryId, run)
  return run
}

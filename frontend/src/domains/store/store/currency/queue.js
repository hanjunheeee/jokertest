// 확인할 주문 대기 줄 (하나씩 화면에 보이기)과 주문 상태 확인·자동 확인
// 충전 시작·결제 복귀·진행 중 주문 찾기·currencyPurchase.store.js가 씀
// 줄 넘기기와 상태 반영·자동 확인이 서로를 불러서 한 파일에 둠
import { currencyApi } from "../../api/currency.api.js"
import { BUSY_STATUSES, MAX_AUTO_CHECKS, ORDER_FAILURE_REASONS, POLL_MS } from "../../constants/currencyPurchase.js"
import { ctx, get, inFlightOrders, isActive, records, refreshSummary, set, setActive } from "./state.js"

// 지급 기다림·결과 모름 상태일 때만 확인을 이어 감
export const inProgress = () => get().status === "unknown" || get().status === "pendingGrant"

// 지급 끝 또는 실패로 끝난 주문 상태인지
const isTerminal = (status) => status === "GRANTED" || Object.hasOwn(ORDER_FAILURE_REASONS, status)

// 주문을 닫고, 보이던 주문이면 자동 확인을 멈추고 다음 주문으로 넘어감
export const finishActive = (orderId, started) => {
  const record = records.get(orderId)
  if (record) record.closed = true
  if (!isActive(orderId)) return
  clearTimeout(ctx.pollTimer)
  ctx.pollTimer = null
  ctx.active = null
  resumeQueue(started)
}

// 줄에서 꺼낸 주문을 보이고, 미뤄 둔 결과가 있으면 바로 반영함 (자동 확인이 필요하면 true)
const showQueued = (orderId, started) => {
  const record = records.get(orderId)
  setActive(orderId)
  const confirming = inFlightOrders.has(orderId)
  set({
    status: confirming ? "confirming" : record.serverStatus === "PENDING_GRANT" ? "pendingGrant" : "unknown",
    reason: null, order: { orderId, amount: record.amount }, autoChecks: record.pollCount, lookupFailed: false,
  })
  // 결제 확인 중이면 그 결과를 기다림
  if (confirming) return false
  // 미뤄 둔 실패 이유가 있으면 바로 실패 안내 뒤 다음 주문으로
  if (record.heldReason) {
    const reason = record.heldReason
    record.heldReason = null
    set({ status: "failed", reason })
    finishActive(orderId, started)
    return false
  }
  // 미뤄 둔 서버 결과가 있으면 바로 반영
  if (record.heldResult) {
    const held = record.heldResult
    record.heldResult = null
    applyOrderStatus(orderId, held, started)
    return false
  }
  return true
}

// 보이는 주문이 없고 바쁘지 않을 때 닫히지 않은 다음 주문을 꺼냄
export const advance = (started) => {
  if (started !== ctx.generation || ctx.active || BUSY_STATUSES.includes(get().status)) return null
  // 기록 없거나 닫힌 주문은 건너뜀
  while (ctx.queue.length > 0) {
    const orderId = ctx.queue.shift()
    const record = records.get(orderId)
    if (!record || record.closed) continue
    return showQueued(orderId, started) ? orderId : null
  }
  return null
}
// 다음 주문을 꺼내서 자동 확인 걸기
export const resumeQueue = (started) => {
  const next = advance(started)
  if (next) schedulePoll(started, next)
}

// 결제 복귀 주문이 끼어들면 보이던 주문은 줄 맨 앞으로 돌려놓음
export const preemptActive = (orderId) => {
  clearTimeout(ctx.pollTimer)
  ctx.pollTimer = null
  if (ctx.active && ctx.active.orderId !== orderId && !records.get(ctx.active.orderId)?.closed) ctx.queue.unshift(ctx.active.orderId)
  ctx.active = null
}

// 서버 주문 상태를 반영함, 안 보이는 주문의 끝난 결과는 보일 때까지 미뤄 둠
const applyOrderStatus = async (orderId, status, started) => {
  if (started !== ctx.generation) return
  const record = records.get(orderId)
  if (!record) return
  record.serverStatus = status
  if (!isActive(orderId) || !inProgress()) {
    if (isTerminal(status)) record.heldResult = status
    return
  }
  // 지급 끝은 완료·잔액 다시 받기, 지급 대기는 계속 확인, 실패는 이유 안내 뒤 다음 주문
  if (status === "GRANTED") {
    set({ status: "done", reason: null })
    const refreshing = refreshSummary(started)
    finishActive(orderId, started)
    await refreshing
  } else if (status === "PENDING_GRANT") {
    set({ status: "pendingGrant" })
  } else if (Object.hasOwn(ORDER_FAILURE_REASONS, status)) {
    set({ status: "failed", reason: ORDER_FAILURE_REASONS[status] })
    finishActive(orderId, started)
  }
}

// 보이는 주문 상태를 한 번 물음, 이미 묻는 중이거나 결제 확인 중이면 그 결과를 같이 기다림
export const checkOrder = (orderId = ctx.active?.orderId) => {
  // 로그인 안 함·기록 없음·닫힘·안 보이는 주문·진행 중 아님이면 안 물음
  const record = typeof orderId === "string" ? records.get(orderId) : null
  if (!ctx.account || !record || record.closed || !isActive(orderId) || !inProgress()) return Promise.resolve()
  if (record.getRun) return record.getRun
  const confirming = inFlightOrders.get(orderId)
  if (confirming) return confirming.promise.then(() => {}, () => {})
  const started = ctx.generation
  // 한 번 묻고 반영, 실패면 '조회 실패' 표시만 켬
  const run = (async () => {
    try {
      const result = await currencyApi.getOrder(orderId)
      if (started !== ctx.generation) return
      if (isActive(orderId)) set({ lookupFailed: false })
      await applyOrderStatus(orderId, result.status, started)
    } catch {
      if (started === ctx.generation && isActive(orderId) && inProgress()) set({ lookupFailed: true })
    }
  })().finally(() => { if (record.getRun === run) record.getRun = null })
  record.getRun = run
  return run
}

// 주문마다 자동 확인은 MAX_AUTO_CHECKS번까지, 보이는 주문이 바뀌면 멈춤
export const schedulePoll = (started, orderId) => {
  clearTimeout(ctx.pollTimer)
  ctx.pollTimer = null
  const record = records.get(orderId)
  if (started !== ctx.generation || !record || !isActive(orderId) || !inProgress() || record.pollCount >= MAX_AUTO_CHECKS) return
  const { token } = ctx.active
  ctx.pollTimer = setTimeout(async () => {
    ctx.pollTimer = null
    // 기다리는 동안 계정·보이는 주문이 바뀌었거나 끝났으면 멈춤
    if (started !== ctx.generation || ctx.active?.token !== token || !inProgress()) return
    record.pollCount += 1
    set({ autoChecks: record.pollCount })
    await checkOrder(orderId)
    if (ctx.active?.token === token) schedulePoll(started, orderId)
  }, POLL_MS)
}

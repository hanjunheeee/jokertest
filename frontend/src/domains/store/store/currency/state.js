// 충전 흐름 스토어의 화면 상태와 화면 밖 진행 상태 (계정·세대·주문 기록·대기 줄)
// currencyPurchase.store.js와 currency/ 아래 흐름 파일이 같은 상태를 읽고 바꿈
import { createStore } from "zustand/vanilla"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import { currencyHistory } from "../currencyHistory.store.js"

const initialState = {
  products: [],
  productsStatus: "idle",
  productsLoadCount: 0,
  productsStale: false,
  configPending: false,
  status: "idle",
  reason: null,
  order: null,
  autoChecks: 0,
  lookupFailed: false,
}

export const store = createStore(() => ({ ...initialState }))
export const set = (patch) => store.setState(patch)
export const get = () => store.getState()

// 다른 파일에서 다시 넣는 값은 ctx에 둠, 계정이 바뀌면 세대를 올려 늦게 온 응답을 버림
export const ctx = {
  account: useAuthStore.getState().user?.uuid ?? null,
  generation: 0,
  creating: false,
  productsRun: null,
  pollTimer: null,
  queue: [],
  active: null,
  activeToken: 0,
}
export const returnRuns = new Map()
export const inFlightOrders = new Map()
export const records = new Map()
export const excluded = new Set()
export const discoveryRuns = new Map()

// 로그인 계정이 바뀌면 진행 중인 것을 전부 버리고 처음 상태로 돌림
export const activate = (id) => {
  if (id === ctx.account) return
  ctx.account = id
  ctx.generation += 1
  clearTimeout(ctx.pollTimer)
  ctx.pollTimer = null
  ctx.creating = false
  ctx.productsRun = null
  returnRuns.clear()
  inFlightOrders.clear()
  records.clear()
  ctx.queue = []
  excluded.clear()
  discoveryRuns.clear()
  ctx.active = null
  ctx.activeToken += 1
  store.setState({ ...initialState }, true)
}

// 지급이 끝나면 잔액과 재화 기록을 다시 받음
export const refreshSummary = async (started) => {
  if (started !== ctx.generation) return
  const summary = useEconomyStore.getState().fetchSummary()
  const history = currencyHistory.load()
  await Promise.allSettled([summary, history])
}

// 주문별 기록은 처음 볼 때 한 번만 만듦
export const recordOf = (orderId, amount, source, serverStatus = null) => {
  let record = records.get(orderId)
  if (!record) {
    record = { orderId, amount, source, serverStatus, pollCount: 0, getRun: null, heldResult: null, heldReason: null, closed: false }
    records.set(orderId, record)
  }
  return record
}
export const isActive = (orderId) => ctx.active !== null && ctx.active.orderId === orderId
// 화면에 보이는 주문을 바꿀 때마다 표를 새로 줌
export const setActive = (orderId) => {
  ctx.activeToken += 1
  ctx.active = { orderId, token: ctx.activeToken }
  return ctx.activeToken
}

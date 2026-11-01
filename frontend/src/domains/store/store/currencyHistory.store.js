// 재화 거래 내역 스토어 (최근 50개 불러오기·응답 검사)
// 거래 내역 창·가게 패널·충전 흐름·가게 구매 스토어가 지급 뒤 다시 받을 때 씀
import { createStore } from "zustand/vanilla"
import { useStore } from "zustand"
import { purchaseApi } from "../api/currency.api.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

export const HISTORY_LIMIT = 50

const initialState = {
  status: "idle",
  transactions: [],
}

const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
const isEntryId = (value) => (Number.isSafeInteger(value) && value > 0) || (typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value))
const brokenResponse = () => new Error("거래 내역 응답이 올바르지 않습니다.")

// 거래 내역 응답 검사, 하나라도 틀리면 전체를 버림
export const parseTransactions = (body) => {
  if (!body || !Array.isArray(body.transactions) || body.transactions.length > HISTORY_LIMIT) throw brokenResponse()
  const seen = new Set()
  return body.transactions.map((raw) => {
    if (!raw || typeof raw !== "object" || !isEntryId(raw.id) || seen.has(String(raw.id))) throw brokenResponse()
    seen.add(String(raw.id))
    if (!isText(raw.reason, 40) || !/^[A-Z_]{1,10}$/.test(raw.currency ?? "")) throw brokenResponse()
    if (!Number.isSafeInteger(raw.amount) || !Number.isSafeInteger(raw.balanceAfter) || raw.balanceAfter < 0) throw brokenResponse()
    if (!isText(raw.referenceEventId, 150) || typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) throw brokenResponse()
    if (raw.itemId != null && !isText(raw.itemId, 120)) throw brokenResponse()
    const { id, reason, currency, amount, balanceAfter, referenceEventId, createdAt } = raw
    return { id, reason, itemId: raw.itemId ?? null, currency, amount, balanceAfter, referenceEventId, createdAt }
  })
}

const store = createStore(() => ({ ...initialState }))

let account = useAuthStore.getState().user?.uuid ?? null
let generation = 0
let seq = 0

// 계정이 바뀌면 세대를 올려 늦게 온 응답을 버림
const activate = (id) => {
  if (id === account) return
  account = id
  generation += 1
  seq += 1
  store.setState({ ...initialState }, true)
}
useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))

// 마지막으로 보낸 요청의 응답만 반영함
const load = () => {
  if (!account) return Promise.resolve()
  const started = generation
  const mine = ++seq
  const current = () => started === generation && mine === seq
  store.setState({ status: "loading" })
  return purchaseApi.transactions(account).then(
    (body) => {
      if (!current()) return
      let transactions
      try { transactions = parseTransactions(body) } catch {
        store.setState({ status: "error" })
        return
      }
      store.setState({ status: "ready", transactions })
    },
    () => { if (current()) store.setState({ status: "error" }) },
  )
}

const loadIfIdle = () => (store.getState().status === "idle" ? load() : Promise.resolve())

export const currencyHistory = { store, load, loadIfIdle }
export const useCurrencyHistory = () => useStore(store)

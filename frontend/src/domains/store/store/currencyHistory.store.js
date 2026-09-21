// F-32 BQ: 상점의 재화 거래 내역(서버 원장 최근 50건). 기존 본인 조회
// GET /economy/accounts/:userId/transactions를 그대로 쓴다 — 잔액은 여기서 합산하지 않고 지갑 조회
// (economy.store.js fetchSummary)가 맡는다. 계정이 바뀌면 목록·오류·진행 요청을 버리고(generation),
// 같은 계정 안에서는 가장 늦게 시작한 조회의 응답만 반영한다(seq).
import { createStore } from "zustand/vanilla"
import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

export const HISTORY_LIMIT = 50

const initialState = {
  status: "idle", // idle | loading | ready | error
  transactions: [],
}

const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
const isEntryId = (value) => (Number.isSafeInteger(value) && value > 0) || (typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value))
const brokenResponse = () => new Error("거래 내역 응답이 올바르지 않습니다.")

// 서버 원장 행을 검사한다. 한 행이라도 계약 밖이면 목록 전체를 오류로 본다(일부만 보여 주지 않는다).
// BIGINT id는 숫자로 바꾸지 않고 받은 값(안전한 정수 또는 숫자 문자열)을 그대로 식별자로 쓴다.
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

const activate = (id) => {
  if (id === account) return
  account = id
  generation += 1
  seq += 1
  store.setState({ ...initialState }, true)
}
useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))

/** 현재 계정의 최근 원장을 다시 읽는다. 실패·깨진 응답은 error(재시도 가능)이며 빈 내역으로 바꾸지 않는다. */
const load = () => {
  if (!account) return Promise.resolve()
  const started = generation
  const mine = ++seq
  const current = () => started === generation && mine === seq
  store.setState({ status: "loading" })
  return api.get(`/economy/accounts/${account}/transactions`).then(
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

/** 아직 한 번도 조회하지 않았을 때만 조회한다(성공 복귀 처리 뒤 진입 조회 보완용). */
const loadIfIdle = () => (store.getState().status === "idle" ? load() : Promise.resolve())

export const currencyHistory = { store, load, loadIfIdle }
export const useCurrencyHistory = () => useStore(store)

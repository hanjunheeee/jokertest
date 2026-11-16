// 상점 화면 시험 몫 도우미: 가짜 서버(fetch)·가짜 결제창(토스)·로그인·상점 판 그리기·단추와 단추 아래 글 찾기
// a12-store·a12-mypage 폴더 시험이 씀 (공용 아님), 시험 파일은 맨 위에서 ../helpers/domSetup.mjs 먼저 부르고 이 파일을 await import
//
// 쓰는 법
//   import "../helpers/domSetup.mjs"
//   const kit = await import("./storeKit.mjs")
//   test.afterEach(() => kit.reset())
//   const s = kit.start({ gold: 0 })          // 새 계정으로 로그인 + 가짜 서버 (지갑 골드 0)
//   await kit.renderStore()                   // 상점 판 그림 (처음 분류 스킨)
//   await kit.pickCategory("프로필 테두리")    // 분류 고르기
//   kit.buyButton().disabled / kit.reasonText()
// 조심: assert.equal에 화면 요소를 그대로 넣지 않음 (틀리면 차이 글 만들다 메모리 넘침) → 글자·참거짓만 비교
import { createElement as h } from "react"

const rtl = await import("@testing-library/react")
const { MotionGlobalConfig } = await import("framer-motion")
const { MemoryRouter, createMemoryRouter, RouterProvider } = await import("react-router-dom")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { useEconomyStore } = await import("../../src/domains/economy/store/economy.store.js")
const { default: StorePanel } = await import("../../src/domains/store/components/panel/StorePanel.jsx")

export { rtl, h, MemoryRouter, useAuthStore, useEconomyStore }

// 창 움직임은 바로 끝냄 (jsdom엔 그림이 없어 움직임이 안 끝나면 메모리가 바닥남)
MotionGlobalConfig.skipAnimations = true
// 스크롤바가 크기 감시를 씀 → jsdom엔 없어서 아무것도 안 하는 흉내
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.ResizeObserver = globalThis.ResizeObserver
}

// ── 가짜 서버 ──

// 누가 봐도 가짜인 결제 시험 키 (모양만 test_ck_로 맞춤, 진짜 결제사로 안 나감)
export const FAKE_CLIENT_KEY = "test_ck_A12FAKEKEYNOTREAL"

// 서버 재화 상품 (백엔드 a12 흐름 시험의 상품 모양)
export const DIA_PRODUCT = Object.freeze({
  productId: "dia-100", kind: "DIAMOND_TOPUP", displayName: "다이아 100", payCurrency: "KRW", payAmount: 1100,
  grantCurrency: "DIAMOND", grantAmount: 100, bonusAmount: 10, version: 3,
})
export const GOLD_PRODUCT = Object.freeze({
  productId: "gold-500", kind: "GOLD_PURCHASE", displayName: "골드 500", payCurrency: "DIAMOND", payAmount: 50,
  grantCurrency: "GOLD", grantAmount: 500, bonusAmount: 0, version: 2,
})

// 서버 답 하나 { status, body }
export const reply = (status, body) => ({ status, body })
// 인터넷 끊김: fetch가 TypeError로 실패 (브라우저마다 글이 다름)
export const offline = (message = "Failed to fetch") => ({ offline: message })
// 답을 나중에 줌 (답 오기 전 화면을 보려고)
export function later() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, give: (value) => resolve(value) }
}

let server = null
let uuidSeq = 0
let storeView = null

// 가짜 서버: 화면이 보낸 요청을 calls에 모으고, 경로별로 정한 답을 돌려줌 (정하지 않은 경로는 404 + unexpected)
export function createServer({ gold = 0, diamond = 0, entitlements = [], products = [], transactions = [], openOrders = [] } = {}) {
  const routes = []
  const s = {
    calls: [],
    unexpected: [],
    wallet: { balanceGold: gold, balanceDiamond: diamond },
    entitlements: entitlements.map((itemId) => ({ itemId, itemType: "ITEM", source: "PURCHASE", acquiredAt: "2026-11-16T00:00:00.000Z" })),
    loadout: { selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: {}, revision: "rev-1" },
    products: [...products],
    transactions: [...transactions],
    openOrders: [...openOrders],
    // 경로 답 정하기 (나중에 정한 것이 먼저 걸림), fn({ path, query, body, n }) → reply·offline·later().promise
    on(method, pattern, fn) {
      routes.unshift({ method, pattern, fn: typeof fn === "function" ? fn : () => fn })
      return s
    },
    // 그 방법·경로로 간 요청만 → [{ method, path, query, body }]
    callsOf(method, pattern) {
      return s.calls.filter((c) => c.method === method && (typeof pattern === "string" ? c.path === pattern : pattern.test(c.path)))
    },
  }
  // 늘 있는 답 (지갑·가진 것·내역·상품 목록·열린 주문)
  s.on("GET", /^\/economy\/accounts\/[^/]+\/wallet$/, () => reply(200, { ...s.wallet }))
  s.on("GET", /^\/economy\/accounts\/[^/]+\/entitlements$/, () => reply(200, { entitlements: s.entitlements, loadout: s.loadout }))
  s.on("GET", /^\/economy\/accounts\/[^/]+\/transactions$/, () => reply(200, { transactions: s.transactions }))
  s.on("GET", "/economy/currency-products", () => reply(200, { ok: true, products: s.products }))
  s.on("GET", "/economy/topup/orders", () => reply(200, { ok: true, orders: s.openOrders }))

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), "http://localhost")
    const method = (options.method ?? "GET").toUpperCase()
    let body = null
    if (typeof options.body === "string") { try { body = JSON.parse(options.body) } catch { body = options.body } }
    const call = { method, path: url.pathname, query: url.search, body }
    s.calls.push(call)
    const route = routes.find((r) => r.method === method
      && (typeof r.pattern === "string" ? r.pattern === url.pathname : r.pattern.test(url.pathname)))
    if (!route) {
      s.unexpected.push(call)
      return new Response(JSON.stringify({ success: false, message: "없는 경로" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    const n = s.calls.filter((c) => c.method === method && c.path === url.pathname).length
    const out = await route.fn({ ...call, n })
    if (out && Object.hasOwn(out, "offline")) throw new TypeError(out.offline)
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status, headers: { "Content-Type": "application/json" } })
  }
  return s
}

// ── 가짜 결제창 (토스 SDK 자리에 끼움, 진짜 결제창·결제사로 안 나감) ──

// behave(opts) → 결제창 결과 (약속 그대로 돌려줌: resolve = 창 열고 결제 화면으로 넘어감, reject = 취소·실패)
// 기본은 바로 끝남 (안 끝나면 창 닫힘 감시의 10분 타이머가 남아 시험 프로세스가 안 끝남)
export function installToss(behave = () => Promise.resolve()) {
  const toss = { opened: [], behave }
  window.TossPayments = (clientKey) => ({
    payment: () => ({
      requestPayment: (opts) => {
        toss.opened.push({ clientKey, orderId: opts.orderId, amount: opts.amount?.value, orderName: opts.orderName })
        return toss.behave(opts)
      },
    }),
  })
  return toss
}
// 결제창 꾸러미(SDK)를 못 받는 상태: 꾸러미 자리를 비우고, 붙인 스크립트는 바로 불러오기 실패로 둠
export function breakTossSdk() {
  delete window.TossPayments
  const original = document.head.appendChild.bind(document.head)
  document.head.appendChild = (node) => {
    const added = original(node)
    if (node?.tagName === "SCRIPT") queueMicrotask(() => node.onerror?.(new window.Event("error")))
    return added
  }
  return () => { document.head.appendChild = original }
}

// ── 로그인·시작·정리 ──

// 새 계정 uuid (시험마다 달라서 기기 기록·스토어가 안 섞임)
export const nextUuid = (prefix = "a12-user") => `${prefix}-${++uuidSeq}`

export function signIn(uuid, nickname = "상점손님") {
  useAuthStore.getState().login({ uuid, nickname })
}
export function signOut() {
  useAuthStore.getState().logout()
}

// 가짜 서버를 켜고 새 계정으로 로그인 → { server, uuid }
export function start(options = {}) {
  server = createServer(options)
  const uuid = options.uuid ?? nextUuid()
  signIn(uuid)
  return Object.assign(server, { uuid })
}

// 시험 끝: 화면 떼기·로그아웃(진행 중 자동 확인 타이머도 꺼짐)·기기 저장소 비우기·주소 되돌리기
export function reset() {
  rtl.cleanup()
  storeView = null
  signOut()
  try { window.localStorage.clear() } catch { /* 막힌 저장소 시험 뒤 */ }
  window.history.replaceState(null, "", "/")
  delete window.TossPayments
}

// ── 기다리기 ──

// 응답·상태 바뀜을 몇 바퀴 흘려보냄 (가짜 시계를 켜도 setImmediate는 진짜라 멈추지 않음)
export async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)) })
  }
}
// 조건이 참이 될 때까지 짧게 흘려봄 (판 화면 + waitFor 조합 금지 규칙 따라 작게 씀)
export async function until(check, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return true
    await flush(1)
  }
  return check()
}
export async function click(element) {
  await rtl.act(async () => { rtl.fireEvent.click(element) })
  await flush()
}

// ── 상점 판 그리기·찾기 ──

let router = null

// 상점 판 그림 (search는 결제 복귀 주소 쿼리, 예 "?topup=fail&code=X")
export async function renderStore({ search = "" } = {}) {
  window.history.replaceState(null, "", `/store${search}`)
  router = createMemoryRouter([{ path: "/store", element: h(StorePanel) }], { initialEntries: [`/store${search}`] })
  storeView = rtl.render(h(RouterProvider, { router }))
  await flush()
  return storeView
}
// 같은 화면에서 주소 쿼리만 바뀜 (결제창에서 돌아옴), 화면 코드가 읽는 창 주소도 같이 바꿈
export async function navigateStore(search) {
  window.history.replaceState(null, "", `/store${search}`)
  await rtl.act(async () => { await router.navigate(`/store${search}`) })
  await flush()
}
export const container = () => storeView.container

// 상점 화면 통째(위 잔액 칸·쿠폰 단추 포함) 그림, 입장 영상은 건너뛰기 단추로 넘김
export async function renderStorePage({ search = "" } = {}) {
  const { default: StorePage } = await import("../../src/domains/store/pages/StorePage.jsx")
  window.history.replaceState(null, "", `/store${search}`)
  storeView = rtl.render(h(MemoryRouter, { initialEntries: [`/store${search}`] }, h(StorePage)))
  await flush()
  const skip = document.querySelector('button[aria-label="인트로 건너뛰기"]')
  if (skip) await click(skip)
  return storeView
}
// 위 잔액 칸 글 (예 "무료 재화 1500", 불러오기 실패면 "… 다시 시도하려면 선택하세요")
export const balanceLabels = () => [...document.querySelectorAll('[aria-label="보유 재화"] [aria-label]')].map((el) => el.getAttribute("aria-label"))

// 오른쪽 분류 단추 누르기
export async function pickCategory(label) {
  const list = document.querySelector('[aria-label="카테고리 목록"]')
  const button = [...list.querySelectorAll("button")].find((b) => b.textContent === label)
  if (!button) throw new Error(`분류 없음: ${label}`)
  await click(button)
}
// 상품 칸 (이름 글자로 찾음)
export const slotButtons = () => [...document.querySelectorAll("button[aria-pressed]")].filter((b) => b.closest('[aria-label="카테고리 목록"]') === null && b.textContent !== "일괄구매" && b.closest("section") === null)
export function slotOf(name) {
  return slotButtons().find((b) => b.textContent.replace(/\s+/g, "").includes(name.replace(/[-\s]+/g, "")))
}
export async function pickItem(name) {
  const slot = slotOf(name)
  if (!slot) throw new Error(`상품 칸 없음: ${name}`)
  await click(slot)
}
// 고른 상품 설명 칸
export const detail = () => document.querySelector('section[aria-label="선택한 아이템 정보"]')
// 구매 단추 (설명 칸 첫 단추)
export const buyButton = () => detail()?.querySelector("button") ?? null
// 단추 이름(보이는 글자)
export const buyLabel = () => buyButton()?.textContent ?? null
// 꺼진 까닭 줄
export const reasonEl = () => detail()?.querySelector('[data-testid="purchase-block-reason"]') ?? null
export const reasonText = () => reasonEl()?.textContent ?? null
// 구매 단추 줄 바로 다음 칸 (단추 아래 안내 자리)
export const belowButton = () => buyButton()?.parentElement?.nextElementSibling ?? null
export const belowText = () => belowButton()?.textContent ?? ""
// 설명 칸 밖(판 맨 위 상자 쪽) 글
export function outsideDetailText() {
  const root = container()
  const clone = root.cloneNode(true)
  clone.querySelector('section[aria-label="선택한 아이템 정보"]')?.remove()
  return clone.textContent
}
// 글이 화면에 몇 번 나오나 (겹침 확인)
export function countText(text) {
  const all = document.body.textContent
  return all.split(text).length - 1
}
// 이름(글자)으로 단추 찾기
export function buttonNamed(text, root = document.body) {
  return [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text) ?? null
}
// 구매 단추 누르기
export async function pressBuy() {
  await click(buyButton())
}

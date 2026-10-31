import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("alert", () => {})
dom.window.alert = () => {}
dom.window.HTMLMediaElement.prototype.pause = () => {}
dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined },
})

let routes = []
let calls = []
const json = (status, body) => {
  const response = { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } }
  response.clone = () => response
  return response
}
const route = (method, pattern, handler) => routes.unshift({ method, pattern, handler })
installDomGlobal("fetch", async (url, options = {}) => {
  const method = options.method ?? "GET"
  const body = options.body ? JSON.parse(options.body) : undefined
  calls.push({ method, path: url, body })
  const hit = routes.find((entry) => entry.method === method && entry.pattern.test(url))
  if (!hit) throw new Error(`unhandled ${method} ${url}`)
  return hit.handler({ body, url })
})
const posts = (pattern) => calls.filter((call) => call.method === "POST" && pattern.test(call.path))

const WALLET = /\/economy\/accounts\/[^/]+\/wallet$/
const ENTITLEMENTS = /\/economy\/accounts\/[^/]+\/entitlements$/
const PRODUCTS_URL = /\/economy\/currency-products$/
const TRANSACTIONS = /\/economy\/accounts\/[^/]+\/transactions$/
const OPEN_ORDERS = /\/economy\/topup\/orders\?state=open$/
const PURCHASE_GET = /\/economy\/purchases\/[^/]+$/
const BULK_POST = /\/economy\/purchases\/bulk$/

const LOADOUT = {
  selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: null, revision: "r1",
}

const BASIC_EMOTICONS = [
  ["emoji-basic-reject", "거절"], ["emoji-basic-tears", "눈물"], ["emoji-basic-anger", "분노"],
  ["emoji-basic-love", "사랑"], ["emoji-basic-grin", "씨익"], ["emoji-basic-hello", "안녕"],
  ["emoji-basic-surrender", "항복"], ["emoji-basic-dizzy", "헤롱"],
]
const SHOP_EMOTICONS = [
  ["emoji-thorned-heart", "가시박힌 심장"], ["emoji-duel-challenge", "결투를 신청한다"],
  ["emoji-nasty-mock", "기분나쁜 조롱"], ["emoji-startled", "깜짝"], ["emoji-im-crying", "나 울고있어"],
  ["emoji-find-culprit", "범인 색출"], ["emoji-ready-to-burn", "불 탈 준비됐어"], ["emoji-shush", "쉿 조용히"],
  ["emoji-which-potion", "어떤 약이었지"], ["emoji-puzzled", "어리둥절"], ["emoji-elegant-toast", "우아한 건배"],
  ["emoji-meaningful", "의미심장"], ["emoji-take-aim", "정조준"], ["emoji-dead-soul", "죽은자의 영혼"],
  ["emoji-vote-time", "투표할 시간이야"],
]
const BASIC_OWNED = BASIC_EMOTICONS.map(([itemId]) => ({ itemId, itemType: "EMOTICON", source: "DEFAULT_GRANT" }))

const { render, act, cleanup, waitFor, fireEvent, within } = await import("@testing-library/react")
const { RouterProvider, MemoryRouter } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")
const { default: StorePanel } = await import("../../components/panel/StorePanel.jsx")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
const { EMOTICON_STORE_ITEMS, STORE_ITEMS } = await import("../../constants/storeItems.js")

const setUser = async (user) => act(async () => {
  useAuthStore.setState({ isLoggedIn: Boolean(user), user, loggedOutIntentionally: false })
})

async function newWorld({ gold = 10000, entitlements = BASIC_OWNED } = {}) {
  routes = []; calls = []
  await setUser(null)
  dom.window.localStorage.clear()
  route("GET", WALLET, () => json(200, { balanceGold: gold, balanceDiamond: 0 }))
  route("GET", ENTITLEMENTS, () => json(200, { entitlements, loadout: LOADOUT }))
  route("GET", PRODUCTS_URL, () => json(200, { ok: true, products: [] }))
  route("GET", TRANSACTIONS, () => json(200, { transactions: [] }))
  route("GET", OPEN_ORDERS, () => json(200, { ok: true, orders: [] }))
  route("GET", PURCHASE_GET, () => json(404, { success: false, code: "PURCHASE_RESULT_NOT_FOUND", message: "none" }))
  route("POST", BULK_POST, () => json(200, { results: [] }))
  await setUser({ uuid: "user-1", nickname: "테스터" })
}

async function mountStore({ path = "/store", strict = false } = {}) {
  await act(async () => { await router.navigate(path) })
  const tree = React.createElement(RouterProvider, { router })
  let view
  await act(async () => { view = render(strict ? React.createElement(React.StrictMode, null, tree) : tree) })
  const skip = view.queryByRole("button", { name: "인트로 건너뛰기" })
  if (skip) await act(async () => { fireEvent.click(skip) })
  return view
}
async function mountStorePanel() {
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/store"] }, React.createElement(StorePanel, { visible: true })))
  })
  return view
}
const text = (view) => view.container.textContent
const click = (view, name) => act(async () => { fireEvent.click(view.getByRole("button", { name })) })
const waitEconomyReady = () => waitFor(() => assert.equal(useEconomyStore.getState().status, "ready"))
const slotButtons = (view) => Array.from(view.container.querySelectorAll("button[aria-pressed]"))
  .filter((el) => el.querySelector("img") && !el.textContent.includes("일괄구매"))
const findSlot = (view, name) => {
  const matches = slotButtons(view).filter((el) => el.textContent.replace("보유중", "").startsWith(name))
  assert.equal(matches.length, 1, `상품 칸 ${name}은 정확히 하나여야 한다`)
  return matches[0]
}
const selectItem = (view, name) => act(async () => { fireEvent.click(findSlot(view, name)) })
const detail = (view) => within(view.getByRole("region", { name: "선택한 아이템 정보" }))
const openEmoticonTab = async (view) => {
  await click(view, "이모티콘")
  await waitFor(() => assert.match(text(view), /가시박힌 심장/))
}

test.afterEach(async () => {
  cleanup()
  await setUser(null)
})

test("storeItems: EMOTICON_STORE_ITEMS는 설계도 §0의 23종이고 기본 8종은 가격 0·기본 지급, 상점 15종은 500", () => {
  assert.equal(EMOTICON_STORE_ITEMS.length, 23)
  assert.deepEqual(EMOTICON_STORE_ITEMS.map((item) => [item.id, item.name]), [...BASIC_EMOTICONS, ...SHOP_EMOTICONS])
  for (const item of EMOTICON_STORE_ITEMS) assert.equal(item.category, "이모티콘")
  for (const [itemId] of BASIC_EMOTICONS) {
    const item = EMOTICON_STORE_ITEMS.find((entry) => entry.id === itemId)
    assert.equal(item.icon, `/shopItem/basic/emoji/${itemId.replace("emoji-basic-", "")}.png`)
    assert.equal(Number(item.priceAmount), 0)
    assert.equal(item.tag, "기본 지급")
  }
  for (const [itemId] of SHOP_EMOTICONS) {
    const item = EMOTICON_STORE_ITEMS.find((entry) => entry.id === itemId)
    assert.equal(item.icon, `/shopItem/emoji/${itemId.replace("emoji-", "")}.png`)
    assert.equal(Number(item.priceAmount), 500)
    assert.notEqual(item.tag, "기본 지급")
  }
  assert.equal(STORE_ITEMS.some((item) => item.id.startsWith("emoticon-")), false)
})

test("AC-05: 이모티콘 탭에는 상점 15종만 보이고 기본 8종·다른 카테고리 상품은 섞이지 않는다", async () => {
  await newWorld()
  const view = await mountStore()
  await waitEconomyReady()
  await openEmoticonTab(view)

  const slots = slotButtons(view)
  assert.equal(slots.length, 15, "이모티콘 탭의 상품 칸은 상점 15종만이다")
  for (const [, name] of SHOP_EMOTICONS) findSlot(view, name)
  for (const [, name] of BASIC_EMOTICONS) {
    assert.throws(() => findSlot(view, name), /상품 칸/)
  }
  assert.doesNotMatch(text(view), /남작|가고일/, "다른 카테고리 상품은 보이지 않는다")
  assert.doesNotMatch(text(view), /표시 전용/, "이모티콘은 더 이상 표시 전용이 아니다")
})

test("AC-05(StorePanel 직접 마운트): 이모티콘 탭에는 상점 15종만 보이고 모두 구매 가능하다", async () => {
  await newWorld()
  const view = await mountStorePanel()
  await waitEconomyReady()
  assert.ok(calls.some((call) => call.method === "GET" && WALLET.test(call.path)), "StorePanel이 지갑을 조회한다")
  assert.ok(calls.some((call) => call.method === "GET" && ENTITLEMENTS.test(call.path)), "StorePanel이 소유 목록을 조회한다")
  await openEmoticonTab(view)

  assert.equal(slotButtons(view).length, 15, "이모티콘 탭의 상품 칸은 상점 15종만이다")
  for (const [, name] of SHOP_EMOTICONS) {
    await selectItem(view, name)
    assert.equal(detail(view).getByRole("button", { name: "구매" }).disabled, false, `${name}의 구매 버튼은 활성이어야 한다`)
  }
  assert.equal(posts(BULK_POST).length, 0, "선택만으로는 구매 요청을 보내지 않는다")
})

test("AC-05: 상점 15종은 선택하면 활성 구매 버튼이 보이고, 누르면 기존 구매 POST로 그 itemId를 구매한다", async () => {
  await newWorld()
  const view = await mountStore()
  await waitEconomyReady()
  await openEmoticonTab(view)

  for (const [, name] of SHOP_EMOTICONS) {
    await selectItem(view, name)
    const button = detail(view).getByRole("button", { name: "구매" })
    assert.equal(button.disabled, false, `${name}의 구매 버튼은 활성이어야 한다`)
    assert.match(detail(view).getByRole("heading").textContent, new RegExp(name))
  }

  await selectItem(view, "가시박힌 심장")
  await click(view, "구매")
  await waitFor(() => assert.equal(posts(BULK_POST).length, 1))
  assert.deepEqual(posts(BULK_POST)[0].body.items, [{ itemId: "emoji-thorned-heart" }])
})

test("AC-05: 이모티콘 탭에서도 일괄구매로 상점 이모티콘을 묶어 사고, 기본 지급 이모티콘은 묶음에 들어가지 않는다", async () => {
  await newWorld()
  const view = await mountStore()
  await waitEconomyReady()
  await openEmoticonTab(view)

  await click(view, "일괄구매")
  await selectItem(view, "가시박힌 심장")
  await selectItem(view, "깜짝")
  await selectItem(view, "정조준")
  await click(view, "구매")
  const dialog = within(view.getByRole("dialog", { name: "선택 상품 구매 확인" }))
  await act(async () => { fireEvent.click(dialog.getByRole("button", { name: "구매하기" })) })

  await waitFor(() => assert.equal(posts(BULK_POST).length, 1))
  assert.deepEqual(
    posts(BULK_POST)[0].body.items.map((item) => item.itemId).sort(),
    ["emoji-startled", "emoji-take-aim"],
  )
})

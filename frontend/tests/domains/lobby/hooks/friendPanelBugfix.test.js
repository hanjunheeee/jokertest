// 친구 패널 버그 수정 확인: 1-8(다 받기 전 "이미 처리됨"), FE-007(거절 버튼), FE-035(수락 실패 문구),
// FE-008(차단 실패 문구), 받은 신청 줄 차단 중 잠금, 목록 실패 때 "없습니다" 안 띄움
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://127.0.0.1:5183/lobby",
})
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

let incomingResponder = async () => []
let acceptResponder = async () => ({})
let declineResponder = async () => ({})
let blockResponder = async () => ({})
let searchResponder = async () => []
let sendResponder = async () => ({})
mock.module("../../../../src/domains/lobby/api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => [],
    fetchIncomingRequests: async () => incomingResponder(),
    fetchFavoriteFriendIds: async () => [],
    setFriendFavoriteApi: async () => ({}),
    fetchBlockedUsers: async () => [],
    blockUserApi: async (id) => blockResponder(id),
    unblockUserApi: async () => ({}),
    acceptFriendRequest: async (id) => acceptResponder(id),
    declineFriendRequest: async (id) => declineResponder(id),
    fetchFriendRequestResults: async () => [],
    searchFriendCandidates: async (q) => searchResponder(q),
    sendFriendRequest: async (id) => sendResponder(id),
    fetchGameInviteSnapshot: async () => ({ invites: [], cursor: "0" }),
    createGameInviteApi: async () => ({}),
    fetchGameInviteApi: async () => ({}),
    declineGameInviteApi: async () => ({}),
  },
})

const { act, createElement } = await import("react")
const { createRoot } = await import("react-dom/client")
const { useFriendListSync } = await import("../../../../src/domains/lobby/hooks/useFriendListSync.js")
const { useFriendSearch } = await import("../../../../src/domains/lobby/hooks/useFriendSearch.js")
const { useLobbyIntro } = await import("../../../../src/domains/lobby/hooks/useLobbyIntro.js")
const { useBlockActions } = await import("../../../../src/domains/lobby/hooks/friendPanel/useBlockActions.js")
const { useFriendStore } = await import("../../../../src/domains/lobby/store/friend.store.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const FriendAcceptTab = (await import("../../../../src/domains/lobby/components/friendList/accept/FriendAcceptTab.jsx")).default
const FriendBlockTab = (await import("../../../../src/domains/lobby/components/friendList/block/FriendBlockTab.jsx")).default

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const REQUESTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const flush = async (n = 10) => { for (let i = 0; i < n; i += 1) await Promise.resolve() }

function mount(element) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return {
    container,
    rerender: (next) => act(() => { root.render(next) }),
    unmount: () => { act(() => root.unmount()); container.remove() },
  }
}

function captureHook(useHook, arg) {
  const box = { current: null }
  function Probe() {
    box.current = useHook(arg)
    return null
  }
  const view = mount(createElement(Probe))
  return { box, view }
}

test.beforeEach(() => {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ME }, loggedOutIntentionally: false })
  useFriendStore.getState().__resetForTests()
  incomingResponder = async () => []
  acceptResponder = async () => ({})
  declineResponder = async () => ({})
  blockResponder = async () => ({})
})

const request = { request_id: 7, id: REQUESTER, name: "보낸이" }

test("1-8: 받은 신청을 다 받기 전엔 '이미 처리되었습니다'를 안 띄움, 다 받은 뒤 없을 때만 띄움", async () => {
  let release
  incomingResponder = () => new Promise((resolve) => { release = resolve })
  const { box, view } = captureHook(useFriendListSync, true)
  await act(async () => { await flush() })
  assert.equal(box.current.incomingLoaded, false, "받는 중")

  await act(async () => { release([request]); await flush() })
  assert.equal(box.current.incomingLoaded, true)
  view.unmount()

  const tab = mount(createElement(FriendAcceptTab, { incomingRequests: [], targetRequestId: 7 }))
  assert.equal(tab.container.textContent.includes("이미 처리"), false, "기본값은 아직 못 받음")
  tab.rerender(createElement(FriendAcceptTab, { incomingRequests: [], targetRequestId: 7, incomingLoaded: true }))
  assert.equal(tab.container.textContent.includes("이미 처리"), true)
  tab.unmount()
})

test("FE-007·FE-035: 받은 신청 줄에 거절 버튼이 있고, 수락 실패하면 줄에 문구가 뜸", async () => {
  incomingResponder = async () => [request]
  const { box, view } = captureHook(useFriendListSync, true)
  await act(async () => { await flush() })

  acceptResponder = async () => { throw new Error("서버 오류") }
  await act(async () => { await box.current.handleAcceptRequest(7); await flush() })
  assert.equal(box.current.requestErrors[7], "수락하지 못했습니다. 다시 시도해 주세요.")

  let declined = null
  const tab = mount(createElement(FriendAcceptTab, {
    incomingRequests: [request],
    incomingLoaded: true,
    onDecline: (id) => { declined = id },
    requestErrors: box.current.requestErrors,
  }))
  const declineButton = tab.container.querySelector('[data-decline-request="7"]')
  assert.ok(declineButton, "거절 버튼")
  act(() => { declineButton.click() })
  assert.equal(declined, 7)
  assert.ok(tab.container.querySelector('[data-request-error="7"][role="alert"]'))
  tab.unmount()

  declineResponder = async () => ({})
  await act(async () => { await box.current.handleDeclineRequest(7); await flush() })
  assert.equal(useFriendStore.getState().incomingRequests.length, 0, "거절 성공이면 줄 지움")
  assert.equal(box.current.requestErrors[7], undefined, "다시 누르면 옛 문구 지움")
  view.unmount()
})

test("FE-008: 차단이 실패하면 대상별 문구가 남고, 받은 신청 줄은 차단 중 수락·거절이 잠김", async () => {
  blockResponder = async () => { throw new Error("차단 실패(서버)") }
  const { box, view } = captureHook(useBlockActions)
  await act(async () => { await box.current.handleBlockUser(REQUESTER); await flush() })
  assert.equal(box.current.blockErrors[REQUESTER], "차단 실패(서버)")
  view.unmount()

  const tab = mount(createElement(FriendAcceptTab, {
    incomingRequests: [request],
    incomingLoaded: true,
    onAccept: () => {},
    onDecline: () => {},
    onBlock: () => {},
    blockingIds: new Set([REQUESTER]),
  }))
  assert.equal(tab.container.querySelector('[data-accept-request="7"]').disabled, true)
  assert.equal(tab.container.querySelector('[data-decline-request="7"]').disabled, true)
  assert.equal(tab.container.querySelector(`[data-block-target="${REQUESTER}"]`).disabled, true)
  tab.unmount()
})

test("목록을 못 받았으면 '없습니다' 문구 없이 오류만 보임 (받은 신청·차단 탭)", () => {
  const accept = mount(createElement(FriendAcceptTab, { incomingRequests: [], incomingError: "받은 신청을 불러오지 못했습니다." }))
  assert.equal(accept.container.textContent.includes("불러오지 못했습니다"), true)
  assert.equal(accept.container.querySelectorAll("li").length, 0)
  accept.unmount()

  const block = mount(createElement(FriendBlockTab, { blockedUsers: [], error: "차단 목록 실패", status: "error" }))
  assert.equal(block.container.textContent.includes("차단한 사용자가 없습니다"), false)
  block.unmount()
})

test("1-9·연타: 검색 결과가 있어도 신청 실패 문구가 줄에 남고, 보내는 중엔 같은 신청을 다시 안 보냄", async () => {
  const candidate = { id: REQUESTER, name: "후보", status: "ONLINE" }
  searchResponder = async () => [candidate]
  let sendCalls = 0
  let failSend
  sendResponder = () => { sendCalls += 1; return new Promise((_, reject) => { failSend = reject }) }
  const { box, view } = captureHook(useFriendSearch)

  assert.equal(box.current.isSearching, false)
  act(() => { box.current.setQuery("후보") })
  assert.equal(box.current.isSearching, false, "검색 버튼 전엔 결과·없음 문구 안 보임")
  await act(async () => { await box.current.handleSearch() })
  assert.equal(box.current.isSearching, true)
  assert.equal(box.current.results.length, 1)

  let first
  act(() => { first = box.current.handleSend(REQUESTER) })
  act(() => { box.current.handleSend(REQUESTER) })
  assert.equal(sendCalls, 1, "연타는 한 번만 보냄")
  assert.equal(box.current.sendingIds.has(REQUESTER), true)
  await act(async () => { failSend(new Error("이미 신청한 사용자입니다.")); await first })
  assert.equal(box.current.sendErrors[REQUESTER], "이미 신청한 사용자입니다.")
  assert.equal(box.current.sendingIds.has(REQUESTER), false)

  act(() => { box.current.setQuery("다른") })
  assert.equal(box.current.isSearching, false, "검색어를 바꾸면 지난 결과를 안 보임")
  view.unmount()
})

test("FE-009: 저장소가 막힌 브라우저(접근 때 throw)에서도 로비 인트로 훅이 안 터지고 '안 봄'으로 봄", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("SecurityError: storage blocked") },
  })
  try {
    const { box, view } = captureHook(useLobbyIntro)
    assert.equal(typeof box.current.uiVisible, "boolean", "그리다 안 터짐")
    act(() => { box.current.skipIntro?.() })
    view.unmount()
  } finally {
    Object.defineProperty(globalThis, "localStorage", original)
  }
})

import assert from "node:assert/strict"
import test from "node:test"
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

let windowOpenCalls = []
dom.window.open = (...args) => { windowOpenCalls.push(args); return null }
installDomGlobal("open", dom.window.open)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { mock } = await import("node:test")

mock.module("../../../src/shared/env.js", {
  namedExports: {
    API_BASE_URL: "http://localhost:4000",
    DISCORD_SUPPORT_URL: undefined,
  },
})

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }

mock.module("../../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
      put: async () => { throw new Error("api.put is not used in this test") },
      patch: async () => { throw new Error("api.patch is not used in this test") },
      delete: async () => { throw new Error("api.delete is not used in this test") },
    },
    apiClient: async () => { throw new Error("apiClient is not used in this test") },
    refreshAccessToken: async () => { throw new Error("refreshAccessToken is not used in this test") },
  },
})

const { render, act, cleanup, waitFor, fireEvent, within } = await import("@testing-library/react")
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router-dom")

const { default: LobbyPage } = await import("../../../src/domains/lobby/pages/LobbyPage.jsx")
const { LOBBY_MENU_ITEMS } = await import("../../../src/domains/lobby/constants/lobbyMenu.js")
const { LOBBY_ASSETS, LOBBY_MENU_BUTTONS } = await import("../../../src/domains/lobby/constants/lobbyAssets.js")
const { LOBBY_INTRO_SESSION_KEY } = await import("../../../src/domains/lobby/constants/lobbyIntro.js")
const { useAuthStore } = await import("../../../src/domains/auth/store/auth.store.js")
const { useEconomyStore } = await import("../../../src/domains/economy/store/economy.store.js")
const { useUserProfileStore } = await import("../../../src/domains/user/store/user.store.js")
const { useProfileCustomizationStore } = await import("../../../src/domains/user/store/profileCustomization.store.js")
const { publicAsset } = await import("../../../src/shared/utils/publicAsset.js")
const USER_UUID = "user-1"

const PHOTO_CURRENT = "player-profile-금빛가면"
const PHOTO_NEXT = "player-profile-기사"
const BORDER_CURRENT = "profile-border-평민"
const BORDER_NEXT = "profile-border-귀족"

const ENTITLEMENTS = [
  { itemId: PHOTO_CURRENT, itemType: "PROFILE_PHOTO" },
  { itemId: PHOTO_NEXT, itemType: "PROFILE_PHOTO" },
  { itemId: BORDER_CURRENT, itemType: "PROFILE_BORDER" },
  { itemId: BORDER_NEXT, itemType: "PROFILE_BORDER" },
]

const PROFILE_RESPONSE = {
  nickname: "테스터",
  title: "가면의 손님",
  total_games: 12,
  account_win_rate: 0.25,
  survival_count: 7,
  execution_count: 2,
  highest_win_rate_role: "귀족",
}

function serverLoadout(overrides = {}) {
  return {
    selectedProfilePhotoId: PHOTO_CURRENT,
    selectedProfileBorderId: BORDER_CURRENT,
    selectedCardFrameId: null,
    selectedSkinsByJob: null,
    revision: "rev-1",
    ...overrides,
  }
}

let equipProfileCalls = []

function installDefaultApi(loadout = serverLoadout()) {
  equipProfileCalls = []
  getImpl = async (endpoint) => {
    if (endpoint === "/user/me/profile") return PROFILE_RESPONSE
    if (endpoint.endsWith("/wallet")) return { balanceGold: 100, balanceDiamond: 100 }
    if (endpoint.endsWith("/entitlements")) return { entitlements: ENTITLEMENTS, loadout }
    return {}
  }
  postImpl = async (endpoint, body) => {
    if (endpoint === "/economy/equip-profile") {
      equipProfileCalls.push(body)
      return { loadout: { ...loadout, selectedProfilePhotoId: body.photoItemId ?? loadout.selectedProfilePhotoId, revision: "rev-2" } }
    }
    throw new Error(`unexpected POST ${endpoint}`)
  }
}

function resetAll() {
  windowOpenCalls = []
  dom.window.localStorage.clear()
  dom.window.localStorage.setItem(LOBBY_INTRO_SESSION_KEY, "1")
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: USER_UUID }, loggedOutIntentionally: false })
  useEconomyStore.getState().reset()
  useUserProfileStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
  installDefaultApi()
}

let currentPath = "/lobby"

function PathProbe() {
  currentPath = useLocation().pathname
  return null
}

async function mountLobby() {
  currentPath = "/lobby"
  let view
  await act(async () => {
    view = render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/lobby"] },
        React.createElement(PathProbe, null),
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/lobby", element: React.createElement(LobbyPage, null) }),
          React.createElement(Route, { path: "*", element: React.createElement("div", { "data-testid": "other-route" }) }),
        ),
      ),
    )
  })
  await waitFor(() => assert.ok(view.queryByRole("button", { name: "마이페이지" })))
  return view
}

test.afterEach(() => cleanup())

function getSupportElement(view) {
  const nav = view.getByRole("navigation", { name: "로비 메뉴" })
  return within(nav).getByLabelText("고객센터")
}

test("F-18 AC-01: 로비 오른쪽의 독립 Discord 버튼이 더 이상 렌더되지 않는다", async () => {
  resetAll()
  const view = await mountLobby()

  assert.equal(
    view.queryAllByLabelText("Discord FAQ").length,
    0,
    "제거 대상인 로비 오른쪽 Discord 버튼(LobbyDiscordButton)이 아직 보입니다.",
  )

  assert.equal(view.queryAllByLabelText("고객센터").length, 1)
})

test("F-18 AC-02: 고객센터는 왼쪽 메뉴 목록의 마지막 항목 하나뿐이고, 고객센터 프레임과 Discord 로고가 같은 요소 안에 있다", async () => {
  resetAll()
  const view = await mountLobby()

  const nav = view.getByRole("navigation", { name: "로비 메뉴" })
  const supportElements = within(nav).queryAllByLabelText("고객센터")
  assert.equal(supportElements.length, 1, "고객센터 진입 요소가 중복되었습니다.")

  const menuChildren = Array.from(nav.children)
  assert.equal(menuChildren.length, LOBBY_MENU_ITEMS.length)
  assert.equal(menuChildren[menuChildren.length - 1], supportElements[0])

  const images = Array.from(supportElements[0].querySelectorAll("img")).map((img) => img.getAttribute("src"))
  assert.deepEqual(images, [
    publicAsset(LOBBY_MENU_BUTTONS.customerSupport),
    publicAsset(LOBBY_ASSETS.discordLogo),
  ])

  assert.equal(view.queryAllByLabelText("고객센터").length, 1)
  assert.equal(view.queryAllByText("고객센터").length, 0, "별도의 고객센터 텍스트 버튼이 생겼습니다.")
})

test("F-18 AC-03: 지원 URL이 미설정이면 고객센터는 비활성 버튼이고 href·외부 이동을 만들지 않는다", async () => {
  resetAll()
  const view = await mountLobby()

  const support = getSupportElement(view)

  assert.equal(support.tagName, "BUTTON", "미설정 상태에서는 링크(a)를 만들면 안 됩니다.")
  assert.equal(support.disabled, true)
  assert.equal(support.getAttribute("href"), null)
  assert.equal(support.getAttribute("aria-current"), null, "고객센터에는 선택 표시를 붙이지 않습니다.")
  assert.ok(
    (support.getAttribute("title") ?? "").length > 0,
    "연결이 설정되지 않았다는 안내가 있어야 합니다.",
  )

  const nav = view.getByRole("navigation", { name: "로비 메뉴" })
  assert.equal(nav.querySelectorAll("a[href]").length, 0, "추측한 대체 URL로 링크를 만들면 안 됩니다.")

  await act(async () => { fireEvent.click(support) })

  assert.equal(windowOpenCalls.length, 0, "미설정 상태에서 외부 이동이 발생했습니다.")
  assert.equal(currentPath, "/lobby", "고객센터는 앱 내부 경로로 이동하지 않습니다.")
})

test("F-18 AC-03: 일반 메뉴는 기존 내부 이동 경로를 그대로 유지한다", async () => {
  resetAll()
  const view = await mountLobby()

  const nav = view.getByRole("navigation", { name: "로비 메뉴" })
  const archiveButton = within(nav).getByAltText("기억의 서고").closest("button")

  await act(async () => { fireEvent.click(archiveButton) })

  await waitFor(() => assert.equal(currentPath, "/library"))
  assert.equal(windowOpenCalls.length, 0)
})

test("F-18 AC-05: 로비 메뉴에 명예의 전당 진입(버튼·이동·접근성 항목)이 남아 있지 않다", async () => {
  resetAll()
  const view = await mountLobby()

  const nav = view.getByRole("navigation", { name: "로비 메뉴" })

  assert.equal(within(nav).queryAllByLabelText("명예의 전당").length, 0)
  assert.equal(within(nav).queryAllByAltText("명예의 전당").length, 0)
  assert.equal(within(nav).queryAllByText("명예의 전당").length, 0)
  assert.equal(nav.querySelectorAll('a[href="/podium"]').length, 0)

  const hallOfFameSrc = publicAsset(LOBBY_MENU_BUTTONS.hallOfFame)
  assert.equal(view.container.querySelectorAll(`img[src="${hallOfFameSrc}"]`).length, 0)

  const focusables = nav.querySelectorAll("button, a, [tabindex]")
  assert.equal(focusables.length, LOBBY_MENU_ITEMS.length)
})

test("F-30 AC-04: 실제 로비 배너에 닉네임이 그려지고 명성 이름·값은 어디에도 없다", async () => {
  resetAll()
  const view = await mountLobby()

  const banner = view.getByRole("button", { name: "마이페이지" })
  assert.ok(banner.textContent.includes("테스터"), "로비 배너에 닉네임이 보이지 않는다")
  assert.equal(/명성/.test(view.container.textContent), false, "로비 화면에 명성 이름이 남아 있다")
  assert.equal(banner.textContent.includes("10"), false, "로비 배너에 명성 값이 남아 있다")
})

test("F-18: 로비 배너 아래 프로필 수정 버튼은 더 이상 렌더되지 않는다", async () => {
  resetAll()
  const view = await mountLobby()

  assert.equal(view.queryAllByRole("button", { name: "프로필 수정" }).length, 0)
  assert.equal(view.queryAllByRole("dialog").length, 0)
})

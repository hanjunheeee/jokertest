import assert from "node:assert/strict"
import test from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-18 로비 통합 시험 (AC-01 · AC-02 · AC-03 · AC-04 · AC-05).
//
// 실제 LobbyPage를 그대로 마운트해서 하나의 렌더 경로에서 확인한다 — 로비 오른쪽 큰
// Discord 버튼의 제거, 왼쪽 메뉴의 고객센터 유지, 지원 링크 미설정 계약, 프로필 수정 모달
// 진입·저장·즉시 반영, 명예의 전당 진입 제거. 화면 조각을 따로 만들어 흉내내지 않는다.
//
// AC-03 주의: 이 저장소에는 아직 실제 Discord 지원 URL(VITE_DISCORD_SUPPORT_URL)이 제공되지
// 않았다. 그래서 env 경계는 **미설정(undefined)** 그대로 두고, "미설정이면 외부 목적지를
// 만들지 않는다"는 계약만 실제 resolver·훅·nav를 통과시켜 고정한다. 실제 지원 URL로의
// 도착 확인은 값이 제공되기 전까지 미검증으로 남는다(AC-03 자체가 그렇게 규정한다) —
// 여기서 그럴듯한 초대 URL을 지어내 "검증됨"처럼 보이게 만들지 않는다.
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
// jsdom은 ResizeObserver/IntersectionObserver를 구현하지 않는다 — 로비의 스크롤바·패널이
// 이를 쓰므로 콜백 없이 무시하는 최소 스텁만 채운다(SkinCardWearOverlay 통합 시험과 같은 관례).
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

// 외부 이동이 실제로 일어나는지 세기 위한 경계다(미설정이면 0회여야 한다).
let windowOpenCalls = []
dom.window.open = (...args) => { windowOpenCalls.push(args); return null }
installDomGlobal("open", dom.window.open)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { mock } = await import("node:test")

// import.meta.env 경계만 테스트 설정으로 바꾼다 — resolver·훅·nav·모달·store는 전부 실제 코드다.
mock.module("../../../shared/env.js", {
  namedExports: {
    API_BASE_URL: "http://localhost:4000",
    // D-06의 실제 지원 URL이 아직 제공되지 않았다(미제공 상태 그대로).
    DISCORD_SUPPORT_URL: undefined,
  },
})

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }

mock.module("../../../shared/api/client.js", {
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

const { default: LobbyPage } = await import("../pages/LobbyPage.jsx")
const { LOBBY_MENU_ITEMS } = await import("../constants/lobbyMenu.js")
const { LOBBY_ASSETS, LOBBY_MENU_BUTTONS } = await import("../constants/lobbyAssets.js")
const { LOBBY_INTRO_SESSION_KEY } = await import("../constants/lobbyIntro.js")
const { useAuthStore } = await import("../../auth/store/auth.store.js")
const { useEconomyStore } = await import("../../economy/store/economy.store.js")
const { useUserProfileStore } = await import("../../user/store/user.store.js")
const { useProfileCustomizationStore } = await import("../../user/store/profileCustomization.store.js")
const { publicAsset } = await import("../../../shared/utils/publicAsset.js")
const {
  profileBorderAssetSrcForItemId,
  profilePhotoAssetSrcForItemId,
} = await import("../../user/constants/profileEditLayout.js")

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

// F-30: 명성은 응답에서 제거됐고(AC-04), 표시 판수와 원시 승률이 같은 모집단의 두 필드로
// 내려온다(AC-02) — user.store가 둘 다 표시 가능한 값인지 검사하므로 유효한 값이어야 한다.
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
  // 재방문으로 두어 인트로 없이 로비 UI가 바로 드러나게 한다(useLobbyIntro의 실제 계약).
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
  // 프로필 조회가 끝나야 배너·프로필 수정 버튼이 실제로 드러난다.
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

  // 왼쪽 메뉴의 고객센터는 남아 있어야 한다(AC-02) — 둘을 한 번에 확인한다.
  assert.equal(view.queryAllByLabelText("고객센터").length, 1)
})

test("F-18 AC-02: 고객센터는 왼쪽 메뉴 목록의 마지막 항목 하나뿐이고, 고객센터 프레임과 Discord 로고가 같은 요소 안에 있다", async () => {
  resetAll()
  const view = await mountLobby()

  const nav = view.getByRole("navigation", { name: "로비 메뉴" })
  const supportElements = within(nav).queryAllByLabelText("고객센터")
  assert.equal(supportElements.length, 1, "고객센터 진입 요소가 중복되었습니다.")

  // 메뉴 항목 순서상 마지막이어야 한다.
  const menuChildren = Array.from(nav.children)
  assert.equal(menuChildren.length, LOBBY_MENU_ITEMS.length)
  assert.equal(menuChildren[menuChildren.length - 1], supportElements[0])

  // 프레임 이미지와 Discord 로고가 같은 하나의 요소의 자식이다.
  const images = Array.from(supportElements[0].querySelectorAll("img")).map((img) => img.getAttribute("src"))
  assert.deepEqual(images, [
    publicAsset(LOBBY_MENU_BUTTONS.customerSupport),
    publicAsset(LOBBY_ASSETS.discordLogo),
  ])

  // 로비 어디에도 별도의 고객센터 버튼·링크가 새로 생기지 않았다.
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

  // 명예의 전당 메뉴 이미지가 화면 어디에도 남아 있지 않다(숨긴 요소·빈 슬롯 금지).
  const hallOfFameSrc = publicAsset(LOBBY_MENU_BUTTONS.hallOfFame)
  assert.equal(view.container.querySelectorAll(`img[src="${hallOfFameSrc}"]`).length, 0)

  // 키보드 포커스 대상도 메뉴 항목 수만큼만 있어야 한다(잔여 tabIndex 없음).
  const focusables = nav.querySelectorAll("button, a, [tabindex]")
  assert.equal(focusables.length, LOBBY_MENU_ITEMS.length)
})

// F-30 AC-04: 로비 배너는 실제 서버 응답을 그대로 태운 경로다 — 닉네임은 남고 명성은
// 이름도 값도 없어야 한다(응답에서 지웠어도 화면이 옛 필드를 읽고 있으면 여기서 드러난다).
test("F-30 AC-04: 실제 로비 배너에 닉네임이 그려지고 명성 이름·값은 어디에도 없다", async () => {
  resetAll()
  const view = await mountLobby()

  const banner = view.getByRole("button", { name: "마이페이지" })
  assert.ok(banner.textContent.includes("테스터"), "로비 배너에 닉네임이 보이지 않는다")
  assert.equal(/명성/.test(view.container.textContent), false, "로비 화면에 명성 이름이 남아 있다")
  assert.equal(banner.textContent.includes("10"), false, "로비 배너에 명성 값이 남아 있다")
})

test("F-18 AC-04: 로비의 프로필 수정 버튼은 마이페이지와 같은 프로필 편집 모달을 열고, 내부 이동을 일으키지 않는다", async () => {
  resetAll()
  const view = await mountLobby()

  const editButton = view.getByRole("button", { name: "프로필 수정" })
  await act(async () => { fireEvent.click(editButton) })

  const dialogs = view.getAllByRole("dialog")
  assert.equal(dialogs.length, 1, "프로필 편집 모달은 하나만 열려야 합니다.")
  assert.equal(dialogs[0].getAttribute("aria-label"), "프로필 수정")
  assert.equal(currentPath, "/lobby", "모달은 페이지 이동 없이 로비 위에 열립니다.")
})

test("F-18 AC-04: 사진을 바꾸고 확인하면 실제 POST가 한 번만 나가고(중복 확인 방지), expectedRevision이 함께 실린다", async () => {
  resetAll()
  const view = await mountLobby()
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "ready"))
  assert.equal(useEconomyStore.getState().loadout.revision, "rev-1", "저장 전에 서버 revision을 확보해야 한다")

  // 저장 응답을 붙잡아 두어 "진행 중 연속 클릭"을 재현한다.
  let resolvePost
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/equip-profile")
    equipProfileCalls.push(body)
    return new Promise((resolve) => { resolvePost = resolve })
  }

  await act(async () => { fireEvent.click(view.getByRole("button", { name: "프로필 수정" })) })

  const bannerButton = view.getByRole("button", { name: "마이페이지" })
  const bannerSrcBefore = Array.from(bannerButton.querySelectorAll("img")).map((img) => img.getAttribute("src"))

  const photoGrid = view.getByRole("region", { name: "프로필 이미지 목록" })
  const photoOptions = within(photoGrid).getAllByRole("button")
  assert.equal(photoOptions.length, 2, "보유한 사진 목록이 서버 entitlements에서 유도되어야 한다")
  assert.equal(photoOptions[0].getAttribute("aria-pressed"), "true")

  await act(async () => { fireEvent.click(photoOptions[1]) })

  assert.equal(photoOptions[1].getAttribute("aria-pressed"), "true", "선택은 초안(미리보기)에만 반영된다")
  assert.deepEqual(
    Array.from(bannerButton.querySelectorAll("img")).map((img) => img.getAttribute("src")),
    bannerSrcBefore,
    "저장 전에는 배너의 실제 장착 사진이 바뀌면 안 된다",
  )

  const confirmButton = view.getByRole("button", { name: "수정하기" })
  await act(async () => { fireEvent.click(confirmButton) })
  await act(async () => { fireEvent.click(confirmButton) })

  assert.equal(equipProfileCalls.length, 1, "진행 중 연속 클릭은 실제 전송을 한 번만 만들어야 한다")
  assert.equal(equipProfileCalls[0].photoItemId, PHOTO_NEXT)
  assert.equal(equipProfileCalls[0].borderItemId, undefined, "바뀌지 않은 슬롯은 요청에 싣지 않는다")
  assert.equal(equipProfileCalls[0].expectedRevision, "rev-1", "서버 CAS용 revision을 그대로 되돌려 보내야 한다")

  await act(async () => {
    resolvePost({ loadout: serverLoadout({ selectedProfilePhotoId: PHOTO_NEXT, revision: "rev-2" }) })
  })

  // 성공하면 모달이 닫히고, 배너의 사진이 서버 결과로 즉시 바뀐다.
  await waitFor(() => assert.equal(view.queryAllByRole("dialog").length, 0))

  const expectedPhotoSrc = publicAsset(profilePhotoAssetSrcForItemId(PHOTO_NEXT))
  const expectedBorderSrc = publicAsset(profileBorderAssetSrcForItemId(BORDER_CURRENT))
  await waitFor(() => {
    const srcs = Array.from(
      view.getByRole("button", { name: "마이페이지" }).querySelectorAll("img"),
    ).map((img) => img.getAttribute("src"))
    assert.ok(srcs.includes(expectedPhotoSrc), "저장한 사진이 로비 배너에 즉시 반영되어야 한다")
    assert.ok(srcs.includes(expectedBorderSrc), "바꾸지 않은 테두리는 그대로 유지되어야 한다")
  })
})

test("F-18 AC-04: 아무것도 바꾸지 않고 확인하면 서버 저장 요청을 만들지 않는다", async () => {
  resetAll()
  const view = await mountLobby()
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "ready"))

  await act(async () => { fireEvent.click(view.getByRole("button", { name: "프로필 수정" })) })
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "수정하기" })) })

  assert.equal(equipProfileCalls.length, 0, "바뀐 슬롯이 없으면 불필요한 요청을 만들지 않는다")
  await waitFor(() => assert.equal(view.queryAllByRole("dialog").length, 0))
})

test("F-18 AC-04: 서버가 명시적으로 거부하면 모달과 초안을 유지하고 배너의 실제 장착 사진도 바뀌지 않는다", async () => {
  resetAll()
  const view = await mountLobby()
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "ready"))

  postImpl = async (endpoint, body) => {
    equipProfileCalls.push(body)
    throw Object.assign(new Error("보유하지 않은 상품입니다."), { code: "ITEM_NOT_OWNED" })
  }

  await act(async () => { fireEvent.click(view.getByRole("button", { name: "프로필 수정" })) })

  const bannerButton = view.getByRole("button", { name: "마이페이지" })
  const bannerSrcBefore = Array.from(bannerButton.querySelectorAll("img")).map((img) => img.getAttribute("src"))

  const photoGrid = view.getByRole("region", { name: "프로필 이미지 목록" })
  const photoOptions = within(photoGrid).getAllByRole("button")
  await act(async () => { fireEvent.click(photoOptions[1]) })
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "수정하기" })) })

  assert.equal(equipProfileCalls.length, 1)
  assert.equal(view.queryAllByRole("dialog").length, 1, "거부된 저장은 편집기를 닫지 않는다(재시도 경로 유지)")
  assert.ok(view.queryByText("보유하지 않은 상품입니다."), "거부 사유가 화면에 드러나야 한다")
  assert.deepEqual(
    Array.from(
      view.getByRole("button", { name: "마이페이지" }).querySelectorAll("img"),
    ).map((img) => img.getAttribute("src")),
    bannerSrcBefore,
    "거부된 저장은 실제 장착 상태를 바꾸지 않는다",
  )
})

// [버그 1] 로비 프로필 배너의 톱니는 장식 시험 (로비 화면 전체를 그려 톱니·배너·계정 관리 길 확인)
// 목록 A11b 화면 부품 A11-F-751~756
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, act } = await import("@testing-library/react")
const { installFetch, flushUi, renderRoutes, signIn, resetStores, profileBody } = await import("./a11Kit.mjs")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { default: LobbyPage } = await import("../../src/domains/lobby/pages/LobbyPage.jsx")
const { LOBBY_ASSETS } = await import("../../src/shared/constants/lobbyAssets.js")
const { publicAsset } = await import("../../src/shared/utils/publicAsset.js")

test.afterEach(() => { cleanup(); resetStores() })

// 로그인한 채 로비를 그림 (프로필 받아 배너가 보일 때까지)
async function lobby() {
  // 친구 칸·알림 칸이 여는 목록은 빈 목록으로 답함
  const empty = { status: 200, body: { success: true, data: [] } }
  installFetch({
    "GET /user/me/profile": profileBody({ nickname: "가면손님" }),
    "GET /friends": empty,
    "GET /friends/requests/incoming": empty,
    "GET /friends/favorites": empty,
    "GET /friends/blocks": empty,
    "GET /friends/invites": empty,
  })
  signIn()
  useAuthStore.setState({ sessionBootstrap: "done" })
  const view = renderRoutes([
    { path: "/lobby", element: React.createElement(LobbyPage) },
    { path: "/mypage", element: React.createElement("p", null, "마이페이지 화면") },
    { path: "/account", element: React.createElement("p", null, "계정 관리 화면") },
  ], { entries: ["/lobby"] })
  await flushUi(8)
  assert.ok(screen.getByRole("button", { name: "마이페이지" }), "준비: 프로필 배너 보임")
  return view
}

// 톱니 그림 요소 (그림 주소로 찾음)
const gearImage = () => {
  const src = publicAsset(LOBBY_ASSETS.settingsGear)
  return [...document.querySelectorAll("img")].find((img) => img.getAttribute("src") === src)
}

// Tab으로 닿는 요소 목록 (꺼짐·숨김·tabindex 음수 빼고)
const tabbables = () => [...document.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")].filter((el) => {
  if (el.disabled) return false
  if (el.getAttribute("tabindex") !== null && Number(el.getAttribute("tabindex")) < 0) return false
  return !el.closest("[aria-hidden='true'],[hidden],[inert]")
})

test("A11-F-751 톱니 그림 누름 → 주소 /lobby 그대로", async () => {
  const view = await lobby()
  const gear = gearImage()
  assert.ok(gear, "준비: 톱니 그림 있음")
  await act(async () => { fireEvent.click(gear) })
  await act(async () => { fireEvent.click(gear.parentElement) })
  await flushUi()
  assert.equal(view.path(), "/lobby")
})

test("A11-F-752 로비에 접근성 이름 '계정 설정' 단추 0개", async () => {
  await lobby()
  assert.equal(screen.queryAllByRole("button", { name: /계정 설정/ }).length, 0)
  assert.equal(screen.queryAllByRole("link", { name: /계정 설정/ }).length, 0)
})

test("A11-F-753 톱니 자리에 단추 역할·초점 없음 (aria-hidden, tabindex 없음)", async () => {
  await lobby()
  const holder = gearImage().closest("[aria-hidden='true']")
  assert.ok(holder, "톱니가 aria-hidden 안에 있음")
  assert.equal(holder.closest("button, a, [role='button']"), null)
  assert.equal(holder.hasAttribute("tabindex"), false)
  assert.equal(holder.querySelectorAll("button, a, [role='button'], [tabindex]").length, 0)
})

test("A11-F-754 배너 누름 → /mypage", async () => {
  const view = await lobby()
  fireEvent.click(screen.getByRole("button", { name: "마이페이지" }))
  await flushUi()
  assert.equal(view.path(), "/mypage")
})

test("A11-F-755 Tab 키 차례에 톱니 없음", async () => {
  await lobby()
  const gear = gearImage()
  assert.ok(tabbables().length > 0, "준비: Tab으로 닿는 단추가 있음")
  assert.equal(tabbables().some((el) => el.contains(gear)), false)
})

test("A11-F-756 로비 화면에 /account로 가는 단추·링크 0", async () => {
  const view = await lobby()
  assert.equal(document.querySelectorAll("a[href='/account'], a[href$='/account']").length, 0)
  // 단추를 하나씩 눌러 봐도 /account로 안 감 (누를 때마다 로비를 새로 그림)
  const count = screen.getAllByRole("button").length
  assert.ok(count >= 3, `준비: 로비 단추 수 ${count}`)
  cleanup()
  view.unmount?.()
  for (let i = 0; i < count; i += 1) {
    resetStores()
    const v = await lobby()
    const button = screen.getAllByRole("button")[i]
    if (!button) { cleanup(); continue }
    await act(async () => { fireEvent.click(button) })
    await flushUi()
    assert.notEqual(v.path(), "/account", `${i}번째 단추(${button.getAttribute("aria-label") ?? button.textContent})가 /account로 감`)
    cleanup()
  }
})

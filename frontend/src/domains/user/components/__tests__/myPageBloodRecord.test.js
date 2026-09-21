import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

/**
 * F-30 AC-01 · AC-03 — **실제 마이페이지 화면**으로 두 조건을 닫는다.
 *
 * 훅 단위 시험(useMyProfile.test.js)과 저장소 단위 시험(departureResultRefresh.test.js)은
 * 각각 "훅이 두 행을 만든다"와 "실패가 캐시를 지우지 않는다"까지만 증명한다 — 그 값이
 * MyPageLayout → MyPageSummaryPanel → BloodRecordFrame으로 실제로 전달되는지, 실패
 * 상태가 실제로 안내와 재시도 버튼으로 소비되는지는 **그 화면을 마운트해야만** 알 수 있다
 * (전달 한 줄이 빠져도 훅 시험은 그대로 통과한다).
 *
 * 그래서 대역은 HTTP 경계(api.client)와 Vite 전용 env 하나뿐이다. 라우팅·프레이머·store·
 * 훅·배너·기록 프레임은 전부 실제 코드가 돈다. f18Lobby.test.js와 같은 관례다.
 */
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
// jsdom에는 없는 관찰자들 — 마이페이지 하위 패널이 쓰므로 콜백 없는 최소 스텁만 채운다.
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})

let getImpl = async () => { throw new Error("api.get stub not set") }

mock.module("../../../../shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: async () => { throw new Error("api.post is not used in this test") },
      put: async () => { throw new Error("api.put is not used in this test") },
      patch: async () => { throw new Error("api.patch is not used in this test") },
      delete: async () => { throw new Error("api.delete is not used in this test") },
    },
    apiClient: async () => { throw new Error("apiClient is not used in this test") },
    refreshAccessToken: async () => { throw new Error("refreshAccessToken is not used in this test") },
  },
})

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")

const { default: MyPageLayout } = await import("../MyPageLayout.jsx")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
const { useUserProfileStore } = await import("../../store/user.store.js")
const { useProfileCustomizationStore } = await import("../../store/profileCustomization.store.js")

const USER_UUID = "user-1"

/**
 * 서버 GET /user/me/profile 응답 모양. total_games·account_win_rate는 F-30 AC-02의 같은
 * 모집단에서 나온 두 필드이고, account_win_rate는 반올림하지 않은 원시 비율(0~1)이다.
 */
const profileResponse = ({ totalGames, winRate }) => ({
  nickname: "가면술사",
  title: "무자비한 광대",
  profile_image_url: null,
  total_games: totalGames,
  account_win_rate: winRate,
  survival_count: 788,
  execution_count: 112,
  most_played_role: "광대",
  highest_win_rate_role: totalGames > 0 ? "마녀사냥꾼" : null,
})

/** 프로필 응답만 시험이 통제하고, 배너 장비 조회는 항상 기본값으로 응답한다. */
function installApi(profileHandler) {
  getImpl = async (endpoint) => {
    if (endpoint === "/user/me/profile") return profileHandler()
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    if (endpoint.endsWith("/entitlements")) {
      return { entitlements: [], loadout: { selectedProfilePhotoId: null, selectedProfileBorderId: null, revision: "rev-1" } }
    }
    return {}
  }
}

function resetAll() {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: USER_UUID }, loggedOutIntentionally: false })
  useEconomyStore.getState().reset()
  useUserProfileStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
}

async function mountMyPage() {
  let view
  await act(async () => {
    view = render(React.createElement(
      MemoryRouter,
      { initialEntries: ["/mypage"] },
      React.createElement(MyPageLayout, null),
    ))
  })
  return view
}

test.afterEach(() => cleanup())

/**
 * 실제로 그려진 피의 기록 행을 순서대로 읽는다. BloodRecordStatsPanel 루트(justify-evenly)
 * 안의 span만 보므로, 배너 닉네임이나 운명의 가면 문구가 섞이지 않는다.
 */
function bloodRecordRows(view) {
  const panels = view.container.querySelectorAll('div[class*="justify-evenly"]')
  assert.equal(panels.length, 1, "피의 기록 기록 영역이 하나가 아니다(선택자 가정이 깨졌다)")
  return [...panels[0].querySelectorAll("span")].map((node) => node.textContent.trim())
}

test("F-30 AC-01: 실제 MyPageLayout을 마운트하면 서버 응답의 전체 판수·승률이 피의 기록 두 행으로만 그려진다(생존·처형 행 없음)", async () => {
  resetAll()
  installApi(() => profileResponse({ totalGames: 1245, winRate: 2 / 3 }))

  const view = await mountMyPage()

  // 훅이 만든 stats가 MyPageSummaryPanel → BloodRecordFrame까지 실제로 전달됐다는 증거는
  // 이 DOM뿐이다 — 전달 한 줄을 빼면 여기서 행이 0개가 된다.
  await waitFor(() => assert.deepEqual(
    bloodRecordRows(view),
    ["전체 판수", "1,245", "승률", "66.7%"],
    "피의 기록이 전체 판수·승률 두 행이 아니다",
  ))

  // 제거 대상인 두 행은 이름도 값도 남아 있지 않다.
  for (const removed of ["생존 횟수", "단두대 처형", "788", "112"]) {
    assert.equal(view.container.textContent.includes(removed), false, `제거 대상(${removed})이 마이페이지에 남아 있다`)
  }

  // 승률은 특정 직업 최고 승률(가면 직업)이 아니라 계정 전체 값이다 — 가면은 별도로 그려진다.
  assert.ok(view.container.textContent.includes("마녀사냥꾼"), "운명의 가면 표시가 사라졌다")

  // 정상 조회에는 실패 안내도 재시도 버튼도 없다.
  assert.equal(view.queryByRole("status"), null)
  assert.equal(view.queryByRole("button", { name: "전적 다시 불러오기" }), null)
})

test("F-30 AC-03: 0판 계정은 실제 화면에서 전체 판수 0 · 승률 0.0%로 그려진다(더미 기록으로 대체되지 않는다)", async () => {
  resetAll()
  installApi(() => profileResponse({ totalGames: 0, winRate: 0 }))

  const view = await mountMyPage()

  await waitFor(() => assert.deepEqual(
    bloodRecordRows(view),
    ["전체 판수", "0", "승률", "0.0%"],
    "0판 계정의 승률이 0.0%로 그려지지 않는다",
  ))

  // 예전 더미 기본값(1,245 · 788 · 112)이 0판 화면을 채우지 않는다.
  for (const dummy of ["1,245", "788", "112"]) {
    assert.equal(view.container.textContent.includes(dummy), false, `더미 기록(${dummy})이 0판 화면에 남아 있다`)
  }

  // 0판은 **정상 조회 결과**이므로 실패 안내를 띄우지 않는다(아래 실패 시험과의 구분점).
  assert.equal(view.queryByRole("status"), null)
})

test("F-30 AC-03: 프로필 조회가 실패하면 0판으로 위장하지 않고 실패 안내와 재시도 버튼을 보여주며, 재시도가 성공하면 값이 복구된다", async () => {
  resetAll()
  let shouldFail = true
  installApi(() => {
    if (shouldFail) throw new Error("네트워크 실패")
    return profileResponse({ totalGames: 4, winRate: 0.5 })
  })

  const view = await mountMyPage()

  // 1) 실패가 "0판 0.0%"로 위장되지 않는다 — 보여줄 값 자체가 없어야 한다.
  await waitFor(() => assert.ok(view.queryByRole("status"), "실패 상태 안내가 화면에 없다"))
  assert.equal(view.container.textContent.includes("전체 판수"), false, "조회 실패인데 판수 행이 그려졌다")
  assert.equal(view.container.textContent.includes("0.0%"), false, "조회 실패가 승률 0.0%로 위장됐다")

  // 2) 실패 사실과 다시 읽는 경로가 실제 DOM에 있다(MyPageLayout이 error·retry를 소비한다).
  assert.ok(view.getByRole("status").textContent.includes("전적을 불러오지 못했습니다"))
  const retryButton = view.getByRole("button", { name: "전적 다시 불러오기" })

  // 3) 재시도가 성공하면 실패 안내가 사라지고 두 값이 복구된다.
  shouldFail = false
  await act(async () => { fireEvent.click(retryButton) })

  await waitFor(() => assert.deepEqual(
    bloodRecordRows(view),
    ["전체 판수", "4", "승률", "50.0%"],
    "재시도 성공 뒤에도 값이 복구되지 않았다",
  ))
  await waitFor(() => assert.equal(view.queryByRole("status"), null, "복구된 뒤에도 실패 안내가 남아 있다"))
})

test("F-30 AC-03: 캐시가 있는 상태에서 갱신이 실패하면 기존 두 값을 유지한 채 갱신 실패 상태만 덧붙인다(값을 0으로 떨어뜨리지 않는다)", async () => {
  resetAll()
  let shouldFail = false
  installApi(() => {
    if (shouldFail) throw new Error("네트워크 실패")
    return profileResponse({ totalGames: 3, winRate: 1 / 3 })
  })

  const view = await mountMyPage()
  await waitFor(() => assert.deepEqual(bloodRecordRows(view), ["전체 판수", "3", "승률", "33.3%"]))
  assert.equal(view.queryByRole("status"), null)

  // 창 재활성화로 값을 다시 확인하지만 그 조회가 실패한다(useMyProfile의 실제 focus 경로).
  shouldFail = true
  await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")) })

  // 쓸 수 있는 값은 그대로 남고, 두 숫자가 서로 다른 시점을 말하지도 않는다.
  await waitFor(() => assert.ok(view.queryByRole("status"), "갱신 실패 사실이 화면에 없다"))
  assert.deepEqual(bloodRecordRows(view), ["전체 판수", "3", "승률", "33.3%"])
  assert.ok(
    view.getByRole("status").textContent.includes("최신 전적을 불러오지 못했습니다"),
    "최초 실패와 갱신 실패를 같은 문장으로 말하고 있다",
  )
  assert.ok(view.getByRole("button", { name: "전적 다시 불러오기" }))
})

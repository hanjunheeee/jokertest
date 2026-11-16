// A11b 화면 시험 몫 도우미: 가짜 HTTP(답 쥐기·망 끊김), 메모리 라우터에 그리기, 마이크로 작업 흘리기, 저장소 훑기
// a11-account 폴더 시험만 씀 (공용 아님), 시험 파일이 domSetup.mjs를 먼저 부른 뒤 await import로 부름
import React from "react"
import { act, render } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { MotionGlobalConfig } from "framer-motion"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"
import { useUserProfileStore } from "../../src/domains/user/store/user.store.js"

// 창 움직임을 건너뜀 (안 끝나는 움직임이 메모리를 먹은 일이 있었음)
MotionGlobalConfig.skipAnimations = true

// jsdom에 없는 크기 감시 — 스크롤 칸이 씀, 아무것도 안 하는 대역
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  if (globalThis.window) globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

// 답을 쥐고 있다가 시험이 release로 줌 (보내는 중 화면을 보려고)
export const HOLD = Symbol("hold")
// 망 끊김 흉내 (fetch가 TypeError로 실패)
export const NETWORK_DOWN = Symbol("network-down")

// 가짜 HTTP: 보낸 요청(방법·주소·몸통)을 calls에, routes에서 "POST /auth/find-id" 같은 열쇠로 답을 찾음
// 답 모양: { status, body } / HOLD / NETWORK_DOWN / 함수(몸통, 몇 번째) → 그 셋 중 하나
// 열쇠는 주소의 물음표 앞까지로도 찾음, 정한 답이 없으면 200 {} (진짜 요청은 절대 안 나감)
export function installFetch(ownRoutes = {}) {
  // 배너 초상이 지갑·장착 요약을 받음 → 빈 지갑·장착 없음으로 늘 답함 (시험이 같은 열쇠를 주면 그쪽이 이김)
  const routes = { ...economyRoutes(), ...ownRoutes }
  const calls = []
  const held = []
  const fake = async (url, options = {}) => {
    const method = options.method ?? "GET"
    const path = String(url).replace(/^https?:\/\/[^/]+/, "")
    const body = typeof options.body === "string" ? JSON.parse(options.body) : null
    calls.push({ method, path, body })
    const bare = path.split("?")[0]
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${bare}`]
    const count = calls.filter((c) => c.method === method && c.path.split("?")[0] === bare).length
    const answer = typeof route === "function" ? route(body, count) : route
    const respond = (value) => {
      if (value === NETWORK_DOWN) throw new TypeError("Failed to fetch")
      const status = value?.status ?? 200
      return new Response(JSON.stringify(value?.body ?? {}), { status, headers: { "Content-Type": "application/json" } })
    }
    if (answer === HOLD) {
      return new Promise((resolve, reject) => {
        held.push({ method, bare, give: (value) => { try { resolve(respond(value)) } catch (e) { reject(e) } } })
      })
    }
    return respond(answer)
  }
  globalThis.fetch = fake
  if (globalThis.window) globalThis.window.fetch = fake
  const net = {
    calls,
    routes,
    // 그 방법·주소로 보낸 요청만 → [{ method, path, body }]
    to(method, bare) {
      return calls.filter((c) => c.method === method && c.path.split("?")[0] === bare)
    },
    // 쥐고 있던 답 하나를 줌 (그 주소로 가장 먼저 쥔 것부터), 없으면 false
    async release(method, bare, value) {
      const index = held.findIndex((h) => h.method === method && h.bare === bare)
      if (index < 0) return false
      const [item] = held.splice(index, 1)
      await act(async () => {
        item.give(value)
        await settle()
      })
      return true
    },
  }
  return net
}

// 마이크로 작업·0ms 예약을 몇 번 흘려 보냄 (답 넘기기·then 줄이 끝나게), 가짜 시계 켠 동안엔 부르지 않음
export async function settle(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// act 안에서 흘려 보냄 (그리기까지 끝나게)
export async function flushUi(times = 4) {
  await act(async () => { await settle(times) })
}

// 폼 보내기 흉내 사건 (훅의 handleSubmit에 넣음)
export function submitEvent() {
  return { preventDefault() {} }
}

// 메모리 라우터에 화면을 그림: routes는 [{ path, element }], 처음 주소 목록과 몇 번째에서 시작할지
// 돌려줌: render 결과 + router (주소 확인·뒤로 가기용)
export function renderRoutes(routes, { entries = ["/"], index = entries.length - 1 } = {}) {
  const router = createMemoryRouter(
    [...routes, { path: "*", element: React.createElement("p", null, "다른 화면") }],
    { initialEntries: entries, initialIndex: index },
  )
  const view = render(React.createElement(RouterProvider, { router }))
  return { ...view, router, path: () => router.state.location.pathname }
}

// 로그인한 사람으로 둠 (비번 계정 기본)
export function signIn(user = { uuid: "u-a11", nickname: "가면손님" }) {
  useAuthStore.getState().login(user)
}

// 시험끼리 안 섞이게 로그인·프로필 비움
export function resetStores() {
  useAuthStore.getState().logout()
  useAuthStore.setState({ loggedOutIntentionally: false })
  useUserProfileStore.getState().reset()
}

// 브라우저 저장소(localStorage·sessionStorage) 값 전부를 글 하나로 → 비밀값이 들어갔는지 찾을 때
export function storageDump() {
  const parts = []
  const stores = [globalThis.window?.localStorage, globalThis.window?.sessionStorage]
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      const own = globalThis[name]
      if (own && !stores.includes(own)) stores.push(own)
    } catch { /* 저장소 없음 */ }
  }
  for (const store of stores) {
    if (!store) continue
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      parts.push(`${key}=${store.getItem(key)}`)
    }
  }
  return parts.join("\n")
}

// 지갑·보유 아이템 요약 답 (signIn 기본 uuid 기준, 장착 없음)
export function economyRoutes(uuid = "u-a11") {
  return {
    [`GET /economy/accounts/${uuid}/wallet`]: { status: 200, body: { success: true, data: { balanceGold: 0, balanceDiamond: 0 } } },
    [`GET /economy/accounts/${uuid}/entitlements`]: {
      status: 200,
      body: {
        success: true,
        data: {
          entitlements: [],
          loadout: { selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: null, revision: "r1" },
        },
      },
    },
  }
}

// 서버가 보내는 프로필 값 (마이페이지·로비 배너), 필요한 칸만 바꿔 씀
export function profileBody(patch = {}) {
  return {
    status: 200,
    body: {
      success: true,
      data: {
        nickname: "가면손님",
        total_games: 12,
        account_win_rate: 0.5,
        highest_win_rate_role: "의사",
        ...patch,
      },
    },
  }
}

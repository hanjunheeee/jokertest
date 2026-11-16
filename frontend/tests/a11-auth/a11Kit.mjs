// A11 가입·로그인·세션 화면 시험 같이 쓰는 준비 파일 (가짜 서버·알림 창 모음·가짜 주소·화면 그리기)
// a11-auth 폴더 시험만 씀 — 목록 A11a-가입-로그인-세션.md 화면 번호 A11-F-001~280
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 → 아무것도 안 함
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = globalThis.ResizeObserver

// 창 움직임은 바로 끝냄 (안 끝나면 act 안에서 멈춤)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

export const React = await import("react")
export const rtl = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
export const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setUnauthorizedHandler } = await import("../../src/shared/api/response.js")
const { handleAuthUnauthorized } = await import("../../src/domains/auth/api/unauthorized.js")

export const h = React.createElement

// 앱 시작 때처럼 401 처리 함수를 끼움 (main.jsx와 같음)
setUnauthorizedHandler(handleAuthUnauthorized)

// 시험용 값 (가짜 주소·누가 봐도 시험용 비번)
export const EMAIL = "tester@example.com"
export const PW = "testpass1"
export const NICK = "시험사람"
export const BIRTH = "2000-01-01"

// 서버가 주는 모양의 약관 목록 (둘 다 필수)
export const TERMS = Object.freeze([
  { id: 1, kind: "TERMS", version: "1.0", title: "이용약관", body: "이용약관 본문 시험 글", url: null, effectiveAt: "2026-11-01T00:00:00.000Z", required: true },
  { id: 2, kind: "PRIVACY", version: "1.0", title: "개인정보 처리방침", body: "개인정보 본문 시험 글", url: null, effectiveAt: "2026-11-01T00:00:00.000Z", required: true },
])

// ── 알림 창(alert)·확인 창(confirm) 모음 ──
export const alerts = []
const pushAlert = (message) => { alerts.push(String(message)) }
globalThis.alert = pushAlert
window.alert = pushAlert

export const confirms = []
let confirmAnswer = true
// 확인 창에 누를 답 (참 = 확인, 거짓 = 취소)
export function answerConfirm(value) { confirmAnswer = value }
window.confirm = (message) => { confirms.push(String(message)); return confirmAnswer }

// ── 가짜 서버 (fetch를 막고 정한 답만 돌려줌, 진짜 요청은 안 나감) ──
// 통신 끊김 표시
export const NETWORK = Symbol("network")
export const requests = []
let routes = {}

// 나중에 답 주기 (답 오기 전 화면을 보려고)
export function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

// 길마다 답 정하기: { "POST /auth/login": { status, body } | (req, n) => 답 | NETWORK | Promise }
export function serve(table) { routes = { ...table } }
export function addRoutes(table) { routes = { ...routes, ...table } }

// 그 길로 보낸 요청만 → [{ method, path, query, body }]
export function sent(method, path) {
  return requests.filter((r) => r.method === method && r.path === path)
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), "http://localhost")
  const method = (init.method || "GET").toUpperCase()
  const req = { method, path: url.pathname, query: url.searchParams, body: init.body ? JSON.parse(init.body) : undefined }
  requests.push(req)
  const key = `${method} ${url.pathname}`
  let answer = routes[key]
  if (typeof answer === "function") answer = answer(req, sent(method, url.pathname).length)
  answer = await answer
  if (answer === NETWORK) throw new TypeError("Failed to fetch")
  if (answer === undefined) answer = { status: 404, body: { success: false, message: "없는 길 (시험)" } }
  return new Response(JSON.stringify(answer.body ?? {}), {
    status: answer.status ?? 200,
    headers: { "Content-Type": "application/json" },
  })
}
window.fetch = globalThis.fetch

// ── 가짜 주소 (jsdom은 페이지 이동을 못 해서, 주소 읽기·바꾸기를 따로 받아 둠) ──
let realWindow = null
export function fakeLocation(path = "/") {
  if (!realWindow) realWindow = globalThis.window
  const url = new URL(path, "http://localhost")
  const location = {
    pathname: url.pathname,
    search: url.search,
    origin: url.origin,
    replaced: [],
    assigned: [],
    replace(next) { location.replaced.push(String(next)) },
    assign(next) { location.assigned.push(String(next)) },
  }
  // href에 넣은 주소 = 페이지째 이동한 곳
  Object.defineProperty(location, "href", {
    get: () => url.href,
    set: (next) => { location.assigned.push(String(next)) },
  })
  const target = realWindow
  globalThis.window = new Proxy(target, {
    get(t, prop) {
      if (prop === "location") return location
      const value = Reflect.get(t, prop, t)
      return typeof value === "function" && !/^[A-Z]/.test(String(prop)) ? value.bind(t) : value
    },
    set(t, prop, value) { return Reflect.set(t, prop, value, t) },
  })
  return location
}
function restoreLocation() {
  if (realWindow) globalThis.window = realWindow
  realWindow = null
}

// ── 시험마다 처음으로 ──
export function resetAll() {
  rtl.cleanup()
  restoreLocation()
  alerts.length = 0
  confirms.length = 0
  confirmAnswer = true
  requests.length = 0
  routes = {}
  try { window.localStorage.clear() } catch { /* 저장소 없으면 넘김 */ }
  try { window.sessionStorage.clear() } catch { /* 저장소 없으면 넘김 */ }
  useAuthStore.setState({ isLoggedIn: false, user: null, loggedOutIntentionally: false, sessionBootstrap: "idle" })
}

// 응답·그림이 다 끝나게 몇 번 비움
export async function settle(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)) })
  }
}

// 훅을 라우터 안에서 돌림 (주소가 바뀌어도 같은 훅이 남게 모든 주소에 같은 그림)
export function renderHookInRouter(useHook, { at = "/login" } = {}) {
  const result = { current: null }
  function Probe() {
    result.current = useHook()
    return null
  }
  const router = createMemoryRouter([{ path: "*", element: h(Probe) }], { initialEntries: [at] })
  const view = rtl.render(h(RouterProvider, { router }))
  return { result, router, ...view }
}

// 화면을 라우터 안에 그림: routes = [{ path, element }]
export function renderRoutes(routeList, { at = "/login" } = {}) {
  const router = createMemoryRouter(routeList, { initialEntries: [at] })
  const view = rtl.render(h(RouterProvider, { router }))
  return { router, ...view }
}

// 입력 칸 값 바꾸기 (훅의 handleInputChange 꼴)
export const changeEvent = (name, value) => ({ target: { name, value } })

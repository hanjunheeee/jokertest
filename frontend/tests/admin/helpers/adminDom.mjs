// 관리자 화면 시험 준비 파일, jsdom 전역·jsx 읽기·화면 폭 흉내·가짜 서버 응답
// tests/admin/** 시험이 맨 위에서 부름 (시험 파일마다 따로 돌아서 전역 섞임 없음)
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

const installGlobal = (name, value) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

for (const name of ["window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MutationObserver"]) {
  installGlobal(name, name === "window" ? dom.window : dom.window[name])
}
installGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

// 화면 폭 흉내: matchMedia('(min-width: 768px)')가 지금 폭으로 답함, 폭 바꾸면 change 알림
let screenWidth = 1280
const mediaListeners = new Set()

const matchMedia = (query) => {
  const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
  return {
    get matches() { return screenWidth >= min },
    media: query,
    addEventListener: (_type, fn) => mediaListeners.add(fn),
    removeEventListener: (_type, fn) => mediaListeners.delete(fn),
  }
}
dom.window.matchMedia = matchMedia

export const setScreenWidth = (width) => {
  screenWidth = width
  for (const fn of [...mediaListeners]) fn()
}

// 가짜 서버: 부른 요청을 calls에 쌓고, 주소마다 정한 응답을 줌
export const createFakeServer = () => {
  const calls = []
  const answers = new Map()
  const fetchFake = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", headers: options.headers ?? {}, body: options.body })
    const key = `${options.method ?? "GET"} ${url}`
    const answer = answers.get(key)
    if (!answer) return new Response(JSON.stringify({ ok: false, code: "NO_ANSWER", message: key }), { status: 599 })
    const next = typeof answer === "function" ? answer() : answer
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } })
  }
  installGlobal("fetch", fetchFake)
  return {
    calls,
    answer: (key, status, body) => answers.set(key, { status, body }),
    answerWith: (key, fn) => answers.set(key, fn),
  }
}

export const ME_OK = {
  ok: true,
  admin: { id: 1, loginId: "ceo", email: "ceo@example.com" },
  csrfToken: "csrf-abc",
  idleExpiresAt: "2026-11-10T03:30:00.000Z",
}

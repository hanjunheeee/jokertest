// 계정 폼 버그 수정 확인: known 1-4(지금 비밀번호 틀리면 로그아웃·"변경됨"), FE-041(연타 두 번 보냄),
// 3장 useNicknameForm(닉네임만 바꿔도 계정 세대 올라감)
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:5183/account" })
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const fetchCalls = []
let fetchResponder = async () => new Response(JSON.stringify({ success: true }), { status: 200 })
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options })
  return fetchResponder(url, options)
}

const { act, createElement } = await import("react")
const { createRoot } = await import("react-dom/client")
const { setUnauthorizedHandler } = await import("../../../../src/shared/api/response.js")
const { usePasswordForm } = await import("../../../../src/domains/user/hooks/usePasswordForm.js")
const { useNicknameForm } = await import("../../../../src/domains/user/hooks/useNicknameForm.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")

let handlerCalls = 0
setUnauthorizedHandler(async () => { handlerCalls += 1; useAuthStore.getState().logout(); return undefined })

function captureHook(useHook) {
  const box = { current: null }
  function Probe() { box.current = useHook(); return null }
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  return { box, unmount: () => act(() => root.unmount()) }
}

const submitEvent = () => ({ preventDefault() {} })

test.beforeEach(() => {
  fetchCalls.length = 0
  handlerCalls = 0
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "u1", nickname: "옛이름" }, loggedOutIntentionally: false, identityGeneration: 5 })
})

test("1-4: 지금 비밀번호가 틀려 401이 와도 로그아웃 안 하고 틀렸다는 문구를 보임", async () => {
  fetchResponder = async () => new Response(
    JSON.stringify({ success: false, message: "현재 비밀번호가 올바르지 않습니다." }),
    { status: 401 },
  )
  const { box, unmount } = captureHook(usePasswordForm)
  act(() => { box.current.handlePwChange({ target: { name: "currentPassword", value: "wrong" } }) })
  act(() => { box.current.handlePwChange({ target: { name: "newPassword", value: "NewPass123!" } }) })
  await act(async () => { await box.current.handlePasswordSubmit(submitEvent()) })

  assert.deepEqual(box.current.pwMsg, { type: "error", text: "현재 비밀번호가 올바르지 않습니다." })
  assert.equal(handlerCalls, 0, "공통 401 처리(로그아웃)로 안 넘김")
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  unmount()
})

test("FE-041: 비밀번호 변경을 같은 순간 두 번 눌러도 요청은 한 번", async () => {
  let release
  fetchResponder = () => new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify({ success: true }), { status: 200 })) })
  const { box, unmount } = captureHook(usePasswordForm)
  act(() => { box.current.handlePwChange({ target: { name: "currentPassword", value: "old" } }) })
  act(() => { box.current.handlePwChange({ target: { name: "newPassword", value: "NewPass123!" } }) })
  let first
  act(() => { first = box.current.handlePasswordSubmit(submitEvent()) })
  act(() => { box.current.handlePasswordSubmit(submitEvent()) })
  assert.equal(fetchCalls.length, 1)
  await act(async () => { release(); await first })
  assert.equal(box.current.pwMsg.type, "success")
  unmount()
})

test("3장 useNicknameForm: 닉네임만 바꾸면 계정 세대는 그대로, 연타는 한 번만 보냄", async () => {
  let release
  fetchResponder = () => new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify({ success: true }), { status: 200 })) })
  const { box, unmount } = captureHook(useNicknameForm)
  act(() => { box.current.setNickname("새이름") })
  let first
  act(() => { first = box.current.handleNicknameSubmit(submitEvent()) })
  act(() => { box.current.handleNicknameSubmit(submitEvent()) })
  assert.equal(fetchCalls.length, 1)
  await act(async () => { release(); await first })
  assert.equal(useAuthStore.getState().user.nickname, "새이름")
  assert.equal(useAuthStore.getState().identityGeneration, 5, "세대 안 올림")
  unmount()
})

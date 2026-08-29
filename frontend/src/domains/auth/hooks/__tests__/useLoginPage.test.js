import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MutationObserver: dom.window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const loginRequests = []
const loggedInUsers = []
const navigations = []

mock.module("../../api/auth.api.js", {
  namedExports: {
    getMeApi: async () => ({ user: null }),
    signupApi: async () => ({}),
    loginApi: async (payload) => {
      loginRequests.push(payload)
      return { user: { uuid: "u-1", nickname: "tester" } }
    },
  },
})

const authState = {
  user: null,
  isLoggedIn: false,
  login: (user) => loggedInUsers.push(user),
  clearLoggedOutIntentionally: () => {},
}
function useAuthStore(selector) {
  return selector(authState)
}
useAuthStore.getState = () => authState

mock.module("../../store/auth.store.js", {
  namedExports: {
    selectIsAuthenticated: (state) => state.isLoggedIn,
    useAuthStore,
  },
})

mock.module("react-router-dom", {
  namedExports: {
    useNavigate: () => (path, options) => navigations.push({ path, options }),
  },
})

const { act, renderHook } = await import("@testing-library/react")
const { useLoginPage } = await import("../useLoginPage.js")

test("로그인 상태 유지 선택을 로그인 요청 payload에 포함한다", async () => {
  loginRequests.length = 0
  loggedInUsers.length = 0
  navigations.length = 0
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.handleInputChange({ target: { name: "email", value: "qa@example.com" } })
    hook.result.current.handleInputChange({ target: { name: "password", value: "secret" } })
    hook.result.current.setRememberMe(true)
  })
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(loginRequests.length, 1)
  assert.deepEqual(loginRequests[0], {
    email: "qa@example.com",
    password: "secret",
    nickname: "",
    rememberMe: true,
  })
  assert.equal(loggedInUsers.length, 1)
  assert.equal(navigations.at(-1).path, "/lobby")
  hook.unmount()
})

test("기본 로그인은 rememberMe:false를 명시한다", async () => {
  loginRequests.length = 0
  const hook = renderHook(() => useLoginPage())
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })
  assert.equal(loginRequests[0].rememberMe, false)
  hook.unmount()
})

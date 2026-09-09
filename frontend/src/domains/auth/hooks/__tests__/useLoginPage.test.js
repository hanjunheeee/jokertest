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

let alertMessages = []
globalThis.alert = (message) => alertMessages.push(message)

const loginRequests = []
const signupRequests = []
const checkEmailRequests = []
const loggedInUsers = []
const navigations = []

// checkEmailApi 응답은 테스트마다 바꿔 끼울 수 있게 함수 참조로 둡니다(기본은 항상 사용 가능).
let checkEmailImpl = async () => ({ available: true })

mock.module("../../api/auth.api.js", {
  namedExports: {
    getMeApi: async () => ({ user: null }),
    signupApi: async (payload) => {
      signupRequests.push(payload)
      return {}
    },
    loginApi: async (payload) => {
      loginRequests.push(payload)
      return { user: { uuid: "u-1", nickname: "tester" } }
    },
    checkEmailApi: async (email) => {
      checkEmailRequests.push(email)
      return await checkEmailImpl(email)
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
const { useLoginPage, useEmailAvailabilityCheck } = await import("../useLoginPage.js")

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
    passwordConfirm: "",
    nickname: "",
    birthDate: "",
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

const fillSignupFields = (hook, overrides = {}) => {
  const fields = {
    email: "qa@example.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
    ...overrides,
  }
  for (const [name, value] of Object.entries(fields)) {
    hook.result.current.handleInputChange({ target: { name, value } })
  }
}

test("닉네임이 2자 미만이면 회원가입 요청을 보내지 않고 오류를 알린다", async () => {
  signupRequests.length = 0
  alertMessages.length = 0
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook, { nickname: "가" })
  })
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(signupRequests.length, 0, "프론트 검증에 걸리면 서버로 요청을 보내지 않아야 한다")
  assert.equal(alertMessages.length, 1)
  assert.equal(hook.result.current.isSignupMode, true, "검증 실패 시 회원가입 모드를 유지해야 한다")
  hook.unmount()
})

test("비밀번호와 비밀번호 확인이 다르면 회원가입 요청을 보내지 않는다", async () => {
  signupRequests.length = 0
  alertMessages.length = 0
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook, { passwordConfirm: "다른비밀번호12" })
  })
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(signupRequests.length, 0)
  assert.equal(alertMessages.length, 1)
  hook.unmount()
})

test("생년월일이 미래 날짜면 회원가입 요청을 보내지 않는다", async () => {
  signupRequests.length = 0
  alertMessages.length = 0
  const hook = renderHook(() => useLoginPage())

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const futureDate = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()))
  const futureIso = futureDate.toISOString().slice(0, 10)

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook, { birthDate: futureIso })
  })
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(signupRequests.length, 0)
  assert.equal(alertMessages.length, 1)
  hook.unmount()
})

test("유효한 회원가입 입력은 signupApi를 호출하고 로그인 모드로 돌아간다", async () => {
  signupRequests.length = 0
  alertMessages.length = 0
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook)
  })
  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(signupRequests.length, 1)
  assert.deepEqual(signupRequests[0], {
    email: "qa@example.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
  })
  assert.equal(alertMessages.length, 1, "가입 완료 안내가 한 번 떠야 한다")
  assert.equal(hook.result.current.isSignupMode, false, "가입 성공 후 로그인 모드로 돌아가야 한다")
  hook.unmount()
})

// ── AC-05: 입력 단계 이메일 중복 확인, 확인 후 이메일 변경 시 무효화 ────────────────

test("AC-05: 사용 가능한 이메일을 확인하면 available 상태가 된다", async () => {
  checkEmailRequests.length = 0
  checkEmailImpl = async () => ({ available: true })

  let email = "fresh@example.com"
  const hook = renderHook(() => useEmailAvailabilityCheck(email))

  assert.equal(hook.result.current.status, "idle")
  await act(async () => {
    await hook.result.current.check()
  })

  assert.equal(hook.result.current.status, "available")
  assert.deepEqual(checkEmailRequests, ["fresh@example.com"])
  hook.unmount()
})

test("AC-05: 이미 사용 중인 이메일을 확인하면 duplicate 상태가 된다", async () => {
  checkEmailRequests.length = 0
  checkEmailImpl = async () => ({ available: false })

  const hook = renderHook(() => useEmailAvailabilityCheck("taken@example.com"))
  await act(async () => {
    await hook.result.current.check()
  })

  assert.equal(hook.result.current.status, "duplicate")
  hook.unmount()
})

test("AC-05: 확인 이후 이메일을 바꾸면 이전 확인 결과가 무효화된다", async () => {
  checkEmailRequests.length = 0
  checkEmailImpl = async () => ({ available: true })

  let email = "checked@example.com"
  const hook = renderHook(({ email: e }) => useEmailAvailabilityCheck(e), { initialProps: { email } })

  await act(async () => {
    await hook.result.current.check()
  })
  assert.equal(hook.result.current.status, "available")

  // 이메일을 바꿔 다시 렌더한다 — checkEmailApi를 다시 호출하지 않아도 이전 결과는 사라져야 한다.
  hook.rerender({ email: "changed@example.com" })
  assert.equal(hook.result.current.status, "idle", "이메일이 바뀌면 이전 확인 결과가 무효화되어야 한다")
  assert.equal(checkEmailRequests.length, 1, "재확인을 누르기 전에는 새로 조회하지 않아야 한다")

  hook.unmount()
})

test("AC-05: 확인 요청이 실패하면 error 상태가 된다", async () => {
  checkEmailRequests.length = 0
  checkEmailImpl = async () => { throw new Error("네트워크 오류") }

  const hook = renderHook(() => useEmailAvailabilityCheck("fail@example.com"))
  await act(async () => {
    await hook.result.current.check()
  })

  assert.equal(hook.result.current.status, "error")
  hook.unmount()
})

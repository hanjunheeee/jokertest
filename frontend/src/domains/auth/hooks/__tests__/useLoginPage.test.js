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
const signupCodeRequests = []
const signupCodeVerifications = []
const loggedInUsers = []
const navigations = []

let checkEmailImpl = async () => ({ available: true })
let signupApiImpl = async () => ({ success: true, message: "회원가입이 완료되었습니다." })
let requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
let verifySignupCodeImpl = async () => ({ ok: true, signupProof: "proof-token-1" })

const apiError = (message, extra = {}) => Object.assign(new Error(message), extra)

mock.module("../../api/auth.api.js", {
  namedExports: {
    getMeApi: async () => ({ user: null }),
    signupApi: async (payload) => {
      signupRequests.push(payload)
      return await signupApiImpl(payload)
    },
    loginApi: async (payload) => {
      loginRequests.push(payload)
      return { user: { uuid: "u-1", nickname: "tester" } }
    },
    checkEmailApi: async (email) => {
      checkEmailRequests.push(email)
      return await checkEmailImpl(email)
    },
    requestSignupCodeApi: async (payload) => {
      signupCodeRequests.push(payload)
      return await requestSignupCodeImpl(payload)
    },
    verifySignupCodeApi: async (payload) => {
      signupCodeVerifications.push(payload)
      return await verifySignupCodeImpl(payload)
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

const completeSignupEmailVerification = async (hook, { code = "123456" } = {}) => {
  await act(async () => {
    await hook.result.current.handleRequestSignupCode()
  })
  act(() => {
    hook.result.current.handleSignupCodeChange({ target: { value: code } })
  })
  await act(async () => {
    await hook.result.current.handleVerifySignupCode()
  })
}

test("유효한 회원가입 입력은 이메일 인증 완료 후 signupApi를 호출하고 로그인 모드로 돌아간다", async () => {
  signupRequests.length = 0
  signupCodeRequests.length = 0
  signupCodeVerifications.length = 0
  alertMessages.length = 0
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => ({ ok: true, signupProof: "proof-token-1" })
  signupApiImpl = async () => ({ success: true, message: "회원가입이 완료되었습니다." })
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook)
  })
  assert.equal(hook.result.current.canSubmitSignup, false, "인증 전에는 제출할 수 없어야 한다")

  await completeSignupEmailVerification(hook)
  assert.equal(hook.result.current.signupEmailVerification.stage, "verified")
  assert.equal(hook.result.current.canSubmitSignup, true, "인증 완료 후에는 제출할 수 있어야 한다")

  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })

  assert.equal(signupCodeRequests.length, 1)
  assert.deepEqual(signupCodeRequests[0], { email: "qa@example.com" })
  assert.equal(signupCodeVerifications.length, 1)
  assert.deepEqual(signupCodeVerifications[0], { email: "qa@example.com", code: "123456" })

  assert.equal(signupRequests.length, 1)
  assert.deepEqual(signupRequests[0], {
    email: "qa@example.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
    signupProof: "proof-token-1",
  })
  assert.equal(alertMessages.length, 1, "가입 완료 안내가 한 번 떠야 한다")
  assert.equal(hook.result.current.isSignupMode, false, "가입 성공 후 로그인 모드로 돌아가야 한다")
  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified", "가입 성공 후 인증 상태는 폐기되어야 한다(AC-05)")
  hook.unmount()
})

test("AC-02: 같은 틱에 제출을 두 번 호출해도 가입 API 호출은 정확히 1회다", async () => {
  signupRequests.length = 0
  signupCodeRequests.length = 0
  signupCodeVerifications.length = 0
  alertMessages.length = 0
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => ({ ok: true, signupProof: "proof-race-1" })
  signupApiImpl = async () => ({ success: true, message: "회원가입이 완료되었습니다." })
  const hook = renderHook(() => useLoginPage())

  act(() => {
    hook.result.current.setIsSignupMode(true)
    fillSignupFields(hook)
  })
  await completeSignupEmailVerification(hook)
  assert.equal(hook.result.current.canSubmitSignup, true)

  await act(async () => {
    await Promise.all([
      hook.result.current.handleSubmit({ preventDefault() {} }),
      hook.result.current.handleSubmit({ preventDefault() {} }),
    ])
  })

  assert.equal(signupRequests.length, 1, "동시 제출이어도 가입 API는 한 번만 호출되어야 한다")
  hook.unmount()
})

test("AC-01: 이메일 인증을 완료하지 않으면 강제로 handleSubmit을 호출해도 signupApi를 부르지 않는다", async () => {
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

  assert.equal(signupRequests.length, 0, "인증 전 제출은 API를 호출하면 안 된다")
  assert.equal(hook.result.current.isSignupMode, true)
  hook.unmount()
})

test("AC-03: 재발송 대기 중에는 재발송 API를 다시 부르지 않는다", async () => {
  signupCodeRequests.length = 0
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  assert.equal(hook.result.current.signupEmailVerification.stage, "codeSent")
  assert.equal(hook.result.current.signupEmailVerification.resendRemainingSec, 60)

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  assert.equal(signupCodeRequests.length, 1, "재발송 대기 중 클릭은 추가 호출을 만들면 안 된다")
  hook.unmount()
})

test("AC-03: RESEND_TOO_SOON 응답은 남은 초를 그대로 상태에 반영한다", async () => {
  signupCodeRequests.length = 0
  requestSignupCodeImpl = async () => { throw apiError("잠시 후 다시 시도해주세요.", { code: "RESEND_TOO_SOON", resendAfterSec: 45, status: 429 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "codeSent")
  assert.equal(hook.result.current.signupEmailVerification.resendRemainingSec, 45)
  assert.match(hook.result.current.signupEmailVerification.message, /45초/)
  hook.unmount()
})

test("AC-03: 오입력하면 서버가 준 남은 시도 횟수를 그대로 보여주고 번호 입력을 유지한다", async () => {
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => { throw apiError("인증번호가 올바르지 않습니다.", { code: "CODE_INVALID", attemptsRemaining: 4, status: 400 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  act(() => { hook.result.current.handleSignupCodeChange({ target: { value: "000000" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "codeSent", "오입력은 codeSent를 유지해 재시도할 수 있어야 한다")
  assert.equal(hook.result.current.signupEmailVerification.attemptsRemaining, 4)
  assert.equal(hook.result.current.signupEmailVerification.code, "000000", "확인 실패 후에도 입력한 번호를 지우면 안 된다")
  hook.unmount()
})

test("AC-03: 인증번호가 만료되면 codeExpired로 전이하고 확인을 다시 부르지 않는다", async () => {
  const verifyCallsBefore = signupCodeVerifications.length
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => { throw apiError("만료되었습니다.", { code: "CODE_EXPIRED", status: 400 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  act(() => { hook.result.current.handleSignupCodeChange({ target: { value: "123456" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "codeExpired")

  await act(async () => { await hook.result.current.handleVerifySignupCode() })
  assert.equal(signupCodeVerifications.length, verifyCallsBefore + 1, "codeExpired 상태에서 확인은 호출되면 안 된다")
  hook.unmount()
})

test("AC-03: 오입력 횟수를 초과하면 locked로 전이하고 확인을 막는다", async () => {
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => { throw apiError("시도 초과", { code: "TOO_MANY_ATTEMPTS", status: 429 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  act(() => { hook.result.current.handleSignupCodeChange({ target: { value: "123456" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "locked")
  hook.unmount()
})

test("AC-03: 일반 요청 제한(RATE_LIMITED)은 이전 상태를 유지한 채 안내만 보여준다", async () => {
  requestSignupCodeImpl = async () => { throw apiError("요청이 많습니다.", { code: "RATE_LIMITED", status: 429 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified")
  assert.match(hook.result.current.signupEmailVerification.message, /요청이 너무 많습니다/)
  hook.unmount()
})

test("AC-03: 네트워크/미확인 실패는 재시도 안내를 보여주고 이전 상태를 되돌린다", async () => {
  requestSignupCodeImpl = async () => { throw new Error("network down") }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified")
  assert.match(hook.result.current.signupEmailVerification.message, /통신할 수 없습니다/)
  hook.unmount()
})

test("AC-03: 발송이 5xx와 함께 익숙한 code를 실어 보내도 확정 사유로 단정하지 않고 통신 실패로 처리한다", async () => {
  requestSignupCodeImpl = async () => { throw apiError("서버 오류", { code: "RATE_LIMITED", status: 500 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified")
  assert.match(
    hook.result.current.signupEmailVerification.message,
    /통신할 수 없습니다/,
    "status가 code와 맞지 않으면(429 아닌 5xx) RATE_LIMITED 문구가 아니라 통신 실패 안내를 보여야 한다",
  )
  hook.unmount()
})

test("AC-03: 확인이 5xx와 함께 익숙한 code를 실어 보내도 확정 사유로 단정하지 않고 통신 실패로 처리하며 입력을 유지한다", async () => {
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => { throw apiError("서버 오류", { code: "CODE_INVALID", attemptsRemaining: 2, status: 500 }) }
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  act(() => { hook.result.current.handleSignupCodeChange({ target: { value: "000000" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })

  assert.equal(hook.result.current.signupEmailVerification.stage, "codeSent")
  assert.equal(
    hook.result.current.signupEmailVerification.attemptsRemaining,
    null,
    "status가 code와 맞지 않으면 서버가 준 attemptsRemaining을 확정 값으로 쓰면 안 된다",
  )
  assert.match(
    hook.result.current.signupEmailVerification.message,
    /통신할 수 없습니다/,
    "status가 code와 맞지 않으면(400 아닌 5xx) CODE_INVALID 문구가 아니라 통신 실패 안내를 보여야 한다",
  )
  assert.equal(hook.result.current.signupEmailVerification.code, "000000", "확인 실패 후에도 입력한 번호를 지우면 안 된다")
  hook.unmount()
})

test("AC-04: 인증 완료 후 이메일을 바꾸면 인증 상태가 초기화되고 재제출이 막힌다", async () => {
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => ({ ok: true, signupProof: "proof-token-2" })
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await completeSignupEmailVerification(hook)
  assert.equal(hook.result.current.canSubmitSignup, true)

  act(() => {
    hook.result.current.handleInputChange({ target: { name: "email", value: "changed@example.com" } })
  })

  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified")
  assert.equal(hook.result.current.canSubmitSignup, false)
  hook.unmount()
})

test("AC-04: 같은 배치 안에서 이메일을 A→B→A로 바꿔도 기존 인증이 폐기되고 가입 제출이 막힌다", async () => {
  signupRequests.length = 0
  alertMessages.length = 0
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => ({ ok: true, signupProof: "proof-token-aba" })
  signupApiImpl = async () => ({ success: true, message: "회원가입이 완료되었습니다." })
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await completeSignupEmailVerification(hook)
  assert.equal(hook.result.current.canSubmitSignup, true)
  const originalEmail = hook.result.current.formData.email

  act(() => {
    hook.result.current.handleInputChange({ target: { name: "email", value: "other@example.com" } })
    hook.result.current.handleInputChange({ target: { name: "email", value: originalEmail } })
  })

  assert.equal(hook.result.current.formData.email, originalEmail)
  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified", "A→B→A 뒤에도 기존 인증은 폐기돼 있어야 한다")
  assert.equal(hook.result.current.canSubmitSignup, false)

  await act(async () => {
    await hook.result.current.handleSubmit({ preventDefault() {} })
  })
  assert.equal(signupRequests.length, 0, "폐기된 인증으로는 가입 API를 부르면 안 된다")
  hook.unmount()
})

test("AC-04: 발송 중에 이메일을 바꾸면 늦게 도착한 발송 응답이 인증 상태를 되살리지 않는다", async () => {
  let resolveRequest
  requestSignupCodeImpl = () => new Promise((resolve) => { resolveRequest = resolve })
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  let sendPromise
  act(() => {
    sendPromise = hook.result.current.handleRequestSignupCode()
  })
  assert.equal(hook.result.current.signupEmailVerification.stage, "sending")

  act(() => {
    hook.result.current.handleInputChange({ target: { name: "email", value: "another@example.com" } })
  })
  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified")

  await act(async () => {
    resolveRequest({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
    await sendPromise
  })

  assert.equal(hook.result.current.signupEmailVerification.stage, "unverified", "무효화된 세대의 응답은 상태를 되살리면 안 된다")
  hook.unmount()
})

test("AC-05: 인증 완료 후에도 formData·훅 반환값 어디에도 signupProof 원문이 그대로 노출되지 않는다", async () => {
  requestSignupCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifySignupCodeImpl = async () => ({ ok: true, signupProof: "super-secret-proof" })
  const hook = renderHook(() => useLoginPage())
  act(() => { hook.result.current.setIsSignupMode(true); fillSignupFields(hook) })

  await completeSignupEmailVerification(hook)

  assert.equal(JSON.stringify(hook.result.current.formData).includes("super-secret-proof"), false)
  assert.equal(JSON.stringify(hook.result.current.signupEmailVerification).includes("super-secret-proof"), false)
  hook.unmount()
})

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

test("AC-05: 이전 이메일의 뒤늦은 응답이 최신 확인 상태를 덮어쓰지 않는다", async () => {
  checkEmailRequests.length = 0
  let resolveFirst
  const firstPending = new Promise((resolve) => { resolveFirst = resolve })
  let callCount = 0
  checkEmailImpl = async () => {
    callCount += 1
    if (callCount === 1) {
      await firstPending
      return { available: false }
    }
    return { available: true }
  }

  const hook = renderHook(({ email: e }) => useEmailAvailabilityCheck(e), { initialProps: { email: "old@example.com" } })

  let firstCheck
  act(() => {
    firstCheck = hook.result.current.check()
  })

  hook.rerender({ email: "new@example.com" })
  await act(async () => {
    await hook.result.current.check()
  })
  assert.equal(hook.result.current.status, "available", "최신 요청의 응답이 먼저 상태를 정해야 한다")

  await act(async () => {
    resolveFirst()
    await firstCheck
  })
  assert.equal(hook.result.current.status, "available", "먼저 보낸 요청의 뒤늦은 응답이 최신 상태를 덮어쓰면 안 된다")
  hook.unmount()
})

test("AC-05: 같은 이메일로 두 번 연달아 확인해도 먼저 보낸 요청의 뒤늦은 응답이 최신 상태를 덮어쓰지 않는다", async () => {
  checkEmailRequests.length = 0
  let resolveFirst
  const firstPending = new Promise((resolve) => { resolveFirst = resolve })
  let callCount = 0
  checkEmailImpl = async () => {
    callCount += 1
    if (callCount === 1) {
      await firstPending
      return { available: false }
    }
    return { available: true }
  }

  const hook = renderHook(() => useEmailAvailabilityCheck("dup-click@example.com"))

  let firstCheck
  act(() => {
    firstCheck = hook.result.current.check()
  })

  await act(async () => {
    await hook.result.current.check()
  })
  assert.equal(hook.result.current.status, "available", "최신(둘째) 요청의 응답이 먼저 상태를 정해야 한다")

  await act(async () => {
    resolveFirst()
    await firstCheck
  })
  assert.equal(hook.result.current.status, "available", "같은 이메일이어도 먼저 보낸 요청의 뒤늦은 응답이 최신 상태를 덮어쓰면 안 된다")
  hook.unmount()
})

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

const completeRequests = []
const intentRequests = []
const codeRequests = []
const verifyRequests = []
const loggedInUsers = []
const navigations = []

let completeImpl = async () => ({ user: { uuid: "u-1", nickname: "소셜닉" } })
let intentImpl = async () => ({ emailVerificationRequired: false })
let requestCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
let verifyCodeImpl = async () => ({ ok: true, signupProof: "social-proof-1" })

mock.module("../../api/auth.api.js", {
  namedExports: {
    completeSocialSignupApi: async (payload) => {
      completeRequests.push(payload)
      return await completeImpl(payload)
    },
    getSocialSignupIntentApi: async (payload) => {
      intentRequests.push(payload)
      return await intentImpl(payload)
    },
    requestSignupCodeApi: async (payload) => {
      codeRequests.push(payload)
      return await requestCodeImpl(payload)
    },
    verifySignupCodeApi: async (payload) => {
      verifyRequests.push(payload)
      return await verifyCodeImpl(payload)
    },
  },
})

const authState = {
  login: (user) => loggedInUsers.push(user),
}
function useAuthStore(selector) {
  return selector(authState)
}
useAuthStore.getState = () => authState

mock.module("../../store/auth.store.js", {
  namedExports: { useAuthStore },
})

mock.module("react-router-dom", {
  namedExports: {
    useNavigate: () => (path, options) => navigations.push({ path, options }),
  },
})

const { act, renderHook } = await import("@testing-library/react")
const { useSocialSignup } = await import("../useSocialSignup.js")

const VALID_FIELDS = { nickname: "테스트닉", birthDate: "2000-01-01" }

test.beforeEach(() => {
  completeRequests.length = 0
  intentRequests.length = 0
  codeRequests.length = 0
  verifyRequests.length = 0
  loggedInUsers.length = 0
  navigations.length = 0
  completeImpl = async () => ({ user: { uuid: "u-1", nickname: "소셜닉" } })
  intentImpl = async () => ({ emailVerificationRequired: false })
  requestCodeImpl = async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 })
  verifyCodeImpl = async () => ({ ok: true, signupProof: "social-proof-1" })
})

const mountReady = async (intentToken) => {
  let hook
  await act(async () => {
    hook = renderHook(() => useSocialSignup(intentToken))
  })
  return hook
}

test("intentToken이 없으면 조회·완료 요청 없이 expired 상태가 된다", async () => {
  const hook = await mountReady(null)

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "expired")
  assert.equal(intentRequests.length, 0, "intentToken이 없으면 조회도 보내지 않아야 한다")
  assert.equal(completeRequests.length, 0, "요청을 보내지 않아야 한다")
  hook.unmount()
})

test("닉네임이 2자 미만이면 요청 없이 error 상태가 된다", async () => {
  const hook = await mountReady("intent-1")

  await act(async () => {
    await hook.result.current.submit({ nickname: "가", birthDate: "2000-01-01" })
  })

  assert.equal(hook.result.current.status, "error")
  assert.equal(completeRequests.length, 0)
  hook.unmount()
})

test("생년월일이 미래 날짜면 요청 없이 error 상태가 된다", async () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const futureDate = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()))
  const futureIso = futureDate.toISOString().slice(0, 10)

  const hook = await mountReady("intent-1")
  await act(async () => {
    await hook.result.current.submit({ nickname: "테스트닉", birthDate: futureIso })
  })

  assert.equal(hook.result.current.status, "error")
  assert.equal(completeRequests.length, 0)
  hook.unmount()
})

test("유효한 입력은 completeSocialSignupApi를 호출하고 로그인 후 로비로 이동한다", async () => {
  completeImpl = async () => ({ user: { uuid: "u-1", nickname: "테스트닉" } })

  const hook = await mountReady("intent-1")
  assert.deepEqual(intentRequests, [{ intentToken: "intent-1" }], "마운트 시 서버 intent를 조회해야 한다")
  assert.equal(hook.result.current.intentStatus, "ready")
  assert.equal(hook.result.current.emailVerificationRequired, false)

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(completeRequests.length, 1)
  assert.equal(completeRequests[0].intentToken, "intent-1")
  assert.equal(completeRequests[0].nickname, "테스트닉")
  assert.equal(completeRequests[0].birthDate, "2000-01-01")
  assert.equal(completeRequests[0].email, undefined, "제공자가 확인한 이메일 분기는 email을 싣지 않는다")
  assert.equal(completeRequests[0].signupProof, undefined)
  assert.equal(hook.result.current.status, "done")
  assert.equal(loggedInUsers.length, 1)
  assert.equal(navigations.at(-1).path, "/lobby")
  hook.unmount()
})

test("생년월일 없이도 요청을 보낼 수 있다", async () => {
  completeImpl = async () => ({ user: { uuid: "u-2", nickname: "테스트닉" } })

  const hook = await mountReady("intent-2")
  await act(async () => {
    await hook.result.current.submit({ nickname: "테스트닉", birthDate: "" })
  })

  assert.equal(completeRequests.length, 1)
  assert.equal(completeRequests[0].birthDate, undefined)
  assert.equal(hook.result.current.status, "done")
  hook.unmount()
})

test("emailVerificationRequired:true면 인증 전 제출이 막히고, 인증 후에는 email·signupProof가 완료 요청에 실린다", async () => {
  intentImpl = async () => ({ emailVerificationRequired: true })
  verifyCodeImpl = async () => ({ ok: true, signupProof: "social-proof-xyz" })

  const hook = await mountReady("intent-selfverify")
  assert.equal(hook.result.current.emailVerificationRequired, true)
  assert.equal(hook.result.current.canSubmit, false, "인증 전에는 제출할 수 없어야 한다")

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })
  assert.equal(completeRequests.length, 0, "인증 전 제출은 완료 API를 부르면 안 된다")
  assert.equal(hook.result.current.status, "error")

  await act(async () => {
    hook.result.current.handleEmailChange({ target: { value: "social-self@example.com" } })
  })
  await act(async () => {
    await hook.result.current.handleRequestSignupCode()
  })
  assert.deepEqual(codeRequests, [{ email: "social-self@example.com" }])

  await act(async () => {
    hook.result.current.handleSignupCodeChange({ target: { value: "123456" } })
  })
  await act(async () => {
    await hook.result.current.handleVerifySignupCode()
  })
  assert.deepEqual(verifyRequests, [{ email: "social-self@example.com", code: "123456" }])
  assert.equal(hook.result.current.canSubmit, true)

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(completeRequests.length, 1)
  assert.deepEqual(completeRequests[0], {
    intentToken: "intent-selfverify",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
    email: "social-self@example.com",
    signupProof: "social-proof-xyz",
  })
  assert.equal(hook.result.current.status, "done")
  hook.unmount()
})

test("인증 완료 후 이메일을 바꾸면 인증이 초기화되어 다시 제출이 막힌다", async () => {
  intentImpl = async () => ({ emailVerificationRequired: true })

  const hook = await mountReady("intent-emailchange")
  await act(async () => { hook.result.current.handleEmailChange({ target: { value: "first@example.com" } }) })
  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  await act(async () => { hook.result.current.handleSignupCodeChange({ target: { value: "111111" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })
  assert.equal(hook.result.current.canSubmit, true)

  await act(async () => { hook.result.current.handleEmailChange({ target: { value: "second@example.com" } }) })
  assert.equal(hook.result.current.canSubmit, false, "주소가 바뀌면 이전 인증을 그대로 쓸 수 없어야 한다")
  assert.equal(hook.result.current.emailVerification.stage, "unverified")

  await act(async () => { await hook.result.current.submit(VALID_FIELDS) })
  assert.equal(completeRequests.length, 0)
  hook.unmount()
})

test("같은 배치 안에서 이메일을 A→B→A로 바꿔도 기존 인증이 폐기되고 완료 제출이 막힌다", async () => {
  intentImpl = async () => ({ emailVerificationRequired: true })

  const hook = await mountReady("intent-aba")
  await act(async () => { hook.result.current.handleEmailChange({ target: { value: "a@example.com" } }) })
  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  await act(async () => { hook.result.current.handleSignupCodeChange({ target: { value: "333333" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })
  assert.equal(hook.result.current.canSubmit, true)

  act(() => {
    hook.result.current.handleEmailChange({ target: { value: "b@example.com" } })
    hook.result.current.handleEmailChange({ target: { value: "a@example.com" } })
  })

  assert.equal(hook.result.current.email, "a@example.com")
  assert.equal(hook.result.current.emailVerification.stage, "unverified", "A→B→A 뒤에도 기존 인증은 폐기돼 있어야 한다")
  assert.equal(hook.result.current.canSubmit, false)

  await act(async () => { await hook.result.current.submit(VALID_FIELDS) })
  assert.equal(completeRequests.length, 0, "폐기된 인증으로는 완료 API를 부르면 안 된다")
  hook.unmount()
})

test("완료 요청 중 취소(언마운트)되면 늦게 도착한 완료 응답은 login·navigate를 호출하지 않는다", async () => {
  let resolveComplete
  completeImpl = () => new Promise((resolve) => { resolveComplete = resolve })

  const hook = await mountReady("intent-cancel-late")
  let pendingSubmit
  act(() => { pendingSubmit = hook.result.current.submit(VALID_FIELDS) })
  assert.equal(completeRequests.length, 1)

  hook.unmount()

  await act(async () => {
    resolveComplete({ user: { uuid: "u-late", nickname: "늦은응답" } })
    await pendingSubmit
  })
  assert.equal(loggedInUsers.length, 0, "취소 뒤 늦은 완료 응답으로 로그인하면 안 된다")
  assert.equal(navigations.length, 0, "취소 뒤 늦은 완료 응답으로 이동하면 안 된다")
})

test("완료 요청 중 intent가 교체되면 이전 intent의 늦은 완료 응답은 login·navigate·상태 변경을 하지 않는다", async () => {
  const pending = []
  completeImpl = () => new Promise((resolve) => { pending.push(resolve) })

  let hook
  await act(async () => {
    hook = renderHook(({ token }) => useSocialSignup(token), { initialProps: { token: "intent-old" } })
  })
  assert.equal(hook.result.current.intentStatus, "ready")

  let oldSubmit
  act(() => { oldSubmit = hook.result.current.submit(VALID_FIELDS) })
  assert.equal(completeRequests.length, 1)
  assert.equal(completeRequests[0].intentToken, "intent-old")

  await act(async () => { hook.rerender({ token: "intent-new" }) })
  assert.equal(hook.result.current.intentStatus, "ready")
  assert.equal(hook.result.current.status, "idle")

  await act(async () => {
    pending[0]({ user: { uuid: "u-old", nickname: "이전시도" } })
    await oldSubmit
  })
  assert.equal(loggedInUsers.length, 0, "교체된 intent의 완료 응답으로 로그인하면 안 된다")
  assert.equal(navigations.length, 0)
  assert.equal(hook.result.current.status, "idle", "이전 intent의 응답이 새 화면 상태를 바꾸면 안 된다")
  hook.unmount()
})

test("완료 요청 중 intent가 교체된 뒤 도착한 이전 intent의 늦은 실패도 새 화면 상태를 바꾸지 않는다", async () => {
  const pending = []
  completeImpl = () => new Promise((_, reject) => { pending.push(reject) })

  let hook
  await act(async () => {
    hook = renderHook(({ token }) => useSocialSignup(token), { initialProps: { token: "intent-old-2" } })
  })
  let oldSubmit
  act(() => { oldSubmit = hook.result.current.submit(VALID_FIELDS) })

  await act(async () => { hook.rerender({ token: "intent-new-2" }) })

  await act(async () => {
    const error = new Error("이미 처리된 가입 요청입니다.")
    error.code = "INTENT_CONSUMED"
    error.status = 409
    pending[0](error)
    await oldSubmit
  })
  assert.equal(hook.result.current.status, "idle", "이전 intent의 실패가 새 화면을 cancelled로 바꾸면 안 된다")
  assert.equal(hook.result.current.errorMessage, null)
  hook.unmount()
})

for (const [label, user] of [["빈 객체", {}], ["빈 배열", []], ["uuid 없는 객체", { nickname: "소셜닉" }], ["null", null]]) {
  test(`완료 응답의 user가 ${label}이면 성공으로 처리하지 않고 통신 실패로 안내한다`, async () => {
    completeImpl = async () => ({ user })

    const hook = await mountReady(`intent-bad-user-${label}`)
    await act(async () => { await hook.result.current.submit(VALID_FIELDS) })

    assert.equal(completeRequests.length, 1)
    assert.equal(loggedInUsers.length, 0, "계약 밖 user로 로그인하면 안 된다")
    assert.equal(navigations.length, 0, "계약 밖 user로 로비로 이동하면 안 된다")
    assert.equal(hook.result.current.status, "error")
    assert.equal(hook.result.current.errorMessage, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
    hook.unmount()
  })
}

test("서버가 증명을 거부하면(SIGNUP_PROOF_INVALID) 증명이 폐기되고 다시 인증해야 한다", async () => {
  intentImpl = async () => ({ emailVerificationRequired: true })
  completeImpl = async () => {
    const error = new Error("이메일 인증 증명이 유효하지 않습니다.")
    error.code = "SIGNUP_PROOF_INVALID"
    error.status = 401
    throw error
  }

  const hook = await mountReady("intent-proof-rejected")
  await act(async () => { hook.result.current.handleEmailChange({ target: { value: "reject@example.com" } }) })
  await act(async () => { await hook.result.current.handleRequestSignupCode() })
  await act(async () => { hook.result.current.handleSignupCodeChange({ target: { value: "222222" } }) })
  await act(async () => { await hook.result.current.handleVerifySignupCode() })
  assert.equal(hook.result.current.canSubmit, true)

  await act(async () => { await hook.result.current.submit(VALID_FIELDS) })

  assert.equal(completeRequests.length, 1)
  assert.equal(hook.result.current.status, "error")
  assert.match(hook.result.current.errorMessage, /다시 인증/)
  assert.equal(hook.result.current.canSubmit, false, "거부된 증명은 즉시 폐기되어야 한다")
  assert.equal(hook.result.current.emailVerification.stage, "unverified")
  hook.unmount()
})

test("intent 조회 전에는 제출이 막히고 완료 API를 부르지 않는다", async () => {
  let resolveIntent
  intentImpl = () => new Promise((resolve) => { resolveIntent = resolve })

  let hook
  act(() => { hook = renderHook(() => useSocialSignup("intent-slow")) })
  assert.equal(hook.result.current.intentStatus, "loading")
  assert.equal(hook.result.current.canSubmit, false)

  await act(async () => { await hook.result.current.submit(VALID_FIELDS) })
  assert.equal(completeRequests.length, 0, "조회가 끝나기 전에는 완료 API를 부르면 안 된다")

  await act(async () => { resolveIntent({ emailVerificationRequired: false }) })
  assert.equal(hook.result.current.intentStatus, "ready")
  hook.unmount()
})

test("intent 조회가 계약 밖 응답을 돌려주면 인증 불필요로 단정하지 않고 재시도 상태가 된다", async () => {
  intentImpl = async () => ({})

  const hook = await mountReady("intent-bad-body")
  assert.equal(hook.result.current.intentStatus, "error")
  assert.equal(hook.result.current.emailVerificationRequired, false)
  assert.equal(hook.result.current.canSubmit, false)

  intentImpl = async () => ({ emailVerificationRequired: true })
  await act(async () => { hook.result.current.retryIntent() })
  assert.equal(hook.result.current.intentStatus, "ready")
  assert.equal(hook.result.current.emailVerificationRequired, true)
  assert.equal(intentRequests.length, 2)
  hook.unmount()
})

test("intent 조회가 INTENT_CONSUMED로 실패하면 cancelled 상태가 된다", async () => {
  intentImpl = async () => {
    const error = new Error("이미 처리된 가입 요청입니다.")
    error.code = "INTENT_CONSUMED"
    throw error
  }

  const hook = await mountReady("intent-consumed")
  assert.equal(hook.result.current.status, "cancelled")
  hook.unmount()
})

test("서버가 INTENT_EXPIRED를 돌려주면 expired 상태가 된다", async () => {
  completeImpl = async () => {
    const error = new Error("가입 가능 시간이 만료되었습니다.")
    error.code = "INTENT_EXPIRED"
    throw error
  }

  const hook = await mountReady("intent-3")
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "expired")
  assert.equal(hook.result.current.errorMessage, "가입 가능 시간이 만료되었습니다.")
  hook.unmount()
})

test("서버가 INTENT_CONSUMED를 돌려주면 cancelled 상태가 된다", async () => {
  completeImpl = async () => {
    const error = new Error("이미 처리된 가입 요청입니다.")
    error.code = "INTENT_CONSUMED"
    throw error
  }

  const hook = await mountReady("intent-4")
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "cancelled")
  hook.unmount()
})

test("서버가 EMAIL_CONFLICT를 돌려주면 conflict 상태가 된다", async () => {
  completeImpl = async () => {
    const error = new Error("이미 가입된 이메일입니다.")
    error.code = "EMAIL_CONFLICT"
    throw error
  }

  const hook = await mountReady("intent-5")
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "conflict")
  hook.unmount()
})

test("서버가 알 수 없는 code(또는 code 없음)를 돌려주면 error 상태가 되고 reset으로 idle로 되돌릴 수 있다", async () => {
  completeImpl = async () => { throw new Error("서버와 연결할 수 없습니다.") }

  const hook = await mountReady("intent-6")
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "error")

  act(() => {
    hook.result.current.reset()
  })
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.errorMessage, null)
  hook.unmount()
})

test("제출 중 중복 호출은 두 번째 제출을 무시한다", async () => {
  let resolveFirst
  const pending = new Promise((resolve) => { resolveFirst = resolve })
  completeImpl = async () => {
    await pending
    return { user: { uuid: "u-7", nickname: "테스트닉" } }
  }

  const hook = await mountReady("intent-7")

  let firstSubmit
  act(() => {
    firstSubmit = hook.result.current.submit(VALID_FIELDS)
  })
  assert.equal(hook.result.current.status, "submitting")

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })
  assert.equal(completeRequests.length, 1, "제출 중에는 두 번째 요청을 보내지 않아야 한다")

  await act(async () => {
    resolveFirst()
    await firstSubmit
  })
  assert.equal(hook.result.current.status, "done")
  hook.unmount()
})

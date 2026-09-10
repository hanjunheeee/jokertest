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
const loggedInUsers = []
const navigations = []

// completeSocialSignupApi 응답/거부는 테스트마다 바꿔 끼울 수 있게 함수 참조로 둡니다.
let completeImpl = async () => ({ user: { uuid: "u-1", nickname: "소셜닉" } })

mock.module("../../api/auth.api.js", {
  namedExports: {
    completeSocialSignupApi: async (payload) => {
      completeRequests.push(payload)
      return await completeImpl(payload)
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

test("intentToken이 없으면 요청 없이 expired 상태가 된다", async () => {
  completeRequests.length = 0
  const hook = renderHook(() => useSocialSignup(null))

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "expired")
  assert.equal(completeRequests.length, 0, "요청을 보내지 않아야 한다")
  hook.unmount()
})

test("닉네임이 2자 미만이면 요청 없이 error 상태가 된다", async () => {
  completeRequests.length = 0
  const hook = renderHook(() => useSocialSignup("intent-1"))

  await act(async () => {
    await hook.result.current.submit({ nickname: "가", birthDate: "2000-01-01" })
  })

  assert.equal(hook.result.current.status, "error")
  assert.equal(completeRequests.length, 0)
  hook.unmount()
})

test("생년월일이 미래 날짜면 요청 없이 error 상태가 된다", async () => {
  completeRequests.length = 0
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const futureDate = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()))
  const futureIso = futureDate.toISOString().slice(0, 10)

  const hook = renderHook(() => useSocialSignup("intent-1"))
  await act(async () => {
    await hook.result.current.submit({ nickname: "테스트닉", birthDate: futureIso })
  })

  assert.equal(hook.result.current.status, "error")
  assert.equal(completeRequests.length, 0)
  hook.unmount()
})

test("유효한 입력은 completeSocialSignupApi를 호출하고 로그인 후 로비로 이동한다", async () => {
  completeRequests.length = 0
  loggedInUsers.length = 0
  navigations.length = 0
  completeImpl = async () => ({ user: { uuid: "u-1", nickname: "테스트닉" } })

  const hook = renderHook(() => useSocialSignup("intent-1"))
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(completeRequests.length, 1)
  assert.deepEqual(completeRequests[0], { intentToken: "intent-1", nickname: "테스트닉", birthDate: "2000-01-01" })
  assert.equal(hook.result.current.status, "done")
  assert.equal(loggedInUsers.length, 1)
  assert.equal(navigations.at(-1).path, "/lobby")
  hook.unmount()
})

test("생년월일 없이도 요청을 보낼 수 있다", async () => {
  completeRequests.length = 0
  completeImpl = async () => ({ user: { uuid: "u-2", nickname: "테스트닉" } })

  const hook = renderHook(() => useSocialSignup("intent-2"))
  await act(async () => {
    await hook.result.current.submit({ nickname: "테스트닉", birthDate: "" })
  })

  assert.equal(completeRequests.length, 1)
  assert.equal(completeRequests[0].birthDate, undefined)
  assert.equal(hook.result.current.status, "done")
  hook.unmount()
})

// ── AC-05: 서버가 돌려준 code에 따라 상태가 갈린다 ────────────────────────────

test("서버가 INTENT_EXPIRED를 돌려주면 expired 상태가 된다", async () => {
  completeRequests.length = 0
  completeImpl = async () => {
    const error = new Error("가입 가능 시간이 만료되었습니다.")
    error.code = "INTENT_EXPIRED"
    throw error
  }

  const hook = renderHook(() => useSocialSignup("intent-3"))
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

  const hook = renderHook(() => useSocialSignup("intent-4"))
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

  const hook = renderHook(() => useSocialSignup("intent-5"))
  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS)
  })

  assert.equal(hook.result.current.status, "conflict")
  hook.unmount()
})

test("서버가 알 수 없는 code(또는 code 없음)를 돌려주면 error 상태가 되고 reset으로 idle로 되돌릴 수 있다", async () => {
  completeImpl = async () => { throw new Error("서버와 연결할 수 없습니다.") }

  const hook = renderHook(() => useSocialSignup("intent-6"))
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
  completeRequests.length = 0
  let resolveFirst
  const pending = new Promise((resolve) => { resolveFirst = resolve })
  completeImpl = async () => {
    await pending
    return { user: { uuid: "u-7", nickname: "테스트닉" } }
  }

  const hook = renderHook(() => useSocialSignup("intent-7"))

  let firstSubmit
  act(() => {
    firstSubmit = hook.result.current.submit(VALID_FIELDS)
  })
  assert.equal(hook.result.current.status, "submitting")

  await act(async () => {
    await hook.result.current.submit(VALID_FIELDS) // 제출 중 두 번째 호출 — 무시되어야 한다
  })
  assert.equal(completeRequests.length, 1, "제출 중에는 두 번째 요청을 보내지 않아야 한다")

  await act(async () => {
    resolveFirst()
    await firstSubmit
  })
  assert.equal(hook.result.current.status, "done")
  hook.unmount()
})

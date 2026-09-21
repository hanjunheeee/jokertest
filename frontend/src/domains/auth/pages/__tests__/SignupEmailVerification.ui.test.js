import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-31b: 실제 LoginPage.jsx·SignupForm.jsx·useLoginPage.js·auth.api.js·client.js·
// response.js·auth.store.js·unauthorized.js를 jsdom에 마운트해 가입 이메일 인증 흐름
// (발송·확인·재발송·주소 변경·가입 제출)을 검증한다. PasswordResetPage.ui.test.js와 같은
// 패턴 — HTTP 경계는 env.js(API_BASE_URL)와 전역 fetch에서만 갈아끼우고, 그 외에는 실제
// 코드가 돈다. 등록되는 401 처리기(handleAuthUnauthorized)도 main.jsx와 같은 실제 함수다.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/login",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("sessionStorage", dom.window.sessionStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let alertMessages = []
dom.window.alert = (message) => alertMessages.push(message)
globalThis.alert = dom.window.alert

register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── AC-05 계측: 가입 증명·인증번호 원문이 저장소·쿠키·콘솔에 남는지 감시한다 ──────────

const storageWrites = []
const originalSetItem = dom.window.Storage.prototype.setItem
dom.window.Storage.prototype.setItem = function patchedSetItem(key, value) {
  storageWrites.push({ key: String(key), value: String(value) })
  return originalSetItem.call(this, key, value)
}

const cookieWrites = []
const cookieDescriptor = Object.getOwnPropertyDescriptor(dom.window.Document.prototype, "cookie")
if (cookieDescriptor) {
  Object.defineProperty(dom.window.document, "cookie", {
    configurable: true,
    get() { return cookieDescriptor.get.call(dom.window.document) },
    set(value) {
      cookieWrites.push(String(value))
      return cookieDescriptor.set.call(dom.window.document, value)
    },
  })
}

const consoleCalls = []
for (const method of ["log", "warn", "error", "info", "debug"]) {
  const original = console[method]
  console[method] = (...args) => {
    consoleCalls.push(args.map((a) => {
      if (typeof a === "string") return a
      try { return JSON.stringify(a) } catch { return String(a) }
    }).join(" "))
    return original.apply(console, args)
  }
}

// HTTP 경계는 fetch 하나만 갈아끼운다 — 나머지(auth.api.js·client.js·response.js·검증·상태
// 전이)는 전부 실제 코드가 돈다.
let fetchHandler = async () => { throw new Error("fetchHandler not set by test") }
let fetchCalls = []

const jsonResponse = (status, body) => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  }
  response.clone = () => response
  return response
}

// url+method 조합으로 응답을 분기하는 라우터. 매칭되지 않으면 실패시켜(테스트가 예상하지
// 못한 호출을 놓치지 않게) 어떤 요청이 왔는지 에러 메시지에 남긴다.
function makeRouter(routes) {
  return async (url, options) => {
    const method = options?.method || "GET"
    const key = `${method} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`no route registered for ${key}`)
    return await handler(options)
  }
}

installDomGlobal("fetch", (url, options) => {
  fetchCalls.push({ url, options })
  return fetchHandler(url, options)
})

// node:test의 mock.module은 이 파일(테스트) 기준 상대 경로로 등록해도 실제 리졸버가 만드는
// 절대 경로가 같으면(별칭 경유 포함) 전역으로 적용된다 — PasswordResetPage.ui.test.js와 동일한
// 전제.
mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "" },
})

const { render, act, cleanup, fireEvent } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: LoginPage } = await import("../LoginPage.jsx")
const { useAuthStore } = await import("../../store/auth.store.js")
const { setUnauthorizedHandler } = await import("../../../../shared/api/response.js")
const { handleAuthUnauthorized } = await import("../../api/unauthorized.js")

// main.jsx와 같은 실제 배선 — SIGNUP_PROOF_REQUIRED/INVALID가 이 처리기를 거치지 않고
// response.js에서 먼저 구조화되는지, 아니면 실수로 로그아웃 처리를 타는지까지 검증한다.
setUnauthorizedHandler(handleAuthUnauthorized)

test.beforeEach(() => {
  fetchCalls = []
  fetchHandler = async () => { throw new Error("fetchHandler not set by test") }
  alertMessages = []
  storageWrites.length = 0
  cookieWrites.length = 0
  consoleCalls.length = 0
  useAuthStore.setState({ isLoggedIn: false, user: null, loggedOutIntentionally: false })
  dom.window.localStorage.clear()
  dom.window.sessionStorage.clear()
})
test.afterEach(() => cleanup())

const EMAIL = "signup-flow@example.com"

async function mountLoginPage() {
  let view
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/login"] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "/login", element: React.createElement(LoginPage) }),
            React.createElement(Route, { path: "/lobby", element: React.createElement("div", null, "LOBBY_STUB") }),
          ),
        ),
      ),
    )
  })
  return view
}

function findButtonByText(view, text) {
  return Array.from(view.container.querySelectorAll("button")).find((b) => b.textContent.trim() === text)
}

async function mountLoginPageAtSignup() {
  const view = await mountLoginPage()
  fireEvent.click(findButtonByText(view, "회원가입"))
  return view
}

function fillSignupFields(view, overrides = {}) {
  const fields = {
    email: EMAIL,
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
    ...overrides,
  }
  for (const [name, value] of Object.entries(fields)) {
    fireEvent.change(view.container.querySelector(`input[name="${name}"]`), { target: { value } })
  }
}

const submitButton = (view) => view.container.querySelector('button[aria-label="회원가입"]')
const form = (view) => view.container.querySelector("form")
const sendButton = (view) => view.container.querySelector('[data-testid="signup-code-send"]')
const verifyButton = (view) => view.container.querySelector('[data-testid="signup-code-verify"]')
const codeInput = (view) => view.container.querySelector('[data-testid="signup-code-input"]')
const notice = (view) => view.container.querySelector('[data-testid="signup-email-verification-notice"]')?.textContent

// ── AC-01: 인증 완료 전에는 어떤 단계에서도 제출이 불가능하다 ──────────────────────

test("AC-01: unverified·sending·codeSent·verifying 단계 전부에서 가입 버튼이 비활성화되고 강제 form submit도 가입 API를 부르지 않는다", async () => {
  let resolveSend
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => new Promise((resolve) => { resolveSend = resolve }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)

  const assertBlocked = async () => {
    assert.equal(submitButton(view).disabled, true)
    const before = fetchCalls.filter((c) => c.url === "/auth/signup").length
    await act(async () => { fireEvent.submit(form(view)) })
    assert.equal(fetchCalls.filter((c) => c.url === "/auth/signup").length, before, "인증 전 제출은 가입 API를 부르면 안 된다")
  }

  await assertBlocked() // unverified

  act(() => { fireEvent.click(sendButton(view)) })
  await assertBlocked() // sending

  await act(async () => { resolveSend(jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 })) })
  await assertBlocked() // codeSent

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code/verify": () => new Promise(() => {}), // 응답 없이 verifying 유지
  })
  fireEvent.change(codeInput(view), { target: { value: "123456" } })
  act(() => { fireEvent.click(verifyButton(view)) })
  await assertBlocked() // verifying
})

test("AC-01: codeExpired·locked 단계에서도 가입 버튼은 비활성화된다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code/verify": () => jsonResponse(400, { ok: false, code: "CODE_EXPIRED" }),
  })
  fireEvent.change(codeInput(view), { target: { value: "000000" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, true, "codeExpired")

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(429, { ok: false, code: "TOO_MANY_ATTEMPTS" }),
  })
  await act(async () => { fireEvent.click(sendButton(view)) }) // 재발송
  fireEvent.change(codeInput(view), { target: { value: "000000" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, true, "locked")
  assert.equal(verifyButton(view).disabled, true, "locked에서는 확인 자체가 막혀야 한다")
})

// ── AC-02: 발송→확인→가입 제출 성공 흐름 ─────────────────────────────────────────

test("AC-02: 발송→확인→가입 제출까지 실제 경로·순서·body로 성공하고 로그인 모드로 돌아간다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: "proof-abc-123" }),
    "POST /auth/signup": () => jsonResponse(200, { success: true, message: "가입 완료" }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  assert.equal(submitButton(view).disabled, true)

  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: "654321" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)

  await act(async () => { fireEvent.submit(form(view)) })

  const relevant = fetchCalls.filter((c) => c.url.startsWith("/auth/signup"))
  assert.equal(relevant.length, 3, "발송 1회·확인 1회·가입 1회만 나가야 한다")
  assert.equal(relevant[0].url, "/auth/signup/email-code")
  assert.deepEqual(JSON.parse(relevant[0].options.body), { email: EMAIL })
  assert.equal(relevant[1].url, "/auth/signup/email-code/verify")
  assert.deepEqual(JSON.parse(relevant[1].options.body), { email: EMAIL, code: "654321" })
  assert.equal(relevant[2].url, "/auth/signup")
  const signupBody = JSON.parse(relevant[2].options.body)
  assert.equal(signupBody.email, EMAIL)
  assert.equal(signupBody.signupProof, "proof-abc-123")

  assert.equal(alertMessages.length, 1)
  assert.match(alertMessages[0], /완료/)
  assert.ok(view.container.querySelector('button[aria-label="로그인"]'), "가입 성공 후 로그인 모드로 돌아가야 한다")
})

test("AC-02: 가입 200 응답에 success:true가 없으면 완료로 처리하지 않는다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: "proof-contract-check" }),
    "POST /auth/signup": () => jsonResponse(200, {}),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: "111111" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })

  await act(async () => { fireEvent.submit(form(view)) })

  assert.equal(view.container.querySelector('button[aria-label="로그인"]'), null, "완료로 처리하면 안 된다")
  assert.equal(view.container.querySelector('input[name="email"]').value, EMAIL, "실패 시 입력을 보존해야 한다")
})

test("AC-02/AC-05: 가입 제출이 SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID로 거부되면(production 401 처리기가 붙어 있어도) 로그아웃되지 않고 재인증이 요구된다", async () => {
  for (const code of ["SIGNUP_PROOF_REQUIRED", "SIGNUP_PROOF_INVALID"]) {
    fetchCalls = []
    alertMessages = []
    fetchHandler = makeRouter({
      "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
      "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: `proof-${code}` }),
      "POST /auth/signup": () => jsonResponse(401, { success: false, message: "이메일 인증이 필요합니다.", code }),
    })
    const view = await mountLoginPageAtSignup()
    fillSignupFields(view)
    await act(async () => { fireEvent.click(sendButton(view)) })
    fireEvent.change(codeInput(view), { target: { value: "111222" } })
    await act(async () => { fireEvent.click(verifyButton(view)) })
    assert.equal(submitButton(view).disabled, false)

    await act(async () => { fireEvent.submit(form(view)) })

    assert.equal(alertMessages.length, 1, code)
    assert.match(alertMessages[0], /다시 인증/, code)
    assert.equal(submitButton(view).disabled, true, `${code}: 증명이 폐기되어 다시 비활성화되어야 한다`)
    assert.equal(useAuthStore.getState().isLoggedIn, false, `${code}: 실제 세션을 로그아웃 처리하면 안 된다`)
    assert.equal(dom.window.location.pathname, "/login", `${code}: 리다이렉트가 일어나면 안 된다`)

    cleanup()
  }
})

// ── AC-03: 재발송 대기·만료·오입력 초과·요청 제한·통신 실패 ─────────────────────────

test("AC-03: 재발송 대기가 60초에서 매초 줄어들고 0초가 되어야 재발송 버튼이 열린다", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] })
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)

  await act(async () => { fireEvent.click(sendButton(view)) })
  assert.equal(sendButton(view).textContent, "재발송 (60초)")
  assert.equal(sendButton(view).disabled, true)

  act(() => { t.mock.timers.tick(1000) })
  assert.equal(sendButton(view).textContent, "재발송 (59초)")

  const callsBeforeWait = fetchCalls.length
  fireEvent.click(sendButton(view)) // 비활성 버튼 클릭 — 추가 호출이 없어야 한다
  assert.equal(fetchCalls.length, callsBeforeWait)

  act(() => { t.mock.timers.tick(59000) })
  assert.equal(sendButton(view).textContent, "재발송")
  assert.equal(sendButton(view).disabled, false)

  const callsBeforeResend = fetchCalls.length
  await act(async () => { fireEvent.click(sendButton(view)) })
  assert.equal(fetchCalls.length, callsBeforeResend + 1, "대기가 끝나면 재발송 클릭이 실제로 API를 불러야 한다")
})

test("AC-03: RESEND_TOO_SOON 응답은 서버가 준 남은 초를 그대로 보여준다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(429, { ok: false, code: "RESEND_TOO_SOON", resendAfterSec: 45 }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })

  assert.equal(sendButton(view).textContent, "재발송 (45초)")
})

test("AC-03: 인증번호 만료 시각에 도달하면 codeExpired로 자동 전이하고 확인·입력이 막힌다(재발송은 가능)", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] })
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })

  act(() => { t.mock.timers.tick(600000) }) // 10분(=expiresInSec) 경과

  assert.match(notice(view), /만료/)
  assert.equal(verifyButton(view).disabled, true)
  assert.equal(codeInput(view).disabled, true)
  assert.equal(sendButton(view).disabled, false, "재발송 대기(60초)는 이미 끝났으므로 재발송은 가능해야 한다")

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
  })
  fireEvent.change(codeInput(view), { target: { value: "555555" } })
  await act(async () => { fireEvent.click(sendButton(view)) })
  assert.equal(codeInput(view).value, "", "재발송하면 이전에 입력하던 번호는 비워야 한다")
})

test("AC-03: 오입력 남은 횟수·요청 제한·통신 실패는 서로 다른 안내로 표시되고 입력을 유지한다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code/verify": () => jsonResponse(400, { ok: false, code: "CODE_INVALID", attemptsRemaining: 4 }),
  })
  fireEvent.change(codeInput(view), { target: { value: "000000" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.match(notice(view), /남은 시도 4회/)
  assert.equal(codeInput(view).value, "000000", "오입력 후에도 입력값을 지우면 안 된다")

  fetchHandler = makeRouter({
    "POST /auth/signup/email-code/verify": () => jsonResponse(429, { ok: false, code: "RATE_LIMITED" }),
  })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.match(notice(view), /요청이 너무 많습니다/)

  fetchHandler = async () => { throw new TypeError("network down") }
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.match(notice(view), /통신할 수 없습니다/)
  assert.equal(codeInput(view).value, "000000")
})

test("AC-03: 잘못된 body(계약 밖 200 응답)도 특정 실패로 단정하지 않고 재시도 안내를 보여준다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: "true" }), // ok가 boolean이 아님
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })

  assert.match(notice(view), /통신할 수 없습니다/)
  assert.equal(sendButton(view).textContent, "인증번호 받기", "계약 밖 응답은 codeSent로 넘어가면 안 된다")
})

// ── AC-04: 이메일 변경 시 인증 상태 초기화 ───────────────────────────────────────

test("AC-04: 인증 완료 후 이메일을 바꾸면 인증 상태가 초기화되어 재인증이 필요하다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: "proof-xyz" }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: "999888" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)

  fireEvent.change(view.container.querySelector('input[name="email"]'), { target: { value: "changed@example.com" } })

  assert.equal(submitButton(view).disabled, true)
  assert.equal(codeInput(view), null, "이메일이 바뀌면 unverified로 돌아가 번호 입력칸이 다시 숨겨져야 한다")

  const before = fetchCalls.filter((c) => c.url === "/auth/signup").length
  await act(async () => { fireEvent.submit(form(view)) })
  assert.equal(fetchCalls.filter((c) => c.url === "/auth/signup").length, before)
})

test("AC-04: 발송 응답을 기다리는 중 이메일을 바꾸면 늦게 도착한 응답이 인증 상태를 되살리지 않는다", async () => {
  let resolveSend
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => new Promise((resolve) => { resolveSend = resolve }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  act(() => { fireEvent.click(sendButton(view)) })

  fireEvent.change(view.container.querySelector('input[name="email"]'), { target: { value: "another@example.com" } })
  assert.equal(sendButton(view).textContent, "인증번호 받기")

  await act(async () => { resolveSend(jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 })) })

  assert.equal(sendButton(view).textContent, "인증번호 받기", "무효화된 세대의 늦은 응답이 codeSent로 되돌리면 안 된다")
  assert.equal(submitButton(view).disabled, true)
})

test("AC-04: 대소문자만 바뀌어도 인증 상태가 초기화된다", async () => {
  // <input type="email">은 HTML 값 살균 규칙상 앞뒤 공백을 브라우저(jsdom도 동일)가 자체
  // 제거하므로, 공백만 다른 값은 애초에 DOM에 그대로 반영되지 않는다 — 여기서는 살균되지
  // 않는 대소문자 변경으로 "원문이 다르면 초기화" 규칙을 검증한다.
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: "proof-case" }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: "444555" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)

  fireEvent.change(view.container.querySelector('input[name="email"]'), { target: { value: EMAIL.toUpperCase() } })
  assert.equal(submitButton(view).disabled, true)
})

// ── AC-05: 가입 증명·인증번호는 저장소·쿠키·콘솔에 남지 않는다 ────────────────────────

test("AC-05: 발송→확인→가입 전체 흐름에서 증명·인증번호 원문이 저장소·쿠키·콘솔에 남지 않는다(가입 요청 body에는 정상 전달된다)", async () => {
  const SECRET_CODE = "135790"
  const SECRET_PROOF = "leak-check-proof-9f8e7d"
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: SECRET_PROOF }),
    "POST /auth/signup": () => jsonResponse(200, { success: true, message: "가입 완료" }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: SECRET_CODE } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  await act(async () => { fireEvent.submit(form(view)) })

  const signupCall = fetchCalls.find((c) => c.url === "/auth/signup")
  assert.ok(signupCall, "가입 요청이 실제로 나가야 한다(빈 경로 시험 방지)")
  assert.equal(JSON.parse(signupCall.options.body).signupProof, SECRET_PROOF, "가입 요청 body에는 증명이 전달되어야 한다")

  for (const write of storageWrites) {
    assert.equal(write.value.includes(SECRET_PROOF), false, `저장소에 증명이 남았습니다(key=${write.key})`)
    assert.equal(write.value.includes(SECRET_CODE), false, `저장소에 인증번호가 남았습니다(key=${write.key})`)
  }
  for (const cookie of cookieWrites) {
    assert.equal(cookie.includes(SECRET_PROOF), false, "쿠키에 증명이 남았습니다")
    assert.equal(cookie.includes(SECRET_CODE), false, "쿠키에 인증번호가 남았습니다")
  }
  for (const line of consoleCalls) {
    assert.equal(line.includes(SECRET_PROOF), false, "콘솔에 증명이 남았습니다")
    assert.equal(line.includes(SECRET_CODE), false, "콘솔에 인증번호가 남았습니다")
  }

  for (const storage of [dom.window.localStorage, dom.window.sessionStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      const value = storage.getItem(key)
      assert.equal(value.includes(SECRET_PROOF), false, `최종 저장소 스냅샷에 증명이 남았습니다(key=${key})`)
      assert.equal(value.includes(SECRET_CODE), false, `최종 저장소 스냅샷에 인증번호가 남았습니다(key=${key})`)
    }
  }
  assert.equal(dom.window.document.cookie.includes(SECRET_PROOF), false)
  assert.equal(dom.window.document.cookie.includes(SECRET_CODE), false)
})

test("AC-05: 인증 완료 후 언마운트→재마운트하면 다시 인증이 필요하다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/signup/email-code": () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: "remount-proof" }),
  })
  const view = await mountLoginPageAtSignup()
  fillSignupFields(view)
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: "222333" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)
  cleanup()

  const view2 = await mountLoginPageAtSignup()
  assert.equal(submitButton(view2).disabled, true, "재마운트 후에는 다시 인증을 요구해야 한다")
})

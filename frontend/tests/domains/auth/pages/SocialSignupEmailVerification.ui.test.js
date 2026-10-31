import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

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

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

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

mock.module("../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "" },
})

const { render, act, cleanup, fireEvent } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: LoginPage } = await import("../../../../src/domains/auth/pages/LoginPage.jsx")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { setUnauthorizedHandler } = await import("../../../../src/shared/api/response.js")
const { handleAuthUnauthorized } = await import("../../../../src/domains/auth/api/unauthorized.js")

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

const INTENT = "intent-social-abc"
const EMAIL = "social-self@example.com"
const USER = { uuid: "u-social-1", nickname: "소셜닉" }
const SENT = () => jsonResponse(200, { ok: true, resendAfterSec: 60, expiresInSec: 600 })

async function mountSocialSignup(intentToken = INTENT) {
  let view
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: [`/login?socialIntent=${intentToken}`] },
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

const q = (view, selector) => view.container.querySelector(selector)
const submitButton = (view) => q(view, 'button[aria-label="가입 완료"]')
const sendButton = (view) => q(view, '[data-testid="signup-code-send"]')
const verifyButton = (view) => q(view, '[data-testid="signup-code-verify"]')
const codeInput = (view) => q(view, '[data-testid="signup-code-input"]')
const notice = (view) => q(view, '[data-testid="signup-email-verification-notice"]')?.textContent
const callsTo = (url) => fetchCalls.filter((c) => c.url === url)

function fillProfile(view) {
  fireEvent.change(q(view, 'input[name="nickname"]'), { target: { value: "소셜닉" } })
  fireEvent.change(q(view, 'input[name="birthDate"]'), { target: { value: "2000-01-01" } })
}

test("AC-02: 서버 intent 조회가 끝나기 전에는 제출이 막히고, 조회 body에는 intentToken만 실린다", async () => {
  let resolveIntent
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => new Promise((resolve) => { resolveIntent = resolve }),
  })
  const view = await mountSocialSignup()

  assert.ok(q(view, '[data-testid="social-intent-loading"]'), "조회 중 안내가 보여야 한다")
  assert.equal(submitButton(view).disabled, true)
  fillProfile(view)
  await act(async () => { fireEvent.click(submitButton(view)) })
  assert.equal(callsTo("/auth/social/signup/complete").length, 0, "조회 전 제출은 완료 API를 부르면 안 된다")

  const intentCalls = callsTo("/auth/social/signup/intent")
  assert.ok(intentCalls.length >= 1)
  for (const call of intentCalls) assert.deepEqual(JSON.parse(call.options.body), { intentToken: INTENT })

  await act(async () => { resolveIntent(jsonResponse(200, { success: true, data: { emailVerificationRequired: true } })) })
  assert.equal(q(view, '[data-testid="social-intent-loading"]'), null)
  assert.ok(q(view, 'input[name="email"]'), "자체 인증이 필요하면 이메일 입력이 보여야 한다")
})

test("AC-02: 조회 통신 실패는 재시도 버튼을 보여주고, 재시도가 성공하면 폼이 열린다", async () => {
  fetchHandler = async () => { throw new TypeError("network down") }
  const view = await mountSocialSignup()
  assert.ok(q(view, '[data-testid="social-intent-retry"]'), "재시도 버튼이 보여야 한다")
  assert.equal(submitButton(view), null)

  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: false } }),
  })
  await act(async () => { fireEvent.click(q(view, '[data-testid="social-intent-retry"]')) })
  assert.ok(submitButton(view))
  assert.equal(q(view, 'input[name="email"]'), null, "제공자 검증 intent는 이메일 입력이 없어야 한다")
})

test("AC-02/AC-03: 계약 밖 200 body와 5xx+알려진 code는 인증 생략·확정 거부로 단정하지 않고 재시도로 안내한다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: "false" } }),
  })
  const view = await mountSocialSignup()
  assert.ok(q(view, '[data-testid="social-intent-retry"]'), "계약 밖 응답은 조회 실패로 처리해야 한다")
  cleanup()

  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(500, { success: false, code: "INTENT_EXPIRED", message: "만료" }),
  })
  const view2 = await mountSocialSignup()
  assert.ok(q(view2, '[data-testid="social-intent-retry"]'), "5xx의 code는 만료로 확정하지 않고 재시도를 허용해야 한다")
})

test("AC-02: 조회가 INTENT_EXPIRED(400)로 거절되면 로그인 화면으로 돌아가라는 안내만 보인다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(400, { success: false, code: "INTENT_EXPIRED", message: "가입 가능 시간이 만료되었습니다." }),
  })
  const view = await mountSocialSignup()
  assert.match(q(view, '[role="alert"]').textContent, /만료/)
  assert.equal(q(view, '[data-testid="social-intent-retry"]'), null)
  assert.equal(submitButton(view), null)
})

test("AC-02: 조회 응답을 기다리는 중 취소하면 늦은 응답이 폼을 되살리지 않는다", async () => {
  let resolveIntent
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => new Promise((resolve) => { resolveIntent = resolve }),
  })
  const view = await mountSocialSignup()
  const cancel = Array.from(view.container.querySelectorAll("button")).find((b) => b.textContent.includes("취소하고 로그인 화면으로"))
  await act(async () => { fireEvent.click(cancel) })
  assert.equal(q(view, 'input[name="nickname"]'), null)

  await act(async () => { resolveIntent(jsonResponse(200, { success: true, data: { emailVerificationRequired: true } })) })
  assert.equal(q(view, 'input[name="nickname"]'), null, "늦은 응답이 가입 보완 화면을 되살리면 안 된다")
})

test("AC-01: 제공자 검증 intent는 메일 API 없이 완료되고 email·signupProof·권한 주장을 보내지 않는다", async () => {
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: false } }),
    "POST /auth/social/signup/complete": () => jsonResponse(200, { success: true, data: { user: USER } }),
  })
  const view = await mountSocialSignup()
  fillProfile(view)
  await act(async () => { fireEvent.click(submitButton(view)) })

  const [complete] = callsTo("/auth/social/signup/complete")
  assert.deepEqual(JSON.parse(complete.options.body), { intentToken: INTENT, nickname: "소셜닉", birthDate: "2000-01-01" })
  assert.equal(fetchCalls.some((c) => c.url.startsWith("/auth/signup/email-code")), false)
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  assert.ok(view.container.textContent.includes("LOBBY_STUB"), "성공하면 로비로 이동해야 한다")
})

for (const [label, data] of [["user 없음", {}], ["user 빈 객체", { user: {} }], ["user 빈 배열", { user: [] }]]) {
  test(`AC-02: 완료 200 응답이 ${label}이면 가입 완료로 처리하지 않고 통신 실패로 안내한다`, async () => {
    fetchHandler = makeRouter({
      "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: false } }),
      "POST /auth/social/signup/complete": () => jsonResponse(200, { success: true, data }),
    })
    const view = await mountSocialSignup()
    fillProfile(view)
    await act(async () => { fireEvent.click(submitButton(view)) })

    assert.equal(useAuthStore.getState().isLoggedIn, false)
    assert.equal(view.container.textContent.includes("LOBBY_STUB"), false)
    assert.equal(q(view, '[role="alert"]').textContent, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
  })
}

test("AC-02/AC-04: 미인증 제출 차단→발송→60초 대기→오답 남은 횟수→정답→주소 변경 초기화→재인증→완료", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.now() })
  const SECRET_CODE = "864209"
  const FIRST_PROOF = "social-first-proof-1a2b"
  const SECOND_PROOF = "social-second-proof-3c4d"
  const SECOND_EMAIL = "social-second@example.com"
  let verifyResponse = () => jsonResponse(400, { ok: false, code: "CODE_INVALID", attemptsRemaining: 4 })
  fetchHandler = makeRouter({
    "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: true } }),
    "POST /auth/signup/email-code": SENT,
    "POST /auth/signup/email-code/verify": () => verifyResponse(),
    "POST /auth/social/signup/complete": () => jsonResponse(200, { success: true, data: { user: USER } }),
  })
  const view = await mountSocialSignup()
  fillProfile(view)
  fireEvent.change(q(view, 'input[name="email"]'), { target: { value: EMAIL } })

  assert.equal(submitButton(view).disabled, true)
  await act(async () => { fireEvent.click(submitButton(view)) })
  assert.equal(callsTo("/auth/social/signup/complete").length, 0)

  await act(async () => { fireEvent.click(sendButton(view)) })
  assert.deepEqual(JSON.parse(callsTo("/auth/signup/email-code")[0].options.body), { email: EMAIL })
  assert.equal(sendButton(view).textContent, "재발송 (60초)")
  assert.equal(sendButton(view).disabled, true)
  act(() => { t.mock.timers.tick(60000) })
  assert.equal(sendButton(view).textContent, "재발송")

  fireEvent.change(codeInput(view), { target: { value: "000000" } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.match(notice(view), /남은 시도 4회/)
  assert.equal(submitButton(view).disabled, true)

  verifyResponse = () => jsonResponse(200, { ok: true, signupProof: FIRST_PROOF })
  fireEvent.change(codeInput(view), { target: { value: SECRET_CODE } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)

  fireEvent.change(q(view, 'input[name="email"]'), { target: { value: SECOND_EMAIL } })
  assert.equal(submitButton(view).disabled, true)
  assert.equal(codeInput(view), null, "주소가 바뀌면 번호 입력 단계로 돌아가 인증을 다시 받아야 한다")

  verifyResponse = () => jsonResponse(200, { ok: true, signupProof: SECOND_PROOF })
  await act(async () => { fireEvent.click(sendButton(view)) })
  fireEvent.change(codeInput(view), { target: { value: SECRET_CODE } })
  await act(async () => { fireEvent.click(verifyButton(view)) })
  assert.equal(submitButton(view).disabled, false)

  await act(async () => { fireEvent.click(submitButton(view)) })
  const completes = callsTo("/auth/social/signup/complete")
  assert.equal(completes.length, 1)
  assert.deepEqual(JSON.parse(completes[0].options.body), {
    intentToken: INTENT, nickname: "소셜닉", birthDate: "2000-01-01", email: SECOND_EMAIL, signupProof: SECOND_PROOF,
  })
  assert.ok(view.container.textContent.includes("LOBBY_STUB"))

  for (const secret of [SECRET_CODE, FIRST_PROOF, SECOND_PROOF]) {
    for (const write of storageWrites) assert.equal(write.value.includes(secret), false, `저장소에 ${secret}가 남았습니다(key=${write.key})`)
    for (const cookie of cookieWrites) assert.equal(cookie.includes(secret), false, "쿠키에 비밀값이 남았습니다")
    for (const line of consoleCalls) assert.equal(line.includes(secret), false, "콘솔에 비밀값이 남았습니다")
  }
})

test("AC-02/AC-03: 완료가 SIGNUP_PROOF_INVALID·REQUIRED(401)로 거절되면 로그아웃 없이 증명을 폐기하고 재인증을 요구한다", async () => {
  for (const code of ["SIGNUP_PROOF_INVALID", "SIGNUP_PROOF_REQUIRED"]) {
    fetchCalls = []
    fetchHandler = makeRouter({
      "POST /auth/social/signup/intent": () => jsonResponse(200, { success: true, data: { emailVerificationRequired: true } }),
      "POST /auth/signup/email-code": SENT,
      "POST /auth/signup/email-code/verify": () => jsonResponse(200, { ok: true, signupProof: `proof-${code}` }),
      "POST /auth/social/signup/complete": () => jsonResponse(401, { success: false, code, message: "거절" }),
    })
    const view = await mountSocialSignup()
    fillProfile(view)
    fireEvent.change(q(view, 'input[name="email"]'), { target: { value: EMAIL } })
    await act(async () => { fireEvent.click(sendButton(view)) })
    fireEvent.change(codeInput(view), { target: { value: "123123" } })
    await act(async () => { fireEvent.click(verifyButton(view)) })
    assert.equal(submitButton(view).disabled, false)

    await act(async () => { fireEvent.click(submitButton(view)) })

    assert.match(q(view, '[role="alert"]').textContent, /다시 인증/, code)
    assert.equal(submitButton(view).disabled, true, `${code}: 증명이 폐기되어 제출이 다시 막혀야 한다`)
    assert.equal(sendButton(view).textContent, "인증번호 받기", `${code}: 인증 초기 단계로 돌아가야 한다`)
    assert.equal(useAuthStore.getState().isLoggedIn, false)
    assert.equal(view.container.textContent.includes("LOBBY_STUB"), false)
    assert.equal(callsTo("/auth/social/signup/complete").length, 1, `${code}: 재인증 전에는 다시 제출하지 않는다`)
    cleanup()
  }
})

import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-29c: 실제 PasswordResetPage.jsx·LoginOptions.jsx·auth.api.js·client.js·response.js를
// jsdom에 마운트해 요청→링크→새 비밀번호 흐름을 검증한다. FindIdPage.ui.test.js와 달리 HTTP
// 경계를 auth.api.js가 아니라 env.js(API_BASE_URL)와 전역 fetch에서 갈아끼운다 — 그래서 실제
// auth.api.js가 만드는 경로·메서드·body와 client.js/response.js의 오류 변환까지 실제 코드로
// 돈다.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
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

register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// HTTP 경계는 fetch 하나만 갈아끼운다 — 입력 검증·상태 전이·요청 취소·toApiError 변환은
// 전부 실제 코드가 돈다. API_BASE_URL을 빈 문자열로 대체해 endpoint 자체가 최종 URL이 되게
// 한다(assert가 간단해진다).
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

installDomGlobal("fetch", (url, options) => {
  fetchCalls.push({ url, options })
  return fetchHandler(url, options)
})

mock.module("../../../../shared/env.js", {
  namedExports: {
    API_BASE_URL: "",
  },
})

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, Link } = await import("react-router-dom")
const { PasswordResetRequestPage, PasswordResetPage } = await import("../PasswordResetPage.jsx")
const { default: LoginOptions } = await import("../../components/LoginForm/LoginOptions.jsx")

test.beforeEach(() => {
  fetchCalls = []
  fetchHandler = async () => { throw new Error("fetchHandler not set by test") }
})
test.afterEach(() => cleanup())

const LOGIN_STUB_TEXT = "LOGIN_STUB"
const VALID_TOKEN = "sample-token-1234567890abcdefghijklmno"

async function mountRequestPageStrict() {
  let view
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/password-reset/request"] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) }),
            React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
          ),
        ),
      ),
    )
  })
  return view
}

async function mountResetPageStrict(token) {
  const path = token === undefined ? "/password-reset" : `/password-reset?token=${token}`
  let view
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "/password-reset", element: React.createElement(PasswordResetPage) }),
            React.createElement(Route, { path: "/password-reset/request", element: React.createElement("div", null, "REQUEST_STUB") }),
            React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
          ),
        ),
      ),
    )
  })
  return view
}

// VALID로 검증을 먼저 통과시켜 ready(새 비밀번호 입력) 화면까지 진행시킨다. 호출 기록은
// 검증 호출을 비운 뒤 반환한다.
async function mountReadyResetPage(token = VALID_TOKEN) {
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  const view = await mountResetPageStrict(token)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  fetchCalls = []
  return view
}

// 같은 화면에서 토큰 A ↔ B를 오갈 수 있는 하네스. "A로 들어갔다가 B를 거쳐 다시 A로"처럼
// 토큰이 같은 문자열로 되돌아오는 재진입을 실제 라우팅으로 재현한다.
function TokenSwitchHarness({ tokenA, tokenB }) {
  return React.createElement(
    MemoryRouter,
    { initialEntries: [`/password-reset?token=${tokenA}`] },
    React.createElement(
      Routes,
      null,
      React.createElement(Route, {
        path: "/password-reset",
        element: React.createElement(
          "div",
          null,
          React.createElement(Link, { to: `/password-reset?token=${tokenA}` }, "SWITCH_TO_A"),
          React.createElement(Link, { to: `/password-reset?token=${tokenB}` }, "SWITCH_TO_B"),
          React.createElement(PasswordResetPage),
        ),
      }),
      React.createElement(Route, { path: "/password-reset/request", element: React.createElement("div", null, "REQUEST_STUB") }),
      React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
    ),
  )
}

async function mountTokenSwitchHarness(tokenA, tokenB) {
  let view
  await act(async () => {
    view = render(React.createElement(React.StrictMode, null, React.createElement(TokenSwitchHarness, { tokenA, tokenB })))
  })
  return view
}

const fillEmail = (view, value) => {
  fireEvent.change(view.container.querySelector('input[name="email"]'), { target: { value } })
}

const fillPasswords = (view, password, passwordConfirm) => {
  fireEvent.change(view.container.querySelector('input[name="password"]'), { target: { value: password } })
  fireEvent.change(view.container.querySelector('input[name="passwordConfirm"]'), { target: { value: passwordConfirm } })
}

const submitForm = (view) => {
  fireEvent.submit(view.container.querySelector("form"))
}

// ── AC-01/AC-07: LoginOptions → 요청 화면 진입 ────────────────────────────────

test("LoginOptions는 /password-reset/request로 가는 비밀번호 찾기 링크를 렌더링한다", async () => {
  let view
  await act(async () => {
    view = render(
      React.createElement(MemoryRouter, null, React.createElement(LoginOptions, { rememberMe: false, onRememberMeChange: () => {} })),
    )
  })
  const link = view.getByText("비밀번호 찾기")
  assert.equal(link.tagName, "A")
  assert.equal(link.getAttribute("href"), "/password-reset/request")
  cleanup()
})

// ── AC-01: 등록·미등록 이메일 모두 같은 완료 안내 ─────────────────────────────────

test("AC-01: 등록된 이메일과 미등록 이메일 모두 같은 완료 안내를 보여주고, 실제 POST 경로와 body를 사용한다", async () => {
  fetchHandler = async () => jsonResponse(200, { ok: true })

  const view1 = await mountRequestPageStrict()
  fillEmail(view1, "exists@example.com")
  await act(async () => { submitForm(view1) })
  await waitFor(() => assert.ok(view1.container.querySelector('[role="status"]')))
  const message1 = view1.container.querySelector('[role="status"]').textContent
  cleanup()

  fetchCalls = []
  const view2 = await mountRequestPageStrict()
  fillEmail(view2, "missing@example.com")
  await act(async () => { submitForm(view2) })
  await waitFor(() => assert.ok(view2.container.querySelector('[role="status"]')))
  const message2 = view2.container.querySelector('[role="status"]').textContent

  assert.equal(message1, message2)
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, "/auth/password-reset/request")
  assert.equal(fetchCalls[0].options.method, "POST")
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { email: "missing@example.com" })
})

test("AC-01: 완료 안내는 실제 발송이나 계정 존재를 단정하지 않는다", async () => {
  fetchHandler = async () => jsonResponse(200, { ok: true })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.ok(view.container.querySelector('[role="status"]')))

  const message = view.container.querySelector('[role="status"]').textContent
  // 서버가 답한 것은 {ok:true}(접수)뿐이다 — 계정 없음·소셜 전용·발송 실패도 같은 응답이다.
  assert.equal(/보내드렸|발송했|전송했|전송이 완료/.test(message), false, `발송을 단정하는 문구가 있습니다: ${message}`)
  assert.ok(message.includes("가입된 계정이 있다면"), "계정 존재를 전제하지 않는 조건부 안내여야 합니다")
})

test("AC-01: 계약 밖 200 본문(ok:'true')은 완료로 처리하지 않고 입력을 보존한 채 재시도 안내를 보여준다", async () => {
  // truthy 비교였다면 문자열 'true'도 완료로 통과했다 — 서버가 무엇을 했는지 모르는 채
  // "접수됐다"고 말하면 안 된다.
  fetchHandler = async () => jsonResponse(200, { ok: "true" })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(view.container.querySelector('[role="status"]'), null, "예상 밖 본문을 완료 안내로 바꾸면 안 됩니다")
  assert.equal(view.container.querySelector('input[name="email"]').value, "user@example.com")
  assert.ok(view.getByText("다시 입력"))
  assert.equal(fetchCalls.length, 1, "자동 재시도가 있으면 안 됩니다")
})

test("지연 응답 중 연속 제출해도 요청은 한 번만 나간다", async () => {
  let resolveRequest
  fetchHandler = () => new Promise((resolve) => { resolveRequest = resolve })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 1, "지연 응답 중 재제출은 추가 호출을 만들면 안 됩니다")

  await act(async () => { resolveRequest(jsonResponse(200, { ok: true })) })
  await waitFor(() => assert.ok(view.container.querySelector('[role="status"]')))
})

test("로컬 이메일 검증이 형식 오류를 막고 API를 호출하지 않는다", async () => {
  const view = await mountRequestPageStrict()
  const cases = [
    "",
    `${"a".repeat(95)}@example.com`,
    "a b@example.com",
    "@example.com",
    "user@",
    "user@example",
    "user@.com",
    "user@example.",
  ]
  for (const value of cases) {
    fetchCalls = []
    fillEmail(view, value)
    await act(async () => { submitForm(view) })
    assert.equal(fetchCalls.length, 0, `"${value}"는 호출을 만들면 안 됩니다`)
  }
})

// ── AC-02: rate limit / 통신 실패 / 재시도 ─────────────────────────────────────

test("AC-02: 429 응답은 제한 안내를 보여주고 자동으로 재시도하지 않는다", async () => {
  fetchHandler = async () => jsonResponse(429, {})
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("너무 많은 요청입니다")))
  assert.equal(fetchCalls.length, 1)
})

test("AC-02: 통신 실패(네트워크 오류)는 통신 실패 안내를 보여주고, 재시도 후 재제출하면 다시 호출된다", async () => {
  let attempt = 0
  fetchHandler = async () => {
    attempt += 1
    if (attempt === 1) throw new TypeError("Failed to fetch")
    return jsonResponse(200, { ok: true })
  }
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(fetchCalls.length, 1, "실패 화면 진입 자체가 추가 호출을 만들면 안 됩니다")

  await act(async () => { fireEvent.click(view.getByText("다시 입력")) })
  assert.equal(fetchCalls.length, 1, "'다시 입력' 클릭 자체는 idle로 돌아갈 뿐 곧바로 재호출하지 않습니다")
  assert.equal(view.container.querySelector('input[name="email"]').value, "user@example.com", "입력값은 보존됩니다")

  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 2, "사용자가 다시 제출하면 호출 수가 늘어야 합니다")
  await waitFor(() => assert.ok(view.container.querySelector('[role="status"]')))
})

test("AC-02: 5xx 응답도 통신 실패 화면으로 처리된다", async () => {
  fetchHandler = async () => jsonResponse(500, { ok: false, code: "SERVER_ERROR" })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
})

test("AC-02: 서버가 400을 돌려주면 idle로 돌아가 입력 확인 안내를 보여준다(입력값은 보존)", async () => {
  fetchHandler = async () => jsonResponse(400, { ok: false, code: "INVALID_INPUT" })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("입력하신 이메일을 다시 확인해주세요.")))
  assert.equal(view.container.querySelector('input[name="email"]').value, "user@example.com")
  assert.ok(view.container.querySelector('button[type="submit"]'), "idle로 돌아왔으므로 제출 버튼이 다시 보입니다")
})

test("AC-02: sent 화면의 '다시 보내기'는 같은 이메일로 정확히 한 번 더 요청한다", async () => {
  fetchHandler = async () => jsonResponse(200, { ok: true })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.ok(view.container.querySelector('[role="status"]')))
  assert.equal(fetchCalls.length, 1)

  await act(async () => { fireEvent.click(view.getByText("다시 보내기")) })
  await waitFor(() => assert.equal(fetchCalls.length, 2))
  assert.deepEqual(JSON.parse(fetchCalls[1].options.body), { email: "user@example.com" })
})

test("요청 중 뒤로 간 뒤 응답이 도착해도 이미 떠난 화면은 되돌아오지 않는다", async () => {
  let resolveRequest
  fetchHandler = () => new Promise((resolve) => { resolveRequest = resolve })
  const view = await mountRequestPageStrict()
  fillEmail(view, "user@example.com")
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 1)

  await act(async () => { fireEvent.click(view.getByRole("button", { name: "뒤로 가기" })) })
  await waitFor(() => assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT)))

  await act(async () => { resolveRequest(jsonResponse(200, { ok: true })) })
  assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT), "뒤로 간 화면이 다시 요청 화면으로 돌아오면 안 됩니다")
})

// ── AC-03: 링크 검증 4가지 상태, 비소비 GET ───────────────────────────────────

test("AC-03: VALID 토큰은 ready 화면(새 비밀번호 입력)을 보여주고, StrictMode 이중 effect에도 GET verify는 한 번만 호출된다", async () => {
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  const view = await mountResetPageStrict(VALID_TOKEN)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].options.method, "GET")
  assert.equal(fetchCalls[0].options.body, undefined, "verify는 body를 보내면 안 됩니다")
  assert.equal(fetchCalls[0].url, `/auth/password-reset/verify?token=${encodeURIComponent(VALID_TOKEN)}`)
})

// AC-03(재검토 대응): EXPIRED·USED·INVALID는 화면 상태는 같은 linkInvalid여도 사유별로
// 다른 안내 문구를 보여줘야 한다 — 세 안내 문구가 서로 달라야 하고, 그중 어떤 것도 다른
// 코드에 잘못 표시되면 안 된다.
const LINK_INVALID_MESSAGE_BY_CODE = {
  EXPIRED: "링크가 만료됐어요",
  USED: "이미 사용된 링크예요",
  INVALID: "유효하지 않은 링크예요",
}

for (const code of ["EXPIRED", "USED", "INVALID"]) {
  test(`AC-03: 검증 응답 ${code}는 사유에 맞는 안내를 보여주고 confirm은 호출하지 않는다`, async () => {
    fetchHandler = async () => jsonResponse(200, { ok: false, code })
    const view = await mountResetPageStrict(VALID_TOKEN)
    await waitFor(() => assert.ok(view.container.textContent.includes(LINK_INVALID_MESSAGE_BY_CODE[code])))

    for (const [otherCode, otherMessage] of Object.entries(LINK_INVALID_MESSAGE_BY_CODE)) {
      if (otherCode === code) continue
      assert.equal(view.container.textContent.includes(otherMessage), false, `${code} 화면에 ${otherCode}의 문구가 섞이면 안 됩니다`)
    }

    assert.equal(fetchCalls.length, 1)
    assert.equal(view.container.querySelector('input[name="password"]'), null)
  })
}

test("AC-03: 토큰이 없는 링크는 호출 없이 무효 화면(INVALID 사유)을 보여준다", async () => {
  const view = await mountResetPageStrict(undefined)
  await waitFor(() => assert.ok(view.container.textContent.includes(LINK_INVALID_MESSAGE_BY_CODE.INVALID)))
  assert.equal(fetchCalls.length, 0)
})

test("AC-03: 검증 응답 본문이 예상 밖 형태(ok도 code도 알아볼 수 없음)면 무효로 단정하지 않고 재시도 가능한 통신 실패로 처리한다", async () => {
  fetchHandler = async () => jsonResponse(200, { unexpected: "shape" })
  const view = await mountResetPageStrict(VALID_TOKEN)

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.ok(view.getByText("다시 확인"), "통신 오류와 같은 재검증 버튼을 제공해야 합니다")
  for (const message of Object.values(LINK_INVALID_MESSAGE_BY_CODE)) {
    assert.equal(view.container.textContent.includes(message), false, "예상 밖 본문을 무효 링크로 단정하면 안 됩니다")
  }
  assert.equal(fetchCalls.length, 1)

  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  await act(async () => { fireEvent.click(view.getByText("다시 확인")) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  assert.equal(fetchCalls.length, 2)
})

test("AC-03: 토큰에 특수문자가 있으면 encodeURIComponent로 인코딩해 전달한다", async () => {
  const specialToken = "a b+c/d=e"
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  await mountResetPageStrict(encodeURIComponent(specialToken))

  await waitFor(() => assert.equal(fetchCalls.length, 1))
  assert.equal(fetchCalls[0].url, `/auth/password-reset/verify?token=${encodeURIComponent(specialToken)}`)
})

test("AC-03: 검증 통신 오류는 재검증 버튼을 제공하고, 클릭했을 때만 새로 호출한다", async () => {
  let attempt = 0
  fetchHandler = async () => {
    attempt += 1
    if (attempt === 1) throw new TypeError("Failed to fetch")
    return jsonResponse(200, { ok: true, status: "VALID" })
  }
  const view = await mountResetPageStrict(VALID_TOKEN)
  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(fetchCalls.length, 1)

  await act(async () => { fireEvent.click(view.getByText("다시 확인")) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  assert.equal(fetchCalls.length, 2)
})

test("AC-03: 토큰이 바뀌면 이전 토큰의 늦은 verify 응답이 새 토큰 화면을 바꾸지 않는다", async () => {
  const tokenA = "token-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const tokenB = "token-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  let resolveA
  fetchHandler = (url) => {
    if (url.includes(encodeURIComponent(tokenA))) {
      return new Promise((resolve) => { resolveA = resolve })
    }
    return Promise.resolve(jsonResponse(200, { ok: false, code: "EXPIRED" }))
  }

  function TokenSwitchHarness() {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [`/password-reset?token=${tokenA}`] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/password-reset",
          element: React.createElement(
            "div",
            null,
            React.createElement(Link, { to: `/password-reset?token=${tokenB}` }, "SWITCH_TOKEN"),
            React.createElement(PasswordResetPage),
          ),
        }),
        React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
      ),
    )
  }

  let view
  await act(async () => {
    view = render(React.createElement(React.StrictMode, null, React.createElement(TokenSwitchHarness)))
  })

  await waitFor(() => assert.equal(fetchCalls.length, 1))
  await act(async () => { fireEvent.click(view.getByText("SWITCH_TOKEN")) })
  await waitFor(() => assert.ok(view.container.textContent.includes("링크가 만료됐어요")))

  await act(async () => { resolveA(jsonResponse(200, { ok: true, status: "VALID" })) })
  assert.ok(
    view.container.textContent.includes("링크가 만료됐어요"),
    "A의 늦은 응답이 B 화면(무효)을 덮어쓰면 안 됩니다",
  )
  assert.equal(view.container.querySelector('input[name="password"]'), null)
})

test("AC-03: verify가 429면 링크 무효가 아니라 제한 안내를 보여주고 자동으로 재호출하지 않는다", async () => {
  fetchHandler = async () => jsonResponse(429, { ok: false, code: "RATE_LIMITED" })
  const view = await mountResetPageStrict(VALID_TOKEN)

  await waitFor(() => assert.ok(view.container.textContent.includes("확인 요청이 너무 많습니다")))
  for (const message of Object.values(LINK_INVALID_MESSAGE_BY_CODE)) {
    assert.equal(view.container.textContent.includes(message), false, "제한을 링크 무효로 단정하면 안 됩니다")
  }
  assert.equal(fetchCalls.length, 1, "429 이후 자동 재시도가 있으면 안 됩니다")

  // 사용자가 직접 눌렀을 때만 다시 확인한다.
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  await act(async () => { fireEvent.click(view.getByText("다시 확인")) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  assert.equal(fetchCalls.length, 2)
})

test("AC-03: 같은 토큰이라도 다른 화면을 거쳐 다시 들어오면 서버 상태를 새로 조회한다", async () => {
  const tokenA = "revisit-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const tokenB = "revisit-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  let verifyCount = 0
  fetchHandler = async (url) => {
    verifyCount += 1
    // A는 처음엔 유효하지만, B를 거쳐 돌아온 두 번째 방문에서는 이미 사용된 상태다.
    if (url.includes(tokenA)) {
      return verifyCount === 1
        ? jsonResponse(200, { ok: true, status: "VALID" })
        : jsonResponse(200, { ok: false, code: "USED" })
    }
    return jsonResponse(200, { ok: true, status: "VALID" })
  }

  const view = await mountTokenSwitchHarness(tokenA, tokenB)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  assert.equal(fetchCalls.length, 1, "한 방문의 StrictMode 이중 effect는 GET 하나로 합쳐야 합니다")

  await act(async () => { fireEvent.click(view.getByText("SWITCH_TO_B")) })
  await waitFor(() => assert.equal(fetchCalls.length, 2))

  await act(async () => { fireEvent.click(view.getByText("SWITCH_TO_A")) })
  await waitFor(() => assert.ok(view.container.textContent.includes("이미 사용된 링크예요")))
  assert.equal(fetchCalls.length, 3, "같은 토큰이라도 새 방문은 캐시된 옛 결과를 재사용하면 안 됩니다")
})

// ── AC-04: 새 비밀번호 8~64자, 확인 일치 ───────────────────────────────────────

test("AC-04: 7자 비밀번호는 제출이 막히고 confirm을 호출하지 않는다", async () => {
  const view = await mountReadyResetPage()
  fillPasswords(view, "abcdefg", "abcdefg")
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 0)
  assert.ok(view.container.textContent.includes("8~64자"))
})

test("AC-04: 65자 비밀번호는 제출이 막히고 confirm을 호출하지 않는다", async () => {
  const view = await mountReadyResetPage()
  const tooLong = "a".repeat(65)
  fillPasswords(view, tooLong, tooLong)
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 0)
  assert.ok(view.container.textContent.includes("8~64자"))
})

test("AC-04: 한글 25자(75바이트)는 72바이트 상한에 걸려 confirm을 호출하지 않는다", async () => {
  const view = await mountReadyResetPage()
  const overBytes = "가".repeat(25)
  fillPasswords(view, overBytes, overBytes)
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 0)
  assert.ok(view.container.textContent.includes("72바이트"))
})

test("AC-04: 확인 값이 다르면 제출이 막히고 confirm을 호출하지 않는다", async () => {
  const view = await mountReadyResetPage()
  fillPasswords(view, "abcdefgh", "different")
  await act(async () => { submitForm(view) })
  assert.equal(fetchCalls.length, 0)
  assert.ok(view.container.textContent.includes("일치하지 않습니다"))
})

test("AC-04: ASCII 8자·64자·한글 24자(72바이트)는 확인 값이 같으면 confirm을 한 번 호출하고 payload에는 token·newPassword만 있다", async () => {
  const cases = [
    { password: "abcdefgh", label: "ASCII 8자" },
    { password: "a".repeat(64), label: "ASCII 64자" },
    { password: "가".repeat(24), label: "한글 24자(72바이트)" },
  ]
  for (const { password, label } of cases) {
    const view = await mountReadyResetPage()
    fetchHandler = async () => jsonResponse(200, { ok: true })
    fillPasswords(view, password, password)
    await act(async () => { submitForm(view) })
    await waitFor(() => assert.equal(fetchCalls.length, 1), { timeout: 1000 })
    assert.equal(fetchCalls[0].url, "/auth/password-reset/confirm", label)
    assert.equal(fetchCalls[0].options.method, "POST", label)
    const body = JSON.parse(fetchCalls[0].options.body)
    assert.deepEqual(Object.keys(body).sort(), ["newPassword", "token"], label)
    assert.equal(body.newPassword, password, label)
    cleanup()
  }
})

test("AC-04: 비밀번호를 trim하지 않는다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(200, { ok: true })
  const password = " abcdef "
  fillPasswords(view, password, password)
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.equal(fetchCalls.length, 1))
  const body = JSON.parse(fetchCalls[0].options.body)
  assert.equal(body.newPassword, password)
})

test("ready 상태 이전(verifying)에는 제출해도 confirm이 호출되지 않는다", async () => {
  let resolveVerify
  fetchHandler = () => new Promise((resolve) => { resolveVerify = resolve })
  const view = await mountResetPageStrict(VALID_TOKEN)
  assert.equal(view.container.querySelector('input[name="password"]'), null, "verifying 중에는 입력 폼 자체가 없습니다")
  await act(async () => { resolveVerify(jsonResponse(200, { ok: true, status: "VALID" })) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
})

// ── AC-05: confirm 성공 → 완료 안내 → 로그인 이동(replace) ─────────────────────

test("AC-05: 응답 전에는 완료 안내가 없고, 제출 중에는 입력이 잠긴다", async () => {
  const view = await mountReadyResetPage()
  let resolveConfirm
  fetchHandler = () => new Promise((resolve) => { resolveConfirm = resolve })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  assert.equal(view.container.querySelector('[role="status"]'), null)
  // fieldset의 disabled는 자손 input의 상호작용을 막지만(스펙상 "실질적으로 비활성"), input
  // 자신의 disabled IDL 속성은 그대로 반영하지 않는다 — fieldset 쪽을 확인한다.
  assert.equal(view.container.querySelector("fieldset").disabled, true)

  await act(async () => { resolveConfirm(jsonResponse(200, { ok: true })) })
  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호가 재설정되었어요")))
  assert.equal(view.container.querySelector('input[name="password"]'), null, "성공하면 입력 필드는 사라집니다")
})

test("AC-05: confirm 성공 시 완료 안내 후 로그인 이동 버튼을 누르면 /login으로 replace 이동한다(뒤로 가도 재설정 화면으로 돌아오지 않는다)", async () => {
  const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })

  const router = createMemoryRouter(
    [
      { path: "/start", element: React.createElement("div", null, "START_STUB") },
      { path: "/password-reset", element: React.createElement(PasswordResetPage) },
      { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) },
    ],
    { initialEntries: ["/start", `/password-reset?token=${VALID_TOKEN}`], initialIndex: 1 },
  )

  let view
  await act(async () => {
    view = render(React.createElement(React.StrictMode, null, React.createElement(RouterProvider, { router })))
  })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  fetchHandler = async () => jsonResponse(200, { ok: true })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호가 재설정되었어요")))

  await act(async () => { fireEvent.click(view.getByText("로그인으로 이동")) })
  await waitFor(() => assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT)))

  // replace 이동이었다면 히스토리 길이가 늘지 않아, 뒤로 가면 /password-reset이 아니라
  // /start로 돌아간다(push였다면 /password-reset으로 돌아갔을 것이다).
  await act(async () => { router.navigate(-1) })
  await waitFor(() => assert.ok(view.container.textContent.includes("START_STUB")))
})

test("AC-05: 서버가 INVALID_PASSWORD를 반환하면 ready로 남아 안내를 보여주고 입력을 보존한다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(400, { ok: false, code: "INVALID_PASSWORD", message: "비밀번호 조건을 다시 확인해주세요." })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호 조건을 다시 확인해주세요.")))
  assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh")
})

test("AC-05: confirm이 토큰 오류(EXPIRED)를 반환하면 사유에 맞는 링크 무효 화면으로 전이한다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(400, { ok: false, code: "EXPIRED" })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("링크가 만료됐어요")))
})

test("AC-05: confirm 응답이 200이지만 ok:true가 아니면 완료로 처리하지 않고 ready에서 재시도 안내를 보여준다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(200, { unexpected: "shape" })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false, "예상 밖 본문을 완료로 처리하면 안 됩니다")
  assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh", "입력은 보존되어야 합니다")
  assert.ok(view.container.querySelector('button[type="submit"]'), "ready로 돌아와 다시 제출할 수 있어야 합니다")
})

test("AC-05: confirm 통신 실패·429는 입력을 보존한 채 ready에서 재시도 안내를 보여준다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => { throw new TypeError("Failed to fetch") }
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh")
  assert.ok(view.container.querySelector('button[type="submit"]'))
})

test("AC-05: confirm이 429면 입력을 보존한 채 제한 안내를 보여주고 자동으로 다시 제출하지 않는다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(429, { ok: false, code: "RATE_LIMITED" })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("요청이 너무 많습니다")))
  assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false)
  assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh")
  assert.equal(fetchCalls.length, 1, "429 이후 자동 재시도가 있으면 안 됩니다")
})

test("AC-05: 400이 아닌 응답에 실려 온 토큰 코드는 링크 무효로 단정하지 않는다", async () => {
  // 서버는 EXPIRED/USED/INVALID/SOCIAL_ONLY를 400으로만 내보낸다 — 5xx 본문에 우연히 같은
  // 문자열이 섞여 와도 "링크가 만료됐다"는 사실 주장으로 바꾸면 안 된다.
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(500, { ok: false, code: "EXPIRED" })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(view.container.textContent.includes("링크가 만료됐어요"), false)
  assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh")
})

// 서버 계약은 400 {ok:false, code} 하나뿐이다 — 상태만 400이면서 본문이 그 계약을 따르지
// 않는 응답(ok:true이거나 ok가 아예 없는)은 "링크가 만료됐다"는 사실 주장으로 바꾸면 안 된다.
for (const [label, body] of [
  ["ok:true", { ok: true, code: "EXPIRED" }],
  ["ok 없음", { code: "EXPIRED" }],
]) {
  test(`AC-05: 400이지만 본문이 ${label}이면 링크 무효로 확정하지 않고 입력을 보존한 채 재시도 안내를 보여준다`, async () => {
    const view = await mountReadyResetPage()
    fetchHandler = async () => jsonResponse(400, body)
    fillPasswords(view, "abcdefgh", "abcdefgh")
    await act(async () => { submitForm(view) })

    await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
    for (const message of Object.values(LINK_INVALID_MESSAGE_BY_CODE)) {
      assert.equal(view.container.textContent.includes(message), false, `${label} 본문을 ${message}로 단정하면 안 됩니다`)
    }
    assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false)
    assert.equal(view.container.querySelector('input[name="password"]').value, "abcdefgh", "입력은 보존되어야 합니다")
    assert.ok(view.container.querySelector('button[type="submit"]'), "다시 제출할 수 있어야 합니다")
    assert.equal(fetchCalls.length, 1, "자동 재시도가 있으면 안 됩니다")
  })
}

test("AC-03: verify도 같은 규칙이다 — 400이지만 ok:false가 아닌 본문은 링크 무효로 확정하지 않는다", async () => {
  fetchHandler = async () => jsonResponse(400, { ok: true, code: "EXPIRED" })
  const view = await mountResetPageStrict(VALID_TOKEN)

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  for (const message of Object.values(LINK_INVALID_MESSAGE_BY_CODE)) {
    assert.equal(view.container.textContent.includes(message), false, "계약 밖 본문을 링크 무효로 단정하면 안 됩니다")
  }
  assert.ok(view.getByText("다시 확인"), "재시도 가능한 상태여야 합니다")
  assert.equal(fetchCalls.length, 1)
})

test("AC-05: A에서 제출한 뒤 B를 거쳐 A로 다시 들어와 새로 제출하면, 먼저 보낸 요청의 늦은 성공 응답이 새 화면을 덮어쓰지 않는다", async () => {
  const tokenA = "late-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const tokenB = "late-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const confirmResolvers = []
  fetchHandler = (url) => {
    if (url.startsWith("/auth/password-reset/verify")) {
      return Promise.resolve(jsonResponse(200, { ok: true, status: "VALID" }))
    }
    return new Promise((resolve) => { confirmResolvers.push(resolve) })
  }

  const view = await mountTokenSwitchHarness(tokenA, tokenB)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  // (1) A에서 첫 제출 — 응답은 아직 오지 않는다.
  fillPasswords(view, "first-pw-1", "first-pw-1")
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.equal(confirmResolvers.length, 1))

  // (2) B로 갔다가 다시 A로 돌아온다(같은 토큰 문자열의 새 방문).
  await act(async () => { fireEvent.click(view.getByText("SWITCH_TO_B")) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  await act(async () => { fireEvent.click(view.getByText("SWITCH_TO_A")) })
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))
  assert.equal(view.container.querySelector('input[name="password"]').value, "", "새 방문은 이전 입력을 물려받지 않습니다")

  // (3) 새 방문에서 다시 제출한다 — 이 요청도 아직 응답이 없다.
  fillPasswords(view, "second-pw-2", "second-pw-2")
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.equal(confirmResolvers.length, 2))
  assert.equal(view.container.querySelector("fieldset").disabled, true)

  // (4) 이제서야 첫 요청의 성공 응답이 도착한다 — 토큰 문자열만 비교했다면 이 응답이 지금
  // 화면을 완료로 바꿔 버렸다.
  await act(async () => { confirmResolvers[0](jsonResponse(200, { ok: true })) })
  assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false, "옛 요청의 응답이 새 방문의 화면을 완료로 바꾸면 안 됩니다")
  assert.equal(view.container.querySelector('input[name="password"]').value, "second-pw-2", "새 입력이 지워지면 안 됩니다")
  assert.equal(view.container.querySelector("fieldset").disabled, true, "옛 응답이 진행 중인 제출의 잠금을 풀면 안 됩니다")

  // (5) 새 요청의 응답이 도착해야 완료로 간다.
  await act(async () => { confirmResolvers[1](jsonResponse(200, { ok: true })) })
  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호가 재설정되었어요")))
})

test("제출 후 언마운트되면 늦은 confirm 응답이 상태를 바꾸려 하지 않는다", async () => {
  const view = await mountReadyResetPage()
  let resolveConfirm
  fetchHandler = () => new Promise((resolve) => { resolveConfirm = resolve })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })
  cleanup()

  await act(async () => { resolveConfirm(jsonResponse(200, { ok: true })) })
})

// ── AC-06: 소셜 전용 계정 안내 ────────────────────────────────────────────────

test("AC-06: confirm이 SOCIAL_ONLY를 반환하면 완료 안내 대신 소셜 전용 계정 안내를 보여주고 로그인 이동이 가능하다", async () => {
  const view = await mountReadyResetPage()
  fetchHandler = async () => jsonResponse(400, { ok: false, code: "SOCIAL_ONLY" })
  fillPasswords(view, "abcdefgh", "abcdefgh")
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("소셜 로그인으로 가입한 계정")))
  assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false)

  await act(async () => { fireEvent.click(view.getByText("로그인으로 이동")) })
  await waitFor(() => assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT)))
})

// ── AC-07: 실제 공개 라우트 배선 ──────────────────────────────────────────────

test("app/routes/index.jsx는 /password-reset/request와 /password-reset을 ProtectedRoute 밖(비로그인 접근 가능)에 정적으로 등록한다", async () => {
  const source = await readFile(new URL("../../../../app/routes/index.jsx", import.meta.url), "utf8")

  assert.match(source, /import \{\s*PasswordResetRequestPage,\s*PasswordResetPage\s*\}\s*from ["']@\/domains\/auth\/pages\/PasswordResetPage["']/)

  const protectedBlockMatch = source.match(/element:\s*<ProtectedRoute\s*\/>[\s\S]*?\]/)
  assert.ok(protectedBlockMatch, "ProtectedRoute children 블록을 찾을 수 없습니다")
  assert.equal(protectedBlockMatch[0].includes("/password-reset"), false, "/password-reset 경로는 ProtectedRoute children 안에 있으면 안 됩니다")

  assert.match(source, /\{\s*path:\s*"\/password-reset\/request",\s*element:\s*<PasswordResetRequestPage\s*\/>\s*\}/)
  assert.match(source, /\{\s*path:\s*"\/password-reset",\s*element:\s*<PasswordResetPage\s*\/>\s*\}/)
})

// ── AC-07(A-05): 배경음은 허용 음원만·영상 무음 유지 ───────────────────────────
// 2026-09-22 운영자 AUDIO-01 완화: 라이선스가 확인된 배경음(bgmAssets.js의 BGM_LICENSES에 기록)만
// <audio>로 실린다. 배경 영상은 계속 muted다. (실패 메시지에 DOM 요소를 넣으면 node:test의 diff가
// jsdom 요소를 직렬화하다 메모리를 다 쓰므로 요소 대신 문자열/불리언만 단언한다.)

test("AC-07: 두 페이지의 배경음은 라이선스 기록이 있는 음원 하나뿐이고 배경 영상은 muted다", async () => {
  fetchHandler = async () => jsonResponse(200, { ok: true, status: "VALID" })
  const { BGM_ASSETS, BGM_LICENSES, MUSIC_PLAYBACK_ENABLED } = await import("../../../../shared/constants/bgmAssets.js")
  assert.equal(MUSIC_PLAYBACK_ENABLED, true)

  const checkMedia = (container) => {
    const audios = container.querySelectorAll("audio")
    assert.equal(audios.length, 0, "인증 화면은 App 공통 BGM을 쓰므로 페이지 안에 audio가 없어야 한다")
    assert.ok(BGM_LICENSES[BGM_ASSETS.loginMusic], "배경음은 출처·라이선스 기록이 있어야 한다")
    const video = container.querySelector("video")
    assert.equal(video !== null, true, "배경 영상이 없다")
    assert.equal(video.muted, true)
  }

  const requestView = await mountRequestPageStrict()
  checkMedia(requestView.container)
  cleanup()

  const resetView = await mountResetPageStrict(VALID_TOKEN)
  await waitFor(() => assert.ok(resetView.container.querySelector('input[name="password"]')))
  checkMedia(resetView.container)
})

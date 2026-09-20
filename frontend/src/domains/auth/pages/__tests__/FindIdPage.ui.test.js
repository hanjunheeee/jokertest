import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-29a AC-07: 실제 FindIdPage.jsx·LoginOptions.jsx를 jsdom에 마운트해 정상/불일치/제한/
// 통신 실패/재시도/뒤로 가기 상태 화면을 검증한다. roleStatistics.ui.test.js가 F-18에서
// 연 길과 같은 길이다 — testSupport/jsxNodeLoaderHooks.mjs가 "@" 별칭과 JSX를 실제로
// 변환해 주므로, 소스 텍스트 배선 검사 대신 실제 컴포넌트를 마운트해 확인할 수 있다.
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

// HTTP 경계(findIdApi)만 갈아끼운다 — 입력 검증·상태 전이·조회 취소는 전부 실제
// FindIdPage.jsx 코드가 돈다.
let findIdHandler = async () => { throw new Error("findIdHandler not set by test") }
let calls = []

mock.module("../../api/auth.api.js", {
  namedExports: {
    findIdApi: (...args) => { calls.push(args); return findIdHandler(...args) },
  },
})

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: FindIdPage } = await import("../FindIdPage.jsx")
const { default: LoginOptions } = await import("../../components/LoginForm/LoginOptions.jsx")

test.beforeEach(() => {
  calls = []
  findIdHandler = async () => { throw new Error("findIdHandler not set by test") }
})
test.afterEach(() => cleanup())

const LOGIN_STUB_TEXT = "LOGIN_STUB"

async function mountFindIdPage() {
  let view
  await act(async () => {
    view = render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/find-id"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/find-id", element: React.createElement(FindIdPage) }),
          React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
        ),
      ),
    )
  })
  return view
}

// F-29a AC-07 재검토 대응: main.jsx는 개발 빌드에서 React.StrictMode로 감싼다. StrictMode는
// effect를 마운트 → 정리 → 재마운트 순으로 두 번 돌려, cleanup에서만 unmountedRef를 true로
// 만들고 재마운트 시 되돌리지 않는 버그를 실사용 환경에서 재현한다(일반 mountFindIdPage는
// StrictMode가 없어 이 결함을 잡지 못했다).
async function mountFindIdPageStrict() {
  let view
  await act(async () => {
    view = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/find-id"] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: "/find-id", element: React.createElement(FindIdPage) }),
            React.createElement(Route, { path: "/login", element: React.createElement("div", null, LOGIN_STUB_TEXT) }),
          ),
        ),
      ),
    )
  })
  return view
}

const fillForm = (view, { nickname = "찾을닉네임", birthDate = "2000-01-15" } = {}) => {
  fireEvent.change(view.container.querySelector('input[name="nickname"]'), { target: { value: nickname } })
  fireEvent.change(view.container.querySelector('input[name="birthDate"]'), { target: { value: birthDate } })
}

const submitForm = (view) => {
  fireEvent.submit(view.container.querySelector("form"))
}

// ── AC-07: LoginOptions에서 아이디 찾기로 진입할 수 있다 ─────────────────────────

test("LoginOptions는 /find-id로 가는 아이디 찾기 링크를 렌더링한다", async () => {
  let view
  await act(async () => {
    view = render(
      React.createElement(MemoryRouter, null, React.createElement(LoginOptions, { rememberMe: false, onRememberMeChange: () => {} })),
    )
  })
  const link = view.getByText("아이디 찾기")
  assert.equal(link.tagName, "A")
  assert.equal(link.getAttribute("href"), "/find-id")
  cleanup()
})

// ── AC-07: 입력 오류(로컬 검증) ──────────────────────────────────────────────

test("형식이 잘못된 입력은 로컬에서 막히고 API를 호출하지 않는다", async () => {
  const view = await mountFindIdPage()
  fillForm(view, { nickname: "a", birthDate: "2000-01-15" })
  await act(async () => { submitForm(view) })

  assert.equal(calls.length, 0, "형식 오류는 서버에 요청을 보내면 안 됩니다")
  assert.ok(view.container.textContent.includes("닉네임을"))
})

// ── AC-07: 정상 조회 — 결과 표시, 입력 삭제, 중복 제출 방지 ──────────────────────

test("지연 응답 중 연속 제출해도 API는 한 번만 호출되고, 성공하면 힌트를 보여주며 입력을 지운다", async () => {
  let resolveFindId
  findIdHandler = () => new Promise((resolve) => { resolveFindId = resolve })

  const view = await mountFindIdPage()
  fillForm(view)

  await act(async () => { submitForm(view) })
  // 응답이 오기 전에 같은 폼을 다시 제출해도(더블 클릭 등) 무시되어야 한다.
  await act(async () => { submitForm(view) })
  assert.equal(calls.length, 1, "지연 응답 중 재제출은 추가 호출을 만들면 안 됩니다")

  await act(async () => { resolveFindId({ ok: true, maskedEmail: "a***c@e***.com" }) })

  await waitFor(() => assert.ok(view.container.textContent.includes("a***c@e***.com")))
  assert.equal(view.container.querySelector('input[name="nickname"]'), null, "성공하면 입력 화면 자체가 결과 화면으로 바뀝니다");
});

test("성공 응답을 받은 뒤 '다시 찾기'를 누르면 빈 입력 화면으로 돌아간다", async () => {
  findIdHandler = async () => ({ ok: true, maskedEmail: "a***c@e***.com" })
  const view = await mountFindIdPage()
  fillForm(view)
  await act(async () => { submitForm(view) })
  await waitFor(() => assert.ok(view.container.textContent.includes("a***c@e***.com")))

  await act(async () => { fireEvent.click(view.getByText("다시 찾기")) })

  await waitFor(() => assert.ok(view.container.querySelector('input[name="nickname"]')))
  assert.equal(view.container.querySelector('input[name="nickname"]').value, "")
});

// ── AC-02/AC-07: NOT_FOUND — 공통 문구, 값 보존 ──────────────────────────────

test("NOT_FOUND는 공통 안내 문구를 보여주고, 다시 입력을 누르면 값을 보존한 채 idle로 돌아간다", async () => {
  findIdHandler = async () => ({ ok: false, code: "NOT_FOUND" })
  const view = await mountFindIdPage()
  fillForm(view, { nickname: "안맞는닉", birthDate: "1990-01-01" })
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("입력한 정보와 일치하는 계정을 찾을 수 없습니다.")))

  await act(async () => { fireEvent.click(view.getByText("다시 입력")) })

  assert.equal(calls.length, 1, "다시 입력은 추가 API 호출을 만들면 안 됩니다")
  assert.equal(view.container.querySelector('input[name="nickname"]').value, "안맞는닉")
  assert.equal(view.container.querySelector('input[name="birthDate"]').value, "1990-01-01")
});

// ── AC-05/AC-07: 429(RATE_LIMITED) ───────────────────────────────────────────

test("429 응답은 제한 안내를 보여주고 자동으로 재시도하지 않는다", async () => {
  findIdHandler = async () => {
    const error = new Error("Too Many Requests")
    error.status = 429
    error.code = "RATE_LIMITED"
    throw error
  }
  const view = await mountFindIdPage()
  fillForm(view)
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("너무 많은 요청입니다")))
  assert.equal(calls.length, 1, "429 이후 자동 재시도가 있으면 안 됩니다")
});

// ── AC-07: 400(INVALID_INPUT, 서버 재검증 실패) ───────────────────────────────

test("서버가 400을 돌려주면 idle로 돌아가 입력 확인 안내를 보여준다(입력값은 보존)", async () => {
  findIdHandler = async () => {
    const error = new Error("Bad Request")
    error.status = 400
    error.code = "INVALID_INPUT"
    throw error
  }
  const view = await mountFindIdPage()
  fillForm(view, { nickname: "정상닉네임", birthDate: "2000-01-15" })
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("입력하신 정보를 다시 확인해주세요.")))
  assert.equal(view.container.querySelector('input[name="nickname"]').value, "정상닉네임", "400 이후에도 입력값은 보존되어야 합니다")
  // idle로 돌아왔으므로 제출 버튼이 다시 보인다(잠기지 않는다).
  assert.ok(view.container.querySelector('button[type="submit"]'))
});

// ── AC-07: 네트워크 오류/5xx — failed, 재시도 ─────────────────────────────────

test("네트워크 오류(응답 자체 없음)는 통신 실패 화면을 보여주고, 재시도 후 재제출하면 다시 호출된다", async () => {
  let attempt = 0
  findIdHandler = async () => {
    attempt += 1
    if (attempt === 1) throw new TypeError("Failed to fetch")
    return { ok: true, maskedEmail: "a***c@e***.com" }
  }
  const view = await mountFindIdPage()
  fillForm(view)
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
  assert.equal(calls.length, 1, "실패 화면 진입 자체가 추가 호출을 만들면 안 됩니다")

  await act(async () => { fireEvent.click(view.getByText("재시도")) })
  assert.equal(calls.length, 1, "'재시도' 버튼 클릭 자체는 idle로 돌아갈 뿐 곧바로 재호출하지 않습니다")

  await act(async () => { submitForm(view) })
  assert.equal(calls.length, 2, "사용자가 다시 제출하면 호출 수가 늘어야 합니다")
  await waitFor(() => assert.ok(view.container.textContent.includes("a***c@e***.com")))
});

test("5xx 응답도 통신 실패 화면으로 처리된다", async () => {
  findIdHandler = async () => {
    const error = new Error("Internal Server Error")
    error.status = 500
    error.code = "SERVER_ERROR"
    throw error
  }
  const view = await mountFindIdPage()
  fillForm(view)
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("서버와 통신할 수 없습니다")))
});

// ── AC-07: 요청 중 뒤로 가기 후 늦은 응답이 화면을 되돌리지 않는다 ────────────────

test("요청 중 뒤로 간 뒤 응답이 도착해도 이미 떠난 화면은 되돌아오지 않는다", async () => {
  let resolveFindId
  findIdHandler = () => new Promise((resolve) => { resolveFindId = resolve })

  const view = await mountFindIdPage()
  fillForm(view)
  await act(async () => { submitForm(view) })
  assert.equal(calls.length, 1)

  await act(async () => { fireEvent.click(view.getByText("뒤로 가기")) })
  await waitFor(() => assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT)))

  // 화면을 떠난 뒤에야 지연된 응답이 도착한다 — 언마운트된 컴포넌트가 setState를 시도하면
  // 안 된다(경고/예외 없이 조용히 버려져야 한다).
  await act(async () => { resolveFindId({ ok: true, maskedEmail: "a***c@e***.com" }) })

  assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT), "뒤로 간 화면이 다시 아이디 찾기로 돌아오면 안 됩니다")
  assert.equal(view.container.textContent.includes("a***c@e***.com"), false)
});

test("idle 상태에서도 뒤로 가기를 누르면 /login으로 이동한다", async () => {
  const view = await mountFindIdPage()
  await act(async () => { fireEvent.click(view.getByText("뒤로 가기")) })
  await waitFor(() => assert.ok(view.container.textContent.includes(LOGIN_STUB_TEXT)))
});

// ── AC-07 재검토 대응: StrictMode 이중 마운트에서도 응답 처리가 버려지지 않는다 ──────

test("StrictMode로 마운트해도 제출 → 성공 응답이 found로 전이된다(submitting에 멈추지 않음)", async () => {
  findIdHandler = async () => ({ ok: true, maskedEmail: "a***c@e***.com" })
  const view = await mountFindIdPageStrict()
  fillForm(view)
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("a***c@e***.com")))
  assert.equal(view.container.querySelector('input[name="nickname"]'), null)
});

test("StrictMode로 마운트해도 제출 → NOT_FOUND 응답이 notFound로 전이된다(submitting에 멈추지 않음)", async () => {
  findIdHandler = async () => ({ ok: false, code: "NOT_FOUND" })
  const view = await mountFindIdPageStrict()
  fillForm(view, { nickname: "안맞는닉", birthDate: "1990-01-01" })
  await act(async () => { submitForm(view) })

  await waitFor(() => assert.ok(view.container.textContent.includes("입력한 정보와 일치하는 계정을 찾을 수 없습니다.")))
  assert.ok(view.container.querySelector('button[type="submit"]'), "submitting에 멈춰 있으면 제출 버튼이 계속 disabled로 남습니다")
});

// ── AC-07: 실제 공개 라우트 배선 ──────────────────────────────────────────────

test("app/routes/index.jsx는 /find-id를 ProtectedRoute 밖(비로그인 접근 가능)에 등록한다", async () => {
  const source = await readFile(new URL("../../../../app/routes/index.jsx", import.meta.url), "utf8")

  assert.match(source, /import FindIdPage from ["']@\/domains\/auth\/pages\/FindIdPage["']/)

  const protectedBlockMatch = source.match(/element:\s*<ProtectedRoute\s*\/>[\s\S]*?\]/)
  assert.ok(protectedBlockMatch, "ProtectedRoute children 블록을 찾을 수 없습니다")
  assert.equal(protectedBlockMatch[0].includes("/find-id"), false, "/find-id는 ProtectedRoute children 안에 있으면 안 됩니다")

  assert.match(source, /\{\s*path:\s*"\/find-id",\s*element:\s*<FindIdPage\s*\/>\s*\}/)
});

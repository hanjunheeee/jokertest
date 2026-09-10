import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// F-06 AC-02/AC-04 — LoginPage.jsx가 socialIntent/socialError 쿼리를 화면 모드로 옮기는
// 로직의 흐름 테스트입니다.
//
// 이 저장소의 node:test 실행(`node --experimental-test-module-mocks --test
// src/**/__tests__/*.test.js`)에는 JSX 변환기가 없어 LoginPage.jsx·SocialSignupForm.jsx를
// 직접 렌더링해 검증할 수 없습니다(useLoginPage.js 상단 주석과 같은 제약, `*.test.jsx`도
// test 스크립트의 glob(`*.test.js`)에 걸리지 않습니다). 그래서 쿼리→화면모드 판정과 오류
// 코드 매핑이라는 실제 "흐름" 로직은 JSX 없는 useLoginPage.js에 순수 함수로 분리해 뒀고
// (resolveSocialLoginView/mapSocialErrorCode), 이 파일이 그 함수를 직접 검증합니다.
// 실제 화면 렌더링은 `npm run build`(vite, JSX 컴파일 확인)로 별도 확인합니다.

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

// useLoginPage.js는 "@/shared/api/client"처럼 Vite 전용 별칭을 쓰는 auth.api.js를
// import한다 — 플레인 node:test에는 그 별칭을 풀어줄 번들러가 없으므로, 실제 auth.api.js/
// auth.store.js/react-router-dom을 그대로 불러오면 모듈 해석 자체가 실패한다. 이 파일은
// mapSocialErrorCode/resolveSocialLoginView라는 순수 함수만 쓰고 어떤 API도 실제로
// 호출하지 않으므로, useLoginPage.test.js와 같은 방식으로 최소한의 빈 mock만 등록해 import
// 자체가 성립하게 한다.
mock.module("../../api/auth.api.js", {
  namedExports: {
    getMeApi: async () => ({}),
    signupApi: async () => ({}),
    loginApi: async () => ({}),
    checkEmailApi: async () => ({ available: true }),
  },
})
mock.module("../../store/auth.store.js", {
  namedExports: {
    selectIsAuthenticated: () => false,
    useAuthStore: (selector) => selector({ user: null, isLoggedIn: false, login: () => {}, clearLoggedOutIntentionally: () => {} }),
  },
})
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => () => {} },
})

const { mapSocialErrorCode, resolveSocialLoginView, SOCIAL_ERROR_MESSAGES, DEFAULT_SOCIAL_ERROR_MESSAGE } =
  await import("../../hooks/useLoginPage.js")

// ── AC-04: socialError 코드는 유한 목록으로 미리 매핑되어야 한다(경계 매핑) ────────

test("정의된 모든 socialError 코드는 비어있지 않은 안내 문구로 매핑된다", () => {
  const codes = Object.keys(SOCIAL_ERROR_MESSAGES)
  assert.ok(codes.length > 0)
  for (const code of codes) {
    const message = mapSocialErrorCode(code)
    assert.equal(typeof message, "string")
    assert.notEqual(message.length, 0)
  }
})

test("목록에 없는(알 수 없는) 코드는 기본 문구로 대체된다", () => {
  assert.equal(mapSocialErrorCode("SOME_UNKNOWN_FUTURE_CODE"), DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(mapSocialErrorCode(undefined), DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(mapSocialErrorCode(""), DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(mapSocialErrorCode(null), DEFAULT_SOCIAL_ERROR_MESSAGE)
})

test("주요 실패 코드는 서로 다른 문구로 매핑된다(하나의 뭉뚱그린 메시지로 숨기지 않는다)", () => {
  const cancelled = mapSocialErrorCode("OAUTH_CANCELLED")
  const conflict = mapSocialErrorCode("EMAIL_CONFLICT")
  const timeout = mapSocialErrorCode("GOOGLE_OAUTH_TIMEOUT")
  assert.notEqual(cancelled, conflict)
  assert.notEqual(conflict, timeout)
  assert.equal(cancelled, SOCIAL_ERROR_MESSAGES.OAUTH_CANCELLED)
})

// ── AC-02: /login?socialIntent=... / socialError=... 쿼리를 화면 모드로 옮긴다 ─────────

test("socialIntent가 있으면 소셜 가입 보완 화면 모드가 된다", () => {
  const view = resolveSocialLoginView({ socialIntent: "intent-1", socialError: null })
  assert.deepEqual(view, { mode: "socialSignup", intentToken: "intent-1" })
})

test("socialIntent와 socialError가 동시에 있으면(정상 흐름에서는 나오지 않는 조합) socialIntent를 우선한다", () => {
  const view = resolveSocialLoginView({ socialIntent: "intent-1", socialError: "OAUTH_CANCELLED" })
  assert.equal(view.mode, "socialSignup")
  assert.equal(view.intentToken, "intent-1")
})

test("socialError만 있으면 오류 안내 모드가 되고, 매핑된 문구를 담는다", () => {
  const view = resolveSocialLoginView({ socialIntent: null, socialError: "STATE_EXPIRED" })
  assert.equal(view.mode, "socialError")
  assert.equal(view.message, SOCIAL_ERROR_MESSAGES.STATE_EXPIRED)
})

test("둘 다 없으면 기본 로그인 화면 모드가 된다", () => {
  assert.deepEqual(resolveSocialLoginView({}), { mode: "default" })
  assert.deepEqual(resolveSocialLoginView(), { mode: "default" })
})

test("빈 문자열 쿼리값은 없는 것과 같이 취급한다(URLSearchParams.get은 없는 키도 빈 문자열이 아니라 null을 준다는 것과는 별개로, 방어적으로도 안전해야 한다)", () => {
  assert.deepEqual(resolveSocialLoginView({ socialIntent: "", socialError: "" }), { mode: "default" })
})

// ── R-IMPL 재현(Chrome 09:56:37Z, /login?socialError=__proto__ → React #31): 일반 객체를
// 대괄호 표기법으로 색인하면 own property가 아닌 상속 키까지 값으로 튀어나올 수 있다.
// mapSocialErrorCode는 이제 own-property만 신뢰해야 하고, 그 값은 항상 문자열이어야
// 한다(객체/함수가 그대로 나오면 JSX 렌더링에서 다시 React #31로 이어진다). ────────────

test("__proto__ 코드는 Object.prototype이 아니라 기본 문구로 매핑된다(own-property가 아님)", () => {
  const message = mapSocialErrorCode("__proto__")
  assert.equal(message, DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(typeof message, "string")
})

test("constructor 코드는 생성자 함수가 아니라 기본 문구로 매핑된다(own-property가 아님)", () => {
  const message = mapSocialErrorCode("constructor")
  assert.equal(message, DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(typeof message, "string")
})

test("toString 코드는 상속된 함수가 아니라 기본 문구로 매핑된다(own-property가 아님)", () => {
  const message = mapSocialErrorCode("toString")
  assert.equal(message, DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(typeof message, "string")
})

test("hasOwnProperty 코드는 상속된 함수가 아니라 기본 문구로 매핑된다(own-property가 아님)", () => {
  const message = mapSocialErrorCode("hasOwnProperty")
  assert.equal(message, DEFAULT_SOCIAL_ERROR_MESSAGE)
  assert.equal(typeof message, "string")
})

test("__proto__ socialError 쿼리도 오류 안내 모드에서 기본 문구를 담는다(정상 conflict/cancel 문구는 그대로 보존된다)", () => {
  const protoView = resolveSocialLoginView({ socialIntent: null, socialError: "__proto__" })
  assert.equal(protoView.mode, "socialError")
  assert.equal(protoView.message, DEFAULT_SOCIAL_ERROR_MESSAGE)

  const conflictView = resolveSocialLoginView({ socialIntent: null, socialError: "EMAIL_CONFLICT" })
  assert.equal(conflictView.message, SOCIAL_ERROR_MESSAGES.EMAIL_CONFLICT)

  const cancelView = resolveSocialLoginView({ socialIntent: null, socialError: "OAUTH_CANCELLED" })
  assert.equal(cancelView.message, SOCIAL_ERROR_MESSAGES.OAUTH_CANCELLED)
})

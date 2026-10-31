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

mock.module("../../api/auth.api.js", {
  namedExports: {
    getMeApi: async () => ({}),
    signupApi: async () => ({}),
    loginApi: async () => ({}),
    checkEmailApi: async () => ({ available: true }),
    requestSignupCodeApi: async () => ({ ok: true, resendAfterSec: 60, expiresInSec: 600 }),
    verifySignupCodeApi: async () => ({ ok: true, signupProof: "unused-in-this-test" }),
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

test("Discord 전용 오류 코드(DISCORD_*)는 Google과 구분되는 문구로 매핑된다", () => {
  const googleTimeout = mapSocialErrorCode("GOOGLE_OAUTH_TIMEOUT")
  const discordTimeout = mapSocialErrorCode("DISCORD_OAUTH_TIMEOUT")
  assert.notEqual(googleTimeout, discordTimeout)
  assert.match(discordTimeout, /Discord/)
  assert.doesNotMatch(discordTimeout, /Google/)

  const discordNotConfigured = mapSocialErrorCode("DISCORD_OAUTH_NOT_CONFIGURED")
  assert.match(discordNotConfigured, /Discord/)
})

test("제공자 공용 코드(OAUTH_CANCELLED/EMAIL_MISSING/PROVIDER_INVALID)는 어느 한 제공자 이름도 못박지 않는다(Google 전용 문구가 Discord 실패에 잘못 붙지 않는다)", () => {
  for (const code of ["OAUTH_CANCELLED", "EMAIL_MISSING", "PROVIDER_INVALID"]) {
    const message = mapSocialErrorCode(code)
    assert.doesNotMatch(message, /Google/, `${code}는 Google 전용 문구를 담으면 안 됩니다`)
    assert.doesNotMatch(message, /Discord/, `${code}는 Discord 전용 문구를 담으면 안 됩니다`)
  }
})

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

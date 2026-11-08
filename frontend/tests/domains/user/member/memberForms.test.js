// 회원 기능 시험(데스크톱): 탈퇴 폼 · 이메일 바꾸기 폼 · 비번 변경 뒤 다시 로그인 · 쿠폰 입력 · 화면 버전 판정
// API·다시 로그인·지갑 다시 받기는 넘겨주는 가짜 함수 (진짜 요청·이동 없음)
import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { register } from "node:module"

// @/ 길 풀기 (usePasswordForm이 @/ 로 api를 부름)
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true })
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, localStorage: dom.window.localStorage,
  MutationObserver: dom.window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { act, renderHook } = await import("@testing-library/react")
const { useWithdrawForm, WITHDRAW_NOTICE_LINES } = await import("../../../../src/domains/user/hooks/member/useWithdrawForm.js")
const { useEmailChangeForm } = await import("../../../../src/domains/user/hooks/member/useEmailChangeForm.js")
const { useCouponRedeem } = await import("../../../../src/domains/store/hooks/useCouponRedeem.js")
const { normalizeCouponCode, isCouponCodeShape, couponSuccessText, couponErrorText } = await import("../../../../src/domains/store/utils/coupon.js")
const { isInGamePath, isNewVersionServed, shouldShowUpdateNotice } = await import("../../../../src/shared/utils/appVersion.js")
const { buildAppVersion } = await import("../../../../scripts/appVersionPlugin.mjs")

const LOCAL = { email: "me@example.com", hasLocalPassword: true }
const SOCIAL = { email: "social@example.com", hasLocalPassword: false }
const event = () => ({ preventDefault() {} })
const apiError = (message, extra) => Object.assign(new Error(message), extra)

// ── 탈퇴 ──

test("탈퇴 폼: 빈칸이면 확인 창 안 열고 문구, 비번 넣으면 확인 창 → 탈퇴 누르면 password로 보내고 다시 로그인", async () => {
  const sent = []
  let relogins = 0
  const withdraw = async (body) => { sent.push(body); return { success: true } }
  const onWithdrawn = () => { relogins += 1 }
  const { result, unmount } = renderHook(() => useWithdrawForm({ account: LOCAL, withdraw, onWithdrawn }))
  act(() => result.current.openConfirm(event()))
  assert.equal(result.current.confirmOpen, false)
  assert.match(result.current.msg.text, /비밀번호/)

  act(() => result.current.setSecret("password-123"))
  act(() => result.current.openConfirm(event()))
  assert.equal(result.current.confirmOpen, true)
  await act(async () => { await result.current.confirmWithdraw() })
  assert.deepEqual(sent, [{ password: "password-123" }])
  assert.equal(relogins, 1)
  assert.ok(WITHDRAW_NOTICE_LINES.some((line) => /사라지고/.test(line)), "재화 사라짐 안내")
  unmount()
})

test("탈퇴 폼: 소셜 전용은 confirmEmail로 보내고, 판 중 거절이면 창 닫고 서버 문구", async () => {
  const sent = []
  const withdraw = async (body) => { sent.push(body); throw apiError("진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.", { code: "WITHDRAW_IN_GAME" }) }
  const { result, unmount } = renderHook(() => useWithdrawForm({ account: SOCIAL, withdraw, onWithdrawn: () => assert.fail("다시 로그인 안 함") }))
  assert.equal(result.current.usesPassword, false)
  act(() => result.current.setSecret("social@example.com"))
  act(() => result.current.openConfirm(event()))
  await act(async () => { await result.current.confirmWithdraw() })
  assert.deepEqual(sent, [{ confirmEmail: "social@example.com" }])
  assert.equal(result.current.confirmOpen, false)
  assert.match(result.current.msg.text, /게임이 끝난 뒤/)
  unmount()
})

// ── 이메일 바꾸기 ──

test("이메일 바꾸기 폼: 번호 받기 → codeSent, 확인 → 처음 단계·부모에 새 주소", async () => {
  const requests = []
  const confirms = []
  const changed = []
  const requestCode = async (body) => { requests.push(body); return { expiresInSec: 600, resendAfterSec: 60 } }
  const confirmCode = async (body) => { confirms.push(body); return { email: "new@example.com" } }
  const onChanged = (email) => changed.push(email)
  const { result, unmount } = renderHook(() => useEmailChangeForm({ account: LOCAL, onChanged, requestCode, confirmCode }))

  act(() => result.current.setNewEmail(" new@example.com "))
  act(() => result.current.setCurrentPassword("pw-1234567"))
  await act(async () => { await result.current.sendCode(event()) })
  assert.deepEqual(requests, [{ newEmail: "new@example.com", currentPassword: "pw-1234567" }])
  assert.equal(result.current.stage, "codeSent")
  assert.match(result.current.msg.text, /10분/)

  act(() => result.current.setCode("123456"))
  await act(async () => { await result.current.verifyCode(event()) })
  assert.deepEqual(confirms, [{ newEmail: "new@example.com", code: "123456" }])
  assert.deepEqual(changed, ["new@example.com"])
  assert.equal(result.current.stage, "input")
  assert.equal(result.current.newEmail, "")
  unmount()
})

test("이메일 바꾸기 폼: 비번 칸 비면 안 보냄(소셜 전용은 비번 없이 보냄), 대기·남은 횟수는 문구에 붙음", async () => {
  const requests = []
  const requestCode = async (body) => {
    requests.push(body)
    throw apiError("잠시 뒤 다시", { code: "RESEND_TOO_SOON", resendAfterSec: 42 })
  }
  const local = renderHook(() => useEmailChangeForm({ account: LOCAL, requestCode }))
  act(() => local.result.current.setNewEmail("new@example.com"))
  await act(async () => { await local.result.current.sendCode(event()) })
  assert.equal(requests.length, 0)
  assert.match(local.result.current.msg.text, /현재 비밀번호/)
  local.unmount()

  const social = renderHook(() => useEmailChangeForm({ account: SOCIAL, requestCode }))
  act(() => social.result.current.setNewEmail("new@example.com"))
  await act(async () => { await social.result.current.sendCode(event()) })
  assert.deepEqual(requests, [{ newEmail: "new@example.com", currentPassword: undefined }])
  assert.match(social.result.current.msg.text, /42초 뒤/)
  social.unmount()

  const confirmCode = async () => { throw apiError("인증번호가 올바르지 않습니다.", { code: "CODE_INVALID", attemptsRemaining: 3 }) }
  const wrong = renderHook(() => useEmailChangeForm({ account: SOCIAL, confirmCode }))
  act(() => wrong.result.current.setCode("000000"))
  await act(async () => { await wrong.result.current.verifyCode(event()) })
  assert.match(wrong.result.current.msg.text, /남은 횟수 3/)
  wrong.unmount()
})

// ── 비번 변경 뒤 다시 로그인 ──

test("비번 변경: 서버가 reloginRequired면 안내 뒤 정한 시간 지나 다시 로그인 (없으면 안 함)", async (t) => {
  t.mock.module("../../../../src/domains/user/api/user.api.js", {
    namedExports: { updatePasswordApi: async () => ({ success: true, reloginRequired: true }) },
  })
  const { usePasswordForm } = await import("../../../../src/domains/user/hooks/usePasswordForm.js")
  let relogins = 0
  const onReloginRequired = () => { relogins += 1 }
  const { result, unmount } = renderHook(() => usePasswordForm({ onReloginRequired, reloginDelayMs: 5 }))
  act(() => result.current.handlePwChange({ target: { name: "currentPassword", value: "old-pass-1" } }))
  act(() => result.current.handlePwChange({ target: { name: "newPassword", value: "new-pass-1" } }))
  await act(async () => { await result.current.handlePasswordSubmit(event()) })
  assert.match(result.current.pwMsg.text, /다시 로그인/)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(relogins, 1)
  unmount()
})

// ── 쿠폰 ──

test("쿠폰 도구: 소문자·빈칸 다듬기, 모양 검사, 성공·실패 문구", () => {
  assert.equal(normalizeCouponCode(" welcome-2026 "), "WELCOME-2026")
  assert.equal(isCouponCodeShape("ab"), false)
  assert.equal(isCouponCodeShape("AB C1"), false)
  assert.equal(isCouponCodeShape("abcd"), true)
  assert.equal(couponSuccessText({ currency: "DIAMOND", amount: 1500 }), "다이아 1,500개를 받았습니다.")
  assert.equal(couponErrorText({ code: "COUPON_ALREADY_REDEEMED" }), "이미 사용한 쿠폰입니다.")
  assert.equal(couponErrorText({ message: "서버 문구" }), "서버 문구")
})

test("쿠폰 입력 훅: 모양 틀리면 안 보냄, 맞으면 대문자로 보내고 성공 문구·칸 비움·지갑 다시 받기, 실패는 문구만", async () => {
  const sent = []
  let refreshed = 0
  let fail = false
  const redeem = async (code) => {
    sent.push(code)
    if (fail) throw apiError("x", { code: "COUPON_EXPIRED" })
    return { ok: true, reward: { currency: "GOLD", amount: 500 } }
  }
  const refreshWallet = async () => { refreshed += 1 }
  const { result, unmount } = renderHook(() => useCouponRedeem({ redeem, refreshWallet }))
  act(() => result.current.setCode("a!"))
  await act(async () => { await result.current.submit(event()) })
  assert.equal(sent.length, 0)

  act(() => result.current.setCode("spring-gift"))
  await act(async () => { await result.current.submit(event()) })
  assert.deepEqual(sent, ["SPRING-GIFT"])
  assert.equal(result.current.msg.text, "골드 500개를 받았습니다.")
  assert.equal(result.current.code, "")
  assert.equal(refreshed, 1)

  fail = true
  act(() => result.current.setCode("OLD-CODE"))
  await act(async () => { await result.current.submit(event()) })
  assert.equal(result.current.msg.type, "error")
  assert.equal(result.current.msg.text, "기간이 끝난 쿠폰입니다.")
  assert.equal(refreshed, 1)
  unmount()
})

// ── 화면 버전 ──

test("화면 버전: 둘 다 있고 다를 때만 새 버전, 판 도중(/ingame)엔 안 띄움, 닫은 버전은 다시 안 띄움", () => {
  assert.equal(isNewVersionServed("a1-1", "b2-2"), true)
  assert.equal(isNewVersionServed("a1-1", "a1-1"), false)
  assert.equal(isNewVersionServed(null, "b2-2"), false, "개발 서버(버전 없음)는 안 띄움")
  assert.equal(isInGamePath("/ingame"), true)
  assert.equal(isInGamePath("/gameresult"), false)
  const base = { servedVersion: "b2-2", currentVersion: "a1-1" }
  assert.equal(shouldShowUpdateNotice({ ...base, pathname: "/ingame" }), false)
  assert.equal(shouldShowUpdateNotice({ ...base, pathname: "/gameresult" }), true, "판 끝나면 띄움")
  assert.equal(shouldShowUpdateNotice({ ...base, pathname: "/lobby", dismissedVersion: "b2-2" }), false)
})

test("화면 버전 플러그인: 버전은 git 해시-빌드 시각 모양", () => {
  assert.equal(buildAppVersion(new Date("2026-11-09T03:15:00.123Z"), "abc1234"), "abc1234-20261109T031500Z")
})

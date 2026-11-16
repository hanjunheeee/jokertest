// 약관 동의 판정 시험 — 필수 다 골랐나·막힘 문구 차례·보낼 값·로그인 뒤 재동의 필요
// 목록 A11a 화면 상태 A11-F-055~062
import test from "node:test"
import assert from "node:assert/strict"
import { rtl, TERMS, serve, resetAll, settle, useAuthStore } from "./a11Kit.mjs"

const { isAllRequiredAgreed, agreementBlockMessage, buildAgreementPayload } = await import("../../src/domains/auth/utils/terms.js")
const { useTermsReconsent } = await import("../../src/domains/auth/hooks/terms/useTermsReconsent.js")

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

test("A11-F-055 필수 약관 다 + 만 14세 → 됨", () => {
  assert.equal(isAllRequiredAgreed(TERMS, [1, 2], true), true)
})

test("A11-F-056 필수 약관 하나 빠짐 → 아님", () => {
  assert.equal(isAllRequiredAgreed(TERMS, [1], true), false)
})

test("A11-F-057 막힘 문구: 약관 목록 못 불러옴 → 약관 불러오기 실패 문구", () => {
  assert.match(agreementBlockMessage([], [1, 2], true), /^약관을 불러오지 못했습니다/)
})

test("A11-F-058 막힘 문구: 필수 빠짐 → \"필수 약관에 동의해주세요.\"", () => {
  assert.equal(agreementBlockMessage(TERMS, [2], true), "필수 약관에 동의해주세요.")
})

test("A11-F-059 막힘 문구: 만 14세만 빠짐 → \"만 14세 이상인지 확인해주세요.\"", () => {
  assert.equal(agreementBlockMessage(TERMS, [1, 2], false), "만 14세 이상인지 확인해주세요.")
})

test("A11-F-060 보낼 약관 값: 목록 [1,2], 고른 [2,9] → [2]만", () => {
  assert.deepEqual(buildAgreementPayload(TERMS, [2, 9], true), { agreedTermsVersionIds: [2], ageConfirmed: true })
})

// 로그인한 계정으로 재동의 확인 훅을 돌림
async function reconsentWith(pending) {
  serve({ "GET /user/me/terms": { status: 200, body: { success: true, data: { pending, reconsentRequired: pending.length > 0 } } } })
  useAuthStore.getState().login({ uuid: "u-a11-terms", nickname: "시험사람", role: "USER" })
  const hook = rtl.renderHook(() => useTermsReconsent())
  await settle()
  return hook
}

test("A11-F-061 로그인 뒤 재동의 필요 목록 있음 → 재동의 창 열림(필요 참)", async () => {
  const hook = await reconsentWith([{ ...TERMS[0], version: "2.0", id: 3 }])
  assert.equal(hook.result.current.required, true)
  assert.equal(hook.result.current.pending.length, 1)
})

test("A11-F-062 로그인 뒤 재동의 필요 목록 없음 → 안 열림(필요 거짓)", async () => {
  const hook = await reconsentWith([])
  assert.equal(hook.result.current.required, false)
})

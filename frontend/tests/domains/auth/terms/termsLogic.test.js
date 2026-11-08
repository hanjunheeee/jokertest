// 회원 기능 시험(데스크톱): 약관 동의 판정 도구 · 가입 약관 훅 · 재동의 훅
// API는 넘겨주는 가짜 함수, 화면 그리기는 testing-library의 renderHook (jsdom)
import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true })
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.MutationObserver = dom.window.MutationObserver

const { act, renderHook, waitFor } = await import("@testing-library/react")
const {
  agreementBlockMessage, buildAgreementPayload, isAllRequiredAgreed, termsLabelOf, toggleAgreedId,
} = await import("../../../../src/domains/auth/utils/terms.js")
const { useSignupTerms } = await import("../../../../src/domains/auth/hooks/terms/useSignupTerms.js")
const { useTermsReconsent } = await import("../../../../src/domains/auth/hooks/terms/useTermsReconsent.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")

const TERMS = [
  { id: 1, kind: "TERMS", version: "v1", title: "이용약관", required: true },
  { id: 2, kind: "PRIVACY", version: "v1", title: "개인정보 처리방침", required: true },
  { id: 3, kind: "MARKETING", version: "v1", title: "선택 안내", required: false },
]

test("약관 판정: 필수 전부 + 만 14세여야 참, 선택 약관은 안 골라도 됨, 목록이 비면 거짓", () => {
  assert.equal(isAllRequiredAgreed(TERMS, [1, 2], true), true)
  assert.equal(isAllRequiredAgreed(TERMS, [1, 2], false), false)
  assert.equal(isAllRequiredAgreed(TERMS, [1, 3], true), false)
  assert.equal(isAllRequiredAgreed([], [1, 2], true), false)
})

test("약관 판정: 보낼 값은 지금 목록 id만·겹침 뺌, 막힘 문구는 못 불러옴→약관→14세 순", () => {
  assert.deepEqual(buildAgreementPayload(TERMS, [2, 9, 2], true), { agreedTermsVersionIds: [2], ageConfirmed: true })
  assert.match(agreementBlockMessage([], [], false), /불러오지 못했습니다/)
  assert.match(agreementBlockMessage(TERMS, [1], true), /필수 약관/)
  assert.match(agreementBlockMessage(TERMS, [1, 2], false), /만 14세/)
  assert.equal(agreementBlockMessage(TERMS, [1, 2], true), null)
  assert.deepEqual(toggleAgreedId([1, 2], 2), [1])
  assert.equal(termsLabelOf(TERMS[1]), "개인정보 처리방침")
  assert.equal(termsLabelOf({ kind: "X", title: "그 밖" }), "그 밖")
})

test("가입 약관 훅: 불러온 뒤 전체 동의 → 필수·선택·14세 다 켜지고 payload, 한 번 더 누르면 다 꺼짐", async () => {
  const loadTerms = async () => ({ terms: TERMS })
  const { result, unmount } = renderHook(() => useSignupTerms({ active: true, loadTerms }))
  await waitFor(() => assert.equal(result.current.status, "ready"))
  assert.equal(result.current.canProceed, false)
  act(() => result.current.toggleAll())
  assert.equal(result.current.canProceed, true)
  assert.equal(result.current.allChecked, true)
  assert.deepEqual(result.current.buildPayload(), { agreedTermsVersionIds: [1, 2, 3], ageConfirmed: true })
  act(() => result.current.toggleAll())
  assert.equal(result.current.ageConfirmed, false)
  assert.deepEqual(result.current.agreedIds, [])
  unmount()
})

test("가입 약관 훅: 불러오기 실패면 error, 다시 시도하면 ready / active 아니면 안 부름", async () => {
  let calls = 0
  const loadTerms = async () => {
    calls += 1
    if (calls === 1) throw new Error("down")
    return { terms: TERMS }
  }
  const { result, unmount } = renderHook(() => useSignupTerms({ active: true, loadTerms }))
  await waitFor(() => assert.equal(result.current.status, "error"))
  assert.match(result.current.blockMessage, /불러오지 못했습니다/)
  act(() => result.current.retry())
  await waitFor(() => assert.equal(result.current.status, "ready"))

  unmount()

  let idleCalls = 0
  const idleLoad = async () => { idleCalls += 1; return { terms: TERMS } }
  const idle = renderHook(() => useSignupTerms({ active: false, loadTerms: idleLoad }))
  assert.equal(idle.result.current.status, "idle")
  assert.equal(idleCalls, 0)
  idle.unmount()
})

test("가입 약관 훅: 보기 누르면 그 약관이 viewing, 닫으면 null", async () => {
  const loadTerms = async () => ({ terms: TERMS })
  const { result, unmount } = renderHook(() => useSignupTerms({ active: true, loadTerms }))
  await waitFor(() => assert.equal(result.current.status, "ready"))
  act(() => result.current.openTerms(2))
  assert.equal(result.current.viewing.id, 2)
  act(() => result.current.closeTerms())
  assert.equal(result.current.viewing, null)
  unmount()
})

test("재동의 훅: 로그인 상태면 필요 목록을 받고, 동의하면 남은 목록으로 비워짐 (로그아웃이면 안 부름)", async () => {
  useAuthStore.setState({ isLoggedIn: false, user: null })
  let loads = 0
  const sent = []
  const loadPending = async () => { loads += 1; return { pending: [TERMS[1]] } }
  const sendAgreement = async (ids) => { sent.push(ids); return { pending: [] } }
  const { result, unmount } = renderHook(() => useTermsReconsent({ loadPending, sendAgreement }))
  assert.equal(result.current.required, false)
  assert.equal(loads, 0)

  act(() => useAuthStore.setState({ isLoggedIn: true, user: { uuid: "u-1", nickname: "나" } }))
  await waitFor(() => assert.equal(result.current.required, true))
  await act(async () => { await result.current.agree() })
  assert.deepEqual(sent, [[2]])
  assert.equal(result.current.required, false)
  unmount()
})

test("재동의 훅: 그사이 약관이 바뀌어 TERMS_VERSION_OUTDATED면 새 목록을 다시 받고 문구를 보임", async () => {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "u-2", nickname: "나" } })
  let version = 2
  const loadPending = async () => ({ pending: [{ ...TERMS[1], id: version }] })
  const sendAgreement = async () => {
    version = 4
    throw Object.assign(new Error("약관이 바뀌었습니다."), { code: "TERMS_VERSION_OUTDATED" })
  }
  const { result, unmount } = renderHook(() => useTermsReconsent({ loadPending, sendAgreement }))
  await waitFor(() => assert.equal(result.current.required, true))
  await act(async () => { await result.current.agree() })
  assert.equal(result.current.pending[0].id, 4)
  assert.match(result.current.error, /바뀌었습니다/)
  unmount()
  act(() => useAuthStore.setState({ isLoggedIn: false, user: null }))
})

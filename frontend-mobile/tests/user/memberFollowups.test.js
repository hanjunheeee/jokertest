// 회원 기능·후속 시험(모바일): 받은 신청 "다 받음" 판정·거절 버튼·실패 문구 · 친구 신청 실패 문구 · 가입 약관 칸 · 쿠폰 버튼
// 소리·데스크톱 훅은 바꿔 끼움 (진짜 요청 없음)
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, act, React } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

stubModule(
  "/frontend/src/shared/hooks/useSfxRuntime.js",
  "export const dispatchUiSfx = () => {}",
)
stubModule(
  "/frontend/src/domains/store/hooks/useCouponRedeem.js",
  `export function useCouponRedeem() {
  return { code: "", setCode() {}, loading: false, msg: null, submit(e) { e?.preventDefault?.(); globalThis.__couponSubmits = (globalThis.__couponSubmits ?? 0) + 1 }, reset() {} }
}`,
)

const { default: AcceptTab } = await import("@m/domains/lobby/components/friends/accept/AcceptTab.jsx")
const { default: CandidateRow } = await import("@m/domains/lobby/components/friends/add/CandidateRow.jsx")
const { default: TermsAgreement } = await import("@m/domains/auth/components/terms/TermsAgreement.jsx")
const { default: CouponButton } = await import("@m/domains/store/components/top/CouponButton.jsx")

const h = React.createElement
const REQUEST = { request_id: "r-1", id: "u-1", name: "친구1" }
const acceptProps = (extra = {}) => ({
  onBack() {}, incomingRequests: [REQUEST], incomingError: null, processingRequestIds: new Set(), acceptAllResult: null,
  onAccept() {}, onBlock() {}, onAcceptAll() {}, onRefresh() {}, targetRequestId: "r-gone", ...extra,
})
const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent.trim() === label)

test("받은 신청: 다 받기 전(incomingLoaded 거짓)엔 '이미 처리됨' 안내를 안 띄우고, 다 받은 뒤에만 띄움", () => {
  const view = render(h("ul", null, h(AcceptTab, acceptProps())))
  assert.equal(view.container.querySelector("[data-notification-target-missing]"), null)
  view.rerender(h("ul", null, h(AcceptTab, acceptProps({ incomingLoaded: true }))))
  assert.ok(view.container.querySelector("[data-notification-target-missing]"))
  view.unmount()
})

test("받은 신청: 거절 처리 함수가 있으면 거절 버튼이 보이고 누르면 신청 id로 부름, 실패 문구는 이름 아래", () => {
  const declined = []
  const view = render(h(AcceptTab, acceptProps({
    onDecline: (id) => declined.push(id), requestErrors: { "r-1": "처리하지 못했습니다." }, targetRequestId: null,
  })))
  const decline = button(view.container, "친구1 거절")
  assert.ok(decline, "거절 버튼 없음")
  assert.match(decline.textContent, /거절/)
  act(() => decline.click())
  assert.deepEqual(declined, ["r-1"])
  assert.equal(view.container.querySelector('[data-request-error="r-1"]').textContent, "처리하지 못했습니다.")
  view.unmount()

  const noDecline = render(h(AcceptTab, acceptProps({ targetRequestId: null })))
  assert.equal(button(noDecline.container, "친구1 거절"), undefined)
  noDecline.unmount()
})

test("친구 신청: 보내다 실패하면 이름 아래 문구, 보내는 중엔 신청 버튼 잠금", () => {
  const candidate = { id: "c-1", name: "후보", status: "ONLINE" }
  const view = render(h("ul", null, h(CandidateRow, { candidate, sent: false, sending: true, sendError: "신청하지 못했습니다.", blocking: false, onSend() {}, onBlock() {} })))
  assert.equal(view.container.querySelector('[data-send-error="c-1"]').textContent, "신청하지 못했습니다.")
  assert.equal(button(view.container, "후보에게 친구 신청").disabled, true)
  view.unmount()
})

test("가입 약관 칸: 전체 동의·약관 줄·만 14세 줄이 보이고, 누르면 훅 함수 부름, 보기는 그 약관 id", () => {
  const calls = []
  const signupTerms = {
    terms: [{ id: 1, kind: "TERMS", title: "이용약관", required: true }, { id: 2, kind: "PRIVACY", title: "개인정보 처리방침", required: true }],
    status: "ready", agreedIds: [1], ageConfirmed: false, allChecked: false, viewing: null,
    setAgeConfirmed: (v) => calls.push(["age", v]), toggle: (id) => calls.push(["toggle", id]), toggleAll: () => calls.push(["all"]),
    openTerms: (id) => calls.push(["view", id]), closeTerms() {}, retry() {},
  }
  const view = render(h(TermsAgreement, { signupTerms }))
  const checks = [...view.container.querySelectorAll('[role="checkbox"]')]
  assert.equal(checks.length, 4, "전체·이용약관·개인정보·14세")
  assert.equal(checks[1].getAttribute("aria-checked"), "true")
  assert.match(view.container.textContent, /만 14세 이상입니다/)
  act(() => checks[0].click())
  act(() => checks[2].click())
  act(() => checks[3].click())
  act(() => [...view.container.querySelectorAll("button")].filter((b) => b.textContent === "보기")[1].click())
  assert.deepEqual(calls, [["all"], ["toggle", 2], ["age", true], ["view", 2]])
  view.unmount()
})

test("가입 약관 칸: 불러오기 실패면 다시 불러오기 버튼", () => {
  let retried = 0
  const view = render(h(TermsAgreement, { signupTerms: { status: "error", terms: [], retry: () => { retried += 1 } } }))
  act(() => button(view.container, "다시 불러오기").click())
  assert.equal(retried, 1)
  view.unmount()
})

test("상점 쿠폰: 쿠폰 버튼 누르면 입력 창, 사용하기 누르면 보내기", () => {
  globalThis.__couponSubmits = 0
  const view = render(h(CouponButton))
  act(() => button(view.container, "쿠폰").click())
  const dialog = document.body.querySelector('[role="dialog"]')
  assert.ok(dialog, "쿠폰 창이 안 뜸")
  assert.ok(dialog.querySelector('input[aria-label="쿠폰 코드"]'))
  const form = dialog.querySelector("form")
  act(() => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })))
  assert.equal(globalThis.__couponSubmits, 1)
  view.unmount()
})

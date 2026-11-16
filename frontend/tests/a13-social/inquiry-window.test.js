// 문의 창(데스크톱) 부품 시험 (빈 제목 막기·보내면 목록 맨 위 "답 기다림"·너무 자주 쓰면 안내)
// 목록 A13-F-248~250 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/inquiry-window.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act } = await import("@testing-library/react")
const { default: InquiryWindow } = await import("../../src/domains/inquiry/components/InquiryWindow.jsx")
const { installFetch, signIn, resetAll, settle, press, typeInto } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 지난 문의 하나 (답함)
const OLD = { id: 1, category: "ACCOUNT", title: "닉네임 문의", status: "ANSWERED", createdAt: "2026-11-10T01:00:00.000Z", answeredAt: "2026-11-11T01:00:00.000Z" }

// 문의 창 열고 "문의 쓰기" 칸으로
async function openForm(routes = {}) {
  signIn()
  const http = installFetch({ "GET /inquiries": { body: { ok: true, inquiries: [OLD] } }, ...routes })
  await act(async () => { render(React.createElement(InquiryWindow, { open: true, onClose: () => {} })); await settle() })
  await press(screen.getByTestId("inquiry-tab-form"))
  return http
}

// 종류·제목·내용 넣기
async function fill({ category = "버그", title = "", body = "" } = {}) {
  await press(screen.getByRole("radio", { name: category }))
  if (title) await typeInto(screen.getByTestId("inquiry-title"), title)
  if (body) await typeInto(screen.getByTestId("inquiry-body"), body)
}

test("A13-F-248 제목 비움 → 보내기 꺼짐, 요청 0", async () => {
  const http = await openForm()
  await fill({ body: "낮 투표 때 화면이 멈춰요" })
  await press(screen.getByTestId("inquiry-submit"))
  assert.equal(http.to("POST", "/inquiries").length, 0)
  assert.equal(screen.getByTestId("inquiry-submit").disabled, true, "제목이 비었는데 보내기 단추가 켜져 있음")
})

test("A13-F-249 보내기 성공 → 내 목록 맨 위 \"답 기다림\"", async () => {
  await openForm({
    "POST /inquiries": { status: 201, body: { ok: true, inquiry: { id: 9, category: "BUG", title: "판이 멈춤", body: "낮에 멈춤", status: "OPEN", createdAt: "2026-11-16T01:00:00.000Z" } } },
  })
  await fill({ title: "판이 멈춤", body: "낮에 멈춤" })
  await press(screen.getByTestId("inquiry-submit"))
  const rows = [...document.querySelectorAll('[data-testid^="inquiry-row-"]')]
  assert.equal(rows[0].getAttribute("data-testid"), "inquiry-row-9")
  assert.match(rows[0].textContent, /판이 멈춤/)
  assert.match(rows[0].textContent, /답 기다림/)
})

test("A13-F-250 429 INQUIRY_RATE_LIMITED → \"잠시 뒤 다시\" 든 글", async () => {
  await openForm({ "POST /inquiries": { status: 429, body: { ok: false, code: "INQUIRY_RATE_LIMITED", message: "too many" } } })
  await fill({ title: "또 문의", body: "또 써요" })
  await press(screen.getByTestId("inquiry-submit"))
  assert.match(screen.getByTestId("inquiry-message").textContent, /잠시 뒤에? 다시/)
})

// 2-6 결제 화면 시험: 주문 찾기(조건 → 주소), 주문 열기 → 환불(사유 비면 버튼 꺼짐) → 환불됨, 다이아 모자람 → 안내·지급됨 그대로
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, within } = await import("@testing-library/react")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { default: PaymentsPage } = await import("../../../src/admin/domains/payments/pages/PaymentsPage.jsx")

test.afterEach(() => cleanup())

const ORDER = {
  orderId: "ord-abc123", user: { uuid: "11111111-2222-4333-8444-555555555555", nickname: "가면1" }, productId: "diamond-110", version: 1,
  orderName: "다이아 110개", payAmount: 1100, grantAmount: 100, bonusAmount: 10, status: "GRANTED", failureCode: null,
  createdAt: "2026-11-10T03:00:00.000Z", approvedAt: "2026-11-10T03:00:01.000Z", grantedAt: "2026-11-10T03:00:02.000Z",
}
const TOPUP_LINE = { id: 1, reason: "DIAMOND_TOPUP", currency: "DIAMOND", amount: 110, balanceAfter: 110, referenceEventId: "topup:ord-abc123", createdAt: ORDER.grantedAt }

const open = async (path) => {
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/payments/*", element: React.createElement(PaymentsPage) }))))
  })
}

test("AD-186 주문 목록 → 조건 넣고 찾기 → 주소에 조건, 날짜는 한국 0시 기준", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answerWith("GET /admin-api/payments/orders", () => ({ status: 200, body: { ok: true, items: [ORDER], nextBefore: null } }))
  const filtered = `GET /admin-api/payments/orders?userUuid=${ORDER.user.uuid}&status=GRANTED&from=2026-11-09T15%3A00%3A00.000Z&to=2026-11-10T15%3A00%3A00.000Z`
  server.answer(filtered, 200, { ok: true, items: [], nextBefore: null })
  await open("/payments")
  assert.ok(screen.getByRole("cell", { name: "가면1" }))
  assert.ok(screen.getByRole("cell", { name: "지급됨" }))

  fireEvent.change(screen.getByLabelText("회원 UUID"), { target: { value: ` ${ORDER.user.uuid} ` } })
  fireEvent.change(screen.getByLabelText("상태"), { target: { value: "GRANTED" } })
  fireEvent.change(screen.getByLabelText("시작 날짜"), { target: { value: "2026-11-10" } })
  fireEvent.change(screen.getByLabelText("끝 날짜"), { target: { value: "2026-11-10" } })
  assert.equal(server.calls.length, 1)
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "찾기" })) })
  assert.equal(server.calls.at(-1).url, filtered.slice(4))
  assert.ok(screen.getByText("맞는 주문이 없어요. 찾는 조건을 바꿔 보세요."))
})

test("AD-186 주문 열기 → 환불 → 사유 비면 꺼짐 → 사유 넣고 환불 → 환불됨", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let refunded = false
  server.answer("GET /admin-api/payments/orders", 200, { ok: true, items: [ORDER], nextBefore: null })
  server.answerWith(`GET /admin-api/payments/orders/${ORDER.orderId}`, () => ({
    status: 200,
    body: { ok: true, order: { ...ORDER, status: refunded ? "REFUNDED" : "GRANTED" }, ledger: [TOPUP_LINE] },
  }))
  server.answerWith(`POST /admin-api/payments/orders/${ORDER.orderId}/refund`, () => {
    refunded = true
    return { status: 200, body: { ok: true, order: { orderId: ORDER.orderId, status: "REFUNDED" }, ledgerEntry: { id: 2, amount: -110, balanceAfter: 0 } } }
  })
  await open("/payments")
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "열기" })) })
  assert.equal(screen.getByTestId("order-status").textContent, "지급됨")
  fireEvent.click(screen.getByRole("button", { name: "환불" }))

  const dialog = screen.getByRole("dialog")
  assert.match(dialog.textContent, /되돌릴 다이아: 110/)
  assert.match(dialog.textContent, /결제 회사 화면에서/)
  const confirm = within(dialog).getByRole("button", { name: "환불" })
  assert.equal(confirm.disabled, true)
  fireEvent.change(within(dialog).getByLabelText("사유"), { target: { value: " 결제 취소함 " } })
  await act(async () => { fireEvent.click(confirm) })

  const post = server.calls.find((call) => call.method === "POST")
  assert.deepEqual(JSON.parse(post.body), { reason: "결제 취소함" })
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(screen.getByTestId("order-status").textContent, "환불됨")
  assert.match(screen.getByRole("status").textContent, /다이아 -110/)
  assert.equal(screen.queryByRole("button", { name: "환불" }), null)
})

test("AD-187 다이아 모자람 → 창에 안내, 주문은 지급됨 그대로", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(`GET /admin-api/payments/orders/${ORDER.orderId}`, 200, { ok: true, order: ORDER, ledger: [TOPUP_LINE] })
  server.answer(`POST /admin-api/payments/orders/${ORDER.orderId}/refund`, 409, {
    ok: false, code: "REFUND_BALANCE_SHORT", message: "다이아가 모자라 환불을 멈췄어요. 지금 60, 되돌릴 양 110", balance: 60, needed: 110,
  })
  await open(`/payments/orders/${ORDER.orderId}`)
  fireEvent.click(screen.getByRole("button", { name: "환불" }))
  const dialog = screen.getByRole("dialog")
  fireEvent.change(within(dialog).getByLabelText("사유"), { target: { value: "결제 취소함" } })
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "환불" })) })
  assert.match(within(screen.getByRole("dialog")).getByRole("alert").textContent, /다이아가 모자라 환불을 멈췄어요/)
  assert.equal(screen.getByTestId("order-status").textContent, "지급됨")
})

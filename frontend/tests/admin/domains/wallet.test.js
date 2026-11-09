// 2-8 골드·다이아 칸 화면 시험: 잔액·장부 보임, 주기 → 확인 창 → 요청 번호·금액·사유 보냄, 모자란 뺏기 → 안내·숫자 그대로
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, within } = await import("@testing-library/react")
const { default: WalletPanel } = await import("../../../src/admin/domains/wallet/components/WalletPanel.jsx")

test.afterEach(() => cleanup())

const UUID = "11111111-2222-4333-8444-555555555555"
const PATH = `/admin-api/members/${UUID}/wallet`
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const walletBody = (gold, diamond, ledger = []) => ({ ok: true, gold, diamond, ledger })
const LEDGER_ROW = { id: 9, reason: "ADMIN_GRANT", currency: "GOLD", amount: 500, balanceAfter: 500, referenceEventId: "admin:x", createdAt: "2026-11-10T03:00:00.000Z" }

const open = async () => {
  await act(async () => { render(React.createElement(WalletPanel, { uuid: UUID })) })
}

const fill = (amount, reason) => {
  fireEvent.change(screen.getByLabelText("금액"), { target: { value: amount } })
  fireEvent.change(screen.getByLabelText("사유"), { target: { value: reason } })
}

const confirmInDialog = async (name) => {
  const dialog = screen.getByRole("dialog")
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name })) })
}

test("AD-205 잔액·최근 장부가 보이고 사유가 비면 주기·뺏기 버튼 꺼짐", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(`GET ${PATH}`, 200, walletBody(1200, 30, [LEDGER_ROW]))
  await open()
  assert.equal(screen.getByTestId("wallet-gold").textContent, "1,200")
  assert.equal(screen.getByTestId("wallet-diamond").textContent, "30")
  assert.ok(screen.getByRole("cell", { name: "관리자 지급" }))
  assert.ok(screen.getByRole("cell", { name: "골드 +500" }))
  fireEvent.change(screen.getByLabelText("금액"), { target: { value: "100" } })
  assert.equal(screen.getByRole("button", { name: "주기" }).disabled, true)
  assert.equal(screen.getByRole("button", { name: "뺏기" }).disabled, true)
  fill("0", "보상")
  assert.equal(screen.getByRole("button", { name: "주기" }).disabled, true)
})

test("AD-205 주기 → 확인 창(재화·금액·사유) → 보낸 몸 → 숫자 다시 읽음", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let gold = 0
  server.answerWith(`GET ${PATH}`, () => ({ status: 200, body: walletBody(gold, 0) }))
  server.answerWith(`POST ${PATH}/adjust`, () => {
    gold = 500
    return { status: 200, body: { ok: true, ledgerEntry: { ...LEDGER_ROW }, balance: 500 } }
  })
  await open()
  fill("500", "  버그 보상  ")
  fireEvent.click(screen.getByRole("button", { name: "주기" }))
  const dialog = screen.getByRole("dialog")
  assert.match(dialog.textContent, /재화: 골드/)
  assert.match(dialog.textContent, /금액: \+500/)
  assert.match(dialog.textContent, /사유: 버그 보상/)
  await confirmInDialog("주기")

  const post = server.calls.find((call) => call.method === "POST")
  const body = JSON.parse(post.body)
  assert.match(body.requestId, UUID_SHAPE)
  assert.deepEqual({ ...body, requestId: "x" }, { requestId: "x", currency: "GOLD", amount: 500, reason: "버그 보상" })
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(screen.getByTestId("wallet-gold").textContent, "500")
  assert.match(screen.getByRole("status").textContent, /골드 \+500 처리했어요/)
})

test("AD-205 모자란 뺏기 → 서버 안내가 창에 보이고 숫자 그대로, 다시 눌러도 같은 요청 번호, 금액 바꾸면 새 번호", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(`GET ${PATH}`, 200, walletBody(100, 0))
  server.answer(`POST ${PATH}/adjust`, 409, { ok: false, code: "BALANCE_SHORT", message: "뺏을 양이 모자라요. 지금 100, 뺏으려는 양 101", balance: 100, needed: 101 })
  await open()
  fill("101", "잘못 준 골드 회수")
  fireEvent.click(screen.getByRole("button", { name: "뺏기" }))
  assert.match(screen.getByRole("dialog").textContent, /금액: -101/)
  await confirmInDialog("뺏기")
  assert.ok(within(screen.getByRole("dialog")).getByRole("alert").textContent.includes("뺏을 양이 모자라요"))
  assert.equal(screen.getByTestId("wallet-gold").textContent, "100")
  await confirmInDialog("뺏기")

  const posts = server.calls.filter((call) => call.method === "POST").map((call) => JSON.parse(call.body))
  assert.equal(posts.length, 2)
  assert.equal(posts[0].amount, -101)
  assert.equal(posts[0].requestId, posts[1].requestId)

  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" }))
  fill("50", "잘못 준 골드 회수")
  fireEvent.click(screen.getByRole("button", { name: "뺏기" }))
  await confirmInDialog("뺏기")
  const third = JSON.parse(server.calls.filter((call) => call.method === "POST")[2].body)
  assert.notEqual(third.requestId, posts[0].requestId)
})

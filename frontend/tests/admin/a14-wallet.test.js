// 관리자 골드·다이아 칸 시험: 금액 0이면 주기·뺏기 꺼짐, 뺏을 양이 모자라면(409) 모자람 글·지갑 숫자 그대로
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-102~103, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-wallet.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, within, cleanup, type, press, settle, buttonNamed, dialog, callsOf, createFakeServer, MEMBER_UUID } from "./a14-kit.mjs"

const { default: WalletPanel } = await import("../../src/admin/domains/wallet/components/WalletPanel.jsx")

test.afterEach(() => cleanup())

const ADJUST = `/admin-api/members/${MEMBER_UUID}/wallet/adjust`

// 골드 100인 지갑 칸 열기
async function openWallet() {
  const server = createFakeServer()
  server.answer(`GET /admin-api/members/${MEMBER_UUID}/wallet`, 200, { ok: true, gold: 100, diamond: 5, ledger: [] })
  render(h(WalletPanel, { uuid: MEMBER_UUID }))
  await settle()
  return server
}
const goldShown = () => document.querySelector('[data-testid="wallet-gold"]')?.textContent ?? ""

test("A14-F-102 재화 칸: 금액 0 → 주기·뺏기 꺼짐", async () => {
  const server = await openWallet()
  await type(screen.getByLabelText("사유"), "버그 보상")
  await type(screen.getByLabelText("금액"), "0")
  assert.equal(buttonNamed("주기").disabled, true)
  assert.equal(buttonNamed("뺏기").disabled, true)
  await press(buttonNamed("뺏기"))
  assert.ok(dialog() === null, "확인 창이 뜸")
  assert.equal(callsOf(server, "POST", ADJUST).length, 0)
  // 1이면 켜짐 (꺼진 까닭이 금액 0)
  await type(screen.getByLabelText("금액"), "1")
  assert.equal(buttonNamed("주기").disabled, false)
})

test("A14-F-103 재화 칸: 409 BALANCE_SHORT → 모자람 글, 지갑 숫자 그대로", async () => {
  const server = await openWallet()
  server.answer(`POST ${ADJUST}`, 409, { ok: false, code: "BALANCE_SHORT", message: "뺏을 양이 모자라요. 지금 100, 뺏으려는 양 500" })
  await type(screen.getByLabelText("금액"), "500")
  await type(screen.getByLabelText("사유"), "잘못 준 골드 회수")
  await press(buttonNamed("뺏기"))
  await press(within(dialog()).getByRole("button", { name: "뺏기" }))
  await settle()
  const alert = within(dialog()).queryByRole("alert")
  assert.ok(alert !== null, "모자람 글이 없음")
  assert.match(alert.textContent, /모자라/)
  assert.equal(goldShown(), "100")
  assert.equal(JSON.parse(callsOf(server, "POST", ADJUST)[0].body).amount, -500)
})

// 관리자 판 설정 화면 시험: 바꾸기 확인 창 글, 범위 밖 값이면 글만 뜨고 창 안 뜸, 저장 뒤 서버별 반영 줄
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-104~106 (A07-F-076~095와 겹치는 값은 목록대로 다시 봄), 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-game-settings-admin.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, within, cleanup, type, press, settle, dialog, bodyText, callsOf, createFakeServer } from "./a14-kit.mjs"

const { default: GameSettingsPage } = await import("../../src/admin/domains/gameSettings/pages/GameSettingsPage.jsx")

test.afterEach(() => cleanup())

const PATH = "/admin-api/game-settings"
const viewOf = (goldReward) => ({
  ok: true, settings: { goldReward, updatedAt: null, updatedBy: null }, limits: { goldReward: { min: 0, max: 100 } },
  node: { goldReward, loadedAt: "2026-11-16T03:00:00.000Z" },
})

// 지금 값 1인 판 설정 화면 열기, put: 저장 응답
async function openPage(put = null) {
  const server = createFakeServer()
  server.answer(`GET ${PATH}`, 200, viewOf(1))
  if (put) server.answer(`PUT ${PATH}`, 200, put)
  render(h(GameSettingsPage))
  await settle()
  return server
}

// 칸에 값 넣고 폼의 "바꾸기"
async function submit(text) {
  const field = screen.getByLabelText("판마다 주는 골드")
  await type(field, text)
  await press(within(field.closest("form")).getByRole("button", { name: "바꾸기" }))
}

test("A14-F-104 판 설정 확인 창: 1 → 2 바꾸기 → \"1골드 → 2골드\"·\"이미 진행 중인 판은 시작할 때 값 그대로 줘요.\"", async () => {
  const server = await openPage()
  await submit("2")
  assert.ok(dialog() !== null, "확인 창이 안 뜸")
  const text = dialog().textContent
  assert.match(text, /1골드 → 2골드/)
  assert.match(text, /이미 진행 중인 판은 시작할 때 값 그대로 줘요\./)
  assert.equal(callsOf(server, "PUT", PATH).length, 0)
})

test("A14-F-105 판 설정 확인 창: 101 넣고 바꾸기 → \"0부터 100까지 정수로 넣어 주세요.\", 확인 창 안 뜸", async () => {
  const server = await openPage()
  await submit("101")
  assert.ok(dialog() === null, "확인 창이 뜸")
  assert.match(bodyText(), /0부터 100까지 정수로 넣어 주세요\./)
  assert.equal(callsOf(server, "PUT", PATH).length, 0)
})

test("A14-F-106 판 설정 서버별 결과: 저장 응답 nodes 중 n2 실패 → \"n2 반영 안 됨\"", async () => {
  await openPage({ ...viewOf(2), nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true })
  await submit("2")
  await press(within(dialog()).getByRole("button", { name: "바꾸기" }))
  await settle()
  const lines = [...within(screen.getByRole("region", { name: "서버별 반영" })).getAllByRole("listitem")].map((li) => li.textContent)
  assert.ok(lines.some((line) => line.startsWith("n2 반영 안 됨")), `n2 줄 없음: ${lines.join(" / ")}`)
  assert.ok(lines.includes("n1 반영됨"), "n1 줄 없음")
})

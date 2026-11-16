// 관리자 판 설정 화면 시험: 지금 값 보기, 입력 경계(0~100 정수), 확인 창 글·취소·저장, 서버 거절·일부 서버 반영·불러오기 실패, 메뉴 "판 설정", 기록 이름, 안내 글
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-076~095 (화면 부품, 가짜 관리자 서버)
import test from "node:test"
import assert from "node:assert/strict"
import { createFakeServer, ME_OK } from "./helpers/adminDom.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, act, within } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: GameSettingsPage } = await import("../../src/admin/domains/gameSettings/pages/GameSettingsPage.jsx")
const { AdminScreens } = await import("../../src/admin/app/AdminApp.jsx")
const { default: AuditRow } = await import("../../src/admin/domains/auditLogs/components/AuditRow.jsx")
const { ledgerReasonLabel } = await import("../../src/admin/domains/wallet/api/wallet.api.js")

const h = React.createElement
const PATH = "/admin-api/game-settings"
const RANGE_ERROR = "0부터 100까지 정수로 넣어 주세요."

test.afterEach(() => cleanup())

// 서버 보기 답 (backend/tests/admin/a07-game-settings 모양): 값 하나로 만듦
const viewOf = (goldReward) => ({
  ok: true,
  settings: { goldReward, updatedAt: null, updatedBy: null },
  limits: { goldReward: { min: 0, max: 100 } },
  node: { goldReward, loadedAt: "2026-11-16T03:00:00.000Z" },
})

// 마이크로 작업 흘려 보내기 (가짜 서버 답이 화면에 닿게)
async function settle(times = 10) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// 판 설정 화면 (서버 값 start), 저장하면 서버 값이 바뀌어 다시 보기도 새 값
async function openPage({ start = 1, put = null } = {}) {
  const server = createFakeServer()
  let value = start
  server.answerWith(`GET ${PATH}`, () => ({ status: 200, body: viewOf(value) }))
  server.answerWith(`PUT ${PATH}`, () => {
    if (put) return put()
    const body = JSON.parse(server.calls.at(-1).body)
    value = body.goldReward
    return { status: 200, body: { ...viewOf(value), nodes: [{ node: "n1", ok: true }], partial: false } }
  })
  render(h(GameSettingsPage))
  await settle()
  return server
}

const goldNow = () => document.querySelector('[data-testid="game-settings-gold"]')?.textContent ?? ""
const input = () => screen.getByLabelText("판마다 주는 골드")
const dialog = () => screen.queryByRole("dialog")
const puts = (server) => server.calls.filter((c) => c.method === "PUT" && c.url === PATH)
const gets = (server) => server.calls.filter((c) => c.method === "GET" && c.url === PATH)

// 칸에 글을 넣고 "바꾸기" (폼의 바꾸기 단추)
async function submitText(text) {
  await act(async () => { fireEvent.change(input(), { target: { value: text } }) })
  const form = input().closest("form")
  await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "바꾸기" })) })
  await settle()
}

test("A07-F-076 지금 값 보임: 가짜 서버 값 1 → \"1골드\"", async () => {
  await openPage({ start: 1 })
  assert.equal(goldNow(), "1골드")
})

// 입력 경계: 0·1·100은 확인 창, 나머지는 범위 글 (" 2 "는 지금 동작 — 숫자 칸이라 빈 값으로 받음)
const INPUT_CASES = [
  ["A07-F-077", "−1", "-1", false],
  ["A07-F-078", "0", "0", true],
  ["A07-F-079", "1", "1", true],
  ["A07-F-080", "100", "100", true],
  ["A07-F-081", "101", "101", false],
  ["A07-F-082", "1.5", "1.5", false],
  ["A07-F-083", "\"abc\"", "abc", false],
  ["A07-F-084", "빈칸", "", false],
  ["A07-F-085", "\" 2 \"", " 2 ", false],
]
for (const [no, name, text, opensDialog] of INPUT_CASES) {
  test(`${no} 입력 경계: ${name} → ${opensDialog ? "확인 창" : `"${RANGE_ERROR}"`}`, async () => {
    const server = await openPage({ start: 1 })
    await submitText(text)
    if (opensDialog) {
      assert.ok(dialog() !== null, "확인 창이 안 뜸")
      assert.equal(document.body.textContent.includes(RANGE_ERROR), false)
    } else {
      assert.ok(dialog() === null, "없어야 할 것이 있음: dialog()")
      assert.ok(screen.queryByText(RANGE_ERROR) !== null, "범위 글이 없음")
    }
    // 확인 전엔 저장 안 함
    assert.equal(puts(server).length, 0)
  })
}

test("A07-F-086 확인 창 글: 1 → 2 → \"1골드 → 2골드\" + \"이미 진행 중인 판은 시작할 때 값 그대로 줘요.\"", async () => {
  await openPage({ start: 1 })
  await submitText("2")
  const box = dialog()
  assert.ok(box !== null, "확인 창이 안 뜸")
  assert.match(box.textContent, /1골드 → 2골드/)
  assert.match(box.textContent, /이미 진행 중인 판은 시작할 때 값 그대로 줘요\./)
})

test("A07-F-087 취소면 저장 안 함: 확인 창 취소 → PUT 0번, 값 그대로", async () => {
  const server = await openPage({ start: 1 })
  await submitText("2")
  await act(async () => { fireEvent.click(within(dialog()).getByRole("button", { name: "취소" })) })
  await settle()
  assert.ok(dialog() === null, "없어야 할 것이 있음: dialog()")
  assert.equal(puts(server).length, 0)
  assert.equal(goldNow(), "1골드")
})

test("A07-F-088 확인이면 숫자로 저장: PUT 몸 { goldReward: 2 }(숫자), 뒤에 \"2골드\"", async () => {
  const server = await openPage({ start: 1 })
  await submitText("2")
  await act(async () => { fireEvent.click(within(dialog()).getByRole("button", { name: "바꾸기" })) })
  await settle()
  assert.equal(puts(server).length, 1)
  const body = JSON.parse(puts(server)[0].body)
  assert.deepEqual(body, { goldReward: 2 })
  assert.equal(typeof body.goldReward, "number")
  assert.equal(goldNow(), "2골드")
})

test("A07-F-089 서버 거절 글: PUT 400 → 오류 글 보임, 값 그대로", async () => {
  await openPage({ start: 1, put: () => ({ status: 400, body: { ok: false, code: "INVALID_INPUT", message: "값이 틀려요", field: "goldReward" } }) })
  await submitText("2")
  await act(async () => { fireEvent.click(within(dialog()).getByRole("button", { name: "바꾸기" })) })
  await settle()
  const alert = within(dialog()).queryByRole("alert")
  assert.ok(alert !== null, "거절 글이 없음")
  assert.ok(alert.textContent.trim().length > 0)
  assert.equal(goldNow(), "1골드")
})

test("A07-F-090 일부 서버만 반영: 응답 partial true → 일부 서버 안내 글", async () => {
  await openPage({
    start: 1,
    put: () => ({ status: 200, body: { ...viewOf(2), nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true } }),
  })
  await submitText("2")
  await act(async () => { fireEvent.click(within(dialog()).getByRole("button", { name: "바꾸기" })) })
  await settle()
  assert.match(document.body.textContent, /반영 안 된 서버는 60초 안에 스스로 다시 읽어요/)
  assert.match(document.body.textContent, /n2 반영 안 됨/)
})

test("A07-F-091 불러오기 실패: GET 실패 → 오류 + 다시 시도 단추 → 누르면 다시 GET", async () => {
  const server = createFakeServer()
  let fail = true
  server.answerWith(`GET ${PATH}`, () => (fail ? { status: 500, body: { ok: false, code: "ADMIN_INTERNAL", message: "" } } : { status: 200, body: viewOf(1) }))
  render(h(GameSettingsPage))
  await settle()
  assert.ok(screen.queryByRole("alert") !== null, "오류 글이 없음")
  const retry = screen.getByRole("button", { name: "다시 불러오기" })
  assert.equal(gets(server).length, 1)
  fail = false
  await act(async () => { fireEvent.click(retry) })
  await settle()
  assert.equal(gets(server).length, 2)
  assert.equal(goldNow(), "1골드")
})

test("A07-F-092 메뉴에 \"판 설정\": 관리자 메뉴 → \"판 설정\" 줄, 누르면 이 화면", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  server.answerWith(`GET ${PATH}`, () => ({ status: 200, body: viewOf(1) }))
  render(h(MemoryRouter, { initialEntries: ["/audit-logs"] }, h(AdminScreens)))
  await settle(20)
  const menu = screen.getByRole("navigation", { name: "관리자 메뉴" })
  const link = within(menu).getByRole("link", { name: "판 설정" })
  await act(async () => { fireEvent.click(link) })
  await settle(20)
  assert.ok(screen.getByRole("heading", { level: 1, name: "판 설정" }), "판 설정 화면 제목 없음")
  assert.equal(gets(server).length, 1)
  assert.equal(goldNow(), "1골드")
})

test("A07-F-093 감사 기록 화면 이름: 기록 GAME_SETTING_UPDATE → \"판 골드 바꿈\"", () => {
  render(h(AuditRow, {
    row: {
      id: 1, action: "GAME_SETTING_UPDATE", targetType: "GAME_SETTING", targetId: "GAME_GOLD_REWARD",
      before: { goldReward: 1 }, after: { goldReward: 2 }, reason: null, createdAt: "2026-11-16T03:00:00.000Z", admin: { loginId: "ceo" },
    },
  }))
  assert.ok(screen.queryByText("판 골드 바꿈") !== null, "기록 이름이 없음")
  assert.equal(document.body.textContent.includes("GAME_SETTING_UPDATE"), false)
})

test("A07-F-094 관리자 지갑 장부 이름: 장부 사유 GAME_REWARD → \"판 보상\"", () => {
  assert.equal(ledgerReasonLabel("GAME_REWARD"), "판 보상")
  // 모르는 코드는 코드 그대로 (늘 "판 보상"이 아님)
  assert.equal(ledgerReasonLabel("SOME_CODE"), "SOME_CODE")
})

test("A07-F-095 안내 글: 칸 아래 \"산 채로 나간 사람은 못 받아요. 0이면 안 줘요.\"", async () => {
  await openPage({ start: 1 })
  const hintId = input().getAttribute("aria-describedby")
  assert.ok(hintId, "칸에 도움말 연결이 없음")
  const hint = document.getElementById(hintId.split(" ")[0])
  assert.match(hint.textContent, /산 채로 나간 사람은 못 받아요\. 0이면 안 줘요\./)
})

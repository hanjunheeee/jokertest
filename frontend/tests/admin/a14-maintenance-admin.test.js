// 관리자 점검 화면 시험: 옆 점검 순서 8단계, 지금 단계 표시(예약 전·점검 중 판 n개), 서버별 반영 줄, 시작 시각 없으면 켜기 막음
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-093~098, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-maintenance-admin.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, screen, within, cleanup, openAt, type, press, settle, buttonNamed, dialog, bodyText, callsOf, createFakeServer } from "./a14-kit.mjs"

const { default: MaintenancePage } = await import("../../src/admin/domains/maintenance/pages/MaintenancePage.jsx")

test.afterEach(() => cleanup())

const OFF = { enabled: false, active: false, message: null, startsAt: null, endsAt: null, updatedAt: null }
const viewOf = (maintenance = OFF, liveGames = 0) => ({ ok: true, maintenance, liveGames, liveRooms: 0, liveNodes: [], forceEnds: [] })

// 점검 화면 열기 (지금 상태 view)
async function openPage(view = viewOf()) {
  const server = createFakeServer()
  server.answer("GET /admin-api/maintenance", 200, view)
  await openAt("/maintenance", h(MaintenancePage))
  return server
}
const steps = () => [...within(screen.getByRole("complementary", { name: "점검 순서" })).getAllByRole("listitem")]
const currentStep = () => steps().find((li) => li.getAttribute("aria-current") === "step")?.textContent ?? ""
const stageText = () => document.querySelector('[data-testid="maintenance-stage"]')?.textContent ?? ""

test("A14-F-093 점검 순서 8단계: 점검 화면 옆 순서 8줄(미리 공지 → … → 끝 공지)", async () => {
  await openPage()
  const lines = steps().map((li) => li.textContent)
  assert.equal(lines.length, 8)
  assert.match(lines[0], /미리 공지/)
  assert.match(lines[7], /끝 공지/)
})

// 지금 단계 (값 2)
test("A14-F-094 지금 단계 숫자: 예약 전 → 그 단계 표시", async () => {
  await openPage()
  assert.match(stageText(), /\d+단계/)
  assert.match(stageText(), /예약 전/)
  assert.match(currentStep(), /미리 공지/)
})

test("A14-F-095 지금 단계 숫자: 점검 중·판 3개 남음 → 그 단계 표시·\"판 3개\"", async () => {
  await openPage(viewOf({ ...OFF, enabled: true, active: true, startsAt: "2026-11-16T03:00:00.000Z" }, 3))
  assert.match(stageText(), /\d+단계/)
  assert.match(stageText(), /점검 중/)
  assert.match(stageText(), /판 3개/)
  assert.match(currentStep(), /진행 판 0개 확인/)
})

// 점검 예약 저장 → 서버별 반영 줄, saved: 저장 응답
async function scheduleAndSave(saved) {
  const server = await openPage()
  server.answer("PUT /admin-api/maintenance", 200, saved)
  await type(screen.getByLabelText("시작 시각 (한국 시각)"), "2026-11-20T12:00")
  await press(buttonNamed("점검 예약하기"))
  await press(within(dialog()).getByRole("button", { name: "예약하기" }))
  await settle()
  return server
}
const SCHEDULED = { ...OFF, enabled: true, startsAt: "2026-11-20T03:00:00.000Z" }

test("A14-F-096 서버별 반영 줄: { node:'n2', ok:false, code:'RPC_TIMEOUT' } → \"n2 반영 안 됨 (RPC_TIMEOUT)\"", async () => {
  await scheduleAndSave({ ok: true, maintenance: SCHEDULED, nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true })
  const lines = [...within(screen.getByRole("region", { name: "서버별 반영" })).getAllByRole("listitem")].map((li) => li.textContent)
  assert.deepEqual(lines, ["n1 반영됨", "n2 반영 안 됨 (RPC_TIMEOUT)"])
})

test("A14-F-097 서버별 반영 줄: partial:true → \"반영 안 된 서버는 60초 안에 스스로 다시 읽어요…\" 안내", async () => {
  await scheduleAndSave({ ok: true, maintenance: SCHEDULED, nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true })
  assert.match(bodyText(), /반영 안 된 서버는 60초 안에 스스로 다시 읽어요/)
})

test("A14-F-098 켜기에 시작 시각 없으면 막음: 시작 시각 빔 → 칸 오류, 확인 창·저장 없음", async () => {
  const server = await openPage()
  await press(buttonNamed("점검 예약하기"))
  assert.ok(dialog() === null, "확인 창이 뜸")
  const field = screen.getByLabelText("시작 시각 (한국 시각)")
  assert.equal(field.getAttribute("aria-invalid"), "true")
  assert.match(bodyText(), /시작 시각을 넣어 주세요\./)
  assert.equal(callsOf(server, "PUT", "/admin-api/maintenance").length, 0)
})

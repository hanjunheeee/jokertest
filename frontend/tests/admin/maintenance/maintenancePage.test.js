// AD-162·163 점검 화면 시험: 점검 순서 8단계·지금 단계·남은 판 수, 저장 뒤 서버별 "n2 반영 안 됨", 한국 시각 ↔ 서버 시각
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth, ME_OK } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, act, fireEvent, within } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: MaintenancePage } = await import("../../../src/admin/domains/maintenance/pages/MaintenancePage.jsx")
const { default: MaintenanceSteps } = await import("../../../src/admin/domains/maintenance/components/MaintenanceSteps.jsx")
const { ReloadResults } = await import("../../../src/admin/domains/maintenance/components/NodeResults.jsx")
const api = await import("../../../src/admin/domains/maintenance/api/maintenance.api.js")
const { setCsrfToken } = await import("../../../src/admin/shared/api/adminClient.js")

test.afterEach(() => cleanup())

const KEY = "GET /admin-api/maintenance"
const OFF = { enabled: false, active: false, message: null, startsAt: null, endsAt: null, updatedAt: null }
const SCHEDULED = { enabled: true, active: false, message: "정기 점검", startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-10T04:00:00.000Z", updatedAt: null }
const ACTIVE = { ...SCHEDULED, active: true }
const viewOf = (maintenance, extra = {}) => ({ ok: true, maintenance, liveGames: 0, liveRooms: 0, liveNodes: [], forceEnds: [], ...extra })

const open = async () => {
  await act(async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(MaintenancePage)))
  })
}
const stage = () => screen.getByTestId("maintenance-stage").textContent
const currentStepTitle = () => screen.getByRole("listitem", { current: "step" }).textContent

// ── AD-162 ──

test("AD-162 점검 순서 8단계, 1·8단계는 공지 화면 바로 가기", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(KEY, 200, viewOf(OFF))
  await open()
  const list = within(screen.getByRole("complementary", { name: "점검 순서" })).getAllByRole("listitem")
  assert.equal(list.length, 8)
  const titles = ["미리 공지", "점검 예약", "시각이 되면 판 강제 종료", "진행 판 0개 확인", "배포", "확인", "점검 끄기", "끝 공지"]
  titles.forEach((title, index) => assert.ok(list[index].textContent.startsWith(`${index + 1}. ${title}`), list[index].textContent))
  const links = screen.getAllByRole("link", { name: "공지 화면으로" })
  assert.deepEqual(links.map((a) => a.getAttribute("href")), ["/announcements", "/announcements"])
})

// 순서 안내만 그려서 지금 단계 글귀 읽기
const stageFor = async (maintenance, liveGames) => {
  cleanup()
  await act(async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(MaintenanceSteps, { maintenance, liveGames })))
  })
  return stage()
}

test("AD-162 지금 단계: 예약 전 → 예약됨 → 점검 중·판 n개 남음 → 판 0개", async () => {
  assert.equal(await stageFor(OFF, 0), "1단계 · 예약 전")
  assert.equal(await stageFor(SCHEDULED, 3), "3단계 · 예약됨")
  assert.equal(await stageFor(ACTIVE, 2), "4단계 · 점검 중 · 판 2개 남음")
  assert.equal(await stageFor(ACTIVE, 0), "5단계 · 점검 중 · 판 0개")
  assert.equal(await stageFor(ACTIVE, null), "4단계 · 점검 중 · 남은 판 수 못 받음")
  assert.match(currentStepTitle(), /4\. 진행 판 0개 확인/)
})

test("AD-162 화면: 점검 중·판 2개 남음이면 4단계 표시, 남은 판·강제 종료 결과 보임", async () => {
  const server = createFakeServer()
  server.answer(KEY, 200, viewOf(ACTIVE, {
    liveGames: 2, liveRooms: 1,
    forceEnds: [{ node: "n1", games: 3, rooms: 1, at: "2026-11-10T03:00:01.000Z" }, { node: "n2", games: 0, rooms: 2, at: "2026-11-10T03:00:02.000Z" }],
  }))
  await open()
  assert.match(stage(), /4단계 · 점검 중 · 판 2개 남음/)
  assert.match(currentStepTitle(), /진행 판 0개 확인/)
  assert.equal(screen.getByTestId("maintenance-state").textContent, "점검 중")
  assert.equal(screen.getByTestId("maintenance-live-games").textContent, "2개")
  assert.ok(screen.getByText(/n1: 판 3개 끝냄 · 방 1개 닫음/))
  assert.ok(screen.getByText(/n2: 판 0개 끝냄 · 방 2개 닫음/))
})

test("AD-162 예약됨이면 3단계, 폼에 한국 시각으로 채워짐", async () => {
  const server = createFakeServer()
  server.answer(KEY, 200, viewOf(SCHEDULED))
  await open()
  assert.match(stage(), /3단계 · 예약됨/)
  assert.equal(screen.getByLabelText("시작 시각 (한국 시각)").value, "2026-11-10T12:00")
  assert.equal(screen.getByLabelText("안내 문구").value, "정기 점검")
  assert.ok(screen.getByRole("button", { name: "점검 끄기" }))
})

// ── 저장 + AD-163 ──

test("한국 시각 칸 ↔ 서버 시각 (UTC)", () => {
  assert.equal(api.kstInputToIso("2026-11-10T12:00"), "2026-11-10T03:00:00.000Z")
  assert.equal(api.kstInputToIso("2026-11-10T08:30"), "2026-11-09T23:30:00.000Z")
  assert.equal(api.isoToKstInput("2026-11-09T23:30:00.000Z"), "2026-11-10T08:30")
  assert.equal(api.kstInputToIso(""), null)
  assert.equal(api.isoToKstInput(null), "")
})

test("시작 시각 비면 예약 안 됨 (칸 옆 문구, 확인 창 안 뜸)", async () => {
  const server = createFakeServer()
  server.answer(KEY, 200, viewOf(OFF))
  await open()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "점검 예약하기" })) })
  assert.ok(screen.getByText("시작 시각을 넣어 주세요."))
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(server.calls.filter((c) => c.method === "PUT").length, 0)
})

test("AD-163 예약 → 확인 창 → PUT 몸(UTC) → 서버별 결과에 'n2 반영 안 됨', 단계 바뀜", async () => {
  setCsrfToken(ME_OK.csrfToken)
  const server = createFakeServer()
  let current = viewOf(OFF)
  server.answerWith(KEY, () => ({ status: 200, body: current }))
  server.answerWith("PUT /admin-api/maintenance", () => {
    current = viewOf(SCHEDULED, { liveGames: 1 })
    return { status: 200, body: { ok: true, maintenance: SCHEDULED, nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true } }
  })
  await open()
  fireEvent.change(screen.getByLabelText("시작 시각 (한국 시각)"), { target: { value: "2026-11-10T12:00" } })
  fireEvent.change(screen.getByLabelText("안내 문구"), { target: { value: " 정기 점검 " } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "점검 예약하기" })) })
  const dialog = screen.getByRole("dialog", { name: "점검을 예약할까요?" })
  assert.match(dialog.textContent, /시작: 2026-11-10 12:00/)
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "예약하기" })) })

  const put = server.calls.find((c) => c.method === "PUT")
  assert.deepEqual(JSON.parse(put.body), { enabled: true, message: "정기 점검", startsAt: "2026-11-10T03:00:00.000Z", endsAt: null })
  assert.equal(put.headers["X-Admin-Csrf"], "csrf-abc")
  assert.ok(screen.getByText("n2 반영 안 됨 (RPC_TIMEOUT)"))
  assert.ok(screen.getByText("n1 반영됨"))
  assert.ok(screen.getByText(/60초 안에 스스로 다시 읽어요/))
  assert.equal(screen.queryByRole("dialog"), null)
  assert.match(stage(), /3단계 · 예약됨/)
})

test("AD-163 모두 반영이면 빨간 줄·60초 글귀 없음, 코드 없으면 'n2 반영 안 됨'만", async () => {
  await act(async () => {
    render(React.createElement(ReloadResults, { nodes: [{ node: "n1", ok: true }, { node: "n2", ok: true }], partial: false }))
  })
  assert.equal(screen.queryByText(/반영 안 됨/), null)
  assert.equal(screen.queryByText(/60초/), null)
  cleanup()
  await act(async () => {
    render(React.createElement(ReloadResults, { nodes: [{ node: "n2", ok: false }], partial: true }))
  })
  assert.ok(screen.getByText("n2 반영 안 됨"))
})

test("점검 끄기 → 확인 창 → PUT 꺼짐 몸", async () => {
  const server = createFakeServer()
  let current = viewOf(ACTIVE)
  server.answerWith(KEY, () => ({ status: 200, body: current }))
  server.answerWith("PUT /admin-api/maintenance", () => {
    current = viewOf(OFF)
    return { status: 200, body: { ok: true, maintenance: OFF, nodes: [{ node: "n1", ok: true }], partial: false } }
  })
  await open()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "점검 끄기" })) })
  const dialog = screen.getByRole("dialog", { name: "점검을 끌까요?" })
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "끄기" })) })
  const put = server.calls.find((c) => c.method === "PUT")
  assert.deepEqual(JSON.parse(put.body), { enabled: false, message: null, startsAt: null, endsAt: null })
  assert.match(stage(), /1단계 · 예약 전/)
})

test("못 읽으면 오류 + 다시 불러오기", async () => {
  const server = createFakeServer()
  server.answer(KEY, 503, { ok: false, code: "ADMIN_BUSY", message: "밀림" })
  await open()
  assert.ok(screen.getByRole("alert"))
  assert.ok(screen.getByRole("button", { name: "다시 불러오기" }))
})

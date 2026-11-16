// 화면 상태 시험: 점검 안내 상태 — 예약 받으면 열림, 같은 안내 다시 받아도 닫힌 채, 취소면 사라짐, 10분·1분 선 다시 크게, 서버 시계 기준, 강제 종료 확인
// 목록 A18-F-010~015·029 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-maintenance/maintenance-store.test.js

// 점검 안내를 앱처럼 그리고 가짜 소켓으로 신호를 넣어 스토어 값·화면을 봄, 1초 시계는 가짜 시계로 넘김
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const M = await import("./maintenanceKit.mjs")
const { MIN } = M

test.afterEach(() => M.resetAll())

const T0 = Date.parse("2026-11-10T05:00:00Z")
const state = () => M.useMaintenanceStore.getState()

// 가짜 시계 켜고 점검 안내 그림
function open(t, now = T0) {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now })
  t.after(() => t.mock.timers.reset())
  return M.renderNotice()
}

test("A18-F-010 예약 안내(시작 30분 뒤) 받음 → 큰 안내 열림, 단계 0", async (t) => {
  const { socket } = open(t)
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ startsAt: T0 + 30 * MIN, serverNow: T0 }))
  assert.equal(state().open, true)
  assert.equal(state().stage, 0)
  assert.ok(M.bigNotice())
})

test("A18-F-011 [지금 동작] 받음 → 닫음 → 다시 접속해 같은 안내 받음 → 닫힌 채", async (t) => {
  const { socket } = open(t)
  const notice = M.noticeOf({ startsAt: T0 + 30 * MIN, serverNow: T0, message: "정기 점검" })
  await M.serverSays(socket, "maintenance_notice", notice)
  await M.press("확인했어요")
  assert.equal(M.bigNotice() === null, true)
  await M.passTime(t, 5_000)
  await M.serverSays(socket, "maintenance_notice", { ...notice, serverNow: new Date(T0 + 5_000).toISOString() })
  assert.equal(state().open, false)
  assert.equal(M.bigNotice() === null, true)
})

test("A18-F-012 예약 받음 → cleared → 큰 안내 없음, 띠 없음", async (t) => {
  const { socket } = open(t)
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ startsAt: T0 + 30 * MIN, serverNow: T0 }))
  assert.ok(M.bigNotice())
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ state: "cleared", serverNow: T0 }))
  assert.equal(state().notice, null)
  assert.equal(M.bigNotice() === null, true)
  assert.equal(M.band() === null, true)
})

// 시작 11분 전 받고 닫음
async function closedAt11Minutes(t) {
  const { socket } = open(t)
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ startsAt: T0 + 11 * MIN, serverNow: T0 }))
  await M.press("확인했어요")
  assert.equal(M.bigNotice() === null, true)
  assert.ok(M.band(), "닫으면 띠로 남음")
  return socket
}

test("A18-F-013 시작 11분 전 받고 닫음 → 10분 선 지나 1초 확인 → 다시 열림", async (t) => {
  await closedAt11Minutes(t)
  await M.passTime(t, 59_000)
  assert.equal(M.bigNotice() === null, true, "10분 선 전엔 닫힌 채")
  await M.passTime(t, 1_000)
  assert.ok(M.bigNotice())
  assert.equal(state().stage, 1)
})

test("A18-F-014 10분 선에서 다시 연 뒤 닫음 → 1분 선 넘으면 다시 열림", async (t) => {
  await closedAt11Minutes(t)
  await M.passTime(t, 60_000)
  assert.ok(M.bigNotice())
  await M.press("확인했어요")
  await M.passTime(t, 8 * MIN + 59_000)
  assert.equal(M.bigNotice() === null, true, "1분 선 전엔 닫힌 채")
  await M.passTime(t, 1_000)
  assert.ok(M.bigNotice())
  assert.equal(state().stage, 2)
})

test("A18-F-015 기기 시계 5분 느림 + 서버 기준 20분 뒤 시작 → 남은 시간 20분 (25분 아님)", async (t) => {
  const device = T0
  const server = T0 + 5 * MIN
  const { socket } = open(t, device)
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ startsAt: server + 20 * MIN, serverNow: server }))
  const remaining = M.bigNotice().querySelector("[data-maintenance-remaining]")
  assert.equal(remaining.textContent, "20분 00초")
})

test("A18-F-029 [지금 동작] 예약 안내 열림 + 점검으로 판 끝남 → \"로비로 가기\" 한 번 → 둘 다 닫힘", async (t) => {
  const { socket } = open(t)
  await M.serverSays(socket, "maintenance_notice", M.noticeOf({ startsAt: T0 + 30 * MIN, serverNow: T0 }))
  await M.serverSays(socket, "game_ended", { reason: "MAINTENANCE" })
  await M.press("로비로 가기")
  assert.equal(state().forcedEnd, null)
  assert.equal(state().open, false)
  assert.equal(M.bigNotice() === null, true)
})

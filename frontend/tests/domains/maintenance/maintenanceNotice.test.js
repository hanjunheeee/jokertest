// AD-150~154 점검 큰 안내 화면 시험: 가짜 소켓 신호로 큰 안내·띠·10분/1분 전·취소·강제 종료·전적 글
// 서버 신호(2-2)는 경계.md 약속 모양 그대로 흉내 냄
import assert from "node:assert/strict"
import test, { mock } from "node:test"
import React from "react"
import "../../admin/helpers/adminDom.mjs"

const { render, cleanup, act, screen, fireEvent } = await import("@testing-library/react")
const { default: MaintenanceNotice } = await import("../../../src/domains/maintenance/components/MaintenanceNotice.jsx")
const { useMaintenanceStore } = await import("../../../src/domains/maintenance/store/maintenanceStore.js")
const { describeWinReason } = await import("../../../src/domains/maintenance/utils/maintenanceText.js")

// 기기 시계 (서버보다 1분 늦음)
const DEVICE_NOW = Date.parse("2026-11-10T05:00:00.000Z")
const SERVER_NOW = DEVICE_NOW + 60 * 1000
const MIN = 60 * 1000

// 가짜 소켓: on/off로 붙이고 fire로 신호 보냄
function fakeSocket() {
  const handlers = new Map()
  return {
    on: (event, fn) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    off: (event, fn) => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== fn)),
    fire: (event, payload) => act(() => (handlers.get(event) ?? []).forEach((fn) => fn(payload))),
    count: (event) => (handlers.get(event) ?? []).length,
  }
}

const scheduled = (startsInMs, extra = {}) => ({
  state: "scheduled",
  message: "서버 정리 점검이에요",
  startsAt: new Date(SERVER_NOW + startsInMs).toISOString(),
  endsAt: new Date(SERVER_NOW + startsInMs + 60 * MIN).toISOString(),
  serverNow: new Date(SERVER_NOW).toISOString(),
  forceEndAtStart: true,
  ...extra,
})

let navigate
function draw() {
  const socket = fakeSocket()
  navigate = mock.fn()
  render(React.createElement(MaintenanceNotice, { socket, navigate }))
  return socket
}
const tick = (ms) => act(() => mock.timers.tick(ms))
const dialog = () => screen.queryByRole("alertdialog")
const band = () => document.querySelector("[data-maintenance-band]")
const closeBig = () => fireEvent.click(screen.getByRole("button", { name: "확인했어요" }))

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: DEVICE_NOW })
})
test.afterEach(() => {
  cleanup()
  mock.timers.reset()
  useMaintenanceStore.getState().reset()
})

test("AD-150 예약 → 큰 안내(시각·남은 시간·강제 종료 문구), 서버 시각으로 남은 시간 맞춤, 1초마다 줄어듦", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  const box = dialog()
  assert.ok(box)
  assert.equal(box.getAttribute("aria-modal"), "true")
  assert.match(box.textContent, /점검 예정이에요/)
  // 기기 시계로 쟀으면 31분, 서버 시각으로 맞춰서 30분
  assert.match(box.textContent, /30분 00초/)
  assert.match(box.textContent, /점검 시각: 11월 10일 오후 2:31/)
  assert.match(box.textContent, /시각이 되면 진행 중 판이 강제로 끝나요/)
  assert.match(box.textContent, /서버 정리 점검이에요/)
  tick(1000)
  assert.match(dialog().textContent, /29분 59초/)
})

test("AD-150 열리면 버튼에 초점, 닫으면 위쪽 띠에 남은 시간 계속, 띠 눌러 다시 열기", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  const button = screen.getByRole("button", { name: "확인했어요" })
  assert.equal(document.activeElement, button)
  closeBig()
  assert.equal(dialog(), null)
  assert.match(band().textContent, /점검까지 30분 00초/)
  tick(2000)
  assert.match(band().textContent, /점검까지 29분 58초/)
  fireEvent.click(screen.getByRole("button", { name: "자세히" }))
  assert.ok(dialog())
})

test("AD-150 Esc로 닫힘, Tab은 안내 안 버튼에 머묾", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  const button = screen.getByRole("button", { name: "확인했어요" })
  fireEvent.keyDown(dialog(), { key: "Tab" })
  assert.equal(document.activeElement, button)
  fireEvent.keyDown(window, { key: "Escape" })
  assert.equal(dialog(), null)
  assert.ok(band())
})

test("AD-150 같은 안내를 다시 받으면(다시 접속) 닫은 걸 다시 안 띄움", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  closeBig()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  assert.equal(dialog(), null)
  assert.ok(band())
})

test("AD-151 10분 전·1분 전에 큰 안내 다시", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(10 * MIN + 5000))
  closeBig()
  tick(4000)
  assert.equal(dialog(), null)
  tick(1000)
  assert.ok(dialog(), "10분 전 다시")
  assert.match(dialog().textContent, /10분 00초/)
  closeBig()
  tick(8 * MIN)
  assert.equal(dialog(), null)
  tick(MIN)
  assert.ok(dialog(), "1분 전 다시")
  assert.match(dialog().textContent, /1분 00초/)
  closeBig()
  tick(30 * 1000)
  assert.equal(dialog(), null, "1분 전 뒤엔 더 안 띄움")
})

test("AD-151 10분 안쪽에서 처음 받으면 그 단계로 띄우고 같은 단계는 다시 안 띄움", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(5 * MIN))
  assert.ok(dialog())
  closeBig()
  tick(3 * MIN)
  assert.equal(dialog(), null)
  tick(MIN)
  assert.ok(dialog(), "1분 전")
})

test("AD-152 취소(cleared) → 큰 안내·띠 사라짐", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  assert.ok(dialog())
  socket.fire("maintenance_notice", { state: "cleared", serverNow: new Date(SERVER_NOW).toISOString() })
  assert.equal(dialog(), null)
  assert.equal(band(), null)
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  closeBig()
  socket.fire("maintenance_notice", { state: "cleared" })
  assert.equal(band(), null)
})

test("AD-153 점검으로 판 끝남 → '점검으로 판이 끝났어요'(승패 없음) → 로비로", () => {
  const socket = draw()
  socket.fire("maintenance_notice", scheduled(30 * MIN))
  socket.fire("maintenance_notice", { ...scheduled(0), state: "active" })
  socket.fire("game_ended", { gameId: "g-1", reason: "MAINTENANCE" })
  const box = dialog()
  assert.match(box.textContent, /점검으로 판이 끝났어요/)
  assert.match(box.textContent, /승패 없이 끝났어요/)
  fireEvent.click(screen.getByRole("button", { name: "로비로 가기" }))
  assert.equal(navigate.mock.callCount(), 1)
  assert.deepEqual(navigate.mock.calls[0].arguments, ["/lobby", { replace: true }])
  // 확인 뒤엔 점검 중 띠만
  assert.equal(dialog(), null)
  assert.match(band().textContent, /지금 점검 중이에요/)
})

test("AD-153 점검으로 대기방 닫힘 → 안내 → 로비로, Esc도 로비로", () => {
  const socket = draw()
  socket.fire("room_deleted", { code: "MAINTENANCE", message: "점검으로 방이 닫혔어요" })
  assert.match(dialog().textContent, /점검으로 대기방이 닫혔어요/)
  fireEvent.keyDown(window, { key: "Escape" })
  assert.deepEqual(navigate.mock.calls[0].arguments, ["/lobby", { replace: true }])
  assert.equal(dialog(), null)
})

test("AD-153 점검이 아닌 판 끝·방 닫힘은 안 건드림, 화면 떼면 신호도 뗌", () => {
  const socket = draw()
  socket.fire("game_ended", { gameId: "g-1", reason: "MAFIA_WIN" })
  socket.fire("room_deleted", { roomId: "r-1" })
  socket.fire("room_deleted", undefined)
  assert.equal(dialog(), null)
  assert.equal(navigate.mock.callCount(), 0)
  assert.equal(socket.count("maintenance_notice"), 1)
  cleanup()
  assert.equal(socket.count("maintenance_notice"), 0)
  assert.equal(socket.count("game_ended"), 0)
  assert.equal(socket.count("room_deleted"), 0)
})

test("AD-153 이상한 신호 모양은 무시", () => {
  const socket = draw()
  socket.fire("maintenance_notice", null)
  socket.fire("maintenance_notice", { state: "weird" })
  assert.equal(dialog(), null)
  assert.equal(band(), null)
})

test("AD-154 전적 끝 이유 MAINTENANCE → '점검으로 끝남', 나머지는 글 없음", () => {
  assert.equal(describeWinReason("MAINTENANCE"), "점검으로 끝남")
  assert.equal(describeWinReason("CITIZEN_WIN"), null)
  assert.equal(describeWinReason(null), null)
})

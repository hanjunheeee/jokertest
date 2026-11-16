// 화면 상태 시험: 점검으로 판이 끝났을 때·대기방이 닫혔을 때만 강제 종료 안내 (다른 까닭이면 안 건드림)
// 목록 A18-F-016~019 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-maintenance/maintenance-signals.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const M = await import("./maintenanceKit.mjs")

test.afterEach(() => M.resetAll())

const forcedEnd = () => M.useMaintenanceStore.getState().forcedEnd

test("A18-F-016 game_ended reason MAINTENANCE → 강제 종료 \"판\"", async () => {
  const { socket } = M.renderNotice()
  await M.serverSays(socket, "game_ended", { gameId: "g1", reason: "MAINTENANCE" })
  assert.equal(forcedEnd(), "game")
})

test("A18-F-017 game_ended reason 시민 승 → 안 건드림", async () => {
  const { socket } = M.renderNotice()
  await M.serverSays(socket, "game_ended", { gameId: "g1", reason: "CITIZEN_WIN" })
  assert.equal(forcedEnd(), null)
  assert.equal(M.bigNotice() === null, true)
})

test("A18-F-018 room_deleted code MAINTENANCE → 강제 종료 \"방\"", async () => {
  const { socket } = M.renderNotice({ start: "/game-matching" })
  await M.serverSays(socket, "room_deleted", { roomId: "r1", code: "MAINTENANCE" })
  assert.equal(forcedEnd(), "room")
})

test("A18-F-019 room_deleted code 없음(방장이 지움) → 안 건드림", async () => {
  const { socket } = M.renderNotice({ start: "/game-matching" })
  await M.serverSays(socket, "room_deleted", { roomId: "r1" })
  assert.equal(forcedEnd(), null)
  assert.equal(M.bigNotice() === null, true)
})

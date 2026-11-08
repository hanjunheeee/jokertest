// 방 목록 마감 판정 시험: 서버 full 표시만 믿지 않고 인원·진행 중도 마감
import assert from "node:assert/strict"
import test from "node:test"
import { deriveRoomDisplayStatus, isRoomClosedForEntry } from "../../../../../src/domains/game/mode/utils/deriveRoomDisplayStatus.js"

test("표시 상태: 진행 중 > 꽉 참(full 표시 또는 인원) > 기다림", () => {
  assert.equal(deriveRoomDisplayStatus({ status: "in_progress", current: 8, max: 8 }), "in_progress")
  assert.equal(deriveRoomDisplayStatus({ status: "full", current: 7, max: 8 }), "full")
  assert.equal(deriveRoomDisplayStatus({ status: "waiting", current: 8, max: 8 }), "full")
  assert.equal(deriveRoomDisplayStatus({ status: "waiting", current: 3, max: 8 }), "waiting")
})

test("입장 막기: 인원 찬 방·진행 중 방·full 방은 막고, 자리 남은 기다림 방·고른 방 없음은 안 막음", () => {
  assert.equal(isRoomClosedForEntry({ status: "waiting", current: 8, max: 8 }), true)
  assert.equal(isRoomClosedForEntry({ status: "in_progress", current: 2, max: 8 }), true)
  assert.equal(isRoomClosedForEntry({ status: "full", current: 8, max: 8 }), true)
  assert.equal(isRoomClosedForEntry({ status: "waiting", current: 7, max: 8 }), false)
  assert.equal(isRoomClosedForEntry(null), false)
})

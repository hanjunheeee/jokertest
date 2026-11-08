// 방 목록 줄 설정 요약 시험: 시간 글자에 재판 시간은 낮 투표 시간과 다를 때만
// 데스크톱 방 목록 줄·모바일 방 카드가 같은 요약을 씀
import test from "node:test"
import assert from "node:assert/strict"
import { summarizeRoomListSettings } from "../../../../src/domains/game/mode/utils/summarizeRoomListSettings.js"

const BASE = { dayDiscussionTime: 90, dayVoteTime: 30, nightActionTime: 40, jokerCount: 2 }

test("방 목록 요약: 재판 시간이 낮 투표 시간과 다르면 투표 뒤에 재판 글자, 읽기 문구에도", () => {
  const summary = summarizeRoomListSettings({ ...BASE, tribunalTime: 60 })
  assert.equal(summary.times, "토론 90초 · 투표 30초 · 재판 60초 · 밤 40초")
  assert.match(summary.ariaText, /재판 60초/)
})

test("방 목록 요약: 재판 시간이 없거나 낮 투표 시간과 같으면 재판 글자 안 붙음", () => {
  assert.equal(summarizeRoomListSettings(BASE).times, "토론 90초 · 투표 30초 · 밤 40초")
  assert.equal(summarizeRoomListSettings({ ...BASE, tribunalTime: 30 }).times, "토론 90초 · 투표 30초 · 밤 40초")
  assert.equal(summarizeRoomListSettings({ ...BASE, tribunalTime: "60" }).times, "토론 90초 · 투표 30초 · 밤 40초")
})

test("방 목록 요약: 낮 투표 시간이 없고 재판 시간만 있으면 재판 글자", () => {
  assert.equal(summarizeRoomListSettings({ tribunalTime: 45 }).times, "재판 45초")
})

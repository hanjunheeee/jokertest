// 방 목록 줄 값 시험: 코드 배지 값, 목록 상태(마감·들어가기), 설정 요약 글
// 목록 A01a "화면 PC" A01-F-094~100
import test from "node:test"
import assert from "node:assert/strict"

const { resolveRoomListRowCode } = await import("../../src/domains/game/mode/utils/resolveRoomListRowCode.js")
const { deriveRoomDisplayStatus, isRoomClosedForEntry } = await import("../../src/domains/game/mode/utils/deriveRoomDisplayStatus.js")
const { summarizeRoomListSettings } = await import("../../src/domains/game/mode/utils/summarizeRoomListSettings.js")

// 서버 공개 목록 한 줄 (1/10명, 대기 중)
const row = (extra = {}) => ({ id: "room-1", current: 1, max: 10, title: "가나다의 방", accessType: "open", status: "waiting", ...extra })

test("A01-F-094 공개 방 'open' → 코드 배지 안 보임", () => {
  assert.equal(resolveRoomListRowCode(row()).visible, false)
})

test("A01-F-095 코드 방 'code'(코드 칸 없음) → 배지 '코드', 읽기 글 '코드 필요'", () => {
  const code = resolveRoomListRowCode(row({ accessType: "code" }))
  assert.equal(code.visible, true)
  assert.equal(code.label, "코드")
  assert.equal(code.ariaText, "코드 필요")
})

test("A01-F-096 서버 status 'full' → 마감 (들어가기 막힘)", () => {
  const room = row({ status: "full", current: 3 })
  assert.equal(deriveRoomDisplayStatus(room), "full")
  assert.equal(isRoomClosedForEntry(room), true)
})

test("A01-F-097 서버 status 'waiting' → 들어가기 됨", () => {
  const room = row({ status: "waiting", current: 3 })
  assert.equal(deriveRoomDisplayStatus(room), "waiting")
  assert.equal(isRoomClosedForEntry(room), false)
})

test("A01-F-098 [지금 동작] 자동 광대 2 → 요약 '광대 2'", () => {
  assert.equal(summarizeRoomListSettings({ roleCompositionMode: "auto", jokerCount: 2 }).roles, "광대 2")
})

test("A01-F-099 [지금 동작] 직접 J1D2 → 요약 '광대 1 · 의사 2'", () => {
  const summary = summarizeRoomListSettings({
    roleCompositionMode: "custom",
    jokerCount: 1,
    roleCounts: { JOKER: 1, DOCTOR: 2, GUARD: 0, WITCH_HUNTER: 0 },
  })
  assert.equal(summary.roles, "광대 1 · 의사 2")
})

test("A01-F-100 [지금 동작] 토론 60·투표 60·재판 30·밤 90 → '토론 60초 · 투표 60초 · 재판 30초 · 밤 90초'", () => {
  const summary = summarizeRoomListSettings({ dayDiscussionTime: 60, dayVoteTime: 60, tribunalTime: 30, nightActionTime: 90 })
  assert.equal(summary.times, "토론 60초 · 투표 60초 · 재판 30초 · 밤 90초")
})

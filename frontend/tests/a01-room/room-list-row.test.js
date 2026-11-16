// 방 목록 줄 시험(방 목록 틀 그림): 이름·인원 읽기 글, 코드 배지, 마감·진행중, 설정 요약 줄, 지운 3칸 없음, 고르기 표시
// 목록 A01a "화면 PC" A01-F-208~215
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, fireEvent, cleanup } = await import("@testing-library/react")
const { default: RoomListShell } = await import("../../src/domains/game/mode/components/roomList/RoomListShell.jsx")

test.afterEach(() => cleanup())

// 서버 공개 목록 한 줄 (1/10명, 대기 중, 처음 설정)
const ROW = Object.freeze({
  id: "room-1",
  current: 1,
  max: 10,
  title: "가나다의 방",
  accessType: "open",
  status: "waiting",
  settingsVersion: 1,
  settings: { maxPlayers: 10, jokerCount: 2, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
})

// 줄 하나 그리고 그 줄 단추 돌려줌
function renderRow(extra = {}) {
  render(React.createElement(RoomListShell, { rooms: [{ ...ROW, ...extra }], onCreateGame: () => {}, onJoinByCode: () => {}, onEnterRoom: () => {} }))
  return document.querySelector("li > button[aria-pressed]")
}

test("A01-F-208 방 { title:'가나다의 방', current:1, max:10 } → 줄 글 '가나다의 방', 읽기 글 '1/10명'", () => {
  const row = renderRow()
  assert.ok(row.textContent.includes("가나다의 방"))
  assert.ok(row.getAttribute("aria-label").includes("1/10명"))
})

test("A01-F-209 accessType 'code' → 배지 '코드', 실제 코드 글 없음", () => {
  const row = renderRow({ accessType: "code" })
  const badges = [...row.querySelectorAll("span")].map((s) => s.textContent)
  assert.ok(badges.includes("코드"))
  assert.equal(/[A-Za-z0-9]{6}/.test(row.textContent), false)
})

test("A01-F-210 'open' → 배지 없음", () => {
  const row = renderRow({ accessType: "open" })
  const badges = [...row.querySelectorAll("span")].map((s) => s.textContent)
  assert.equal(badges.includes("코드"), false)
  assert.equal(badges.includes("마감"), false)
})

test("A01-F-211 status 'full' → 배지 '마감', 줄 단추 꺼짐", () => {
  const row = renderRow({ status: "full", current: 10 })
  assert.ok([...row.querySelectorAll("span")].some((s) => s.textContent === "마감"))
  assert.equal(row.disabled, true)
})

test("A01-F-212 [지금 동작] 진행중 상태 → 배지 '진행중', 꺼짐", () => {
  const row = renderRow({ status: "in_progress" })
  assert.ok([...row.querySelectorAll("span")].some((s) => s.textContent === "진행중"))
  assert.equal(row.disabled, true)
})

test("A01-F-213 [지금 동작] 자동 광대 2·60·60·90 → '광대 2 / 토론 60초 · 투표 60초 · 밤 90초'", () => {
  const row = renderRow()
  assert.ok(row.textContent.includes("광대 2 / 토론 60초 · 투표 60초 · 밤 90초"))
})

test("A01-F-214 설정에 lightsOut 섞임 → 줄 글에 그 말 없음", () => {
  const row = renderRow({ settings: { ...ROW.settings, lightsOut: true, soulBetting: true, voteReveal: true } })
  const text = `${row.textContent} ${row.getAttribute("aria-label")}`
  for (const word of ["lightsOut", "soulBetting", "voteReveal", "불이 꺼진", "무도회", "영혼", "베팅", "투표 공개"]) {
    assert.equal(text.includes(word), false, `${word} 없음`)
  }
})

test("A01-F-215 대기 방 줄 누름 → aria-pressed true", () => {
  const row = renderRow()
  assert.equal(row.getAttribute("aria-pressed"), "false")
  fireEvent.click(row)
  assert.equal(document.querySelector("li > button[aria-pressed]").getAttribute("aria-pressed"), "true")
})

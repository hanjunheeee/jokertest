// 방 목록 화면 시험(멀티 화면 전체 + 가짜 소켓): public_rooms_updated로 줄이 새로 그려짐, 사라짐·인원·빈 목록·정원별 인원 글·배지·요약 바뀜·쪽 넘기기·키보드
// 목록 A01a "화면 PC" A01-F-216~230
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react")
const { default: MultiplayEntryPage } = await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")
const H = await import("./a01a-helpers.mjs")

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
  H.signIn("viewer")
})
test.afterEach(() => cleanup())

// 서버 공개 목록 한 줄
const roomRow = (i, extra = {}) => ({
  id: `room-${i}`,
  current: 1,
  max: 10,
  title: `방${i}`,
  accessType: "open",
  status: "waiting",
  settingsVersion: 1,
  settings: { maxPlayers: 10, jokerCount: 2, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
  ...extra,
})
const roomsOf = (n) => Array.from({ length: n }, (_, i) => roomRow(i + 1))

// 멀티 화면을 엶 (처음 목록 = first)
async function openList(first) {
  const socket = H.useFakeSocket()
  socket.answer("get_public_rooms", { ok: true, rooms: first })
  H.renderAt("/multiplay", React.createElement(MultiplayEntryPage))
  await waitFor(() => assert.equal(rowButtons().length, first.length))
  return socket
}
// 방 줄 단추들 (빈 자리 칸은 단추 없음)
const rowButtons = () => [...document.querySelectorAll("li > button[aria-pressed]")]
const rowNamed = (title) => rowButtons().find((b) => b.getAttribute("aria-label").includes(`${title},`))
const push = (socket, rooms) => act(() => socket.serverSays("public_rooms_updated", { rooms }))

test("A01-F-216 public_rooms_updated 3줄 → 4줄", async () => {
  const socket = await openList(roomsOf(3))
  push(socket, roomsOf(4))
  assert.equal(rowButtons().length, 4)
})

test("A01-F-217 다음 목록에 그 방 없음 → 줄 사라짐", async () => {
  const socket = await openList(roomsOf(3))
  push(socket, [roomRow(1), roomRow(3)])
  assert.equal(rowButtons().length, 2)
  assert.ok(rowNamed("방2") === undefined)
})

test("A01-F-218 1/10 → 2/10 목록 → 읽기 글 '2/10명'", async () => {
  const socket = await openList([roomRow(1)])
  push(socket, [roomRow(1, { current: 2 })])
  assert.ok(rowNamed("방1").getAttribute("aria-label").includes("2/10명"))
})

test("A01-F-219 rooms: [] → 방 줄 0, 오류 없음", async () => {
  const socket = await openList([roomRow(1)])
  push(socket, [])
  assert.equal(rowButtons().length, 0)
  assert.ok(screen.getByRole("region", { name: "공개 방 목록" }))
})

const CAP_NOS = ["A01-F-220", "A01-F-221", "A01-F-222", "A01-F-223", "A01-F-224", "A01-F-225"]
for (const [i, max] of [5, 6, 7, 8, 9, 10].entries()) {
  test(`${CAP_NOS[i]} 정원 ${max} 방 1명 → '1/${max}명'`, async () => {
    await openList([roomRow(1, { max, settings: { ...roomRow(1).settings, maxPlayers: max } })])
    assert.ok(rowNamed("방1").getAttribute("aria-label").includes(`1/${max}명`))
  })
}

// 줄 안 배지 글들
const badgesOf = (row) => [...row.querySelectorAll("span")].map((s) => s.textContent)

test("A01-F-226 같은 방 code → open 목록 → 배지 없음", async () => {
  const socket = await openList([roomRow(1, { accessType: "code" })])
  assert.ok(badgesOf(rowNamed("방1")).includes("코드"))
  push(socket, [roomRow(1, { accessType: "open" })])
  assert.equal(badgesOf(rowNamed("방1")).includes("코드"), false)
})

test("A01-F-227 full → waiting 목록 → 마감 배지 없음, 단추 켜짐", async () => {
  const socket = await openList([roomRow(1, { status: "full", current: 10 })])
  assert.equal(rowNamed("방1").disabled, true)
  push(socket, [roomRow(1, { status: "waiting", current: 9 })])
  assert.equal(badgesOf(rowNamed("방1")).includes("마감"), false)
  assert.equal(rowNamed("방1").disabled, false)
})

test("A01-F-228 광대 2 → 1 목록 → 요약 '광대 1'", async () => {
  const socket = await openList([roomRow(1)])
  push(socket, [roomRow(1, { settingsVersion: 2, settings: { ...roomRow(1).settings, jokerCount: 1 } })])
  assert.ok(rowNamed("방1").textContent.includes("광대 1 /"))
})

test("A01-F-229 [지금 동작] 방 20개 → 첫 쪽 줄 수 = 쪽 크기(12), 다음 쪽에 나머지 8", async () => {
  const socket = H.useFakeSocket()
  socket.answer("get_public_rooms", { ok: true, rooms: roomsOf(20) })
  H.renderAt("/multiplay", React.createElement(MultiplayEntryPage))
  await waitFor(() => assert.equal(rowButtons().length, 12))
  fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }))
  assert.equal(rowButtons().length, 8)
  assert.ok(rowNamed("방13"))
})

test("A01-F-230 [지금 동작] Tab으로 줄 이동, Enter → 고름", async () => {
  await openList(roomsOf(2))
  const [first, second] = rowButtons()
  // 진짜 단추이고 Tab 순서에서 빠지지 않음 (tabindex -1 아님)
  for (const row of [first, second]) {
    assert.equal(row.tagName, "BUTTON")
    assert.notEqual(row.getAttribute("tabindex"), "-1")
  }
  second.focus()
  assert.ok(document.activeElement === second, "두 번째 줄에 포커스")
  // jsdom은 Enter로 단추를 눌러 주지 않음 → 포커스된 단추를 누름 (브라우저에선 Enter가 누르기와 같음)
  fireEvent.keyDown(second, { key: "Enter" })
  act(() => document.activeElement.click())
  assert.equal(rowNamed("방2").getAttribute("aria-pressed"), "true")
  assert.equal(rowNamed("방1").getAttribute("aria-pressed"), "false")
})

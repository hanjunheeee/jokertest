// 대기방 방장 단추·방 정보 시험(대기방 화면 전체 + 가짜 소켓): 설정 변경·시작 단추는 방장만, 시작 중 꺼짐, 방 이름·코드 보임, 방장 준비 안 됨, 코드 복사
// 목록 A01a "화면 PC" A01-F-155~164, 5명 방(4명은 F-159 조건 안 맞는 방만)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react")
const H = await import("./a01a-helpers.mjs")

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => cleanup())

// 방 확인이 끝나면 초대코드 단추가 켜짐 → 그때까지 기다림
const waitVerified = () => waitFor(() => assert.equal(H.buttonNamed("초대코드 공유").disabled, false))

test("A01-F-155 방장 화면 → '방 설정 변경' 있음 (5명 방)", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }) })
  await waitFor(() => assert.ok(screen.getByRole("button", { name: "방 설정 변경" })))
})

test("A01-F-156 손님 화면 → '방 설정 변경' 없음 (5명 방)", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }), me: "guest-1" })
  await waitVerified()
  assert.ok(H.buttonNamed("방 설정 변경") === null)
})

test("A01-F-157 방장 화면 → '게임시작' 있음", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }) })
  await waitVerified()
  assert.ok(screen.getByRole("button", { name: "게임시작" }))
})

test("A01-F-158 손님 화면 → '게임시작' 없음", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }), me: "guest-1" })
  await waitVerified()
  assert.ok(H.buttonNamed("게임시작") === null)
})

test("A01-F-159 [지금 동작] 4명 방 방장 → '게임시작' 켜짐, 누르면 서버 거절 글", async () => {
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 4 }) })
  socket.answer("start_game", { ok: false, code: "MIN_PLAYERS_NOT_MET", message: "게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다." })
  await waitVerified()
  const start = screen.getByRole("button", { name: "게임시작" })
  assert.equal(start.disabled, false)
  fireEvent.click(start)
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /인원 조건을 아직 충족하지 못했습니다/))
})

test("A01-F-160 누른 뒤 답 전 → 시작 단추 꺼짐", async () => {
  const later = H.deferred()
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 5 }) })
  socket.answer("start_game", () => later.promise)
  await waitVerified()
  fireEvent.click(screen.getByRole("button", { name: "게임시작" }))
  // 단추 글이 "시작 중"으로 바뀌고 꺼짐, 켜진 "게임시작"은 없음
  await waitFor(() => assert.equal(screen.getByRole("button", { name: "시작 중" }).disabled, true))
  assert.ok(H.buttonNamed("게임시작") === null)
  await act(async () => later.resolve({ ok: true, gameId: "g-1" }))
})

test("A01-F-161 방 title '가나다의 방' → 대기방 머리에 그 글", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5, extra: { title: "가나다의 방" } }) })
  await waitVerified()
  assert.ok(document.body.textContent.includes("가나다의 방"), "대기방 화면에 방 이름 글 있음")
})

// 방 코드 보기 창 칸 6개 글 합침 → 예: "AB12CD"
const shownCode = () =>
  Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`방 코드 ${i + 1}번째 자리`).value).join("")

test("A01-F-162 방 코드 보기 창 → 6자리 코드 글", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5, roomCode: "AB12CD" }) })
  await waitVerified()
  fireEvent.click(H.buttonNamed("초대코드 공유"))
  assert.ok(screen.getByRole("dialog", { name: "방코드" }))
  assert.equal(shownCode(), "AB12CD")
})

test("A01-F-163 만든 직후 방장 isReady:false → 방장 칸 준비 표시 없음, 방장 단추 '준비완료'", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 1 }) })
  await waitVerified()
  const seats = H.seatImages()
  assert.equal(seats.length, 1)
  assert.equal(seats[0].alt, "준비 전 참가자")
  assert.ok(screen.getByRole("button", { name: "준비완료" }))
})

test("A01-F-164 [지금 동작] 코드 복사 단추 → 클립보드 가짜에 6자리 코드", async () => {
  const copied = []
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => { copied.push(text) } },
  })
  H.renderMatchingPage({ room: H.roomOf({ n: 5, roomCode: "AB12CD" }) })
  await waitVerified()
  fireEvent.click(H.buttonNamed("초대코드 공유"))
  fireEvent.click(screen.getByRole("button", { name: "방코드 복사" }))
  await waitFor(() => assert.deepEqual(copied, ["AB12CD"]))
})

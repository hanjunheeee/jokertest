// 대기방 방장 단추·방 정보 시험(대기방 화면 전체 + 가짜 소켓): 설정 변경·시작 단추는 방장만, 시작 중 꺼짐, 방 이름·코드 보임, 방장 준비 안 됨, 코드 복사
// 목록 A01a "화면 PC" A01-F-155~164·159-2~159-14·161-2~161-4, 5명 방(4명은 F-159 조건 안 맞는 방만)
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

// 5명 방 전원 (방장 + 손님 4)
const ALL5 = ["host", "guest-1", "guest-2", "guest-3", "guest-4"]

// 시작 단추가 꺼진 까닭 글 칸 (없으면 null), 단추가 그 글을 가리키는지(읽어 주는 도구가 같이 읽음)
const startReason = () => screen.queryByTestId("start-locked-reason")
const startButton = () => screen.getByRole("button", { name: "게임시작" })
const SAME_ROOM = { roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1" }

test("A01-F-159 4명 방 방장 → '게임시작' 꺼짐 + 까닭 글 \"5명부터 시작할 수 있습니다. (지금 4명)\", 눌러도 start_game 안 보냄", async () => {
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 4 }) })
  await waitVerified()
  assert.equal(startButton().disabled, true)
  assert.equal(startReason()?.textContent, "5명부터 시작할 수 있습니다. (지금 4명)")
  assert.equal(startButton().getAttribute("aria-describedby"), startReason().id)
  fireEvent.click(startButton())
  assert.equal(socket.sentOf("start_game").length, 0)
})

// 인원마다: 1~4명은 꺼짐 + 그 인원 글
const START_BY_COUNT = [["A01-F-159-2", 1], ["A01-F-159-3", 2], ["A01-F-159-4", 3]]
for (const [no, n] of START_BY_COUNT) {
  test(`${no} ${n}명 방 방장 → '게임시작' 꺼짐 + 까닭 글 "(지금 ${n}명)"`, async () => {
    H.renderMatchingPage({ room: H.roomOf({ n }) })
    await waitVerified()
    assert.equal(startButton().disabled, true)
    assert.equal(startReason()?.textContent, `5명부터 시작할 수 있습니다. (지금 ${n}명)`)
  })
}

test("A01-F-159-5 5명 방 전원 준비(canStart 참) → '게임시작' 켜짐, 까닭 글 없음", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5, ready: ALL5, canStart: true }) })
  await waitVerified()
  assert.equal(startButton().disabled, false)
  assert.ok(startReason() === null)
  assert.equal(startButton().getAttribute("aria-describedby"), null)
})

// 5명 방에서 준비한 사람 수마다: 다 안 했으면 꺼짐 + "(준비 N/5)" (방장 자신도 준비해야 함 — 서버 규칙: 전원 준비)
const START_BY_READY = [["A01-F-159-8", []], ["A01-F-159-9", ["guest-1", "guest-2", "guest-3"]], ["A01-F-159-10", ["guest-1", "guest-2", "guest-3", "guest-4"]]]
for (const [no, ready] of START_BY_READY) {
  test(`${no} 5명 방 준비 ${ready.length}명 → '게임시작' 꺼짐 + 까닭 글 "모두 준비해야 시작할 수 있습니다. (준비 ${ready.length}/5)", 눌러도 안 보냄`, async () => {
    const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 5, ready }) })
    await waitVerified()
    assert.equal(startButton().disabled, true)
    assert.equal(startReason()?.textContent, `모두 준비해야 시작할 수 있습니다. (준비 ${ready.length}/5)`)
    assert.equal(startButton().getAttribute("aria-describedby"), startReason().id)
    fireEvent.click(startButton())
    assert.equal(socket.sentOf("start_game").length, 0)
  })
}

test("A01-F-159-11 5명 중 4명 준비 → 마지막 사람 준비 알림(canStart 참) → 켜짐·글 없음 → 한 명 준비 취소 알림 → 다시 꺼짐·글", async () => {
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 5, ready: ["host", "guest-1", "guest-2", "guest-3"] }) })
  await waitVerified()
  assert.equal(startButton().disabled, true)
  act(() => socket.serverSays("player_ready_changed", { roomId: "room-1", uuid: "guest-4", isReady: true, canStart: true, settingsVersion: 1, readyRevision: 1 }))
  assert.equal(startButton().disabled, false)
  assert.ok(startReason() === null)
  act(() => socket.serverSays("player_ready_changed", { roomId: "room-1", uuid: "guest-2", isReady: false, canStart: false, settingsVersion: 1, readyRevision: 1 }))
  assert.equal(startButton().disabled, true)
  assert.equal(startReason()?.textContent, "모두 준비해야 시작할 수 있습니다. (준비 4/5)")
})

test("A01-F-159-12 4명 방 + 준비도 안 됨(둘 다 걸림) → 인원 글이 먼저", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 4, ready: ["guest-1"] }) })
  await waitVerified()
  assert.equal(startButton().disabled, true)
  assert.equal(startReason()?.textContent, "5명부터 시작할 수 있습니다. (지금 4명)")
})

test("A01-F-159-13 5명 전원 준비인데 canStart 거짓(역할 구성 안 맞음·입장 처리 중 등) → 미리 안 끔, 누르면 서버 거절 글", async () => {
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 5, ready: ALL5, canStart: false }) })
  socket.answer("start_game", { ok: false, code: "INVALID_ROLE_COMPOSITION", message: "설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요." })
  await waitVerified()
  assert.equal(startButton().disabled, false)
  assert.ok(startReason() === null)
  fireEvent.click(startButton())
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /역할 구성이 현재 인원과 맞지 않습니다/))
})

test("A01-F-159-14 5명 방 손님 화면(준비 안 된 사람 있음) → '게임시작' 단추도 까닭 글도 없음", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }), me: "guest-1" })
  await waitVerified()
  assert.ok(H.buttonNamed("게임시작") === null)
  assert.ok(startReason() === null)
})

test("A01-F-159-6 4명(전원 준비) → 준비한 한 명이 들어와 5명(canStart 참) → 단추 켜지고 글 사라짐 → 한 명 나가 4명 → 다시 꺼지고 인원 글", async () => {
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 4, ready: ["host", "guest-1", "guest-2", "guest-3"] }) })
  await waitVerified()
  assert.equal(startButton().disabled, true)
  act(() => socket.serverSays("player_joined_room", { ...SAME_ROOM, canStart: true, player: { uuid: "new-1", nickname: "새사람", isReady: true, membershipId: "m-new-1" } }))
  assert.equal(startButton().disabled, false)
  assert.ok(startReason() === null)
  act(() => socket.serverSays("player_left_room", { ...SAME_ROOM, uuid: "new-1", canStart: false }))
  assert.equal(startButton().disabled, true)
  assert.equal(startReason()?.textContent, "5명부터 시작할 수 있습니다. (지금 4명)")
})

test("A01-F-159-7 4명 방 손님 화면 → '게임시작' 단추도 까닭 글도 없음 (방장에게만)", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 4 }), me: "guest-1" })
  await waitVerified()
  assert.ok(H.buttonNamed("게임시작") === null)
  assert.ok(startReason() === null)
})

test("A01-F-160 누른 뒤 답 전 → 시작 단추 꺼짐", async () => {
  const later = H.deferred()
  const { socket } = H.renderMatchingPage({ room: H.roomOf({ n: 5, ready: ALL5, canStart: true }) })
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
  assert.equal(screen.getByTestId("matching-room-title").textContent, "가나다의 방")
})

test("A01-F-161-2 방 값에 title 칸 없음 → 방 이름 글을 안 그림", async () => {
  H.renderMatchingPage({ room: H.roomOf({ n: 5 }) })
  await waitVerified()
  assert.ok(screen.queryByTestId("matching-room-title") === null)
})

test("A01-F-161-3 방에서 나가면(방 스토어 비움) 방 이름도 지워짐", async () => {
  const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
  useMatchingStore.getState().setRoom(H.roomOf({ n: 5, extra: { title: "가나다의 방" } }))
  assert.equal(useMatchingStore.getState().title, "가나다의 방")
  useMatchingStore.getState().clearRoom()
  assert.equal(useMatchingStore.getState().title, null)
})

test("A01-F-161-4 같은 방 값이 title 칸 없이 다시 와도 방 이름은 남고, 다른 방이면 지워짐", async () => {
  const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
  const store = useMatchingStore.getState()
  store.setRoom(H.roomOf({ n: 5, extra: { title: "가나다의 방" } }))
  store.setRoom(H.roomOf({ n: 6 }))
  assert.equal(useMatchingStore.getState().title, "가나다의 방")
  store.setRoom(H.roomOf({ n: 5, roomId: "room-2" }))
  assert.equal(useMatchingStore.getState().title, null)
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

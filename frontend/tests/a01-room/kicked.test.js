// 화면 상태·부품 시험: 쫓겨난 사람 화면 — 내가 쫓겨나면 방 비우고 방 목록으로, 남·옛 회차 알림은 무시, 남은 사람 화면에서 자리 빠짐
// 목록 A01-F-553~555·727~728 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kicked.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act, cleanup } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: MultiplayEntryPage } = await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 지금 주소를 화면에 적어 둠 (이동했는지 보려고)
function WhereAmI() {
  const location = useLocation()
  return h("output", { "data-testid": "where" }, location.pathname)
}

// 로그인 보호 경로처럼 판 진행 사건(room_kicked 포함)을 받는 틀
function SessionEvents({ children }) {
  useGameSessionSocketEvents()
  return children
}

// 주소별 화면: 대기방은 진짜 대기방 화면, 방 목록은 진짜 방 목록 화면 (page 없이 주소만 볼 때는 빈 칸)
function renderApp({ withPages = false } = {}) {
  const page = (el) => (withPages ? el : h("div"))
  return render(h(MemoryRouter, { initialEntries: ["/game-matching"] },
    h(SessionEvents, null,
      h(WhereAmI),
      h(Routes, null,
        h(Route, { path: "/game-matching", element: page(h(GameMatchingPage)) }),
        h(Route, { path: "/multiplay", element: page(h(MultiplayEntryPage)) }),
      ))))
}

// 손님(guest-1)으로 정원 6 · 5명 방에 앉음
function seatGuest(room = roomOf({ n: 5, max: 6 })) {
  signIn("guest-1", "사람2")
  installDialogs(dom)
  installFakeFetch()
  const fake = useFakeSocket()
  fake.answer("get_current_room", { ok: true, room })
  fake.answer("get_public_rooms", { ok: true, rooms: [] })
  useMatchingStore.getState().setRoom(room)
  return fake
}

// 쫓겨남 알림 값 (서버가 대상에게 보내는 모양)
const kickedPayload = (overrides = {}) => ({
  roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1",
  targetUuid: "guest-1", targetMembershipId: "m-guest-1", ...overrides,
})

test("A01-F-553 room_kicked { targetUuid: 나, 지금 방 회차 } → 방 비움, /multiplay로 이동", () => {
  const fake = seatGuest()
  renderApp()
  act(() => fake.serverSays("room_kicked", kickedPayload()))
  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.equal(screen.getByTestId("where").textContent, "/multiplay")
})

test("A01-F-554 room_kicked { targetUuid: 남 } → 내 방 그대로, 이동 없음", () => {
  const fake = seatGuest()
  renderApp()
  act(() => fake.serverSays("room_kicked", kickedPayload({ targetUuid: "guest-2", targetMembershipId: "m-guest-2" })))
  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.equal(useMatchingStore.getState().roomId, "room-1")
  assert.equal(screen.getByTestId("where").textContent, "/game-matching")
})

test("A01-F-555 옛 방 회차의 room_kicked → 방 그대로", () => {
  const fake = seatGuest()
  renderApp()
  act(() => fake.serverSays("room_kicked", kickedPayload({ roomInstanceId: "inst-old" })))
  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.equal(screen.getByTestId("where").textContent, "/game-matching")
})

test("A01-F-727 대기방 화면 + room_kicked { 나 } → 방 목록 화면이 그려짐", async () => {
  const fake = seatGuest()
  renderApp({ withPages: true })
  await act(async () => { await flush() })
  assert.ok(screen.getByRole("button", { name: "방 나가기" }), "처음엔 대기방 화면")
  await act(async () => { fake.serverSays("room_kicked", kickedPayload()); await flush() })
  assert.equal(screen.getByTestId("where").textContent, "/multiplay")
  assert.ok(screen.getByRole("region", { name: "공개 방 목록" }))
  assert.equal(screen.queryByRole("button", { name: "방 나가기" }), null)
})

test("A01-F-728 방장 화면 + player_left_room(쫓겨난 사람) → 자리 하나 줄고 인원 −1", async () => {
  signIn("host", "방장")
  installDialogs(dom)
  installFakeFetch()
  const room = roomOf({ n: 5, max: 6 })
  const fake = useFakeSocket()
  fake.answer("get_current_room", { ok: true, room })
  useMatchingStore.getState().setRoom(room)
  renderApp({ withPages: true })
  await act(async () => { await flush() })
  const seatsBefore = screen.getAllByAltText(/참가자$/).length
  assert.equal(seatsBefore, 5)
  assert.ok(screen.getByLabelText("파티 인원 5명"))
  await act(async () => {
    fake.serverSays("player_left_room", {
      uuid: "guest-1", membershipId: "m-guest-1", roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1", canStart: false,
    })
    await flush()
  })
  assert.equal(screen.getAllByAltText(/참가자$/).length, 4)
  assert.ok(screen.getByLabelText("파티 인원 4명"))
})

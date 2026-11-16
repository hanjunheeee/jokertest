// 화면 부품 시험: 방 코드 입장 화면 — 칸 6개, 소문자는 대문자로 보임, 붙여넣기 6자, 보내는 중 잠김, 실패 뒤 다시 누름
// 목록 A01-F-691~695 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/join-code-page.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: RoomInvitePage } = await import("../../src/domains/game/mode/pages/RoomInvitePage.jsx")
const { useFakeSocket, signIn, resetAll, installDialogs, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 코드 입장 화면 그리기
async function openPage() {
  signIn("me", "나")
  const dialogs = installDialogs(dom)
  const fake = useFakeSocket()
  render(h(MemoryRouter, { initialEntries: ["/roomInvite"] },
    h(Routes, null, h(Route, { path: "/roomInvite", element: h(RoomInvitePage) }))))
  await act(async () => { await flush() })
  return { fake, dialogs }
}

const boxes = () => within(screen.getByRole("group", { name: "방 코드 6자리" })).getAllByRole("textbox")
const joinButton = () => screen.getByRole("button", { name: "참여하기" })
// 붙여넣기로 코드 채우기
function paste(text) {
  fireEvent.paste(boxes()[0], { clipboardData: { getData: () => text } })
}

test("A01-F-691 코드 입장 화면 → 입력 칸 6개", async () => {
  await openPage()
  assert.equal(boxes().length, 6)
})

test("A01-F-692 칸에 a → 칸 값 A", async () => {
  await openPage()
  fireEvent.change(boxes()[0], { target: { value: "a" } })
  assert.equal(boxes()[0].value, "A")
})

test("A01-F-693 abc2345 붙여넣기 → 칸 6개에 A B C 2 3 4", async () => {
  await openPage()
  paste("abc2345")
  assert.deepEqual(boxes().map((box) => box.value), ["A", "B", "C", "2", "3", "4"])
})

test("A01-F-694 입장 보내는 중 → 입장(참여하기) 단추 꺼짐", async () => {
  const { fake } = await openPage()
  paste("ABC234")
  fireEvent.click(joinButton())
  assert.deepEqual(fake.sentOf("join_room_by_code"), [{ roomCode: "ABC234" }])
  assert.equal(joinButton().disabled, true)
})

test("A01-F-695 실패 알림 뒤 → 입장 단추 켜짐", async () => {
  const { fake, dialogs } = await openPage()
  paste("ABC234")
  fireEvent.click(joinButton())
  await act(async () => { fake.serverSays("room_join_failed", { code: "ROOM_FULL", message: "방이 가득 찼습니다." }); await flush() })
  assert.equal(dialogs.alerts.length, 1)
  assert.equal(joinButton().disabled, false)
})

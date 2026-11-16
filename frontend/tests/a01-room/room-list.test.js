// 화면 부품 시험: 공개 방 목록 — 방 이름·인원, 코드 방 표시, 정원 경계(입장 가능/마감), 공개 방 입장 보냄·보내는 중 잠김, 목록 알림 뒤 다시 그림
// 목록 A01-F-673~690 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/room-list.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: RoomListShell } = await import("../../src/domains/game/mode/components/roomList/RoomListShell.jsx")
const { default: MultiplayEntryPage } = await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { ROW_DIM_OVERLAY_CLASS } = await import("../../src/domains/game/mode/constants/roomListLayout.js")
const { useFakeSocket, signIn, resetAll, installDialogs, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 서버 공개 목록 한 줄 모양 (backend room/view.js buildPublicRoomList)
const listRow = ({ id = "room-1", host = "사람1", current = 3, max = 6, accessType = "open" } = {}) => ({
  id, title: `${host}의 방`, current, max, accessType,
  status: current >= max ? "full" : "waiting", settingsVersion: 1, settings: null,
})

// 목록 틀만 그리기 (입장 누름은 모음)
function drawShell(rooms) {
  const entered = []
  const codeJoins = []
  render(h(RoomListShell, { rooms, onCreateGame: () => {}, onJoinByCode: (id) => codeJoins.push(id), onEnterRoom: (id) => entered.push(id) }))
  return { entered, codeJoins }
}

const region = () => screen.getByRole("region", { name: "공개 방 목록" })
// 방 줄(자리 채움 칸 빼고)
const roomRows = () => [...region().querySelectorAll("li:not([aria-hidden='true'])")]
const rowButton = (row) => within(row).getByRole("button")
const enterButton = () => screen.getByRole("button", { name: /^(선택한 방 입장|코드 입력|마감|입장 중)$/ })

test("A01-F-673 공개 방 줄 → 방 이름 \"사람1의 방\", 인원 \"3/6\"", () => {
  drawShell([listRow({ host: "사람1", current: 3, max: 6 })])
  const [row] = roomRows()
  assert.ok(row.textContent.includes("사람1의 방"))
  assert.ok(row.textContent.includes("3/6"))
})

test("A01-F-674 코드 방 줄 → 코드 방 표시 배지, 고르면 \"코드 입력\" 쪽 단추", () => {
  const { codeJoins } = drawShell([listRow({ accessType: "code" })])
  const [row] = roomRows()
  assert.match(row.textContent, /코드/)
  assert.match(rowButton(row).getAttribute("aria-label"), /코드 필요/)
  fireEvent.click(rowButton(row))
  assert.equal(enterButton().textContent, "코드 입력")
  fireEvent.click(enterButton())
  assert.deepEqual(codeJoins, ["room-1"])
})

// 정원 5~10 × (정원−1 → 입장 가능 / 정원 → 마감)
let no = 675
for (const max of [5, 6, 7, 8, 9, 10]) {
  for (const full of [false, true]) {
    const id = `A01-F-${no}`
    no += 1
    const current = full ? max : max - 1
    test(full
      ? `${id} 정원 ${max} · 인원 ${current} → "마감" 배지·줄 흐림·단추 꺼짐`
      : `${id} 정원 ${max} · 인원 ${current} → 입장 단추 켜짐`, () => {
      const { entered } = drawShell([listRow({ current, max })])
      const [row] = roomRows()
      fireEvent.click(rowButton(row))
      if (full) {
        assert.ok(within(row).getByText("마감"))
        assert.ok([...row.querySelectorAll("div")].some((d) => d.className === ROW_DIM_OVERLAY_CLASS), "흐림 덮개 없음")
        assert.equal(rowButton(row).disabled, true)
        assert.equal(enterButton().disabled, true)
        assert.deepEqual(entered, [])
      } else {
        assert.equal(within(row).queryByText("마감"), null)
        assert.equal(rowButton(row).disabled, false)
        assert.equal(enterButton().disabled, false)
        fireEvent.click(enterButton())
        assert.deepEqual(entered, ["room-1"])
      }
    })
  }
}

test("A01-F-687 정원 = 인원인 코드 방 → \"마감\"(코드 입력 아님)", () => {
  const { codeJoins } = drawShell([listRow({ accessType: "code", current: 8, max: 8 })])
  const [row] = roomRows()
  assert.ok(within(row).getByText("마감"))
  assert.match(rowButton(row).getAttribute("aria-label"), /마감$/)
  assert.equal(rowButton(row).disabled, true)
  fireEvent.click(rowButton(row))
  assert.equal(screen.queryByRole("button", { name: "코드 입력" }), null)
  assert.deepEqual(codeJoins, [])
})

// 방 목록 화면 통째로 (가짜 소켓이 목록 묻기에 답함)
async function openPage(rooms) {
  signIn("me", "나")
  installDialogs(dom)
  const fake = useFakeSocket()
  fake.answer("get_public_rooms", { ok: true, rooms })
  render(h(MemoryRouter, { initialEntries: ["/multiplay"] },
    h(Routes, null,
      h(Route, { path: "/multiplay", element: h(MultiplayEntryPage) }),
      h(Route, { path: "/game-matching", element: h("p", null, "대기방 화면") }),
    )))
  await act(async () => { await flush() })
  return fake
}

test("A01-F-688 공개 방 고르고 입장 → join_public_room { roomId } 1번", async () => {
  const fake = await openPage([listRow({ id: "room-7", current: 2, max: 6 })])
  fireEvent.click(rowButton(roomRows()[0]))
  fireEvent.click(enterButton())
  assert.deepEqual(fake.sentOf("join_public_room"), [{ roomId: "room-7" }])
})

test("A01-F-689 입장 보내는 중 → 입장 단추 꺼짐", async () => {
  await openPage([listRow({ id: "room-7", current: 2, max: 6 })])
  fireEvent.click(rowButton(roomRows()[0]))
  await act(async () => { fireEvent.click(enterButton()); await flush() })
  assert.equal(enterButton().disabled, true)
  assert.equal(enterButton().textContent, "입장 중")
})

test("A01-F-690 public_rooms_updated로 방 하나 빠짐 → 줄 하나 줄어듦", async () => {
  const fake = await openPage([listRow({ id: "room-1" }), listRow({ id: "room-2", host: "사람2" })])
  assert.equal(roomRows().length, 2)
  await act(async () => { fake.serverSays("public_rooms_updated", { rooms: [listRow({ id: "room-2", host: "사람2" })] }); await flush() })
  assert.equal(roomRows().length, 1)
  assert.ok(roomRows()[0].textContent.includes("사람2의 방"))
})

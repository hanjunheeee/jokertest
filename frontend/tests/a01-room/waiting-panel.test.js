// 화면 부품 시험: 대기방 화면 아래 단추·자리 표시·인원 수·방장 넘겨받음·채팅 칸 없음·방 삭제·나가기·키보드
// 목록 A01-F-648~665·722 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/waiting-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: MultiplayEntryPage } = await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, HOLD, flush, pressEnter } =
  await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 대기방 화면 그리기 (방 확인 답은 바로 줌), 방 목록 주소는 진짜 방 목록 화면
async function openPage({ me = "host", room = roomOf({ n: 5, max: 6 }) } = {}) {
  signIn(me)
  const dialogs = installDialogs(dom)
  installFakeFetch()
  const fake = useFakeSocket()
  fake.answer("get_current_room", { ok: true, room })
  fake.answer("get_public_rooms", { ok: true, rooms: [] })
  useMatchingStore.getState().setRoom(room)
  render(h(MemoryRouter, { initialEntries: ["/game-matching"] },
    h(Routes, null,
      h(Route, { path: "/game-matching", element: h(GameMatchingPage) }),
      h(Route, { path: "/multiplay", element: h(MultiplayEntryPage) }),
    )))
  await act(async () => { await flush() })
  return { fake, room, dialogs }
}

const button = (name) => screen.queryByRole("button", { name })
const SAME = { roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1" }
// 자리 칸 (사람 그림 하나 = 자리 하나)
const seats = () => [...document.querySelectorAll("img")].filter((img) => /참가자$/.test(img.alt)).map((img) => img.parentElement)

test("A01-F-648 손님 화면 → \"준비완료\"·\"방 나가기\" 있음, \"게임시작\"·\"방 삭제하기\" 없음", async () => {
  await openPage({ me: "guest-1" })
  assert.ok(button("준비완료"))
  assert.ok(button("방 나가기"))
  assert.equal(button("게임시작"), null)
  assert.equal(button("방 삭제하기"), null)
})

test("A01-F-649 방장 화면 → \"준비완료\"·\"게임시작\"·\"방 삭제하기\"", async () => {
  await openPage()
  assert.ok(button("준비완료"))
  assert.ok(button("게임시작"))
  assert.ok(button("방 삭제하기"))
})

test("A01-F-650 내 준비 참 → 단추 \"준비취소\"", async () => {
  await openPage({ room: roomOf({ n: 5, max: 6, ready: ["host"] }) })
  assert.ok(button("준비취소"))
  assert.equal(button("준비완료"), null)
})

test("A01-F-651 준비 보내는 중 → 단추 \"처리 중\", 꺼짐", async () => {
  const { fake } = await openPage()
  fake.answer("set_ready", HOLD)
  await act(async () => { fireEvent.click(button("준비완료")); await flush() })
  assert.equal(button("처리 중").disabled, true)
})

test("A01-F-652 자리 표시: 준비한 사람 자리 \"준비완료\", 안 한 사람 \"대기중\"", async () => {
  await openPage({ room: roomOf({ n: 5, max: 6, ready: ["host", "guest-2"] }) })
  const all = seats()
  assert.equal(all.length, 5)
  const labelOf = (seat) => `${seat.textContent} ${[...seat.querySelectorAll("img")].map((i) => i.alt).join(" ")}`
  assert.match(labelOf(all[0]), /준비완료/)
  assert.match(labelOf(all[1]), /대기중/)
  assert.match(labelOf(all[2]), /준비완료/)
})

// 정원·지금 인원 → "파티 인원" 숫자
for (const [id, max, n] of [["A01-F-653", 5, 3], ["A01-F-654", 6, 5], ["A01-F-655", 7, 7], ["A01-F-656", 8, 8], ["A01-F-657", 9, 9], ["A01-F-658", 10, 10]]) {
  test(`${id} 정원 ${max} 방, 지금 ${n}명 → "파티 인원" 숫자 ${n}`, async () => {
    await openPage({ room: roomOf({ n, max }) })
    const header = screen.getByLabelText(`파티 인원 ${n}명`)
    assert.match(header.textContent.replace(/\s+/g, " "), new RegExp(`파티 인원 ${n}명`))
    assert.equal(seats().length, n)
  })
}

test("A01-F-659 player_joined_room 뒤 → 새 자리 \"대기중\"", async () => {
  const { fake } = await openPage()
  await act(async () => {
    fake.serverSays("player_joined_room", { ...SAME, player: { uuid: "new-1", nickname: "새사람", isReady: false, membershipId: "m-new-1" } })
    await flush()
  })
  const all = seats()
  assert.equal(all.length, 6)
  const last = all[all.length - 1]
  assert.match(`${last.textContent} ${[...last.querySelectorAll("img")].map((i) => i.alt).join(" ")}`, /대기중/)
})

test("A01-F-660 host_changed { 나 } → \"게임시작\"·\"방 삭제하기\"·\"방 설정 변경\"·\"참가자 추방\" 생김", async () => {
  const { fake } = await openPage({ me: "guest-1" })
  assert.equal(button("게임시작"), null)
  await act(async () => { fake.serverSays("host_changed", { ...SAME, hostUuid: "guest-1", settingsVersion: 1 }); await flush() })
  for (const name of ["게임시작", "방 삭제하기", "방 설정 변경", "참가자 추방"]) assert.ok(button(name), `${name} 없음`)
})

test("A01-F-661 대기방 화면에 채팅 입력칸·채팅 목록 없음 (PC)", async () => {
  await openPage()
  assert.equal(screen.queryAllByRole("textbox").length, 0)
  assert.equal(screen.queryAllByRole("log").length, 0)
  assert.equal(screen.queryByText(/채팅/), null)
  assert.equal(screen.queryByLabelText(/채팅/), null)
})

test("A01-F-662 방 삭제 보내는 중 → \"방 삭제하기\" 꺼짐 (PC)", async () => {
  const { fake } = await openPage()
  fake.answer("delete_room", HOLD)
  await act(async () => { fireEvent.click(button("방 삭제하기")); await flush() })
  assert.equal(fake.sentOf("delete_room").length, 1)
  assert.equal(button("방 삭제하기").disabled, true)
})

test("A01-F-663 \"방 나가기\" 클릭 → leave_room 1번", async () => {
  const { fake } = await openPage({ me: "guest-1" })
  fake.answer("get_current_room", { ok: true, room: null })
  await act(async () => { fireEvent.click(button("방 나가기")); await flush() })
  assert.equal(fake.sentOf("leave_room").length, 1)
})

test("A01-F-664 \"방 삭제하기\" 클릭 → 확인 창 글 \"방을 삭제하면 모든 참가자가 나가게 됩니다. 삭제하시겠습니까?\"", async () => {
  const { dialogs } = await openPage()
  dialogs.confirmAnswer = false
  await act(async () => { fireEvent.click(button("방 삭제하기")); await flush() })
  assert.deepEqual(dialogs.confirms, ["방을 삭제하면 모든 참가자가 나가게 됩니다. 삭제하시겠습니까?"])
})

test("A01-F-665 손님 화면에 room_deleted → 대기방 화면 사라지고 방 목록", async () => {
  const { fake } = await openPage({ me: "guest-1" })
  fake.answer("get_current_room", { ok: true, room: null })
  await act(async () => { fake.serverSays("room_deleted", { roomId: "room-1" }); await flush() })
  assert.equal(button("방 나가기"), null)
  assert.ok(screen.getByRole("region", { name: "공개 방 목록" }))
})

test("A01-F-722 \"준비완료\"에 Enter → set_ready 1번 (jsdom 흉내)", async () => {
  const { fake } = await openPage()
  fake.answer("set_ready", { ok: true, isReady: true, roomId: "room-1", settingsVersion: 1, readyRevision: 1 })
  await act(async () => { pressEnter(button("준비완료")); await flush() })
  assert.equal(fake.sentOf("set_ready").length, 1)
})

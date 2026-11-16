// 화면 부품 시험: 대기방 친구 초대 창 — 손님·방장 둘 다 초대 단추, 친구 줄마다 초대, 성공하면 "초대중" 잠김, 실패 글, 거절 뒤에도 잠김, 새 방이면 다시 됨
// 목록 A01-F-666~672·725~726 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/invite-modal.test.js
// 초대 보내기는 HTTP(POST /friends/invites)라 가짜 fetch로 받음, 진짜 서버로는 안 나감
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 친구 셋 (접속 중)
const FRIENDS = [
  { id: "f-1", name: "친구가", online: true },
  { id: "f-2", name: "친구나", online: true },
  { id: "f-3", name: "친구다", online: true },
]

// 서버가 돌려주는 초대 한 줄
const inviteRow = (receiverId) => ({
  inviteId: `inv-${receiverId}`, receiverId, senderId: "me", status: "PENDING", revision: 1, creationSeq: "1",
})

// 대기방 화면 그리기, 초대 답은 inviteAnswer(받은 몸통 → { status, body })로 정함
async function openPage({ me = "host", room = roomOf({ n: 5, max: 6 }), inviteAnswer } = {}) {
  signIn(me)
  installDialogs(dom)
  const http = installFakeFetch({
    "GET /friends": { body: { data: FRIENDS } },
    "POST /friends/invites": inviteAnswer ?? ((body) => ({ status: 201, body: { data: inviteRow(body.receiverId) } })),
  })
  const fake = useFakeSocket()
  fake.answer("get_current_room", { ok: true, room })
  useMatchingStore.getState().setRoom(room)
  render(h(MemoryRouter, { initialEntries: ["/game-matching"] },
    h(Routes, null, h(Route, { path: "/game-matching", element: h(GameMatchingPage) }))))
  await act(async () => { await flush() })
  return { fake, http, room }
}

const inviteToggle = () => screen.queryByRole("button", { name: "친구 초대" })
const inviteDialog = () => screen.queryByRole("dialog", { name: "친구초대" })
// 창 열고 친구 목록 받기
async function openInvite() {
  await act(async () => { fireEvent.click(inviteToggle()); await flush(10) })
}
const rowOf = (name) => within(inviteDialog()).getByText(name).closest("li")
async function clickInvite(name) {
  await act(async () => { fireEvent.click(within(rowOf(name)).getByRole("button")); await flush(10) })
}

test("A01-F-666 손님 화면 → 친구 초대 단추 있음", async () => {
  await openPage({ me: "guest-1" })
  assert.ok(inviteToggle())
})

test("A01-F-667 방장 화면 → 친구 초대 단추 있음", async () => {
  await openPage()
  assert.ok(inviteToggle())
})

test("A01-F-668 친구 3명 → 줄 3개, 줄마다 초대 단추", async () => {
  await openPage()
  await openInvite()
  const rows = within(inviteDialog()).getAllByRole("listitem")
  assert.equal(rows.length, 3)
  for (const friend of FRIENDS) {
    assert.ok(within(rowOf(friend.name)).getByRole("button", { name: `${friend.name} 게임 초대` }))
  }
})

test("A01-F-669 초대 클릭 → 성공 → 그 줄 \"초대중\", 단추 꺼짐", async () => {
  const { http } = await openPage()
  await openInvite()
  await clickInvite("친구나")
  assert.deepEqual(http.calls.filter((c) => c.method === "POST").map((c) => c.body.receiverId), ["f-2"])
  const button = within(rowOf("친구나")).getByRole("button")
  assert.match(button.textContent, /초대중/)
  assert.equal(button.disabled, true)
})

test("A01-F-670 초대 실패 → 서버 글(없으면 \"초대를 보내지 못했습니다.\"), 단추 다시 켜짐", async () => {
  let withMessage = true
  await openPage({
    inviteAnswer: () => (withMessage
      ? { status: 409, body: { message: "방이 가득 차 초대를 보낼 수 없습니다." } }
      : { status: 409, body: {} }),
  })
  await openInvite()
  await clickInvite("친구가")
  assert.ok(within(inviteDialog()).getByRole("alert").textContent.includes("방이 가득 차 초대를 보낼 수 없습니다."))
  assert.equal(within(rowOf("친구가")).getByRole("button").disabled, false)
  withMessage = false
  await clickInvite("친구가")
  assert.equal(within(inviteDialog()).getByRole("alert").textContent, "초대를 보내지 못했습니다.")
  assert.equal(within(rowOf("친구가")).getByRole("button").disabled, false)
})

test("A01-F-671 친구가 거절(또는 3분 지남) → 같은 방에선 그 줄 계속 \"초대중\"", async () => {
  const { fake } = await openPage()
  await openInvite()
  await clickInvite("친구다")
  // 서버: 초대가 거절됨으로 바뀜 알림, 창을 닫았다 다시 엶
  await act(async () => {
    fake.serverSays("game_invite_updated", { invite: { ...inviteRow("f-3"), status: "DECLINED", revision: 2 } })
    fireEvent.click(within(inviteDialog()).getAllByRole("button", { name: "친구 초대 닫기" })[0])
    await flush()
  })
  assert.equal(inviteDialog(), null)
  await openInvite()
  const button = within(rowOf("친구다")).getByRole("button")
  assert.match(button.textContent, /초대중/)
  assert.equal(button.disabled, true)
})

test("A01-F-672 방을 나가 새 방이 되면 같은 친구 줄 초대 단추 켜짐", async () => {
  const { fake } = await openPage()
  await openInvite()
  await clickInvite("친구가")
  assert.equal(within(rowOf("친구가")).getByRole("button").disabled, true)
  // 새 방(다른 방 id)에 앉음
  const next = roomOf({ n: 5, max: 6, roomId: "room-2", roomInstanceId: "inst-2" })
  fake.answer("get_current_room", { ok: true, room: next })
  await act(async () => { useMatchingStore.getState().setRoom(next); await flush(10) })
  if (!inviteDialog()) await openInvite()
  const button = within(rowOf("친구가")).getByRole("button")
  assert.equal(button.disabled, false)
  assert.match(button.textContent, /초대하기/)
})

test("A01-F-725 손님이 초대 → \"초대중\"", async () => {
  await openPage({ me: "guest-1" })
  await openInvite()
  await clickInvite("친구가")
  assert.match(within(rowOf("친구가")).getByRole("button").textContent, /초대중/)
})

test("A01-F-726 초대 보내는 중 → 그 줄 단추 꺼짐", async () => {
  let release
  await openPage({ inviteAnswer: () => new Promise((resolve) => { release = resolve }) })
  await openInvite()
  await clickInvite("친구나")
  const button = within(rowOf("친구나")).getByRole("button")
  assert.equal(button.disabled, true)
  await act(async () => { release({ status: 201, body: { data: inviteRow("f-2") } }); await flush(10) })
})

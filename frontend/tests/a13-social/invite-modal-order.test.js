// 대기방 친구 초대 창 줄 차례·전적 칸 시험 (접속한 친구가 위·전적 없는 친구는 "기록 없음")
// 목록 A13-F-251~252 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/invite-modal-order.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act, fireEvent, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { installFetch, fakeSocket, signIn, resetAll, settle } = await import("./a13Kit.mjs")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")

const h = React.createElement
test.afterEach(() => { useMatchingStore.getState().clearRoom(); resetAll() })

// 대기방 (정원 6, 지금 2명, 내가 방장)
const ROOM = {
  roomId: "room-a13", roomCode: "AB12CD", hostUuid: "me-uuid", reservedHostUuid: null,
  players: [
    { uuid: "me-uuid", nickname: "가면손님", isReady: false, membershipId: "m-me" },
    { uuid: "g-1", nickname: "손님1", isReady: false, membershipId: "m-g1" },
  ],
  roomInstanceId: "inst-a13", bootEpoch: "boot-1", canStart: false, accessType: "open", settingsVersion: 1,
  settings: { maxPlayers: 6, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
}

// 친구 넷 (접속 2): 서버 차례는 접속 안 함·접속·접속 안 함·접속, 전적 칸 없음 (서버 목록 응답에 전적이 없음)
const FRIENDS = [
  { id: "f-1", name: "가람", online: false },
  { id: "f-2", name: "나래", online: true },
  { id: "f-3", name: "다솜", online: false },
  { id: "f-4", name: "라온", online: true },
]

// 대기방 화면을 그리고 친구 초대 창을 엶
async function openInviteModal() {
  signIn()
  window.alert = () => {}
  dom.window.alert = () => {}
  installFetch({ "GET /friends": { body: { data: FRIENDS } } })
  const socket = fakeSocket()
  socket.answer("get_current_room", { ok: true, room: ROOM })
  setSocket(socket)
  useMatchingStore.getState().setRoom(ROOM)
  await act(async () => {
    render(h(MemoryRouter, { initialEntries: ["/game-matching"] },
      h(Routes, null, h(Route, { path: "/game-matching", element: h(GameMatchingPage) }))))
    await settle()
  })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "친구 초대" })); await settle(8) })
  return screen.getByRole("dialog", { name: "친구초대" })
}

test("A13-F-251 정원 6 · 친구 4명(접속 2) → 접속한 친구 2명이 위", async () => {
  const dialog = await openInviteModal()
  const ids = within(dialog).getAllByRole("listitem").map((li) => li.getAttribute("data-friend-id"))
  assert.deepEqual(ids, ["f-2", "f-4", "f-1", "f-3"])
})

test("A13-F-252 정원 6 · 전적 없는 친구 → 전적 칸 \"기록 없음\"", async () => {
  await openInviteModal()
  const stats = ["f-1", "f-2", "f-3", "f-4"].map((id) => screen.getByTestId(`friend-invite-stats-${id}`).textContent)
  assert.deepEqual(stats, ["기록 없음", "기록 없음", "기록 없음", "기록 없음"])
})

// 화면 부품 시험: 로비 친구 창의 받은 초대 줄 — 보낸 사람·수락·거절, 수락 보냄, 성공하면 대기방, 실패 까닭 글, 연결 없음, 두 번 눌러도 한 번
// 목록 A01-F-696~707 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/invite-accept.test.js
// 받은 초대 탭은 친구 창(FriendListPanel) 안 초대 탭과 같은 연결(usePanelInvites + 친구 소켓 훅)로 그림
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useNavigate } = await import("react-router-dom")
const { useSyncExternalStore } = React
const { getSocket, subscribeSocket, setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { usePanelInvites } = await import("../../src/domains/lobby/hooks/friendPanel/usePanelInvites.js")
const { default: GameInviteTab } = await import("../../src/domains/lobby/components/friendList/invite/GameInviteTab.jsx")
const { useGameInviteStore } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { createFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, HOLD, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 받은 초대 한 줄 (서버 모양, 3분 뒤 만료)
const INVITE = {
  inviteId: "inv-1", receiverId: "me", senderId: "sender-1", senderName: "보낸친구",
  roomId: "room-1", status: "PENDING", revision: 1, creationSeq: "5",
  expiresAt: new Date(Date.now() + 180_000).toISOString(),
}

// 로비 친구 창 초대 탭 (친구 소켓 사건 받기 + 패널 초대 값)
function LobbyInviteTab() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  useFriendSocketEvents(socket, { navigate })
  const { inviteList } = usePanelInvites({ open: false, roomId: null, isRoomVerified: false })
  return h(GameInviteTab, { ...inviteList, onBack: () => {} })
}

// 로비에 초대 탭 그리기 (socket: false면 연결 없음), 초대 하나 받은 상태까지
async function openLobby({ socket = true } = {}) {
  signIn("me", "나")
  installDialogs(dom)
  installFakeFetch({ "GET /friends/invites": { body: { data: { invites: [INVITE], cursor: "0" } } } })
  const fake = createFakeSocket({ connected: false })
  setSocket(fake)
  // 스냅샷은 이미 받은 것으로 둠 (실시간 초대가 바로 목록에 들어가게)
  useGameInviteStore.getState().syncAccount()
  useGameInviteStore.setState({ status: "success", snapshotLoaded: true })
  render(h(MemoryRouter, { initialEntries: ["/lobby"] },
    h(Routes, null,
      h(Route, { path: "/lobby", element: h(LobbyInviteTab) }),
      h(Route, { path: "/game-matching", element: h("p", null, "대기방 화면") }),
    )))
  await act(async () => { fake.serverSays("game_invite_received", { invite: INVITE, sfxEvent: null }); await flush() })
  if (!socket) await act(async () => { setSocket(null); await flush() })
  return fake
}

const row = () => document.querySelector('[data-invite-id="inv-1"]')
const acceptButton = () => within(row()).getByRole("button", { name: /초대 수락/ })
const rowError = () => row()?.querySelector("[data-invite-error]")?.textContent ?? null
async function accept() {
  await act(async () => { fireEvent.click(acceptButton()); await flush(20) })
}

test("A01-F-696 초대 알림 → 초대 줄에 보낸 사람 닉네임·수락·거절", async () => {
  await openLobby()
  assert.ok(row())
  assert.ok(row().textContent.includes("보낸친구"))
  assert.ok(within(row()).getByRole("button", { name: "초대 수락" }))
  assert.ok(within(row()).getByRole("button", { name: "초대 거절" }))
})

test("A01-F-697 수락 클릭 → accept_game_invite { inviteId } 1번, 보내는 중 단추 꺼짐", async () => {
  const fake = await openLobby()
  fake.answer("accept_game_invite", HOLD)
  await accept()
  assert.deepEqual(fake.sentOf("accept_game_invite"), [{ inviteId: "inv-1" }])
  assert.equal(acceptButton().disabled, true)
})

test("A01-F-698 답 { ok: true, room } + 지금 방 확인 같음 → /game-matching", async () => {
  const fake = await openLobby()
  const room = roomOf({ n: 4, max: 6, uuids: ["sender-1", "g2", "g3", "me"] })
  fake.answer("accept_game_invite", { ok: true, room })
  fake.answer("get_current_room", { ok: true, room })
  await accept()
  assert.ok(screen.getByText("대기방 화면"))
  assert.equal(useMatchingStore.getState().roomId, "room-1")
})

// 서버 거절 답 → 그 초대 줄에 글
const REFUSALS = [
  ["A01-F-699", "ROOM_FULL", "방이 가득 찼습니다."],
  ["A01-F-700", "KICKED_TOO_MANY_TIMES", "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."],
  ["A01-F-701", "DESERTION_COOLDOWN", "탈주로 4분 59초 뒤에 참여할 수 있습니다."],
  ["A01-F-702", "ROOM_NOT_FOUND", "방을 찾을 수 없습니다."],
]
for (const [id, code, message] of REFUSALS) {
  test(`${id} 답 ${code} "${message}" → 그 초대 줄에 그 글`, async () => {
    const fake = await openLobby()
    fake.answer("accept_game_invite", { ok: false, code, message })
    await accept()
    assert.equal(rowError(), message)
  })
}

test("A01-F-703 답 { unknown: true } → \"입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.\"", async () => {
  const fake = await openLobby()
  fake.answer("accept_game_invite", { ok: false, unknown: true })
  fake.answer("get_game_invite_result", { ok: false })
  await accept()
  assert.equal(rowError(), "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.")
})

test("A01-F-704 답 { ok: false } (글 없음) → \"초대를 수락하지 못했습니다.\"", async () => {
  const fake = await openLobby()
  fake.answer("accept_game_invite", { ok: false })
  await accept()
  assert.equal(rowError(), "초대를 수락하지 못했습니다.")
})

test("A01-F-705 소켓 없음 → \"연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.\", 보냄 0번", async () => {
  const fake = await openLobby({ socket: false })
  await accept()
  assert.equal(rowError(), "연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
  assert.equal(fake.sentOf("accept_game_invite").length, 0)
})

test("A01-F-706 실패 글 있는 채 다시 수락 → 보내는 동안 글 없음", async () => {
  const fake = await openLobby()
  fake.answer("accept_game_invite", { ok: false, code: "ROOM_FULL", message: "방이 가득 찼습니다." })
  await accept()
  assert.equal(rowError(), "방이 가득 찼습니다.")
  fake.answer("accept_game_invite", HOLD)
  await accept()
  assert.equal(fake.sentOf("accept_game_invite").length, 2)
  assert.equal(rowError(), null)
})

test("A01-F-707 수락 두 번 빠르게 → 보냄 1번", async () => {
  const fake = await openLobby()
  fake.answer("accept_game_invite", HOLD)
  await act(async () => {
    fireEvent.click(acceptButton())
    fireEvent.click(acceptButton())
    await flush(10)
  })
  assert.equal(fake.sentOf("accept_game_invite").length, 1)
})

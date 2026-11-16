// 화면 부품 시험: 끝난 초대(시작된 방·삭제된 방·3분 지남)를 수락해 실패 → 다시 받은 목록에 그 초대가 없어도 줄과 실패 까닭 글이 남음
// 목록 A01-F-731~732 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/invite-accept-ended.test.js
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
const { useGameInviteStore, selectPendingInvites } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { createFakeSocket, signIn, resetAll, installDialogs, installFakeFetch, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 받은 초대 한 줄 (서버 모양)
const inviteOf = (expiresInMs) => ({
  inviteId: "inv-1", receiverId: "me", senderId: "sender-1", senderName: "보낸친구",
  roomId: "room-1", status: "PENDING", revision: 1, creationSeq: "5",
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
})

// 로비 친구 창 초대 탭 (친구 소켓 사건 받기 + 패널 초대 값)
function LobbyInviteTab() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  useFriendSocketEvents(socket, { navigate })
  const { inviteList } = usePanelInvites({ open: false, roomId: null, isRoomVerified: false })
  return h(GameInviteTab, { ...inviteList, onBack: () => {} })
}

// 초대 하나 받은 로비 초대 탭, 서버 목록은 이미 그 초대가 끝나 빈 목록을 줌 (판 시작·방 삭제·3분 지남 뒤 모양)
async function openLobbyWithGoneInvite(invite) {
  signIn("me", "나")
  installDialogs(dom)
  const http = installFakeFetch({ "GET /friends/invites": { body: { data: { invites: [], cursor: "5" } } } })
  const fake = createFakeSocket({ connected: false })
  setSocket(fake)
  useGameInviteStore.getState().syncAccount()
  useGameInviteStore.setState({ status: "success", snapshotLoaded: true })
  render(h(MemoryRouter, { initialEntries: ["/lobby"] },
    h(Routes, null,
      h(Route, { path: "/lobby", element: h(LobbyInviteTab) }),
      h(Route, { path: "/game-matching", element: h("p", null, "대기방 화면") }),
    )))
  await act(async () => { fake.serverSays("game_invite_received", { invite, sfxEvent: null }); await flush() })
  return { fake, http }
}

const row = () => document.querySelector('[data-invite-id="inv-1"]')

async function acceptAndFail(fake, message) {
  fake.answer("accept_game_invite", { ok: false, code: "ROOM_NOT_FOUND", message })
  await act(async () => {
    fireEvent.click(within(row()).getByRole("button", { name: /초대 수락/ }))
    await flush(30)
  })
}

test("A01-F-731 시작된 방 초대 수락 → \"방을 찾을 수 없습니다.\" → 다시 받은 목록에 그 초대가 없어도 줄·글 그대로, 수락 단추 없음, 대기 초대 수에서 빠짐", async () => {
  const { fake, http } = await openLobbyWithGoneInvite(inviteOf(180_000))
  await acceptAndFail(fake, "방을 찾을 수 없습니다.")
  // 실패 뒤 목록을 다시 받음 (서버 목록과 맞추기)
  assert.ok(http.calls.some((c) => c.method === "GET" && c.path === "/friends/invites"))
  assert.ok(row(), "초대 줄이 사라짐")
  assert.equal(row().querySelector("[data-invite-error]")?.textContent, "방을 찾을 수 없습니다.")
  assert.equal(screen.queryByText("받은 게임 초대가 없습니다."), null)
  assert.equal(within(row()).queryByRole("button", { name: /초대 수락/ }), null)
  assert.equal(selectPendingInvites(useGameInviteStore.getState().invites).length, 0)
})

test("A01-F-732 끝난 초대 수락 실패 뒤 목록을 한 번 더 받아도 그 줄·실패 글 그대로 (닫기 전까지 까닭을 읽을 수 있게)", async () => {
  const { fake } = await openLobbyWithGoneInvite(inviteOf(180_000))
  await acceptAndFail(fake, "초대가 만료되었습니다.")
  assert.equal(row()?.querySelector("[data-invite-error]")?.textContent, "초대가 만료되었습니다.")
  await act(async () => { await useGameInviteStore.getState().loadSnapshot(); await flush() })
  assert.equal(row()?.querySelector("[data-invite-error]")?.textContent, "초대가 만료되었습니다.")
  assert.equal(within(row()).queryByRole("button", { name: /초대 수락/ }), null)
})

// 판 화면 초대 안내 시험: 죽은 사람이 판 화면에 있는 채 초대를 받으면 "로비로 가면 수락" 안내 한 줄(role="status"), 로비에선 안 뜸, 같은 초대 두 번이면 안내 하나 (화면 부품)
// 목록 A13-F-535~540 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 결정 2026-11-16 낮 "로비로 가서 수락 안내"
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { RTL, dismissOverlays, installSocket, loginAs, renderInGamePage, resetAll, useInGameStore } from "../a02-role-reveal/a02Render.mjs"
import { buildGameStarted, nextGameId, seatCode } from "../a02-role-reveal/a02Fixtures.mjs"

const { createElement: h } = await import("react")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
const { useGameInviteStore } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { INVITE_NOTICE_MS } = await import("../../src/domains/game/ingame/hooks/useInGameInviteNotice.js")
const { default: LobbyPage } = await import("../../src/domains/lobby/pages/LobbyPage.jsx")

test.afterEach(() => {
  resetAll()
  mock.timers.reset()
  useGameInviteStore.getState().__resetForTests()
})

const NOTICE_TEXT = "민수 님이 대기방으로 초대했습니다. 게임에서 나가 로비로 가면 수락할 수 있습니다."

// 서버가 보내는 초대 줄 (받는 사람 = 나)
function inviteRow(me, { id = "inv-1", senderName = "민수", status = "PENDING", revision = 1, seq = "5" } = {}) {
  return {
    inviteId: id, senderId: `s-${id}`, senderName, receiverId: me.uuid, status, revision, creationSeq: seq,
    createdAt: "2026-11-16T00:00:00.000Z", expiresAt: new Date(Date.now() + 180_000).toISOString(),
    decidedAt: null, endReason: null, entryOutcome: null,
  }
}

// 초대 스토어를 내 계정으로 맞추고 목록을 받은 것으로 둠 (앱이 붙자마자 하는 일)
function inviteStoreReady(invites = []) {
  const store = useGameInviteStore.getState()
  store.syncAccount()
  useGameInviteStore.setState({ snapshotLoaded: true, status: "ready", invites, restorePending: false })
}

// 소켓 game_invite_received가 오면 앱이 하는 일 (friendSocket handlers.inviteReceived의 목록 넣기)
function inviteArrives(me, invite) {
  RTL.act(() => {
    useGameInviteStore.getState().receiveLiveInvite(me.uuid, invite, { kind: "game-invite", eventId: `game-invite:${invite.inviteId}:received`, accountId: me.uuid, origin: "live" })
  })
}

// 판 화면에 있는 사람 (6명 판, 나 = 셋째 자리), before(me) = 판 화면에 오기 전부터 받아 둔 초대
async function onInGame({ before = () => [] } = {}) {
  const seats = seatCode("J1D1C4", { gameTag: "inv" })
  const me = seats[2]
  installSocket()
  loginAs(me)
  inviteStoreReady(before(me))
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId: nextGameId("inv") })) })
  renderInGamePage()
  await dismissOverlays()
  return { me }
}

const noticeBoxes = () => [...document.querySelectorAll("[data-ingame-invite-notice]")]
const statusTexts = () => [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent.replace(/닫기$/, "").trim()).filter(Boolean)

test("A13-F-535 판 화면에서 초대 사건 → 안내 한 줄 보임 (role=status, 보낸 사람 이름)", async () => {
  const { me } = await onInGame()
  assert.equal(noticeBoxes().length, 0)
  inviteArrives(me, inviteRow(me))
  assert.equal(noticeBoxes().length, 1)
  assert.ok(statusTexts().includes(NOTICE_TEXT), statusTexts().join(" / "))
})

test("A13-F-536 같은 초대가 두 번 와도 안내 하나 (바뀜 사건으로 다시 와도)", async () => {
  const { me } = await onInGame()
  inviteArrives(me, inviteRow(me))
  inviteArrives(me, inviteRow(me))
  RTL.act(() => { useGameInviteStore.getState().receiveLiveInvite(me.uuid, inviteRow(me, { revision: 2 }), null) })
  assert.equal(noticeBoxes().length, 1)
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "초대 안내 닫기" }))
  inviteArrives(me, inviteRow(me))
  assert.equal(noticeBoxes().length, 0, "닫은 뒤 같은 초대가 또 와도 다시 안 뜸")
})

test("A13-F-537 판 화면에 들어오기 전부터 있던 초대 → 안내 없음, 그 뒤 새 초대만 안내", async () => {
  const { me } = await onInGame({ before: (viewer) => [inviteRow(viewer, { id: "old-1", senderName: "옛친구", seq: "3" })] })
  assert.equal(noticeBoxes().length, 0)
  inviteArrives(me, inviteRow(me, { id: "new-1", senderName: "민수", seq: "9" }))
  assert.deepEqual(noticeBoxes().map((el) => el.getAttribute("data-ingame-invite-notice")), ["new-1"])
})

test("A13-F-538 안내는 8초 뒤 저절로 사라짐", async () => {
  const { me } = await onInGame()
  mock.timers.enable({ apis: ["setTimeout"] })
  inviteArrives(me, inviteRow(me))
  assert.equal(noticeBoxes().length, 1)
  RTL.act(() => { mock.timers.tick(INVITE_NOTICE_MS - 1) })
  assert.equal(noticeBoxes().length, 1)
  RTL.act(() => { mock.timers.tick(1) })
  assert.equal(noticeBoxes().length, 0)
})

test("A13-F-539 보낸 사람 이름이 없는 초대 → 이름 없이 안내", async () => {
  const { me } = await onInGame()
  inviteArrives(me, inviteRow(me, { senderName: null }))
  assert.ok(statusTexts().includes("누군가 대기방으로 초대했습니다. 게임에서 나가 로비로 가면 수락할 수 있습니다."), statusTexts().join(" / "))
})

test("A13-F-540 로비 화면에서 초대 사건 → 판 화면 안내 없음, 초대는 받은 초대 목록(스토어)에만", async () => {
  const me = { uuid: "lobby-me", nickname: "나" }
  installSocket()
  loginAs(me)
  inviteStoreReady()
  const router = createMemoryRouter([
    { path: "/lobby", element: h(LobbyPage) },
    { path: "*", element: h("p", null, "다른 곳") },
  ], { initialEntries: ["/lobby"] })
  RTL.render(h(RouterProvider, { router }))
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
  inviteArrives(me, inviteRow(me))
  assert.equal(noticeBoxes().length, 0)
  assert.equal(document.body.textContent.includes("로비로 가면 수락"), false)
  assert.deepEqual(useGameInviteStore.getState().invites.map((i) => i.inviteId), ["inv-1"])
})

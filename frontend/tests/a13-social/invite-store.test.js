// 받은 게임 초대 스토어 시험 (초대 받음·바뀜·옛 소식 무시·순번 비교·첫 목록 실패 뒤 실시간·효과음 한 번만)
// 목록 A13-F-007~017 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/invite-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, act } = await import("@testing-library/react")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { useNotificationSocketEvents } = await import("../../src/domains/notifications/hooks/useNotificationSocketEvents.js")
const { useGameInviteStore } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { useNotificationsStore } = await import("../../src/domains/notifications/store/notifications.store.js")
const { default: NotificationEntryButton } = await import("../../src/domains/notifications/components/NotificationEntryButton.js")
const { compareSeq } = await import("../../src/domains/lobby/utils/gameInvite/invites.js")
const { installFetch, installSoundBox, fakeSocket, say, signIn, resetAll, settle, inviteRow, note, ME } = await import("./a13Kit.mjs")

let sound = null
test.afterEach(() => { sound?.remove(); sound = null; resetAll() })

// 친구·초대 알림 받기 + 알림 받기를 붙인 빈 화면
function Listener({ socket }) {
  useFriendSocketEvents(socket)
  useNotificationSocketEvents(socket)
  return null
}

// 연결된 소켓으로 붙임 → 붙자마자 초대·알림 목록을 받음
async function mount(routes = {}) {
  signIn()
  sound = installSoundBox()
  const http = installFetch(routes)
  const socket = fakeSocket({ connected: true })
  await act(async () => { render(React.createElement(Listener, { socket })); await settle(8) })
  return { http, socket }
}

// 서버가 보내는 초대 소리 봉투
const inviteSfx = (inviteId, origin = "live") => ({ kind: "game-invite", eventId: `game-invite:${inviteId}:received`, accountId: ME, origin })
const inviteSounds = () => sound.played.filter((kind) => kind === "game-invite").length
const invites = () => useGameInviteStore.getState().invites

test("A13-F-007 초대 받음 → 받은 초대 목록 1개, 보낸 사람 이름 민수", async () => {
  const { socket } = await mount()
  await say(socket, "game_invite_received", { invite: inviteRow({ id: "inv-1", senderName: "민수" }), sfxEvent: inviteSfx("inv-1") })
  assert.deepEqual(invites().map((i) => `${i.inviteId}:${i.senderName}`), ["inv-1:민수"])
})

test("A13-F-008 초대 바뀜 CANCELLED → 그 초대 대기 아님, 바뀜에선 효과음 0번", async () => {
  const { socket } = await mount()
  await say(socket, "game_invite_received", { invite: inviteRow({ id: "inv-1" }), sfxEvent: inviteSfx("inv-1") })
  const before = inviteSounds()
  await say(socket, "game_invite_updated", { invite: inviteRow({ id: "inv-1", status: "CANCELLED", revision: 2 }) })
  assert.equal(invites()[0].status, "CANCELLED")
  assert.equal(invites().filter((i) => i.status === "PENDING").length, 0)
  assert.equal(inviteSounds() - before, 0)
})

test("A13-F-009 revision 3 받은 뒤 revision 2 → 상태 그대로", async () => {
  const { socket } = await mount()
  await say(socket, "game_invite_updated", { invite: inviteRow({ id: "inv-1", status: "DECLINED", revision: 3 }) })
  await say(socket, "game_invite_updated", { invite: inviteRow({ id: "inv-1", status: "PENDING", revision: 2 }) })
  assert.deepEqual(invites().map((i) => `${i.status}:${i.revision}`), ["DECLINED:3"])
})

test("A13-F-010 같은 revision 두 번 → 한 번 받은 것과 같음", async () => {
  const { socket } = await mount()
  const once = inviteRow({ id: "inv-1", status: "EXPIRED", revision: 2 })
  await say(socket, "game_invite_updated", { invite: once })
  const afterOne = JSON.stringify(invites())
  await say(socket, "game_invite_updated", { invite: { ...once } })
  assert.equal(JSON.stringify(invites()), afterOne)
  assert.equal(invites().length, 1)
})

test("A13-F-011 순번 \"9\" < \"10\"", () => {
  assert.ok(compareSeq("9", "10") < 0)
})

test("A13-F-012 순번 \"007\" = \"7\"", () => {
  assert.equal(compareSeq("007", "7"), 0)
})

test("A13-F-013 순번 20자리 \"12345678901234567890\" > \"9999999999999999999\"", () => {
  assert.ok(compareSeq("12345678901234567890", "9999999999999999999") > 0)
})

test("A13-F-014 첫 초대 목록 실패 → 실시간 초대가 목록에 바로, 효과음은 다시 받기 전까지 0번", async () => {
  const { socket } = await mount({ "GET /friends/invites": { status: 500, body: { message: "잠깐 실패" } } })
  assert.equal(useGameInviteStore.getState().status, "error")
  await say(socket, "game_invite_received", { invite: inviteRow({ id: "inv-9", seq: "9" }), sfxEvent: inviteSfx("inv-9") })
  assert.deepEqual(invites().map((i) => i.inviteId), ["inv-9"])
  assert.equal(inviteSounds(), 0)
})

test("A13-F-015 첫 알림 목록 실패 → 실시간 알림이 목록·배지에 바로, 효과음은 다시 받기 전까지 0번", async () => {
  const { socket } = await mount({ "GET /notifications": { status: 500, body: { message: "잠깐 실패" } } })
  assert.equal(useNotificationsStore.getState().status, "error")
  render(React.createElement(NotificationEntryButton, { onOpen: () => {} }))
  const live = note("n-live", { type: "system" })
  await say(socket, "notification_created", {
    notification: live,
    sfxEvent: { kind: "system-notification", eventId: live.sourceKey, accountId: ME, origin: "live" },
  })
  assert.deepEqual(useNotificationsStore.getState().items.map((i) => i.id), ["n-live"])
  const badge = document.querySelector("[data-notification-entry]")
  assert.equal(badge.getAttribute("data-notification-unread-count"), "1")
  assert.equal(sound.played.length, 0)
})

test("A13-F-016 같은 사건 id 초대 두 번 → 소리 1번", async () => {
  const { socket } = await mount()
  const payload = { invite: inviteRow({ id: "inv-2", seq: "6" }), sfxEvent: inviteSfx("inv-2") }
  await say(socket, "game_invite_received", payload)
  await say(socket, "game_invite_received", { ...payload })
  assert.equal(inviteSounds(), 1)
})

test("A13-F-017 origin restore 초대 → 소리 0번", async () => {
  const { socket } = await mount()
  await say(socket, "game_invite_received", { invite: inviteRow({ id: "inv-3", seq: "7" }), sfxEvent: inviteSfx("inv-3", "restore") })
  assert.equal(invites().length, 1)
  assert.equal(inviteSounds(), 0)
})

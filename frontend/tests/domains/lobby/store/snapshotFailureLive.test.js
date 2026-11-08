// known 1-7: 첫 목록 받기가 실패해도 그 뒤 실시간 초대·알림이 목록·배지에 나와야 함
// 소리는 일부러 다시 받기 성공까지 미룸(과거 사건을 새 사건으로 울리지 않기, AC-07·CODEX-2 시험)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:5183/lobby" })
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

let snapshotResponder = async () => ({ invites: [], cursor: "0" })
mock.module("../../../../src/domains/lobby/api/friend.api.js", {
  namedExports: {
    fetchGameInviteSnapshot: async () => snapshotResponder(),
    fetchMyFriends: async () => [],
    fetchIncomingRequests: async () => [],
    fetchFriendRequestResults: async () => [],
    fetchFavoriteFriendIds: async () => [],
    setFriendFavoriteApi: async () => ({}),
    fetchBlockedUsers: async () => [],
    blockUserApi: async () => ({}),
    unblockUserApi: async () => ({}),
    searchFriendCandidates: async () => [],
    sendFriendRequest: async () => ({}),
    acceptFriendRequest: async () => ({}),
    declineFriendRequest: async () => ({}),
    createGameInviteApi: async () => ({}),
    fetchGameInviteApi: async () => ({}),
    declineGameInviteApi: async () => ({}),
  },
})

const { useGameInviteStore } = await import("../../../../src/domains/lobby/store/gameInvite.store.js")
const { useNotificationsStore, __setNotificationsApiForTests } = await import(
  "../../../../src/domains/notifications/store/notifications.store.js"
)
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")

const ME = "11111111-1111-4111-8111-111111111111"

function invite(overrides = {}) {
  return {
    inviteId: "inv-1",
    receiverId: ME,
    senderId: "22222222-2222-4222-8222-222222222222",
    status: "PENDING",
    revision: 1,
    creationSeq: "5",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

function notification(overrides = {}) {
  return {
    id: "n-1",
    type: "friend-request",
    sourceKey: "friend-request:9:received",
    title: "친구 신청",
    body: "본문",
    target: { kind: "settings" },
    createdAt: "2026-11-09T00:00:00.000Z",
    readAt: null,
    ...overrides,
  }
}

test.beforeEach(() => {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ME }, loggedOutIntentionally: false })
  useGameInviteStore.getState().__resetForTests()
  useNotificationsStore.getState().__resetForTests()
  __setNotificationsApiForTests(null)
})

test("1-7 초대: 첫 스냅샷이 실패한 뒤 온 실시간 초대가 목록에 들어감", async () => {
  snapshotResponder = async () => { throw new Error("network") }
  const result = await useGameInviteStore.getState().loadSnapshot()
  assert.equal(result.ok, false)
  assert.equal(useGameInviteStore.getState().status, "error")

  const live = invite()
  assert.equal(useGameInviteStore.getState().consumeInviteSound(ME, live), false, "소리는 다시 받기 성공까지 미룸")
  const applied = useGameInviteStore.getState().receiveLiveInvite(ME, live, { eventId: "e1" })
  assert.equal(applied.applied, true)
  assert.deepEqual(useGameInviteStore.getState().invites.map((row) => row.inviteId), ["inv-1"])
})

test("1-7 초대: 받는 중 버퍼에 쌓인 초대도 실패하면 목록에 나옴, 다시 시도 성공하면 합쳐짐", async () => {
  let reject
  snapshotResponder = () => new Promise((_, r) => { reject = r })
  const pending = useGameInviteStore.getState().loadSnapshot()
  useGameInviteStore.getState().receiveLiveInvite(ME, invite({ inviteId: "early", creationSeq: "3" }), null)
  reject(new Error("network"))
  await pending
  assert.deepEqual(useGameInviteStore.getState().invites.map((row) => row.inviteId), ["early"])

  snapshotResponder = async () => ({ invites: [invite({ inviteId: "early", creationSeq: "3" })], cursor: "4" })
  const retry = await useGameInviteStore.getState().loadSnapshot()
  assert.equal(retry.ok, true)
  assert.deepEqual(useGameInviteStore.getState().invites.map((row) => row.inviteId), ["early"])
})

test("1-7 알림: 첫 목록이 실패한 뒤 온 실시간 알림이 목록에 들어감", async () => {
  __setNotificationsApiForTests({ fetchNotificationsApi: async () => { throw new Error("network") } })
  await useNotificationsStore.getState().loadSnapshot()
  assert.equal(useNotificationsStore.getState().status, "error")

  const live = notification()
  const applied = useNotificationsStore.getState().receiveLiveNotification(ME, live)
  assert.equal(applied.applied, true)
  assert.deepEqual(useNotificationsStore.getState().items.map((row) => row.id), ["n-1"])
  assert.equal(useNotificationsStore.getState().consumeSoundEvent(ME, live.sourceKey), false, "소리는 미룸")
})

test("1-7 알림: 받는 중 버퍼에 쌓인 알림도 실패하면 목록에 나옴", async () => {
  let reject
  __setNotificationsApiForTests({ fetchNotificationsApi: () => new Promise((_, r) => { reject = r }) })
  const pending = useNotificationsStore.getState().loadSnapshot()
  useNotificationsStore.getState().receiveLiveNotification(ME, notification({ id: "early" }))
  reject(new Error("network"))
  await pending
  assert.deepEqual(useNotificationsStore.getState().items.map((row) => row.id), ["early"])
  assert.equal(useNotificationsStore.getState().snapshotLoaded, false, "ready 신호는 성공 때만")
})

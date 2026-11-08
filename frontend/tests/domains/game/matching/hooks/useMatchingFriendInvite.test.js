import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

// 서버 대신 부른 주소·몸통을 모음
const calls = []
let postImpl = async () => ({ id: "invite-1" })
const friendsList = [
  { id: "f-off", name: "안접속", online: false, accountProfilePhotoId: null, accountProfileBorderId: null },
  { id: "f-on", name: "접속", online: true, accountProfilePhotoId: "p", accountProfileBorderId: "b" },
]
mock.module("../../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
mock.module("../../../../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: async (url) => { calls.push({ method: "get", url }); return friendsList },
      post: async (url, body) => { calls.push({ method: "post", url, body }); return postImpl(url, body) },
      put: async () => ({}),
      patch: async () => ({}),
      delete: async () => ({}),
    },
    apiClient: async () => ({}),
    refreshAccessToken: async () => null,
  },
})

const { renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useFriendStore } = await import("../../../../../src/domains/lobby/store/friend.store.js")
const { useGameInviteStore } = await import("../../../../../src/domains/lobby/store/gameInvite.store.js")
const { useMatchingFriendInvite } = await import("../../../../../src/domains/game/matching/hooks/useMatchingFriendInvite.js")

function reset() {
  cleanup()
  calls.length = 0
  postImpl = async () => ({ id: "invite-1" })
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "me" } })
  useFriendStore.setState({ ...useFriendStore.getInitialState?.() })
  useGameInviteStore.getState().__resetForTests()
}

test("FE-004: 창을 열면 진짜 친구 목록을 받고, 접속한 친구가 먼저 나온다", async () => {
  reset()
  const { result } = renderHook(() => useMatchingFriendInvite({ roomId: "room-1", isRoomVerified: true }))
  assert.deepEqual(result.current.inviteFriends, [])
  await act(async () => { result.current.openFriendInviteModal() })
  assert.ok(calls.some((call) => call.method === "get" && call.url === "/friends"))
  assert.deepEqual(result.current.inviteFriends.map((friend) => friend.id), ["f-on", "f-off"])
  assert.equal(result.current.invitingIds.size, 0, "처음부터 초대 중인 가짜 친구가 없어야 함")
})

test("FE-004: 초대를 누르면 POST /friends/invites로 받는 사람·같은 방 키를 보내고 성공해야 초대중", async () => {
  reset()
  const { result } = renderHook(() => useMatchingFriendInvite({ roomId: "room-1", isRoomVerified: true }))
  await act(async () => { result.current.openFriendInviteModal() })
  await act(async () => { await result.current.inviteFriend("f-on") })
  const post = calls.find((call) => call.method === "post")
  assert.equal(post.url, "/friends/invites")
  assert.equal(post.body.receiverId, "f-on")
  assert.match(post.body.creationKey, /^room-1:f-on:/)
  assert.ok(result.current.invitingIds.has("f-on"))
  assert.equal(result.current.friendInviteError, null)
})

test("FE-004: 서버가 거절하면 초대중으로 안 바뀌고 실패 문구가 남음", async () => {
  reset()
  postImpl = async () => {
    const error = new Error("지금은 상대를 초대할 수 없습니다.")
    error.status = 409
    throw error
  }
  const { result } = renderHook(() => useMatchingFriendInvite({ roomId: "room-1", isRoomVerified: true }))
  await act(async () => { result.current.openFriendInviteModal() })
  await act(async () => { await result.current.inviteFriend("f-off") })
  assert.equal(result.current.invitingIds.has("f-off"), false)
  assert.equal(result.current.friendInviteError, "지금은 상대를 초대할 수 없습니다.")
})

test("FE-004: 방 확인 전엔 초대를 보내지 않음", async () => {
  reset()
  const { result } = renderHook(() => useMatchingFriendInvite({ roomId: "room-1", isRoomVerified: false }))
  await act(async () => { await result.current.inviteFriend("f-on") })
  assert.equal(calls.filter((call) => call.method === "post").length, 0)
})

test("known 3장: 자격을 잃으면 창이 닫히고, 되찾아도 저절로 다시 열리지 않음", async () => {
  reset()
  const { result, rerender } = renderHook(
    ({ roomId }) => useMatchingFriendInvite({ roomId, isRoomVerified: true }),
    { initialProps: { roomId: "room-1" } },
  )
  await act(async () => { result.current.openFriendInviteModal() })
  assert.equal(result.current.friendInviteModalOpen, true)
  rerender({ roomId: null })
  assert.equal(result.current.friendInviteModalOpen, false)
  rerender({ roomId: "room-1" })
  assert.equal(result.current.friendInviteModalOpen, false)
})

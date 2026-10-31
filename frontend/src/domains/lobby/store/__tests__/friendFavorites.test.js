import assert from "node:assert/strict"
import test, { mock } from "node:test"

let favoriteCalls = []
let favoriteResponder = async (friendId, favorite) => ({ friendId, favorite })
let favoriteIdsResponder = async () => []

mock.module("../../api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => [],
    fetchIncomingRequests: async () => [],
    fetchFavoriteFriendIds: async () => favoriteIdsResponder(),
    setFriendFavoriteApi: async (friendId, favorite) => {
      favoriteCalls.push([friendId, favorite])
      return favoriteResponder(friendId, favorite)
    },
    fetchBlockedUsers: async () => [],
    blockUserApi: async () => ({}),
    unblockUserApi: async () => ({}),
  },
})

const { useFriendStore } = await import("../friend.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { applyFriendFavoriteFlags } = await import("../../utils/applyFriendFavoriteFlags.js")
const { groupFriends } = await import("../../utils/groupFriends.js")

const FRIENDS = [
  { id: "f-1", name: "가면술사", online: true },
  { id: "f-2", name: "광대", online: false },
]

function groupWithCurrentFavorites() {
  const { friends, favoriteFriendIds } = useFriendStore.getState()
  return groupFriends(applyFriendFavoriteFlags(friends, favoriteFriendIds))
}

function idsOf(friends) {
  return friends.map((friend) => friend.id)
}

function signIn(uuid) {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid } })
  useFriendStore.getState().syncAccount()
}

function resetAll() {
  favoriteCalls = []
  favoriteResponder = async (friendId, favorite) => ({ friendId, favorite })
  favoriteIdsResponder = async () => []
  useFriendStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: false, user: null })
}

test.beforeEach(resetAll)
test.afterEach(resetAll)

test("AC-03: 서버가 확정한 즐겨찾기만 그룹 소속을 바꾼다", async () => {
  signIn("account-a")
  useFriendStore.setState({ friends: FRIENDS })

  const before = groupWithCurrentFavorites()
  assert.deepEqual(idsOf(before.favoriteFriends), [])
  assert.deepEqual(idsOf(before.onlineFriends), ["f-1"])

  await useFriendStore.getState().setFavorite("f-1", true)

  const afterAdd = groupWithCurrentFavorites()
  assert.deepEqual(idsOf(afterAdd.favoriteFriends), ["f-1"])
  assert.deepEqual(idsOf(afterAdd.onlineFriends), [])

  await useFriendStore.getState().setFavorite("f-1", false)

  const afterRemove = groupWithCurrentFavorites()
  assert.deepEqual(idsOf(afterRemove.favoriteFriends), [])
  assert.deepEqual(idsOf(afterRemove.onlineFriends), ["f-1"])
})

test("AC-03: 오프라인 친구도 즐겨찾기하면 즐겨찾기 그룹으로 이동한다", async () => {
  signIn("account-a")
  useFriendStore.setState({ friends: FRIENDS })

  assert.deepEqual(idsOf(groupWithCurrentFavorites().offlineFriends), ["f-2"])

  await useFriendStore.getState().setFavorite("f-2", true)

  const grouped = groupWithCurrentFavorites()
  assert.deepEqual(idsOf(grouped.offlineFriends), [])
  assert.deepEqual(idsOf(grouped.favoriteFriends), ["f-2"])
})

test("AC-03: 저장은 기존 Set을 그대로 두고 새 Set을 만든다", async () => {
  signIn("account-a")
  const previousFavorites = new Set(["f-1"])
  useFriendStore.setState({ friends: FRIENDS, favoriteFriendIds: previousFavorites })

  await useFriendStore.getState().setFavorite("f-2", true)

  const nextFavorites = useFriendStore.getState().favoriteFriendIds
  assert.notEqual(nextFavorites, previousFavorites)
  assert.deepEqual([...previousFavorites], ["f-1"])
  assert.deepEqual([...nextFavorites].sort(), ["f-1", "f-2"])
})

test("AC-03: 같은 값을 두 번 저장해도 결과가 뒤집히지 않는다(toggle이 아니다)", async () => {
  signIn("account-a")
  useFriendStore.setState({ friends: FRIENDS })

  await useFriendStore.getState().setFavorite("f-1", true)
  await useFriendStore.getState().setFavorite("f-1", true)

  assert.deepEqual(favoriteCalls, [["f-1", true], ["f-1", true]])
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-1"])
})

test("AC-03: 저장이 실패하면 별 상태를 바꾸지 않고 오류만 남긴다", async () => {
  signIn("account-a")
  useFriendStore.setState({ friends: FRIENDS })
  favoriteResponder = async () => { throw new Error("서버 오류") }

  const result = await useFriendStore.getState().setFavorite("f-1", true)

  assert.equal(result.ok, false)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [], "확정 전에는 별이 켜지지 않는다")
  assert.equal(useFriendStore.getState().favoriteErrors["f-1"], "서버 오류")
})

test("AC-03: 서버가 요청과 다른 값을 확정하면 서버 값을 따른다", async () => {
  signIn("account-a")
  useFriendStore.setState({ friends: FRIENDS })
  favoriteResponder = async () => ({ friendId: "f-1", favorite: false })

  await useFriendStore.getState().setFavorite("f-1", true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [])
})

test("AC-03: 서버 조회로 복원되고, 계정이 바뀌면 이전 계정 캐시가 즉시 비워진다", async () => {
  signIn("account-a")
  favoriteIdsResponder = async () => ["f-1", "f-2"]

  assert.deepEqual((await useFriendStore.getState().fetchFavorites()).ok, true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds].sort(), ["f-1", "f-2"])

  signIn("account-b")
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [])

  favoriteIdsResponder = async () => ["f-3"]
  await useFriendStore.getState().fetchFavorites()
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-3"])
  useAuthStore.setState({ isLoggedIn: false, user: null })
  useFriendStore.getState().syncAccount()
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [])
})

test("AC-03: 계정 전환 뒤 도착한 이전 계정의 응답은 무시된다", async () => {
  signIn("account-a")
  let release
  const gate = new Promise((resolve) => { release = resolve })
  favoriteIdsResponder = async () => { await gate; return ["from-account-a"] }

  const pending = useFriendStore.getState().fetchFavorites()
  signIn("account-b")
  release()

  const result = await pending
  assert.equal(result.ok, false)
  assert.equal(result.reason, "stale")
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [], "A의 지연 응답이 B에 반영되지 않는다")
})

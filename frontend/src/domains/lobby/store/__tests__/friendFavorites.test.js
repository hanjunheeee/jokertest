import assert from "node:assert/strict"
import test, { mock } from "node:test"

// F-19(AC-03): 즐겨찾기는 더 이상 프론트 로컬 Set이 아니다 — **서버가 소유한 계정별 값**이다.
// 그래서 이 스위트도 "동기 toggle"이 아니라 실제 저장 경계(setFriendFavoriteApi)를 대역으로
// 두고 서버 확정 응답만 상태를 바꾸는지 확인한다. store가 모듈을 불러올 때 실제 서버 요청이
// 나가지 않도록 API 경계를 상대 경로로 대체한다.
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

// useFriendListSync가 화면에 넘기는 것과 같은 경로로 그룹을 만듭니다.
function groupWithCurrentFavorites() {
  const { friends, favoriteFriendIds } = useFriendStore.getState()
  return groupFriends(applyFriendFavoriteFlags(friends, favoriteFriendIds))
}

function idsOf(friends) {
  return friends.map((friend) => friend.id)
}

/** 로그인 계정을 세운다 — store의 계정 경계가 anonymous로 판정해 저장을 거르지 않게. */
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
  // 즐겨찾기로 옮겨간 친구는 일반 온라인 그룹에서 빠져야 합니다.
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
  // 서버가 (예: 경합으로) false를 확정한 경우 — 요청한 true를 믿지 않는다.
  favoriteResponder = async () => ({ friendId: "f-1", favorite: false })

  await useFriendStore.getState().setFavorite("f-1", true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [])
})

test("AC-03: 서버 조회로 복원되고, 계정이 바뀌면 이전 계정 캐시가 즉시 비워진다", async () => {
  signIn("account-a")
  favoriteIdsResponder = async () => ["f-1", "f-2"]

  assert.deepEqual((await useFriendStore.getState().fetchFavorites()).ok, true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds].sort(), ["f-1", "f-2"])

  // A → B 전환: A의 즐겨찾기는 B의 화면에 남지 않는다.
  signIn("account-b")
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], [])

  // 로그아웃도 마찬가지다.
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

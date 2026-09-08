import assert from "node:assert/strict"
import test, { mock } from "node:test"

// store가 모듈을 불러올 때 실제 서버 요청이 나가지 않도록 API 경계를 상대 경로로 대체합니다.
mock.module("../../api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => [],
    fetchIncomingRequests: async () => [],
  },
})

const { useFriendStore } = await import("../friend.store.js")
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

test("즐겨찾기를 토글하면 친구의 그룹 소속이 바뀐다", () => {
  const initialState = useFriendStore.getState()

  try {
    useFriendStore.setState({ friends: FRIENDS, favoriteFriendIds: new Set() })

    const before = groupWithCurrentFavorites()
    assert.deepEqual(idsOf(before.favoriteFriends), [])
    assert.deepEqual(idsOf(before.onlineFriends), ["f-1"])

    useFriendStore.getState().toggleFavorite("f-1")

    const afterAdd = groupWithCurrentFavorites()
    assert.deepEqual(idsOf(afterAdd.favoriteFriends), ["f-1"])

    // 즐겨찾기로 옮겨간 친구는 일반 온라인 그룹에서 빠져야 합니다.
    assert.deepEqual(idsOf(afterAdd.onlineFriends), [])

    useFriendStore.getState().toggleFavorite("f-1")

    const afterRemove = groupWithCurrentFavorites()
    assert.deepEqual(idsOf(afterRemove.favoriteFriends), [])
    assert.deepEqual(idsOf(afterRemove.onlineFriends), ["f-1"])
  } finally {
    useFriendStore.setState(initialState, true)
  }
})

test("오프라인 친구도 즐겨찾기하면 즐겨찾기 그룹으로 이동한다", () => {
  const initialState = useFriendStore.getState()

  try {
    useFriendStore.setState({ friends: FRIENDS, favoriteFriendIds: new Set() })

    assert.deepEqual(idsOf(groupWithCurrentFavorites().offlineFriends), ["f-2"])

    useFriendStore.getState().toggleFavorite("f-2")

    const grouped = groupWithCurrentFavorites()
    assert.deepEqual(idsOf(grouped.offlineFriends), [])
    assert.deepEqual(idsOf(grouped.favoriteFriends), ["f-2"])
  } finally {
    useFriendStore.setState(initialState, true)
  }
})

test("toggleFavorite은 기존 Set을 그대로 두고 새 Set을 만든다", () => {
  const initialState = useFriendStore.getState()

  try {
    const previousFavorites = new Set(["f-1"])
    useFriendStore.setState({ friends: FRIENDS, favoriteFriendIds: previousFavorites })

    useFriendStore.getState().toggleFavorite("f-2")

    const nextFavorites = useFriendStore.getState().favoriteFriendIds

    assert.notEqual(nextFavorites, previousFavorites)
    assert.deepEqual([...previousFavorites], ["f-1"])
    assert.deepEqual([...nextFavorites].sort(), ["f-1", "f-2"])
  } finally {
    useFriendStore.setState(initialState, true)
  }
})

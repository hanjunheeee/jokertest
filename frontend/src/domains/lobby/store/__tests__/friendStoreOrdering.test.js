import assert from "node:assert/strict"
import test, { mock } from "node:test"

let friendsResponder = async () => []
let incomingResponder = async () => []
let favoriteIdsResponder = async () => []
let favoriteResponder = async (friendId, favorite) => ({ friendId, favorite })

mock.module("../../api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => friendsResponder(),
    fetchIncomingRequests: async () => incomingResponder(),
    fetchFavoriteFriendIds: async () => favoriteIdsResponder(),
    setFriendFavoriteApi: async (friendId, favorite) => favoriteResponder(friendId, favorite),
    fetchBlockedUsers: async () => [],
    blockUserApi: async () => ({}),
    unblockUserApi: async () => ({}),
  },
})

const { useFriendStore } = await import("../friend.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")

function signIn(uuid) {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid } })
  useFriendStore.getState().syncAccount()
}

function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open }
}

function resetAll() {
  friendsResponder = async () => []
  incomingResponder = async () => []
  favoriteIdsResponder = async () => []
  favoriteResponder = async (friendId, favorite) => ({ friendId, favorite })
  useFriendStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: false, user: null })
}

test.beforeEach(resetAll)
test.afterEach(resetAll)

test("AC-03: setFavorite보다 먼저 시작한 조회가 늦게 끝나도 서버 확정 즐겨찾기를 덮지 않는다", async () => {
  signIn("account-a")
  const slowFetch = gate()
  favoriteIdsResponder = async () => { await slowFetch.promise; return [] }

  const fetching = useFriendStore.getState().fetchFavorites()

  await useFriendStore.getState().setFavorite("f-1", true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-1"])

  slowFetch.open()
  const result = await fetching

  assert.equal(result.ok, true)
  assert.deepEqual(
    [...useFriendStore.getState().favoriteFriendIds], ["f-1"],
    "서버가 확정한 별이 과거 조회값으로 되돌아갔다 — 정확한 복원이 깨진다",
  )
})

test("AC-03: 조회 중에 한 명을 확정 저장해도 나머지 친구의 서버 저장 별을 잃지 않는다", async () => {
  signIn("account-a")
  const slowFetch = gate()
  favoriteIdsResponder = async () => { await slowFetch.promise; return ["f-2", "f-3"] }

  const fetching = useFriendStore.getState().fetchFavorites()

  await useFriendStore.getState().setFavorite("f-1", true)

  slowFetch.open()
  const result = await fetching
  assert.equal(result.ok, true)

  assert.deepEqual(
    [...useFriendStore.getState().favoriteFriendIds].sort(), ["f-1", "f-2", "f-3"],
    "확정 저장 한 건 때문에 조회 전체를 버리면 다른 친구들의 저장된 별이 사라진다",
  )
})

test("AC-03: 조회 중에 확정한 해제는 그 조회가 담고 있던 켜짐을 이기고, 다른 친구는 그대로다", async () => {
  signIn("account-a")
  const slowFetch = gate()
  favoriteIdsResponder = async () => { await slowFetch.promise; return ["f-1", "f-2"] }

  const fetching = useFriendStore.getState().fetchFavorites()

  favoriteResponder = async (friendId) => ({ friendId, favorite: false })
  await useFriendStore.getState().setFavorite("f-1", false)

  slowFetch.open()
  await fetching

  assert.deepEqual(
    [...useFriendStore.getState().favoriteFriendIds], ["f-2"],
    "나중에 확정된 해제가 과거 조회값으로 되살아나면 별이 저절로 켜진다",
  )
})

test("AC-03: 저장보다 **나중에 시작한** 조회는 그 저장을 다시 덮어쓸 수 있다(대조군)", async () => {
  signIn("account-a")
  await useFriendStore.getState().setFavorite("f-1", true)

  favoriteIdsResponder = async () => ["f-9"]
  await useFriendStore.getState().fetchFavorites()

  assert.deepEqual(
    [...useFriendStore.getState().favoriteFriendIds], ["f-9"],
    "확정 표식이 영구히 남으면 다른 기기의 변경을 영영 복원하지 못한다",
  )
})

test("AC-03: 저장 뒤에 **시작한** 조회는 정상적으로 서버 값을 반영한다", async () => {
  signIn("account-a")
  await useFriendStore.getState().setFavorite("f-1", true)

  favoriteIdsResponder = async () => ["f-2"]
  const result = await useFriendStore.getState().fetchFavorites()

  assert.equal(result.ok, true)
  assert.equal(result.superseded, undefined)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-2"])
})

test("AC-01: 먼저 시작한 친구 조회가 늦게 끝나도 나중 조회 결과를 덮지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  friendsResponder = async () => { await first.promise; return [{ id: "old" }] }

  const lobbyFetch = useFriendStore.getState().fetchFriends()

  friendsResponder = async () => [{ id: "new" }]
  await useFriendStore.getState().fetchFriends()
  assert.deepEqual(useFriendStore.getState().friends.map((f) => f.id), ["new"])

  first.open()
  const stale = await lobbyFetch

  assert.equal(stale.superseded, true)
  assert.deepEqual(
    useFriendStore.getState().friends.map((f) => f.id), ["new"],
    "늦게 도착한 오래된 조회가 최신 목록을 덮었다",
  )
})

test("AC-01: 오래된 조회의 실패는 최신 조회의 성공을 오류로 덮지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  incomingResponder = async () => { await first.promise; throw new Error("network down") }

  const failing = useFriendStore.getState().fetchIncomingRequests()

  incomingResponder = async () => [{ request_id: 7 }]
  await useFriendStore.getState().fetchIncomingRequests()

  first.open()
  await failing

  assert.equal(useFriendStore.getState().incomingError, null, "지난 실패가 최신 성공을 덮으면 안 된다")
  assert.deepEqual(useFriendStore.getState().incomingRequests.map((r) => r.request_id), [7])
})

test("AC-02: 최신 조회도 실패했다면 밀려난 오래된 실패를 성공으로 보고하지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  friendsResponder = async () => { await first.promise; throw new Error("older down") }
  const older = useFriendStore.getState().fetchFriends()

  friendsResponder = async () => { throw new Error("newer down") }
  const newer = await useFriendStore.getState().fetchFriends()
  assert.equal(newer.ok, false)

  first.open()
  const stale = await older

  assert.equal(stale.ok, false, "최신 결과도 실패인데 오래된 호출이 성공을 보고했다")
  assert.equal(stale.superseded, true)
  assert.equal(stale.reason, "superseded-error")
  assert.equal(
    useFriendStore.getState().friendsError, "newer down",
    "화면에는 최신 실패가 남아야 한다",
  )
})

test("AC-02: 최신 조회가 실패했으면 밀려난 오래된 **성공**도 최신으로 주장하지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  incomingResponder = async () => { await first.promise; return [{ request_id: 1 }] }
  const older = useFriendStore.getState().fetchIncomingRequests()

  incomingResponder = async () => { throw new Error("newer down") }
  await useFriendStore.getState().fetchIncomingRequests()

  first.open()
  const stale = await older

  assert.equal(stale.ok, false)
  assert.equal(stale.reason, "superseded-error")
  assert.deepEqual(
    useFriendStore.getState().incomingRequests, [],
    "밀려난 호출이 목록을 쓰면 최신 실패와 화면이 어긋난다",
  )
})

test("AC-02: 최신 조회가 성공했다면 밀려난 오래된 실패는 성공으로 보고한다(대조군)", async () => {
  signIn("account-a")
  const first = gate()
  friendsResponder = async () => { await first.promise; throw new Error("older down") }
  const older = useFriendStore.getState().fetchFriends()

  friendsResponder = async () => [{ id: "fresh" }]
  await useFriendStore.getState().fetchFriends()

  first.open()
  const stale = await older

  assert.equal(stale.ok, true, "최신 목록이 실제로 있는데 재조회 실패로 안내하면 사실과 다르다")
  assert.equal(stale.superseded, true)
  assert.equal(useFriendStore.getState().friendsError, null)
})

test("AC-02: 처리로 목록에서 뺀 요청은 그 전에 시작한 조회가 되살리지 못한다", async () => {
  signIn("account-a")
  useFriendStore.setState({ incomingRequests: [{ request_id: 1 }, { request_id: 2 }] })

  const slow = gate()
  incomingResponder = async () => { await slow.promise; return [{ request_id: 1 }, { request_id: 2 }] }
  const fetching = useFriendStore.getState().fetchIncomingRequests()

  useFriendStore.getState().removeIncomingRequest(1)

  slow.open()
  await fetching

  assert.deepEqual(
    useFriendStore.getState().incomingRequests.map((r) => r.request_id), [2],
    "처리된 요청이 화면에 되살아나면 사용자가 같은 요청을 다시 누른다",
  )
})

test("AC-02: 확정 처리로 한 행을 내린 것이 겹쳐 실패한 전체 재조회를 성공으로 바꾸지 않는다", async () => {
  signIn("account-a")
  useFriendStore.setState({ incomingRequests: [{ request_id: 1 }, { request_id: 2 }] })

  const slow = gate()
  incomingResponder = async () => { await slow.promise; throw new Error("refresh down") }
  const failing = useFriendStore.getState().fetchIncomingRequests()

  useFriendStore.getState().removeIncomingRequest(1)

  slow.open()
  const result = await failing

  assert.equal(result.ok, false, "실패한 재조회가 성공으로 보고되면 화면이 낡은 목록을 최신으로 안내한다")
  assert.equal(result.reason, "error")
  assert.equal(useFriendStore.getState().incomingError, "refresh down")
  assert.deepEqual(
    useFriendStore.getState().incomingRequests.map((r) => r.request_id), [2],
    "조회 실패가 확정 처리된 행을 되살리면 안 된다",
  )
})

test("AC-02: 제거보다 먼저 시작한 조회가 성공해도 그 행은 되살아나지 않고, 조회 성공은 그대로 보고된다", async () => {
  signIn("account-a")
  const slow = gate()
  incomingResponder = async () => { await slow.promise; return [{ request_id: 1 }, { request_id: 2 }] }
  const fetching = useFriendStore.getState().fetchIncomingRequests()

  useFriendStore.getState().removeIncomingRequest(1)

  slow.open()
  const result = await fetching

  assert.equal(result.ok, true, "조회 자체는 성공했다 — 한 행의 제거가 그 사실을 바꾸지 않는다")
  assert.equal(result.superseded, undefined)
  assert.deepEqual(
    useFriendStore.getState().incomingRequests.map((r) => r.request_id), [2],
    "확정 처리된 요청이 되살아나면 사용자가 같은 요청을 다시 누른다",
  )
  assert.deepEqual(
    Object.keys(useFriendStore.getState().incomingRemovals), ["1"],
    "이 조회는 제거보다 먼저 시작했으므로 표식이 아직 남아 있어야 한다",
  )

  incomingResponder = async () => [{ request_id: 2 }]
  await useFriendStore.getState().fetchIncomingRequests()
  assert.deepEqual(useFriendStore.getState().incomingRemovals, {})
})

test("AC-02: 제거 **뒤에** 시작한 조회가 같은 행을 다시 주면 그대로 보여준다(대조군)", async () => {
  signIn("account-a")
  useFriendStore.setState({ incomingRequests: [{ request_id: 1 }] })
  useFriendStore.getState().removeIncomingRequest(1)
  assert.deepEqual(useFriendStore.getState().incomingRequests, [])

  incomingResponder = async () => [{ request_id: 1 }]
  await useFriendStore.getState().fetchIncomingRequests()

  assert.deepEqual(
    useFriendStore.getState().incomingRequests.map((r) => r.request_id), [1],
    "제거 표식이 영구히 남으면 서버에 실재하는 요청을 영영 보지 못한다",
  )
})

test("AC-02: 잠금은 공용 store가 소유해 화면이 바뀌어도 같은 요청을 두 번 처리하지 않는다", () => {
  signIn("account-a")

  assert.deepEqual(useFriendStore.getState().lockRequests([1, 2]), [1, 2])

  assert.deepEqual(
    useFriendStore.getState().lockRequests([1, 2]), [],
    "다른 화면이 같은 요청을 다시 잠그면 중복 처리가 된다",
  )
  assert.deepEqual(useFriendStore.getState().lockRequests([2, 3]), [3], "겹치지 않는 것만 새로 잠근다")

  useFriendStore.getState().unlockRequests([1, 2, 3])
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
})

test("AC-02: 소유 표식이 있는 잠금은 그 작업만 풀 수 있다", () => {
  signIn("account-a")
  const older = useFriendStore.getState().beginOperation()
  const newer = useFriendStore.getState().beginOperation()
  assert.notEqual(older, newer, "작업 번호는 매번 새로 발급돼야 한다")

  assert.deepEqual(useFriendStore.getState().lockRequests([7], older), [7])

  useFriendStore.getState().unlockRequests([7], newer)
  assert.deepEqual(
    [...useFriendStore.getState().processingRequestIds], [7],
    "남의 작업이 잠금을 풀면 같은 요청에 두 번째 처리가 나간다",
  )

  useFriendStore.getState().unlockRequests([7], older)
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
})

test("AC-02: A→B→A로 돌아와 다시 잠근 요청을 옛 작업의 해제가 풀지 못한다", () => {
  signIn("account-a")
  const oldOperation = useFriendStore.getState().beginOperation()
  useFriendStore.getState().lockRequests([7], oldOperation)

  signIn("account-b")
  signIn("account-a")

  const newOperation = useFriendStore.getState().beginOperation()
  assert.deepEqual(useFriendStore.getState().lockRequests([7], newOperation), [7])

  useFriendStore.getState().unlockRequests([7], oldOperation)

  assert.deepEqual(
    [...useFriendStore.getState().processingRequestIds], [7],
    "계정 세대만으로는 A→B→A를 구분하지 못한다 — 소유 표식이 새 작업을 지켜야 한다",
  )
})

test("AC-02: 계정이 바뀌면 이전 계정의 잠금과 전체 수락 집계가 함께 사라진다", () => {
  signIn("account-a")
  useFriendStore.getState().lockRequests([1, 2])
  useFriendStore.getState().setAcceptAllResult({
    running: false, accepted: 2, failed: 0, unconfirmed: 0, refreshError: null, completedAt: 1,
  })

  signIn("account-b")

  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  assert.deepEqual(useFriendStore.getState().acceptAllResult, {
    running: false, accepted: 0, failed: 0, unconfirmed: 0, refreshError: null, completedAt: null,
  }, "이전 계정의 처리 집계가 새 계정 화면에 남으면 안 된다")

  useFriendStore.getState().lockRequests([9])
  useFriendStore.getState().unlockRequests([1, 2])
  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [9])
})

test("AC-02: 계정 전환 뒤 도착한 조회는 새 계정 목록을 건드리지 않는다", async () => {
  signIn("account-a")
  const slow = gate()
  friendsResponder = async () => { await slow.promise; return [{ id: "from-a" }] }
  const pending = useFriendStore.getState().fetchFriends()

  signIn("account-b")
  slow.open()
  const result = await pending

  assert.equal(result.ok, false)
  assert.equal(result.reason, "stale")
  assert.deepEqual(useFriendStore.getState().friends, [])
})

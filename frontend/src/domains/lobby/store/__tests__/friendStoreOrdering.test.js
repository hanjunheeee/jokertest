import assert from "node:assert/strict"
import test, { mock } from "node:test"

// ---------------------------------------------------------------------------
// F-19 AC-01/AC-02/AC-03 · friend.store의 **같은 계정 안** 순서 보호와 공용 처리 잠금.
//
// 계정 세대(accountGeneration)는 "계정이 바뀐 것"만 잡는다. 같은 계정에서 조회가 겹치면
// 세대가 똑같아서, 먼저 시작한 조회가 늦게 끝나며 나중 결과를 덮어쓸 수 있었다. 여기서
// 재현하는 순서는 전부 실제로 일어나는 것이다:
//
//   - 로비와 대기방이 같은 store를 보는데 두 화면이 각자 목록을 조회한다(AC-01).
//   - 별을 누른 직후 패널을 다시 열어 즐겨찾기 조회가 겹친다(AC-03).
//   - 패널이 언마운트·리마운트되며 같은 요청을 다시 처리하려 한다(AC-02).
//
// 네트워크 경계(friend.api.js)만 대역이고 store는 실제 코드다.
// ---------------------------------------------------------------------------

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

/** 수동으로 열 수 있는 문. 응답 도착 **순서**를 시험이 직접 정한다. */
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

// ---------------------------------------------------------------------------
// AC-03 · 조회가 서버 확정 변경을 덮지 않는다
// ---------------------------------------------------------------------------

test("AC-03: setFavorite보다 먼저 시작한 조회가 늦게 끝나도 서버 확정 즐겨찾기를 덮지 않는다", async () => {
  signIn("account-a")
  // 서버에는 아직 아무 즐겨찾기도 없다 — 이 조회가 그 시점의 사실을 들고 있다.
  const slowFetch = gate()
  favoriteIdsResponder = async () => { await slowFetch.promise; return [] }

  const fetching = useFriendStore.getState().fetchFavorites()

  // 조회가 아직 도는 동안 사용자가 별을 눌렀고 서버가 true로 확정했다.
  await useFriendStore.getState().setFavorite("f-1", true)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-1"])

  // 이제 오래된 조회가 도착한다. 이것은 저장 **이전**의 사실이다.
  slowFetch.open()
  const result = await fetching

  assert.equal(result.ok, true)
  assert.equal(result.superseded, true, "오래된 조회는 반영되지 않았음을 알려야 한다")
  assert.deepEqual(
    [...useFriendStore.getState().favoriteFriendIds], ["f-1"],
    "서버가 확정한 별이 과거 조회값으로 되돌아갔다 — 정확한 복원이 깨진다",
  )
})

test("AC-03: 저장 뒤에 **시작한** 조회는 정상적으로 서버 값을 반영한다", async () => {
  signIn("account-a")
  await useFriendStore.getState().setFavorite("f-1", true)

  // 다른 브라우저에서 즐겨찾기를 바꾼 뒤 이쪽이 다시 조회한 상황.
  favoriteIdsResponder = async () => ["f-2"]
  const result = await useFriendStore.getState().fetchFavorites()

  assert.equal(result.ok, true)
  assert.equal(result.superseded, undefined)
  assert.deepEqual([...useFriendStore.getState().favoriteFriendIds], ["f-2"])
})

// ---------------------------------------------------------------------------
// AC-01 · 같은 계정의 두 화면이 겹쳐 조회해도 오래된 목록이 이기지 않는다
// ---------------------------------------------------------------------------

test("AC-01: 먼저 시작한 친구 조회가 늦게 끝나도 나중 조회 결과를 덮지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  friendsResponder = async () => { await first.promise; return [{ id: "old" }] }

  // 로비가 조회를 시작한다(느리다).
  const lobbyFetch = useFriendStore.getState().fetchFriends()

  // 대기방으로 이동해 같은 store를 다시 조회한다 — 이쪽이 먼저 끝난다.
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

// ---------------------------------------------------------------------------
// AC-02 · 밀려난(superseded) 호출은 **그때의 최신 사실**을 돌려준다
//
// 예전에는 claimSeq가 실패하면 무조건 { ok: true, superseded: true }였다. 그런데 순번을
// 차지한 더 최신 요청도 **실패**했다면 화면에는 최신 목록이 없다 — 그런데도 오래된 호출이
// 성공을 보고해 전체 수락의 "재조회 실패" 안내가 통째로 사라졌다(CODEX-2).
// ---------------------------------------------------------------------------

test("AC-02: 최신 조회도 실패했다면 밀려난 오래된 실패를 성공으로 보고하지 않는다", async () => {
  signIn("account-a")
  const first = gate()
  friendsResponder = async () => { await first.promise; throw new Error("older down") }
  const older = useFriendStore.getState().fetchFriends()

  // 더 나중에 시작한 조회도 실패한다 — 이쪽이 먼저 끝나 순번을 차지한다.
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

  // 오래된 성공은 **반영되지 않았다**. 반영된 최신 사실은 실패다.
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

  // 그 사이에 1번을 수락해 확정 처리했다.
  useFriendStore.getState().removeIncomingRequest(1)

  slow.open()
  await fetching

  assert.deepEqual(
    useFriendStore.getState().incomingRequests.map((r) => r.request_id), [2],
    "처리된 요청이 화면에 되살아나면 사용자가 같은 요청을 다시 누른다",
  )
})

// ---------------------------------------------------------------------------
// AC-02 · 처리 잠금은 화면이 아니라 계정에 묶인다
// ---------------------------------------------------------------------------

test("AC-02: 잠금은 공용 store가 소유해 화면이 바뀌어도 같은 요청을 두 번 처리하지 않는다", () => {
  signIn("account-a")

  // 로비 패널이 전체 수락을 시작하며 두 요청을 잠갔다.
  assert.deepEqual(useFriendStore.getState().lockRequests([1, 2]), [1, 2])

  // 사용자가 대기방으로 이동해 패널이 새로 마운트된다. 예전에는 훅 지역 상태라 잠금이
  // 통째로 사라졌고, 새 화면이 같은 요청을 다시 처리할 수 있었다.
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

  // 다른 작업(또는 옛 계정에서 시작한 완료)의 해제는 무시된다.
  useFriendStore.getState().unlockRequests([7], newer)
  assert.deepEqual(
    [...useFriendStore.getState().processingRequestIds], [7],
    "남의 작업이 잠금을 풀면 같은 요청에 두 번째 처리가 나간다",
  )

  // 주인은 풀 수 있다.
  useFriendStore.getState().unlockRequests([7], older)
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
})

test("AC-02: A→B→A로 돌아와 다시 잠근 요청을 옛 작업의 해제가 풀지 못한다", () => {
  signIn("account-a")
  const oldOperation = useFriendStore.getState().beginOperation()
  useFriendStore.getState().lockRequests([7], oldOperation)

  signIn("account-b")
  signIn("account-a")

  // 돌아온 A에서 같은 요청에 새 작업이 걸린다.
  const newOperation = useFriendStore.getState().beginOperation()
  assert.deepEqual(useFriendStore.getState().lockRequests([7], newOperation), [7])

  // 이제 첫 A에서 시작했던 작업의 finally가 뒤늦게 도착한다.
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

  // 이전 계정의 잠금 해제가 뒤늦게 도착해도 새 계정 상태를 건드리지 않는다.
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

import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://127.0.0.1:5183/lobby",
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("localStorage", dom.window.localStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const calls = { friends: 0, incoming: 0, favorites: 0, accept: 0, decline: 0, results: 0 }
let friendsResponder = async () => []
let incomingResponder = async () => []
let acceptResponder = async () => ({})
let declineResponder = async () => ({})
let resultsResponder = async () => []

mock.module("../../api/friend.api.js", {
  namedExports: {
    fetchMyFriends: async () => { calls.friends += 1; return friendsResponder() },
    fetchIncomingRequests: async () => { calls.incoming += 1; return incomingResponder() },
    fetchFavoriteFriendIds: async () => { calls.favorites += 1; return [] },
    setFriendFavoriteApi: async (friendId, favorite) => ({ friendId, favorite }),
    fetchBlockedUsers: async () => [],
    blockUserApi: async () => ({}),
    unblockUserApi: async () => ({}),
    acceptFriendRequest: async (id) => { calls.accept += 1; return acceptResponder(id) },
    declineFriendRequest: async (id) => { calls.decline += 1; return declineResponder(id) },
    fetchFriendRequestResults: async (ids) => { calls.results += 1; return resultsResponder(ids) },
  },
})

const { act, createElement } = await import("react")
const { createRoot } = await import("react-dom/client")
const { useFriendListSync } = await import("../useFriendListSync.js")
const { useFriendStore } = await import("../../store/friend.store.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function flush(times = 8) {
  return (async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })()
}

function gate() {
  let open
  let fail
  const promise = new Promise((resolve, reject) => { open = resolve; fail = reject })
  promise.catch(() => {})
  return { promise, open, fail }
}

let sync = null
function Harness() {
  sync = useFriendListSync(true)
  return null
}

async function mountHook() {
  const container = dom.window.document.createElement("div")
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(Harness)) })
  await act(async () => { await flush() })
  return {
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

function signIn(uuid) {
  useAuthStore.setState(
    uuid === null ? { isLoggedIn: false, user: null } : { isLoggedIn: true, user: { uuid } },
  )
  useFriendStore.getState().syncAccount()
}

async function switchAccount(uuid) {
  await act(async () => { signIn(uuid); await flush() })
}

function resetAll() {
  friendsResponder = async () => []
  incomingResponder = async () => []
  acceptResponder = async () => ({})
  declineResponder = async () => ({})
  resultsResponder = async () => []
  for (const key of Object.keys(calls)) calls[key] = 0
  sync = null
  useFriendStore.getState().__resetForTests()
  useAuthStore.setState({ isLoggedIn: false, user: null })
}

test.beforeEach(resetAll)
test.afterEach(resetAll)

test("AC-02: A→B→A 사이에 도착한 옛 수락 응답이 새 작업의 잠금을 풀지 않는다", async () => {
  signIn(ACCOUNT_A)
  const mounted = await mountHook()

  const oldCall = gate()
  acceptResponder = async () => { await oldCall.promise; return {} }
  let firstDone = false
  const first = sync.handleAcceptRequest(7).then(() => { firstDone = true })
  await act(async () => { await flush() })
  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [7])

  await switchAccount(ACCOUNT_B)
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0, "계정이 바뀌면 잠금을 버린다")
  await switchAccount(ACCOUNT_A)

  const newCall = gate()
  acceptResponder = async () => { await newCall.promise; return {} }
  const second = sync.handleAcceptRequest(7)
  await act(async () => { await flush() })
  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [7])
  const friendsBefore = calls.friends
  const incomingBefore = calls.incoming

  await act(async () => { oldCall.open(); await first; await flush() })

  assert.equal(firstDone, true, "옛 작업은 끝나야 한다 — 조용히 사라지는 것이 아니다")
  assert.deepEqual(
    [...useFriendStore.getState().processingRequestIds], [7],
    "옛 완료가 새 작업의 잠금을 풀면 같은 요청에 두 번째 수락이 나간다",
  )
  assert.equal(calls.friends, friendsBefore, "옛 계정의 완료가 목록을 다시 읽으면 안 된다")
  assert.equal(calls.incoming, incomingBefore)

  await act(async () => { newCall.open(); await second; await flush() })
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

test("AC-02: A→B→A 사이에 실패한 옛 거절 응답도 새 작업의 잠금을 풀지 않는다", async () => {
  signIn(ACCOUNT_A)
  const mounted = await mountHook()

  const oldCall = gate()
  declineResponder = async () => { await oldCall.promise; return {} }
  const first = sync.handleDeclineRequest(11)
  await act(async () => { await flush() })

  await switchAccount(ACCOUNT_B)
  await switchAccount(ACCOUNT_A)

  const newCall = gate()
  declineResponder = async () => { await newCall.promise; return {} }
  const second = sync.handleDeclineRequest(11)
  await act(async () => { await flush() })
  const incomingBefore = calls.incoming

  await act(async () => { oldCall.fail(new Error("network down")); await first; await flush() })

  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [11])
  assert.equal(calls.incoming, incomingBefore, "옛 계정의 실패가 새 계정 목록을 다시 읽으면 안 된다")

  await act(async () => { newCall.open(); await second; await flush() })
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

test("AC-02: 같은 계정에서 정상적으로 끝난 수락은 잠금을 제대로 푼다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 3 }]
  const mounted = await mountHook()
  assert.deepEqual(useFriendStore.getState().incomingRequests.map((r) => r.request_id), [3])

  await act(async () => { await sync.handleAcceptRequest(3); await flush() })

  assert.equal(useFriendStore.getState().processingRequestIds.size, 0, "소유 대조가 정상 해제까지 막으면 안 된다")
  assert.deepEqual(useFriendStore.getState().incomingRequests, [], "수락한 요청은 목록에서 빠진다")
  assert.equal(calls.accept, 1)
  await mounted.unmount()
})

test("AC-02: 결과 조회를 기다리는 사이 계정이 바뀌면 재조회도 집계도 새 계정에 적용하지 않는다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 1 }, { request_id: 2 }]
  const mounted = await mountHook()

  acceptResponder = async (id) => {
    if (id === 1) throw new Error("network down")
    return {}
  }
  const lookup = gate()
  resultsResponder = async () => { await lookup.promise; return [{ request_id: 1, status: "ACCEPTED" }] }

  const bulk = sync.handleAcceptAll()
  await act(async () => { await flush() })
  assert.equal(calls.results, 1, "응답을 못 받은 요청은 서버에 되물어야 한다")
  assert.equal(useFriendStore.getState().acceptAllResult.running, true)

  await switchAccount(ACCOUNT_B)
  const friendsBefore = calls.friends
  const incomingBefore = calls.incoming

  await act(async () => { lookup.open(); await bulk; await flush() })

  assert.equal(calls.friends, friendsBefore, "옛 계정의 전체 수락이 새 계정 친구 목록을 다시 읽었다")
  assert.equal(calls.incoming, incomingBefore, "옛 계정의 전체 수락이 새 계정 받은 요청을 다시 읽었다")
  assert.deepEqual(
    useFriendStore.getState().acceptAllResult,
    { running: false, accepted: 0, failed: 0, unconfirmed: 0, refreshError: null, completedAt: null },
    "이전 계정의 처리 집계가 새 계정 화면에 남으면 안 된다",
  )
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

test("AC-02: 전체 수락이 도는 동안 A→B→A로 돌아와 잠근 요청을 옛 완료가 풀지 않는다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 5 }]
  const mounted = await mountHook()

  const oldCall = gate()
  acceptResponder = async () => { await oldCall.promise; return {} }
  const bulk = sync.handleAcceptAll()
  await act(async () => { await flush() })
  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [5])

  await switchAccount(ACCOUNT_B)
  await switchAccount(ACCOUNT_A)

  const newCall = gate()
  acceptResponder = async () => { await newCall.promise; return {} }
  const single = sync.handleAcceptRequest(5)
  await act(async () => { await flush() })
  assert.deepEqual([...useFriendStore.getState().processingRequestIds], [5])

  await act(async () => { oldCall.open(); await bulk; await flush() })
  assert.deepEqual(
    [...useFriendStore.getState().processingRequestIds], [5],
    "옛 전체 수락의 완료가 새 단건 작업의 잠금을 풀면 안 된다",
  )

  await act(async () => { newCall.open(); await single; await flush() })
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

test("AC-02: 같은 계정의 전체 수락은 독립 처리 결과와 재조회를 그대로 안내한다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 1 }, { request_id: 2 }, { request_id: 3 }]
  const mounted = await mountHook()

  acceptResponder = async (id) => {
    if (id === 2) throw Object.assign(new Error("이미 처리된 요청입니다."), { status: 409 })
    if (id === 3) throw new Error("network down")
    return {}
  }
  resultsResponder = async () => [
    { request_id: 2, status: "DECLINED" },
    { request_id: 3, status: "ACCEPTED" },
  ]
  incomingResponder = async () => [{ request_id: 2 }]

  await act(async () => { await sync.handleAcceptAll(); await flush() })

  const result = useFriendStore.getState().acceptAllResult
  assert.equal(result.running, false)
  assert.equal(result.accepted, 2, "1번 성공 + 3번 응답 유실 뒤 확인된 성공")
  assert.equal(result.failed, 1, "서버가 확정 거부한 2번")
  assert.equal(result.unconfirmed, 0)
  assert.equal(result.refreshError, null)
  assert.deepEqual(useFriendStore.getState().incomingRequests.map((r) => r.request_id), [2])
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

test("AC-02: 결과 조회까지 실패하면 성공으로도 실패로도 단정하지 않는다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 9 }]
  const mounted = await mountHook()

  acceptResponder = async () => { throw new Error("network down") }
  resultsResponder = async () => { throw new Error("lookup down") }

  await act(async () => { await sync.handleAcceptAll(); await flush() })

  const result = useFriendStore.getState().acceptAllResult
  assert.equal(result.accepted, 0)
  assert.equal(result.failed, 0)
  assert.equal(result.unconfirmed, 1, "모르는 것을 실패로 바꾸지 않는다")
  await mounted.unmount()
})

test("AC-02: 전체 수락의 재조회가 더 최신 **실패**에 밀리면 재조회 오류를 그대로 안내한다", async () => {
  signIn(ACCOUNT_A)
  incomingResponder = async () => [{ request_id: 4 }]
  const mounted = await mountHook()

  acceptResponder = async () => ({})
  const slowFriends = gate()
  friendsResponder = async () => { await slowFriends.promise; return [{ id: "f-1" }] }

  const bulk = sync.handleAcceptAll()
  await act(async () => { await flush() })

  friendsResponder = async () => { throw new Error("network down") }
  await act(async () => { await useFriendStore.getState().fetchFriends(); await flush() })
  assert.equal(useFriendStore.getState().friendsError, "network down")

  await act(async () => { slowFriends.open(); await bulk; await flush() })

  const result = useFriendStore.getState().acceptAllResult
  assert.equal(result.accepted, 1, "처리 결과 자체는 그대로 안내한다")
  assert.equal(result.failed, 0)
  assert.ok(
    result.refreshError,
    "최신 재조회가 실패했는데 안내가 사라지면 사용자는 낡은 목록을 최신으로 믿는다",
  )
  assert.match(result.refreshError, /친구 목록/)
  assert.equal(useFriendStore.getState().processingRequestIds.size, 0)
  await mounted.unmount()
})

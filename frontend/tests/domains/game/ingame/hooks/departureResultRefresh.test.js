import test, { mock } from "node:test"
import assert from "node:assert/strict"

import { act } from "react"
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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let profileResponses = []
let pendingGates = []
const requestLog = []

mock.module("../../../../../src/domains/user/api/user.api.js", {
  namedExports: {
    getMyProfileApi: async () => {
      const index = requestLog.length
      requestLog.push(index)
      const gate = pendingGates[index]
      if (gate) await gate.promise
      const response = profileResponses[index] ?? profileResponses[profileResponses.length - 1]
      if (response instanceof Error) throw response
      return response
    },
  },
})

const { renderHook } = await import("@testing-library/react")
const { useUserProfileStore } = await import("../../../../../src/domains/user/store/user.store.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useMyProfile } = await import("../../../../../src/shared/hooks/useMyProfile.js")
const { refreshAccountCaches, registerAccountCacheStores, clearAccountCacheStores } =
  await import("../../../../../src/domains/user/utils/accountCacheRefresh.js")

async function flush(before) {
  await act(async () => {
    before?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function makeGate() {
  let release
  const promise = new Promise((resolve) => { release = resolve })
  return { promise, release: () => release() }
}

function profile(totalGames, accountWinRate = 0) {
  return {
    nickname: "tester",
    title: "신참",
    total_games: totalGames,
    account_win_rate: accountWinRate,
    survival_count: 0,
    execution_count: 0,
    most_played_role: null,
    highest_win_rate_role: null,
  }
}

test.beforeEach(() => {
  profileResponses = []
  pendingGates = []
  requestLog.length = 0
  useUserProfileStore.getState().reset()
  useUserProfileStore.setState({
    data: null, loading: true, requestGeneration: 0, invalidationRevision: 0, appliedRevision: 0,
  })
  clearAccountCacheStores()
  useAuthStore.setState({ user: { uuid: "u-1" }, isLoggedIn: true })
})

test("A-10: commit 직전에 시작된 조회는 무효화 이후 도착해도 최신 화면을 덮어쓰지 못한다", async () => {
  const gate = makeGate()
  pendingGates[0] = gate
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(4)

  const stalled = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()

  const refreshed = useUserProfileStore.getState().invalidate()

  gate.release()
  await stalled
  await refreshed

  assert.equal(useUserProfileStore.getState().data.total_games, 4, "옛 응답이 최신 값을 덮어썼다")
  assert.equal(requestLog.length, 2, "무효화는 실제 서버 조회를 한 번 더 시작해야 한다")
  assert.equal(useUserProfileStore.getState().isStale(), false)
})

test("A-10: 무효화는 캐시를 비우지 않는다 — 화면이 빈 값으로 깜빡이지 않고 stale로만 표시된다", async () => {
  profileResponses[0] = profile(3)
  await useUserProfileStore.getState().fetchProfile()
  assert.equal(useUserProfileStore.getState().data.total_games, 3)

  const gate = makeGate()
  pendingGates[1] = gate
  profileResponses[1] = profile(4)

  const refreshing = useUserProfileStore.getState().invalidate()
  assert.equal(useUserProfileStore.getState().data.total_games, 3)
  assert.equal(useUserProfileStore.getState().isStale(), true)

  gate.release()
  await refreshing
  assert.equal(useUserProfileStore.getState().data.total_games, 4)
  assert.equal(useUserProfileStore.getState().isStale(), false)
})

test("A-10: A→B→A 계정 전환 뒤에 도착한 옛 응답은 현재 화면을 바꾸지 않는다", async () => {
  const gate = makeGate()
  pendingGates[0] = gate
  profileResponses[0] = profile(99)

  const stalled = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()

  useUserProfileStore.getState().reset()
  useUserProfileStore.getState().reset()

  gate.release()
  await stalled

  assert.equal(useUserProfileStore.getState().data, null, "옛 계정의 응답이 되살아났다")
})

test("A-10: 조회 실패도 무효화 세대를 통과한 경우에만 반영된다(늦은 실패가 최신 값을 지우지 않는다)", async () => {
  profileResponses[0] = profile(3)
  await useUserProfileStore.getState().fetchProfile()

  const gate = makeGate()
  pendingGates[1] = gate
  profileResponses[1] = new Error("네트워크 실패")
  profileResponses[2] = profile(4)

  const failing = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()
  const refreshed = useUserProfileStore.getState().invalidate()

  gate.release()
  await failing
  await refreshed

  assert.equal(useUserProfileStore.getState().data.total_games, 4)
  assert.equal(useUserProfileStore.getState().loading, false)
})

test("A-10: 화면 재진입은 캐시가 있어도 서버를 다시 읽고, 표시 숫자가 최신 값으로 바뀐다", async () => {
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(4)

  const first = renderHook(() => useMyProfile())
  await flush()
  assert.equal(first.result.current.stats[0].value, "3")
  first.unmount()

  const second = renderHook(() => useMyProfile())
  await flush()

  assert.equal(requestLog.length, 2, "재진입은 서버 조회를 한 번 더 해야 한다")
  assert.equal(second.result.current.stats[0].value, "4", "화면에 최신 전적이 표시되지 않았다")
  second.unmount()
})

test("A-10: 같은 순간에 뜬 두 화면의 조회는 하나로 합쳐진다(중복 요청 없음)", async () => {
  const gate = makeGate()
  pendingGates[0] = gate
  profileResponses[0] = profile(5)

  const lobby = renderHook(() => useMyProfile())
  const myPage = renderHook(() => useMyProfile())
  await flush()

  assert.equal(requestLog.length, 1, "동시에 뜬 두 화면이 각자 요청을 보냈다")

  await flush(() => gate.release())
  assert.equal(lobby.result.current.stats[0].value, "5")
  assert.equal(myPage.result.current.stats[0].value, "5")
  lobby.unmount()
  myPage.unmount()
})

test("A-10: 창 재활성화는 그 화면의 값을 다시 확인한다(신호를 놓친 경우의 수렴)", async () => {
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(9)

  const view = renderHook(() => useMyProfile())
  await flush()
  assert.equal(view.result.current.stats[0].value, "3")

  await flush(() => dom.window.dispatchEvent(new dom.window.Event("focus")))

  assert.equal(requestLog.length, 2)
  assert.equal(view.result.current.stats[0].value, "9")
  view.unmount()
})

test("A-10: 무효화가 도착하면 화면은 stale을 표시하고, 새 값이 오면 해제된다", async () => {
  profileResponses[0] = profile(3)
  const view = renderHook(() => useMyProfile())
  await flush()
  assert.equal(view.result.current.isStale, false)

  const gate = makeGate()
  pendingGates[1] = gate
  profileResponses[1] = profile(4)

  await flush(() => { useUserProfileStore.getState().invalidate() })
  assert.equal(view.result.current.stats[0].value, "3")
  assert.equal(view.result.current.isStale, true)

  await flush(() => gate.release())
  assert.equal(view.result.current.stats[0].value, "4")
  assert.equal(view.result.current.isStale, false)
  view.unmount()
})

test("A-10: 조회 실패는 로딩을 풀고 화면이 재시도할 수 있는 상태로 남긴다", async () => {
  profileResponses[0] = new Error("네트워크 실패")
  profileResponses[1] = profile(2, 0.5)

  const view = renderHook(() => useMyProfile())
  await flush()
  assert.equal(view.result.current.profile, null)
  assert.equal(view.result.current.loading, false)
  assert.equal(view.result.current.stats, null)
  assert.notEqual(view.result.current.error, null)
  assert.equal(view.result.current.isStale, true)
  assert.equal(typeof view.result.current.retry, "function")

  await flush(() => view.result.current.retry())
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "2" },
    { label: "승률", value: "50.0%" },
  ])
  assert.equal(view.result.current.error, null)
  view.unmount()
})

test("A-10: 무효화를 놓친 뒤의 재조회 실패는 캐시를 지우지 않되 그 사실을 화면에 남긴다", async () => {
  profileResponses[0] = profile(3, 1 / 3)
  profileResponses[1] = new Error("네트워크 실패")
  profileResponses[2] = profile(7, 1)

  const view = renderHook(() => useMyProfile())
  await flush()
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  assert.equal(view.result.current.isStale, false)
  assert.equal(view.result.current.error, null)

  await flush(() => dom.window.dispatchEvent(new dom.window.Event("focus")))

  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  assert.notEqual(view.result.current.error, null, "실패했는데 화면이 그 사실을 모른다")
  assert.equal(view.result.current.isStale, true)
  assert.equal(typeof view.result.current.retry, "function")

  await flush(() => view.result.current.retry())
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "7" },
    { label: "승률", value: "100.0%" },
  ])
  assert.equal(view.result.current.error, null)
  assert.equal(view.result.current.isStale, false)
  view.unmount()
})

test("F-30 AC-02/AC-03: 캐시된 3판 33.3%는 갱신 대기 중에도 그대로 보이고, 4판 50.0%로 함께 바뀐다", async () => {
  profileResponses[0] = profile(3, 1 / 3)
  const view = renderHook(() => useMyProfile())
  await flush()
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  assert.equal(view.result.current.isStale, false)

  const gate = makeGate()
  pendingGates[1] = gate
  profileResponses[1] = profile(4, 1 / 2)

  await flush(() => { useUserProfileStore.getState().invalidate() })
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  assert.equal(view.result.current.isStale, true)

  await flush(() => gate.release())
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "4" },
    { label: "승률", value: "50.0%" },
  ])
  assert.equal(view.result.current.isStale, false)
  view.unmount()
})

const UNDISPLAYABLE_RESPONSES = [
  ["판수 누락", (() => { const row = profile(3, 0.5); delete row.total_games; return row })()],
  ["승률 누락", (() => { const row = profile(3, 0.5); delete row.account_win_rate; return row })()],
  ["판수 null", { ...profile(3, 0.5), total_games: null }],
  ["승률 null", { ...profile(3, 0.5), account_win_rate: null }],
  ["판수 문자열", { ...profile(3, 0.5), total_games: "3" }],
  ["승률 문자열", { ...profile(3, 0.5), account_win_rate: "0.5" }],
  ["판수 NaN", { ...profile(3, 0.5), total_games: Number.NaN }],
  ["승률 NaN", { ...profile(3, 0.5), account_win_rate: Number.NaN }],
  ["판수 무한대", { ...profile(3, 0.5), total_games: Number.POSITIVE_INFINITY }],
  ["승률 무한대", { ...profile(3, 0.5), account_win_rate: Number.POSITIVE_INFINITY }],
  ["판수 음수", { ...profile(3, 0.5), total_games: -1 }],
  ["승률 음수", { ...profile(3, 0.5), account_win_rate: -0.1 }],
  ["승률 1 초과", { ...profile(3, 0.5), account_win_rate: 1.2 }],
  ["판수 소수", { ...profile(3, 0.5), total_games: 3.5 }],
  ["판수 안전 정수 초과", { ...profile(3, 0.5), total_games: Number.MAX_SAFE_INTEGER + 2 }],
  ["응답이 객체가 아님", "not-an-object"],
]

for (const [label, response] of UNDISPLAYABLE_RESPONSES) {
  test(`F-30 AC-03: ${label} 응답은 성공 캐시로 저장되지 않고 실패 상태로 남는다`, async () => {
    profileResponses[0] = response
    profileResponses[1] = profile(5, 0.2)

    const view = renderHook(() => useMyProfile())
    await flush()

    assert.equal(useUserProfileStore.getState().data, null, `${label} 응답이 캐시에 저장됐다`)
    assert.equal(view.result.current.stats, null, `${label} 응답이 0판으로 위장됐다`)
    assert.notEqual(view.result.current.error, null, `${label} 응답이 실패로 표시되지 않았다`)
    assert.equal(view.result.current.loading, false)

    await flush(() => view.result.current.retry())
    assert.deepEqual(view.result.current.stats, [
      { label: "전체 판수", value: "5" },
      { label: "승률", value: "20.0%" },
    ])
    assert.equal(view.result.current.error, null)
    view.unmount()
  })
}

test("F-30 AC-03: 이미 확인된 값이 있을 때 도착한 잘못된 응답은 그 값을 덮지 않고 갱신 실패로만 남는다", async () => {
  profileResponses[0] = profile(6, 0.25)
  profileResponses[1] = { ...profile(6, 0.25), account_win_rate: "0.9" }
  profileResponses[2] = profile(8, 0.75)

  const view = renderHook(() => useMyProfile())
  await flush()
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "6" },
    { label: "승률", value: "25.0%" },
  ])

  await flush(() => dom.window.dispatchEvent(new dom.window.Event("focus")))

  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "6" },
    { label: "승률", value: "25.0%" },
  ], "잘못된 갱신 응답이 마지막으로 확인된 값을 덮었다")
  assert.notEqual(view.result.current.error, null)
  assert.equal(view.result.current.isStale, true)

  await flush(() => view.result.current.retry())
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "8" },
    { label: "승률", value: "75.0%" },
  ])
  assert.equal(view.result.current.error, null)
  view.unmount()
})

test("A-10: 더 새로운 성공이 반영된 뒤 도착한 옛 실패는 그 성공을 실패로 되돌리지 못한다", async () => {
  profileResponses[0] = profile(3)
  await useUserProfileStore.getState().fetchProfile()

  const gate = makeGate()
  pendingGates[1] = gate
  profileResponses[1] = new Error("네트워크 실패")
  profileResponses[2] = profile(8)

  const failing = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()
  await useUserProfileStore.getState().fetchProfile()

  gate.release()
  await failing

  assert.equal(useUserProfileStore.getState().data.total_games, 8)
  assert.equal(useUserProfileStore.getState().error, null, "옛 실패가 최신 성공을 덮었다")
})

test("A-10: 등록된 실제 store를 통해 무효화와 단순 확인이 구분되어 전달된다", async () => {
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(4)
  profileResponses[2] = profile(5)

  registerAccountCacheStores({
    profile: {
      invalidate: () => useUserProfileStore.getState().invalidate(),
      refresh: () => useUserProfileStore.getState().refresh(),
    },
  })

  await flush(() => refreshAccountCaches(["profile"]))
  assert.equal(useUserProfileStore.getState().data.total_games, 3)
  assert.equal(useUserProfileStore.getState().isStale(), false, "단순 확인은 캐시를 낡았다고 선언하지 않는다")

  await flush(() => refreshAccountCaches(["profile"], { invalidate: true }))
  assert.equal(useUserProfileStore.getState().data.total_games, 4)
  assert.equal(requestLog.length, 2)

  await flush(() => refreshAccountCaches(["economy", "achievements"]))
  assert.equal(requestLog.length, 2)

  clearAccountCacheStores()
  await flush(() => refreshAccountCaches(["profile"], { invalidate: true }))
  assert.equal(requestLog.length, 2, "등록을 비우면 이후 호출은 no-op이다")
})

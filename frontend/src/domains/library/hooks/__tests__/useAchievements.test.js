import assert from "node:assert/strict"
import test, { mock } from "node:test"
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

let getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()
let fetchSummaryCalls = 0

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../api/achievements.api.js", {
  namedExports: {
    getMyAchievementsApi: (...args) => getMyAchievementsImpl(...args),
  },
})

mock.module("../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

mock.module("../../../economy/store/economy.store.js", {
  namedExports: {
    useEconomyStore: {
      getState: () => ({ fetchSummary: () => { fetchSummaryCalls += 1 } }),
    },
  },
})

const { renderHook, waitFor, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())
const { useAchievements } = await import("../useAchievements.js")
const { useAchievementsStore } = await import("../../store/achievements.store.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const SAMPLE_ACHIEVEMENTS = [
  { id: "record-1-masquerade", achieved: true, current: 3, threshold: 3, granted: true },
  { id: "record-2-extra-mask", achieved: false, current: 4, threshold: 10, granted: false },
  { id: "noble-win-10", achieved: true, current: 12, threshold: 10, granted: false },
]

function resetStore() {
  getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
  currentUser = { uuid: "user-1" }
  fetchSummaryCalls = 0
  useAchievementsStore.getState().reset()
}

test("마운트 시 업적을 조회하고, achieved:true인 id만 achievedIds에 담는다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))

  assert.deepEqual(result.current.achievements, SAMPLE_ACHIEVEMENTS)
  assert.deepEqual([...result.current.achievedIds].sort(), ["noble-win-10", "record-1-masquerade"])
  assert.equal(result.current.achievedIds.has("record-2-extra-mask"), false)
})

test("grantedIds에는 실제로 지급된(granted:true) id만 담긴다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))

  assert.deepEqual([...result.current.grantedIds], ["record-1-masquerade"])
  assert.equal(result.current.grantedIds.has("noble-win-10"), false, "achieved여도 granted가 아니면 포함되면 안 된다")
})

test("조회가 처음 성공하면 경제 상태를 정확히 한 번 다시 읽어온다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  const { result, rerender } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  rerender()
  rerender()

  assert.equal(fetchSummaryCalls, 1, "같은 세대에서 재렌더될 때마다 다시 부르면 안 된다")
})

test("재마운트하면 항상 다시 조회해 최신 지급 상태를 반영하고, 그때마다 경제 상태도 다시 읽어온다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 1) return SAMPLE_ACHIEVEMENTS
    return SAMPLE_ACHIEVEMENTS.map((a) => (a.id === "noble-win-10" ? { ...a, granted: true } : a))
  }

  const first = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(first.result.current.status, "success"))
  assert.equal(first.result.current.grantedIds.has("noble-win-10"), false)
  assert.equal(fetchSummaryCalls, 1)
  first.unmount()

  const second = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(second.result.current.status, "success"))
  assert.equal(calls, 2, "재마운트 시 다시 조회해야 새로 지급된 업적을 반영할 수 있다")
  assert.equal(second.result.current.grantedIds.has("noble-win-10"), true, "재마운트 후 최신 지급 상태(granted:true)가 반영되어야 한다")
  assert.equal(fetchSummaryCalls, 2, "재마운트로 조회가 다시 성공하면 경제 상태도 다시 읽어와야 한다")
})

test("retry는 fetchAchievements를 다시 실행한다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => { calls += 1; if (calls === 1) throw new Error("일시 오류"); return SAMPLE_ACHIEVEMENTS }

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "error"))

  await act(async () => { await result.current.retry() })

  assert.equal(result.current.status, "success")
  assert.equal(calls, 2)
})

test("retry가 성공하면 경제 상태도 함께 다시 읽어온다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => { calls += 1; if (calls === 1) throw new Error("일시 오류"); return SAMPLE_ACHIEVEMENTS }

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "error"))
  assert.equal(fetchSummaryCalls, 0, "최초 조회가 실패하면 경제 상태를 읽어오면 안 된다")

  await act(async () => { await result.current.retry() })

  assert.equal(result.current.status, "success")
  assert.equal(fetchSummaryCalls, 1, "retry가 성공하면 경제 상태를 다시 읽어와야 한다")

  await act(async () => { await result.current.retry() })
  assert.equal(fetchSummaryCalls, 2)
})

test("겹친 retry 중 먼저 시작됐지만 늦게 끝나는(폐기된) 응답은 경제 상태를 중복으로 다시 읽어오지 않는다", async () => {
  resetStore()
  const staleGate = createDeferred()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 2) { await staleGate.promise }
    return SAMPLE_ACHIEVEMENTS
  }

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(fetchSummaryCalls, 1, "마운트 조회 성공 시 1회")

  let staleOutcomePromise
  await act(async () => {
    staleOutcomePromise = result.current.retry()
  })

  await act(async () => {
    await result.current.retry()
  })
  assert.equal(fetchSummaryCalls, 2, "나중에 시작된 retry가 성공하면 경제 상태를 다시 읽어와야 한다")

  await act(async () => {
    staleGate.resolve()
    await staleOutcomePromise
  })

  assert.equal(fetchSummaryCalls, 2, "먼저 시작됐지만 늦게 끝난(폐기된) retry는 경제 상태를 또 읽어오면 안 된다")
})

test("계정 전환 전에 시작된 retry가 전환 후 늦게 도착해도 경제 상태를 다시 읽어오지 않는다", async () => {
  resetStore()
  const gate = createDeferred()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 1) return SAMPLE_ACHIEVEMENTS
    if (calls === 2) { await gate.promise; return SAMPLE_ACHIEVEMENTS }
    return [{ id: "record-1-masquerade", achieved: false, current: 0, threshold: 3, granted: false }]
  }

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(fetchSummaryCalls, 1)

  let staleRetryPromise
  await act(async () => {
    staleRetryPromise = result.current.retry()
  })

  await act(async () => { setCurrentUser({ uuid: "user-2" }) })
  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(fetchSummaryCalls, 2, "새 계정 조회가 성공하면 경제 상태를 다시 읽어와야 한다")

  await act(async () => {
    gate.resolve()
    await staleRetryPromise
  })

  assert.equal(fetchSummaryCalls, 2, "계정 전환 전에 시작된 retry의 지연 응답은 경제 상태를 다시 읽어오면 안 된다")
})

test("계정을 전환하면 이전 계정의 업적이 사라지고 새 계정 조회가 다시 트리거된다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS
  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(fetchSummaryCalls, 1)

  getMyAchievementsImpl = async () => [{ id: "record-1-masquerade", achieved: false, current: 0, threshold: 3 }]
  await act(async () => setCurrentUser({ uuid: "user-2" }))

  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(result.current.achievedIds.has("record-1-masquerade"), false)
  assert.equal(fetchSummaryCalls, 2, "새 계정에서 조회가 성공하면 경제 상태도 다시 읽어와야 한다")
})

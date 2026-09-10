import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useMyProfile.roleStatistics.test.js)와 동일하다.
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

// achievements.store.js가 모듈 로드 시점에 useAuthStore.subscribe(...)를 부르므로(economy.store.js와
// 같은 계정 격리 계약), 실제 zustand store처럼 subscribe(listener)가 (state, prevState)로
// 리스너를 부르는 최소한의 흉내를 낸다.
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

// useAchievements 자체는 조회만 한다(A-09) — 경제 store는 "새로 성공했을 때 한 번 더
// 읽어오는지"만 확인하면 되므로, 실제 fetch 대신 호출 횟수만 세는 스텁으로 완전히 대체한다.
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
  { id: "record-1-masquerade", achieved: true, current: 3, threshold: 3 },
  { id: "record-2-extra-mask", achieved: false, current: 4, threshold: 10 },
  { id: "noble-win-10", achieved: true, current: 12, threshold: 10 },
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

test("조회가 처음 성공하면 경제 상태를 정확히 한 번 다시 읽어온다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  const { result, rerender } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  rerender()
  rerender()

  assert.equal(fetchSummaryCalls, 1, "같은 세대에서 재렌더될 때마다 다시 부르면 안 된다")
})

test("이미 캐시된 업적이 있으면 다시 마운트해도 재요청하지 않는다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => { calls += 1; return SAMPLE_ACHIEVEMENTS }

  const first = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(first.result.current.status, "success"))
  first.unmount()

  const second = renderHook(() => useAchievements())
  assert.equal(second.result.current.achievements, SAMPLE_ACHIEVEMENTS)
  assert.equal(calls, 1, "캐시가 있으면 재마운트 시 다시 조회하지 않는다")
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

// ── A-08: 계정 전환 시 업적 상태가 격리되고, 새 계정에서 다시 경제 상태를 읽어온다 ──

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

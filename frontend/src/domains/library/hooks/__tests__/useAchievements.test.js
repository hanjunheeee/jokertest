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
  { id: "record-1-masquerade", achieved: true, current: 3, threshold: 3, granted: true },
  { id: "record-2-extra-mask", achieved: false, current: 4, threshold: 10, granted: false },
  // achieved:true이지만 아직 지급 이력이 없는(지급 대기/실패) 경우도 있을 수 있다(AC-06).
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

// CODEX-2 재검토(AC-06): achieved(진행률 조건 충족)와 granted(실제 지급 이력)를 구분해야
// 한다 — noble-win-10은 achieved:true지만 아직 지급 이력이 없으므로 grantedIds에는 없어야
// 한다.
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

// CODEX-2 재검토(AC-06): 이전 버전은 캐시가 있으면 재마운트해도 다시 조회하지 않았다 —
// 그래서 서고 페이지를 벗어났다가(언마운트) 그 사이 새 게임/투표로 업적이 추가로
// 지급된 뒤 다시 들어와도(재마운트), 진행률·달성·재화·테두리 소유 상태가 전혀 갱신되지
// 않았다("지급 완료 후 갱신을 보장하지 못한다"는 지적). 지금은 재마운트할 때마다 항상
// 다시 조회하고, 조회가 성공할 때마다 경제 상태도 함께 새로 읽어온다.
test("재마운트하면 항상 다시 조회해 최신 지급 상태를 반영하고, 그때마다 경제 상태도 다시 읽어온다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    // 두 번째 호출(재마운트 후)부터는 noble-win-10도 실제로 지급됐다고 가정한다.
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

// CODEX-3 재검토(AC-06): 이전 버전은 화면이 부르는 retry가 store.retry를 그대로 노출해,
// 재시도가 성공해도(예: 일시적 네트워크 오류 후 재시도) 경제(재화·소유품·테두리) 상태는
// 갱신되지 않았다 — 지급된 업적이 재시도로 드러나도 화면의 재화·테두리 소유 상태는 새로
// 고침 전까지 낡은 채로 남았다. retry는 마운트 시 최초 조회와 동일하게, 성공할 때마다
// 경제 상태도 함께 새로 읽어와야 한다.
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

  // 이미 성공한 뒤 재호출한 retry도 매번 경제 상태를 다시 읽어온다(재시도 버튼 여러 번
  // 눌러도 안전하게 최신화되어야 한다).
  await act(async () => { await result.current.retry() })
  assert.equal(fetchSummaryCalls, 2)
})

// CODEX-4 재검토(AC-06): 이전 버전의 syncEconomyIfSuccess는 전역
// useAchievementsStore.getState().status만 다시 읽었다 — 겹친 두 retry 중 먼저 시작됐지만
// 늦게 끝나는(store가 세대/토큰 불일치로 폐기하는) 응답의 콜백이, 그 사이 나중에 시작된
// retry가 이미 성공해 둔 전역 status를 보고 경제 상태를 또 한 번(중복으로) 읽어올 수
// 있었다. 이제 각 호출은 자신의 outcome만 보고 판단하므로, 폐기된 쪽은 경제 상태를 다시
// 읽지 않아야 한다.
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
    staleOutcomePromise = result.current.retry() // calls=2, staleGate에 걸려 대기한다
  })

  await act(async () => {
    await result.current.retry() // calls=3, 즉시 성공 — "나중에 시작된 호출"로 store에 반영된다
  })
  assert.equal(fetchSummaryCalls, 2, "나중에 시작된 retry가 성공하면 경제 상태를 다시 읽어와야 한다")

  await act(async () => {
    staleGate.resolve()
    await staleOutcomePromise
  })

  assert.equal(fetchSummaryCalls, 2, "먼저 시작됐지만 늦게 끝난(폐기된) retry는 경제 상태를 또 읽어오면 안 된다")
})

// CODEX-4 재검토(AC-06): 계정 전환 전에 시작된 retry가 전환 이후에 늦게 도착하면, 그 응답은
// achievements.store.js의 세대 판정으로 outcome:'stale'이 되어야 하고, 그 stale 응답이 새
// 계정의 경제 상태를 다시 읽어오는 일로 이어지면 안 된다.
test("계정 전환 전에 시작된 retry가 전환 후 늦게 도착해도 경제 상태를 다시 읽어오지 않는다", async () => {
  resetStore()
  const gate = createDeferred()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 1) return SAMPLE_ACHIEVEMENTS // 최초 마운트(user-1)
    if (calls === 2) { await gate.promise; return SAMPLE_ACHIEVEMENTS } // user-1의 retry, 늦게 도착
    return [{ id: "record-1-masquerade", achieved: false, current: 0, threshold: 3, granted: false }] // 계정 전환 후 재마운트(user-2)
  }

  const { result } = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(result.current.status, "success"))
  assert.equal(fetchSummaryCalls, 1)

  let staleRetryPromise
  await act(async () => {
    staleRetryPromise = result.current.retry() // calls=2, gate에 걸림 — 아직 user-1이다
  })

  await act(async () => { setCurrentUser({ uuid: "user-2" }) }) // requestGeneration 증가
  await waitFor(() => assert.equal(result.current.status, "success")) // calls=3, 새 계정 조회 성공
  assert.equal(fetchSummaryCalls, 2, "새 계정 조회가 성공하면 경제 상태를 다시 읽어와야 한다")

  await act(async () => {
    gate.resolve()
    await staleRetryPromise
  })

  assert.equal(fetchSummaryCalls, 2, "계정 전환 전에 시작된 retry의 지연 응답은 경제 상태를 다시 읽어오면 안 된다")
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

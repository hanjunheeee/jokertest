import assert from "node:assert/strict"
import test, { mock } from "node:test"

let getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

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

const { useAchievementsStore } = await import("../achievements.store.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const SAMPLE_ACHIEVEMENTS = [
  { id: "record-1-masquerade", achieved: true, current: 3, threshold: 3 },
  { id: "noble-win-10", achieved: false, current: 2, threshold: 10 },
]

function resetStore() {
  getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
  currentUser = { uuid: "user-1" }
  useAchievementsStore.getState().reset()
}

test("fetchAchievements: 성공하면 22개(예시에서는 stub 그대로) 업적 상태가 채워진다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  await useAchievementsStore.getState().fetchAchievements()

  const state = useAchievementsStore.getState()
  assert.equal(state.status, "success")
  assert.deepEqual(state.achievements, SAMPLE_ACHIEVEMENTS)
  assert.equal(state.error, null)
})

test("fetchAchievements: 실패하면 status가 error가 되고 이전 값은 남지 않는다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => { throw new Error("네트워크 오류") }

  await useAchievementsStore.getState().fetchAchievements()

  const state = useAchievementsStore.getState()
  assert.equal(state.status, "error")
  assert.equal(state.error, "네트워크 오류")
  assert.equal(state.achievements, null)
})

test("retry는 fetchAchievements를 다시 실행한다", async () => {
  resetStore()
  let calls = 0
  getMyAchievementsImpl = async () => { calls += 1; return SAMPLE_ACHIEVEMENTS }

  await useAchievementsStore.getState().retry()

  assert.equal(calls, 1)
  assert.equal(useAchievementsStore.getState().status, "success")
})

test("fetchAchievements는 성공하면 outcome:'success'를 반환한다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS

  const outcome = await useAchievementsStore.getState().fetchAchievements()

  assert.deepEqual(outcome, { outcome: "success" })
})

test("fetchAchievements는 실패하면 outcome:'error'를 반환한다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => { throw new Error("네트워크 오류") }

  const outcome = await useAchievementsStore.getState().fetchAchievements()

  assert.deepEqual(outcome, { outcome: "error" })
})

test("세대가 바뀌어 폐기된 호출은 outcome:'stale'을 반환하고 store 상태를 건드리지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  getMyAchievementsImpl = async () => { await deferred.promise; return SAMPLE_ACHIEVEMENTS }

  const stalePromise = useAchievementsStore.getState().fetchAchievements()
  setCurrentUser({ uuid: "user-2" }) // reset() → requestGeneration 증가
  deferred.resolve()

  const outcome = await stalePromise
  assert.deepEqual(outcome, { outcome: "stale" })
  assert.equal(useAchievementsStore.getState().status, "idle", "폐기된 호출은 status를 바꾸면 안 된다")
})

test("로그아웃하면 업적 상태가 초기화된다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS
  await useAchievementsStore.getState().fetchAchievements()
  assert.equal(useAchievementsStore.getState().status, "success")

  setCurrentUser(null)

  assert.equal(useAchievementsStore.getState().status, "idle")
  assert.equal(useAchievementsStore.getState().achievements, null)
})

test("다른 계정으로 전환하면 이전 계정의 업적 상태가 남지 않는다", async () => {
  resetStore()
  getMyAchievementsImpl = async () => SAMPLE_ACHIEVEMENTS
  await useAchievementsStore.getState().fetchAchievements()

  setCurrentUser({ uuid: "user-2" })

  assert.equal(useAchievementsStore.getState().status, "idle")
  assert.equal(useAchievementsStore.getState().achievements, null)
})

test("지연 응답: 요청이 끝나기 전에 계정이 바뀌면 늦게 도착한 응답이 새 계정 상태를 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  getMyAchievementsImpl = async () => { await deferred.promise; return SAMPLE_ACHIEVEMENTS }

  const fetchPromise = useAchievementsStore.getState().fetchAchievements()
  assert.equal(useAchievementsStore.getState().status, "loading")

  setCurrentUser({ uuid: "user-2" })
  assert.equal(useAchievementsStore.getState().status, "idle", "전환 즉시 리셋되어야 한다")

  deferred.resolve()
  await fetchPromise

  const state = useAchievementsStore.getState()
  assert.equal(state.status, "idle", "폐기된 세대의 응답은 status마저 바꾸면 안 된다")
  assert.equal(state.achievements, null)
})

test("A→B→A overlap discards older same-generation failure", async () => {
  resetStore()
  const gate = createDeferred()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 1) {
      await gate.promise
      throw new Error("stale failure")
    }
    return SAMPLE_ACHIEVEMENTS
  }

  const old = useAchievementsStore.getState().fetchAchievements()
  setCurrentUser({ uuid: "user-2" })
  await useAchievementsStore.getState().fetchAchievements()
  gate.resolve()
  await old

  const state = useAchievementsStore.getState()
  assert.equal(state.status, "success")
  assert.deepEqual(state.achievements, SAMPLE_ACHIEVEMENTS)
  assert.equal(state.error, null)
})

test("같은 세대 안에서 겹친 fetchAchievements 중 먼저 시작됐지만 늦게 끝나는 응답은 버려진다", async () => {
  resetStore()
  const gate = createDeferred()
  let calls = 0
  getMyAchievementsImpl = async () => {
    calls += 1
    if (calls === 1) {
      await gate.promise
      return [{ id: "record-1-masquerade", achieved: false, current: 0, threshold: 3, granted: false }]
    }
    return SAMPLE_ACHIEVEMENTS
  }

  const stalePromise = useAchievementsStore.getState().fetchAchievements()
  await useAchievementsStore.getState().fetchAchievements()
  assert.equal(useAchievementsStore.getState().status, "success", "나중에 시작된 호출은 즉시 반영되어야 한다")
  assert.deepEqual(useAchievementsStore.getState().achievements, SAMPLE_ACHIEVEMENTS)

  gate.resolve()
  await stalePromise

  assert.deepEqual(
    useAchievementsStore.getState().achievements,
    SAMPLE_ACHIEVEMENTS,
    "먼저 시작된(하지만 나중에 끝난) 호출의 응답이 최신 상태를 덮어쓰면 안 된다",
  )
})

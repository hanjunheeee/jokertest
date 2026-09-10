import assert from "node:assert/strict"
import test, { mock } from "node:test"

// economy.store.test.js와 같은 패턴 — API 경계와 auth store를 mock.module로 대체해
// roleStatistics.store.js가 실제 fetch를 내보내지 않게 한다. roleStatistics.store.js도
// 모듈 로드 시점에 useAuthStore.subscribe(...)를 부르므로, 실제 zustand store처럼
// subscribe(listener)가 (state, prevState)로 리스너를 부르는 최소한의 흉내를 낸다.
let getMyRoleStatisticsImpl = async () => { throw new Error("getMyRoleStatisticsApi stub not set") }
let getRoleRankingImpl = async () => { throw new Error("getRoleRankingApi stub not set") }
// F-12: requestJob이 이제 직업 도전과제 클리어 표시를 위해 업적 상태도 함께 불러온다.
let getMyAchievementsImpl = async () => []
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../api/roleStatistics.api.js", {
  namedExports: {
    getMyRoleStatisticsApi: (...args) => getMyRoleStatisticsImpl(...args),
    getRoleRankingApi: (...args) => getRoleRankingImpl(...args),
  },
})

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

const { useRoleStatisticsStore, JOB_KEY_TO_ROLE_CODE } = await import("../roleStatistics.store.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const ALL_ROLE_STATS = Object.values(JOB_KEY_TO_ROLE_CODE).map((role) => ({
  role, roleName: role, games: 0, wins: 0, survivalCount: 0, winRate: 0,
}))

function resetStore() {
  getMyRoleStatisticsImpl = async () => { throw new Error("getMyRoleStatisticsApi stub not set") }
  getRoleRankingImpl = async () => { throw new Error("getRoleRankingApi stub not set") }
  getMyAchievementsImpl = async () => []
  currentUser = { uuid: "user-1" }
  useRoleStatisticsStore.getState().reset()
}

test("requestJob: 성공하면 선택한 직업의 내 전적·랭킹이 함께 채워진다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS.map((s) => (s.role === "CITIZEN" ? { ...s, games: 12, wins: 6, winRate: 0.5 } : s))
  getRoleRankingImpl = async (role) => {
    assert.equal(role, "CITIZEN")
    return { role, roleName: "귀족", ranking: [{ rank: 1, uuid: "u1", nickname: "닉1", profile_image_url: null, games: 12, wins: 6, winRate: 0.5 }] }
  }

  await useRoleStatisticsStore.getState().requestJob("noble")

  const state = useRoleStatisticsStore.getState().byJobKey.noble
  assert.equal(state.status, "success")
  assert.equal(state.myStats.games, 12)
  assert.equal(state.ranking.length, 1)
  assert.equal(state.error, null)
})

test("requestJob: 실패하면 status가 error가 되고 이전 값은 남지 않는다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => { throw new Error("네트워크 오류") }
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [] })

  await useRoleStatisticsStore.getState().requestJob("noble")

  const state = useRoleStatisticsStore.getState().byJobKey.noble
  assert.equal(state.status, "error")
  assert.equal(state.error, "네트워크 오류")
  assert.equal(state.myStats, null)
})

test("retryJob은 requestJob을 다시 실행한다", async () => {
  resetStore()
  let calls = 0
  getMyRoleStatisticsImpl = async () => { calls += 1; return ALL_ROLE_STATS }
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [] })

  await useRoleStatisticsStore.getState().retryJob("noble")

  assert.equal(calls, 1)
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "success")
})

test("0판 직업은 빈 랭킹(success, ranking:[])으로 남는다 — 실패로 처리되지 않는다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
  getRoleRankingImpl = async () => ({ role: "JOKER", ranking: [] })

  await useRoleStatisticsStore.getState().requestJob("clown")

  const state = useRoleStatisticsStore.getState().byJobKey.clown
  assert.equal(state.status, "success")
  assert.deepEqual(state.ranking, [])
  assert.equal(state.myStats.games, 0)
})

// ── F-12 AC-01/AC-06: 직업 도전과제 클리어 id를 업적 조회에서 함께 채운다 ────────

test("requestJob: 달성한 업적 id만 clearedChallengeIds에 담긴다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [] })
  getMyAchievementsImpl = async () => [
    { id: "noble-win-10", achieved: true, current: 12, threshold: 10 },
    { id: "noble-win-20", achieved: false, current: 12, threshold: 20 },
    { id: "record-1-masquerade", achieved: true, current: 5, threshold: 3 },
  ]

  await useRoleStatisticsStore.getState().requestJob("noble")

  assert.deepEqual(
    useRoleStatisticsStore.getState().byJobKey.noble.clearedChallengeIds,
    ["noble-win-10", "record-1-masquerade"],
  )
})

test("requestJob: 업적을 하나도 달성하지 못했으면 clearedChallengeIds는 빈 배열이다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [] })
  getMyAchievementsImpl = async () => [{ id: "noble-win-10", achieved: false, current: 2, threshold: 10 }]

  await useRoleStatisticsStore.getState().requestJob("noble")

  assert.deepEqual(useRoleStatisticsStore.getState().byJobKey.noble.clearedChallengeIds, [])
})

// ── A-08: 로그아웃/계정 전환/직업 변경 시 상태 격리 ─────────────────────────────

test("로그아웃하면 모든 직업의 전적·랭킹이 초기화된다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [{ rank: 1, uuid: "u1" }] })
  await useRoleStatisticsStore.getState().requestJob("noble")
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "success")

  setCurrentUser(null)

  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "idle")
})

test("다른 계정으로 전환하면 이전 계정의 전적·랭킹이 남지 않는다", async () => {
  resetStore()
  getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [{ rank: 1, uuid: "u1" }] })
  await useRoleStatisticsStore.getState().requestJob("noble")

  setCurrentUser({ uuid: "user-2" })

  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "idle")
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.ranking, null)
})

test("지연 응답: 요청이 끝나기 전에 계정이 바뀌면 늦게 도착한 응답이 새 계정 상태를 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  getMyRoleStatisticsImpl = async () => { await deferred.promise; return ALL_ROLE_STATS }
  getRoleRankingImpl = async () => ({ role: "CITIZEN", ranking: [{ rank: 1, uuid: "u1" }] })

  const requestPromise = useRoleStatisticsStore.getState().requestJob("noble")
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "loading")

  setCurrentUser({ uuid: "user-2" })
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "idle", "전환 즉시 리셋되어야 한다")

  deferred.resolve()
  await requestPromise

  const state = useRoleStatisticsStore.getState().byJobKey.noble
  assert.equal(state.status, "idle", "폐기된 세대의 응답은 status마저 바꾸면 안 된다")
  assert.equal(state.myStats, null)
})

test("직업 탭을 바꾸는 동안 이전 직업으로 보낸 요청은 다른 직업 키를 덮어쓰지 않는다", async () => {
  resetStore()
  const nobleDeferred = createDeferred()
  getMyRoleStatisticsImpl = async (jobKey) => ALL_ROLE_STATS
  getRoleRankingImpl = async (role) => {
    if (role === "CITIZEN") {
      await nobleDeferred.promise
      return { role, ranking: [{ rank: 1, uuid: "slow-noble" }] }
    }
    return { role, ranking: [{ rank: 1, uuid: "fast-clown" }] }
  }

  const nobleRequest = useRoleStatisticsStore.getState().requestJob("noble")
  await useRoleStatisticsStore.getState().requestJob("clown")

  assert.equal(useRoleStatisticsStore.getState().byJobKey.clown.ranking[0].uuid, "fast-clown")
  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.status, "loading", "noble 요청은 아직 응답 전이라 loading을 유지해야 한다")

  nobleDeferred.resolve()
  await nobleRequest

  assert.equal(useRoleStatisticsStore.getState().byJobKey.noble.ranking[0].uuid, "slow-noble", "뒤늦게 도착해도 자기 자신의 직업 키는 정상 반영되어야 한다")
  assert.equal(useRoleStatisticsStore.getState().byJobKey.clown.ranking[0].uuid, "fast-clown", "다른 직업의 응답이 clown 상태를 덮어쓰면 안 된다")
})

for (const staleFailure of [false, true]) {
  test('A→B→A overlap discards older same-job ' + (staleFailure ? 'failure' : 'success'), async () => {
    resetStore()
    const gate = createDeferred()
    let nobleCalls = 0
    getMyRoleStatisticsImpl = async () => ALL_ROLE_STATS
    getRoleRankingImpl = async (role) => {
      if (role === 'CITIZEN' && ++nobleCalls === 1) {
        await gate.promise
        if (staleFailure) throw new Error('stale failure')
        return { ranking: [{uuid:'old'}] }
      }
      return { ranking: [{uuid:'latest-' + role}] }
    }
    const old = useRoleStatisticsStore.getState().requestJob('noble')
    await useRoleStatisticsStore.getState().requestJob('clown')
    await useRoleStatisticsStore.getState().requestJob('noble')
    gate.resolve()
    await old
    const latest = useRoleStatisticsStore.getState().byJobKey.noble
    assert.equal(latest.status, 'success')
    assert.equal(latest.ranking[0].uuid, 'latest-CITIZEN')
    assert.equal(latest.error, null)
  })
}

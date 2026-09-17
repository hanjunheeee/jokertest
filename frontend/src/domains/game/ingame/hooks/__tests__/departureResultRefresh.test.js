import test, { mock } from "node:test"
import assert from "node:assert/strict"

/**
 * F-21(A-10): 퇴장한 계정의 화면이 **서버 커밋 결과로 수렴**하는지 검증한다.
 *
 * 이 파일이 지키려는 것은 순서다. 경기 commit 이전에 시작된 조회가 무효화보다 늦게 도착하면,
 * 같은 계정이고 요청 세대도 같으므로 옛 숫자가 최신 화면을 그대로 덮어쓴다 — 실제로 가능한
 * 순서이고, 그 경우 방금 끝난 판의 전적이 새로고침 전까지 영영 반영되지 않는다.
 *
 * 대역은 HTTP 하나뿐이다(getMyProfileApi). 세대·무효화·재조회 판정은 전부 프로덕션 store
 * 코드 그대로 돈다.
 */
// DOM은 필요 없다 — 이 파일은 컴포넌트를 렌더하지 않고 store의 순서 계약만 본다.

/**
 * GET을 원하는 시점까지 붙잡아 둘 수 있는 대역. gate가 있으면 그 Promise가 풀릴 때까지
 * 응답을 내주지 않는다 — "commit 직전에 시작된 조회"를 결정적으로 재현하는 유일한 방법이다.
 */
let profileResponses = []
let pendingGates = []
const requestLog = []

mock.module("../../../../user/api/user.api.js", {
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

const { useUserProfileStore } = await import("../../../../user/store/user.store.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")

function makeGate() {
  let release
  const promise = new Promise((resolve) => { release = resolve })
  return { promise, release: () => release() }
}

function profile(totalGames) {
  return {
    nickname: "tester",
    reputation: 0,
    title: "신참",
    total_games: totalGames,
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
  useUserProfileStore.setState({
    data: null, loading: true, requestGeneration: 0, invalidationRevision: 0, appliedRevision: 0,
  })
  useAuthStore.setState({ user: { uuid: "u-1" }, isLoggedIn: true })
})

test("A-10: commit 직전에 시작된 조회는 무효화 이후 도착해도 최신 화면을 덮어쓰지 못한다", async () => {
  const gate = makeGate()
  pendingGates[0] = gate
  profileResponses[0] = profile(3) // 커밋 전 숫자
  profileResponses[1] = profile(4) // 커밋 후 숫자

  // 1) 커밋 직전에 조회가 시작돼 서버 응답을 기다린다.
  const stalled = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()

  // 2) 그 사이 서버가 전적을 커밋하고 개인 무효화를 보낸다 — 새 조회가 여기서 시작된다.
  const refreshed = useUserProfileStore.getState().invalidate()

  // 3) 이제서야 옛 응답이 도착한다.
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
  // 재조회가 도는 동안에도 옛 값은 화면에 남아 있고, 낡았다는 사실만 표시된다.
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
  profileResponses[0] = profile(99) // A 계정의 옛 응답

  const stalled = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()

  // A → B → A. 각 전환마다 reset()이 두 세대를 모두 올린다.
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
  // 그 사이 커밋 무효화가 도착해 새 조회가 시작된다.
  const refreshed = useUserProfileStore.getState().invalidate()

  gate.release()
  await failing
  await refreshed

  // 늦게 도착한 실패가 loading을 되돌리거나 최신 값을 지우지 않았다.
  assert.equal(useUserProfileStore.getState().data.total_games, 4)
  assert.equal(useUserProfileStore.getState().loading, false)
})

test("A-10: 무효화 이후에는 캐시가 있어도 서버 조회를 한 번 더 한다(useMyProfile의 생략 조건)", async () => {
  profileResponses[0] = profile(3)
  await useUserProfileStore.getState().fetchProfile()

  // useMyProfile의 생략 조건과 **같은 술어**다 — 캐시가 있어도 낡았으면 생략하지 않는다.
  const shouldSkip = () => {
    const store = useUserProfileStore.getState()
    return Boolean(store.data) && store.appliedRevision >= store.invalidationRevision
  }
  assert.equal(shouldSkip(), true, "무효화 전에는 중복 조회를 하지 않는다")

  useUserProfileStore.setState((s) => ({ invalidationRevision: s.invalidationRevision + 1 }))
  assert.equal(shouldSkip(), false, "무효화 뒤에는 캐시가 있어도 다시 읽어야 한다")
})

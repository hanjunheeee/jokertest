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
// 뒷부분은 **실제 화면 훅**(useMyProfile)을 마운트해 화면에 실제로 표시되는 값까지 본다 —
// store 단위 단언만으로는 "재진입·재활성화에서 최신 값을 읽는가"가 증명되지 않는다.
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

const { renderHook } = await import("@testing-library/react")
const { useUserProfileStore } = await import("../../../../user/store/user.store.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMyProfile } = await import("../../../../user/hooks/useMyProfile.js")
const { refreshAccountCaches, registerAccountCacheStores, clearAccountCacheStores } =
  await import("../../../../user/utils/accountCacheRefresh.js")

/**
 * 렌더 이후의 비동기 조회가 전부 끝날 때까지 흘린다. 마이크로태스크만 비우면 await 단계가
 * 하나만 늘어도 흔들리므로 매크로태스크 한 번으로 고정한다.
 */
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

/**
 * F-30: 성공 응답은 표시 판수와 **표시 승률**을 함께 싣는다(같은 모집단의 두 값). 승률을
 * 명시 입력으로 받는 이유는, 판수만 바뀌고 승률이 따라오지 않는 응답을 실수로 "정상"처럼
 * 쓰지 않기 위해서다 — store는 이제 그런 응답을 성공으로 캐시하지 않는다.
 */
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
  // reset()은 진행 중이던 조회 핸들(합치기 대상)까지 버린다 — 그래야 앞 시험이 남긴 조회에
  // 다음 시험의 refresh가 합쳐지지 않는다. 세대는 그 뒤에 0으로 되돌려 시험을 고정한다.
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

// ── 실제 화면 훅(useMyProfile)의 수렴 ─────────────────────────────────────────

test("A-10: 화면 재진입은 캐시가 있어도 서버를 다시 읽고, 표시 숫자가 최신 값으로 바뀐다", async () => {
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(4) // 그 사이 서버가 전적을 커밋했다(신호는 못 받았다)

  const first = renderHook(() => useMyProfile())
  await flush()
  assert.equal(first.result.current.stats[0].value, "3")
  first.unmount()

  // 다른 화면에 갔다가 돌아온다. 무효화 신호는 한 번도 오지 않았다.
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
  // 값은 남아 있고(깜빡이지 않는다) 낡았다는 사실만 표시된다.
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
  // F-30 AC-03: **실패가 0판으로 위장되지 않는다.** 화면에 표시할 숫자 자체가 없고(stats=null),
  // 실패했다는 사실만 남는다 — "전체 판수 0 · 승률 0.0%"는 정상 조회의 결과일 때만 쓰는 표시다.
  assert.equal(view.result.current.stats, null)
  assert.notEqual(view.result.current.error, null)
  assert.equal(view.result.current.isStale, true)
  // 실패를 성공으로 바꾸지 않는다 — 화면에는 다시 읽을 경로만 있다(MyPageLayout이 이 값을 쓴다).
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
  profileResponses[1] = new Error("네트워크 실패") // 재진입 조회가 실패한다
  profileResponses[2] = profile(7, 1)

  const view = renderHook(() => useMyProfile())
  await flush()
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  assert.equal(view.result.current.isStale, false)
  assert.equal(view.result.current.error, null)

  // 무효화 신호는 **오지 않았다**(끊겨 있던 사이의 커밋·다른 탭·CLI 복구). 창 재활성화로
  // 다시 읽어 보지만 그 조회가 실패한다.
  await flush(() => dom.window.dispatchEvent(new dom.window.Event("focus")))

  // 쓸 수 있는 값은 그대로 남는다(실패 하나로 화면을 빈 숫자로 만들지 않는다).
  // F-30 AC-03: 판수뿐 아니라 승률도 갱신 전 값 그대로여야 한다 — 한쪽만 0으로 떨어지면
  // 두 숫자가 서로 다른 시점을 말하게 된다.
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "3" },
    { label: "승률", value: "33.3%" },
  ])
  // 그러나 그 값이 **확인된 값이 아니라는 사실**은 남아야 한다 — 예전에는 무효화 세대가
  // 오르지 않았다는 이유로 isStale이 false였고 화면에 아무 표시도 없었다.
  assert.notEqual(view.result.current.error, null, "실패했는데 화면이 그 사실을 모른다")
  assert.equal(view.result.current.isStale, true)
  assert.equal(typeof view.result.current.retry, "function")

  // 재시도가 성공하면 실패 표시는 사라지고 숫자가 확인된 값으로 바뀐다.
  await flush(() => view.result.current.retry())
  assert.deepEqual(view.result.current.stats, [
    { label: "전체 판수", value: "7" },
    { label: "승률", value: "100.0%" },
  ])
  assert.equal(view.result.current.error, null)
  assert.equal(view.result.current.isStale, false)
  view.unmount()
})

// ── F-30 AC-02/AC-03: 판수와 승률이 같은 값으로 함께 수렴한다 ──────────────────

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
  // 갱신을 기다리는 동안에도 두 값은 **직전에 확인된 같은 시점의 값**으로 남는다.
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

/**
 * F-30 AC-03: 표시할 수 없는 판수·승률은 **성공 캐시가 되지 않는다.**
 *
 * 이 목록이 중요한 이유는, 이 중 다수가 그대로 통과하면 화면에 "0판 0.0%"나 "NaN%"로 보이기
 * 때문이다 — 조회가 잘못됐다는 사실이 정상 전적으로 위장되는 바로 그 경우다.
 */
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
  // 위 대역이 nullish 응답을 "다음 응답으로 대체"해 버리므로, 객체가 아닌 경우는 문자열로
  // 재현한다(store의 판정은 둘 다 같은 "객체가 아님" 분기다).
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

    // 유효한 응답으로 재시도하면 정상 복구된다(실패 상태가 고착되지 않는다).
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
  profileResponses[1] = { ...profile(6, 0.25), account_win_rate: "0.9" } // 표시할 수 없는 갱신
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
  profileResponses[1] = new Error("네트워크 실패") // 먼저 시작했지만 늦게 끝난다
  profileResponses[2] = profile(8)

  const failing = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()
  await useUserProfileStore.getState().fetchProfile() // 더 나중에 시작해 먼저 끝난 성공

  gate.release()
  await failing

  assert.equal(useUserProfileStore.getState().data.total_games, 8)
  assert.equal(useUserProfileStore.getState().error, null, "옛 실패가 최신 성공을 덮었다")
})

// ── 앱 진입점이 꽂는 실제 경계 ───────────────────────────────────────────────

test("A-10: 등록된 실제 store를 통해 무효화와 단순 확인이 구분되어 전달된다", async () => {
  profileResponses[0] = profile(3)
  profileResponses[1] = profile(4)
  profileResponses[2] = profile(5)

  // ProtectedRoute가 꽂는 것과 **같은 어댑터**다.
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

  // 등록되지 않은 범위는 조용히 아무 일도 하지 않는다(다른 범위의 전달을 막지 않는다).
  await flush(() => refreshAccountCaches(["economy", "achievements"]))
  assert.equal(requestLog.length, 2)

  clearAccountCacheStores()
  await flush(() => refreshAccountCaches(["profile"], { invalidate: true }))
  assert.equal(requestLog.length, 2, "등록을 비우면 이후 호출은 no-op이다")
})

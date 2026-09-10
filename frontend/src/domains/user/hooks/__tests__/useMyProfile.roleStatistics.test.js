import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useMyProfile.test.js)와 동일하다.
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

// F-10 A-08/A-11: user.store.js가 이제 useAuthStore.subscribe(...)를 모듈 로드 시점에 부른다
// (economy.store.js와 같은 계정 격리 계약). 실제 zustand store처럼 subscribe(listener)가
// (state, prevState)로 리스너를 부르는 최소한의 흉내를 낸다 — economy.store.test.js와 같은 패턴.
let profileResponse = null
let getMyProfileCallCount = 0
let currentUser = { uuid: "user-1" }
// 지연 응답(delayed response) 재현용 게이트. 설정돼 있으면 getMyProfileApi가 이 프라미스가
// 풀릴 때까지 기다렸다가 응답한다(economy.store.test.js의 createDeferred 패턴과 동일).
let pendingGate = null
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../api/user.api.js", {
  namedExports: {
    getMyProfileApi: async () => {
      getMyProfileCallCount += 1
      if (pendingGate) await pendingGate
      return profileResponse
    },
    updateNicknameApi: async () => ({}),
    updatePasswordApi: async () => ({}),
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

const { renderHook, waitFor, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())
const { useMyProfile } = await import("../useMyProfile.js")
const { useUserProfileStore } = await import("../../store/user.store.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const BASE_PROFILE_ROW = {
  nickname: "가면술사",
  reputation: 1280,
  title: "무자비한 광대",
  total_games: 1245,
  survival_count: 788,
  execution_count: 112,
  most_played_role: "귀족",
  highest_win_rate_role: null,
}

function resetStore() {
  getMyProfileCallCount = 0
  profileResponse = null
  pendingGate = null
  currentUser = { uuid: "user-1" }
  useUserProfileStore.getState().reset()
}

// ── AC-04/A-05: 운명의 가면은 최고 승률 직업이지 최다 플레이 직업이 아니다 ────────

test("최다 플레이(most_played_role)와 최고 승률(highest_win_rate_role)이 다르면 후자를 강조 문구로 쓴다", async () => {
  resetStore()
  useUserProfileStore.setState({
    data: { ...BASE_PROFILE_ROW, most_played_role: "귀족", highest_win_rate_role: "마녀사냥꾼" },
    loading: false,
  })

  const { result } = renderHook(() => useMyProfile())

  assert.equal(result.current.description.highlight, "마녀사냥꾼")
  assert.notEqual(result.current.description.highlight, "귀족")
})

test("highest_win_rate_role이 null이면(전적 0판) 더미 직업 대신 전적 없음을 표시한다", async () => {
  resetStore()
  useUserProfileStore.setState({ data: { ...BASE_PROFILE_ROW, highest_win_rate_role: null }, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.equal(result.current.description.highlight, "전적 없음")
})

// ── A-11: 기존 프로필 필드(전적 숫자·타이틀 등)는 그대로 유지된다 ────────────────

test("highest_win_rate_role이 추가돼도 기존 stats·title 필드는 그대로 나온다", async () => {
  resetStore()
  useUserProfileStore.setState({
    data: { ...BASE_PROFILE_ROW, highest_win_rate_role: "주치의" },
    loading: false,
  })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.profile, { reputationLabel: "가면술사", reputationValue: 1280, title: "무자비한 광대" })
  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "1,245" },
    { label: "생존 횟수", value: "788" },
    { label: "단두대 처형", value: "112" },
  ])
})

// ── A-08: 계정 전환 후 늦게 도착한 이전 계정 응답이 새 계정 화면을 덮어쓰지 않는다 ──

test("지연 응답: fetchProfile이 끝나기 전에 계정이 바뀌면 늦게 도착한 이전 계정 프로필이 새 계정 화면을 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  pendingGate = deferred.promise
  profileResponse = { ...BASE_PROFILE_ROW, highest_win_rate_role: "광대" }

  const fetchPromise = useUserProfileStore.getState().fetchProfile()
  assert.equal(useUserProfileStore.getState().loading, true)

  // 응답이 오기 전에 다른 계정으로 전환한다 — user.store.js의 useAuthStore.subscribe가
  // reset()을 호출해 requestGeneration을 올린다.
  setCurrentUser({ uuid: "user-2" })
  assert.equal(useUserProfileStore.getState().data, null, "전환 즉시 리셋되어야 한다")

  deferred.resolve()
  await fetchPromise

  const state = useUserProfileStore.getState()
  assert.equal(state.data, null, "user-1의 뒤늦은 응답이 user-2 화면(초기화된 상태)을 덮어쓰면 안 된다")
})

test("로그아웃(user → null)하면 프로필 캐시가 비워진다", async () => {
  resetStore()
  useUserProfileStore.setState({ data: { ...BASE_PROFILE_ROW, highest_win_rate_role: "경비원" }, loading: false })

  setCurrentUser(null)

  const state = useUserProfileStore.getState()
  assert.equal(state.data, null)
  assert.equal(state.loading, true)
})

test('mounted profile refetches once after account switch and renders the new mask', async () => {
  resetStore()
  profileResponse = { ...BASE_PROFILE_ROW, nickname:'first', highest_win_rate_role:'광대' }
  const { result } = renderHook(() => useMyProfile())
  await waitFor(() => assert.equal(result.current.profile?.reputationLabel, 'first'))
  profileResponse = { ...BASE_PROFILE_ROW, nickname:'second', highest_win_rate_role:'주치의' }
  await act(async () => setCurrentUser({uuid:'user-2'}))
  await waitFor(() => assert.equal(result.current.profile?.reputationLabel, 'second'))
  assert.equal(result.current.description.highlight, '주치의')
  assert.equal(getMyProfileCallCount, 2)
})

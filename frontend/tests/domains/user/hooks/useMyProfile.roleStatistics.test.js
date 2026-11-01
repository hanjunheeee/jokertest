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

let profileResponse = null
let getMyProfileCallCount = 0
let currentUser = { uuid: "user-1" }
let pendingGate = null
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../../../src/domains/user/api/user.api.js", {
  namedExports: {
    getMyProfileApi: async () => {
      getMyProfileCallCount += 1
      const response = profileResponse
      const gate = pendingGate
      if (gate) await gate
      return response
    },
    updateNicknameApi: async () => ({}),
    updatePasswordApi: async () => ({}),
  },
})

mock.module("../../../../src/domains/auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { renderHook, waitFor, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())
const { useMyProfile } = await import("../../../../src/shared/hooks/useMyProfile.js")
const { useUserProfileStore } = await import("../../../../src/domains/user/store/user.store.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const BASE_PROFILE_ROW = {
  nickname: "가면술사",
  title: "무자비한 광대",
  total_games: 1245,
  account_win_rate: 2 / 3,
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

test("highest_win_rate_role이 추가돼도 기존 stats·title 필드는 그대로 나온다", async () => {
  resetStore()
  useUserProfileStore.setState({
    data: { ...BASE_PROFILE_ROW, highest_win_rate_role: "주치의" },
    loading: false,
  })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.profile, { nickname: "가면술사", title: "무자비한 광대" })
  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "1,245" },
    { label: "승률", value: "66.7%" },
  ])
})

test("지연 응답: fetchProfile이 끝나기 전에 계정이 바뀌면 늦게 도착한 이전 계정 프로필이 새 계정 화면을 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  pendingGate = deferred.promise
  profileResponse = { ...BASE_PROFILE_ROW, highest_win_rate_role: "광대" }

  const fetchPromise = useUserProfileStore.getState().fetchProfile()
  assert.equal(useUserProfileStore.getState().loading, true)

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
  await waitFor(() => assert.equal(result.current.profile?.nickname, 'first'))
  profileResponse = { ...BASE_PROFILE_ROW, nickname:'second', highest_win_rate_role:'주치의' }
  await act(async () => setCurrentUser({uuid:'user-2'}))
  await waitFor(() => assert.equal(result.current.profile?.nickname, 'second'))
  assert.equal(result.current.description.highlight, '주치의')
  assert.equal(getMyProfileCallCount, 2)
})

test('A 보류 → B 전환 → B 성공 → A 응답 도착: B의 닉네임·판수·승률·가면이 그대로 유지된다', async () => {
  resetStore()
  const deferred = createDeferred()
  pendingGate = deferred.promise
  profileResponse = {
    ...BASE_PROFILE_ROW,
    nickname: 'A계정', total_games: 99, account_win_rate: 0.99, highest_win_rate_role: '광대',
  }

  const stalled = useUserProfileStore.getState().fetchProfile()
  await Promise.resolve()

  setCurrentUser({ uuid: 'user-2' })

  pendingGate = null
  profileResponse = {
    ...BASE_PROFILE_ROW,
    nickname: 'B계정', total_games: 4, account_win_rate: 0.5, highest_win_rate_role: '주치의',
  }
  await useUserProfileStore.getState().fetchProfile()

  deferred.resolve()
  await stalled

  const { result } = renderHook(() => useMyProfile())
  assert.equal(result.current.profile.nickname, 'B계정', 'A의 뒤늦은 응답이 B 화면을 덮었다')
  assert.deepEqual(result.current.stats, [
    { label: '전체 판수', value: '4' },
    { label: '승률', value: '50.0%' },
  ])
  assert.equal(result.current.description.highlight, '주치의')
})

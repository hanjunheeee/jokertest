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

mock.module("../../../../src/domains/user/api/user.api.js", {
  namedExports: {
    getMyProfileApi: async () => {
      getMyProfileCallCount += 1
      return profileResponse
    },
    updateNicknameApi: async () => ({}),
    updatePasswordApi: async () => ({}),
  },
})

const { renderHook, waitFor } = await import("@testing-library/react")
const { useMyProfile } = await import("../../../../src/shared/hooks/useMyProfile.js")
const { useUserProfileStore } = await import("../../../../src/domains/user/store/user.store.js")

const PROFILE_ROW = {
  nickname: "가면술사",
  title: "무자비한 광대",
  total_games: 1245,
  account_win_rate: 2 / 3,
  survival_count: 788,
  execution_count: 112,
  most_played_role: "광대",
  highest_win_rate_role: "마녀사냥꾼",
}

function resetStore() {
  getMyProfileCallCount = 0
  profileResponse = PROFILE_ROW
  useUserProfileStore.setState({ data: null, loading: true, error: null })
}

test("데이터가 없으면 null 계약을 돌려주고 fetchProfile을 한 번 호출한다", async () => {
  resetStore()
  profileResponse = PROFILE_ROW

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(
    { profile: result.current.profile, stats: result.current.stats, description: result.current.description },
    { profile: null, stats: null, description: null },
  )

  await waitFor(() => assert.equal(result.current.loading, false))
  assert.equal(getMyProfileCallCount, 1)
})

test("F-21(A-10): 캐시가 있어도 화면 진입은 서버를 한 번 다시 읽는다(중복은 생략이 아니라 합치기로 막는다)", async () => {
  resetStore()
  profileResponse = PROFILE_ROW
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const lobby = renderHook(() => useMyProfile())
  const myPage = renderHook(() => useMyProfile())
  await waitFor(() => assert.equal(myPage.result.current.loading, false))

  assert.equal(getMyProfileCallCount, 1, "재진입이 서버를 다시 읽지 않았거나 요청이 두 번 나갔다")
  lobby.unmount()
  myPage.unmount()
})

test("profile은 닉네임과 title만 담고 명성 필드를 더 이상 만들지 않는다", () => {
  resetStore()
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.profile, {
    nickname: "가면술사",
    title: "무자비한 광대",
  })
  assert.equal("reputationLabel" in result.current.profile, false)
  assert.equal("reputationValue" in result.current.profile, false)
})

test("stats는 전체 판수와 승률 두 행만 돌려준다(생존·처형 행은 없다)", () => {
  resetStore()
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "1,245" },
    { label: "승률", value: "66.7%" },
  ])
  assert.equal(result.current.stats.length, 2)
  assert.equal(result.current.stats.some((row) => row.label === "생존 횟수"), false)
  assert.equal(result.current.stats.some((row) => row.label === "단두대 처형"), false)
})

test("0판 계정의 승률은 0.0%다", () => {
  resetStore()
  useUserProfileStore.setState({
    data: { ...PROFILE_ROW, total_games: 0, account_win_rate: 0 },
    loading: false,
  })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "0" },
    { label: "승률", value: "0.0%" },
  ])
})

test("전승 계정의 승률은 100.0%다", () => {
  resetStore()
  useUserProfileStore.setState({
    data: { ...PROFILE_ROW, total_games: 7, account_win_rate: 1 },
    loading: false,
  })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "7" },
    { label: "승률", value: "100.0%" },
  ])
})

test("description은 최고 승률 직업(highest_win_rate_role)을 강조 문구로 만든다", () => {
  resetStore()
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.description, {
    prefix: "이 자는",
    highlight: "마녀사냥꾼",
    suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
  })
})

test("highest_win_rate_role이 없으면(전적 0판) 강조 문구를 전적 없음으로 대체한다", () => {
  resetStore()
  useUserProfileStore.setState({ data: { ...PROFILE_ROW, highest_win_rate_role: null }, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.description, {
    prefix: "",
    highlight: "전적 없음",
    suffix: " 아직 어떤 가면도 증명하지 못했습니다.",
  })
})

import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useLibraryTab.test.js)와 동일하다.
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

// user.store가 모듈을 불러올 때 실제 서버 요청이 나가지 않도록 API 경계를 상대 경로로 대체합니다.
// (friend.store 테스트와 같은 패턴)
let profileResponse = null
let getMyProfileCallCount = 0

mock.module("../../api/user.api.js", {
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
const { useMyProfile } = await import("../useMyProfile.js")
const { useUserProfileStore } = await import("../../store/user.store.js")

// 로컬 API가 실제로 돌려주는 프로필 응답 모양입니다. title을 포함합니다.
// F-10: highest_win_rate_role(운명의 가면, AC-04)이 most_played_role과 별도 필드로
// 추가됐다 — 자세한 마스크 선택 계약은 useMyProfile.roleStatistics.test.js가 검증한다.
const PROFILE_ROW = {
  nickname: "가면술사",
  reputation: 1280,
  title: "무자비한 광대",
  total_games: 1245,
  survival_count: 788,
  execution_count: 112,
  most_played_role: "광대",
  highest_win_rate_role: "마녀사냥꾼",
}

function resetStore() {
  getMyProfileCallCount = 0
  profileResponse = null
  useUserProfileStore.setState({ data: null, loading: true })
}

test("데이터가 없으면 null 계약을 돌려주고 fetchProfile을 한 번 호출한다", async () => {
  resetStore()
  profileResponse = PROFILE_ROW

  const { result } = renderHook(() => useMyProfile())

  // 첫 렌더에서는 아직 캐시가 비어 있으므로 화면이 안전하게 처리할 null 계약을 받습니다.
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

  // **기대값을 계약 쪽으로 바꿨다.** 예전 기대("캐시가 있으면 조회하지 않는다")는 개인 무효화
  // 신호를 놓친 경우(끊겨 있던 사이의 커밋, 다른 탭에서 지나간 신호, 웹 프로세스 밖의 복구
  // 지급)에 방금 끝난 판의 전적이 새로고침 전까지 영영 반영되지 않게 한다 — F-21(A-10)이
  // 요구하는 수렴과 정면으로 어긋난다.
  // 중복 요청은 생략이 아니라 **합치기**로 막는다 — 같은 순간에 뜬 로비와 마이페이지의
  // 조회는 하나로 묶인다(요청 두 번이 아니라 한 번이다).
  const lobby = renderHook(() => useMyProfile())
  const myPage = renderHook(() => useMyProfile())
  await waitFor(() => assert.equal(myPage.result.current.loading, false))

  assert.equal(getMyProfileCallCount, 1, "재진입이 서버를 다시 읽지 않았거나 요청이 두 번 나갔다")
  lobby.unmount()
  myPage.unmount()
})

test("profile은 닉네임·명성과 함께 title을 그대로 유지한다", () => {
  resetStore()
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.profile, {
    reputationLabel: "가면술사",
    reputationValue: 1280,
    title: "무자비한 광대",
  })
})

test("stats는 전적 숫자를 천 단위 구분 문자열로 바꿔 3행으로 돌려준다", () => {
  resetStore()
  useUserProfileStore.setState({ data: PROFILE_ROW, loading: false })

  const { result } = renderHook(() => useMyProfile())

  assert.deepEqual(result.current.stats, [
    { label: "전체 판수", value: "1,245" },
    { label: "생존 횟수", value: "788" },
    { label: "단두대 처형", value: "112" },
  ])
})

// F-10 AC-04: "운명의 가면"은 최다 플레이(most_played_role)가 아니라 서버가 계산한 최고
// 승률 직업(highest_win_rate_role)을 강조 문구로 쓴다. 상세 동률·0판 계약은
// useMyProfile.roleStatistics.test.js가 검증한다.
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

  assert.equal(result.current.description.highlight, "전적 없음")
})

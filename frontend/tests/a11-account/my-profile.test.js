// 마이페이지 전적 값 시험 (훅 useMyProfile: 판수·승률 글자, 대표 직업 문구, 못 받음·이상한 값)
// 목록 A11b 화면 상태 A11-F-580~586
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, flushUi, signIn, resetStores, profileBody } = await import("./a11Kit.mjs")
const { useMyProfile } = await import("../../src/shared/hooks/useMyProfile.js")

const PATH = "/user/me/profile"

test.beforeEach(() => { resetStores(); signIn() })
test.afterEach(() => cleanup())

// 서버 프로필 답을 주고 훅을 그림
async function mount(answer) {
  const net = installFetch({ [`GET ${PATH}`]: answer })
  const hook = renderHook(() => useMyProfile())
  await flushUi()
  return { net, hook }
}

// 전적 줄 값 꺼내기 → "1,234"
const statOf = (hook, label) => hook.result.current.stats?.find((s) => s.label === label)?.value

// 직업 문구를 한 줄로 → "이 자는 의사의 가면을 쓸 때 가장 잔혹합니다."
const sentenceOf = (hook) => {
  const d = hook.result.current.description
  return d ? `${d.prefix ? `${d.prefix} ` : ""}${d.highlight}${d.suffix}` : null
}

test("A11-F-580 판수 1234 → '1,234'", async () => {
  const { hook } = await mount(profileBody({ total_games: 1234 }))
  assert.equal(statOf(hook, "전체 판수"), "1,234")
})

test("A11-F-581 승률 0.756 → '75.6%'", async () => {
  const { hook } = await mount(profileBody({ account_win_rate: 0.756 }))
  assert.equal(statOf(hook, "승률"), "75.6%")
})

test("A11-F-582 승률 0 → '0.0%'", async () => {
  const { hook } = await mount(profileBody({ account_win_rate: 0 }))
  assert.equal(statOf(hook, "승률"), "0.0%")
})

test("A11-F-583 최고 승률 직업 '의사' → '이 자는 의사의 가면을 쓸 때 가장 잔혹합니다.'", async () => {
  const { hook } = await mount(profileBody({ highest_win_rate_role: "의사" }))
  assert.equal(sentenceOf(hook), "이 자는 의사의 가면을 쓸 때 가장 잔혹합니다.")
})

test("A11-F-584 대표 직업 없음 → '전적 없음' 문구", async () => {
  const { hook } = await mount(profileBody({ total_games: 0, account_win_rate: 0, highest_win_rate_role: null }))
  assert.equal(hook.result.current.description?.highlight, "전적 없음")
  assert.doesNotMatch(sentenceOf(hook), /가장 잔혹합니다/)
})

test("A11-F-585 프로필 못 받음 → 오류 + 다시 불러오기(요청 1번 더)", async () => {
  const { net, hook } = await mount({ status: 500, body: { success: false, message: "서버 오류" } })
  assert.equal(hook.result.current.profile, null)
  assert.notEqual(hook.result.current.error, null)
  assert.equal(typeof hook.result.current.retry, "function")
  const before = net.to("GET", PATH).length
  await act(async () => { await hook.result.current.retry() })
  assert.equal(net.to("GET", PATH).length, before + 1)
})

test("A11-F-586 [지금 동작] 판수 −1·승률 NaN → 표시 안 하고 오류", async () => {
  const negative = await mount(profileBody({ total_games: -1 }))
  assert.equal(negative.hook.result.current.stats, null)
  assert.notEqual(negative.hook.result.current.error, null)
  cleanup()
  resetStores()
  signIn()
  // JSON엔 NaN이 없어 글자 "NaN"으로 옴
  const notNumber = await mount(profileBody({ account_win_rate: "NaN" }))
  assert.equal(notNumber.hook.result.current.stats, null)
  assert.notEqual(notNumber.hook.result.current.error, null)
})

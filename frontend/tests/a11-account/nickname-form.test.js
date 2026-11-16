// 닉네임 바꾸기 상태 시험 (훅 useNicknameForm: 성공이면 로그인 정보 닉네임만 바뀜, 409면 서버 문구)
// 목록 A11b 화면 상태 A11-F-578~579
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, flushUi, submitEvent, signIn, resetStores, profileBody } = await import("./a11Kit.mjs")
const { useNicknameForm } = await import("../../src/domains/user/hooks/useNicknameForm.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { useUserProfileStore } = await import("../../src/domains/user/store/user.store.js")

const PATH = "/user/me/nickname"

test.afterEach(() => { cleanup(); resetStores() })

// 로그인 + 프로필 받아 둔 상태에서 닉네임 훅을 그림
async function mount(answer) {
  installFetch({
    "GET /user/me/profile": profileBody({ nickname: "가면손님" }),
    [`PATCH ${PATH}`]: answer,
  })
  signIn({ uuid: "u-a11", nickname: "가면손님" })
  await useUserProfileStore.getState().refresh()
  assert.equal(useUserProfileStore.getState().data?.nickname, "가면손님", "준비: 프로필 받음")
  const hook = renderHook(() => useNicknameForm())
  act(() => hook.result.current.setNickname("새가면"))
  return hook
}

// 보내기 + 답 반영
async function submit(hook) {
  await act(async () => { await hook.result.current.handleNicknameSubmit(submitEvent()) })
  await flushUi()
}

test("A11-F-578 성공 → 성공 문구 + 로그인 정보 닉네임만 새 값 (같은 계정 캐시 안 비움)", async () => {
  const hook = await mount({ status: 200, body: { success: true, message: "닉네임이 변경되었습니다." } })
  // 바꾸기 직전 계정 세대·프로필 세대
  const identityBefore = useAuthStore.getState().identityGeneration
  const profileGenBefore = useUserProfileStore.getState().requestGeneration
  await submit(hook)
  assert.equal(hook.result.current.nicknameMsg?.text, "닉네임이 변경되었습니다.")
  assert.equal(hook.result.current.nicknameMsg?.type, "success")
  const user = useAuthStore.getState().user
  assert.equal(user?.nickname, "새가면")
  assert.equal(user?.uuid, "u-a11")
  // 계정 세대가 그대로 → 계정 캐시(팔레트 등)를 안 비움, 프로필도 안 비우고 닉네임만 바뀜
  assert.equal(useAuthStore.getState().identityGeneration, identityBefore)
  assert.equal(useUserProfileStore.getState().requestGeneration, profileGenBefore)
  assert.equal(useUserProfileStore.getState().data?.nickname, "새가면")
  assert.equal(useUserProfileStore.getState().data?.total_games, 12)
})

test("A11-F-579 409 → 서버 문구", async () => {
  const text = "이미 사용 중인 닉네임입니다."
  const hook = await mount({ status: 409, body: { success: false, message: text } })
  await submit(hook)
  assert.equal(hook.result.current.nicknameMsg?.text, text)
  assert.equal(hook.result.current.nicknameMsg?.type, "error")
  assert.equal(useAuthStore.getState().user?.nickname, "가면손님")
})

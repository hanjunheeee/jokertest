import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import { JSDOM } from "jsdom"

const SRC_DIR_HREF = pathToFileURL(path.join(import.meta.dirname, "..", "..", "..", "..", "src") + path.sep).href

const loaderSource = `
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SRC_DIR_HREF = ${JSON.stringify(SRC_DIR_HREF)}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC_DIR_HREF).href
    for (const candidate of [base + ".js", base + ".jsx", base]) {
      try {
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate, shortCircuit: true }
        }
      } catch {}
    }
  }
  return nextResolve(specifier, context)
}
`

register("data:text/javascript," + encodeURIComponent(loaderSource), import.meta.url)

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

let updateNicknameCalls = []
let updateNicknameShouldFail = false

mock.module("@/domains/user/api/user.api", {
  namedExports: {
    updateNicknameApi: async (nickname) => {
      updateNicknameCalls.push(nickname)
      if (updateNicknameShouldFail) {
        throw new Error("이미 사용 중인 닉네임입니다.")
      }
      return { success: true, message: "닉네임이 변경되었습니다." }
    },
    getMyProfileApi: async () => {
      throw new Error("이 테스트에서는 getMyProfileApi가 호출되면 안 됩니다(재요청 없이 캐시 patch로 갱신되어야 함)")
    },
    updatePasswordApi: async () => ({}),
  },
})

const { renderHook, act, waitFor } = await import("@testing-library/react")
const { useNicknameForm } = await import("../../../../src/domains/user/hooks/useNicknameForm.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useUserProfileStore } = await import("../../../../src/domains/user/store/user.store.js")
const { useMyProfile } = await import("../../../../src/domains/user/hooks/useMyProfile.js")

const BASE_PROFILE_ROW = {
  nickname: "변경전닉",
  title: "신참",
  total_games: 10,
  account_win_rate: 0.4,
  survival_count: 5,
  execution_count: 1,
  most_played_role: "시민",
}

const EXPECTED_STATS = [
  { label: "전체 판수", value: "10" },
  { label: "승률", value: "40.0%" },
]

function resetStores() {
  updateNicknameCalls = []
  updateNicknameShouldFail = false
  useAuthStore.setState({
    isLoggedIn: true,
    user: { uuid: "uuid-1", nickname: "변경전닉" },
    loggedOutIntentionally: false,
  })
  useUserProfileStore.setState({ data: { ...BASE_PROFILE_ROW }, loading: false })
}

const submit = async (result) => {
  await act(async () => {
    result.current.handleNicknameSubmit({ preventDefault() {} })
  })
}

test("AC-03: 닉네임 변경 성공 시 재요청 없이 auth store와 마이페이지 표시(useMyProfile)가 즉시 새 닉네임으로 갱신된다", async () => {
  resetStores()

  const { result } = renderHook(() => useNicknameForm())
  const { result: profileResult } = renderHook(() => useMyProfile())

  assert.equal(profileResult.current.profile.nickname, "변경전닉", "변경 전 화면은 원래 닉네임을 보여줘야 합니다")

  act(() => result.current.setNickname("변경후닉"))
  await submit(result)

  await waitFor(() => assert.equal(result.current.nicknameMsg?.type, "success"))

  assert.deepEqual(updateNicknameCalls, ["변경후닉"], "trim된 새 닉네임으로 정확히 한 번만 API를 호출해야 합니다")

  assert.equal(useAuthStore.getState().user.nickname, "변경후닉", "auth store의 현재 사용자 닉네임이 즉시 갱신되어야 합니다")

  await waitFor(() => assert.equal(profileResult.current.profile.nickname, "변경후닉"))

  assert.deepEqual(profileResult.current.stats, EXPECTED_STATS)
  assert.equal(profileResult.current.profile.title, "신참")
})

test("AC-03: 닉네임 변경 실패 시 auth store와 마이페이지 표시 모두 변경 전 닉네임을 그대로 유지한다", async () => {
  resetStores()
  updateNicknameShouldFail = true

  const { result } = renderHook(() => useNicknameForm())
  const { result: profileResult } = renderHook(() => useMyProfile())

  act(() => result.current.setNickname("변경후닉"))
  await submit(result)

  await waitFor(() => assert.equal(result.current.nicknameMsg?.type, "error"))

  assert.equal(useAuthStore.getState().user.nickname, "변경전닉", "실패 시 auth store는 바뀌면 안 됩니다")
  assert.equal(profileResult.current.profile.nickname, "변경전닉", "실패 시 마이페이지 표시도 바뀌면 안 됩니다")
  assert.deepEqual(profileResult.current.stats, EXPECTED_STATS)
  assert.equal(profileResult.current.profile.title, "신참")
})

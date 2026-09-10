import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import { JSDOM } from "jsdom"

// F-04 AC-03 재검토 지적("현재 닉네임의 UI 즉시 갱신... 실행 경로나 수동 검증 근거는
// 여전히 없다") 대응.
//
// useNicknameForm.js는 store/api를 "@/domains/..." alias로 import하는데, 이 저장소의
// frontend test 스크립트(package.json "test": "node --experimental-test-module-mocks
// --test ...")는 vite 없이 순수 Node ESM resolver만 쓰므로 그 alias를 풀지 못한다
// (이전 회차에서 mock.module + 직접 import 시도가 ERR_MODULE_NOT_FOUND로 재현됨).
// useNicknameForm.js의 import를 상대 경로로 바꾸는 것은 이번 슬라이스 수정 범위
// (F0541/F0573/X0026/X0064/F0542/F0574와 그 import/helper/관련 테스트 파일) 밖이라
// 손대지 않는다. 대신 Node 20.6+가 제공하는 module.register()로 "이 테스트 파일 안에서만"
// "@/" -> frontend/src 매핑 훅을 등록해, useNicknameForm.js를 스텁이나 우회 없이 실제로
// import하고 실행한다 — 이 훅은 이 파일 밖(package.json, useNicknameForm.js)에는 아무
// 흔적도 남기지 않는다.
const SRC_DIR_HREF = pathToFileURL(path.join(import.meta.dirname, "..", "..", "..", "..") + path.sep).href

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

// 실제 서버 요청이 나가지 않도록 API 경계만 대체한다(useMyProfile.test.js와 같은 원칙).
// updateNicknameApi 호출 이력을 기록해 "성공 시 정확히 trim된 새 닉네임으로 한 번 호출한다"까지
// 확인한다.
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
const { useNicknameForm } = await import("../useNicknameForm.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useUserProfileStore } = await import("../../store/user.store.js")
const { useMyProfile } = await import("../useMyProfile.js")

const BASE_PROFILE_ROW = {
  nickname: "변경전닉",
  reputation: 100,
  title: "신참",
  total_games: 10,
  survival_count: 5,
  execution_count: 1,
  most_played_role: "시민",
}

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

  assert.equal(profileResult.current.profile.reputationLabel, "변경전닉", "변경 전 화면은 원래 닉네임을 보여줘야 합니다")

  act(() => result.current.setNickname("변경후닉"))
  await submit(result)

  await waitFor(() => assert.equal(result.current.nicknameMsg?.type, "success"))

  assert.deepEqual(updateNicknameCalls, ["변경후닉"], "trim된 새 닉네임으로 정확히 한 번만 API를 호출해야 합니다")

  // useNicknameForm.js의 성공 분기(storeLogin + patchProfile)가 실제로 auth store를 갱신했는지 확인.
  assert.equal(useAuthStore.getState().user.nickname, "변경후닉", "auth store의 현재 사용자 닉네임이 즉시 갱신되어야 합니다")

  // 같은 patchProfile 호출이 useMyProfile이 읽는 캐시도 갱신했으므로, 별도 재요청 없이도
  // 마이페이지의 "현재 닉네임 표시"(reputationLabel)가 같은 렌더 사이클에서 새 값으로 바뀐다.
  // getMyProfileApi가 위에서 던지도록 스텁해 뒀으므로, 재요청이 있었다면 이 assert 전에
  // unhandled rejection으로 먼저 드러난다.
  await waitFor(() => assert.equal(profileResult.current.profile.reputationLabel, "변경후닉"))
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
  assert.equal(profileResult.current.profile.reputationLabel, "변경전닉", "실패 시 마이페이지 표시도 바뀌면 안 됩니다")
})

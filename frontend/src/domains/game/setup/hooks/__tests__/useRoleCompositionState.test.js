import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// 이 훅은 React state만 쓰고 socket/store에 의존하지 않지만, renderHook을 쓰려면 DOM
// 전역이 필요하다. 설치 방식은 기존 훅 테스트(useInGameRoleReveal.test.js)와 동일하다.
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

const { renderHook } = await import("@testing-library/react")
const { useRoleCompositionState } = await import("../useRoleCompositionState.js")

function renderRoleComposition({ maxPlayers = 8, autoJokerCount = 2 } = {}) {
  return renderHook((props) => useRoleCompositionState(props), {
    initialProps: { maxPlayers, autoJokerCount },
  })
}

test("초기 모드는 항상 AUTO이고 그 상태로 방을 만들 수 있다", () => {
  const { result } = renderRoleComposition()

  assert.equal(result.current.mode, "auto")
  assert.equal(result.current.isCustom, false)
  assert.equal(result.current.validation.ok, true)
})

// 광대 상한이 2명(MAX_SPECIAL_ROLE_COUNT)으로 좁아졌으므로 승계 값도 그 안이어야 유효하다.
test("CUSTOM으로 전환하면 직전 광대 수를 승계하고 파생 시민 수를 계산한다", () => {
  const { result } = renderRoleComposition({ maxPlayers: 8, autoJokerCount: 2 })

  act(() => result.current.selectMode("custom"))

  assert.equal(result.current.isCustom, true)
  assert.equal(result.current.roleCounts.JOKER, 2)
  assert.equal(result.current.fixedRoleCount, 2)
  assert.equal(result.current.citizenCount, 6) // 8 - 2
  assert.equal(result.current.validation.ok, true)
})

// AUTO 스테퍼는 아직 3 이상을 고를 수 있으므로(상한 반영은 후속 슬라이스), 상한이 2로
// 좁아진 뒤에는 3이 "범위를 벗어난 값"에 해당한다. 훅의 기존 계약대로 이런 값은 승계하지
// 않고(보정도 하지 않고) CUSTOM 기본값에서 시작하므로, 전환 직후 상태는 유효하다.
test("상한을 넘는 AUTO 광대 수는 CUSTOM으로 승계되지 않고 기본값에서 시작한다", () => {
  const { result } = renderRoleComposition({ maxPlayers: 8, autoJokerCount: 3 })

  act(() => result.current.selectMode("custom"))

  assert.equal(result.current.roleCounts.JOKER, 1)
  assert.equal(result.current.validation.ok, true)

  // 상한을 넘는 값을 사용자가 직접 지정하면 그때는 보정 없이 검증 실패로 알린다.
  act(() => result.current.setRoleCount("JOKER", 3))
  assert.equal(result.current.roleCounts.JOKER, 3)
  assert.equal(result.current.validation.ok, false)
  assert.equal(result.current.validation.code, "JOKER_COUNT_ABOVE_LIMIT")
})

test("maxPlayers가 바뀌면 파생 시민 수와 검증이 즉시 다시 계산된다", () => {
  const { result, rerender } = renderRoleComposition({ maxPlayers: 8, autoJokerCount: 2 })

  act(() => result.current.selectMode("custom"))
  act(() => result.current.setRoleCount("DOCTOR", 1))
  act(() => result.current.setRoleCount("GUARD", 1))
  assert.equal(result.current.citizenCount, 4) // 8 - (2+1+1)
  assert.equal(result.current.validation.ok, true)

  rerender({ maxPlayers: 4, autoJokerCount: 2 })
  assert.equal(result.current.citizenCount, 0) // 4 - 4
  assert.equal(result.current.validation.ok, true)

  // 정원이 더 줄면 값 보정 없이 즉시 "생성 불가" 상태가 된다.
  rerender({ maxPlayers: 4, autoJokerCount: 2 })
  act(() => result.current.setRoleCount("WITCH_HUNTER", 1))
  assert.equal(result.current.citizenCount, null)
  assert.equal(result.current.validation.ok, false)
  assert.equal(result.current.validation.code, "FIXED_ROLES_EXCEED_MAX_PLAYERS")
  assert.equal(result.current.roleCounts.WITCH_HUNTER, 1) // 조용히 되돌리지 않는다
})

test("AUTO로 되돌리면 잘못된 custom 값이 남아 있어도 다시 생성 가능해진다", () => {
  const { result } = renderRoleComposition({ maxPlayers: 4, autoJokerCount: 2 })

  act(() => result.current.selectMode("custom"))
  act(() => result.current.setRoleCount("DOCTOR", 4))
  assert.equal(result.current.validation.ok, false)

  act(() => result.current.selectMode("auto"))
  assert.equal(result.current.mode, "auto")
  assert.equal(result.current.isCustom, false)
  assert.equal(result.current.validation.ok, true)
})

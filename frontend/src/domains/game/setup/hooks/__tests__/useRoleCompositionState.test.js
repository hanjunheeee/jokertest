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

test("CUSTOM으로 전환하면 직전 광대 수를 승계하고 파생 시민 수를 계산한다", () => {
  const { result } = renderRoleComposition({ maxPlayers: 8, autoJokerCount: 3 })

  act(() => result.current.selectMode("custom"))

  assert.equal(result.current.isCustom, true)
  assert.equal(result.current.roleCounts.JOKER, 3)
  assert.equal(result.current.fixedRoleCount, 3)
  assert.equal(result.current.citizenCount, 5) // 8 - 3
  assert.equal(result.current.validation.ok, true)
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

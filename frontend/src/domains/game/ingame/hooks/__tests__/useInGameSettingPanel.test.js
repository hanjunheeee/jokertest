import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook을 쓰기 위한 DOM 전역. 설치 방식은 기존 훅 테스트와 동일하다.
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
const { SOUND_SETTING_VOLUMES } = await import("../../../../settings/constants/soundSettings.js")
const {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_SOUND_VOLUMES,
} = await import("../../constants/controls/ingameSetting/ingameSettingData.js")
const { useInGameSettingPanel } = await import("../useInGameSettingPanel.js")

test("사운드 항목 정의는 설정 화면(UI-05)과 같은 상수를 그대로 쓴다", () => {
  assert.equal(
    INGAME_SETTING_SOUND_VOLUMES,
    SOUND_SETTING_VOLUMES,
    "인게임 설정이 별도 사운드 항목 정의를 만들면 두 화면의 값이 갈라진다",
  )
})

test("사운드 슬라이더 초기값은 UI-05 store의 defaultValue와 같다", () => {
  const { result } = renderHook(() => useInGameSettingPanel())

  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    assert.equal(result.current.volumes[id], defaultValue)
  }
})

test("슬라이더를 움직이면 UI-05 store의 값이 갱신되고 다른 항목은 그대로다", () => {
  const { result } = renderHook(() => useInGameSettingPanel())

  const [first, second] = SOUND_SETTING_VOLUMES
  const untouchedBefore = result.current.volumes[second.id]

  act(() => result.current.setVolume(first.id, 13))

  assert.equal(result.current.volumes[first.id], 13)
  assert.equal(result.current.volumes[second.id], untouchedBefore)
})

test("탭 전환 상태는 선택한 탭을 그대로 보관한다", () => {
  const { result } = renderHook(() => useInGameSettingPanel())

  assert.equal(result.current.activeTab, INGAME_SETTING_DEFAULT_TAB)

  act(() => result.current.setActiveTab("sound"))
  assert.equal(result.current.activeTab, "sound")

  act(() => result.current.setActiveTab(INGAME_SETTING_DEFAULT_TAB))
  assert.equal(result.current.activeTab, INGAME_SETTING_DEFAULT_TAB)
})

test("방관리 탭은 방장에게만 보이고, 탭 전환 뒤 방장이 아니게 되면 기본 탭으로 돌아온다", () => {
  const notHost = renderHook(() => useInGameSettingPanel({ isHost: false }))
  assert.deepEqual(
    notHost.result.current.visibleTabs.map((tab) => tab.id),
    ["chat", "sound"],
  )
  notHost.unmount()

  const { result, rerender } = renderHook(
    ({ isHost }) => useInGameSettingPanel({ isHost }),
    { initialProps: { isHost: true } },
  )

  assert.deepEqual(
    result.current.visibleTabs.map((tab) => tab.id),
    ["chat", "sound", "room"],
  )

  act(() => result.current.setActiveTab("room"))
  assert.equal(result.current.activeTab, "room")

  act(() => rerender({ isHost: false }))
  assert.equal(result.current.activeTab, INGAME_SETTING_DEFAULT_TAB)
})

test("탭을 바꿔도 사운드 값은 유지된다", () => {
  const { result } = renderHook(() => useInGameSettingPanel())

  const [first] = SOUND_SETTING_VOLUMES

  act(() => result.current.setVolume(first.id, 21))
  act(() => result.current.setActiveTab("sound"))
  act(() => result.current.setActiveTab("chat"))

  assert.equal(result.current.volumes[first.id], 21)
})

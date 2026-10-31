import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
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

const { renderHook } = await import("@testing-library/react")
const { SOUND_SETTING_VOLUMES } = await import("../../../../../src/domains/settings/constants/soundSettings.js")
const { useSoundSettings } = await import("../../../../../src/domains/settings/hooks/useSoundSettings.js")
const { buildDefaultSoundVolumes, useSettingsStore } = await import(
  "../../../../../src/domains/settings/store/settingsStore.js"
)
const {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_SOUND_VOLUMES,
} = await import("../../../../../src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js")
const { useInGameSettingPanel } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSettingPanel.js")

function resetSettingsStore() {
  act(() => {
    useSettingsStore.setState({ volumes: buildDefaultSoundVolumes(), inGameSettingTab: null })
  })
}

test("사운드 항목 정의는 설정 화면(UI-05)과 같은 상수를 그대로 쓴다", () => {
  assert.equal(
    INGAME_SETTING_SOUND_VOLUMES,
    SOUND_SETTING_VOLUMES,
    "인게임 설정이 별도 사운드 항목 정의를 만들면 두 화면의 값이 갈라진다",
  )
})

test("사운드 슬라이더 초기값은 UI-05 store의 defaultValue와 같다", () => {
  resetSettingsStore()

  const { result, unmount } = renderHook(() => useInGameSettingPanel())

  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    assert.equal(result.current.volumes[id], defaultValue)
  }

  unmount()
})

test("인게임 슬라이더를 움직이면 UI-05 설정 화면의 훅과 같은 store 값이 바뀐다", () => {
  resetSettingsStore()

  const ingame = renderHook(() => useInGameSettingPanel())
  const settingPage = renderHook(() => useSoundSettings())

  const [first, second] = SOUND_SETTING_VOLUMES
  const untouchedBefore = settingPage.result.current.volumes[second.id]

  act(() => ingame.result.current.setVolume(first.id, 13))

  assert.equal(ingame.result.current.volumes[first.id], 13)
  assert.equal(
    settingPage.result.current.volumes[first.id],
    13,
    "인게임에서 바꾼 볼륨이 설정 화면 훅에 보이지 않으면 두 화면이 다른 상태를 쓰는 것이다",
  )
  assert.equal(useSettingsStore.getState().volumes[first.id], 13)
  assert.equal(settingPage.result.current.volumes[second.id], untouchedBefore)

  ingame.unmount()
  settingPage.unmount()
})

test("UI-05 설정 화면에서 바꾼 볼륨이 인게임 설정 패널에도 그대로 보인다", () => {
  resetSettingsStore()

  const ingame = renderHook(() => useInGameSettingPanel())
  const settingPage = renderHook(() => useSoundSettings())

  const [first] = SOUND_SETTING_VOLUMES

  act(() => settingPage.result.current.setVolume(first.id, 27))

  assert.equal(ingame.result.current.volumes[first.id], 27)

  ingame.unmount()
  settingPage.unmount()
})

test("탭 전환 상태도 같은 store에 반영된다 — 패널을 다시 열어도 유지된다", () => {
  resetSettingsStore()

  const panel = renderHook(() => useInGameSettingPanel())
  assert.equal(panel.result.current.activeTab, INGAME_SETTING_DEFAULT_TAB)

  act(() => panel.result.current.setActiveTab("sound"))

  assert.equal(panel.result.current.activeTab, "sound")
  assert.equal(
    useSettingsStore.getState().inGameSettingTab,
    "sound",
    "탭이 컴포넌트 지역 상태면 패널을 닫을 때마다 선택이 사라진다",
  )

  panel.unmount()
  const reopened = renderHook(() => useInGameSettingPanel())

  assert.equal(reopened.result.current.activeTab, "sound")

  reopened.unmount()
})

test("방관리 탭은 방장에게만 보이고, 탭 전환 뒤 방장이 아니게 되면 기본 탭으로 돌아온다", () => {
  resetSettingsStore()

  const notHost = renderHook(() => useInGameSettingPanel({ isHost: false }))
  assert.deepEqual(
    notHost.result.current.visibleTabs.map((tab) => tab.id),
    ["chat", "sound"],
  )
  notHost.unmount()

  const host = renderHook((props) => useInGameSettingPanel(props), {
    initialProps: { isHost: true },
  })
  assert.deepEqual(
    host.result.current.visibleTabs.map((tab) => tab.id),
    ["chat", "sound", "room"],
  )

  act(() => host.result.current.setActiveTab("room"))
  assert.equal(host.result.current.activeTab, "room")

  host.rerender({ isHost: false })
  host.unmount()

  const demoted = renderHook(() => useInGameSettingPanel({ isHost: false }))
  assert.equal(demoted.result.current.activeTab, INGAME_SETTING_DEFAULT_TAB)
  assert.equal(useSettingsStore.getState().inGameSettingTab, INGAME_SETTING_DEFAULT_TAB)

  demoted.unmount()
})

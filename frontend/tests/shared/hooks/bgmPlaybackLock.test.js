import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

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
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { MUSIC_PLAYBACK_ENABLED } = await import("../../../src/shared/constants/bgmAssets.js")
const { useAudioControl } = await import("../../../src/shared/hooks/useAudioControl.js")
const { useBgmAutoplay, getGlobalBgmUiMuted, setGlobalBgmUiMuted } = await import("../../../src/shared/hooks/useBgmAutoplay.js")
const { useSettingsStore, buildDefaultSoundVolumes } = await import(
  "../../../src/domains/settings/store/settingsStore.js"
)

function createFakeMedia() {
  return {
    volume: 0.6,
    muted: false,
    paused: true,
    playCallCount: 0,
    pauseCallCount: 0,
    play() {
      this.playCallCount += 1
      this.paused = false
      return Promise.resolve()
    },
    pause() {
      this.pauseCallCount += 1
      this.paused = true
    },
  }
}

test("MUSIC_PLAYBACK_ENABLED는 true다 — 2026-09-22 운영자 AUDIO-01 완화(라이선스 확인된 음원만)", async () => {
  assert.equal(MUSIC_PLAYBACK_ENABLED, true)
  const { BGM_ASSETS, BGM_LICENSES } = await import("../../../src/shared/constants/bgmAssets.js")
  assert.ok(BGM_LICENSES[BGM_ASSETS.loginMusic], "등록된 음원은 출처·라이선스 기록이 있어야 한다")
  assert.match(BGM_LICENSES[BGM_ASSETS.loginMusic].license, /CC0/)
})

function resetVolumes() {
  setGlobalBgmUiMuted(false)
  act(() => {
    useSettingsStore.getState().setVolume("master-volume", 100)
    useSettingsStore.getState().setVolume("bgm-volume", 80)
  })
}

test("useBgmAutoplay는 마운트 때 Master × 배경음 볼륨을 audio에 적용하고 재생을 한 번 시도한다", () => {
  resetVolumes()
  act(() => useSettingsStore.getState().setVolume("master-volume", 50))
  const media = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: media }))

  assert.equal(media.playCallCount, 1)
  assert.ok(Math.abs(media.volume - 0.5 * 0.8) < 1e-9, "Master 50% × 배경음 80%")
  assert.equal(media.muted, false)
})

test("useBgmAutoplay는 설정 볼륨이 바뀌면 즉시 반영하고, 어느 한쪽이 0이면 무음이다", () => {
  resetVolumes()
  const media = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: media }))

  act(() => useSettingsStore.getState().setVolume("bgm-volume", 0))
  assert.equal(media.volume, 0)
  assert.equal(media.muted, true)

  act(() => useSettingsStore.getState().setVolume("bgm-volume", 100))
  assert.equal(media.volume, 1)
  assert.equal(media.muted, false)
})

test("효과음 음소거·효과음 볼륨은 배경음에 영향을 주지 않는다", () => {
  resetVolumes()
  const media = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: media }))
  act(() => {
    useSettingsStore.getState().setSfxMuted(true)
    useSettingsStore.getState().setVolume("sfx-volume", 0)
  })
  assert.ok(Math.abs(media.volume - 0.8) < 1e-9)
  assert.equal(media.muted, false)
  act(() => useSettingsStore.getState().setSfxMuted(false))
})

test("자동재생이 거부되면 첫 클릭에서 한 번 더 재생을 시도한다", () => {
  resetVolumes()
  const media = createFakeMedia()
  media.play = function rejectedPlay() { this.playCallCount += 1; return Promise.reject(new Error("NotAllowedError")) }
  renderHook(() => useBgmAutoplay({ current: media }))
  assert.equal(media.playCallCount, 1)
  act(() => { window.dispatchEvent(new dom.window.Event("click")) })
  assert.equal(media.playCallCount, 2)
  act(() => { window.dispatchEvent(new dom.window.Event("click")) })
  assert.equal(media.playCallCount, 2, "재시도는 첫 클릭 한 번뿐이다")
})

test("같은 audio 요소에 훅이 다시 붙어도 재생 중이면 play()를 다시 부르지 않는다", () => {
  resetVolumes()
  const media = createFakeMedia()
  media.pause = () => {
    media.paused = true
  }
  Object.defineProperty(media, "paused", {
    configurable: true,
    get() {
      return this._paused ?? false
    },
    set(value) {
      this._paused = value
    },
  })
  media._paused = false
  media.playCallCount = 1

  renderHook(() => useBgmAutoplay({ current: media }))
  assert.equal(media.playCallCount, 1, "이미 재생 중이면 처음부터 다시 시작하면 안 된다")
})

test("조절바 음소거는 SoundControl remount 후에도 유지된다", () => {
  resetVolumes()
  const media = createFakeMedia()
  const first = renderHook(() => useAudioControl({ current: media }))
  act(() => first.result.current.toggleMute())
  assert.equal(getGlobalBgmUiMuted(), true)
  assert.equal(media.muted, true)
  first.unmount()

  const second = renderHook(() => useAudioControl({ current: media }))
  assert.equal(second.result.current.isSilent, true)
  assert.equal(media.muted, true)
})

test("useAudioControl은 설정의 배경음 볼륨을 슬라이더로 보이고, 조절하면 설정에 저장하며 Master × 배경음을 audio에 넣는다", () => {
  resetVolumes()
  const media = createFakeMedia()
  const { result } = renderHook(() => useAudioControl({ current: media }))

  assert.equal(result.current.disabled, false)
  assert.ok(Math.abs(result.current.sliderValue - 0.8) < 1e-9)
  assert.ok(Math.abs(media.volume - 0.8) < 1e-9)

  act(() => result.current.onVolumeChange(0.25))
  assert.equal(useSettingsStore.getState().volumes["bgm-volume"], 25)
  assert.ok(Math.abs(media.volume - 0.25) < 1e-9)

  act(() => result.current.toggleMute())
  assert.equal(media.muted, true)
  assert.equal(result.current.isSilent, true)
  assert.equal(result.current.sliderValue, 0)
  act(() => result.current.toggleMute())
  assert.equal(media.muted, false)
})

test("설정 초기화는 배경음 볼륨을 기본값(80)으로 되돌리지만 play()를 다시 부르지 않는다", () => {
  resetVolumes()
  const media = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: media }))
  act(() => {
    useSettingsStore.getState().setVolume("bgm-volume", 0)
    useSettingsStore.getState().resetSettings()
  })
  assert.deepEqual(useSettingsStore.getState().volumes, buildDefaultSoundVolumes())
  assert.ok(Math.abs(media.volume - 0.8) < 1e-9)
  assert.equal(media.playCallCount, 1, "초기화가 재생을 새로 시작하면 안 된다")
})

test("GlobalBgmLayer는 MUSIC_PLAYBACK_ENABLED일 때만 audio 요소를 렌더한다", () => {
  const source = readFileSync(new URL("../../../src/shared/ui/GlobalBgmLayer.jsx", import.meta.url), "utf8")

  assert.match(
    source,
    /if \(!MUSIC_PLAYBACK_ENABLED\) return null[\s\S]*<audio/,
    "차단 중에도 audio 요소를 렌더하면 재생 경로가 남는다",
  )
})

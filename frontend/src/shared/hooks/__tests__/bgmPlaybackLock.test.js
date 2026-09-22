import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"

// 2026-09-22 운영자 AUDIO-01 완화: 라이선스가 확인된 배경음(CC0 Death Waltz)은 재생한다. 이 시험은 실제 재생
// 경로(useBgmAutoplay·useAudioControl)가 **설정의 Master × 배경음** 볼륨만 따르고, 효과음 설정과 섞이지
// 않으며, 볼륨 0이면 무음인 것을 확인한다. F-15(AC-05)의 "설정 초기화가 재생을 되살리지 않는다"는
// "초기화는 기본 볼륨(80)으로 되돌릴 뿐 재생 여부(play 호출)는 바꾸지 않는다"로 읽는다.
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

const { MUSIC_PLAYBACK_ENABLED } = await import("../../constants/bgmAssets.js")
const { useAudioControl } = await import("../useAudioControl.js")
const { useBgmAutoplay } = await import("../useBgmAutoplay.js")
const { useSettingsStore, buildDefaultSoundVolumes } = await import(
  "../../../domains/settings/store/settingsStore.js"
)

/** audio 요소가 실제로 소리를 낼 수 있었는지 추적하는 대역 — play()가 한 번이라도
 *  불렸는지, 최종 volume·muted가 무엇인지 본다. */
function createFakeMedia() {
  return {
    volume: 0.6,
    muted: false,
    playCallCount: 0,
    pauseCallCount: 0,
    play() {
      this.playCallCount += 1
      return Promise.resolve()
    },
    pause() {
      this.pauseCallCount += 1
    },
  }
}

test("MUSIC_PLAYBACK_ENABLED는 true다 — 2026-09-22 운영자 AUDIO-01 완화(라이선스 확인된 음원만)", async () => {
  assert.equal(MUSIC_PLAYBACK_ENABLED, true)
  const { BGM_ASSETS, BGM_LICENSES } = await import("../../constants/bgmAssets.js")
  assert.ok(BGM_LICENSES[BGM_ASSETS.loginMusic], "등록된 음원은 출처·라이선스 기록이 있어야 한다")
  assert.match(BGM_LICENSES[BGM_ASSETS.loginMusic].license, /CC0/)
})

function resetVolumes() {
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

test("페이지를 전환해(훅 재마운트, 새 audio 요소) 들어가면 새 요소로 다시 재생하고 이전 구독은 정리된다", () => {
  resetVolumes()
  const firstMedia = createFakeMedia()
  const first = renderHook(() => useBgmAutoplay({ current: firstMedia }))
  first.unmount()
  const nextMedia = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: nextMedia }))
  act(() => useSettingsStore.getState().setVolume("bgm-volume", 10))
  assert.equal(nextMedia.playCallCount, 1)
  assert.ok(Math.abs(nextMedia.volume - 0.1) < 1e-9)
  assert.ok(Math.abs(firstMedia.volume - 0.8) < 1e-9, "언마운트된 훅의 audio에는 더 이상 설정이 흘러가지 않는다")
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

// F-15(AC-05): 설정 초기화는 볼륨을 기본값으로 되돌릴 뿐, 재생을 새로 시작하지 않는다.
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

// 재생 경로의 마지막 조각 — 차단 중에는 audio 요소 자체를 렌더하지 않는다. 두 배경
// 컴포넌트를 마운트하려면 라우터·에셋 트리 전체를 끌고 와야 해서, 이 저장소의 기존
// 관례(routes/__tests__/podiumRoute.test.js)처럼 소스 배선을 직접 확인한다.
for (const relativePath of [
  "../../../domains/lobby/components/LobbyBackground.jsx",
  "../../../domains/auth/components/AuthScene/AuthBackgroundMedia.jsx",
]) {
  test(`${relativePath}는 MUSIC_PLAYBACK_ENABLED일 때만 audio 요소를 렌더한다`, () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")

    assert.match(
      source,
      /MUSIC_PLAYBACK_ENABLED \? \(\s*<audio/,
      "차단 중에도 audio 요소를 렌더하면 재생 경로가 남는다",
    )
  })
}

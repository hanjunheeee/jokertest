import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"

// F-15(AC-05): "설정 초기화 또는 페이지 전환 후에도 재생 중이던 음악이 다시 재생되지 않고
// 무음 상태가 유지된다." — 설정 store가 음악 차단 플래그를 갖고 있지 않다는 것만으로는
// 부족하다. 이 시험은 실제 재생 경로(useBgmAutoplay가 audio 요소에 하는 일, useAudioControl이
// 볼륨·음소거에 하는 일)를 직접 돌려서 무음이 유지되는지 확인한다.
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

test("MUSIC_PLAYBACK_ENABLED는 false다 — 이 슬라이스는 음악 차단 정책을 바꾸지 않는다", () => {
  assert.equal(MUSIC_PLAYBACK_ENABLED, false)
})

test("useBgmAutoplay는 차단 중일 때 재생을 시도하지 않고 audio를 음소거·정지시킨다", () => {
  const media = createFakeMedia()
  const audioRef = { current: media }

  renderHook(() => useBgmAutoplay(audioRef))

  assert.equal(media.playCallCount, 0, "play()가 불리면 소리가 날 수 있다")
  assert.equal(media.muted, true)
  assert.equal(media.volume, 0)
  assert.ok(media.pauseCallCount >= 1)
})

test("차단 중에는 화면을 클릭해도 음악이 다시 재생되지 않는다", () => {
  const media = createFakeMedia()
  const audioRef = { current: media }

  renderHook(() => useBgmAutoplay(audioRef))

  act(() => {
    window.dispatchEvent(new dom.window.Event("click"))
  })

  assert.equal(media.playCallCount, 0, "클릭 재시도 경로가 살아 있으면 안 된다")
  assert.equal(media.muted, true)
  assert.equal(media.volume, 0)
})

// 페이지 전환 = 이전 화면의 훅이 언마운트되고 다음 화면에서 새 audio 요소로 다시 마운트된다.
test("페이지를 전환해(훅 재마운트, 새 audio 요소) 들어가도 무음이 유지된다", () => {
  const first = renderHook(() => useBgmAutoplay({ current: createFakeMedia() }))
  first.unmount()

  const nextMedia = createFakeMedia()
  renderHook(() => useBgmAutoplay({ current: nextMedia }))

  assert.equal(nextMedia.playCallCount, 0)
  assert.equal(nextMedia.muted, true)
  assert.equal(nextMedia.volume, 0)
})

test("useAudioControl은 차단 중 audio 요소의 volume을 0, muted를 true로 고정한다", () => {
  const media = createFakeMedia()
  const audioRef = { current: media }

  const { result } = renderHook(() => useAudioControl(audioRef))

  assert.equal(media.volume, 0)
  assert.equal(media.muted, true)
  assert.equal(result.current.volume, 0)
  assert.equal(result.current.isSilent, true)
  assert.equal(result.current.disabled, true)
})

test("차단 중에는 볼륨을 올리거나 음소거를 풀어도 무음이 유지된다", () => {
  const media = createFakeMedia()
  const audioRef = { current: media }

  const { result } = renderHook(() => useAudioControl(audioRef))

  act(() => result.current.onVolumeChange(1))
  act(() => result.current.toggleMute())

  assert.equal(media.volume, 0, "볼륨 조작이 실제 재생 볼륨을 올리면 안 된다")
  assert.equal(media.muted, true)
  assert.equal(result.current.volume, 0)
  assert.equal(result.current.sliderValue, 0)
  assert.equal(result.current.isSilent, true)
})

// AC-05의 핵심: 설정 초기화는 볼륨을 기본값(최대 100 포함)으로 되돌리지만, 그 값이 실제
// 재생 경로로 흘러가 소리를 내지 않아야 한다.
test("설정 초기화로 볼륨이 기본값(최대 포함)으로 복원돼도 실제 재생은 무음이다", () => {
  const media = createFakeMedia()
  const audioRef = { current: media }

  const { result } = renderHook(() => useAudioControl(audioRef))

  act(() => {
    useSettingsStore.getState().setVolume("master-volume", 0)
    useSettingsStore.getState().resetSettings()
  })

  const restored = useSettingsStore.getState().volumes
  assert.deepEqual(restored, buildDefaultSoundVolumes())
  assert.ok(Math.max(...Object.values(restored)) > 0, "초기화는 볼륨 값 자체를 되살린다")

  assert.equal(media.volume, 0, "설정 볼륨이 audio 요소로 흘러가면 안 된다")
  assert.equal(media.muted, true)
  assert.equal(result.current.isSilent, true)
  assert.equal(media.playCallCount, 0)
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

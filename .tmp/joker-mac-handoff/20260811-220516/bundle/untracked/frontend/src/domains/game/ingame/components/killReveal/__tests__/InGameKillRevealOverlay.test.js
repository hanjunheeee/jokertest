import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
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

const { render } = await import("@testing-library/react")
const { default: InGameKillRevealOverlay } = await import("../InGameKillRevealOverlay.js")
const {
  INGAME_KILL_ANIMATION_VIDEO_URL,
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
} = await import("../../../constants/killReveal/ingameKillReveal.js")

// jsdom은 HTMLMediaElement.play()/pause()를 구현하지 않는다 — 실제 프로덕션 컴포넌트가 호출을
// 명시적으로 하는지, reject를 어떻게 다루는지 테스트에서 직접 제어할 수 있도록 대체한다.
let playCalls = 0
let playImpl = () => Promise.resolve()
Object.defineProperty(dom.window.HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value: function play() {
    playCalls += 1
    return playImpl()
  },
})
Object.defineProperty(dom.window.HTMLMediaElement.prototype, "pause", {
  configurable: true,
  writable: true,
  value: function pause() {},
})

function resetPlayMock() {
  playCalls = 0
  playImpl = () => Promise.resolve()
}

function renderOverlay(props) {
  return render(React.createElement(InGameKillRevealOverlay, props))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function findButtonByText(container, text) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent === text)
}

test("open이 false이거나 revealId가 없으면 아무 것도 렌더링하지 않는다(요구사항: no video)", () => {
  resetPlayMock()
  const a = renderOverlay({ open: false, revealId: "r1", message: null, onConsume: () => {} })
  assert.equal(a.container.querySelector("video"), null)
  a.unmount()

  const b = renderOverlay({ open: true, revealId: null, message: null, onConsume: () => {} })
  assert.equal(b.container.querySelector("video"), null)
  b.unmount()
})

test("실제 <video>를 INGAME_KILL_ANIMATION_VIDEO_URL로 렌더링하고 muted/playsinline/preload=auto를 갖는다", async () => {
  resetPlayMock()
  const { container, unmount } = renderOverlay({ open: true, revealId: "r1", message: "공개 문구", onConsume: () => {} })
  await flush()

  const video = container.querySelector("video")
  assert.notEqual(video, null, "production renderer는 실제 <video>를 포함해야 한다")
  assert.equal(video.getAttribute("src"), INGAME_KILL_ANIMATION_VIDEO_URL)
  assert.equal(video.muted, true)
  assert.equal(video.hasAttribute("playsinline"), true)
  assert.equal(video.getAttribute("preload"), "auto")
  assert.equal(container.querySelector("p")?.textContent, "공개 문구")
  unmount()
})

test("마운트되면 video.play()가 명시적으로 호출된다", async () => {
  resetPlayMock()
  const { unmount } = renderOverlay({ open: true, revealId: "r1", message: null, onConsume: () => {} })
  await flush()
  assert.equal(playCalls, 1)
  unmount()
})

test("ended 이벤트는 onConsume을 정확히 그 revealId로 한 번 호출한다", async () => {
  resetPlayMock()
  const consumed = []
  const { container, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: (id) => consumed.push(id),
  })
  await flush()

  act(() => {
    container.querySelector("video").dispatchEvent(new Event("ended"))
  })

  assert.deepEqual(consumed, ["r1"])
  unmount()
})

test("loadedmetadata/canplay/canplaythrough 이벤트로는 완료 처리하지 않는다", async () => {
  resetPlayMock()
  const consumed = []
  const { container, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: (id) => consumed.push(id),
  })
  await flush()

  const video = container.querySelector("video")
  for (const type of ["loadedmetadata", "canplay", "canplaythrough"]) {
    act(() => {
      video.dispatchEvent(new Event(type))
    })
  }

  assert.deepEqual(consumed, [])
  unmount()
})

test("play() 호출이 reject되면 오버레이는 떠 있는 채로 재시도 버튼이 나타나고, 클릭하면 play()를 다시 호출한다", async () => {
  resetPlayMock()
  playImpl = () => Promise.reject(new Error("NotAllowedError"))
  const consumed = []
  const { container, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: (id) => consumed.push(id),
  })
  await flush()

  assert.equal(playCalls, 1)
  const retryButton = findButtonByText(container, "다시 재생")
  assert.notEqual(retryButton, undefined, "재생이 막히면 재시도 버튼이 노출돼야 한다")
  assert.equal(findButtonByText(container, "건너뛰기"), undefined, "reject는 건너뛰기가 아니라 재시도다")
  assert.deepEqual(consumed, [], "재생 실패는 consume하지 않는다")

  playImpl = () => Promise.resolve()
  act(() => {
    retryButton.dispatchEvent(new Event("click", { bubbles: true }))
  })
  await flush()

  assert.equal(playCalls, 2, "재시도 버튼은 play()를 다시 호출해야 한다")
  unmount()
})

test("media error가 발생하면 오버레이는 떠 있는 채로 건너뛰기 버튼이 나타나고, 클릭하면 onConsume이 호출된다", async () => {
  resetPlayMock()
  const consumed = []
  const { container, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: (id) => consumed.push(id),
  })
  await flush()

  act(() => {
    container.querySelector("video").dispatchEvent(new Event("error"))
  })

  const skipButton = findButtonByText(container, "건너뛰기")
  assert.notEqual(skipButton, undefined)
  assert.deepEqual(consumed, [], "에러 직후에는 아직 소비되지 않는다 — 명시적 클릭이 필요하다")

  act(() => {
    skipButton.dispatchEvent(new Event("click", { bubbles: true }))
  })
  assert.deepEqual(consumed, ["r1"])
  unmount()
})

test("워치독 시간이 지나도 자동으로 소비하지 않고 건너뛰기 버튼만 노출한다(절대 조용히 넘어가지 않는다)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  resetPlayMock()
  playImpl = () => new Promise(() => {}) // 영원히 pending — ended도 reject도 오지 않는다
  const consumed = []
  const { container, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: (id) => consumed.push(id),
  })
  await flush()

  act(() => {
    t.mock.timers.tick(INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS - 1)
  })
  assert.equal(findButtonByText(container, "건너뛰기"), undefined, "워치독 시간 전에는 아직 건너뛰기가 없다")

  act(() => {
    t.mock.timers.tick(1)
  })
  const skipButton = findButtonByText(container, "건너뛰기")
  assert.notEqual(skipButton, undefined)
  assert.deepEqual(consumed, [], "워치독은 절대 조용히 소비하지 않는다")

  act(() => {
    skipButton.dispatchEvent(new Event("click", { bubbles: true }))
  })
  assert.deepEqual(consumed, ["r1"])
  unmount()
})

test("revealId가 바뀌면 다음 연출에서 play()를 다시 호출하고, 이전 reveal의 늦은 reject는 새 reveal 상태를 건드리지 않는다(stale 콜백 보호)", async () => {
  resetPlayMock()
  let rejectFirst
  const firstPlayPromise = new Promise((_, reject) => {
    rejectFirst = reject
  })
  playImpl = () => firstPlayPromise

  const { container, rerender, unmount } = renderOverlay({
    open: true,
    revealId: "r1",
    message: null,
    onConsume: () => {},
  })
  await flush()
  assert.equal(playCalls, 1)

  // r1의 play()가 아직 pending인 채로 r2로 넘어간다(큐가 이미 다음 항목을 승격한 상태를 흉내).
  playImpl = () => Promise.resolve()
  rerender(
    React.createElement(InGameKillRevealOverlay, {
      open: true,
      revealId: "r2",
      message: null,
      onConsume: () => {},
    }),
  )
  await flush()
  assert.equal(playCalls, 2, "새 revealId는 play()를 다시 호출해야 한다")

  // r1의 play()가 뒤늦게 reject된다 — r1 effect의 cleanup에서 이미 취소됐어야 하므로 r2에는
  // 아무 영향이 없어야 한다(재시도 버튼이 나타나면 안 된다).
  act(() => {
    rejectFirst(new Error("stale reject"))
  })
  await flush()

  assert.equal(findButtonByText(container, "다시 재생"), undefined, "이전 reveal의 늦은 reject가 새 reveal을 오염시키면 안 된다")
  unmount()
})

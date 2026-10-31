import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"
import { register } from "node:module"
import React from "react"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
installDomGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createRecordingCanvasContext(canvas) {
  const calls = { drawImage: [], getImageData: [], putImageData: [], createImageData: [] }
  return {
    canvas,
    calls,
    drawImage(...args) {
      calls.drawImage.push(args)
    },
    getImageData(x, y, w, h) {
      calls.getImageData.push([x, y, w, h])
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }
    },
    createImageData(w, h) {
      calls.createImageData.push([w, h])
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }
    },
    putImageData(imageData, x, y) {
      calls.putImageData.push([imageData, x, y])
    },
  }
}

let canvasContextFactory = (canvas) => createRecordingCanvasContext(canvas)
dom.window.HTMLCanvasElement.prototype.getContext = function fakeGetContext(type) {
  if (type !== "2d") return null
  return canvasContextFactory(this)
}
installDomGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement)

function resetCanvasContextFactory() {
  canvasContextFactory = (canvas) => createRecordingCanvasContext(canvas)
}

function installFakeVideoFrameCallback(win) {
  let nextHandle = 0
  const registered = new Map()
  const cancelled = new Set()
  win.HTMLVideoElement.prototype.requestVideoFrameCallback = function requestVideoFrameCallback(cb) {
    nextHandle += 1
    const handle = nextHandle
    registered.set(handle, { video: this, cb })
    return handle
  }
  win.HTMLVideoElement.prototype.cancelVideoFrameCallback = function cancelVideoFrameCallback(handle) {
    cancelled.add(handle)
  }
  return {
    registered,
    cancelled,
    latestHandle: () => nextHandle,
    invoke(handle) {
      const entry = registered.get(handle)
      if (!entry) return false
      entry.cb(0, {})
      return true
    },
    invokeLatest() {
      return this.invoke(nextHandle)
    },
  }
}
const videoFrameCallbacks = installFakeVideoFrameCallback(dom.window)
installDomGlobal("HTMLVideoElement", dom.window.HTMLVideoElement)

const defaultRequestAnimationFrame = globalThis.requestAnimationFrame
const defaultCancelAnimationFrame = globalThis.cancelAnimationFrame

register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `dummy-portrait-${index}`,
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead` : frameSrc),
    resolveAccountCardFrameSrc: () => null,
  },
})
let testSfxMix = { gain: 1, muted: false }
const testSfxMixListeners = new Set()
function setTestSfxMix(next) {
  testSfxMix = next
  for (const listener of [...testSfxMixListeners]) listener(testSfxMix)
}
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {},
    dispatchUiSfx: () => {},
    useSfxRuntime: () => {},
    getSfxMix: () => testSfxMix,
    subscribeSfxMix: (listener) => {
      testSfxMixListeners.add(listener)
      return () => testSfxMixListeners.delete(listener)
    },
  },
})
mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
mock.module("@/shared/api/client.js", {
  namedExports: {
    api: {
      get: async () => { throw new Error("network disabled in test") },
      post: async () => { throw new Error("network disabled in test") },
      put: async () => { throw new Error("network disabled in test") },
      patch: async () => { throw new Error("network disabled in test") },
      delete: async () => { throw new Error("network disabled in test") },
    },
    apiClient: async () => { throw new Error("network disabled in test") },
    refreshAccessToken: async () => { throw new Error("network disabled in test") },
  },
})

let currentSocket = null
const socketSubscribers = new Set()
mock.module("@/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => currentSocket,
    subscribeSocket: (cb) => { socketSubscribers.add(cb); return () => socketSubscribers.delete(cb) },
    setSocket: (next) => {
      currentSocket = next
      for (const cb of [...socketSubscribers]) cb()
    },
  },
})

const { renderHook, render, cleanup, fireEvent } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { useInGameStore } = await import("../store/ingameStore.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { setSocket } = await import("../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../hooks/useGameSessionSocketEvents.js")
const { useInGameNightSuccessPresentation } = await import("../hooks/useInGameNightSuccessPresentation.js")
const { default: InGameNightSuccessPresentation } = await import("../components/InGameNightSuccessPresentation.jsx")
const { resolveNightSuccessVideo } = await import("../utils/resolveNightSuccessVideo.js")
const { composeStackedAlpha } = await import("../utils/composeStackedAlpha.js")
const { SFX_MANIFEST } = await import("../../../../shared/audio/sfxManifest.js")

const NIGHT_SUCCESS_VIDEO = SFX_MANIFEST["night-success-video"].embeddedVideos

const GAME_ID = "game-night-success"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"

const ROSTER = [
  { uuid: SELF_UUID, nickname: "나", alive: true },
  { uuid: OTHER_UUID, nickname: "상대", alive: true },
]

function buildSelf() {
  return { uuid: SELF_UUID, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false }
}

function createFakeSocket({ id = "socket-1", connected = true } = {}) {
  const listeners = new Map()
  const emitted = []
  return {
    id,
    connected,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    emit(event, payload, callback) {
      emitted.push({ event, payload, callback })
      if (typeof callback === "function") callback({ ok: true, duplicate: false })
    },
    emitted,
    ackCallsFor(event) {
      return emitted.filter((entry) => entry.event === event)
    },
    timeout() { return this },
    emitWithAck() { return new Promise(() => {}) },
  }
}

function seedNightSession({ gameId = GAME_ID, dayIndex = 1 } = {}) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF_UUID, nickname: "나" }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0, nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId,
      state: {
        id: gameId, phase: "NIGHT", dayIndex, dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })), self: buildSelf(),
      },
    })
  })
}

function buildSuccessPayload({ type, eventId, nightDayIndex = 1, perspectives = ["USER"], targetId = OTHER_UUID }) {
  const payload = { gameId: GAME_ID, eventId, nightDayIndex, type, perspectives }
  if (perspectives.includes("USER")) payload.targetId = targetId
  return payload
}

function buildNightResultApplied({ dayIndex, selfAlive, victimUuid = null }) {
  return {
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex,
    players: [{ uuid: SELF_UUID, alive: selfAlive }, { uuid: OTHER_UUID, alive: true }],
    victimUuid,
  }
}

function buildNightTurnEndedPayload({ role, dayIndex = 1 }) {
  return { gameId: GAME_ID, dayIndex, role }
}

function useProductionTree({ hold = false } = {}) {
  useGameSessionSocketEvents()
  return useInGameNightSuccessPresentation({ hold })
}

function routerWrapper({ children }) {
  return React.createElement(MemoryRouter, null, children)
}

function openSession({ hold = false } = {}) {
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const rendered = renderHook((props) => useProductionTree(props), {
    initialProps: { hold },
    wrapper: routerWrapper,
  })
  return {
    socket,
    get value() { return rendered.result.current },
    rerender: rendered.rerender,
    deliver(event, payload) { act(() => socket.deliver(event, payload)) },
    finish(outcome) { act(() => rendered.result.current.finish(outcome)) },
    close() {
      rendered.unmount()
      act(() => setSocket(null))
    },
  }
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  setTestSfxMix({ gain: 1, muted: false })
  resetCanvasContextFactory()
  installDomGlobal("requestAnimationFrame", defaultRequestAnimationFrame)
  installDomGlobal("cancelAnimationFrame", defaultCancelAnimationFrame)
})

test("AC-01: night_action_success 네 건이 광대(KILL)→의사(HEAL)→경비원(INVESTIGATE)→마녀사냥꾼(CONFIRM) 순서로 하나씩만 노출된다", () => {
  seedNightSession()
  const session = openSession()

  assert.equal(session.value.current, null)

  const order = ["KILL", "HEAL", "INVESTIGATE", "CONFIRM"]
  order.forEach((type, index) => {
    session.deliver("night_action_success", buildSuccessPayload({ type, eventId: `e${index + 1}` }))
  })

  assert.equal(session.value.current.type, "KILL")
  assert.equal(session.value.current.eventId, "e1")
  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 4)

  for (let i = 0; i < order.length; i += 1) {
    assert.equal(session.value.current.type, order[i], `${i}번째 선두가 기대한 순서와 다르다`)
    session.finish("COMPLETED")
  }
  assert.equal(session.value.current, null, "큐를 다 소비한 뒤에는 현재 사건이 없어야 한다")

  session.close()
})

test("AC-03: 완료·오류·건너뛰기가 사건마다 정확히 한 번씩 서버에 보고되고, 반복 호출·옛 콜백은 noop이다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "e1" }))
  session.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "e2" }))
  session.deliver("night_action_success", buildSuccessPayload({ type: "INVESTIGATE", eventId: "e3" }))
  session.deliver("night_action_success", buildSuccessPayload({ type: "CONFIRM", eventId: "e4" }))

  const killFinish = session.value.finish
  session.finish("COMPLETED")
  assert.equal(session.value.current.type, "HEAL", "e1이 끝났으니 HEAL이 선두여야 한다")

  const ackCalls = session.socket.ackCallsFor("acknowledge_night_action_success")
  assert.equal(ackCalls.length, 1)
  assert.deepEqual(ackCalls[0].payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "e1" })

  act(() => killFinish("COMPLETED"))
  assert.equal(session.socket.ackCallsFor("acknowledge_night_action_success").length, 1, "옛 콜백이 새 ACK를 만들었다")
  assert.equal(session.value.current.type, "HEAL", "옛 콜백이 다음 사건을 건드렸다")

  const healFinish = session.value.finish
  act(() => healFinish("COMPLETED"))
  act(() => healFinish("COMPLETED"))
  assert.equal(session.socket.ackCallsFor("acknowledge_night_action_success").length, 2)
  assert.deepEqual(
    session.socket.ackCallsFor("acknowledge_night_action_success")[1].payload,
    { gameId: GAME_ID, nightDayIndex: 1, eventId: "e2" },
  )

  assert.equal(session.value.current.type, "INVESTIGATE")
  session.finish("ERROR")
  const errorAck = session.socket.ackCallsFor("acknowledge_night_action_success")[2]
  assert.deepEqual(errorAck.payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "e3", outcome: "ERROR" })

  assert.equal(session.value.current.type, "CONFIRM")
  session.finish("SKIPPED")
  const skipAck = session.socket.ackCallsFor("acknowledge_night_action_success")[3]
  assert.deepEqual(skipAck.payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "e4", outcome: "SKIPPED" })

  assert.equal(session.socket.ackCallsFor("acknowledge_night_action_success").length, 4, "사건 네 개에 ACK 네 개여야 한다")

  session.close()
})

test("중복 도착한 같은 eventId는 큐에 다시 들어가지 않는다", () => {
  seedNightSession()
  const session = openSession()

  const payload = buildSuccessPayload({ type: "KILL", eventId: "e1" })
  session.deliver("night_action_success", payload)
  session.deliver("night_action_success", payload)
  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 1, "같은 eventId가 두 번 큐에 들어갔다")

  session.close()
})

test("AC-04: 전용 영상이 없는 HEAL·INVESTIGATE·CONFIRM은 assetStatus가 계속 PENDING이고, 확인해도 검증 완료로 바뀌지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "e1" }))
  assert.equal(session.value.assetStatus, "AVAILABLE", "KILL-USER은 선택표에 영상이 있으므로 AVAILABLE이어야 한다")
  session.finish("COMPLETED")

  session.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "e2" }))
  assert.equal(session.value.assetStatus, "AVAILABLE", "HEAL-USER도 선택표에 영상이 있다")
  session.finish("COMPLETED")

  session.deliver("night_action_success",
    buildSuccessPayload({ type: "INVESTIGATE", eventId: "e3", perspectives: ["TARGET"] }))
  assert.equal(session.value.assetStatus, "PENDING")
  session.finish("COMPLETED")
  assert.equal(session.value.current, null)

  session.close()
})

test("AC-02: 광대 킬 뒤 의사 치료가 모두 finish된 뒤에도, 같은 밤의 night_result_applied가 반영되기 전에는 최종 생존 상태가 뜨지 않는다(후행 도착)", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "k1", perspectives: ["TARGET"] }))
  session.finish("COMPLETED")
  session.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "h1", perspectives: ["TARGET"] }))
  session.finish("COMPLETED")

  assert.equal(session.value.current, null, "두 연출이 모두 끝나 큐는 비어 있어야 한다")
  assert.equal(session.value.finalStatus, null, "서버의 최종 결과가 아직 도착하지 않았다")

  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 2, selfAlive: true }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true })

  session.close()
})

test("AC-02: night_result_applied가 먼저 도착해도, 큐가 다 비기 전에는 최종 생존 상태가 뜨지 않는다(선행 도착)", () => {
  seedNightSession({ dayIndex: 5 })
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "k2", nightDayIndex: 5, perspectives: ["TARGET"] }))
  session.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "h2", nightDayIndex: 5, perspectives: ["TARGET"] }))

  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 6, selfAlive: false, victimUuid: SELF_UUID }))
  assert.equal(session.value.finalStatus, null, "KILL 연출도 아직 끝나지 않았다")

  session.finish("COMPLETED")
  assert.equal(session.value.finalStatus, null, "HEAL 연출이 아직 남아 있다")

  session.finish("COMPLETED")
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: false })

  session.close()
})

test("AC-02(CODEX 반려 수정): KILL만 finish된 채 DAY 결과가 먼저 반영되면, DOCTOR의 턴 종료 전까지 최종 상태를 보여주지 않는다", () => {
  seedNightSession({ dayIndex: 7 })
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "k3", nightDayIndex: 7, perspectives: ["TARGET"] }))
  session.finish("COMPLETED")
  assert.equal(session.value.current, null, "KILL만 있었으니 큐는 이미 비어 있다")

  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 8, selfAlive: true }))
  assert.equal(
    session.value.finalStatus, null,
    "HEAL이 finish되지도, DOCTOR 턴 종료로 '더 오지 않는다'가 확인되지도 않았는데 최종 상태가 떴다",
  )

  session.deliver("night_turn_ended", buildNightTurnEndedPayload({ role: "DOCTOR", dayIndex: 7 }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true })

  session.close()
})

test("AC-03(CODEX 반려 수정): 옛 최종 표시의 늦은 onClose는 그 뒤에 세워진 새 최종 표시를 지우지 않는다", () => {
  seedNightSession({ dayIndex: 3 })
  const session = openSession()

  session.deliver("night_action_success",
    buildSuccessPayload({ type: "KILL", eventId: "k-final-1", nightDayIndex: 3, perspectives: ["TARGET"] }))
  session.finish("COMPLETED")
  session.deliver("night_turn_ended", buildNightTurnEndedPayload({ role: "DOCTOR", dayIndex: 3 }))
  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 4, selfAlive: true }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true },
    "전제: 첫 최종 표시가 떠야 한다")

  const staleClose = session.value.onClose

  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID, phase: "NIGHT", dayIndex: 5, dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })), self: buildSelf(),
      },
    })
  })
  session.deliver("night_action_success",
    buildSuccessPayload({ type: "KILL", eventId: "k-final-2", nightDayIndex: 5, perspectives: ["TARGET"] }))
  assert.equal(session.value.current?.eventId, "k-final-2", "전제: 다음 밤의 사건이 큐에 들어와야 한다")
  session.finish("COMPLETED")
  session.deliver("night_turn_ended", buildNightTurnEndedPayload({ role: "DOCTOR", dayIndex: 5 }))
  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 6, selfAlive: true }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true },
    "전제: 새 최종 표시가 떠 있어야 한다")

  act(() => staleClose())
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true },
    "옛 onClose가 새 최종 표시를 지웠다")

  act(() => session.value.onClose())
  assert.equal(session.value.finalStatus, null, "현재 표시의 확인이 최종 화면을 닫지 못했다")

  session.close()
})

test("hold가 걸린 동안에는 표시하지 않되 큐·최종 상태는 그대로 보존한다", () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const rendered = renderHook((props) => useProductionTree(props), {
    initialProps: { hold: true },
    wrapper: routerWrapper,
  })

  act(() => socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "e1" })))
  assert.equal(rendered.result.current.open, false, "hold 중에는 열리면 안 된다")
  assert.equal(rendered.result.current.current?.eventId, "e1", "hold 중에도 큐 내용 자체는 유지돼야 한다")

  rendered.rerender({ hold: false })
  assert.equal(rendered.result.current.open, true, "hold가 풀리면 보존된 사건이 그대로 열려야 한다")

  rendered.unmount()
  act(() => setSocket(null))
})

function renderPresentation(props) {
  return render(React.createElement(InGameNightSuccessPresentation, props))
}

const flushMicrotasks = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test("AC-05: KILL 사건은 기존 사망 연출과 같은 영상을 재생하고, 종료·오류·건너뛰기를 구분해 보고한다 — 먼저 일어난 종료 하나만 보고된다", async () => {
  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function spyPlay(...args) {
    playCalls.push(this)
    return originalPlay.apply(this, args)
  }

  const finishes = []
  const { container, unmount } = renderPresentation({
    current: { eventId: "k1", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    assert.notEqual(video, null, "KILL은 <video>를 마운트해야 한다")
    assert.equal(video.getAttribute("src"), NIGHT_SUCCESS_VIDEO["KILL-USER"], "KILL-USER 선택표 영상과 같은 URL이어야 한다")

    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "마운트 뒤 한 틱 안에 play()를 정확히 한 번 호출해야 한다")
    assert.equal(playCalls[0], video)

    fireEvent(video, new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"])

    fireEvent(video, new dom.window.Event("error"))
    assert.deepEqual(finishes, ["COMPLETED"], "이미 종료된 사건에 뒤이은 media error가 다시 보고됐다")
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  }
})

test("AC-02(CODEX 반려 수정): React StrictMode 이중 마운트에서도 play()는 정확히 한 번만 불리고, 같은 사건 재전달·리렌더에도 늘지 않으며 완료 ACK도 한 번이다", async () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const receiver = renderHook(() => useGameSessionSocketEvents(), { wrapper: routerWrapper })

  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function spyPlay(...args) {
    playCalls.push(this)
    return originalPlay.apply(this, args)
  }

  let view
  try {
    act(() => socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "strict-kill" })))
    assert.equal(useInGameStore.getState().nightSuccessQueue.length, 1, "전제: 큐에 사건 하나가 있어야 한다")

    view = render(
      React.createElement(React.StrictMode, null, React.createElement(InGameNightSuccessPresentation, null)),
    )
    await flushMicrotasks()
    const video = view.container.querySelector("video")
    assert.notEqual(video, null, "StrictMode 아래서도 영상이 마운트돼야 한다")
    assert.equal(playCalls.length, 1, "StrictMode의 setup→cleanup→setup에서 play()가 두 번 이상 불렸다")

    act(() => socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "strict-kill" })))
    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "같은 사건의 재전달이 play()를 다시 불렀다")

    act(() => view.rerender(
      React.createElement(React.StrictMode, null, React.createElement(InGameNightSuccessPresentation, null)),
    ))
    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "리렌더가 play()를 다시 불렀다")

    act(() => { fireEvent(video, new dom.window.Event("ended")) })
    const acks = socket.ackCallsFor("acknowledge_night_action_success")
    assert.equal(acks.length, 1, "완료 보고(ACK)가 정확히 한 번이 아니다")
  } finally {
    view?.unmount()
    receiver.unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
    act(() => setSocket(null))
  }
})

function withRejectingPlay(errorName, fn) {
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function rejectingPlay() {
    const err = new Error(errorName)
    err.name = errorName
    return Promise.reject(err)
  }
  return Promise.resolve(fn()).finally(() => {
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  })
}

test("AC-03(CODEX 반려 수정): 자동재생 차단(NotAllowedError)은 재시도 화면만 보여주고 아직 보고하지 않는다", async () => {
  const finishes = []
  await withRejectingPlay("NotAllowedError", async () => {
    const { container, unmount } = renderPresentation({
      current: { eventId: "k-autoplay", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      await flushMicrotasks()
      const retrySurface = container.querySelector("[data-ingame-kill-reveal-retry]")
      assert.notEqual(retrySurface, null, "자동재생 차단은 패널을 눌러 다시 재생하는 표면을 보여줘야 한다")
      assert.equal([...container.querySelectorAll("button")].some((b) => b.textContent.trim() === "다시 재생"), false,
        "별도 '다시 재생' 버튼은 그리지 않는다(운영자 UI 결정 2026-09-22)")
      assert.deepEqual(finishes, [], "재시도 화면만으로는 아직 아무것도 보고하면 안 된다")
    } finally {
      unmount()
    }
  })
})

test("AC-03(CODEX 반려 수정): 자동재생 차단이 아닌 재생 실패(예: NotSupportedError)는 ERROR로 한 번 보고하고 넘어간다", async () => {
  const finishes = []
  await withRejectingPlay("NotSupportedError", async () => {
    const { container, unmount } = renderPresentation({
      current: { eventId: "k-decode-fail", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      await flushMicrotasks()
      assert.deepEqual(finishes, ["ERROR"], "자동재생 차단이 아닌 재생 실패는 재시도로 묶지 않고 바로 ERROR로 보고해야 한다")
      assert.equal(container.querySelector("[data-ingame-kill-reveal-retry]"), null,
        "재시도로 풀리지 않는 실패인데 재시도 표면을 보여주면 안 된다")
    } finally {
      unmount()
    }
  })
})

test("AC-03(CODEX 반려 수정): 재시도 화면에서 건너뛰기를 누르면 SKIPPED로 한 번 보고된다", async () => {
  const finishes = []
  await withRejectingPlay("NotAllowedError", async () => {
    const { container, unmount } = renderPresentation({
      current: { eventId: "k-skip-from-retry", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      await flushMicrotasks()
      const skipButton = [...container.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "건너뛰기")
      assert.notEqual(skipButton, null, "자동재생 차단 화면에도 건너뛰기가 있어야 막히지 않는다")
      fireEvent.click(skipButton)
      assert.deepEqual(finishes, ["SKIPPED"])
    } finally {
      unmount()
    }
  })
})

test("AC-05: 유음 재생 거절(NotAllowedError) → 무음 재생 성공 → COMPLETED 1회, 그 뒤 음량 설정을 바꿔도 그 재생은 무음을 유지한다", async () => {
  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function maybeBlockedPlay() {
    playCalls.push({ muted: this.muted })
    if (playCalls.length === 1) {
      const err = new Error("NotAllowedError")
      err.name = "NotAllowedError"
      return Promise.reject(err)
    }
    return Promise.resolve()
  }
  setTestSfxMix({ gain: 1, muted: false })

  const finishes = []
  const { container, unmount } = renderPresentation({
    current: { eventId: "k-silent-retry", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    await flushMicrotasks()
    assert.equal(playCalls.length, 2, "유음 거절 뒤 무음으로 정확히 한 번만 재시도해야 한다")
    assert.equal(playCalls[0].muted, false, "첫 시도는 유음(mix.muted=false)으로 걸려야 한다")
    assert.equal(playCalls[1].muted, true, "무음 재시도는 muted=true로 걸려야 한다")
    assert.equal(video.muted, true, "무음 재시도 성공 뒤 video가 무음 상태여야 한다")
    assert.deepEqual(finishes, [], "무음 재시도 성공만으로는 아직 아무것도 보고하면 안 된다(ACK 없이 계속 보여준다)")

    fireEvent(video, new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"], "무음 재생이 끝나면 COMPLETED가 정확히 한 번 보고돼야 한다")

    act(() => setTestSfxMix({ gain: 1, muted: false }))
    assert.equal(video.muted, true, "설정을 유음으로 바꿨는데 무음 latch가 선 재생이 다시 유음이 됐다")
    assert.deepEqual(finishes, ["COMPLETED"], "설정 변경이 추가 보고를 만들었다")
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
    setTestSfxMix({ gain: 1, muted: false })
  }
})

test("AC-01/AC-04: 전용 영상이 없는 TARGET 조합(INVESTIGATE-TARGET·CONFIRM-TARGET)은 '자료 대기' 임시 연출을 보여주고, 확인은 COMPLETED·건너뛰기는 SKIPPED로 각각 끝내며 USER 자산 경로를 요청하지 않는다", () => {
  for (const [type, roleLabel] of [["INVESTIGATE", "경비원"], ["CONFIRM", "마녀사냥꾼"]]) {
    const finishes = []
    const { container, unmount } = renderPresentation({
      current: { eventId: `pending-${type}`, type, gameId: GAME_ID, nightDayIndex: 1, perspectives: ["TARGET"] },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "PENDING",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      assert.equal(container.querySelector("video"), null, `${type}-TARGET 화면에 영상을 그리면 안 된다`)
      assert.equal(container.textContent.includes("자료 대기"), true, `${type} 화면에 '자료 대기' 문구가 없다`)
      assert.equal(container.textContent.includes(roleLabel), false, `${type}-TARGET 화면에 역할명(${roleLabel})이 노출됐다`)
      assert.equal(
        container.innerHTML.includes(NIGHT_SUCCESS_VIDEO[`${type}-USER`]),
        false,
        `${type}-TARGET 화면이 USER 자산 경로(${NIGHT_SUCCESS_VIDEO[`${type}-USER`]})를 참조했다`,
      )

      const confirmButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인")
      assert.notEqual(confirmButton, null)
      fireEvent.click(confirmButton)
      assert.deepEqual(finishes, ["COMPLETED"], "확인은 COMPLETED로 보고돼야 한다")
    } finally {
      unmount()
    }
  }
})

test("AC-04: 임시 연출을 backdrop/Escape로 닫으면 SKIPPED로 보고된다", () => {
  const finishes = []
  const { container, unmount } = renderPresentation({
    current: { eventId: "pending-investigate", type: "INVESTIGATE", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["TARGET"] },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "PENDING",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    fireEvent.keyDown(dom.window, { key: "Escape" })
    assert.deepEqual(finishes, ["SKIPPED"])
  } finally {
    unmount()
  }
})

function createControlledFrameContext(canvas, { colorPixels, maskPixels }) {
  const calls = { drawImage: [], getImageData: [], putImageData: [], createImageData: [] }
  return {
    canvas,
    calls,
    drawImage(...args) {
      calls.drawImage.push(args)
    },
    getImageData(x, y, w, h) {
      calls.getImageData.push([x, y, w, h])
      const source = y === 0 ? colorPixels : maskPixels
      return { data: Uint8ClampedArray.from(source), width: w, height: h }
    },
    createImageData(w, h) {
      calls.createImageData.push([w, h])
      return { data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4), width: w, height: h }
    },
    putImageData(imageData, x, y) {
      calls.putImageData.push([imageData, x, y])
    },
  }
}

test("AC-02: 프레임 합성이 색·마스크 절반을 실제로 읽어 알파를 채운 픽셀을 표시 canvas에 그린다", async () => {
  const colorPixels = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255])
  const maskPixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
  const expected = composeStackedAlpha(colorPixels, maskPixels)

  const contexts = []
  canvasContextFactory = (canvas) => {
    const ctx = createControlledFrameContext(canvas, { colorPixels, maskPixels })
    contexts.push(ctx)
    return ctx
  }

  const { container, unmount } = renderPresentation({
    current: { eventId: "compose-1", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: () => {},
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    await flushMicrotasks()
    Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
    Object.defineProperty(video, "videoHeight", { value: 2, configurable: true })
    Object.defineProperty(video, "readyState", { value: 2, configurable: true })

    videoFrameCallbacks.invokeLatest()

    const [displayCtx, workCtx] = contexts
    assert.equal(workCtx.calls.drawImage.length, 1, "작업용 canvas가 영상 프레임을 그리지 않았다")
    assert.deepEqual(workCtx.calls.drawImage[0].slice(1), [0, 0, 2, 2], "drawImage 좌표·크기가 영상 전체와 다르다")
    assert.deepEqual(
      workCtx.calls.getImageData, [[0, 0, 2, 1], [0, 1, 2, 1]],
      "색(위 절반)·마스크(아래 절반) crop 좌표가 다르다",
    )

    const displayCanvas = container.querySelector("canvas")
    assert.equal(displayCanvas.width, 2, "표시 canvas 폭이 영상 폭과 달라야 한다")
    assert.equal(displayCanvas.height, 1, "표시 canvas 높이가 영상 높이의 절반과 달라야 한다")

    assert.equal(displayCtx.calls.putImageData.length, 1, "표시 canvas에 합성 결과를 그리지 않았다")
    const [outImage, px, py] = displayCtx.calls.putImageData[0]
    assert.deepEqual(Array.from(outImage.data), Array.from(expected), "합성 결과가 composeStackedAlpha 출력과 다르다")
    assert.equal(px, 0)
    assert.equal(py, 0)
  } finally {
    unmount()
    resetCanvasContextFactory()
  }
})

test("AC-03: canvas는 화면에 렌더되고 video는 DOM에 있되 숨김 스타일이며, 메타데이터 전에는 픽셀을 읽지 않는다", async () => {
  const contexts = []
  canvasContextFactory = (canvas) => {
    const ctx = createRecordingCanvasContext(canvas)
    contexts.push(ctx)
    return ctx
  }
  const { container, unmount } = renderPresentation({
    current: { eventId: "hidden-video", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: () => {},
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    const canvasEl = container.querySelector("canvas")
    assert.notEqual(video, null, "video가 DOM에 있어야 한다")
    assert.notEqual(canvasEl, null, "canvas가 DOM에 있어야 한다")
    assert.equal(video.style.display, "none", "video는 화면에 보이면 안 된다")
    assert.equal(video.getAttribute("aria-hidden"), "true")

    await flushMicrotasks()
    videoFrameCallbacks.invokeLatest()
    const [, workCtxBefore] = contexts
    assert.equal(workCtxBefore.calls.getImageData.length, 0, "메타데이터 전인데 픽셀을 읽었다")

    Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
    Object.defineProperty(video, "videoHeight", { value: 4, configurable: true })
    Object.defineProperty(video, "readyState", { value: 2, configurable: true })
    videoFrameCallbacks.invokeLatest()
    assert.equal(canvasEl.width, 2)
    assert.equal(canvasEl.height, 2)
    assert.deepEqual(workCtxBefore.calls.getImageData, [[0, 0, 2, 2], [0, 2, 2, 2]])
  } finally {
    unmount()
    resetCanvasContextFactory()
  }
})

test("AC-03: 유효한 높이가 홀수이면 ERROR로 끝난다", async () => {
  const finishes = []
  const { container, unmount } = renderPresentation({
    current: { eventId: "odd-height", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    await flushMicrotasks()
    Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
    Object.defineProperty(video, "videoHeight", { value: 3, configurable: true })
    Object.defineProperty(video, "readyState", { value: 2, configurable: true })
    videoFrameCallbacks.invokeLatest()
    assert.deepEqual(finishes, ["ERROR"], "홀수 높이가 ERROR로 끝나지 않았다")
  } finally {
    unmount()
  }
})

test("AC-04: 언마운트가 프레임 예약을 취소하고, 취소된 콜백을 늦게 강제로 실행해도 추가 draw·보고가 없다", async () => {
  const contexts = []
  canvasContextFactory = (canvas) => {
    const ctx = createRecordingCanvasContext(canvas)
    contexts.push(ctx)
    return ctx
  }
  const finishes = []
  const { container, unmount } = renderPresentation({
    current: { eventId: "cancel-unmount", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  const video = container.querySelector("video")
  await flushMicrotasks()
  Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
  Object.defineProperty(video, "videoHeight", { value: 2, configurable: true })
  Object.defineProperty(video, "readyState", { value: 2, configurable: true })

  const handleBeforeUnmount = videoFrameCallbacks.latestHandle()
  unmount()
  assert.ok(videoFrameCallbacks.cancelled.has(handleBeforeUnmount), "언마운트가 예약된 프레임 콜백을 취소하지 않았다")

  const [, workCtx] = contexts
  const drawsBefore = workCtx.calls.drawImage.length
  videoFrameCallbacks.invoke(handleBeforeUnmount)
  assert.equal(workCtx.calls.drawImage.length, drawsBefore, "취소된 콜백이 추가 draw를 만들었다")
  assert.deepEqual(finishes, [], "취소된 콜백이 추가 종료 보고를 만들었다")
  resetCanvasContextFactory()
})

test("AC-04: 다음 사건으로 전환되면 이전 프레임 예약이 취소되고 새 사건에 새 예약이 걸린다", async () => {
  const { rerender, unmount } = renderPresentation({
    current: { eventId: "trans-1", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true, finish: () => {}, assetStatus: "AVAILABLE", finalStatus: null, onClose: () => {},
  })
  try {
    await flushMicrotasks()
    const handleForFirst = videoFrameCallbacks.latestHandle()

    act(() => {
      rerender(React.createElement(InGameNightSuccessPresentation, {
        current: { eventId: "trans-2", type: "HEAL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
        open: true, finish: () => {}, assetStatus: "AVAILABLE", finalStatus: null, onClose: () => {},
      }))
    })
    await flushMicrotasks()

    assert.ok(videoFrameCallbacks.cancelled.has(handleForFirst), "다음 사건으로 전환됐는데 이전 프레임 예약이 취소되지 않았다")
    const handleForSecond = videoFrameCallbacks.latestHandle()
    assert.notEqual(handleForSecond, handleForFirst, "새 사건에 새 프레임 예약이 걸리지 않았다")
  } finally {
    unmount()
  }
})

test("AC-04: requestVideoFrameCallback이 없으면 requestAnimationFrame으로 실제 프레임 합성·재예약이 동작하고, cleanup 뒤 늦은 콜백은 그리지도 재예약하지도 않는다", async () => {
  const rafHandles = []
  const cancelledRafHandles = []
  let nextRafHandle = 0
  installDomGlobal("requestAnimationFrame", (cb) => {
    nextRafHandle += 1
    rafHandles.push({ handle: nextRafHandle, cb })
    return nextRafHandle
  })
  installDomGlobal("cancelAnimationFrame", (handle) => {
    cancelledRafHandles.push(handle)
  })

  const contexts = []
  canvasContextFactory = (canvas) => {
    const ctx = createRecordingCanvasContext(canvas)
    contexts.push(ctx)
    return ctx
  }

  const { container, unmount } = renderPresentation({
    current: { eventId: "raf-fallback", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true, finish: () => {}, assetStatus: "AVAILABLE", finalStatus: null, onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    Object.defineProperty(video, "requestVideoFrameCallback", { value: undefined, configurable: true })
    Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
    Object.defineProperty(video, "videoHeight", { value: 2, configurable: true })
    Object.defineProperty(video, "readyState", { value: 2, configurable: true })
    await flushMicrotasks()
    assert.ok(rafHandles.length >= 1, "requestVideoFrameCallback이 없으면 requestAnimationFrame으로 예약해야 한다")

    const [, workCtx] = contexts
    const rafCountBeforeDraw = rafHandles.length
    const firstEntry = rafHandles[rafHandles.length - 1]
    act(() => { firstEntry.cb(0) })
    assert.equal(workCtx.calls.drawImage.length, 1, "저장된 requestAnimationFrame 콜백을 실행해도 합성 그리기(drawImage)가 일어나지 않았다")
    assert.equal(rafHandles.length, rafCountBeforeDraw + 1, "프레임 합성 뒤 다음 requestAnimationFrame이 재예약되지 않았다")

    const rafCountAfterDraw = rafHandles.length
    const lastEntry = rafHandles[rafHandles.length - 1]
    const lastHandle = lastEntry.handle
    unmount()
    assert.ok(cancelledRafHandles.includes(lastHandle), "언마운트가 requestAnimationFrame 예약을 취소하지 않았다")

    const drawsAfterUnmount = workCtx.calls.drawImage.length
    act(() => { lastEntry.cb(0) })
    assert.equal(workCtx.calls.drawImage.length, drawsAfterUnmount, "cleanup 뒤 늦게 실행된 콜백이 추가로 그렸다")
    assert.equal(rafHandles.length, rafCountAfterDraw, "cleanup 뒤 늦게 실행된 콜백이 다음 프레임을 재예약했다")
  } finally {
    installDomGlobal("requestAnimationFrame", defaultRequestAnimationFrame)
    installDomGlobal("cancelAnimationFrame", defaultCancelAnimationFrame)
    resetCanvasContextFactory()
  }
})

test("AC-05: canvas 2D 컨텍스트 획득이 null이거나 던지면 ERROR가 사건당 정확히 한 번 보고된다", async () => {
  for (const factory of [() => null, () => { throw new Error("boom") }]) {
    canvasContextFactory = factory
    const finishes = []
    const { unmount } = renderPresentation({
      current: { eventId: `ctx-fail-${finishes.length}`, type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      await flushMicrotasks()
      assert.deepEqual(finishes, ["ERROR"], "canvas 컨텍스트 획득 실패가 ERROR로 보고되지 않았다")
    } finally {
      unmount()
      resetCanvasContextFactory()
    }
  }
})

test("AC-05(CODEX 반려 수정): StrictMode의 setup→cleanup→setup에서도 canvas 컨텍스트 획득 실패는 사건당 정확히 한 번만 ERROR로 보고된다", async () => {
  canvasContextFactory = () => null
  const finishes = []
  const { unmount } = render(
    React.createElement(React.StrictMode, null, React.createElement(InGameNightSuccessPresentation, {
      current: { eventId: "strict-ctx-fail", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })),
  )
  try {
    await flushMicrotasks()
    assert.deepEqual(finishes, ["ERROR"], "StrictMode 이중 마운트에서 canvas 컨텍스트 실패가 사건당 정확히 한 번 보고되지 않았다")
  } finally {
    unmount()
    resetCanvasContextFactory()
  }
})

test("AC-05: drawImage·getImageData·putImageData 중 하나라도 던지면 ERROR가 한 번만 보고되고, 이후 늦은 콜백은 무시된다", async () => {
  for (const failing of ["drawImage", "getImageData", "putImageData"]) {
    const contexts = []
    canvasContextFactory = (canvas) => {
      const ctx = createRecordingCanvasContext(canvas)
      ctx[failing] = () => { throw new Error(`${failing} 실패`) }
      contexts.push(ctx)
      return ctx
    }
    const finishes = []
    const { container, unmount } = renderPresentation({
      current: { eventId: `fail-${failing}`, type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "AVAILABLE",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      const video = container.querySelector("video")
      await flushMicrotasks()
      Object.defineProperty(video, "videoWidth", { value: 2, configurable: true })
      Object.defineProperty(video, "videoHeight", { value: 2, configurable: true })
      Object.defineProperty(video, "readyState", { value: 2, configurable: true })

      const failingHandle = videoFrameCallbacks.latestHandle()
      videoFrameCallbacks.invoke(failingHandle)
      assert.deepEqual(finishes, ["ERROR"], `${failing} 실패가 ERROR로 보고되지 않았다`)

      videoFrameCallbacks.invoke(failingHandle)
      assert.deepEqual(finishes, ["ERROR"], `${failing} 실패 뒤 늦은 콜백이 추가로 보고했다`)
    } finally {
      unmount()
      resetCanvasContextFactory()
    }
  }
})

const EXPECTED_NIGHT_SUCCESS_VIDEO_URLS = Object.freeze({
  "KILL-USER": "/video-direction/night-success-kill-user-stacked.mp4",
  "KILL-TARGET": "/video-direction/night-success-kill-target-stacked.mp4",
  "HEAL-USER": "/video-direction/night-success-heal-stacked.mp4",
  "HEAL-TARGET": "/video-direction/night-success-heal-stacked.mp4",
  "INVESTIGATE-USER": "/video-direction/night-success-investigate-user-stacked.mp4",
  "CONFIRM-USER": "/video-direction/night-success-confirm-user-stacked.mp4",
})

test("AC-01: 사건 type과 관점 8가지 조합 각각에서 §2-5 선택표대로 자산 경로가 선택된다", () => {
  const COMBINATIONS = [
    { type: "KILL", perspectives: ["USER"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["KILL-USER"] },
    { type: "KILL", perspectives: ["TARGET"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["KILL-TARGET"] },
    { type: "HEAL", perspectives: ["USER"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["HEAL-USER"] },
    { type: "HEAL", perspectives: ["TARGET"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["HEAL-TARGET"] },
    { type: "INVESTIGATE", perspectives: ["USER"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["INVESTIGATE-USER"] },
    { type: "INVESTIGATE", perspectives: ["TARGET"], expectSrc: null },
    { type: "CONFIRM", perspectives: ["USER"], expectSrc: EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["CONFIRM-USER"] },
    { type: "CONFIRM", perspectives: ["TARGET"], expectSrc: null },
  ]

  for (const { type, perspectives, expectSrc } of COMBINATIONS) {
    const entry = { eventId: `combo-${type}-${perspectives.join("")}`, type, gameId: GAME_ID, nightDayIndex: 1, perspectives }
    const resolved = resolveNightSuccessVideo(entry)
    assert.equal(resolved?.src ?? null, expectSrc, `${type}-${perspectives[0]} 선택 함수 결과가 다르다`)

    const { container, unmount } = renderPresentation({
      current: entry,
      open: true,
      finish: () => {},
      assetStatus: expectSrc ? "AVAILABLE" : "PENDING",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      const video = container.querySelector("video")
      if (expectSrc) {
        assert.notEqual(video, null, `${type}-${perspectives[0]}은 영상을 그려야 한다`)
        assert.equal(video.getAttribute("src"), expectSrc)
        assert.ok(expectSrc.endsWith("-stacked.mp4"), `${type}-${perspectives[0]} 기대 경로가 -stacked.mp4가 아니다: ${expectSrc}`)
        assert.equal(video.getAttribute("src").endsWith(".webm"), false, `${type}-${perspectives[0]}이 .webm을 요청했다`)
        assert.notEqual(container.querySelector("canvas"), null, `${type}-${perspectives[0]}에 표시 canvas가 없다`)
      } else {
        assert.equal(video, null, `${type}-${perspectives[0]}은 전용 영상이 없어 임시 연출이어야 한다`)
        assert.equal(container.querySelector("canvas"), null, `${type}-${perspectives[0]}은 canvas도 그리면 안 된다`)
        assert.equal(container.textContent.includes("자료 대기"), true)
        const userSrc = EXPECTED_NIGHT_SUCCESS_VIDEO_URLS[`${type}-USER`]
        if (userSrc) {
          assert.equal(container.innerHTML.includes(userSrc), false, `${type}-${perspectives[0]}이 USER 자산(${userSrc})을 참조했다`)
        }
      }
    } finally {
      unmount()
    }
  }
})

test("AC-01: 실제 수신 → store 큐 → 표시 경로에서도 KILL-TARGET과 자기 치료(HEAL) 선택표가 그대로 적용된다", () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const receiver = renderHook(() => useGameSessionSocketEvents(), { wrapper: routerWrapper })
  try {
    act(() => socket.deliver("night_action_success",
      buildSuccessPayload({ type: "KILL", eventId: "real-kill-target", perspectives: ["TARGET"] })))
    assert.equal(useInGameStore.getState().nightSuccessQueue.length, 1, "전제: 큐에 KILL 사건이 있어야 한다")

    const killView = renderPresentation({})
    try {
      const video = killView.container.querySelector("video")
      assert.notEqual(video, null, "실제 수신 경로가 KILL-TARGET 영상을 그리지 않았다")
      assert.equal(video.getAttribute("src"), EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["KILL-TARGET"])
      act(() => { fireEvent(video, new dom.window.Event("ended")) })
      assert.equal(socket.ackCallsFor("acknowledge_night_action_success").length, 1)
    } finally {
      killView.unmount()
    }

    act(() => socket.deliver("night_action_success", buildSuccessPayload({
      type: "HEAL", eventId: "real-self-heal", perspectives: ["USER", "TARGET"], targetId: SELF_UUID,
    })))
    assert.equal(useInGameStore.getState().nightSuccessQueue.length, 1, "전제: 큐에 HEAL 사건이 있어야 한다")

    const healView = renderPresentation({})
    try {
      const videos = healView.container.querySelectorAll("video")
      assert.equal(videos.length, 1, "실제 수신 경로의 자기 치료도 영상이 정확히 하나만 렌더돼야 한다")
      assert.equal(videos[0].getAttribute("src"), EXPECTED_NIGHT_SUCCESS_VIDEO_URLS["HEAL-USER"])
      act(() => { fireEvent(videos[0], new dom.window.Event("ended")) })
      assert.equal(socket.ackCallsFor("acknowledge_night_action_success").length, 2)
    } finally {
      healView.unmount()
    }
  } finally {
    receiver.unmount()
    act(() => setSocket(null))
  }
})

test("AC-06: frontend/public/video-direction 아래 역할 영상 stacked MP4 5개가 존재하고 크기가 0보다 크다", () => {
  const VIDEO_DIRECTION_STACKED_FILES = [
    "night-success-kill-user-stacked.mp4",
    "night-success-kill-target-stacked.mp4",
    "night-success-heal-stacked.mp4",
    "night-success-investigate-user-stacked.mp4",
    "night-success-confirm-user-stacked.mp4",
  ]
  const VIDEO_DIRECTION_WEBM_FILES = [
    "night-success-kill-user.webm",
    "night-success-kill-target.webm",
    "night-success-heal.webm",
    "night-success-investigate-user.webm",
    "night-success-confirm-user.webm",
  ]
  const videoDirectionDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..", "..", "..", "public", "video-direction",
  )

  for (const file of [...VIDEO_DIRECTION_STACKED_FILES, ...VIDEO_DIRECTION_WEBM_FILES]) {
    const full = path.join(videoDirectionDir, file)
    assert.ok(fs.existsSync(full), `frontend/public/video-direction/${file}이 없다`)
    const stat = fs.statSync(full)
    assert.ok(stat.isFile(), `frontend/public/video-direction/${file}이 파일이 아니다`)
    assert.ok(stat.size > 0, `frontend/public/video-direction/${file}의 크기가 0이다`)
  }
})

test("AC-02: USER와 TARGET이 동일 인물인 자기 치료(HEAL)는 영상이 정확히 1회만 재생된다", async () => {
  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function spyPlay(...args) {
    playCalls.push(this)
    return originalPlay.apply(this, args)
  }

  const finishes = []
  const { container, unmount } = renderPresentation({
    current: {
      eventId: "self-heal", type: "HEAL", gameId: GAME_ID, nightDayIndex: 1,
      perspectives: ["USER", "TARGET"], targetId: SELF_UUID,
    },
    open: true,
    finish: (outcome) => finishes.push(outcome),
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const videos = container.querySelectorAll("video")
    assert.equal(videos.length, 1, "자기 치료 사건에 영상이 정확히 하나만 렌더돼야 한다")
    assert.equal(videos[0].getAttribute("src"), NIGHT_SUCCESS_VIDEO["HEAL-USER"])

    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "자기 치료 영상은 정확히 한 번만 재생을 시도해야 한다")

    fireEvent(videos[0], new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"])
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  }
})

test("AC-03: 영상 재생 시 볼륨이 Master×SFX 값으로 적용되고, 설정 변경도 재생을 다시 시작하지 않은 채 반영된다", async () => {
  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function spyPlay(...args) {
    playCalls.push(this)
    return originalPlay.apply(this, args)
  }
  setTestSfxMix({ gain: 0.5 * 0.4, muted: false })

  const { container, unmount } = renderPresentation({
    current: { eventId: "mix-1", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true,
    finish: () => {},
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    await flushMicrotasks()
    assert.equal(video.muted, false)
    assert.ok(Math.abs(video.volume - 0.2) < 1e-9, `volume이 Master×SFX(0.2)와 다르다: ${video.volume}`)

    act(() => setTestSfxMix({ gain: 0.25 * 0.4, muted: false }))
    assert.ok(Math.abs(video.volume - 0.1) < 1e-9, `볼륨 변경이 반영되지 않았다: ${video.volume}`)
    assert.equal(playCalls.length, 1, "설정 변경이 재생을 다시 시작시켰다")

    act(() => setTestSfxMix({ gain: 0, muted: true }))
    assert.equal(video.muted, true, "음소거 설정인데 video.muted가 true가 아니다")
    assert.equal(playCalls.length, 1, "음소거 반영이 재생을 다시 시작시켰다")
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
    setTestSfxMix({ gain: 1, muted: false })
  }
})

test("현재 사건이 없고 finalStatus만 있으면 최종 생존 화면을 보여주고, onClose가 그 화면을 닫는다", () => {
  const closes = []
  const { container, unmount } = renderPresentation({
    current: null,
    open: true,
    finish: () => {},
    assetStatus: null,
    finalStatus: { targetId: SELF_UUID, alive: true },
    onClose: () => closes.push(true),
  })
  try {
    assert.equal(container.textContent.includes("생존"), true)
    const confirmButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인")
    fireEvent.click(confirmButton)
    assert.deepEqual(closes, [true])
  } finally {
    unmount()
  }
})

test("open이 아니면 아무것도 그리지 않는다", () => {
  const { container, unmount } = renderPresentation({
    current: { eventId: "e1", type: "KILL" },
    open: false,
    finish: () => {},
    assetStatus: "AVAILABLE",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    assert.equal(container.textContent, "")
  } finally {
    unmount()
  }
})

test("소비처 연결(AC-03): props 없이도 컴포넌트가 직접 훅을 불러 선두 사건을 표시하고 완료를 보고한다", () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const receiver = renderHook(() => useGameSessionSocketEvents(), { wrapper: routerWrapper })
  act(() => socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "standalone-kill" })))
  assert.equal(useInGameStore.getState().nightSuccessQueue.length, 1, "전제: 큐에 사건 하나가 있어야 한다")

  const { container, unmount } = renderPresentation({})
  try {
    const video = container.querySelector("video")
    assert.notEqual(video, null, "props 없이 놓아둔 컴포넌트가 큐의 선두 KILL 사건을 그리지 않았다")
    assert.equal(video.getAttribute("src"), NIGHT_SUCCESS_VIDEO["KILL-USER"])

    act(() => { fireEvent(video, new dom.window.Event("ended")) })
    const acks = socket.ackCallsFor("acknowledge_night_action_success")
    assert.equal(acks.length, 1, "컴포넌트가 직접 부른 훅의 finish가 완료 보고로 이어지지 않았다")
    assert.equal(acks[0].payload.eventId, "standalone-kill")
    assert.deepEqual(useInGameStore.getState().nightSuccessQueue, [], "완료한 사건이 큐에 남았다")
    assert.equal(container.querySelector("video"), null, "완료한 사건의 연출이 그대로 남았다")
  } finally {
    unmount()
    receiver.unmount()
    act(() => setSocket(null))
  }
})

const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")
const { useMatchingStore } = await import("../../matching/store/matchingStore.js")

function findButton(container, label) {
  return [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

async function dismissParchmentOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButton(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

test("소비처 연결: 실제 InGamePage가 훅과 컴포넌트를 마운트해 night_action_success를 광대→의사 순서로 표시하고 ACK를 보낸다", async () => {
  const socket = createFakeSocket()
  currentSocket = socket
  for (const cb of [...socketSubscribers]) cb()

  seedNightSession()

  let view
  await act(async () => {
    view = render(React.createElement(RouterProvider, { router }))
  })
  await act(async () => { await router.navigate("/ingame") })
  await dismissParchmentOverlays(view.container)

  await act(async () => {
    socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "page-e1", perspectives: ["TARGET"] }))
  })
  const video = view.container.querySelector("video[src]")
  assert.notEqual(video, null, "InGamePage가 실제로 KILL 영상을 마운트해야 한다")
  assert.equal(video.getAttribute("src"), NIGHT_SUCCESS_VIDEO["KILL-TARGET"])

  await act(async () => { fireEvent(video, new dom.window.Event("ended")) })
  const ack = socket.ackCallsFor("acknowledge_night_action_success")
  assert.equal(ack.length, 1)
  assert.deepEqual(ack[0].payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "page-e1" })

  await act(async () => {
    socket.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "page-e2", perspectives: ["TARGET"] }))
  })
  const healVideo = view.container.querySelector("video[src]")
  assert.notEqual(healVideo, null, "HEAL-TARGET도 영상이 있어야 한다")
  assert.equal(healVideo.getAttribute("src"), NIGHT_SUCCESS_VIDEO["HEAL-TARGET"])

  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

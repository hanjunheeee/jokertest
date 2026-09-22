/**
 * F-27b: 밤 성공 사건(night_action_success) 연출 — 역할별 순서·재생 완료/오류/건너뛰기 보고를
 * 실제 production 코드로 검증한다.
 *
 * 세 층위로 나눠 증명한다.
 *   1. 훅 층 — useGameSessionSocketEvents(실제 소켓 수신)와 useInGameNightSuccessPresentation을
 *      함께 마운트해 큐 순서(AC-01)·완료/오류/건너뛰기 보고와 중복 방지(AC-03)·자산 검증
 *      상태(AC-04)·최종 생존 상태의 선행/후행 도착(AC-02)을 store·소켓 emit 수준에서 본다.
 *   2. 컴포넌트 층 — InGameNightSuccessPresentation.jsx를 직접 마운트해 KILL의 기존 영상
 *      재생(AC-05)과 임시 자산 화면(AC-04)의 실제 DOM·이벤트 경로를 본다.
 *   3. 페이지 층 — ProtectedRoute 아래 실제 InGamePage를 마운트해 훅·컴포넌트가 production
 *      화면에 실제로 이어져 있음을 한 번 더 확인한다.
 */
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

/**
 * F-27d: jsdom은 canvas npm 패키지 없이는 HTMLCanvasElement.getContext를 지원하지 않는다
 * (항상 null) — InGameNightSuccessKillVideo가 그 null을 canvas 컨텍스트 획득 실패로 보고
 * 즉시 ERROR로 끝내 버리므로, 기존 재생 시험(AC-01·AC-03·AC-05 등)이 전부 깨진다. 그래서
 * drawImage·getImageData·createImageData·putImageData의 최소 계약만 구현한 가짜 2D 컨텍스트를
 * 기본으로 설치한다 — 실제 픽셀 연산은 하지 않되(예외를 던지지 않되) 모든 호출을 기록해
 * 개별 시험이 나중에 대조할 수 있게 한다. 시험은 canvasContextFactory를 바꿔치기해 getContext
 * 자체의 실패(AC-05)나 특정 픽셀 데이터(AC-02)를 주입한다.
 */
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

/** getContext 대역을 기본값으로 되돌린다(개별 시험이 finally에서 호출한다). */
function resetCanvasContextFactory() {
  canvasContextFactory = (canvas) => createRecordingCanvasContext(canvas)
}

/**
 * F-27d(AC-04): video.requestVideoFrameCallback/cancelVideoFrameCallback을 결정론적으로
 * 통제 가능한 가짜로 바꾼다 — 실제 브라우저 API는 실제 프레임 갱신에 묶여 있어 시험에서
 * 타이밍을 예측할 수 없다. 등록된 콜백은 취소돼도 registered에서 지우지 않는다(늦게 강제
 * 호출해 컴포넌트 자체의 방어 로직을 검증하기 위해서다) — 대신 cancelled에 따로 기록한다.
 */
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

/** AC-04의 requestAnimationFrame 대체 경로 시험이 되돌려 놓을 원래 예약 함수. */
const defaultRequestAnimationFrame = globalThis.requestAnimationFrame
const defaultCancelAnimationFrame = globalThis.cancelAnimationFrame

register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── 바깥 경계 대역(페이지 층 전용 — 훅·컴포넌트 자체는 대역하지 않는다) ──────────
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
// F-27c(AC-03): 이 화면이 소비하는 것은 dispatchSfxEvent가 아니라 getSfxMix/subscribeSfxMix다
// (별도 효과음 dispatch 없이 Master×SFX·mute를 영상에 직접 적용한다, AC-04). 시험이 직접
// 조절할 수 있는 mix 하나를 여기서 관리하고, 컴포넌트의 subscribeSfxMix 구독자에게 그대로
// 통지한다 — 실제 sfxPlayer의 computeMix를 복제하지 않고 계약(getMix/subscribeMix 모양)만 흉내낸다.
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

/** §2-5 선택표의 실제 값 — 하드코딩 사본을 만들지 않고 production manifest에서 직접 읽는다. */
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

/** 서버 소켓처럼 등록된 리스너에게만 동기적으로 전달하는 최소 fake다. */
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
    // useInGameSessionSnapshotSync가 마운트 시점에 재접속 조회를 시도한다 — 응답 없이 그냥
    // 걸어두기만 해도 이 파일의 시험에는 영향이 없다(get_session_snapshot을 검사하지 않는다).
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
  // ProtectedRoute 위치의 전역 구독 — night_action_success·night_result_applied 모두 이
  // 훅이 실제로 받아 store로 넘긴다(receiveNightSuccess·applyNightResultAppliedPayload).
  useGameSessionSocketEvents()
  return useInGameNightSuccessPresentation({ hold })
}

/** useGameSessionSocketEvents가 useNavigate()를 부르므로 훅 전용 렌더에는 실제 Router가 필요하다. */
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

// ── 1) 훅 층 ─────────────────────────────────────────────────────────────

test("AC-01: night_action_success 네 건이 광대(KILL)→의사(HEAL)→경비원(INVESTIGATE)→마녀사냥꾼(CONFIRM) 순서로 하나씩만 노출된다", () => {
  seedNightSession()
  const session = openSession()

  assert.equal(session.value.current, null)

  const order = ["KILL", "HEAL", "INVESTIGATE", "CONFIRM"]
  order.forEach((type, index) => {
    session.deliver("night_action_success", buildSuccessPayload({ type, eventId: `e${index + 1}` }))
  })

  // 넷 다 도착했어도 화면은 선두 하나만 내보낸다 — 뒤 사건의 표시나 재생이 먼저 시작되지 않는다.
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

  // 옛 finish(같은 e1에 클로저로 묶여 있다)를 다시 불러도 이미 완료된 e1을 다시 완료하려 할 뿐,
  // 지금 선두인 e2(HEAL)를 건드리지 못한다 — store가 완료 기록으로 noop 처리한다.
  act(() => killFinish("COMPLETED"))
  assert.equal(session.socket.ackCallsFor("acknowledge_night_action_success").length, 1, "옛 콜백이 새 ACK를 만들었다")
  assert.equal(session.value.current.type, "HEAL", "옛 콜백이 다음 사건을 건드렸다")

  // 지금 선두(e2, HEAL)에 대한 반복 완료 호출도 두 번째 ACK를 만들지 않는다.
  const healFinish = session.value.finish
  act(() => healFinish("COMPLETED"))
  act(() => healFinish("COMPLETED"))
  assert.equal(session.socket.ackCallsFor("acknowledge_night_action_success").length, 2)
  assert.deepEqual(
    session.socket.ackCallsFor("acknowledge_night_action_success")[1].payload,
    { gameId: GAME_ID, nightDayIndex: 1, eventId: "e2" },
  )

  // 재생 오류 — outcome:"ERROR"가 실린다.
  assert.equal(session.value.current.type, "INVESTIGATE")
  session.finish("ERROR")
  const errorAck = session.socket.ackCallsFor("acknowledge_night_action_success")[2]
  assert.deepEqual(errorAck.payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "e3", outcome: "ERROR" })

  // 사용자 건너뛰기 — outcome:"SKIPPED"가 실린다.
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

  // INVESTIGATE-TARGET(perspectives가 TARGET뿐)은 선택표에 없다 — PENDING으로 남아야 한다.
  session.deliver("night_action_success",
    buildSuccessPayload({ type: "INVESTIGATE", eventId: "e3", perspectives: ["TARGET"] }))
  assert.equal(session.value.assetStatus, "PENDING")
  session.finish("COMPLETED") // 임시 연출 확인(=COMPLETED 보고)조차 자산 상태를 바꾸지 않는다.
  assert.equal(session.value.current, null)

  session.close()
})

test("AC-02: 광대 킬 뒤 의사 치료가 모두 finish된 뒤에도, 같은 밤의 night_result_applied가 반영되기 전에는 최종 생존 상태가 뜨지 않는다(후행 도착)", () => {
  seedNightSession()
  const session = openSession()

  // 이 자리에서는 본인이 대상이다 — perspectives가 TARGET뿐이면 targetId 없이도 본인으로
  // 다뤄져야 한다(buildNightSuccessQueueEntry는 USER 관점에만 targetId를 싣는다).
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

  // 서버 결과가 큐 소진보다 먼저 도착한다 — 치료가 실패해 최종적으로 사망한 경우.
  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 6, selfAlive: false, victimUuid: SELF_UUID }))
  assert.equal(session.value.finalStatus, null, "KILL 연출도 아직 끝나지 않았다")

  session.finish("COMPLETED") // KILL 종료 — HEAL이 아직 큐에 남아 있다.
  assert.equal(session.value.finalStatus, null, "HEAL 연출이 아직 남아 있다")

  session.finish("COMPLETED") // HEAL 종료 — 이제 큐가 비고 결과도 이미 와 있다.
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: false })

  session.close()
})

/**
 * AC-02(CODEX 반려 수정): "KILL 연출 종료 → DAY 결과 도착 → HEAL 사건 도착" 순서 고정 시험.
 *
 * KILL만 finish된 채 night_result_applied가 먼저 반영되는 시점에는(HEAL이 이 밤에 더 올지
 * 아직 알 수 없다) 최종 상태를 보여주면 안 된다 — 이전 코드는 track을 KILL·HEAL 구분 없이
 * 마지막 사건 하나로만 덮어써서, 바로 이 시점에 finalStatus를 잘못 켰다. HEAL이 이 밤에
 * 더 오지 않는다는 확인은 오직 DOCTOR의 night_turn_ended 방송으로만 한다(추측하지 않는다 —
 * HEAL_WINDOW_CLOSING_ROLE 주석 참고). 그 방송이 도착한 뒤에야 KILL 하나만으로 최종 상태가 켜진다.
 */
test("AC-02(CODEX 반려 수정): KILL만 finish된 채 DAY 결과가 먼저 반영되면, DOCTOR의 턴 종료 전까지 최종 상태를 보여주지 않는다", () => {
  seedNightSession({ dayIndex: 7 })
  const session = openSession()

  session.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "k3", nightDayIndex: 7, perspectives: ["TARGET"] }))
  session.finish("COMPLETED")
  assert.equal(session.value.current, null, "KILL만 있었으니 큐는 이미 비어 있다")

  // "DAY 결과 도착" — 이 시점에는 이 밤에 HEAL이 왔는지·안 왔는지 아직 아무 근거가 없다.
  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 8, selfAlive: true }))
  assert.equal(
    session.value.finalStatus, null,
    "HEAL이 finish되지도, DOCTOR 턴 종료로 '더 오지 않는다'가 확인되지도 않았는데 최종 상태가 떴다",
  )

  // DOCTOR의 턴이 끝났다는 서버 방송만이 "이 밤엔 HEAL이 더 오지 않는다"의 근거다.
  session.deliver("night_turn_ended", buildNightTurnEndedPayload({ role: "DOCTOR", dayIndex: 7 }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true })

  session.close()
})

/**
 * AC-03(CODEX 반려 수정): **옛 onClose는 새 표시를 지우지 않는다.**
 *
 * 최종 생존 화면의 닫기는 예전에 무조건 setTrack(null)이었다. 그래서 이미 닫힌 화면의 늦은
 * 콜백(StrictMode의 setup→cleanup→setup, 모달의 지연 dismiss, 옛 렌더가 들고 있던 참조)이
 * **그 뒤에 세워진 새 최종 표시**를 통째로 지웠다 — 새 화면은 아직 아무것도 보여주지 못했는데
 * 사라진다. 이제 닫기도 finish와 같은 두 검사를 통과해야 한다: 수락 범위가 지금과 같은가,
 * 그리고 지금 떠 있는 것이 **그 콜백이 닫으려던 바로 그 표시**인가.
 */
test("AC-03(CODEX 반려 수정): 옛 최종 표시의 늦은 onClose는 그 뒤에 세워진 새 최종 표시를 지우지 않는다", () => {
  seedNightSession({ dayIndex: 3 })
  const session = openSession()

  // ① KILL 하나로 최종 표시가 선다(DOCTOR 턴 종료로 "HEAL은 더 오지 않는다"가 확인된 뒤).
  session.deliver("night_action_success",
    buildSuccessPayload({ type: "KILL", eventId: "k-final-1", nightDayIndex: 3, perspectives: ["TARGET"] }))
  session.finish("COMPLETED")
  session.deliver("night_turn_ended", buildNightTurnEndedPayload({ role: "DOCTOR", dayIndex: 3 }))
  session.deliver("night_result_applied", buildNightResultApplied({ dayIndex: 4, selfAlive: true }))
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true },
    "전제: 첫 최종 표시가 떠야 한다")

  // 그 표시가 그린 닫기 콜백을 들고 있는다 — 늦게 불리는 것이 바로 이 참조다.
  const staleClose = session.value.onClose

  // ② 다음 밤(5)이 시작되고 그 밤의 KILL이 소비되어 **새 추적·새 최종 표시**가 선다.
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

  // ③ 옛 콜백이 늦게 불린다 — 새 표시는 그대로여야 한다.
  act(() => staleClose())
  assert.deepEqual(session.value.finalStatus, { targetId: SELF_UUID, alive: true },
    "옛 onClose가 새 최종 표시를 지웠다")

  // ④ 지금 표시의 확인만이 그 표시를 닫는다.
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

// ── 2) 컴포넌트 층 ───────────────────────────────────────────────────────

function renderPresentation(props) {
  return render(React.createElement(InGameNightSuccessPresentation, props))
}

/** 등록된 마이크로태스크(예: 예약된 재생 시작, play()의 .catch)가 전부 풀리도록 한 틱 기다린다. */
const flushMicrotasks = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test("AC-05: KILL 사건은 기존 사망 연출과 같은 영상을 재생하고, 종료·오류·건너뛰기를 구분해 보고한다 — 먼저 일어난 종료 하나만 보고된다", async () => {
  // video.play()가 실제로 호출되는지 스파이한다 — jsdom의 기본 구현은 아무 것도 하지 않는
  // no-op(notImplemented)이라 예외 없이 그대로 감쌀 수 있다.
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

    // AC-02(CODEX 반려 수정): 재생 시작은 취소 가능한 마이크로태스크 예약이라 마운트 직후
    // 동기적으로는 아직 play()가 불리지 않는다 — 한 틱 기다려야 한다.
    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "마운트 뒤 한 틱 안에 play()를 정확히 한 번 호출해야 한다")
    assert.equal(playCalls[0], video)

    fireEvent(video, new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"])

    // AC-05(CODEX 반려 수정): settleWith·reportFailure·watchdog가 공유하는 종료 가드 때문에,
    // 이미 COMPLETED로 끝난 사건에 뒤이어 온 error 이벤트는 추가로 보고되지 않는다 — 먼저
    // 일어난 종료 하나만 보고된다.
    fireEvent(video, new dom.window.Event("error"))
    assert.deepEqual(finishes, ["COMPLETED"], "이미 종료된 사건에 뒤이은 media error가 다시 보고됐다")
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  }
})

/**
 * F-27c(AC-02, CODEX 반려 수정): React StrictMode는 개발 빌드에서 mount effect를
 * setup→cleanup→setup으로 **동기적으로 두 번** 실행해 정리 누락을 드러낸다. 이 시험은 실제
 * 수신(night_action_success) → store 큐 → 훅 → 컴포넌트 전체를 StrictMode 아래 마운트해,
 * 같은 사건에 play()가 정확히 한 번만 불리고, 같은 사건의 재전달·리렌더에도 늘지 않으며,
 * 완료 보고(ACK)도 정확히 한 번임을 확인한다.
 */
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

    // 같은 사건이 다시 전달돼도(store가 중복으로 거른다) 재생이 다시 시작되지 않는다.
    act(() => socket.deliver("night_action_success", buildSuccessPayload({ type: "KILL", eventId: "strict-kill" })))
    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "같은 사건의 재전달이 play()를 다시 불렀다")

    // 같은 props로 리렌더해도 마운트 effect의 deps(eventId·src)가 그대로라 다시 돌지 않는다.
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

/** play()가 강제로 거부(reject)되도록 잠시 바꿔치기한다. name은 DOMException.name 흉내다. */
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
      const retryButton = [...container.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "다시 재생")
      assert.notEqual(retryButton, null, "자동재생 차단은 재시도 버튼을 보여줘야 한다")
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
      const retryButton = [...container.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "다시 재생")
      assert.equal(retryButton, undefined, "재시도로 풀리지 않는 실패인데 재시도 버튼을 보여주면 안 된다")
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

/**
 * F-27c(AC-05): 유음 시도가 자동재생 정책(NotAllowedError)으로 거절되면 무음으로 **한 번만**
 * 조용히 재시도한다 — 성공하면 ACK 없이 계속 보여주고, 그 뒤 설정을 다시 유음으로 바꿔도
 * 사용자 동작 없이는 소리를 켜지 않는다(무음 latch가 사건 수명 동안 유지된다).
 */
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
  setTestSfxMix({ gain: 1, muted: false }) // 유음 설정 — 첫 시도는 유음으로 걸린다.

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

    // 사용자 동작 없이 설정만 유음으로 바꿔도, 이미 무음 latch가 선 이 재생은 계속 무음이다.
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
      // 대상자 화면은 USER 전용 자산 경로를 DOM 어디에도 참조하면 안 된다.
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

// ── F-27d: stacked MP4 canvas 합성(AC-02/AC-03/AC-04/AC-05) ────────────────

/** getImageData 반환값을 y좌표(색 절반=0, 마스크 절반=halfHeight)에 따라 통제하는 컨텍스트. */
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
  // 2x2 영상 — 위 절반(2x1, 색) 아래 절반(2x1, 마스크). 픽셀 2개씩 4채널.
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
    // 메타데이터 전(jsdom videoWidth·videoHeight 기본값 0) — 아직 픽셀을 읽으면 안 된다.
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

test("AC-04: requestVideoFrameCallback이 없으면 requestAnimationFrame으로 예약·취소한다", async () => {
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

  const { container, unmount } = renderPresentation({
    current: { eventId: "raf-fallback", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
    open: true, finish: () => {}, assetStatus: "AVAILABLE", finalStatus: null, onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    // 이 video 인스턴스만 requestVideoFrameCallback을 지원하지 않는 것으로 가장한다.
    Object.defineProperty(video, "requestVideoFrameCallback", { value: undefined, configurable: true })
    await flushMicrotasks()
    assert.ok(rafHandles.length >= 1, "requestVideoFrameCallback이 없으면 requestAnimationFrame으로 예약해야 한다")

    const lastHandle = rafHandles[rafHandles.length - 1].handle
    unmount()
    assert.ok(cancelledRafHandles.includes(lastHandle), "언마운트가 requestAnimationFrame 예약을 취소하지 않았다")
  } finally {
    installDomGlobal("requestAnimationFrame", defaultRequestAnimationFrame)
    installDomGlobal("cancelAnimationFrame", defaultCancelAnimationFrame)
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

// ── AC-01: 8가지 type × 관점 선택표 ─────────────────────────────────────

/**
 * F-27c(AC-01, CODEX 반려 수정): 설계도 §2-5 표의 다섯 URL을 **문자열 리터럴**로 못 박는다 —
 * 기대값을 production manifest(NIGHT_SUCCESS_VIDEO)에서 그대로 가져오면, sfxManifest.js의
 * embeddedVideos 등록 자체가 틀려도(오타·잘못된 파일명 등) 시험이 "manifest가 말하는 대로"
 * 통과해버려 오등록을 검출하지 못한다.
 */
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
    // 순수 선택 함수 층위에서도 같은 값을 내야 한다(훅·컴포넌트 둘 다 이 함수를 호출한다).
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
        // AC-03: 영상이 있는 조합은 표시용 canvas도 함께 렌더돼야 한다(video 자체는 숨긴다).
        assert.notEqual(container.querySelector("canvas"), null, `${type}-${perspectives[0]}에 표시 canvas가 없다`)
      } else {
        assert.equal(video, null, `${type}-${perspectives[0]}은 전용 영상이 없어 임시 연출이어야 한다`)
        assert.equal(container.querySelector("canvas"), null, `${type}-${perspectives[0]}은 canvas도 그리면 안 된다`)
        assert.equal(container.textContent.includes("자료 대기"), true)
        // TARGET 전용 영상이 없는 조합은 USER 자산 경로를 DOM 어디에도 요청하지 않는다.
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

/**
 * F-27c(AC-01, CODEX 반려 수정): controlled props가 아니라 **실제 수신(night_action_success)
 * → store 큐 → 표시 경로** 전체로 최소 두 조합(KILL-TARGET·자기 치료 HEAL)을 확인한다 — 훅이
 * 큐를 잘못 조립하거나 컴포넌트가 store 대신 엉뚱한 값을 그리는 배선 결함은 controlled 시험만
 *으로는 드러나지 않는다.
 */
test("AC-01: 실제 수신 → store 큐 → 표시 경로에서도 KILL-TARGET과 자기 치료(HEAL) 선택표가 그대로 적용된다", () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const receiver = renderHook(() => useGameSessionSocketEvents(), { wrapper: routerWrapper })
  try {
    // KILL-TARGET — 대상자 관점, 실제 소켓 수신 경로.
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

    // 자기 치료(HEAL, perspectives에 USER·TARGET 동시 포함) — 실제 수신 경로.
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

// ── AC-06: 다섯 자산 파일의 존재 고정 ───────────────────────────────────

test("AC-06: frontend/public/video-direction 아래 역할 영상 stacked MP4 5개가 존재하고 크기가 0보다 크다", () => {
  // 파일 이름은 문자열 리터럴로 고정한다 — sfxManifest.js의 embeddedVideos에서 가져오면
  // manifest 자체가 잘못돼도(오타·파일 삭제) 시험이 같은 값을 다시 확인할 뿐 실제 파일
  // 존재를 증명하지 못한다. 이 조각은 이 파일들을 만들거나 바꾸지 않는다(운영자가 이미 커밋).
  const VIDEO_DIRECTION_STACKED_FILES = [
    "night-success-kill-user-stacked.mp4",
    "night-success-kill-target-stacked.mp4",
    "night-success-heal-stacked.mp4",
    "night-success-investigate-user-stacked.mp4",
    "night-success-confirm-user-stacked.mp4",
  ]
  // 기존 WebM 다섯 파일도 함께 남아 있어야 한다(선택표만 stacked MP4로 바뀌었을 뿐, 자산
  // 자체를 지우거나 바꾸지 않는다 — A-02).
  const VIDEO_DIRECTION_WEBM_FILES = [
    "night-success-kill-user.webm",
    "night-success-kill-target.webm",
    "night-success-heal.webm",
    "night-success-investigate-user.webm",
    "night-success-confirm-user.webm",
  ]
  // __tests__ → ingame → game → domains → src → frontend → public/video-direction
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

// ── AC-02: 자기 치료(USER === TARGET) ───────────────────────────────────

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

    // 재생 시작은 취소 가능한 마이크로태스크 예약이다 — 한 틱 기다려야 play()가 불린다.
    await flushMicrotasks()
    assert.equal(playCalls.length, 1, "자기 치료 영상은 정확히 한 번만 재생을 시도해야 한다")

    fireEvent(videos[0], new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"])
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
  }
})

// ── AC-03: Master×SFX·mute가 영상에 반영된다 ────────────────────────────

test("AC-03: 영상 재생 시 볼륨이 Master×SFX 값으로 적용되고, 설정 변경도 재생을 다시 시작하지 않은 채 반영된다", async () => {
  const playCalls = []
  const originalPlay = dom.window.HTMLMediaElement.prototype.play
  dom.window.HTMLMediaElement.prototype.play = function spyPlay(...args) {
    playCalls.push(this)
    return originalPlay.apply(this, args)
  }
  setTestSfxMix({ gain: 0.5 * 0.4, muted: false }) // Master 50 × SFX 40

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
    // mix는 재생 시작 시도(취소 가능한 마이크로태스크 예약) 안에서 적용된다 — 한 틱 기다린다.
    await flushMicrotasks()
    assert.equal(video.muted, false)
    assert.ok(Math.abs(video.volume - 0.2) < 1e-9, `volume이 Master×SFX(0.2)와 다르다: ${video.volume}`)

    // 설정 변경 — 새 재생을 시작하지 않고 같은 video에 반영돼야 한다.
    act(() => setTestSfxMix({ gain: 0.25 * 0.4, muted: false }))
    assert.ok(Math.abs(video.volume - 0.1) < 1e-9, `볼륨 변경이 반영되지 않았다: ${video.volume}`)
    assert.equal(playCalls.length, 1, "설정 변경이 재생을 다시 시작시켰다")

    // 음소거 설정 — video.muted가 true가 돼야 한다(AC-03).
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

/**
 * 소비처 연결(AC-03): 이 컴포넌트의 표시 값은 **오직 useInGameNightSuccessPresentation**에서
 * 온다. props를 하나도 주지 않으면 그 사실이 그대로 드러난다 — 컴포넌트가 직접 훅을 불러
 * 큐의 선두 사건을 그리고, 재생 종료가 같은 훅의 finish를 지나 실제 서버 보고까지 이어진다.
 *
 * (InGamePage는 다른 오버레이와의 우선순위를 합쳐야 해서 같은 훅의 값을 props로 내려보낸다 —
 *  그 controlled 경로는 이 파일의 나머지 컴포넌트 층 시험과 아래 페이지 층 시험이 본다.)
 */
test("소비처 연결(AC-03): props 없이도 컴포넌트가 직접 훅을 불러 선두 사건을 표시하고 완료를 보고한다", () => {
  seedNightSession()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  // 사건은 실제 전역 수신 훅이 store에 넣는다 — 컴포넌트는 그 store만 본다(대역 없음).
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

// ── 3) 페이지 층 ─────────────────────────────────────────────────────────

const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")
const { useMatchingStore } = await import("../../matching/store/matchingStore.js")

function findButton(container, label) {
  return [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

/** 화면에 떠 있는 양피지 모달(역할 공개·진입 연출)의 "확인"을 차례로 눌러 닫는다. */
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
  // HEAL-TARGET도 선택표에 있으므로(자기 치료가 아니어도 대상자가 보는 영상이 있다) 임시 연출이
  // 아니라 영상이 이어서 떠야 한다.
  const healVideo = view.container.querySelector("video[src]")
  assert.notEqual(healVideo, null, "HEAL-TARGET도 영상이 있어야 한다")
  assert.equal(healVideo.getAttribute("src"), NIGHT_SUCCESS_VIDEO["HEAL-TARGET"])

  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

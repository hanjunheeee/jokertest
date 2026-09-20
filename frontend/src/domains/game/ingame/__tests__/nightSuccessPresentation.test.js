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
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {},
    dispatchUiSfx: () => {},
    useSfxRuntime: () => {},
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
const { INGAME_KILL_ANIMATION_VIDEO_URL } = await import("../constants/killReveal/ingameKillReveal.js")

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
  assert.equal(session.value.assetStatus, "VERIFIED", "KILL은 실제 영상이 있으므로 검증된 상태여야 한다")
  session.finish("COMPLETED")

  session.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "e2" }))
  session.deliver("night_action_success", buildSuccessPayload({ type: "INVESTIGATE", eventId: "e3" }))
  assert.equal(session.value.assetStatus, "PENDING")
  session.finish("COMPLETED") // 임시 연출 확인(=COMPLETED 보고)조차 자산 상태를 바꾸지 않는다.
  assert.equal(session.value.current?.type, "INVESTIGATE")
  assert.equal(session.value.assetStatus, "PENDING", "전용 자산이 없는 종류는 확인 뒤에도 PENDING이어야 한다")

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

test("AC-05: KILL 사건은 기존 사망 연출과 같은 영상을 재생하고, 종료·오류·건너뛰기를 구분해 보고한다", () => {
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
    assetStatus: "VERIFIED",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    const video = container.querySelector("video")
    assert.notEqual(video, null, "KILL은 <video>를 마운트해야 한다")
    assert.equal(video.getAttribute("src"), INGAME_KILL_ANIMATION_VIDEO_URL, "기존 킬 연출 영상과 같은 URL이어야 한다")
    assert.equal(playCalls.length, 1, "마운트되면 곧바로 play()를 호출해야 한다")
    assert.equal(playCalls[0], video)

    fireEvent(video, new dom.window.Event("ended"))
    assert.deepEqual(finishes, ["COMPLETED"])

    fireEvent(video, new dom.window.Event("error"))
    assert.deepEqual(finishes, ["COMPLETED", "ERROR"], "media error는 ERROR로 보고돼야 한다")
  } finally {
    unmount()
    dom.window.HTMLMediaElement.prototype.play = originalPlay
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

/** 등록된 마이크로태스크(예: play()의 .catch)가 전부 풀리도록 한 틱 기다린다. */
const flushMicrotasks = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test("AC-03(CODEX 반려 수정): 자동재생 차단(NotAllowedError)은 재시도 화면만 보여주고 아직 보고하지 않는다", async () => {
  const finishes = []
  await withRejectingPlay("NotAllowedError", async () => {
    const { container, unmount } = renderPresentation({
      current: { eventId: "k-autoplay", type: "KILL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "VERIFIED",
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
      assetStatus: "VERIFIED",
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
      assetStatus: "VERIFIED",
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

test("AC-04: HEAL·INVESTIGATE·CONFIRM은 '자료 대기' 임시 연출을 보여주고, 확인은 COMPLETED·건너뛰기는 SKIPPED로 각각 끝낸다", () => {
  for (const [type, roleLabel] of [["HEAL", "의사"], ["INVESTIGATE", "경비원"], ["CONFIRM", "마녀사냥꾼"]]) {
    const finishes = []
    const { container, unmount } = renderPresentation({
      current: { eventId: `pending-${type}`, type, gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
      open: true,
      finish: (outcome) => finishes.push(outcome),
      assetStatus: "PENDING",
      finalStatus: null,
      onClose: () => {},
    })
    try {
      assert.equal(container.textContent.includes("자료 대기"), true, `${type} 화면에 '자료 대기' 문구가 없다`)
      assert.equal(container.textContent.includes(roleLabel), true, `${type} 화면에 역할 표시(${roleLabel})가 없다`)

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
    current: { eventId: "pending-heal", type: "HEAL", gameId: GAME_ID, nightDayIndex: 1, perspectives: ["USER"], targetId: OTHER_UUID },
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
    assetStatus: "VERIFIED",
    finalStatus: null,
    onClose: () => {},
  })
  try {
    assert.equal(container.textContent, "")
  } finally {
    unmount()
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
  assert.equal(video.getAttribute("src"), INGAME_KILL_ANIMATION_VIDEO_URL)

  await act(async () => { fireEvent(video, new dom.window.Event("ended")) })
  const ack = socket.ackCallsFor("acknowledge_night_action_success")
  assert.equal(ack.length, 1)
  assert.deepEqual(ack[0].payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "page-e1" })

  await act(async () => {
    socket.deliver("night_action_success", buildSuccessPayload({ type: "HEAL", eventId: "page-e2", perspectives: ["TARGET"] }))
  })
  assert.equal(view.container.textContent.includes("자료 대기"), true, "HEAL은 임시 연출이 이어서 떠야 한다")

  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
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

const { renderHook } = await import("@testing-library/react")

let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameOverlayStack } = await import("../useInGameOverlayStack.js")

const GAME_ID = "game-overlay-kill-1"
const SELF_UUID = "uuid-self"
const VICTIM_UUID = "uuid-victim"

function createFakeSocket() {
  const handlers = new Map()
  const emitCalls = []
  const emitWithAckCalls = []

  const socket = {
    connected: true,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    emit(...args) {
      emitCalls.push(args)
    },
    timeout() {
      return {
        emitWithAck(...args) {
          emitWithAckCalls.push(args)
          return new Promise(() => {})
        },
      }
    },
    emitWithAck(...args) {
      emitWithAckCalls.push(args)
      return new Promise(() => {})
    },
    fire(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args)
    },
  }

  return { socket, emitCalls, emitWithAckCalls }
}

function buildState({ phase, dayIndex }) {
  return {
    id: GAME_ID,
    phase,
    dayIndex,
    players: [
      { uuid: SELF_UUID, nickname: "나", alive: true },
      { uuid: VICTIM_UUID, nickname: "피해자", alive: true },
    ],
    self: {
      uuid: SELF_UUID,
      nickname: "나",
      role: "CITIZEN",
      team: "CITIZEN",
      hasActedThisPhase: false,
    },
  }
}

function applyCanonicalState({ phase, dayIndex }) {
  act(() => {
    useInGameStore.getState().setGamePayload({ gameId: GAME_ID, state: buildState({ phase, dayIndex }) })
  })
}

function mountLiveOverlayStack() {
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  const rendered = renderHook(() => useInGameOverlayStack())
  return { ...rendered, fake }
}

// 이 밤 결과 방송을 시뮬레이션한다. 프로덕션에서는 같은 broadcast를 useGameSessionSocketEvents
// (canonical store 반영)와 useInGameKillReveal(사망 연출 큐)이 각자 독립적으로 구독한다 — 이
// 테스트 파일은 useGameSessionSocketEvents를 마운트하지 않으므로, 그쪽이 했을 canonical store
// 반영은 applyCanonicalState로 별도 재현한다(두 리스너의 등록 순서와 무관해야 한다는 설계를
// 그대로 검증하기 위해, 아래 테스트마다 두 트리거의 순서를 의도적으로 바꿔가며 확인한다).
function fireNightResult(fake, overrides = {}) {
  act(() => {
    fake.socket.fire("night_result_applied", {
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex: 2,
      victimUuid: VICTIM_UUID,
      players: [
        { uuid: SELF_UUID, alive: true },
        { uuid: VICTIM_UUID, alive: false },
      ],
      deathReveals: [{ victimUuid: VICTIM_UUID, source: "JOKER" }],
      ...overrides,
    })
  })
}

test("역할 공개가 열려 있는 동안에는 사망 연출이 대기만 하고 뜨지 않는다(우선순위 1 > 2)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  assert.equal(result.current.roleReveal.open, true)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  fireNightResult(fake)

  assert.equal(result.current.killReveal.open, false, "역할 공개가 먼저다")

  act(() => {
    result.current.roleReveal.close()
  })
  assert.equal(result.current.killReveal.open, true, "역할 공개를 닫으면 대기 중이던 사망 연출이 뜬다")

  unmount()
})

test("사망 연출이 뜨는 동안에는 DAY 진입 연출(파치먼트)이 뒤로 밀리고, 소비해야 비로소 뜬다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  fireNightResult(fake)
  applyCanonicalState({ phase: "DAY", dayIndex: 2 })

  assert.equal(result.current.killReveal.open, true)
  assert.equal(result.current.phaseEntrance.open, false, "사망 연출이 떠 있는 동안 DAY 파치먼트는 뒤로 밀린다")
  assert.equal(result.current.nightTurn.open, false)
  assert.equal(result.current.interactionBlocked, true)

  act(() => {
    result.current.killReveal.consume(result.current.killReveal.revealId)
  })

  assert.equal(result.current.killReveal.open, false)
  assert.equal(result.current.phaseEntrance.open, true, "사망 연출이 끝나야 DAY 파치먼트가 뜬다")
  assert.equal(result.current.phaseEntrance.message, "낮이 되었습니다")

  unmount()
})

test("두 리스너의 도착 순서가 반대여도(canonical 전이가 먼저 반영된 뒤 사망 연출이 나중에 도착) 동일하게 게이트한다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  // canonical store 전이가 먼저 반영된다(다른 핸들러가 먼저 등록된 상황을 흉내).
  applyCanonicalState({ phase: "DAY", dayIndex: 2 })
  assert.equal(result.current.phaseEntrance.open, true, "사망 연출이 아직 없으면 DAY 파치먼트가 정상적으로 뜬다")

  // 뒤늦게 사망 연출 방송이 도착한다.
  fireNightResult(fake)
  assert.equal(result.current.killReveal.open, true)
  assert.equal(
    result.current.phaseEntrance.open,
    false,
    "이미 떠 있던 DAY 파치먼트도 사망 연출이 뒤늦게 도착하면 즉시 뒤로 물러난다",
  )

  act(() => {
    result.current.killReveal.consume(result.current.killReveal.revealId)
  })
  assert.equal(result.current.phaseEntrance.open, true)

  unmount()
})

test("사망자가 없으면(victim null·보호 성공) 사망 연출 없이 DAY 진입 연출이 곧바로 뜬다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  fireNightResult(fake, {
    victimUuid: null,
    deathReveals: [],
    players: [
      { uuid: SELF_UUID, alive: true },
      { uuid: VICTIM_UUID, alive: true },
    ],
  })
  applyCanonicalState({ phase: "DAY", dayIndex: 2 })

  assert.equal(result.current.killReveal.open, false)
  assert.equal(result.current.phaseEntrance.open, true)

  unmount()
})

test("사망 연출 소비는 어떤 소켓 emit/ack도 만들지 않는다(로컬 표시 전용, no gameplay mutation)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  fireNightResult(fake)
  applyCanonicalState({ phase: "DAY", dayIndex: 2 })

  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.killReveal.consume(result.current.killReveal.revealId)
  })
  act(() => {
    result.current.phaseEntrance.confirm()
  })

  assert.equal(fake.emitCalls.length, emitsBefore)
  assert.equal(fake.emitWithAckCalls.length, acksBefore)
  unmount()
})

test("live root(InGamePage)가 kill reveal 오버레이를 실제로 마운트하고 killReveal 상태를 그대로 배선한다", () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL("../../pages/InGamePage.jsx", import.meta.url)),
    "utf8",
  )

  assert.match(pageSource, /InGameKillRevealOverlay/)
  assert.match(pageSource, /open=\{killReveal\.open\}/)
  assert.match(pageSource, /revealId=\{killReveal\.revealId\}/)
  assert.match(pageSource, /message=\{killReveal\.message\}/)
  assert.match(pageSource, /onConsume=\{killReveal\.consume\}/)

  const stackSource = readFileSync(
    fileURLToPath(new URL("../useInGameOverlayStack.js", import.meta.url)),
    "utf8",
  )
  assert.match(stackSource, /useInGameKillReveal/)
})

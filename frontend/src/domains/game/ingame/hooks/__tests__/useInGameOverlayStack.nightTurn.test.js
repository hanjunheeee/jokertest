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

const GAME_ID = "game-overlay-1"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"

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
  }

  return { socket, emitCalls, emitWithAckCalls }
}

function buildState({ phase, dayIndex, nightTurnRole }) {
  return {
    id: GAME_ID,
    phase,
    dayIndex,
    players: [
      { uuid: SELF_UUID, nickname: "나" },
      { uuid: OTHER_UUID, nickname: "상대" },
    ],
    self: {
      uuid: SELF_UUID,
      nickname: "나",
      role: "JOKER",
      team: "JOKER",
      hasActedThisPhase: false,
      allies: [],
    },
    ...(nightTurnRole ? { nightTurnRole } : {}),
  }
}

function applyCanonicalState({ phase, dayIndex, nightTurnRole }) {
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: buildState({ phase, dayIndex, nightTurnRole }),
    })
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

test("오버레이 순서: 역할 공개 → 진입 연출 → 역할 턴 안내 순으로만 열린다", () => {
  const { result, unmount } = mountLiveOverlayStack()

  // 1) 역할 공개가 가장 먼저다.
  assert.equal(result.current.roleReveal.open, true)
  assert.equal(result.current.phaseEntrance.open, false)
  assert.equal(result.current.nightTurn.open, false)

  // canonical하게 밤에 들어가도 앞 순서가 떠 있는 동안에는 아무것도 앞지르지 못한다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.phaseEntrance.open, false, "역할 공개가 먼저다")
  assert.equal(result.current.nightTurn.open, false)

  // 2) 역할 공개를 닫으면 진입 연출("밤이 되었습니다")이 뜬다.
  act(() => {
    result.current.roleReveal.close()
  })
  assert.equal(result.current.phaseEntrance.open, true)
  assert.equal(result.current.phaseEntrance.message, "밤이 되었습니다")
  assert.equal(
    result.current.nightTurn.open,
    false,
    "밤 진입 연출이 닫히기 전에는 역할 턴 안내가 뜨지 않는다",
  )

  // 3) 진입 연출을 닫아야 비로소 역할 턴 안내가 뜬다.
  act(() => {
    result.current.phaseEntrance.confirm()
  })
  assert.equal(result.current.nightTurn.open, true)
  assert.equal(result.current.nightTurn.role, "JOKER")
  assert.equal(result.current.nightTurn.announcement.message, "광대의 시간입니다")

  unmount()
})

test("역할 턴 안내를 닫아도 다음 역할이 이어지지 않고 소켓 emit도 나가지 않는다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()

  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  act(() => {
    result.current.phaseEntrance.confirm()
  })
  assert.equal(result.current.nightTurn.announcement.message, "광대의 시간입니다")

  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.nightTurn.close()
  })

  assert.equal(result.current.nightTurn.open, false)
  assert.equal(fake.emitCalls.length, emitsBefore, "닫기는 어떤 emit도 하지 않는다")
  assert.equal(fake.emitWithAckCalls.length, acksBefore, "닫기는 역할 확인 ack도 보내지 않는다")

  // 닫은 뒤 같은 밤이 반복 관측돼도 의사·경호원·마녀사냥꾼 안내가 이어지지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.nightTurn.open, false)
  assert.equal(result.current.nightTurn.announcement, null)

  unmount()
})

test("역할 턴 안내는 아래 게임 표면의 입력을 잠그지 않는다(기존 동작 유지)", () => {
  const { result, unmount } = mountLiveOverlayStack()

  act(() => {
    result.current.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.interactionBlocked, true, "진입 연출은 아래 화면을 잠근다")

  act(() => {
    result.current.phaseEntrance.confirm()
  })
  assert.equal(result.current.nightTurn.open, true)
  assert.equal(
    result.current.interactionBlocked,
    false,
    "역할 턴 안내가 떠 있어도 밤 행동 UI는 조작 가능하다",
  )

  unmount()
})

test("live root(InGamePage)가 교정된 컨트롤러를 그대로 쓴다", () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL("../../pages/InGamePage.jsx", import.meta.url)),
    "utf8",
  )

  // 페이지는 자체 역할 턴 상태를 만들지 않고 useInGameOverlayStack 하나만 쓴다.
  assert.match(pageSource, /useInGameOverlayStack\(\)/)
  assert.match(pageSource, /nightTurn/)
  assert.match(pageSource, /open=\{nightTurn\.open\}/)
  assert.match(pageSource, /announcement=\{nightTurn\.announcement\}/)
  assert.match(pageSource, /onClose=\{nightTurn\.close\}/)

  const stackSource = readFileSync(
    fileURLToPath(new URL("../useInGameOverlayStack.js", import.meta.url)),
    "utf8",
  )
  assert.match(stackSource, /useInGameNightTurnAnnouncement/)

  // 로컬 큐를 되살릴 수 있는 예전 API는 어디에도 남아 있지 않아야 한다.
  const controllerSource = readFileSync(
    fileURLToPath(new URL("../useInGameNightTurnAnnouncement.js", import.meta.url)),
    "utf8",
  )
  assert.doesNotMatch(controllerSource, /getInGameNightTurnAnnouncements/)
  assert.doesNotMatch(controllerSource, /cursor/)
})

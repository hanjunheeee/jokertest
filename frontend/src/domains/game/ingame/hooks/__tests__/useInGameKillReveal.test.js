import test, { mock } from "node:test"
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
const { useInGameKillReveal } = await import("../useInGameKillReveal.js")

const GAME_ID = "game-kill-1"
const SELF_UUID = "uuid-self"
const P1 = "p1"
const P2 = "p2"
const P3 = "p3"

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

function buildRoster() {
  return [
    { uuid: SELF_UUID, nickname: "나", alive: true },
    { uuid: P1, nickname: "피해자1", alive: true },
    { uuid: P2, nickname: "피해자2", alive: true },
    { uuid: P3, nickname: "관전자", alive: true },
  ]
}

function seedCanonicalState({ phase = "NIGHT", dayIndex = 1 } = {}) {
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase,
        dayIndex,
        players: buildRoster(),
        self: { uuid: SELF_UUID, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      },
    })
  })
}

function mountKillReveal({ hold = false } = {}) {
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  seedCanonicalState()

  const rendered = renderHook(
    ({ hold: holdProp }) => useInGameKillReveal({ hold: holdProp }),
    { initialProps: { hold } },
  )
  return { ...rendered, fake }
}

function resetStores() {
  act(() => {
    useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
    useAuthStore.setState({ user: null })
  })
  setFakeSocket(null)
}

function fireNightResult(fake, overrides = {}) {
  act(() => {
    fake.socket.fire("night_result_applied", {
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex: 2,
      victimUuid: P1,
      players: buildRoster().map((p) => ({ uuid: p.uuid, alive: p.uuid !== P1 })),
      deathReveals: [{ victimUuid: P1, source: "JOKER" }],
      ...overrides,
    })
  })
}

test("사망 연출이 없으면(victim null·보호 성공) 오버레이가 열리지 않는다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake, { victimUuid: null, deathReveals: [] })

  assert.equal(result.current.open, false)
  assert.equal(result.current.revealId, null)
  unmount()
})

test("정상 사망 연출 하나는 오버레이를 열고 공개 메시지를 만든다(살해자 identity 없음)", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake)

  assert.equal(result.current.open, true)
  assert.notEqual(result.current.revealId, null)
  assert.equal(result.current.message, "광대들이 피해자1 님을 죽였습니다.")
  unmount()
})

test("여러 희생자가 한 payload에 있으면(멀티 킬) 순서대로 이어지고 마지막 소비 후에만 닫힌다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake, {
    victimUuid: null,
    deathReveals: [
      { victimUuid: P1, source: "JOKER" },
      { victimUuid: P2, source: "WITCH_HUNTER" },
    ],
  })

  assert.equal(result.current.open, true)
  const firstId = result.current.revealId
  assert.equal(result.current.message, "광대들이 피해자1 님을 죽였습니다.")

  act(() => {
    result.current.consume(firstId)
  })

  assert.equal(result.current.open, true, "큐에 다음 항목이 남아 있으면 계속 열려 있어야 한다")
  assert.notEqual(result.current.revealId, firstId)
  assert.equal(result.current.message, "마녀사냥꾼이 피해자2 님을 처단했습니다.")

  act(() => {
    result.current.consume(result.current.revealId)
  })

  assert.equal(result.current.open, false, "큐가 다 비면 닫힌다")
  unmount()
})

test("stale id로 consume해도(이전 reveal의 늦은 콜백) 지금 떠 있는 reveal은 소비되지 않는다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake)
  const currentId = result.current.revealId

  act(() => {
    result.current.consume("this-id-does-not-exist")
  })

  assert.equal(result.current.open, true)
  assert.equal(result.current.revealId, currentId, "stale id는 현재 reveal을 건드리지 못한다")
  unmount()
})

test("정확한 id로 consume하면 정확히 한 번만 소비되고 이후 같은 id 재호출은 아무 효과가 없다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake)
  const currentId = result.current.revealId

  act(() => {
    result.current.consume(currentId)
  })
  assert.equal(result.current.open, false)

  act(() => {
    result.current.consume(currentId)
  })
  assert.equal(result.current.open, false, "이미 소비된 id의 재호출은 아무 일도 하지 않는다")
  unmount()
})

test("완전히 동일한 payload가 중복 전달되면(재전송·리렌더) 같은 reveal을 다시 큐에 넣지 않는다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake)
  const firstId = result.current.revealId
  act(() => {
    result.current.consume(firstId)
  })
  assert.equal(result.current.open, false)

  fireNightResult(fake) // 완전히 동일한 payload 재전송
  assert.equal(result.current.open, false, "이미 본 identity는 다시 재생되지 않는다")
  unmount()
})

test("다른 gameId의 방송은 무시된다", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake, { gameId: "other-game" })

  assert.equal(result.current.open, false)
  unmount()
})

test("canonical roster에 없는 victimUuid는 걸러진다(위조 방어)", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake, { victimUuid: "ghost", deathReveals: [{ victimUuid: "ghost", source: "JOKER" }] })

  assert.equal(result.current.open, false)
  unmount()
})

test("hold가 true인 동안에는(자기 역할 공개가 떠 있음) 새 사망 연출이 들어와도 열리지 않는다", () => {
  resetStores()
  const { result, fake, rerender, unmount } = mountKillReveal({ hold: true })

  fireNightResult(fake)
  assert.equal(result.current.open, false, "hold 중에는 대기만 한다")

  rerender({ hold: false })
  assert.equal(result.current.open, true, "hold가 풀리면 즉시 뜬다")
  unmount()
})

test("완료 처리(consume)는 어떤 소켓 emit/ack도 만들지 않는다(로컬 표시 전용)", () => {
  resetStores()
  const { result, fake, unmount } = mountKillReveal()

  fireNightResult(fake)
  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.consume(result.current.revealId)
  })

  assert.equal(fake.emitCalls.length, emitsBefore)
  assert.equal(fake.emitWithAckCalls.length, acksBefore)
  unmount()
})

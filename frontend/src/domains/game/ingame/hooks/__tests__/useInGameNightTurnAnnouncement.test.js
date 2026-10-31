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
const { useInGameNightTurnAnnouncement } = await import("../useInGameNightTurnAnnouncement.js")
const { getInGameNightActionType } = await import("../../constants/actions/ingameActionPanel.js")

const GAME_ID = "game-1"
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
    fire(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args)
    },
  }

  return { socket, emitCalls, emitWithAckCalls }
}

function buildSelf() {
  return {
    uuid: SELF_UUID,
    nickname: "나",
    role: "JOKER",
    team: "JOKER",
    hasActedThisPhase: false,
    allies: [],
  }
}

function buildPlayers() {
  return [
    { uuid: SELF_UUID, nickname: "나" },
    { uuid: OTHER_UUID, nickname: "상대" },
  ]
}

function buildState({ phase, dayIndex, nightTurnRole }) {
  return {
    id: GAME_ID,
    phase,
    dayIndex,
    players: buildPlayers(),
    self: buildSelf(),
    ...(nightTurnRole ? { nightTurnRole } : {}),
  }
}

function applyCanonicalState({ phase, dayIndex, nightTurnRole, gameId = GAME_ID }) {
  const serverNightTurnRole =
    phase === "NIGHT" && nightTurnRole === undefined ? "JOKER" : nightTurnRole
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId,
      state: buildState({ phase, dayIndex, nightTurnRole: serverNightTurnRole }),
    })
  })
}

function applySnapshot({ phase, dayIndex }) {
  act(() => {
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase,
      dayIndex,
      players: [
        { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
        { uuid: OTHER_UUID, nickname: "상대", isAlive: true, isConnected: true },
      ],
      self: buildSelf(),
    })
  })
}

function mountAtRoleReveal({ hold = false } = {}) {
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  const rendered = renderHook(
    ({ hold: holdProp }) => useInGameNightTurnAnnouncement({ hold: holdProp }),
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

function messageOf(result) {
  return result.current.announcement?.message ?? null
}

test("canonical 역할 턴이 JOKER면 광대 안내 하나만 뜬다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  assert.equal(result.current.open, false, "ROLE_REVEAL에는 역할 턴 안내가 없다")

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, true)
  assert.equal(result.current.role, "JOKER")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("광대 안내를 닫아도 이후 역할 안내가 저절로 뜨지 않고 광대 밤 행동 UI는 그대로다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(messageOf(result), "광대의 시간입니다")

  act(() => {
    result.current.close()
  })

  assert.equal(result.current.open, false, "닫은 안내는 사라진다")
  assert.equal(result.current.announcement, null)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false, "의사·경비원·마녀사냥꾼 안내가 로컬로 이어지지 않는다")
  assert.equal(result.current.announcement, null)

  const { self, dayIndex } = useInGameStore.getState().state
  assert.equal(getInGameNightActionType(self.role, dayIndex), "ASSASSINATE")

  unmount()
})

test("같은 턴에서 반복되는 canonical 갱신은 안내를 다시 열지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  act(() => {
    result.current.close()
  })
  assert.equal(result.current.open, false)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applySnapshot({ phase: "NIGHT", dayIndex: 1 })
  applySnapshot({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false)

  unmount()
})

test("canonical 역할 턴이 DOCTOR로 바뀌면 의사 안내가 정확히 한 번 뜬다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(messageOf(result), "광대의 시간입니다")
  act(() => {
    result.current.close()
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(result.current.open, true)
  assert.equal(result.current.role, "DOCTOR")
  assert.equal(messageOf(result), "의사의 시간입니다")

  act(() => {
    result.current.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(result.current.open, false)

  unmount()
})

test("의사 안내를 닫아도 경비원 안내가 로컬로 뜨지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(messageOf(result), "의사의 시간입니다")

  act(() => {
    result.current.close()
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(result.current.open, false)
  assert.equal(result.current.announcement, null, "경비원 안내를 프런트가 만들어내지 않는다")

  unmount()
})

test("이후 canonical 역할 턴 변경마다 그에 대응하는 안내 하나만 뜬다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  const seen = []
  const observe = () => {
    if (result.current.open) seen.push([result.current.role, messageOf(result)])
  }

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  observe()
  act(() => {
    result.current.close()
  })

  for (const role of ["DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: role })
    observe()
    act(() => {
      result.current.close()
    })
    assert.equal(result.current.open, false)
  }

  assert.deepEqual(seen, [
    ["JOKER", "광대의 시간입니다"],
    ["DOCTOR", "의사의 시간입니다"],
    ["GUARD", "경비원의 시간입니다"],
    ["WITCH_HUNTER", "마녀사냥꾼의 시간입니다"],
  ])

  unmount()
})

test("서버가 시작한 역할 턴은 로컬 행동 가능 여부와 무관하게 안내한다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "WITCH_HUNTER" })

  assert.equal(result.current.open, true)
  assert.equal(messageOf(result), "마녀사냥꾼의 시간입니다")

  act(() => {
    result.current.close()
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "WITCH_HUNTER" })
  assert.equal(result.current.open, false)

  unmount()
})

test("앞 순서 오버레이(진입 연출)가 떠 있는 동안에는 뜨지 않고 소비되지도 않는다", () => {
  resetStores()
  const { result, rerender, unmount } = mountAtRoleReveal({ hold: true })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, false, "'밤이 되었습니다'가 떠 있는 동안에는 뜨지 않는다")

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  rerender({ hold: false })

  assert.equal(result.current.open, true, "진입 연출이 닫히면 반드시 뜬다")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("안내를 닫아도 소켓 emit(밤 행동·역할 확인 등)이 전혀 나가지 않는다", () => {
  resetStores()
  const { result, fake, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.close()
  })

  assert.equal(fake.emitCalls.length, emitsBefore, "닫기는 어떤 emit도 하지 않는다")
  assert.equal(fake.emitWithAckCalls.length, acksBefore, "닫기는 역할 확인 ack도 보내지 않는다")
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().state.dayIndex, 1)

  unmount()
})

test("이전 날짜의 늦은 닫기 콜백은 새 안내를 대신 닫지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  const staleClose = result.current.close

  applyCanonicalState({ phase: "DAY", dayIndex: 2 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 2 })
  assert.equal(result.current.open, true)

  act(() => {
    staleClose()
  })

  assert.equal(result.current.open, true, "이전 밤의 닫기는 무시된다")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("이전 계정·이전 게임의 늦은 닫기 콜백은 아무 일도 하지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  const staleClose = result.current.close

  act(() => {
    useAuthStore.setState({ user: { uuid: "uuid-other-account" } })
  })
  assert.equal(result.current.open, false, "계정이 바뀌면 남아 있던 안내가 사라진다")

  act(() => {
    staleClose()
  })
  assert.equal(result.current.open, false)

  unmount()
})

test("소켓 세대가 바뀌면 남아 있던 안내가 무효가 되고 늦은 콜백도 무시된다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)
  const staleClose = result.current.close

  const replacement = createFakeSocket()
  act(() => {
    setFakeSocket(replacement.socket)
  })

  assert.equal(result.current.open, false, "소켓 교체는 그 세대의 표시 상태를 버린다")

  act(() => {
    staleClose()
  })
  assert.equal(result.current.open, false)

  unmount()
})

test("NIGHT를 벗어나거나 ENDED가 되면 안내가 즉시 사라진다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  applyCanonicalState({ phase: "DAY", dayIndex: 2 })
  assert.equal(result.current.open, false, "NIGHT를 벗어나면 사라진다")

  applyCanonicalState({ phase: "NIGHT", dayIndex: 2 })
  assert.equal(result.current.open, true)

  applyCanonicalState({ phase: "ENDED", dayIndex: 2 })
  assert.equal(result.current.open, false, "ENDED에서는 남아 있지 않는다")
  assert.equal(result.current.announcement, null)

  unmount()
})

test("StrictMode의 이중 실행에도 같은 턴이 다시 열리지 않는다", () => {
  resetStores()
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  const { result, unmount } = renderHook(() => useInGameNightTurnAnnouncement({ hold: false }), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)
  assert.equal(messageOf(result), "광대의 시간입니다")

  act(() => {
    result.current.close()
  })
  assert.equal(result.current.open, false)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, false)

  unmount()
})

test("이미 진행 중인 밤으로의 스냅샷 복원은 baseline만 세우고 지나간 안내를 재생하지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applySnapshot({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false, "복원은 '방금 턴이 바뀐 것'이 아니다")
  assert.equal(result.current.announcement, null)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(result.current.open, true)
  assert.equal(messageOf(result), "의사의 시간입니다")

  unmount()
})

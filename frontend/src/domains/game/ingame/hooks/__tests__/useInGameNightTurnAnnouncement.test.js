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

// 훅이 최상단에서 import하는 socketClient를 제어 가능한 fake로 바꾼다(소켓 세대 축을 테스트에서
// 직접 움직이기 위해서다). mock.module은 아직 로드되지 않은 specifier에만 적용되므로 훅·store
// 모듈은 이 등록 이후에 동적 import한다.
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

/**
 * 이 파일의 모든 테스트는 실제 store·실제 인증 store·실제 훅만 쓴다(정상 경로). canonical
 * 상태는 언제나 store의 실제 액션(setGamePayload/applySessionSnapshot)으로만 움직인다 —
 * 훅 내부 상태를 직접 건드리는 경로는 하나도 없다.
 */
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

/** canonical state 하나를 만든다. nightTurnRole은 서버가 역할 턴을 명시하는 경우를 나타낸다. */
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
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId,
      state: buildState({ phase, dayIndex, nightTurnRole }),
    })
  })
}

/** 재접속 스냅샷 정상 경로(get_session_snapshot 응답 → applySessionSnapshot). */
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

/**
 * 정상 경로의 마운트 상태를 만든다: 게임 시작 직후(ROLE_REVEAL)에 인게임 화면이 이미 떠 있는
 * 상태 — 실제 InGamePage가 마운트되는 시점과 같다. 이 시점에는 역할 턴이 없어 안내도 없다.
 */
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

  // 닫은 뒤 리렌더·상태 재관측이 반복돼도 다음 역할이 로컬로 등장하지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false, "의사·경호원·마녀사냥꾼 안내가 로컬로 이어지지 않는다")
  assert.equal(result.current.announcement, null)

  // canonical 역할 턴은 여전히 JOKER이고, 밤 행동 UI 판정(InGameActionPanel이 그대로 쓰는
  // getInGameNightActionType — ingameActionPanel.js)도 광대 행동을 계속 허용한다.
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

  // 같은 밤·같은 턴의 roster/연결 상태 갱신과 스냅샷 재적용이 반복돼도 다시 열리지 않는다.
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

  // 서버발 canonical 턴 변경만이 다음 안내를 연다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(result.current.open, true)
  assert.equal(result.current.role, "DOCTOR")
  assert.equal(messageOf(result), "의사의 시간입니다")

  act(() => {
    result.current.close()
  })
  // 같은 DOCTOR 턴이 다시 관측돼도 두 번째로 열리지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(result.current.open, false)

  unmount()
})

test("의사 안내를 닫아도 경호원 안내가 로컬로 뜨지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(messageOf(result), "의사의 시간입니다")

  act(() => {
    result.current.close()
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(result.current.open, false)
  assert.equal(result.current.announcement, null, "경호원 안내를 프런트가 만들어내지 않는다")

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
    ["GUARD", "경호원의 시간입니다"],
    ["WITCH_HUNTER", "마녀사냥꾼의 시간입니다"],
  ])

  unmount()
})

test("canonical하게 건너뛰는 역할 턴은 한 번도 뜨지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  // 첫 밤(dayIndex 0)의 마녀사냥꾼은 그 밤에 행동 자체가 불가능해 canonical하게 건너뛴다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "WITCH_HUNTER" })

  assert.equal(result.current.open, false, "건너뛰는 역할은 한 프레임도 깜빡이지 않는다")
  assert.equal(result.current.announcement, null)

  // 같은 밤에 반복 갱신이 와도 마찬가지다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "WITCH_HUNTER" })
  assert.equal(result.current.open, false)

  unmount()
})

test("앞 순서 오버레이(진입 연출)가 떠 있는 동안에는 뜨지 않고 소비되지도 않는다", () => {
  resetStores()
  const { result, rerender, unmount } = mountAtRoleReveal({ hold: true })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, false, "'밤이 되었습니다'가 떠 있는 동안에는 뜨지 않는다")

  // 대기 중에 같은 턴이 여러 번 관측돼도 소비되지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  // rerender는 이미 act로 감싸여 있다(중첩 act를 피한다).
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
  // 이 훅은 canonical store도 건드리지 않는다.
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().state.dayIndex, 1)

  unmount()
})

test("이전 날짜의 늦은 닫기 콜백은 새 안내를 대신 닫지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  const staleClose = result.current.close

  // 다음 밤으로 넘어가면 새 identity의 안내가 뜬다.
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

  // 다른 계정으로 바뀌면 그 세대의 대기·표시 상태는 전부 무효가 된다.
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

  // 닫은 뒤 같은 턴이 다시 관측돼도(중복 방송·리렌더·이중 실행) 재오픈되지 않는다.
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

  // 복원 이후의 실시간 canonical 변경은 정상적으로 안내한다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  assert.equal(result.current.open, true)
  assert.equal(messageOf(result), "의사의 시간입니다")

  unmount()
})

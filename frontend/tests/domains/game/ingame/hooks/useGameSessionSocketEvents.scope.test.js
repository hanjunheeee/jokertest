import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

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
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore, readInGameReceiptScope } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")

const GAME_ID = "game-scope-guard"
const SELF = "uuid-self"
const V1 = "uuid-v1"
const V2 = "uuid-v2"

const ROSTER = [
  { uuid: SELF, nickname: "나", alive: true, membershipId: "mem-self" },
  { uuid: V1, nickname: "첫째", alive: true, membershipId: "mem-v1" },
  { uuid: V2, nickname: "둘째", alive: true, membershipId: "mem-v2" },
]

function createFakeSocket({ id = "sock-1" } = {}) {
  const listeners = new Map()
  return {
    id,
    connected: true,
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
    handlersOf(event) {
      return [...(listeners.get(event) ?? [])]
    },
  }
}

function seedSession({ phase = "DAY", dayIndex = 1, tribunal = null } = {}) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "나" }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null, state: null, hostUuid: null, error: null,
      snapshotSeq: 0, snapshotResultOwner: null, nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase,
        dayIndex,
        dayPhase: phase === "DAY" ? "DAY_DISCUSSION" : null,
        players: ROSTER.map((p) => ({ ...p })),
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        ...(tribunal ? { tribunal } : {}),
      },
    })
  })
}

function open() {
  navigateCalls.length = 0
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const rendered = renderHook(() => useGameSessionSocketEvents())
  return {
    socket,
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    close() {
      rendered.unmount()
      act(() => setSocket(null))
    },
  }
}

function storeFacts() {
  const { gameId, state } = useInGameStore.getState()
  return JSON.stringify({
    gameId,
    phase: state?.phase ?? null,
    dayPhase: state?.dayPhase ?? null,
    dayIndex: state?.dayIndex ?? null,
    players: (state?.players ?? []).map((p) => ({ uuid: p.uuid, alive: p.alive })),
    tribunal: state?.tribunal ?? null,
    dayVoteResolution: state?.dayVoteResolution ?? null,
    winResult: state?.winResult ?? null,
  })
}

function terminalEliminatedPayload({ victimUuid = V1, deadUuids = null, dayIndex = 1 } = {}) {
  const dead = new Set(deadUuids ?? [victimUuid])
  return {
    gameId: GAME_ID,
    phase: "ENDED",
    dayIndex,
    victimUuid,
    players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: !dead.has(p.uuid) })),
    winResult: { winner: "CITIZEN" },
  }
}

function guiltyTribunalPayload({ defendantUuid = V1, dayIndex = 1 } = {}) {
  return {
    gameId: GAME_ID,
    phase: "TRIBUNAL",
    dayIndex,
    defendantUuid,
    outcome: "GUILTY",
    executedUuid: defendantUuid,
    counts: { guilty: 2, notGuilty: 0 },
  }
}

test("F-23(AC-05 보수): 연결 교체 뒤 옛 구독이 받은 player_eliminated는 store를 바꾸지 않고, 현재 구독이 받은 같은 사건은 1회 반영된다", () => {
  seedSession({ phase: "DAY", dayIndex: 1 })
  const session = open()

  const staleHandlers = session.socket.handlersOf("player_eliminated")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(terminalEliminatedPayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 사망 사건이 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.phase, "DAY", "옛 구독의 사건이 canonical 종료를 저장했다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null, "옛 구독의 사건이 종료 결과를 실었다")

  act(() => next.deliver("player_eliminated", terminalEliminatedPayload()))

  const applied = useInGameStore.getState().state
  assert.equal(applied.phase, "ENDED", "현재 구독의 정상 사건까지 막혔다")
  assert.deepEqual(applied.winResult, { winner: "CITIZEN" })
  assert.equal(applied.players.find((p) => p.uuid === V1).alive, false)
  assert.equal(applied.players.find((p) => p.uuid === V2).alive, true, "사건이 말하지 않은 생존까지 바꿨다")

  const afterFirst = storeFacts()
  act(() => next.deliver("player_eliminated", terminalEliminatedPayload()))
  assert.equal(storeFacts(), afterFirst, "같은 사건이 두 번 반영됐다")

  session.close()
})

test("F-23(AC-05 보수): 연결 교체 뒤 옛 구독이 받은 tribunal_vote_resolved는 store를 바꾸지 않고, 현재 구독이 받은 같은 사건은 1회 반영된다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: V1 } })
  const session = open()

  const staleHandlers = session.socket.handlersOf("tribunal_vote_resolved")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(guiltyTribunalPayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 재판 결과가 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.tribunal.resolved ?? null, null, "옛 구독의 사건이 판정을 확정했다")
  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === V1).alive, true,
    "옛 구독의 사건이 처형을 반영했다",
  )

  act(() => next.deliver("tribunal_vote_resolved", guiltyTribunalPayload()))

  const applied = useInGameStore.getState().state
  assert.equal(applied.tribunal.resolved, true, "현재 구독의 정상 사건까지 막혔다")
  assert.equal(applied.tribunal.outcome, "GUILTY")
  assert.deepEqual(applied.tribunal.counts, { guilty: 2, notGuilty: 0 })
  assert.equal(applied.players.find((p) => p.uuid === V1).alive, false)
  assert.equal(applied.players.find((p) => p.uuid === V2).alive, true)

  const afterFirst = storeFacts()
  act(() => next.deliver("tribunal_vote_resolved", guiltyTribunalPayload()))
  assert.equal(storeFacts(), afterFirst, "같은 판정이 두 번 반영됐다")

  session.close()
})

test("F-23(AC-05 보수): 계정이 교체되면 옛 신원의 구독이 받은 두 공개 사건도 현재 화면을 바꾸지 못한다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: V1 } })
  const session = open()

  const staleTribunal = session.socket.handlersOf("tribunal_vote_resolved")
  const staleEliminated = session.socket.handlersOf("player_eliminated")

  act(() => {
    useAuthStore.setState({
      isLoggedIn: true,
      user: { uuid: "uuid-other-account", nickname: "남" },
      identityGeneration: (useAuthStore.getState().identityGeneration ?? 0) + 1,
    })
  })

  const before = storeFacts()
  act(() => {
    for (const handler of staleTribunal) handler(guiltyTribunalPayload())
    for (const handler of staleEliminated) handler(terminalEliminatedPayload())
  })

  assert.equal(storeFacts(), before, "이전 신원의 구독이 받은 공개 사건이 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null)

  session.close()
})

test("F-23(AC-05 보수): 가드는 정상 경로를 막지 않는다 — 전이 없이 도착한 두 공개 사건은 그대로 반영된다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: V1 } })
  const session = open()

  session.deliver("tribunal_vote_resolved", guiltyTribunalPayload())

  const afterTribunal = useInGameStore.getState().state
  assert.equal(afterTribunal.tribunal.resolved, true)
  assert.equal(afterTribunal.players.find((p) => p.uuid === V1).alive, false)

  session.deliver("player_eliminated", terminalEliminatedPayload({ victimUuid: V2, deadUuids: [V1, V2] }))

  const afterEliminated = useInGameStore.getState().state
  assert.equal(afterEliminated.phase, "ENDED")
  assert.deepEqual(afterEliminated.winResult, { winner: "CITIZEN" })
  assert.equal(afterEliminated.players.find((p) => p.uuid === V1).alive, false)
  assert.equal(afterEliminated.players.find((p) => p.uuid === V2).alive, false)

  session.close()
})

function firstDayPhasePayload() {
  return { gameId: GAME_ID, phase: "DAY", dayIndex: 1 }
}

function tribunalDayVotePayload({ tribunalTargetUuid = V1, dayIndex = 1 } = {}) {
  return {
    gameId: GAME_ID,
    dayIndex,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid,
    publicVoteCount: 2,
    publicAbstainCount: 0,
  }
}

function dayVoteOpenPayload({ dayIndex = 1 } = {}) {
  return { gameId: GAME_ID, dayIndex, dayPhase: "DAY_VOTE", round: 1 }
}

test("F-23(AC-05 보수): 연결 교체 뒤 옛 구독이 받은 game_phase_changed는 store를 바꾸지 않고, 현재 구독이 받은 같은 사건은 1회 반영된다", () => {
  seedSession({ phase: "ROLE_REVEAL", dayIndex: 0 })
  const session = open()

  const staleHandlers = session.socket.handlersOf("game_phase_changed")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(firstDayPhasePayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 단계 전이가 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL", "옛 구독의 사건이 단계를 진행시켰다")

  act(() => next.deliver("game_phase_changed", firstDayPhasePayload()))

  const applied = useInGameStore.getState().state
  assert.equal(applied.phase, "DAY", "현재 구독의 정상 사건까지 막혔다")
  assert.equal(applied.dayIndex, 1)
  assert.equal(applied.dayPhase, "DAY_DISCUSSION")

  const afterFirst = storeFacts()
  act(() => next.deliver("game_phase_changed", firstDayPhasePayload()))
  assert.equal(storeFacts(), afterFirst, "같은 사건이 두 번 반영됐다")

  session.close()
})

test("F-23(AC-05 보수): 연결 교체 뒤 옛 구독이 받은 day_vote_resolved는 store를 바꾸지 않고, 현재 구독이 받은 같은 사건은 1회 반영된다", () => {
  seedSession({ phase: "DAY", dayIndex: 1 })
  const session = open()

  const staleHandlers = session.socket.handlersOf("day_vote_resolved")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(tribunalDayVotePayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 낮 판정이 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.phase, "DAY", "옛 구독의 사건이 재판으로 진입시켰다")
  assert.equal(useInGameStore.getState().state.tribunal ?? null, null, "옛 구독의 사건이 피고를 확정했다")

  act(() => next.deliver("day_vote_resolved", tribunalDayVotePayload()))

  const applied = useInGameStore.getState().state
  assert.equal(applied.phase, "TRIBUNAL", "현재 구독의 정상 사건까지 막혔다")
  assert.equal(applied.tribunal.defendantUuid, V1)
  assert.equal(applied.dayVoteResolution.outcome, "TRIBUNAL")

  const afterFirst = storeFacts()
  act(() => next.deliver("day_vote_resolved", tribunalDayVotePayload()))
  assert.equal(storeFacts(), afterFirst, "같은 판정이 두 번 반영됐다")

  session.close()
})

test("F-23(AC-05 보수): 연결 교체 뒤 옛 구독이 받은 day_phase_changed는 store를 바꾸지 않고, 현재 구독이 받은 같은 사건은 1회 반영된다", () => {
  seedSession({ phase: "DAY", dayIndex: 1 })
  const session = open()
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION", "전제: 토론 구간에서 시작한다")

  const staleHandlers = session.socket.handlersOf("day_phase_changed")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(dayVoteOpenPayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 낮 하위 전이가 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION", "옛 구독의 사건이 투표 창을 열었다")

  act(() => next.deliver("day_phase_changed", dayVoteOpenPayload()))

  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_VOTE", "현재 구독의 정상 사건까지 막혔다")

  const afterFirst = storeFacts()
  act(() => next.deliver("day_phase_changed", dayVoteOpenPayload()))
  assert.equal(storeFacts(), afterFirst, "같은 사건이 두 번 반영됐다")

  session.close()
})

test("F-23(AC-05 보수): 계정이 교체되면 옛 신원의 구독이 받은 단계 계열 세 사건도 현재 화면을 바꾸지 못한다", () => {
  seedSession({ phase: "ROLE_REVEAL", dayIndex: 0 })
  const session = open()

  const stalePhase = session.socket.handlersOf("game_phase_changed")
  const staleDayVote = session.socket.handlersOf("day_vote_resolved")
  const staleDayPhase = session.socket.handlersOf("day_phase_changed")

  act(() => {
    useAuthStore.setState({
      isLoggedIn: true,
      user: { uuid: "uuid-other-account", nickname: "남" },
      identityGeneration: (useAuthStore.getState().identityGeneration ?? 0) + 1,
    })
  })

  const before = storeFacts()
  act(() => {
    for (const handler of stalePhase) handler(firstDayPhasePayload())
    for (const handler of staleDayPhase) handler(dayVoteOpenPayload())
    for (const handler of staleDayVote) handler(tribunalDayVotePayload())
  })

  assert.equal(storeFacts(), before, "이전 신원의 구독이 받은 단계 사건이 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")

  session.close()
})

test("F-23(AC-05 보수): 단계 계열 가드도 정상 경로를 막지 않는다 — 전이 없이 도착한 세 사건은 순서대로 반영된다", () => {
  seedSession({ phase: "ROLE_REVEAL", dayIndex: 0 })
  const session = open()

  session.deliver("game_phase_changed", firstDayPhasePayload())
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION")

  session.deliver("day_phase_changed", dayVoteOpenPayload())
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_VOTE")

  session.deliver("day_vote_resolved", tribunalDayVotePayload())
  const resolved = useInGameStore.getState().state
  assert.equal(resolved.phase, "TRIBUNAL")
  assert.equal(resolved.tribunal.defendantUuid, V1)
  assert.equal(resolved.dayPhase ?? null, null, "재판으로 넘어갔는데 낮 하위 구간이 남았다")

  session.close()
})

test("F-23(AC-05 보수): 같은 범위에서 캡처한 수신 증거는 커밋되고, 그 뒤 연결이 교체되면 같은 증거는 거절된다", () => {
  seedSession({ phase: "DAY", dayIndex: 1 })
  const socket = createFakeSocket()
  act(() => setSocket(socket))

  const receipt = readInGameReceiptScope({
    accountId: SELF,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })

  const parsed = {
    gameId: GAME_ID,
    phase: "ENDED",
    dayIndex: 1,
    victimUuid: V1,
    players: ROSTER.map((p) => ({ uuid: p.uuid, alive: p.uuid !== V1 })),
    terminal: true,
    winResult: { winner: "JOKER" },
  }

  act(() => useInGameStore.getState().applyPlayerEliminated(parsed, receipt))
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "현재 범위의 증거가 거절됐다")
  assert.deepEqual(useInGameStore.getState().state.winResult, { winner: "JOKER" })

  seedSession({ phase: "DAY", dayIndex: 1 })
  act(() => setSocket(createFakeSocket({ id: "sock-next" })))

  const before = storeFacts()
  act(() => useInGameStore.getState().applyPlayerEliminated(parsed, receipt))
  assert.equal(storeFacts(), before, "지난 범위의 수신 증거가 그대로 커밋됐다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null)

  act(() => setSocket(null))
})

import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-23(AC-05 보수) · **공개 사망·재판 결과에도 등록 범위 가드가 걸려 있는가.**
//
// 이 파일의 유일한 주제는 `useGameSessionSocketEvents`가 등록 시점의 수신 범위와 사건 도착
// 시점의 현재 범위를 대조하는 그 한 줄이다. 같은 파일의 night_result_applied·
// session_participation_changed 핸들러에는 그 가드가 이미 있었지만 player_eliminated와
// tribunal_vote_resolved에는 없어서, **교체되기 전 옛 소켓·옛 신원의 구독**이 늦게 받은
// 사망·재판 결과가 현재 화면의 canonical roster와 종료 결과(winResult)까지 바꿀 수 있었다.
//
// 그래서 두 축을 나란히 단언한다(하나만 보면 "아무것도 반영하지 않는" 퇴화를 통과시킨다).
//   · 옛 구독이 받은 사건 → store 사실 불변
//   · 현재 구독이 받은 **같은** 사건 → 정확히 1회 반영
//
// 옛 구독은 `handlersOf`로 전이 **전에** 실제 등록 콜백 참조를 쥐고 있다가 전이 후에 직접
// 부른다(useInGameKillReveal.test.js와 같은 관례) — effect 정리 시점에 기대지 않고, 등록이
// 그대로 남아 있었더라도 아무 일도 하지 않는다는 사실 자체를 확인하기 위해서다.
// ---------------------------------------------------------------------------

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
const { useInGameStore, readInGameReceiptScope } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../useGameSessionSocketEvents.js")

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
    /** 지금 **등록되어 있는 실제 콜백들**(전이 전에 쥐어 두고 전이 후에 직접 부른다). */
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

/** 이 화면의 사실 중 두 사건이 바꿀 수 있는 것 전부. 불변 단언은 이 한 벌을 통째로 비교한다. */
function storeFacts() {
  const { gameId, state } = useInGameStore.getState()
  return JSON.stringify({
    gameId,
    phase: state?.phase ?? null,
    dayIndex: state?.dayIndex ?? null,
    players: (state?.players ?? []).map((p) => ({ uuid: p.uuid, alive: p.alive })),
    tribunal: state?.tribunal ?? null,
    winResult: state?.winResult ?? null,
  })
}

/**
 * 끊김 사망이 그대로 승패를 확정하는 공개 방송(종료 결과를 함께 싣는다).
 *
 * deadUuids는 **그 시점까지 죽은 전원**이다 — 파서가 "이미 죽은 참가자를 다시 살리는 payload"를
 * 거부하므로, 앞선 사망이 있는 경우 그것까지 함께 실어야 정상 사건이 된다.
 */
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

/** 유죄 판정(처형 확정). 같은 dayIndex의 TRIBUNAL에서만 유효하다. */
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

  // 전이 전에 **실제 등록 콜백**을 쥔다.
  const staleHandlers = session.socket.handlersOf("player_eliminated")
  assert.equal(staleHandlers.length, 1, "전제: 전역 수신 훅이 이 사건을 구독하고 있어야 한다")

  // 연결 교체 — 훅은 새 연결의 문맥으로 다시 등록하고, 옛 콜백의 등록 범위는 지나간다.
  const next = createFakeSocket({ id: "sock-next" })
  act(() => setSocket(next))

  const before = storeFacts()
  act(() => {
    for (const handler of staleHandlers) handler(terminalEliminatedPayload())
  })

  assert.equal(storeFacts(), before, "옛 연결의 구독이 받은 사망 사건이 현재 화면의 사실을 바꿨다")
  assert.equal(useInGameStore.getState().state.phase, "DAY", "옛 구독의 사건이 canonical 종료를 저장했다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null, "옛 구독의 사건이 종료 결과를 실었다")

  // 같은 사건을 **현재 구독**이 받으면 정상 반영된다(영구 차단이 아니다).
  act(() => next.deliver("player_eliminated", terminalEliminatedPayload()))

  const applied = useInGameStore.getState().state
  assert.equal(applied.phase, "ENDED", "현재 구독의 정상 사건까지 막혔다")
  assert.deepEqual(applied.winResult, { winner: "CITIZEN" })
  assert.equal(applied.players.find((p) => p.uuid === V1).alive, false)
  assert.equal(applied.players.find((p) => p.uuid === V2).alive, true, "사건이 말하지 않은 생존까지 바꿨다")

  // 중복 방송은 이미 ENDED이므로 그대로 no-op이다(1회 반영).
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
  // 연결 축이 아니라 **계정 축**만 움직인다 — 같은 소켓, 같은 판, 다른 인증 신원이다.
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
  // 퇴화 대조. 위 세 시험이 전부 "바뀌지 않는다"이므로, 아무것도 반영하지 않는 구현이
  // 조용히 통과할 수 있다. 전이가 하나도 없는 정상 경로를 같은 파일에서 함께 고정한다.
  seedSession({ phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: V1 } })
  const session = open()

  session.deliver("tribunal_vote_resolved", guiltyTribunalPayload())

  const afterTribunal = useInGameStore.getState().state
  assert.equal(afterTribunal.tribunal.resolved, true)
  assert.equal(afterTribunal.players.find((p) => p.uuid === V1).alive, false)

  // 남은 한 명의 끊김 사망이 그대로 승패를 확정한다(같은 날, 현재 phase는 TRIBUNAL이 아니라
  // ENDED payload이므로 terminal 분기로 들어간다).
  session.deliver("player_eliminated", terminalEliminatedPayload({ victimUuid: V2, deadUuids: [V1, V2] }))

  const afterEliminated = useInGameStore.getState().state
  assert.equal(afterEliminated.phase, "ENDED")
  assert.deepEqual(afterEliminated.winResult, { winner: "CITIZEN" })
  assert.equal(afterEliminated.players.find((p) => p.uuid === V1).alive, false)
  assert.equal(afterEliminated.players.find((p) => p.uuid === V2).alive, false)

  session.close()
})

test("F-23(AC-05 보수): 같은 범위에서 캡처한 수신 증거는 커밋되고, 그 뒤 연결이 교체되면 같은 증거는 거절된다", () => {
  // 위 네 시험은 **등록 범위 가드**(훅)를 본다. 이 시험은 그 아래 단계인 **수신 증거 가드**
  // (store의 commitWithReceipt)를 훅을 거치지 않고 직접 본다 — 두 경계는 서로를 대신하지
  // 않는다(훅 가드는 사건 도착 시점에 현재 범위를 다시 읽으므로, 캡처 뒤 전이한 증거는
  // store 쪽에서만 걸린다).
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

  // 1) 캡처한 그대로의 범위 — 정상 커밋.
  act(() => useInGameStore.getState().applyPlayerEliminated(parsed, receipt))
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "현재 범위의 증거가 거절됐다")
  assert.deepEqual(useInGameStore.getState().state.winResult, { winner: "JOKER" })

  // 2) 같은 증거를 지나간 범위로 만든 뒤 다시 커밋 — 아무것도 바꾸지 않는다.
  seedSession({ phase: "DAY", dayIndex: 1 })
  act(() => setSocket(createFakeSocket({ id: "sock-next" })))

  const before = storeFacts()
  act(() => useInGameStore.getState().applyPlayerEliminated(parsed, receipt))
  assert.equal(storeFacts(), before, "지난 범위의 수신 증거가 그대로 커밋됐다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null)

  act(() => setSocket(null))
})

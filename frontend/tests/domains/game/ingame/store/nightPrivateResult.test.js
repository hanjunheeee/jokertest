import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"
import { createRequire } from "node:module"

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
const { useInGameStore, selectNightSuccessQueue, readInGameReceiptScope } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useGameSessionSocketEvents } = await import("../../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { useInGameSessionSnapshotSync } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")

const GAME_ID = "game-npr-store"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"

const ROSTER = [
  { uuid: SELF_UUID, nickname: "나" },
  { uuid: OTHER_UUID, nickname: "상대" },
]

function buildSelf() {
  return { uuid: SELF_UUID, nickname: "나", role: "GUARD", team: "CITIZEN", hasActedThisPhase: false }
}

function createFakeSocket({
  id = "socket-1", connected = true, forwardEmitTo = null, holdAckResponses = false,
} = {}) {
  const listeners = new Map()
  const emitted = []
  const ackCalls = []
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
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
    emit(event, payload, callback) {
      const entry = { event, payload, callback }
      emitted.push(entry)
      if (forwardEmitTo) {
        forwardEmitTo.trigger(event, payload, (response) => {
          entry.response = response
          if (typeof callback === "function") callback(response)
        })
      }
    },
    emitted,
    timeout() {
      return this
    },
    emitWithAck(event, payload) {
      const entry = { event, payload }
      ackCalls.push(entry)
      return new Promise((resolve, reject) => {
        entry.resolve = resolve
        entry.reject = reject
        if (!forwardEmitTo) return
        const settle = (response) => {
          entry.response = response
          if (holdAckResponses) entry.release = () => resolve(response)
          else resolve(response)
        }
        forwardEmitTo.trigger(event, payload, settle)
      })
    },
    ackCalls,
    holdAckResponses,
  }
}

function openSession({ socketOptions } = {}) {
  const socket = createFakeSocket(socketOptions)
  act(() => setSocket(socket))
  const { result, unmount } = renderHook(() => {
    useGameSessionSocketEvents()
    useInGameSessionSnapshotSync()
    return useInGameStore(selectNightSuccessQueue)
  })
  return {
    socket,
    get queue() {
      return result.current
    },
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    async reconnect() {
      await act(async () => {
        socket.deliver("connect", undefined)
      })
    },
    complete(eventId) {
      const auth = useAuthStore.getState()
      const scope = readInGameReceiptScope({
        accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
        identityGeneration: auth.identityGeneration ?? null,
      })
      let outcome
      act(() => {
        outcome = useInGameStore.getState().completeNightSuccess(eventId, scope)
      })
      return outcome
    },
    close() {
      unmount()
      act(() => setSocket(null))
    },
  }
}

function seedNightSession({ gameId = GAME_ID } = {}) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF_UUID, nickname: "나" }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null,
      state: null,
      hostUuid: null,
      error: null,
      snapshotSeq: 0,
      nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId,
      state: {
        id: gameId,
        phase: "NIGHT",
        dayIndex: 1,
        dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })),
        self: buildSelf(),
      },
    })
  })
}

const GUARD_RESULT = Object.freeze({
  gameId: GAME_ID,
  dayIndex: 1,
  actionType: "INVESTIGATE",
  targetId: OTHER_UUID,
  role: "JOKER",
})

const NIGHT_RESULT_APPLIED = Object.freeze({
  gameId: GAME_ID,
  phase: "DAY",
  dayIndex: 2,
  players: [
    { uuid: SELF_UUID, alive: true },
    { uuid: OTHER_UUID, alive: false },
  ],
  victimUuid: OTHER_UUID,
  deathReveals: [{ victimUuid: OTHER_UUID, source: "JOKER" }],
})

function applyDaySnapshot() {
  act(() => {
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex: 2,
      dayPhase: "DAY_DISCUSSION",
      players: [
        { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
        { uuid: OTHER_UUID, nickname: "상대", isAlive: false, isConnected: true },
      ],
      self: buildSelf(),
    })
  })
}

const readResult = () => useInGameStore.getState().nightPrivateResult

test("AC-04: 개인 결과는 실제 소켓 이벤트로 도착해 저장되고, 이벤트 순차 적용·snapshot 복구를 지나도 유실되지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)
  assert.deepEqual(readResult(), {
    gameId: GAME_ID,
    dayIndex: 1,
    actionType: "INVESTIGATE",
    targetId: OTHER_UUID,
    role: "JOKER",
  })

  session.deliver("night_result_applied", NIGHT_RESULT_APPLIED)
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.notEqual(readResult(), null, "night_result_applied가 개인 결과를 지웠다")

  const seqBefore = useInGameStore.getState().snapshotSeq
  applyDaySnapshot()
  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1, "스냅샷이 실제로 반영돼야 하는 시험이다")
  assert.equal(readResult().targetId, OTHER_UUID, "snapshot 복구가 개인 결과를 지웠다")

  session.close()
})

test("AC-04: 언마운트하면 구독이 해제되고, 그 뒤 도착한 이벤트는 store를 건드리지 않는다", () => {
  seedNightSession()
  const session = openSession()

  assert.equal(session.socket.listenerCount("night_action_result"), 1, "훅이 실제로 구독해야 하는 시험이다")
  session.close()
  assert.equal(session.socket.listenerCount("night_action_result"), 0, "cleanup이 구독을 해제하지 않았다")

  act(() => session.socket.deliver("night_action_result", GUARD_RESULT))
  assert.equal(readResult(), null, "해제된 뒤에도 핸들러가 남아 store를 바꿨다")
})

test("AC-04: 같은 NIGHT의 중복 이벤트는 재진입이 아니다 — 값이 사라지지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)
  session.deliver("night_action_result", GUARD_RESULT)
  assert.notEqual(readResult(), null)

  act(() => {
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex: 1,
      players: [
        { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
        { uuid: OTHER_UUID, nickname: "상대", isAlive: true, isConnected: true },
      ],
      self: buildSelf(),
    })
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.notEqual(readResult(), null, "같은 밤 스냅샷을 재진입으로 오인했다")

  session.close()
})

test("AC-04: 오버레이 확인은 개인 결과를 비운다(중복 확인은 참조 보존 no-op)", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)
  assert.notEqual(readResult(), null)

  act(() => useInGameStore.getState().clearNightPrivateResult())
  assert.equal(readResult(), null)

  const before = useInGameStore.getState()
  act(() => useInGameStore.getState().clearNightPrivateResult())
  assert.equal(useInGameStore.getState(), before, "이미 비어 있으면 아무것도 바뀌지 않는다")

  session.close()
})

test("AC-04: NIGHT 재진입(낮 투표 동률 → 밤)에서 개인 결과를 비운다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)
  session.deliver("night_result_applied", NIGHT_RESULT_APPLIED)
  assert.notEqual(readResult(), null)

  session.deliver("day_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 2,
    publicAbstainCount: 1,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(readResult(), null, "새 밤에 지난 밤의 개인 결과가 남았다")

  session.close()
})

test("AC-04: NIGHT 재진입(재판 무죄 → 밤)에서도 개인 결과를 비운다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)

  act(() => {
    useInGameStore.setState((current) => ({
      state: { ...current.state, phase: "TRIBUNAL", dayIndex: 2, dayPhase: null, tribunal: { defendantUuid: OTHER_UUID } },
    }))
  })
  assert.notEqual(readResult(), null)

  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: OTHER_UUID,
    outcome: "NOT_GUILTY",
    counts: { guilty: 1, notGuilty: 2 },
    executedUuid: null,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(readResult(), null)

  session.close()
})

test("AC-04: 재판이 밤으로 넘어가지 않는 판정(유죄 처형·ENDED 아님)은 개인 결과를 비우지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", GUARD_RESULT)
  act(() => {
    useInGameStore.setState((current) => ({
      state: { ...current.state, phase: "TRIBUNAL", dayIndex: 2, dayPhase: null, tribunal: { defendantUuid: OTHER_UUID } },
    }))
  })

  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "TRIBUNAL",
    defendantUuid: OTHER_UUID,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: OTHER_UUID,
  })

  assert.equal(useInGameStore.getState().state.tribunal.resolved, true)
  assert.notEqual(readResult(), null, "TRIBUNAL에 머무는 판정은 재진입이 아니다")

  session.close()
})

test("AC-04: gameId 변경(새 세션·정리)에서 개인 결과를 비운다", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_result", GUARD_RESULT)

  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: "game-next",
      state: {
        id: "game-next",
        phase: "ROLE_REVEAL",
        dayIndex: 0,
        players: ROSTER.map((p) => ({ ...p })),
        self: buildSelf(),
      },
    })
  })
  assert.equal(readResult(), null, "이전 게임의 개인 결과가 새 세션으로 샜다")
  session.close()

  seedNightSession()
  const next = openSession()
  next.deliver("night_action_result", GUARD_RESULT)
  act(() => useInGameStore.getState().clearGame())
  assert.equal(readResult(), null)
  next.close()
})

test("AC-04: 같은 gameId를 다시 적용하는 setGamePayload는 개인 결과를 비우지 않는다(비우는 시점은 gameId 변경뿐)", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_result", GUARD_RESULT)
  assert.notEqual(readResult(), null)

  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "NIGHT",
        dayIndex: 1,
        dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })),
        self: buildSelf(),
      },
    })
  })

  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.notEqual(readResult(), null, "같은 게임의 재적용이 개인 결과를 지웠다")
  assert.equal(readResult().targetId, OTHER_UUID)

  session.close()
})

test("AC-04: 다른 게임의 개인 결과는 store에 들어가지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_result", { ...GUARD_RESULT, gameId: "game-other" })
  assert.equal(readResult(), null)

  const before = useInGameStore.getState()
  act(() => useInGameStore.getState().setNightPrivateResult({ ...GUARD_RESULT, gameId: "game-other" }))
  assert.equal(useInGameStore.getState(), before)

  session.close()
})

test("AC-04: 본인 것이 아닌 개인 결과는 실제 훅 경로에서 저장되지 않는다(역할·생존·대상)", () => {
  seedNightSession()
  let session = openSession()
  session.deliver("night_action_result", { gameId: GAME_ID, dayIndex: 1, actionType: "ASSASSINATE", success: false })
  assert.equal(readResult(), null, "다른 역할의 결과가 저장됐다")
  session.close()

  seedNightSession()
  act(() => {
    useInGameStore.setState((current) => ({
      state: {
        ...current.state,
        players: current.state.players.map((p) => (p.uuid === SELF_UUID ? { ...p, alive: false } : p)),
      },
    }))
  })
  session = openSession()
  session.deliver("night_action_result", GUARD_RESULT)
  assert.equal(readResult(), null, "사망한 본인에게 온 결과가 저장됐다")
  session.close()

  seedNightSession()
  session = openSession()
  session.deliver("night_action_result", { ...GUARD_RESULT, targetId: SELF_UUID })
  assert.equal(readResult(), null, "대상이 본인인 조사 결과가 저장됐다")
  session.close()
})

const readQueue = () => useInGameStore.getState().nightSuccessQueue

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function buildKillSuccessPayload(overrides = {}) {
  return {
    gameId: GAME_ID,
    nightDayIndex: 1,
    eventId: "evt-kill-1",
    type: "KILL",
    perspectives: ["USER"],
    targetId: OTHER_UUID,
    ...overrides,
  }
}

function buildSelfHealSuccessPayload(overrides = {}) {
  return {
    gameId: GAME_ID,
    nightDayIndex: 1,
    eventId: "evt-heal-1",
    type: "HEAL",
    perspectives: ["USER", "TARGET"],
    targetId: SELF_UUID,
    ...overrides,
  }
}

test("AC-01: 역할별 성공 사건을 수신하면 store에 사건 ID·밤 번호가 저장되고, 같은 사건 ID 재전달은 중복 추가되지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 1)
  assert.deepEqual(readQueue()[0], {
    eventId: "evt-kill-1", gameId: GAME_ID, nightDayIndex: 1, type: "KILL",
    perspectives: ["USER"], targetId: OTHER_UUID,
  })

  const afterFirst = readQueue()
  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue(), afterFirst, "같은 eventId 재전달이 큐를 다시 만들었다")
  assert.equal(readQueue().length, 1)

  assert.equal(session.socket.listenerCount("night_action_success"), 1, "훅이 실제로 구독해야 하는 시험이다")
  session.close()
  assert.equal(session.socket.listenerCount("night_action_success"), 0, "cleanup이 구독을 해제하지 않았다")
  const afterClose = readQueue().length

  act(() => session.socket.deliver("night_action_success", buildKillSuccessPayload({ eventId: "evt-kill-2" })))
  assert.equal(readQueue().length, afterClose, "해제된 뒤에도 핸들러가 남아 store를 바꿨다")
})

test("AC-02: 다른 gameId·다른 밤 번호·잘못된 형태의 사건은 store가 거부해 저장하지 않는다", () => {
  seedNightSession()
  const session = openSession()

  const before = readQueue()
  session.deliver("night_action_success", buildKillSuccessPayload({ gameId: "game-other" }))
  assert.equal(readQueue(), before, "다른 게임의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ nightDayIndex: 0 }))
  assert.equal(readQueue(), before, "밤 0(현재 밤과 다름)의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ nightDayIndex: 2 }))
  assert.equal(readQueue(), before, "밤 2(현재 밤과 다름)의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ eventId: "" }))
  assert.equal(readQueue(), before, "빈 eventId의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ type: "ASSASSINATE" }))
  assert.equal(readQueue(), before, "허용되지 않은 type의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ perspectives: [] }))
  assert.equal(readQueue(), before, "빈 perspectives의 사건이 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload({ perspectives: ["USER"], targetId: undefined }))
  assert.equal(readQueue(), before, "USER 관점인데 targetId가 없는 사건이 저장됐다")

  session.deliver("night_action_success", {
    gameId: GAME_ID, nightDayIndex: 1, eventId: "evt-target-only",
    type: "INVESTIGATE", perspectives: ["TARGET"], targetId: OTHER_UUID, role: "JOKER",
  })
  assert.equal(readQueue().length, 1)
  assert.deepEqual(readQueue()[0], {
    eventId: "evt-target-only", gameId: GAME_ID, nightDayIndex: 1, type: "INVESTIGATE", perspectives: ["TARGET"],
  })
  assert.ok(!("targetId" in readQueue()[0]), "TARGET 전용 사건에 targetId가 저장됐다")
  assert.ok(!("role" in readQueue()[0]), "TARGET 전용 사건에 여분 필드가 저장됐다")

  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 2)

  session.close()
})

test("AC-02: 같은 소켓 객체가 재연결되면(connect 재발생) 이전 연결이 수락한 사건은 취소되고 완료해도 emit하지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 1)

  act(() => session.socket.deliver("connect"))

  assert.deepEqual(readQueue(), [], "재연결 후에도 이전 연결이 수락한 사건이 큐에 남아 있다")

  const outcome = session.complete("evt-kill-1")
  assert.equal(outcome.status, "noop", "재연결 전에 수락한 사건이 완료 대상으로 남아 있다")
  assert.equal(session.socket.emitted.length, 0, "재연결 전에 수락한 사건의 완료가 emit됐다")

  session.close()
})

test("AC-03: 사용자=대상자인 자기 치료 사건은 정확히 한 번만 처리되어 큐·완료 요청에 하나씩만 남는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildSelfHealSuccessPayload())
  assert.equal(readQueue().length, 1)
  assert.deepEqual(readQueue()[0].perspectives, ["USER", "TARGET"])
  assert.equal(readQueue()[0].targetId, SELF_UUID)

  session.deliver("night_action_success", buildSelfHealSuccessPayload())
  assert.equal(readQueue().length, 1, "자기 치료 사건이 두 관점으로 중복 저장됐다")

  assert.equal(session.socket.emitted.length, 0, "완료 전 ACK가 이미 전송됐다")
  const outcome = session.complete("evt-heal-1")
  assert.equal(outcome.status, "sent")
  assert.equal(readQueue().length, 0)
  assert.equal(session.socket.emitted.length, 1, "완료 요청이 정확히 한 번 전송돼야 한다")
  assert.deepEqual(session.socket.emitted[0].payload, { gameId: GAME_ID, nightDayIndex: 1, eventId: "evt-heal-1" })

  session.close()
})

test("AC-04: 수락된 사건이 FIFO 대기 큐로 노출되고, 완료마다 정확히 그 항목만 빠진다", () => {
  seedNightSession()
  const session = openSession()

  const initialEmptyQueue = session.queue
  assert.deepEqual(initialEmptyQueue, [])

  session.deliver("night_action_success", buildKillSuccessPayload({ eventId: "evt-kill-1" }))
  assert.equal(session.queue.length, 1)
  assert.equal(session.queue[0].eventId, "evt-kill-1")

  session.deliver("night_action_success", buildSelfHealSuccessPayload({ eventId: "evt-heal-1" }))
  assert.equal(session.queue.length, 2)
  assert.deepEqual(session.queue.map((e) => e.eventId), ["evt-kill-1", "evt-heal-1"])

  const beforeRedeliver = session.queue
  session.deliver("night_action_success", buildKillSuccessPayload({ eventId: "evt-kill-1" }))
  assert.equal(session.queue, beforeRedeliver, "중복 재전달이 새 배열을 만들었다")

  session.complete("evt-kill-1")
  assert.deepEqual(session.queue.map((e) => e.eventId), ["evt-heal-1"])

  session.complete("evt-heal-1")
  assert.deepEqual(session.queue, [])
  assert.equal(session.queue, initialEmptyQueue, "마지막 항목 소비 뒤의 빈 큐가 공용 빈 배열 참조가 아니다")

  session.close()
})

test("AC-05: 완료 소비는 서버로 정확히 한 번만 전송되고, 반복 호출·모르는 ID는 추가 전송을 만들지 않는다", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_success", buildKillSuccessPayload())

  const first = session.complete("evt-kill-1")
  assert.equal(first.status, "sent")
  const second = session.complete("evt-kill-1")
  assert.equal(second.status, "noop")
  assert.equal(session.socket.emitted.length, 1, "이미 완료한 사건의 반복 호출이 추가 emit을 만들었다")

  const unknown = session.complete("evt-does-not-exist")
  assert.equal(unknown.status, "noop")
  assert.equal(session.socket.emitted.length, 1)

  session.close()
})

test("AC-05: 수락 당시와 다른 receiptScope로 완료를 시도하면 거부되고 emit도 없다", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_success", buildKillSuccessPayload())

  const bogusScope = { accountId: "someone-else", identityGeneration: 0, gameId: GAME_ID }
  const outcome = useInGameStore.getState().completeNightSuccess("evt-kill-1", bogusScope)
  assert.equal(outcome.status, "noop")
  assert.equal(readQueue().length, 1, "범위가 다른 완료 요청이 큐를 지웠다")
  assert.equal(session.socket.emitted.length, 0)

  session.close()
})

test("F-26b 전이: NIGHT 재진입(낮 투표 동률→밤)과 clearGame은 성공 사건 큐를 비운다", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 1)

  session.deliver("night_result_applied", NIGHT_RESULT_APPLIED)
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(readQueue().length, 1, "DAY 전이가 완료 전 성공 사건 큐를 지웠다")

  session.deliver("day_vote_resolved", {
    gameId: GAME_ID, dayIndex: 2, phase: "NIGHT", outcome: "TIE",
    tribunalTargetUuid: null, publicVoteCount: 2, publicAbstainCount: 1,
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(readQueue().length, 0, "새 밤에 지난 밤의 성공 사건 큐가 남았다")

  session.deliver("night_action_success", buildKillSuccessPayload({ eventId: "evt-kill-2", nightDayIndex: 2 }))
  assert.equal(readQueue().length, 1, "새 밤의 정상 사건이 거부됐다")

  act(() => useInGameStore.getState().clearGame())
  assert.equal(readQueue().length, 0, "clearGame이 큐를 비우지 않았다")

  session.close()
})

test("F-26b 전이: 그 밤의 결과 적용(NIGHT→DAY)은 성공 사건 큐를 비우지 않고, DAY에서도 완료할 수 있다", () => {
  seedNightSession()
  const session = openSession()
  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 1)

  session.deliver("night_result_applied", NIGHT_RESULT_APPLIED)
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(readQueue().length, 1, "DAY 전이가 완료 전 성공 사건 큐를 지웠다")

  const outcome = session.complete(readQueue()[0].eventId)
  assert.equal(outcome.status, "sent")
  assert.equal(readQueue().length, 0)

  session.close()
})

function makeBackendPlayer(uuid, nickname = `nick-${uuid}`) {
  return { uuid, nickname, isReady: true }
}

function makeBackendRoom({ id, players, jokerCount = 1 }) {
  return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } }
}

function createConventionFollowingRegistry() {
  const overrides = new Map()
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      if (prop === "get") return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
      return Reflect.get(target, prop, receiver)
    },
  })
}

function setupBackendNightKill(roomId) {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"
  const REPO_ROOT = new URL("../../../../../../", import.meta.url)
  const backendRequire = createRequire(new URL("backend/socket/matchmaking.js", REPO_ROOT))
  const gameSessionSocketLayer = backendRequire("./gameSession")
  const gameSessionCore = backendRequire("../game-core/gameSession")
  const matchmaking = backendRequire("./matchmaking")
  const {
    createFakeSocket: createBackendFakeSocket, createFakeIo, countingCallback,
  } = backendRequire("../tests/helpers/matchmakingFixtures")

  gameSessionCore.__resetStateForTests()
  matchmaking.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
  gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())

  const players = Array.from({ length: 10 }, (_, i) => makeBackendPlayer(`fp-${roomId}-${i}`))
  const room = makeBackendRoom({ id: roomId, players, jokerCount: 1 })
  const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
  gameSessionCore.commitGameSession(candidate.session)
  const session = candidate.session
  for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
  session.phase = "NIGHT"
  session.dayIndex = 2
  session.nightActions = new Map()
  session.nightResolution = null
  session.dayVotes = new Map()
  session.dayVoteResolution = null
  session.tribunal = null
  const jokerUuid = [...session.players.values()].find((p) => p.role === "JOKER").uuid
  const citizenUuid = [...session.players.values()].find((p) => p.role === "CITIZEN").uuid

  const io = createFakeIo([])
  const backendSockets = new Map()
  for (const uuid of session.players.keys()) {
    const backendSocket = createBackendFakeSocket(uuid)
    backendSocket.rooms.add(session.channelId)
    backendSocket.data.activeGameId = session.id
    io.sockets.sockets.set(backendSocket.id, backendSocket)
    gameSessionSocketLayer.registerGameHandlers(io, backendSocket, uuid)
    backendSockets.set(uuid, backendSocket)
  }

  let now = 1_000_000
  let nextTimerId = 1
  const timers = new Map()
  const clock = {
    nowFn: () => now,
    setTimeoutFn(fn, delayMs) {
      const id = nextTimerId++
      timers.set(id, { at: now + Math.max(0, delayMs), fn })
      return id
    },
    clearTimeoutFn(id) {
      timers.delete(id)
    },
  }

  gameSessionSocketLayer.__testables.startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

  let submitResponse = null
  backendSockets.get(jokerUuid).trigger(
    "submit_night_action", { gameId: session.id, targetId: citizenUuid }, (res) => { submitResponse = res },
  )
  assert.deepEqual(submitResponse, { ok: true })

  const killEntry = backendSockets.get(jokerUuid).emitted.find((e) => e.event === "night_action_success")
  assert.ok(killEntry, "전제: 광대가 KILL 성공 사건을 받아야 한다")

  return {
    gameSessionSocketLayer,
    gameSessionCore,
    io,
    session,
    backendSockets,
    jokerUuid,
    citizenUuid,
    successPayload: killEntry.payload,
    createBackendFakeSocket,
    countingCallback,
  }
}

test("AC-05 결합: completeNightSuccess의 emit이 registerGameHandlers가 등록한 실제 서버 리스너로 전달된다", () => {
  const {
    gameSessionSocketLayer, session, backendSockets, jokerUuid, successPayload, countingCallback,
  } = setupBackendNightKill("f26b-frontend-ac05-wiring")

  assert.equal(session.phase, "NIGHT")
  assert.equal(session.dayIndex, successPayload.nightDayIndex, "전제: 완료 요청 시점에도 같은 밤이어야 한다")

  const storedBefore = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
  assert.equal(storedBefore.byEvent.get(successPayload.eventId).get(jokerUuid).completed, false,
    "전제: 완료 전 서버 기록은 completed:false다")

  useAuthStore.setState({ isLoggedIn: true, user: { uuid: jokerUuid, nickname: "광대" }, identityGeneration: 0 })
  useInGameStore.setState({
    gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0, nightPrivateResult: null,
  })
  useInGameStore.getState().setGamePayload({
    gameId: session.id,
    state: {
      id: session.id,
      phase: "NIGHT",
      dayIndex: session.dayIndex,
      dayPhase: null,
      players: [{ uuid: jokerUuid, nickname: "광대" }],
      self: { uuid: jokerUuid, nickname: "광대", role: "JOKER", team: "JOKER", hasActedThisPhase: false },
    },
  })

  const joker = openSession({ socketOptions: { forwardEmitTo: backendSockets.get(jokerUuid) } })
  joker.deliver("night_action_success", successPayload)
  assert.equal(readQueue().length, 1)

  const first = joker.complete(successPayload.eventId)
  assert.equal(first.status, "sent")
  assert.equal(readQueue().length, 0)
  assert.equal(joker.socket.emitted.length, 1, "완료 요청이 정확히 한 번 전송돼야 한다")
  assert.equal(joker.socket.emitted[0].event, "acknowledge_night_action_success")
  assert.deepEqual(joker.socket.emitted[0].response, { ok: true, duplicate: false },
    "실제 등록된 서버 리스너의 최초 완료 응답이어야 한다")

  const storedAfter = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
  assert.equal(storedAfter.byEvent.get(successPayload.eventId).get(jokerUuid).completed, true,
    "실제 서버 기록이 completed:true로 바뀌어야 한다")

  const second = joker.complete(successPayload.eventId)
  assert.equal(second.status, "noop")
  assert.equal(joker.socket.emitted.length, 1, "이미 완료한 사건의 반복 호출이 추가 emit을 만들었다")

  const directAck = countingCallback()
  backendSockets.get(jokerUuid).trigger(
    "acknowledge_night_action_success",
    { gameId: session.id, nightDayIndex: successPayload.nightDayIndex, eventId: successPayload.eventId },
    directAck.callback,
  )
  assert.deepEqual(directAck.getResponse(), { ok: true, duplicate: true })
  assert.equal(storedAfter.byEvent.get(successPayload.eventId).get(jokerUuid).completed, true)

  joker.close()
})

function reconnectBackendSocket(ctx, uuid, { joinChannel = true } = {}) {
    const next = ctx.createBackendFakeSocket(uuid)
    if (joinChannel) next.rooms.add(ctx.session.channelId)
    next.data.activeGameId = ctx.session.id
    ctx.io.sockets.sockets.set(next.id, next)
    ctx.gameSessionSocketLayer.registerGameHandlers(ctx.io, next, uuid)
    return next
}

function seedEmptyStoreForAccount(uuid, nickname = "광대") {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid, nickname }, identityGeneration: 0 })
    useInGameStore.setState({
      gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0, nightPrivateResult: null,
    })
  })
}

test("AC-01/AC-02 결합: ACK 전에 연결이 교체되면 실제 snapshot 조회가 그 사건을 복원하고, 완료 뒤에는 다시 복원되지 않는다", async () => {
  const ctx = setupBackendNightKill("f26-frontend-recovery")
  const { gameSessionSocketLayer, session, jokerUuid, successPayload } = ctx

  const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
  const record = stored.byEvent.get(successPayload.eventId).get(jokerUuid)
  assert.equal(record.completed, false, "전제: 완료 ACK 전이다")
  assert.deepEqual(record.payload, successPayload,
    "전제: 서버가 전달한 그 payload가 수신 기록에 보관돼야 복원할 자료가 있다")

  const reconnected = reconnectBackendSocket(ctx, jokerUuid)
  seedEmptyStoreForAccount(jokerUuid)

  const joker = openSession({ socketOptions: { forwardEmitTo: reconnected } })
  await act(async () => { await flushMicrotasks() })

  const ackCall = joker.socket.ackCalls.find((c) => c.event === "get_session_snapshot")
  assert.ok(ackCall, "훅이 실제 get_session_snapshot 조회를 보내지 않았다")
  assert.deepEqual(ackCall.payload, {}, "빈 store의 조회는 gameId 없이 나간다")
  assert.equal(ackCall.response.ok, true, `조회가 실패했다: ${JSON.stringify(ackCall.response)}`)
  assert.deepEqual(ackCall.response.nightSuccessRecovery, [successPayload],
    "서버 응답이 미완료 사건의 제한 payload를 그대로 실어야 한다")

  assert.equal(useInGameStore.getState().gameId, session.id, "빈 store 복원 자체가 실패했다")
  assert.deepEqual(readQueue().map((e) => e.eventId), [successPayload.eventId],
    "복원된 미완료 사건이 큐에 정확히 한 건 들어와야 한다")

  const completed = joker.complete(successPayload.eventId)
  assert.equal(completed.status, "sent")
  assert.deepEqual(
    joker.socket.emitted.find((e) => e.event === "acknowledge_night_action_success").response,
    { ok: true, duplicate: false },
    "복원된 사건의 완료가 서버에서 거부됐다",
  )
  assert.equal(record.completed, true, "서버 기록이 완료로 바뀌지 않았다")
  assert.deepEqual(readQueue(), [], "완료한 사건이 큐에 남았다")

  await joker.reconnect()
  const ackCalls = joker.socket.ackCalls.filter((c) => c.event === "get_session_snapshot")
  assert.equal(ackCalls.length, 2, "재연결이 새 조회를 보내지 않았다")
  assert.deepEqual(ackCalls[1].response.nightSuccessRecovery, [],
    "이미 완료된 사건이 다시 복원 목록에 실렸다")
  assert.deepEqual(readQueue(), [], "완료된 사건이 재접속으로 다시 큐에 들어왔다")

  joker.close()
})

test("AC-01/AC-05 결합: 채널 재가입이 끝나지 않은 조회는 빈 복원이 아니라 보류로 답하고, 재조회가 그 사건을 되찾는다", async () => {
  const ctx = setupBackendNightKill("f26-frontend-pending")
  const { session, jokerUuid, successPayload } = ctx

  const reconnected = reconnectBackendSocket(ctx, jokerUuid, { joinChannel: false })
  assert.equal(reconnected.rooms.has(session.channelId), false, "전제: 아직 재가입 전이다")
  seedEmptyStoreForAccount(jokerUuid)

  const joker = openSession({ socketOptions: { forwardEmitTo: reconnected } })
  await act(async () => { await flushMicrotasks() })

  const first = joker.socket.ackCalls[0]
  assert.equal(first.response.ok, false)
  assert.equal(first.response.code, "SESSION_ROUTING_PENDING",
    "재가입 중 조회가 빈 복원 성공으로 답했다(클라이언트는 다시 묻지 않는다)")
  assert.equal(Object.hasOwn(first.response, "nightSuccessRecovery"), false,
    "보류 응답에 복원 payload가 실렸다")
  assert.equal(useInGameStore.getState().gameId, null, "보류 응답으로 store가 복원됐다")
  assert.deepEqual(readQueue(), [], "보류 응답이 큐를 만들었다")

  await act(async () => { await flushMicrotasks() })
  assert.equal(reconnected.rooms.has(session.channelId), true,
    "보류 응답이 재가입 작업을 시작하지 않았다")

  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 400) })
    await flushMicrotasks()
  })

  const ackCalls = joker.socket.ackCalls.filter((c) => c.event === "get_session_snapshot")
  assert.ok(ackCalls.length >= 2, "보류 뒤에 같은 연결의 재조회가 없었다")
  const succeeded = ackCalls.find((c) => c.response?.ok === true)
  assert.ok(succeeded, "재조회가 끝내 성공하지 못했다")
  assert.deepEqual(succeeded.response.nightSuccessRecovery, [successPayload])
  assert.deepEqual(readQueue().map((e) => e.eventId), [successPayload.eventId],
    "재조회로 복원된 사건이 큐에 들어오지 않았다")

  joker.close()
})

test("AC-05 결합: 그 사건의 수신자가 아닌 참가자는 재접속해도 같은 사건을 복원받지 못한다", async () => {
  const ctx = setupBackendNightKill("f26-frontend-outsider")
  const { session, jokerUuid, citizenUuid, successPayload } = ctx

  const outsiderUuid = [...session.players.keys()]
    .find((uuid) => uuid !== jokerUuid && uuid !== citizenUuid)
  assert.ok(outsiderUuid)

  const reconnected = reconnectBackendSocket(ctx, outsiderUuid)
  seedEmptyStoreForAccount(outsiderUuid, "무관")

  const outsider = openSession({ socketOptions: { forwardEmitTo: reconnected } })
  await act(async () => { await flushMicrotasks() })

  const ackCall = outsider.socket.ackCalls[0]
  assert.equal(ackCall.response.ok, true, "무관 참가자의 정상 조회 자체는 성공해야 한다")
  assert.deepEqual(ackCall.response.nightSuccessRecovery, [],
    "비수신자의 응답에 남의 성공 사건이 실렸다")
  assert.equal(useInGameStore.getState().gameId, session.id, "전제: 일반 복원은 정상이어야 한다")
  assert.deepEqual(readQueue(), [], "비수신자 화면에 남의 성공 사건이 큐로 들어왔다")
  const stored = ctx.gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
  assert.equal(stored.byEvent.get(successPayload.eventId).get(citizenUuid).completed, false)
  assert.equal(stored.byEvent.get(successPayload.eventId).has(outsiderUuid), false,
    "비수신자에게 기록이 새로 만들어졌다")

  outsider.close()
})

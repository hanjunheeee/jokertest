import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// AC-04 · nightPrivateResult는 오버레이 확인·NIGHT 재진입·gameId 변경에서만 비워지고,
//         이벤트 순차 적용과 snapshot 복구를 지나도 유실되지 않는다.
//
// 이 파일은 production 훅(useGameSessionSocketEvents)을 실제로 마운트해, 가짜 소켓에
// 실제 이벤트를 흘려보내고 store를 읽는다 — 핸들러를 복제하거나 소스를 정규식으로 훑지
// 않는다. 그래서 훅의 구독·해제·신뢰 경계가 실제로 실행된 결과만 증거가 된다.
//
// (useGameSessionSocketEvents가 node:test에서 로드되려면 import 체인에 `@/` 별칭이 없어야
//  한다 — 그래서 matchingStore import를 상대 경로로 바꿔 두었다.)
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

// 라우터 없이 훅만 마운트하므로 useNavigate를 기록용 fake로 교체한다(useInGameResultNavigation
// 테스트와 동일 관례). 이 파일의 어떤 시험도 이동을 유발하지 않는다.
const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../ingameStore.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../hooks/useGameSessionSocketEvents.js")

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

/** 서버 소켓처럼 등록된 리스너에게만 동기적으로 전달하는 최소 fake다. */
function createFakeSocket() {
  const listeners = new Map()
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    /** 서버가 이 소켓에 이벤트를 보낸 것과 같다. 등록된 핸들러가 없으면 아무 일도 없다. */
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
}

/**
 * 실제 훅을 마운트한 세션을 연다. 반환된 deliver로 서버 이벤트를 흘려보내고, close로
 * 언마운트한다(구독 해제까지 실제 cleanup을 태운다).
 */
function openSession() {
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const { unmount } = renderHook(() => useGameSessionSocketEvents())
  return {
    socket,
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    close() {
      unmount()
      act(() => setSocket(null))
    },
  }
}

/** 밤(dayIndex 1)에 들어와 있는 세션을 세운다 — 개인 결과가 도착할 수 있는 유일한 시점이다. */
function seedNightSession({ gameId = GAME_ID } = {}) {
  act(() => {
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

/** 그 밤의 결과 적용(사망 + DAY 전이) — 서버가 개인 결과 "다음에" 보내는 방송이다. */
const NIGHT_RESULT_APPLIED = Object.freeze({
  gameId: GAME_ID,
  phase: "DAY",
  dayIndex: 2,
  // DAY 전이 payload의 생존 필드는 alive다(ENDED payload만 isAlive다 — parseNightResultAppliedPayload).
  players: [
    { uuid: SELF_UUID, alive: true },
    { uuid: OTHER_UUID, alive: false },
  ],
  victimUuid: OTHER_UUID,
  deathReveals: [{ victimUuid: OTHER_UUID, source: "JOKER" }],
})

/** 같은 게임의 재접속 스냅샷(DAY 2로 복원). 스냅샷은 소켓 방송이 아니라 ack라 store 액션이 진입점이다. */
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

  // 이벤트 순차 적용 — 서버가 개인 결과 직후에 보내는 밤 결과 방송은 값을 비우지 않는다.
  session.deliver("night_result_applied", NIGHT_RESULT_APPLIED)
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.notEqual(readResult(), null, "night_result_applied가 개인 결과를 지웠다")

  // snapshot 복구 — state를 통째로 갈아끼워도 최상위 개인 결과는 그대로다.
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
  // 같은 밤에 대한 중복 방송(늦게 도착한 재전송)을 그대로 다시 흘려보내도 값은 그대로다.
  session.deliver("night_action_result", GUARD_RESULT)
  assert.notEqual(readResult(), null)

  // 같은 밤 phase를 다시 관측하는 스냅샷도 재진입이 아니다.
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

  // 재판 중인 낮으로 옮겨 놓는다(store 액션이 만드는 것과 같은 모양).
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

  // 같은 게임에 대한 중복 game_started(재전송·재구독)다. 세션이 바뀌지 않았으므로 아직
  // 확인하지 않은 이번 밤의 결과가 여기서 사라지면 안 된다.
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

  // 파서를 우회해 store 액션을 직접 불러도 gameId 불일치는 참조 보존 no-op이다.
  const before = useInGameStore.getState()
  act(() => useInGameStore.getState().setNightPrivateResult({ ...GUARD_RESULT, gameId: "game-other" }))
  assert.equal(useInGameStore.getState(), before)

  session.close()
})

test("AC-04: 본인 것이 아닌 개인 결과는 실제 훅 경로에서 저장되지 않는다(역할·생존·대상)", () => {
  // 1) 내 역할이 받을 수 없는 결과(JOKER의 암살 통지가 GUARD에게 도착).
  seedNightSession()
  let session = openSession()
  session.deliver("night_action_result", { gameId: GAME_ID, dayIndex: 1, actionType: "ASSASSINATE", success: false })
  assert.equal(readResult(), null, "다른 역할의 결과가 저장됐다")
  session.close()

  // 2) 내가 이미 죽어 있다 — 서버는 사망자에게 개인 결과를 만들지 않는다.
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

  // 3) 대상이 본인이다 — 자기 지목이 허용되는 역할은 DOCTOR뿐이고 DOCTOR는 개인 결과가 없다.
  seedNightSession()
  session = openSession()
  session.deliver("night_action_result", { ...GUARD_RESULT, targetId: SELF_UUID })
  assert.equal(readResult(), null, "대상이 본인인 조사 결과가 저장됐다")
  session.close()
})

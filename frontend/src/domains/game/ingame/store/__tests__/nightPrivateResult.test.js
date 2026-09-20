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
const { useInGameStore, selectNightSuccessQueue, readInGameReceiptScope } = await import("../ingameStore.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
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
    /** 서버가 이 소켓에 이벤트를 보낸 것과 같다. 등록된 핸들러가 없으면 아무 일도 없다. */
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
    // F-26b(AC-05): completeNightSuccess가 실제로 부르는 클라이언트 emit 대역이다. 등록된
    // 서버 리스너 없이 여기서는 기록만 한다 — 서버 결합(등록 리스너로의 실제 전달)은
    // backend/socket/__tests__/gameSession.nightTurns.test.js가 wireSession으로 검사한다.
    emit(event, payload, callback) {
      emitted.push({ event, payload, callback })
    },
    emitted,
  }
}

/**
 * 실제 훅을 마운트한 세션을 연다. 반환된 deliver로 서버 이벤트를 흘려보내고, close로
 * 언마운트한다(구독 해제까지 실제 cleanup을 태운다).
 *
 * F-26b(AC-04): 같은 마운트 콜백에서 selectNightSuccessQueue를 함께 구독해 실제 React
 * 구독 결과(result.current)를 노출한다. complete(eventId)는 그 순간의 receiptScope를
 * readInGameReceiptScope로 캡처해 production completeNightSuccess를 그대로 호출한다.
 */
function openSession() {
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const { result, unmount } = renderHook(() => {
    useGameSessionSocketEvents()
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

/** 밤(dayIndex 1)에 들어와 있는 세션을 세운다 — 개인 결과가 도착할 수 있는 유일한 시점이다. */
function seedNightSession({ gameId = GAME_ID } = {}) {
  act(() => {
    // F-26b: receiveNightSuccess는 "로그인 계정 = self.uuid"를 요구한다 — 인게임 store가
    // 읽을 수 없는 계정 축을 호출부(훅)가 receiptScope로 넘기기 때문이다.
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

// ---------------------------------------------------------------------------
// F-26b · 역할별 성공 사건(night_action_success) 수신 · 완료 ACK · 중복/오래된 사건 거부
//
// 이 파일의 기존 관례(production 훅을 실제로 마운트하고 가짜 소켓으로 실제 이벤트를 흘린다)를
// 그대로 따른다. complete()는 store의 production completeNightSuccess를 그대로 호출하고,
// 서버로의 실제 등록 리스너 결합은 backend/socket/__tests__/gameSession.nightTurns.test.js가
// wireSession으로 검사한다(A-05 — 이 파일의 소비 경계는 명시적 완료 호출까지다).
// ---------------------------------------------------------------------------

const readQueue = () => useInGameStore.getState().nightSuccessQueue

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
  // close()의 setSocket(null)은 연결 축 전이이기도 하다 — 그 자체로 큐를 취소할 수 있으므로,
  // 아래 단언은 "그 값에서 더 바뀌지 않는다"만 본다(닫기 전 값과의 동일성은 요구하지 않는다).
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

  // TARGET 전용은 targetId·여분 필드를 저장하지 않는다.
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

  // 뒤따른 정상 사건은 그대로 수락된다.
  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 2)

  session.close()
})

test("AC-02: 같은 소켓 객체가 재연결되면(connect 재발생) 이전 연결이 수락한 사건은 취소되고 완료해도 emit하지 않는다", () => {
  seedNightSession()
  const session = openSession()

  session.deliver("night_action_success", buildKillSuccessPayload())
  assert.equal(readQueue().length, 1)

  // 소켓 **객체는 그대로 두고** connect만 다시 관측시킨다 — useGameSessionSocketEvents의
  // connectSeq(훅 리렌더용)와 별개로, ingameStore도 자기 연결 세대를 스스로 올려야 한다
  // (rebindConnectionScope의 handleObservedSocketConnect 참고).
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

  // 처음의 빈 큐가 곧 store가 소유한 공용 불변 빈 배열이다 — 아래에서 큐를 비운 뒤 이
  // 참조와 다시 같아지는지(===)를 확인한다.
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
  // F-26b(AC-04): 빈 상태는 항상 같은 공용 불변 배열이어야 한다 — filter()가 만든 새 빈
  // 배열을 그대로 저장하면 이 참조 동일성이 깨진다.
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

  // DAY로 먼저 넘어가야 day_vote_resolved가 반영된다(applyDayVoteResolvedToPhase는
  // phase === "DAY"일 때만 진행한다) — NIGHT_RESULT_APPLIED는 dayIndex 2의 DAY로 옮긴다.
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

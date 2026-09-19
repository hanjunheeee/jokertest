import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// AC-03 · 밤·재판 사망자 0·1·2명 각각에 대해 사망 연출 순서와 "결과 이동 보류"가 실제로
//         성립하는지 production 훅을 마운트해 확인한다.
//
// 순수 reducer 계약은 utils/__tests__/reduceInGameKillReveal.test.js가 이미 다룬다. 이
// 파일이 추가로 증명하는 것은 reducer 밖의 실행 경로다:
//   - useInGameKillReveal이 자기 소켓 구독을 직접 걸고 푼다(useGameSessionSocketEvents의
//     구독과 별개의 리스너다 — 그쪽 핸들러를 대체하지도 건드리지도 않는다).
//   - 종료(ENDED) 처리와 큐 등록이 같은 이벤트에서 일어날 때, 결과 페이지 이동이 큐 등록
//     "전에" 끼어들지 못한다. 그래서 두 훅을 InGamePage와 같은 순서·같은 hold로 조립하고,
//     ProtectedRoute 위치의 useGameSessionSocketEvents까지 함께 마운트해 실제 리스너 등록
//     순서(전역 훅이 먼저)를 그대로 재현한다.
// ---------------------------------------------------------------------------

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
// localStorage는 설치하지 않는다 — 이 JSDOM은 opaque origin이라 접근 자체가 던지고,
// auth store의 persist는 저장소가 없으면 경고만 남기고 메모리 상태로 동작한다
// (useInGameRoleReveal.test.js와 동일한 관례).
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
const { useInGameKillReveal } = await import("../useInGameKillReveal.js")
const { useInGameResultNavigation } = await import("../useInGameResultNavigation.js")

const GAME_ID = "game-kill-live"
const SELF = "uuid-self"
const V1 = "uuid-v1"
const V2 = "uuid-v2"
const OUTSIDER = "uuid-not-in-roster"

const ROSTER = [
  { uuid: SELF, nickname: "나" },
  { uuid: V1, nickname: "첫째" },
  { uuid: V2, nickname: "둘째" },
]

const WIN_RESULT = Object.freeze({ winner: "CITIZEN" })

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
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
    /**
     * 지금 **등록되어 있는 실제 콜백들**. effect 정리가 아직 돌지 않은 구간을 재현하려면
     * deliver()로 현재 목록을 부르는 것으로는 부족하다 — 전이 전에 이 참조들을 손에 쥐고
     * 있다가 전이 후에 직접 불러야 "옛 콜백이 살아 있는 창"을 실제로 만들 수 있다.
     */
    handlersOf(event) {
      return [...(listeners.get(event) ?? [])]
    },
  }
}

/** InGamePage와 같은 조립이다 — 사망 연출을 먼저 만들고, 그 open/pending을 이동 보류로 넘긴다. */
function useProductionTree({ roleRevealOpen = false } = {}) {
  // ProtectedRoute 위치의 전역 구독(종료·phase 전이 담당). 사망 연출 훅보다 먼저 등록된다.
  useGameSessionSocketEvents()
  const killReveal = useInGameKillReveal({ hold: roleRevealOpen })
  useInGameResultNavigation({ hold: killReveal.open || killReveal.pending })
  return killReveal
}

function seedSession({ phase = "NIGHT", dayIndex = 1, tribunal = null } = {}) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "나" } })
    useInGameStore.setState({
      gameId: null,
      state: null,
      hostUuid: null,
      error: null,
      snapshotSeq: 0,
      nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase,
        dayIndex,
        dayPhase: null,
        players: ROSTER.map((p) => ({ ...p })),
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        ...(tribunal ? { tribunal } : {}),
      },
    })
  })
}

function open({ roleRevealOpen = false } = {}) {
  navigateCalls.length = 0
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  const rendered = renderHook((props) => useProductionTree(props), {
    initialProps: { roleRevealOpen },
  })
  return {
    socket,
    get killReveal() {
      return rendered.result.current
    },
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    setRoleRevealOpen(next) {
      act(() => rendered.rerender({ roleRevealOpen: next }))
    },
    /** 지금 떠 있는 연출의 재생 완료(영상 ended)와 같다. */
    consumeActive() {
      const id = rendered.result.current.revealId
      act(() => rendered.result.current.consume(id))
    },
    close() {
      rendered.unmount()
      act(() => setSocket(null))
    },
  }
}

/** 밤 판정이 그대로 게임을 끝내는 payload(ENDED는 dayIndex를 올리지 않는다). */
function endedNightResult({ dayIndex = 1, deathReveals = [], deadUuids = [] } = {}) {
  const dead = new Set(deadUuids)
  return {
    gameId: GAME_ID,
    phase: "ENDED",
    dayIndex,
    players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: !dead.has(p.uuid) })),
    victimUuid: deadUuids.length > 0 ? deadUuids[0] : null,
    winResult: WIN_RESULT,
    deathReveals,
  }
}

const navigated = () => navigateCalls.length > 0

/**
 * F-23(SPLIT-1): 재접속 복원을 **실제 요청 경로와 같은 모양으로** 흘려 넣는다.
 *
 * 프로덕션에서 이 호출을 만드는 것은 useInGameSessionSnapshotSync이고, 그때 두 번째 인자로
 * "요청을 보낸 그 순간의 범위"가 함께 들어간다. 시험이 그 인자를 빼고 부르면 store는 수신
 * 증거 없이 상태만 바꾸고(그 자체는 호환 동작이다) 연출은 만들어지지 않는다 — 그러면 이
 * 파일의 복구 시험들이 "연출이 복원된다"가 아니라 "연출이 없다"를 검사하게 된다.
 *
 * 그래서 소유권 필드를 직접 주입하지 않고, 실제 캡처 함수가 만든 현재 범위를 그대로 넘겨
 * store의 문맥 검사와 기존 pure 검증을 모두 통과시킨다.
 */
function applySnapshotAsCurrentRequest(response) {
  const receipt = readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
  useInGameStore.getState().applySessionSnapshot(response, receipt)
}

test("AC-03: 밤 사망 0명 — 큐가 비어 이동을 보류하지 않고 곧바로 결과로 넘어간다", () => {
  seedSession()
  const session = open()

  session.deliver("night_result_applied", endedNightResult({ deathReveals: [] }))

  assert.equal(session.killReveal.open, false)
  assert.equal(session.killReveal.pending, false)
  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]], "보류할 연출이 없으면 즉시 이동한다")

  session.close()
})

test("AC-03: 밤 사망 1명 — 연출이 끝날 때까지 이동하지 않고, 끝난 뒤에 이동한다", () => {
  seedSession()
  const session = open()

  session.deliver(
    "night_result_applied",
    endedNightResult({ deathReveals: [{ victimUuid: V1, source: "JOKER" }], deadUuids: [V1] }),
  )

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "종료 처리는 같은 이벤트에서 이미 끝났다")
  assert.equal(session.killReveal.open, true)
  assert.equal(session.killReveal.message, "광대들이 첫째 님을 죽였습니다.")
  assert.equal(navigated(), false, "연출이 재생 중인데 결과 페이지로 넘어갔다")

  session.consumeActive()

  assert.equal(session.killReveal.open, false)
  assert.equal(session.killReveal.pending, false)
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])

  session.close()
})

test("AC-03: 밤 사망 2명 — payload 순서대로 하나씩 재생되고, 마지막이 끝나야 이동한다", () => {
  seedSession()
  const session = open()

  session.deliver(
    "night_result_applied",
    endedNightResult({
      deathReveals: [
        { victimUuid: V1, source: "JOKER" },
        { victimUuid: V2, source: "UNKNOWN_NIGHT" },
      ],
      deadUuids: [V1, V2],
    }),
  )

  assert.equal(session.killReveal.message, "광대들이 첫째 님을 죽였습니다.", "첫 번째는 payload 첫 항목이다")
  assert.equal(navigated(), false)

  session.consumeActive()

  assert.equal(session.killReveal.message, "둘째 님이 밤사이 사망했습니다.", "두 번째가 곧바로 이어진다")
  assert.equal(session.killReveal.pending, true)
  assert.equal(navigated(), false, "남은 연출이 있는데 결과 페이지로 넘어갔다")

  session.consumeActive()

  assert.equal(session.killReveal.pending, false)
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])

  session.close()
})

test("AC-03: 재판 사망 0명 — 무죄 판정은 큐에 아무것도 넣지 않는다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 2, tribunal: { defendantUuid: V1 } })
  const session = open()

  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: V1,
    outcome: "NOT_GUILTY",
    counts: { guilty: 1, notGuilty: 2 },
    executedUuid: null,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT", "판정 자체는 반영돼야 하는 시험이다")
  assert.equal(session.killReveal.open, false)
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("AC-03: 재판 사망 1명 — 처형 연출이 뜨고, 게임이 끝나도 그 연출이 끝날 때까지 이동하지 않는다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 2, tribunal: { defendantUuid: V1 } })
  const session = open()

  // 처형이 곧 승리 확정인 terminal 판정이다 — 종료 처리와 사망 연출 큐 등록이 같은 이벤트에서 일어난다.
  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "ENDED",
    defendantUuid: V1,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: V1,
    players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: p.uuid !== V1 })),
    winResult: WIN_RESULT,
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.equal(session.killReveal.open, true)
  assert.equal(session.killReveal.message, "첫째 님이 처형되었습니다.")
  assert.equal(navigated(), false, "처형 연출이 재생되기도 전에 결과 페이지로 넘어갔다")

  session.consumeActive()
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])

  session.close()
})

test("AC-03: 재판 처형 뒤 그 밤의 사망까지 2명 — 도착 순서대로 재생되고 마지막까지 이동을 보류한다", () => {
  seedSession({ phase: "TRIBUNAL", dayIndex: 2, tribunal: { defendantUuid: V1 } })
  const session = open()

  // 1) 낮 재판 처형 → 밤으로(같은 dayIndex 유지).
  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: V1,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: V1,
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(session.killReveal.message, "첫째 님이 처형되었습니다.")

  // 2) 그 밤의 판정이 두 번째 사망과 함께 게임을 끝낸다.
  session.deliver(
    "night_result_applied",
    endedNightResult({
      dayIndex: 2,
      deathReveals: [{ victimUuid: V2, source: "WITCH_HUNTER" }],
      deadUuids: [V1, V2],
    }),
  )

  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.equal(session.killReveal.message, "첫째 님이 처형되었습니다.", "먼저 도착한 처형 연출이 계속 재생 중이다")
  assert.equal(session.killReveal.pending, true)
  assert.equal(navigated(), false)

  session.consumeActive()
  assert.equal(session.killReveal.message, "마녀사냥꾼이 둘째 님을 처단했습니다.")
  assert.equal(navigated(), false, "두 번째 연출이 남았는데 결과 페이지로 넘어갔다")

  session.consumeActive()
  assert.equal(session.killReveal.pending, false)
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])

  session.close()
})

test("AC-03: 역할 공개가 떠 있으면 연출이 큐로 되돌아가지만(open=false) 이동은 계속 보류된다", () => {
  seedSession()
  const session = open({ roleRevealOpen: true })

  session.deliver(
    "night_result_applied",
    endedNightResult({ deathReveals: [{ victimUuid: V1, source: "JOKER" }], deadUuids: [V1] }),
  )

  assert.equal(session.killReveal.open, false, "역할 공개가 우선이라 아직 띄우지 않는다")
  assert.equal(session.killReveal.pending, true, "대기 중인 연출은 소비된 것이 아니다")
  assert.equal(navigated(), false, "open=false를 '연출 끝'으로 오인해 이동했다")

  session.setRoleRevealOpen(false)
  assert.equal(session.killReveal.open, true)
  assert.equal(navigated(), false)

  session.consumeActive()
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])

  session.close()
})

test("AC-03: 사망 연출 구독은 전역 훅과 별개의 리스너이고, 언마운트하면 함께 해제된다", () => {
  seedSession()
  const session = open()

  // useGameSessionSocketEvents와 useInGameKillReveal이 각자 하나씩 — 대체가 아니라 병존이다.
  assert.equal(session.socket.listenerCount("night_result_applied"), 2)
  assert.equal(session.socket.listenerCount("tribunal_vote_resolved"), 2)

  session.close()

  assert.equal(session.socket.listenerCount("night_result_applied"), 0)
  assert.equal(session.socket.listenerCount("tribunal_vote_resolved"), 0)
})

// ── F-23(AC-05): 재접속 스냅샷이 복원한 공개 사망 연출 ────────────────────────
//
// 라이브 방송을 놓친 연결(새로고침·재연결)이 그 밤의 공개 사망을 회복한다. 라이브 경로와
// **같은 id 형식**을 쓰므로 어느 순서로 같은 사망이 들어와도 큐 증가는 한 번뿐이다.

/** get_session_snapshot 응답 한 벌. phase/nightResult만 시험이 정한다. */
function snapshotResponse({ phase = "DAY", dayIndex = 1, deadUuids = [], nightResult = null } = {}) {
  const dead = new Set(deadUuids)
  return {
    ok: true,
    gameId: GAME_ID,
    phase,
    dayIndex,
    ...(phase === "DAY" ? { dayPhase: "DAY_DISCUSSION" } : {}),
    ...(phase === "ENDED" ? { winResult: WIN_RESULT } : {}),
    players: ROSTER.map((p) => ({
      uuid: p.uuid, nickname: p.nickname, isAlive: !dead.has(p.uuid), isConnected: true,
    })),
    self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    ...(nightResult ? { nightResult } : {}),
  }
}

test("F-23(AC-05): 라이브 방송을 놓쳐도 스냅샷만으로 그 밤의 공개 사망 연출이 복원된다", () => {
  seedSession()
  const session = open()

  assert.equal(session.killReveal.pending, false, "전제: 아직 아무 연출도 없다")

  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({
      deadUuids: [V1],
      nightResult: { dayIndex: 1, victimUuid: V1, deathReveals: [{ victimUuid: V1, source: "JOKER" }] },
    }))
  })

  assert.equal(session.killReveal.open, true, "스냅샷 복원 연출이 뜨지 않았다")
  assert.equal(session.killReveal.message, "광대들이 첫째 님을 죽였습니다.")

  session.consumeActive()
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("F-23(AC-05): 같은 사망이 라이브→스냅샷으로 두 번 들어와도 연출은 한 번뿐이다", () => {
  seedSession()
  const session = open()

  session.deliver("night_result_applied", {
    gameId: GAME_ID, phase: "DAY", dayIndex: 1,
    players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: p.uuid !== V1 })),
    victimUuid: V1,
    deathReveals: [{ victimUuid: V1, source: "JOKER" }],
  })
  assert.equal(session.killReveal.open, true)

  session.consumeActive()
  assert.equal(session.killReveal.pending, false, "라이브 연출을 이미 소비했다")

  // 같은 밤의 스냅샷이 뒤늦게 도착한다(재조회·ACK 지연).
  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({
      deadUuids: [V1],
      nightResult: { dayIndex: 1, victimUuid: V1, deathReveals: [{ victimUuid: V1, source: "JOKER" }] },
    }))
  })

  assert.equal(session.killReveal.open, false, "이미 본 연출이 다시 재생됐다")
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("F-23(AC-05): 스냅샷 먼저 → 같은 사망의 라이브 방송이 뒤따라도 큐가 늘지 않는다", () => {
  seedSession()
  const session = open()

  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({
      deadUuids: [V1],
      nightResult: { dayIndex: 1, victimUuid: V1, deathReveals: [{ victimUuid: V1, source: "JOKER" }] },
    }))
  })
  assert.equal(session.killReveal.open, true)

  session.deliver("night_result_applied", {
    gameId: GAME_ID, phase: "DAY", dayIndex: 1,
    players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: p.uuid !== V1 })),
    victimUuid: V1,
    deathReveals: [{ victimUuid: V1, source: "JOKER" }],
  })

  session.consumeActive()
  assert.equal(session.killReveal.open, false, "같은 사망이 두 번 큐에 들어갔다")
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("F-23(AC-05): ENDED 스냅샷으로 복원해도 복구된 연출을 다 본 뒤에야 결과 페이지로 이동한다", () => {
  seedSession()
  const session = open()

  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({
      phase: "ENDED", deadUuids: [V1, V2],
      nightResult: {
        dayIndex: 1, victimUuid: V1,
        deathReveals: [
          { victimUuid: V1, source: "JOKER" },
          { victimUuid: V2, source: "WITCH_HUNTER" },
        ],
      },
    }))
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.equal(session.killReveal.message, "광대들이 첫째 님을 죽였습니다.")
  assert.equal(navigated(), false, "복원된 연출이 재생되기도 전에 결과 페이지로 넘어갔다")

  session.consumeActive()
  assert.equal(session.killReveal.message, "마녀사냥꾼이 둘째 님을 처단했습니다.")
  assert.equal(navigated(), false)

  session.consumeActive()
  assert.equal(session.killReveal.pending, false)
  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]], "마지막 연출 뒤 이동은 정확히 한 번이다")

  session.close()
})

test("F-23(AC-05): 스냅샷 복구도 roster 밖 희생자는 연출로 만들지 않는다", () => {
  seedSession()
  const session = open()

  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({
      nightResult: {
        dayIndex: 1, victimUuid: null,
        deathReveals: [{ victimUuid: OUTSIDER, source: "JOKER" }],
      },
    }))
  })

  assert.equal(session.killReveal.open, false)
  assert.equal(session.killReveal.pending, false, "roster 밖 희생자가 연출 큐에 들어갔다")

  session.close()
})

// ── F-23(SPLIT-1): 신원 전이와 공개 연출의 경합 ──────────────────────────────
//
// 아래 세 시험이 함께 고정하는 사실은 하나다: **공개 결과가 상태에 남아 있다는 것만으로는
// 연출이 되지 않는다.** 그 결과를 누가·어느 연결에서 받았는지가 지금과 같아야 한다.

/** 밤 공개 결과가 실린 스냅샷 한 벌(그 밤 첫째의 사망). */
const RESTORED_NIGHT = Object.freeze({
  dayIndex: 1, victimUuid: V1, deathReveals: [{ victimUuid: V1, source: "JOKER" }],
})

/** 같은 판·같은 계정에서 **내 소속만** 교체한다(이탈→재입장과 같은 전이다). */
function swapMyMembership(next) {
  useInGameStore.setState((s) => ({
    state: {
      ...s.state,
      players: s.state.players.map((p) => (p.uuid === SELF ? { ...p, membershipId: next } : p)),
    },
  }))
}

test("F-23(SPLIT-1): 수신 증거 없이 적용된 공개 결과는 상태만 복원하고 연출을 만들지 않는다", () => {
  seedSession()
  const session = open()

  // 요청 문맥 없이 부른 경로다(옛 호출부·직접 주입). 상태 호환성은 그대로 유지된다.
  act(() => {
    useInGameStore.getState().applySessionSnapshot(snapshotResponse({
      deadUuids: [V1], nightResult: RESTORED_NIGHT,
    }))
  })

  assert.equal(useInGameStore.getState().state.nightResult.deathReveals.length, 1,
    "전제: 공개 결과 자체는 상태에 그대로 복원돼야 한다")
  assert.equal(useInGameStore.getState().snapshotResultOwner, null, "증거 없는 적용이 증거를 만들었다")
  assert.equal(session.killReveal.open, false, "수신 증거 없는 값이 연출이 됐다")
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("F-23(SPLIT-1): 소속이 교체되면 잔존 공개 결과가 새 신분의 연출로 재등록되지 않고, 현재 신원의 복구는 정상 동작한다", () => {
  seedSession()
  const session = open()

  // 1) 지금 신원·지금 연결에서 검증된 복원. 연출이 실제로 떠 있다(양성 대조).
  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({ deadUuids: [V1], nightResult: RESTORED_NIGHT }))
  })
  assert.equal(session.killReveal.open, true, "전제: 현재 신원의 복원은 연출이 되어야 한다")
  const staleRevealId = session.killReveal.revealId
  const staleConsume = session.killReveal.consume
  // effect 정리가 돌기 전의 **실제 등록 콜백**을 손에 쥔다.
  const staleNightHandlers = session.socket.handlersOf("night_result_applied")
  assert.equal(staleNightHandlers.length, 2, "전제: 전역 수신 훅과 연출 훅이 각각 하나씩 등록돼 있어야 한다")

  // 2) 소속 교체.
  act(() => { swapMyMembership("mem-after") })

  // 3) 정리 뒤에도 **참조가 살아 있는** 옛 콜백을 직접 부른다. 구독 해제 시점에 기대지 않고,
  //    등록이 그대로 남아 있었더라도 아무 일도 하지 않는다는 사실 자체를 확인한다.
  act(() => {
    for (const handler of staleNightHandlers) {
      handler({
        gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
        players: ROSTER.map((p) => ({ uuid: p.uuid, isAlive: p.uuid !== V2 })),
        victimUuid: V2, winResult: WIN_RESULT,
        deathReveals: [{ victimUuid: V2, source: "WITCH_HUNTER" }],
      })
    }
    // 옛 consume도 마찬가지다(이전 오버레이가 들고 있던 콜백이다).
    staleConsume(staleRevealId)
  })

  assert.notEqual(useInGameStore.getState().state.phase, "ENDED",
    "옛 연결의 콜백이 canonical 종료를 저장했다")
  assert.equal(session.killReveal.open, false, "이전 신분의 연출이 새 신분 화면에 남았다")
  assert.equal(session.killReveal.pending, false, "잔존 공개 결과가 새 범위의 큐로 재등록됐다")
  assert.equal(navigated(), false)

  // 4) 현재 신원이 **다시 요청해 검증한** 같은 공개 사망은 정상 복구된다(영구 차단이 아니다).
  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({ deadUuids: [V1], nightResult: RESTORED_NIGHT }))
  })
  assert.equal(session.killReveal.open, true, "새 소속의 정상 복구까지 막혔다")
  assert.equal(session.killReveal.message, "광대들이 첫째 님을 죽였습니다.")

  // 그리고 그 복구된 연출은 이 신분의 consume으로만 소비된다(옛 콜백은 여전히 무력하다).
  const restoredRevealId = session.killReveal.revealId
  act(() => { staleConsume(restoredRevealId) })
  assert.equal(session.killReveal.open, true, "이전 신분의 consume이 새 연출을 대신 소비했다")
  assert.equal(session.killReveal.revealId, restoredRevealId)

  session.consumeActive()
  assert.equal(session.killReveal.pending, false)

  session.close()
})

test("F-23(SPLIT-1): 소켓이 교체되면 이전 연결의 수신 증거는 연출이 되지 않는다", () => {
  seedSession()
  const session = open()

  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({ deadUuids: [V1], nightResult: RESTORED_NIGHT }))
  })
  assert.equal(session.killReveal.open, true, "전제: 이 연결의 복원은 연출이 되어야 한다")

  // 연결 교체. 공개 결과 값은 그대로 남지만, 그 값을 받은 연결은 이미 사라졌다.
  const next = createFakeSocket()
  act(() => setSocket(next))

  assert.ok(useInGameStore.getState().state.nightResult, "전제: 공개 결과 값 자체는 남아 있다")
  assert.equal(session.killReveal.open, false, "옛 연결에서 받은 증거가 새 연결의 연출이 됐다")
  assert.equal(session.killReveal.pending, false)

  // 새 연결에서 다시 요청해 검증한 같은 사망은 그 연결의 증거로 복구된다.
  act(() => {
    applySnapshotAsCurrentRequest(snapshotResponse({ deadUuids: [V1], nightResult: RESTORED_NIGHT }))
  })
  assert.equal(session.killReveal.open, true, "새 연결의 정상 복구가 막혔다")

  session.consumeActive()
  assert.equal(session.killReveal.pending, false, "새 연결에서도 같은 사망은 한 번만 재생된다")

  session.close()
  act(() => setSocket(null))
})

test("AC-03: 다른 게임·roster 밖 희생자는 큐에 들어가지 않는다(신뢰 경계)", () => {
  seedSession()
  const session = open()

  // 다른 게임의 방송.
  session.deliver("night_result_applied", {
    ...endedNightResult({ deathReveals: [{ victimUuid: V1, source: "JOKER" }], deadUuids: [V1] }),
    gameId: "game-other",
  })
  assert.equal(session.killReveal.pending, false)

  // canonical roster에 없는 uuid.
  session.deliver(
    "night_result_applied",
    endedNightResult({ deathReveals: [{ victimUuid: OUTSIDER, source: "JOKER" }] }),
  )
  assert.equal(session.killReveal.pending, false, "roster 밖 희생자가 연출 큐에 들어갔다")

  session.close()
})

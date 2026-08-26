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
const { useInGameResolveNight } = await import("../useInGameResolveNight.js")

const GAME_ID = "game-overlay-private-1"
const SELF_UUID = "uuid-self"
const VICTIM_UUID = "uuid-victim"
const TARGET_UUID = "uuid-target"

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

function buildState({ phase, dayIndex }) {
  return {
    id: GAME_ID,
    phase,
    dayIndex,
    players: [
      { uuid: SELF_UUID, nickname: "나", alive: true },
      { uuid: VICTIM_UUID, nickname: "피해자", alive: true },
      { uuid: TARGET_UUID, nickname: "홍길동", alive: true },
    ],
    self: {
      uuid: SELF_UUID,
      nickname: "나",
      role: "GUARD",
      team: "CITIZEN",
      hasActedThisPhase: false,
    },
  }
}

// setGamePayload는 새 세션 진입이므로 개인 조사 결과를 함께 비운다 — 개인 결과를 주입한 뒤에는
// 이 헬퍼를 다시 부르면 안 된다(그 뒤의 canonical 전이는 applyNightResultAppliedPayload로 낸다).
function applyCanonicalState({ phase, dayIndex }) {
  act(() => {
    useInGameStore.getState().setGamePayload({ gameId: GAME_ID, state: buildState({ phase, dayIndex }) })
  })
}

// night_result_applied의 canonical 반영(판정된 밤의 dayIndex N → DAY dayIndex N+1). 기본값은
// 첫 밤(NIGHT 1 → DAY 2)이고, 둘째 밤을 재생할 때는 dayIndex 3을 넘긴다. 프로덕션에서는
// useGameSessionSocketEvents가 하는 일을 이 테스트가 직접 재현한다.
function applyCanonicalNightResult({ dayIndex = 2 } = {}) {
  act(() => {
    useInGameStore.getState().applyNightResultAppliedPayload({
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex,
      victimUuid: VICTIM_UUID,
      players: [
        { uuid: SELF_UUID, alive: true },
        { uuid: VICTIM_UUID, alive: false },
        { uuid: TARGET_UUID, alive: true },
      ],
    })
  })
}

function mountLiveOverlayStack() {
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0, nightPrivateResult: null })
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  // 개인 결과는 useInGameResolveNight가 소켓에서 받아 store에 넣고, 오버레이 스택이 그것을
  // 읽는다 — 두 훅을 같은 트리에 마운트해 실제 배선 그대로 검증한다.
  const rendered = renderHook(() => ({
    stack: useInGameOverlayStack(),
    resolveNight: useInGameResolveNight(),
  }))
  return { ...rendered, fake }
}

// GUARD 개인 조사 결과(본인에게만 오는 night_action_result). backend는 항상
// night_action_result → night_result_applied 순서로 보내므로 테스트도 그 순서를 지킨다.
function firePrivateResult(fake, overrides = {}) {
  act(() => {
    fake.socket.fire("night_action_result", {
      gameId: GAME_ID,
      dayIndex: 1,
      actionType: "INVESTIGATE",
      targetId: TARGET_UUID,
      team: "CITIZEN",
      ...overrides,
    })
  })
}

function fireNightResultApplied(fake, overrides = {}) {
  act(() => {
    fake.socket.fire("night_result_applied", {
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex: 2,
      victimUuid: VICTIM_UUID,
      players: [
        { uuid: SELF_UUID, alive: true },
        { uuid: VICTIM_UUID, alive: false },
        { uuid: TARGET_UUID, alive: true },
      ],
      deathReveals: [{ victimUuid: VICTIM_UUID, source: "JOKER" }],
      ...overrides,
    })
  })
}

// 첫 밤(NIGHT dayIndex 1)을 개인 결과 표시·확인까지 온전히 소비하고 둘째 밤(NIGHT dayIndex 2)
// 까지 canonical하게 진행시킨다. DAY 2 → NIGHT 전이는 프로덕션과 같은 액션
// (applyDayVoteResolvedToPhase, 기권 판정)을 쓴다 — 그 경로의 withNightReentryClear가 개인
// 결과를 비우므로, 둘째 밤의 결과는 반드시 이 헬퍼가 끝난 뒤에 발화시켜야 한다.
//
// @param {object} result renderHook이 돌려준 결과 핸들(오버레이 스택 조작용)
// @param {object} fake mountLiveOverlayStack이 돌려준 fake socket 묶음
// @flow 첫 밤 개인 결과 방송 → 판정 방송 → DAY 2 반영 → 개인 결과 확인 → 기권 판정으로 NIGHT 2.
function advanceToSecondNight(result, fake) {
  firePrivateResult(fake)
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()
  assert.equal(result.current.stack.nightPrivateResult.open, true, "첫 밤 결과는 원래 정상적으로 뜬다")
  act(() => {
    result.current.stack.nightPrivateResult.confirm()
  })
  act(() => {
    useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 2, { outcome: "ABSTAINED" })
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().state.dayIndex, 2)
}

test("역할 공개가 열려 있는 동안에는 개인 조사 결과도 대기만 한다(우선순위 1 > 3)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  assert.equal(result.current.stack.roleReveal.open, true)

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  firePrivateResult(fake)

  assert.equal(result.current.stack.nightPrivateResult.open, false, "역할 공개가 먼저다")
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null, "대기 중에도 결과는 보관된다")

  act(() => {
    result.current.stack.roleReveal.close()
  })
  assert.equal(result.current.stack.nightPrivateResult.open, true)

  unmount()
})

test("사망 연출이 재생되는 동안 개인 조사 결과는 대기하고, 소비하면 그 다음에 뜬다(우선순위 2 > 3)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  firePrivateResult(fake)
  fireNightResultApplied(fake)
  applyCanonicalNightResult()

  assert.equal(result.current.stack.killReveal.open, true)
  assert.equal(result.current.stack.nightPrivateResult.open, false, "사망 연출이 먼저다")

  act(() => {
    result.current.stack.killReveal.consume(result.current.stack.killReveal.revealId)
  })

  assert.equal(result.current.stack.nightPrivateResult.open, true)
  assert.equal(result.current.stack.nightPrivateResult.kind, "INVESTIGATE")
  assert.equal(result.current.stack.nightPrivateResult.label, "홍길동 님은 시민 진영입니다")

  unmount()
})

test("night_result_applied(DAY 전이)가 지나가도 개인 조사 결과는 살아남아 화면에 뜬다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  firePrivateResult(fake, { actionType: "CONFIRM", role: "DOCTOR", team: undefined })
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()

  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null)
  assert.equal(result.current.stack.nightPrivateResult.open, true)
  assert.equal(result.current.stack.nightPrivateResult.label, "홍길동 님의 역할은 의사입니다")

  unmount()
})

test("개인 조사 결과가 떠 있는 동안에는 진입 연출·밤 턴 안내가 뒤로 밀리고 게임 표면이 잠긴다(우선순위 3 > 4·5)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  firePrivateResult(fake)
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()

  assert.equal(result.current.stack.nightPrivateResult.open, true)
  assert.equal(result.current.stack.phaseEntrance.open, false, "개인 결과가 떠 있는 동안 DAY 파치먼트는 뒤로 밀린다")
  assert.equal(result.current.stack.nightTurn.open, false)
  assert.equal(result.current.stack.interactionBlocked, true)

  act(() => {
    result.current.stack.nightPrivateResult.confirm()
  })

  assert.equal(useInGameStore.getState().nightPrivateResult, null, "확인은 canonical store의 결과를 비운다")
  assert.equal(result.current.stack.nightPrivateResult.open, false)
  assert.equal(result.current.stack.phaseEntrance.open, true, "확인해야 비로소 DAY 파치먼트가 뜬다")
  assert.equal(result.current.stack.phaseEntrance.message, "낮이 되었습니다")

  unmount()
})

test("대상이 roster에 없어 표시 문구를 만들 수 없는 결과는 아예 열리지 않고 뒷 순서를 막지도 않는다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  firePrivateResult(fake, { targetId: "uuid-phantom" })
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()

  assert.equal(result.current.stack.nightPrivateResult.open, false)
  assert.equal(result.current.stack.nightPrivateResult.label, null)
  assert.equal(result.current.stack.phaseEntrance.open, true)
  assert.equal(result.current.stack.interactionBlocked, true, "DAY 파치먼트가 대신 화면을 덮는다")

  unmount()
})

test("개인 조사 결과 확인은 어떤 소켓 emit/ack도 만들지 않는다(로컬 표시 전용, no gameplay mutation)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  firePrivateResult(fake)
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()

  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.stack.nightPrivateResult.confirm()
  })

  assert.equal(fake.emitCalls.length, emitsBefore)
  assert.equal(fake.emitWithAckCalls.length, acksBefore)
  unmount()
})

test("live root(InGamePage)가 개인 조사 결과 오버레이를 실제로 마운트하고 상태를 그대로 배선한다", () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL("../../pages/InGamePage.jsx", import.meta.url)),
    "utf8",
  )

  assert.match(pageSource, /InGameNightPrivateResultOverlay/)
  assert.match(pageSource, /open=\{nightPrivateResult\.open\}/)
  assert.match(pageSource, /kind=\{nightPrivateResult\.kind\}/)
  assert.match(pageSource, /label=\{nightPrivateResult\.label\}/)
  assert.match(pageSource, /onConfirm=\{nightPrivateResult\.confirm\}/)

  // 상호작용 래퍼 바깥(아래)에서 렌더돼야 오버레이 우선순위가 유지된다.
  const wrapperCloseIndex = pageSource.indexOf("</InGamePlayerSessionProvider>")
  assert.ok(pageSource.indexOf("<InGameNightPrivateResultOverlay") > wrapperCloseIndex)

  const stackSource = readFileSync(
    fileURLToPath(new URL("../useInGameOverlayStack.js", import.meta.url)),
    "utf8",
  )
  assert.match(stackSource, /useInGameNightPrivateResult/)
})

// ---------------------------------------------------------------------------
// 둘째 밤 회귀 — 개인 결과의 stale 판정 기준이 "밤의 dayIndex"여야 한다
// ---------------------------------------------------------------------------

// 이 슬라이스가 고친 버그의 재현이다. night_action_result.dayIndex는 판정된 밤의 값(N)인데
// night_result_applied.dayIndex는 그 밤이 적용돼 들어간 DAY의 값(N+1)이다. 후자를 그대로 폐기
// 기준으로 삼던 시절에는 둘째 밤의 개인 결과(dayIndex 2)가 첫 밤의 기준(2)과 같아져 store에
// 들어가기도 전에 버려졌다 — GUARD도 WITCH_HUNTER도 예외 없이, 그리고 같은 게임이 이어지는 한
// 회복되지 않았다.
test("둘째 밤 GUARD 조사 결과도 수신되어 store에 남고 오버레이로 뜬다(첫 밤만 통과하던 회귀)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  advanceToSecondNight(result, fake)

  firePrivateResult(fake, { dayIndex: 2, team: "JOKER" })
  fireNightResultApplied(fake, { dayIndex: 3, deathReveals: [] })
  applyCanonicalNightResult({ dayIndex: 3 })

  assert.notEqual(useInGameStore.getState().nightPrivateResult, null, "둘째 밤 결과가 폐기되면 안 된다")
  assert.equal(result.current.stack.nightPrivateResult.open, true)
  assert.equal(result.current.stack.nightPrivateResult.kind, "INVESTIGATE")
  assert.equal(result.current.stack.nightPrivateResult.label, "홍길동 님은 광대 진영입니다")

  unmount()
})

test("둘째 밤 WITCH_HUNTER 확인 결과(CONFIRM)도 사망 연출 뒤·DAY 진입 연출 앞이라는 순서 그대로 뜬다", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  advanceToSecondNight(result, fake)

  // 새 규칙: WITCH_HUNTER는 시신을 조사하고 그 역할을 돌려받는다(actionType CONFIRM).
  firePrivateResult(fake, { dayIndex: 2, actionType: "CONFIRM", role: "DOCTOR", team: undefined })
  fireNightResultApplied(fake, { dayIndex: 3 })
  applyCanonicalNightResult({ dayIndex: 3 })

  assert.equal(result.current.stack.killReveal.open, true)
  assert.equal(result.current.stack.nightPrivateResult.open, false, "사망 연출이 먼저다")

  act(() => {
    result.current.stack.killReveal.consume(result.current.stack.killReveal.revealId)
  })

  assert.equal(result.current.stack.nightPrivateResult.open, true)
  assert.equal(result.current.stack.nightPrivateResult.kind, "CONFIRM")
  assert.equal(result.current.stack.nightPrivateResult.label, "홍길동 님의 역할은 의사입니다")
  assert.equal(result.current.stack.phaseEntrance.open, false, "DAY 파치먼트는 그 뒤로 밀린다")

  act(() => {
    result.current.stack.nightPrivateResult.confirm()
  })

  assert.equal(result.current.stack.phaseEntrance.open, true)
  assert.equal(result.current.stack.phaseEntrance.message, "낮이 되었습니다")

  unmount()
})

test("이미 판정이 적용된 밤의 늦은 개인 결과는 그대로 폐기된다(stale 방어는 살아 있다)", () => {
  const { result, fake, unmount } = mountLiveOverlayStack()
  act(() => {
    result.current.stack.roleReveal.close()
  })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  // 개인 결과 없이 첫 밤이 적용된다 — 폐기 기준은 "밤 1"이 된다.
  fireNightResultApplied(fake, { deathReveals: [] })
  applyCanonicalNightResult()

  // 그 뒤에 도착한 밤 1의 개인 결과는 이미 지나간 밤의 것이므로 store에 들이지 않는다.
  firePrivateResult(fake)

  assert.equal(useInGameStore.getState().nightPrivateResult, null)
  assert.equal(result.current.stack.nightPrivateResult.open, false)

  unmount()
})

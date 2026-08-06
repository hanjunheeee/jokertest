import { InGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderHook } from "@testing-library/react"
import { JSDOM } from "jsdom"
import { renderToStaticMarkup } from "react-dom/server"
import {
  computeDayVoteResolveAckPatch,
  shouldApplyDayVoteResolvedPayload,
  parseDayVoteResolvedPayload,
  computeDayVoteResolveInvalidatePatch,
  useInGameActionPanel,
} from "../useInGameActionPanel.js"
import { useInGameStore } from "../../store/ingameStore.js"

// ---------------------------------------------------------------------------
// computeDayVoteResolveAckPatch
// ---------------------------------------------------------------------------

test("computeDayVoteResolveAckPatch: {ok:true, outcome, tribunalTargetUuid}이면 {status:'resolved', error:null, resolution}을 반환한다", () => {
  assert.deepEqual(
    computeDayVoteResolveAckPatch({ ok: true, gameId: "g1", dayIndex: 1, outcome: "TRIBUNAL", tribunalTargetUuid: "u1" }),
    { status: "resolved", error: null, resolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "u1" } },
  )
})

test("computeDayVoteResolveAckPatch: TIE/ABSTAINED처럼 tribunalTargetUuid가 없으면 null로 채운다", () => {
  const result = computeDayVoteResolveAckPatch({ ok: true, gameId: "g1", dayIndex: 1, outcome: "TIE" })
  assert.deepEqual(result, { status: "resolved", error: null, resolution: { outcome: "TIE", tribunalTargetUuid: null } })
})

test("computeDayVoteResolveAckPatch: {ok:false, message}면 그 message를 error로 담아 {status:'idle', resolution:null}을 반환한다", () => {
  assert.deepEqual(computeDayVoteResolveAckPatch({ ok: false, message: "X" }), {
    status: "idle",
    error: "X",
    resolution: null,
  })
})

test("computeDayVoteResolveAckPatch: {ok:false}만 있고 message가 없으면 기본 에러 문구를 담는다", () => {
  const result = computeDayVoteResolveAckPatch({ ok: false })
  assert.equal(result.status, "idle")
  assert.equal(result.resolution, null)
  assert.equal(typeof result.error, "string")
  assert.notEqual(result.error, null)
})

test("computeDayVoteResolveAckPatch: 응답이 없어도(undefined) 실패로 취급해 status:'idle'을 반환한다", () => {
  const result = computeDayVoteResolveAckPatch(undefined)
  assert.equal(result.status, "idle")
  assert.equal(result.resolution, null)
  assert.equal(typeof result.error, "string")
})

// ---------------------------------------------------------------------------
// shouldApplyDayVoteResolvedPayload — 활성 dayIndex가 정수일 때만 정확히 일치해야 통과한다
// ---------------------------------------------------------------------------

test("shouldApplyDayVoteResolvedPayload: gameId와 dayIndex가 모두 정확히 일치하면 true다", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 1 }, gameId: "g1", dayIndex: 1 }),
    true,
  )
})

test("shouldApplyDayVoteResolvedPayload: 활성 dayIndex가 정수가 아니면(예: undefined) 항상 false다 — undefined일 때 전부 통과하던 구멍을 막는다", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 99 }, gameId: "g1", dayIndex: undefined }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: gameId가 다르면 false다(다른 게임의 늦은 방송)", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "other", dayIndex: 1 }, gameId: "g1", dayIndex: 1 }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: dayIndex가 다르면 false다(이전 낮의 늦은 방송, stale)", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 0 }, gameId: "g1", dayIndex: 1 }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: payload가 없거나 객체가 아니거나 배열이면 false다", () => {
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: null, gameId: "g1", dayIndex: 1 }), false)
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: undefined, gameId: "g1", dayIndex: 1 }), false)
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: "not-an-object", gameId: "g1", dayIndex: 1 }), false)
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: [{ gameId: "g1", dayIndex: 1 }], gameId: "g1", dayIndex: 1 }),
    false,
  )
})

// ---------------------------------------------------------------------------
// parseDayVoteResolvedPayload — outcome/phase/집계값 계약 전체를 검증하는 parser
// ---------------------------------------------------------------------------

function baseGameId() {
  return "g1"
}

test("parseDayVoteResolvedPayload: TRIBUNAL 판정 payload가 올바르면 파싱된 결과를 반환한다", () => {
  const payload = {
    gameId: baseGameId(),
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.deepEqual(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  })
})

test("parseDayVoteResolvedPayload: TIE 판정 payload가 올바르면 tribunalTargetUuid를 null로 파싱한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "NIGHT",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  const result = parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 })
  assert.equal(result.outcome, "TIE")
  assert.equal(result.tribunalTargetUuid, null)
})

test("parseDayVoteResolvedPayload: ABSTAINED 판정 payload가 올바르면 파싱된다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 2,
    phase: "NIGHT",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  const result = parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 2 })
  assert.equal(result.outcome, "ABSTAINED")
  assert.equal(result.publicAbstainCount, 3)
})

test("parseDayVoteResolvedPayload: TRIBUNAL인데 tribunalTargetUuid가 없으면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: publicVoteCount/publicAbstainCount가 없거나 음수/실수면 null을 반환한다", () => {
  const withoutCounts = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: withoutCounts, gameId: "g1", dayIndex: 1 }), null)

  const negativeCount = { ...withoutCounts, publicVoteCount: -1, publicAbstainCount: 0 }
  assert.equal(parseDayVoteResolvedPayload({ payload: negativeCount, gameId: "g1", dayIndex: 1 }), null)

  const fractionalCount = { ...withoutCounts, publicVoteCount: 1.5, publicAbstainCount: 0 }
  assert.equal(parseDayVoteResolvedPayload({ payload: fractionalCount, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: outcome이 오타(TRIBUNALL)이거나 허용되지 않는 값이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNALL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: payload가 배열이면 null을 반환한다", () => {
  const payload = [{ gameId: "g1", dayIndex: 1, phase: "DAY", outcome: "TIE" }]
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: outcome과 phase 조합이 불일치하면(TRIBUNAL인데 phase가 DAY) null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TIE인데 phase가 TRIBUNAL이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 활성 dayIndex와 다른 stale payload는 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 0,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 다른 게임의 방송(gameId 불일치)은 null을 반환한다", () => {
  const payload = {
    gameId: "other-game",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 비-TRIBUNAL(TIE/ABSTAINED)인데 tribunalTargetUuid 필드 자체가 없어 undefined면 null을 반환한다", () => {
  const tiePayload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: tiePayload, gameId: "g1", dayIndex: 1 }), null)

  const abstainedPayload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: abstainedPayload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: publicAbstainCount가 publicVoteCount보다 크면 outcome과 무관하게 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 2,
    publicAbstainCount: 5,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: ABSTAINED인데 publicVoteCount와 publicAbstainCount가 다르면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 2,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TIE인데 유효표가 하나도 없이 전원 기권(publicVoteCount === publicAbstainCount)이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TRIBUNAL인데 유효표가 하나도 없이 전원 기권(publicVoteCount === publicAbstainCount)이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

// ---------------------------------------------------------------------------
// computeDayVoteResolveInvalidatePatch
// ---------------------------------------------------------------------------

test("computeDayVoteResolveInvalidatePatch: mounted면 {status:'idle', error:null, resolution:null}을 반환한다", () => {
  assert.deepEqual(computeDayVoteResolveInvalidatePatch(true), { status: "idle", error: null, resolution: null })
})

test("computeDayVoteResolveInvalidatePatch: unmounted면 null을 반환해 state를 건드리지 않음을 나타낸다", () => {
  assert.equal(computeDayVoteResolveInvalidatePatch(false), null)
})

// ---------------------------------------------------------------------------
// useInGameActionPanel — DAY phase 렌더링 회귀 테스트 (TDZ ReferenceError 방지)
// ---------------------------------------------------------------------------

test("useInGameActionPanel: DAY phase 상태에서 실제로 렌더링해도 dayVoteControlsEnabled 계산 중 ReferenceError 없이 완료된다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 1,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
    },
    error: null,
  })

  let captured = null
  function Probe() {
    captured = useInGameActionPanel()
    return null
  }

  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(
        InGamePlayerSessionContext.Provider,
        { value: {} },
        React.createElement(Probe),
      ),
    )
  })
  assert.equal(typeof captured.dayVoteControlsEnabled, "boolean")
})

// ---------------------------------------------------------------------------
// useInGameActionPanel — ENDED phase 계약 테스트
// ---------------------------------------------------------------------------

let actionPanelTestDom = null

function ensureActionPanelClientEnvironment() {
  if (globalThis.document?.body) return

  actionPanelTestDom = new JSDOM(
    "<!doctype html><html><body></body></html>",
    { url: "http://localhost/" },
  )

  globalThis.window = actionPanelTestDom.window
  globalThis.document = actionPanelTestDom.window.document
  globalThis.HTMLElement = actionPanelTestDom.window.HTMLElement
  globalThis.Node = actionPanelTestDom.window.Node
  globalThis.MutationObserver = actionPanelTestDom.window.MutationObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

function renderActionPanelProbe(contextValue = {}) {
  ensureActionPanelClientEnvironment()

  function Wrapper({ children }) {
    return React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: contextValue },
      children,
    )
  }

  const rendered = renderHook(
    () => useInGameActionPanel(),
    { wrapper: Wrapper },
  )

  const captured = rendered.result.current
  rendered.unmount()
  return captured
}

test("useInGameActionPanel: ENDED + winResult.winner CITIZEN이면 gameState.winResult를 그대로 노출한다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 3,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
      winResult: { winner: "CITIZEN" },
    },
    error: null,
  })

  const captured = renderActionPanelProbe()

  assert.deepEqual(captured.gameState.winResult, { winner: "CITIZEN" })
})

test("useInGameActionPanel: ENDED + winResult.winner JOKER면 gameState.winResult를 그대로 노출한다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 3,
      self: { role: "JOKER" },
      players: [],
      events: [],
      winResult: { winner: "JOKER" },
    },
    error: null,
  })

  const captured = renderActionPanelProbe()

  assert.deepEqual(captured.gameState.winResult, { winner: "JOKER" })
})

test("useInGameActionPanel: ENDED면 어떤 조작 액션도 활성화되지 않고 모든 게임 컨트롤이 잠긴다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 3,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
      winResult: { winner: "CITIZEN" },
    },
    error: null,
  })

  const captured = renderActionPanelProbe()

  assert.equal(captured.dayVoteControlsEnabled, false)
  assert.equal(captured.nightActionsLocked, true)
  assert.equal(captured.tribunalVoteControlsEnabled, false)
  assert.equal(captured.tribunalResolveControlsEnabled, false)
})

test("useInGameActionPanel: ENDED면 이전이라면 컨트롤을 열어줬을 role·생존·비피고인 상태여도 재활성화되지 않는다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 2,
      self: { role: "JOKER", uuid: "p1" },
      players: [{ uuid: "p1", alive: true }],
      events: [],
      tribunal: { defendantUuid: "p2" },
      winResult: { winner: "CITIZEN" },
    },
    error: null,
  })

  const captured = renderActionPanelProbe({
    players: [{ id: "p1", nickname: "P1", status: "alive" }],
    localPlayerId: "p1",
  })

  // NIGHT_ACTION_MIN_DAY_INDEX상 JOKER·dayIndex 2는 밤 행동 자격 자체는 만족해
  // nightActionType은 여전히 계산되지만(role/dayIndex만 보고 phase는 보지 않음),
  // nightActionsLocked를 비롯한 잠금은 ENDED로 인해 그대로 유지돼야 한다.
  assert.equal(captured.nightActionType, "ASSASSINATE")
  assert.equal(captured.nightActionsLocked, true)
  assert.equal(captured.dayVoteControlsEnabled, false)
  assert.equal(captured.tribunalVoteControlsEnabled, false)
  assert.equal(captured.tribunalResolveControlsEnabled, false)
})

test("useInGameActionPanel: 비종료 phase(DAY)에서 생존 상태면 dayVoteControlsEnabled는 여전히 true다(positive control)", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 1,
      self: { role: "CITIZEN", uuid: "p1" },
      players: [{ uuid: "p1", alive: true }],
      events: [],
    },
    error: null,
  })

  const captured = renderActionPanelProbe({
    players: [{ id: "p1", nickname: "P1", status: "alive" }],
    localPlayerId: "p1",
  })

  assert.equal(captured.dayVoteControlsEnabled, true)
})

test("useInGameActionPanel: ENDED인데 winResult가 없어도(undefined) throw 없이 안전한 폴백을 따르고 컨트롤은 계속 잠긴다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 3,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
    },
    error: null,
  })

  let captured = null
  assert.doesNotThrow(() => {
    captured = renderActionPanelProbe()
  })
  assert.equal(captured.gameState.winResult, undefined)
  assert.equal(captured.nightActionsLocked, true)
  assert.equal(captured.dayVoteControlsEnabled, false)
  assert.equal(captured.tribunalVoteControlsEnabled, false)
  assert.equal(captured.tribunalResolveControlsEnabled, false)
})

test("useInGameActionPanel: ENDED인데 winResult 형태가 잘못돼도(문자열) throw 없이 안전한 폴백을 따르고 컨트롤은 계속 잠긴다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "ENDED",
      dayIndex: 3,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
      winResult: "malformed-not-an-object",
    },
    error: null,
  })

  let captured = null
  assert.doesNotThrow(() => {
    captured = renderActionPanelProbe()
  })
  assert.equal(captured.gameState.winResult, "malformed-not-an-object")
  assert.equal(captured.nightActionsLocked, true)
  assert.equal(captured.dayVoteControlsEnabled, false)
})

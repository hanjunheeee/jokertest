import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderHook } from "@testing-library/react"
import { JSDOM } from "jsdom"
import { InGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import { useInGameActionPanel } from "../useInGameActionPanel.js"
import { useInGameStore } from "../../store/ingameStore.js"

// ---------------------------------------------------------------------------
// AC-02 · 낮 투표 UI 활성/비활성은 서버 canonical 생존 상태를 따른다
//
// 기존 게이트는 세션 컨텍스트의 status(isSessionPlayerAlive)만 봤다. 그 목록은
// buildPlayerSessionSourceFromGameState가 fail-closed로 preview(더미) 목록을 돌려주는 구간에서
// canonical과 어긋날 수 있어, 서버상 사망한 본인에게 투표 UI가 열려 있었다. 여기서는
// store의 players[].alive만 바꿔가며 dayVoteControlsEnabled가 그 값을 따라가는지 본다.
//
// 기존 useInGameActionPanel.test.js는 건드리지 않는다 — 회귀가 나면 어느 쪽 전제가 깨졌는지
// 파일 단위로 곧바로 갈린다.
// ---------------------------------------------------------------------------

let canonicalAliveTestDom = null

function ensureClientEnvironment() {
  if (globalThis.document?.body) return

  canonicalAliveTestDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
  globalThis.window = canonicalAliveTestDom.window
  globalThis.document = canonicalAliveTestDom.window.document
  globalThis.HTMLElement = canonicalAliveTestDom.window.HTMLElement
  globalThis.Node = canonicalAliveTestDom.window.Node
  globalThis.MutationObserver = canonicalAliveTestDom.window.MutationObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

function renderPanel(contextValue = {}) {
  ensureClientEnvironment()

  function Wrapper({ children }) {
    return React.createElement(InGamePlayerSessionContext.Provider, { value: contextValue }, children)
  }

  const rendered = renderHook(() => useInGameActionPanel(), { wrapper: Wrapper })
  const captured = rendered.result.current
  rendered.unmount()
  return captured
}

/** DAY_VOTE로 고정된 store 상태. selfAlive만 바꿔가며 게이트를 관찰한다. */
function seedDayVoteState({ selfUuid = "p1", selfAlive = true } = {}) {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 2,
      dayPhase: "DAY_VOTE",
      self: { uuid: selfUuid, role: "CITIZEN" },
      players: [
        ...(typeof selfAlive === "boolean" ? [{ uuid: "p1", alive: selfAlive }] : [{ uuid: "p1" }]),
        { uuid: "p2", alive: true },
      ],
      events: [],
    },
    error: null,
  })
}

const ALIVE_SESSION_CONTEXT = {
  players: [
    { id: "p1", nickname: "P1", status: "alive" },
    { id: "p2", nickname: "P2", status: "alive" },
  ],
  localPlayerId: "p1",
}

const DEAD_SESSION_CONTEXT = {
  players: [
    { id: "p1", nickname: "P1", status: "dead" },
    { id: "p2", nickname: "P2", status: "alive" },
  ],
  localPlayerId: "p1",
}

test("canonical alive=true면 낮 투표 UI가 활성화된다(positive control)", () => {
  seedDayVoteState({ selfAlive: true })

  const captured = renderPanel(ALIVE_SESSION_CONTEXT)

  assert.equal(captured.dayVoteControlsEnabled, true)
})

test("canonical alive=false면 세션 컨텍스트가 생존이라고 말해도 낮 투표 UI가 비활성화된다", () => {
  // 프리뷰(더미)가 섞이는 경로의 재현 — 세션 목록은 살아있다고 하지만 서버는 사망으로 본다.
  seedDayVoteState({ selfAlive: false })

  const captured = renderPanel(ALIVE_SESSION_CONTEXT)

  assert.equal(captured.dayVoteControlsEnabled, false)
})

test("canonical alive=true면 세션 컨텍스트가 사망이라고 말해도 낮 투표 UI가 활성화된다(판정원은 서버 하나다)", () => {
  seedDayVoteState({ selfAlive: true })

  const captured = renderPanel(DEAD_SESSION_CONTEXT)

  assert.equal(captured.dayVoteControlsEnabled, true)
})

test("store의 players[].alive만 바꾸면 낮 투표 UI 활성 여부가 그대로 따라 바뀐다", () => {
  const observed = []
  for (const alive of [true, false, true]) {
    seedDayVoteState({ selfAlive: alive })
    observed.push(renderPanel(ALIVE_SESSION_CONTEXT).dayVoteControlsEnabled)
  }

  assert.deepEqual(observed, [true, false, true])
})

test("canonical alive=false면 세션 컨텍스트가 비어 있어도 낮 투표 UI가 비활성화된다", () => {
  seedDayVoteState({ selfAlive: false })

  const captured = renderPanel()

  assert.equal(captured.dayVoteControlsEnabled, false)
})

// ---------------------------------------------------------------------------
// canonical 판정 불가(null) — 기존 폴백을 그대로 승계한다
// ---------------------------------------------------------------------------

test("canonical 판정 불가(self.uuid 없음)면 세션 컨텍스트가 비었을 때 기존 폴백대로 열린다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 2,
      dayPhase: "DAY_VOTE",
      self: { role: "CITIZEN" }, // uuid가 없어 roster에서 본인을 특정할 수 없다.
      players: [{ uuid: "p1", alive: false }],
      events: [],
    },
    error: null,
  })

  const captured = renderPanel()

  assert.equal(captured.dayVoteControlsEnabled, true)
})

test("canonical 판정 불가(roster에 alive 필드 없음)면 세션 컨텍스트의 사망 판정을 그대로 승계한다", () => {
  seedDayVoteState({ selfAlive: null })

  const captured = renderPanel(DEAD_SESSION_CONTEXT)

  assert.equal(captured.dayVoteControlsEnabled, false)
})

// ---------------------------------------------------------------------------
// 세 게이트(낮 투표·낮 준비·밤 행동)가 같은 판정원을 쓴다
// ---------------------------------------------------------------------------

test("canonical alive=false면 낮 준비 버튼도 함께 잠긴다(투표와 같은 판정원)", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 2,
      dayPhase: "DAY_DISCUSSION",
      self: { uuid: "p1", role: "CITIZEN" },
      players: [{ uuid: "p1", alive: false }],
      events: [],
    },
    error: null,
  })

  const captured = renderPanel(ALIVE_SESSION_CONTEXT)

  assert.equal(captured.dayReadyControlsEnabled, false)
  assert.equal(captured.dayVoteControlsEnabled, false)
})

test("canonical alive=false면 밤 행동도 함께 잠긴다(투표와 같은 판정원)", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "NIGHT",
      dayIndex: 2,
      nightTurnRole: "JOKER",
      self: { uuid: "p1", role: "JOKER" },
      players: [{ uuid: "p1", alive: false }],
      events: [],
    },
    error: null,
  })

  const captured = renderPanel(ALIVE_SESSION_CONTEXT)

  assert.equal(captured.nightActionAlive, false)
  assert.equal(captured.nightActionsLocked, true)
})

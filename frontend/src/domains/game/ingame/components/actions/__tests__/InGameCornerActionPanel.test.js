/**
 * CN V-2 — 화면 우측 하단 투표 현황·기권·건너뛰기 버튼.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MouseEvent", dom.window.MouseEvent)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup, fireEvent } = await import("@testing-library/react")
const { default: InGameCornerActionPanel } = await import("../InGameCornerActionPanel.jsx")
const { INGAME_PHASE_ACTIONS } = await import("../../timebar/InGamePhaseActionRow.jsx")
const { InGameActionContext } = await import("../../../context/InGameActionContext.jsx")
const { INGAME_CORNER_ACTION_ASSETS } = await import("../../../constants/actions/ingameCornerActionAssets.js")
const { INGAME_VOTE_ASSETS } = await import("../../../constants/vote/ingameVoteAssets.js")

function makeCtx(overrides = {}) {
  return {
    gameState: null,
    dayPhase: null,
    dayVoteControlsEnabled: false,
    dayVoteStatus: "idle",
    dayVoteHasSubmitted: false,
    abstainDayVote: mock.fn(),
    isNightTurnActor: false,
    nightActionsLocked: true,
    nightActionStatus: "idle",
    nightActionHasSubmitted: false,
    skipNightAction: mock.fn(),
    ...overrides,
  }
}

function renderPanel(ctx, onVoteStatusClick = () => {}) {
  return render(React.createElement(
    InGameActionContext.Provider, { value: ctx },
    React.createElement(InGameCornerActionPanel, { onVoteStatusClick }),
  ))
}

const buttonFor = (container, action) =>
  container.querySelector(`[data-ingame-phase-action="${action}"]`)

function assertSameAssetPath(actualSrc, expectedPath) {
  assert.equal(
    decodeURIComponent(actualSrc ?? "").normalize("NFC"),
    expectedPath.normalize("NFC"),
  )
}

test.afterEach(() => cleanup())

test("투표 현황 버튼은 onVoteStatusClick이 있으면 항상 뜬다", () => {
  const onOpen = mock.fn()
  const view = renderPanel(makeCtx(), onOpen)
  const toggle = view.container.querySelector("[aria-label='투표 현황 열기']")
  assert.ok(toggle, "투표 현황 버튼이 없다")
  fireEvent.click(toggle)
  assert.equal(onOpen.mock.callCount(), 1)
})

test("낮 투표 — 기권이 뜨고 abstainDayVote를 1회 부른다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" },
    dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true,
  })
  const view = renderPanel(ctx)

  const abstain = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN)
  assert.ok(abstain, "기권 버튼이 없다")
  assertSameAssetPath(abstain.querySelector("img")?.getAttribute("src"), INGAME_CORNER_ACTION_ASSETS.abstain)
  fireEvent.click(abstain)
  assert.equal(ctx.abstainDayVote.mock.callCount(), 1)
})

test("낮 투표 — 이미 제출했으면 기권이 잠기고 다시 눌리지 않는다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" },
    dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true,
    dayVoteHasSubmitted: true,
  })
  const view = renderPanel(ctx)
  const abstain = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN)
  assert.equal(abstain.disabled, true)
  fireEvent.click(abstain)
  assert.equal(ctx.abstainDayVote.mock.callCount(), 0)
})

test("낮 투표 — 제출 중이거나 컨트롤이 닫히면 기권이 잠긴다", () => {
  const submitting = makeCtx({
    gameState: { phase: "DAY" }, dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true, dayVoteStatus: "submitting",
  })
  let view = renderPanel(submitting)
  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN).disabled, true)
  cleanup()

  const closed = makeCtx({
    gameState: { phase: "DAY" }, dayPhase: "DAY_VOTE", dayVoteControlsEnabled: false,
  })
  view = renderPanel(closed)
  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN).disabled, true)
})

test("밤 — 내 역할 턴이면 건너뛰기가 뜨고 skipNightAction을 1회 부른다", () => {
  const ctx = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: true, nightActionsLocked: false,
  })
  const view = renderPanel(ctx)

  const skip = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP)
  assert.ok(skip, "건너뛰기 버튼이 없다")
  assertSameAssetPath(skip.querySelector("img")?.getAttribute("src"), INGAME_CORNER_ACTION_ASSETS.skip)
  fireEvent.click(skip)
  assert.equal(ctx.skipNightAction.mock.callCount(), 1)
})

test("밤 — 이미 행동을 제출했으면 건너뛰기가 잠기고 다시 눌리지 않는다", () => {
  const ctx = makeCtx({
    gameState: { phase: "NIGHT" },
    isNightTurnActor: true,
    nightActionsLocked: false,
    nightActionHasSubmitted: true,
  })
  const view = renderPanel(ctx)
  const skip = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP)
  assert.equal(skip.disabled, true)
  fireEvent.click(skip)
  assert.equal(ctx.skipNightAction.mock.callCount(), 0)
})

test("밤 — nightActionsLocked·제출 중에는 건너뛰기가 잠긴다", () => {
  const locked = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: true, nightActionsLocked: true,
  })
  let view = renderPanel(locked)
  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP).disabled, true)
  cleanup()

  const submitting = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: true,
    nightActionsLocked: false, nightActionStatus: "submitting",
  })
  view = renderPanel(submitting)
  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP).disabled, true)
})

test("낮 투표 — 투표 현황·기권이 나란히 뜬다", () => {
  const view = renderPanel(makeCtx({
    gameState: { phase: "DAY" },
    dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true,
  }))

  assert.ok(view.container.querySelector("[aria-label='투표 현황 열기']"))
  assert.ok(buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN))
})

test("에셋 경로가 지정된 PNG를 가리킨다", () => {
  assert.ok(INGAME_CORNER_ACTION_ASSETS.abstain.includes("/button/"))
  assert.ok(INGAME_CORNER_ACTION_ASSETS.skip.includes("/button/"))
  assert.ok(INGAME_VOTE_ASSETS.toggleButton.includes("/button/"))
})

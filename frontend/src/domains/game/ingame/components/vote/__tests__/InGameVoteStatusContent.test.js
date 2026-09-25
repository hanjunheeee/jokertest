/**
 * CN V-2 AC-04 — 투표 현황 창이 **서버가 말한 집계**만 보여준다.
 *
 * 예전 이 화면은 ingameVotePreviewData.js의 DUMMY_VOTE_COUNTS를 참가자 수만큼 잘라 개인별
 * 득표 행을 그렸다. 그 숫자는 서버가 준 적이 없는 값이라, 화면이 사실이 아닌 집계를 단언하고
 * 있었다(제출 버튼도 아무 데도 연결되지 않은 no-op이었다).
 *
 *   · dayVoteResolution이 있으면 그 네 값(득표·기권·결과·재판 대상)을 그대로 그린다
 *   · 없으면 "집계 전"이라고만 말한다(0으로 꾸며내지 않는다)
 *   · 더미 상수를 다시 import하지 않는다(원문 정적 검사)
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
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("@/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
let currentSocket = null
const socketSubscribers = new Set()
mock.module("@/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => currentSocket,
    subscribeSocket: (cb) => { socketSubscribers.add(cb); return () => socketSubscribers.delete(cb) },
    setSocket: (next) => {
      currentSocket = next
      for (const cb of [...socketSubscribers]) cb()
    },
  },
})

const { act, render, cleanup } = await import("@testing-library/react")
const {
  default: InGameVoteStatusContent, INGAME_VOTE_STATUS_UNRESOLVED_LABEL,
} = await import("../InGameVoteStatusContent.jsx")
const { useInGameStore } = await import("../../../store/ingameStore.js")

const GAME_ID = "cn-v2-vote-status"

/** canonical store에 낮 투표 집계를 심는다(없으면 dayVoteResolution 자체를 두지 않는다). */
function seedState(dayVoteResolution) {
  act(() => {
    useInGameStore.setState({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "DAY",
        dayIndex: 1,
        dayPhase: "DAY_VOTE",
        players: [{ uuid: "u1", nickname: "A", alive: true }],
        self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN" },
        ...(dayVoteResolution ? { dayVoteResolution } : {}),
      },
    })
  })
}

const textOf = (container, testId) =>
  container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
})

test("AC-04: dayVoteResolution이 있으면 서버가 준 집계 네 값을 그대로 그린다", () => {
  seedState({
    round: 1,
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u2",
    publicVoteCount: 3,
    publicAbstainCount: 2,
    revoteExcludedUuids: [],
  })
  const view = render(React.createElement(InGameVoteStatusContent))

  assert.equal(textOf(view.container, "vote-status-public-vote-count"), "3")
  assert.equal(textOf(view.container, "vote-status-public-abstain-count"), "2")
  assert.equal(textOf(view.container, "vote-status-tribunal-target"), "u2")
  assert.match(textOf(view.container, "vote-status-outcome"), /재판 회부|TRIBUNAL/)
  assert.equal(view.container.querySelector('[data-testid="vote-status-unresolved"]'), null,
    "집계가 있는데 '집계 전'이 함께 떴다")
})

test("AC-04: 집계값 0도 '집계 전'이 아니라 0으로 그린다(없음과 0을 구별한다)", () => {
  seedState({
    round: 1,
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 0,
    publicAbstainCount: 0,
    revoteExcludedUuids: [],
  })
  const view = render(React.createElement(InGameVoteStatusContent))

  assert.equal(textOf(view.container, "vote-status-public-vote-count"), "0")
  assert.equal(textOf(view.container, "vote-status-public-abstain-count"), "0")
  assert.equal(textOf(view.container, "vote-status-tribunal-target"), "없음")
  assert.equal(view.container.querySelector('[data-testid="vote-status-unresolved"]'), null)
})

test("AC-04: dayVoteResolution이 없으면 '집계 전'만 그리고 어떤 숫자도 만들어 내지 않는다", () => {
  seedState(null)
  const view = render(React.createElement(InGameVoteStatusContent))

  assert.equal(textOf(view.container, "vote-status-unresolved"), INGAME_VOTE_STATUS_UNRESOLVED_LABEL)
  for (const testId of [
    "vote-status-public-vote-count", "vote-status-public-abstain-count",
    "vote-status-outcome", "vote-status-tribunal-target",
  ]) {
    assert.equal(view.container.querySelector(`[data-testid="${testId}"]`), null,
      `집계 전인데 ${testId}를 그렸다`)
  }
})

test("AC-04: 생산 원문이 더미 득표 상수를 더 이상 import하지 않는다", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(new URL("../InGameVoteStatusContent.jsx", import.meta.url), "utf8")
  // 주석은 제외한다 — 이 파일의 주석은 "더미를 왜 제거했는가"를 기록하므로 그 이름이 남아
  // 있는 것이 정상이고, 검사 대상은 실제로 실행되는 코드다.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

  assert.doesNotMatch(code, /DUMMY_VOTE_COUNTS/, "더미 득표 상수가 아직 쓰인다")
  assert.doesNotMatch(code, /ingameVotePreviewData/, "더미 데이터 모듈을 아직 import한다")
  assert.doesNotMatch(code, /isVoteStatusLeader|resolveVoteStatusLeaderVoteCount/,
    "더미 데이터 헬퍼가 아직 쓰인다")
  // 검사기 자신의 대조 — 주석 제거가 실제 코드까지 지워 버리면 위 세 단언이 무의미해진다.
  assert.match(code, /useInGameStore/, "주석 제거가 실제 코드까지 지웠다")
  // 그 모듈 자체도 저장소에 남아 있지 않다(다른 소비처가 없어 함께 삭제했다).
  const { access } = await import("node:fs/promises")
  await assert.rejects(
    () => access(new URL("../../../constants/vote/ingameVotePreviewData.js", import.meta.url)),
    "더미 데이터 모듈이 아직 저장소에 남아 있다",
  )
})

import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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

register(new URL("../../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

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
const { default: PlayerRecordListContent } = await import("../../../../../../../src/domains/game/ingame/components/controls/playerRecordList/PlayerRecordListContent.jsx")
const { InGamePlayerSessionProvider } = await import("../../../../../../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { useInGameStore } = await import("../../../../../../../src/domains/game/ingame/store/ingameStore.js")
const recordListData = await import("../../../../../../../src/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js")

const GAME_ID = "co-s1-player-records"

function seedPlayers(players) {
  act(() => {
    useInGameStore.setState({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "DAY",
        dayIndex: 1,
        dayPhase: "DAY_DISCUSSION",
        players,
        self: { uuid: "u1", nickname: "전적있음", role: "CITIZEN", team: "CITIZEN" },
      },
    })
  })
}

const statsTextOf = (container, uuid) =>
  container.querySelector(`[data-testid="player-record-stats-${uuid}"]`)?.textContent ?? null

function renderList() {
  return render(
    React.createElement(
      InGamePlayerSessionProvider,
      null,
      React.createElement(PlayerRecordListContent, null),
    ),
  )
}

test.afterEach(() => {
  cleanup()
  act(() => { useInGameStore.setState({ gameId: null, state: null }) })
})

test("CO S-1(AC-05): 전적이 있는 참가자는 판수·승률로, 없는 참가자는 조회 실패로 표시된다", () => {
  seedPlayers([
    { uuid: "u1", nickname: "전적있음", alive: true, themeIndex: 0, accountTotalGames: 3, accountWinRate: 67 },
    { uuid: "u2", nickname: "무전적", alive: true, themeIndex: 1, accountTotalGames: 0, accountWinRate: 0 },
    { uuid: "u3", nickname: "조회실패", alive: true, themeIndex: 2 },
  ])

  const { container } = renderList()

  assert.equal(statsTextOf(container, "u1"), "3판 | 67%")
  assert.equal(
    statsTextOf(container, "u2"), "0판 | 0%",
    "정말 0판인 계정을 조회 실패로 말하면 안 된다",
  )
  assert.equal(
    statsTextOf(container, "u3"), recordListData.PLAYER_RECORD_STATS_UNAVAILABLE_LABEL,
    "조회하지 못한 전적을 0판 0%로 꾸미면 안 된다",
  )
  assert.equal(recordListData.PLAYER_RECORD_STATS_UNAVAILABLE_LABEL, "조회 실패")

  assert.match(container.textContent, /전적있음/)
  assert.match(container.textContent, /조회실패/)
})

test("CO S-1(AC-05): 표시되는 전적은 슬롯 순서가 아니라 그 플레이어 자신의 값을 따라간다", () => {
  const players = [
    { uuid: "u1", nickname: "A", alive: true, themeIndex: 0, accountTotalGames: 3, accountWinRate: 67 },
    { uuid: "u2", nickname: "B", alive: true, themeIndex: 1, accountTotalGames: 12, accountWinRate: 25 },
  ]

  seedPlayers(players)
  const first = renderList()
  assert.equal(statsTextOf(first.container, "u1"), "3판 | 67%")
  assert.equal(statsTextOf(first.container, "u2"), "12판 | 25%")
  cleanup()

  seedPlayers([players[1], players[0]])
  const reversed = renderList()
  assert.equal(statsTextOf(reversed.container, "u1"), "3판 | 67%", "자리가 바뀌었다고 전적이 달라지면 안 된다")
  assert.equal(statsTextOf(reversed.container, "u2"), "12판 | 25%")
})

test("CO S-1(AC-05): 더미 전적 상수와 wins/losses 인자가 원문에서 사라졌고, 프로필 자산 헬퍼는 남아 있다", () => {
  const modulePath = new URL(
    "../../../../../../../src/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js",
    import.meta.url,
  )
  const source = readFileSync(modulePath, "utf8")

  assert.equal(source.includes("DUMMY_PLAYER_RECORDS_BASE"), false, "더미 전적 원본이 남아 있다")
  assert.equal(source.includes("DUMMY_PLAYER_RECORDS"), false, "더미 전적 배열이 남아 있다")
  assert.equal(recordListData.DUMMY_PLAYER_RECORDS, undefined, "더미 전적이 여전히 export되고 있다")
  assert.match(source, /formatPlayerRecordStats\(\{\s*totalGames,\s*winRate\s*\}/)
  assert.equal(/formatPlayerRecordStats\([^)]*wins/.test(source), false, "wins 인자가 남아 있다")
  assert.equal(/formatPlayerRecordStats\([^)]*losses/.test(source), false, "losses 인자가 남아 있다")

  assert.equal(typeof recordListData.getPlayerRecordListProfileAssets, "function")
  assert.equal(typeof recordListData.getPlayerRecordListFallbackProfileAssets, "function")

  const contentSource = readFileSync(new URL("../../../../../../../src/domains/game/ingame/components/controls/playerRecordList/PlayerRecordListContent.jsx", import.meta.url), "utf8")
  assert.equal(contentSource.includes("DUMMY_PLAYER_RECORDS"), false, "목록 본문이 아직 더미를 참조한다")
})

test("CO S-1(AC-05): formatPlayerRecordStats는 두 값이 모두 정수일 때만 숫자를 말한다", () => {
  const { formatPlayerRecordStats, PLAYER_RECORD_STATS_UNAVAILABLE_LABEL } = recordListData

  assert.equal(formatPlayerRecordStats({ totalGames: 3, winRate: 67 }), "3판 | 67%")
  assert.equal(formatPlayerRecordStats({ totalGames: 0, winRate: 0 }), "0판 | 0%")
  assert.equal(formatPlayerRecordStats({ totalGames: 7, winRate: 100 }), "7판 | 100%")

  for (const input of [undefined, {}, { totalGames: 3 }, { winRate: 67 }, { totalGames: 3, winRate: 66.7 }, { totalGames: "3", winRate: 67 }, { totalGames: null, winRate: null }]) {
    assert.equal(formatPlayerRecordStats(input), PLAYER_RECORD_STATS_UNAVAILABLE_LABEL)
  }
})

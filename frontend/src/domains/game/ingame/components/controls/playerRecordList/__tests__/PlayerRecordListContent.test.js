/**
 * CO S-1 AC-05 — 인게임 전적 목록이 **서버가 말한 전적만** 보여준다.
 *
 * 예전 이 화면은 ingamePlayerRecordListData.js의 DUMMY_PLAYER_RECORDS를 슬롯 index로 찾아
 * 그렸다. 그 숫자는 어떤 계정의 것도 아니어서, 화면이 남의 자리 더미를 그 사람의 전적이라고
 * 말하고 있었다. 지금은 세션 player의 accountTotalGames/accountWinRate만 원천이다.
 *
 *   · 두 값이 있으면 "{판수}판 | {승률}%"
 *   · 0판 0%도 서버가 말한 사실이므로 그대로 그린다(조회 실패와 섞지 않는다)
 *   · 서버가 조회하지 못해 키가 없으면 "조회 실패"
 *
 * 실제 경로(store → InGamePlayerSessionProvider → buildPlayerSessionSourceFromGameState →
 * useInGamePlayerSession → mergeSourcePlayerWithPreview → Content → Row)를 그대로 마운트한다 —
 * 중간 어느 단계가 전적을 떨어뜨려도 이 시험이 잡아야 하므로 Context·변환 함수를 모킹하지 않는다.
 */
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

register(new URL("../../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

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
const { default: PlayerRecordListContent } = await import("../PlayerRecordListContent.jsx")
const { InGamePlayerSessionProvider } = await import("../../../InGamePlayerSessionProvider.jsx")
const { useInGameStore } = await import("../../../../store/ingameStore.js")
const recordListData = await import("../../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js")

const GAME_ID = "co-s1-player-records"

/** canonical store에 실제 game_started state 모양으로 참가자 명단을 심는다. */
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
    // 서버가 조회하지 못한 참가자 — 두 키가 아예 없다.
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

  // 닉네임은 여전히 세션에서 온다(전적 배선이 이름 표시를 망가뜨리지 않았다).
  assert.match(container.textContent, /전적있음/)
  assert.match(container.textContent, /조회실패/)
})

test("CO S-1(AC-05): 표시되는 전적은 슬롯 순서가 아니라 그 플레이어 자신의 값을 따라간다", () => {
  // 같은 명단을 순서만 뒤집어 다시 심는다 — index 기반 더미가 남아 있으면 같은 uuid의
  // 전적이 자리 이동만으로 달라진다.
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
    "../../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js",
    import.meta.url,
  )
  const source = readFileSync(modulePath, "utf8")

  assert.equal(source.includes("DUMMY_PLAYER_RECORDS_BASE"), false, "더미 전적 원본이 남아 있다")
  assert.equal(source.includes("DUMMY_PLAYER_RECORDS"), false, "더미 전적 배열이 남아 있다")
  assert.equal(recordListData.DUMMY_PLAYER_RECORDS, undefined, "더미 전적이 여전히 export되고 있다")
  assert.match(source, /formatPlayerRecordStats\(\{\s*totalGames,\s*winRate\s*\}/)
  assert.equal(/formatPlayerRecordStats\([^)]*wins/.test(source), false, "wins 인자가 남아 있다")
  assert.equal(/formatPlayerRecordStats\([^)]*losses/.test(source), false, "losses 인자가 남아 있다")

  // 이 두 헬퍼는 결과 화면·추방 목록 등 다른 소비처가 함께 쓴다 — 함께 지우면 안 된다.
  assert.equal(typeof recordListData.getPlayerRecordListProfileAssets, "function")
  assert.equal(typeof recordListData.getPlayerRecordListFallbackProfileAssets, "function")

  const contentSource = readFileSync(new URL("../PlayerRecordListContent.jsx", import.meta.url), "utf8")
  assert.equal(contentSource.includes("DUMMY_PLAYER_RECORDS"), false, "목록 본문이 아직 더미를 참조한다")
})

test("CO S-1(AC-05): formatPlayerRecordStats는 두 값이 모두 정수일 때만 숫자를 말한다", () => {
  const { formatPlayerRecordStats, PLAYER_RECORD_STATS_UNAVAILABLE_LABEL } = recordListData

  assert.equal(formatPlayerRecordStats({ totalGames: 3, winRate: 67 }), "3판 | 67%")
  assert.equal(formatPlayerRecordStats({ totalGames: 0, winRate: 0 }), "0판 | 0%")
  assert.equal(formatPlayerRecordStats({ totalGames: 7, winRate: 100 }), "7판 | 100%")

  // 반쪽짜리·비정수·누락은 전부 조회 실패다(지어낸 숫자를 만들지 않는다).
  for (const input of [undefined, {}, { totalGames: 3 }, { winRate: 67 }, { totalGames: 3, winRate: 66.7 }, { totalGames: "3", winRate: 67 }, { totalGames: null, winRate: null }]) {
    assert.equal(formatPlayerRecordStats(input), PLAYER_RECORD_STATS_UNAVAILABLE_LABEL)
  }
})

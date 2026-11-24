// 판 사람 카드 메뉴 부품 시험 (누르면 열림·한 번에 하나·바깥·Esc·단계 바뀜·막힘·판 끝·키보드·우클릭·꺼진 항목 까닭 글)
// 목록 A13-F-236~247 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/card-menu.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"
import { syncWindowPath, resetWindowPath } from "../helpers/syncWindowPath.mjs"

const React = await import("react")
const rtl = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameChatSessionProvider } = await import("../../src/domains/game/ingame/components/chat/InGameChatSessionProvider.jsx")
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { installFetch, fakeSocket, signIn, resetAll, settle } = await import("./a13Kit.mjs")

const h = React.createElement
window.alert = () => {}
test.afterEach(() => {
  resetAll()
  resetWindowPath()
  useInGameStore.getState().clearGame()
  try { window.sessionStorage.clear() } catch { /* 저장소 막힘 무시 */ }
})

const GAME = "g-a13-card"
const NAMES = ["가람", "나래", "다솜", "라온", "마루", "바다", "사랑", "아라", "자람", "차미"]
const uuidOf = (i) => `p${i}`

// 판 앉히기: n명, 나는 0번 시민, 낮 투표 중 (dead = 죽은 자리 번호)
function seat(n, { dead = [] } = {}) {
  signIn(uuidOf(0), NAMES[0])
  markRoleRevealSeen(GAME, uuidOf(0))
  const players = Array.from({ length: n }, (_, i) => ({
    uuid: uuidOf(i), nickname: NAMES[i], isAlive: !dead.includes(i), isConnected: true, isParticipating: true, themeIndex: i % 8,
  }))
  useInGameStore.getState().setGamePayload({
    gameId: GAME,
    state: {
      id: GAME, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE", dayPhaseDeadline: Date.now() + 60_000, players,
      self: { uuid: uuidOf(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    },
  })
}

// 판 진행 알림 받기 붙이기 (로그인 보호 경로가 하는 일과 같음)
function EventsRoot({ children }) {
  useGameSessionSocketEvents()
  return children
}

// 카드 판 그리기 (판 화면과 같은 감싸기 차례), interactionBlocked = 연출 중 조작 막힘
async function openBoard(n, { dead = [], interactionBlocked = false } = {}) {
  seat(n, { dead })
  installFetch()
  const socket = fakeSocket()
  setSocket(socket)
  const board = h(InGamePlayerSessionProvider, null,
    h(InGameChatSessionProvider, null,
      h(InGameActionProvider, { interactionBlocked }, h(InGamePlayerBoard))))
  const router = createMemoryRouter([
    { path: "/ingame", element: h(EventsRoot, null, board) },
    { path: "*", element: h("p", null, "다른 화면") },
  ], { initialEntries: ["/ingame"] })
  // 앱(브라우저 라우터)처럼 window 주소도 같이 옮김 (판 끝 정리가 window 주소를 봄)
  syncWindowPath(router)
  await rtl.act(async () => { rtl.render(h(RouterProvider, { router })); await settle() })
  return socket
}

const cardOf = (i) => [...document.querySelectorAll('[role="button"][aria-haspopup="menu"]')]
  .find((el) => el.textContent.includes(NAMES[i])) ?? null
const menus = () => [...document.querySelectorAll('[role="menu"]')]
// 그 카드 칸 안에 메뉴가 열렸는지
const menuIn = (i) => menus().some((menu) => cardOf(i)?.parentElement?.contains(menu))
async function click(el) {
  await rtl.act(async () => { rtl.fireEvent.click(el); await settle() })
}
async function say(socket, event, payload) {
  await rtl.act(async () => { socket.serverSays(event, payload); await settle() })
}

test("A13-F-236 6명 판 낮 투표 중 다른 사람 카드 좌클릭 → role=\"menu\" 1개", async () => {
  await openBoard(6)
  await click(cardOf(2))
  assert.equal(menus().length, 1)
  assert.ok(menuIn(2))
})

test("A13-F-237 7명 판 A 카드 메뉴 연 채 B 카드 → A 메뉴 닫힘·B 메뉴 열림", async () => {
  await openBoard(7)
  await click(cardOf(1))
  await click(cardOf(4))
  assert.equal(menus().length, 1)
  assert.equal(menuIn(1), false)
  assert.ok(menuIn(4))
})

test("A13-F-238 5명 판 메뉴 연 채 빈 곳 누름 → 메뉴 없음", async () => {
  await openBoard(5)
  await click(cardOf(3))
  assert.equal(menus().length, 1)
  await rtl.act(async () => { rtl.fireEvent.mouseDown(document.body); await settle() })
  assert.equal(menus().length, 0)
})

test("A13-F-239 8명 판 메뉴 연 채 Esc → 메뉴 없음", async () => {
  await openBoard(8)
  await click(cardOf(5))
  assert.equal(menus().length, 1)
  await rtl.act(async () => { rtl.fireEvent.keyDown(document, { key: "Escape", code: "Escape" }); await settle() })
  assert.equal(menus().length, 0)
})

test("A13-F-240 7명 판 메뉴 연 채 재판 진입 알림 → 메뉴 없음", async () => {
  const socket = await openBoard(7)
  await click(cardOf(2))
  assert.equal(menus().length, 1)
  await say(socket, "day_vote_resolved", {
    gameId: GAME, dayIndex: 1, phase: "TRIBUNAL", round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: uuidOf(3),
    publicVoteCount: 7, publicAbstainCount: 0, revoteExcludedUuids: [], tribunalDeadline: Date.now() + 60_000,
  })
  assert.equal(useInGameStore.getState().state?.phase, "TRIBUNAL")
  assert.equal(menus().length, 0)
})

test("A13-F-241 6명 판 낮 시작 연출 중(조작 막힘) 카드 누름 → 메뉴 없음", async () => {
  await openBoard(6, { interactionBlocked: true })
  await click(cardOf(2))
  assert.equal(menus().length, 0)
})

test("A13-F-242 10명 판 메뉴 연 채 판 끝 알림 → 메뉴 없음", async () => {
  const socket = await openBoard(10)
  await click(cardOf(7))
  assert.equal(menus().length, 1)
  await say(socket, "game_ended", { gameId: GAME, winningTeam: "CITIZEN" })
  assert.equal(menus().length, 0)
})

// 카드 래퍼에 포커스 주고 키 누름
async function pressKey(el, key) {
  await rtl.act(async () => { el.focus(); rtl.fireEvent.keyDown(el, { key, code: key === " " ? "Space" : key }); await settle() })
}

test("A13-F-243 5명 판 카드 래퍼(role=button·tabIndex=0)에 포커스 → Enter → 메뉴 열림", async () => {
  await openBoard(5)
  const card = cardOf(2)
  assert.equal(card.getAttribute("role"), "button")
  assert.equal(card.tabIndex, 0)
  await pressKey(card, "Enter")
  assert.ok(menuIn(2))
})

test("A13-F-244 5명 판 카드 래퍼에 포커스 → Space → 메뉴 열림", async () => {
  await openBoard(5)
  const card = cardOf(3)
  assert.equal(card.getAttribute("role"), "button")
  assert.equal(card.tabIndex, 0)
  await pressKey(card, " ")
  assert.ok(menuIn(3))
})

test("A13-F-245 6명 판 다른 사람 카드 우클릭 → 카드 메뉴 없음", async () => {
  await openBoard(6)
  const card = cardOf(2)
  await rtl.act(async () => {
    rtl.fireEvent.mouseDown(card, { button: 2 })
    rtl.fireEvent.contextMenu(card, { button: 2 })
    await settle()
  })
  assert.equal(menus().length, 0)
})

// 열린 메뉴의 꺼진 항목 까닭 글 (title·숨김 글)
function disabledReasons() {
  const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].filter((b) => b.disabled)
  return items.map((b) => b.getAttribute("title"))
}

test("A13-F-246 8명 판 죽은 내가 산 사람 카드 → \"사망한 플레이어는 행동할 수 없습니다\"", async () => {
  await openBoard(8, { dead: [0] })
  await click(cardOf(3))
  assert.deepEqual(disabledReasons(), ["사망한 플레이어는 행동할 수 없습니다"])
})

test("A13-F-247 8명 판 투표 대상 아닌 카드(죽은 사람) → \"대상이 아닙니다\"", async () => {
  await openBoard(8, { dead: [5] })
  await click(cardOf(5))
  assert.deepEqual(disabledReasons(), ["대상이 아닙니다"])
})

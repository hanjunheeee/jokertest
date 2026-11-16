// 역할 확인 창 열고 닫기·단계 시험: 시작 알림을 넣고 역할 창이 10초 뒤·확인·첫 낮 알림에 닫히는지, 다시 열리는지 봄 (화면 상태, 가짜 시계)
// 목록 A02-F-108~115 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { React, RTL, installSocket, loginAs, resetAll, useInGameStore } from "./a02Render.mjs"
import { autoCounts, buildGameStarted, buildSnapshot, firstOf, nextGameId, seatPlayers } from "./a02Fixtures.mjs"

const { useInGameRoleReveal } = await import("../../src/domains/game/ingame/hooks/useInGameRoleReveal.js")
const h = React.createElement

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
test.afterEach(() => {
  resetAll()
  mock.timers.reset()
})

// 역할 창 열림을 글로 보여 주고 "확인" 단추로 닫는 작은 화면
function RevealProbe() {
  const { open, close, roleInfo } = useInGameRoleReveal()
  return h("div", null,
    h("p", { "data-testid": "reveal" }, open ? "열림" : "닫힘"),
    roleInfo ? h("p", null, roleInfo.roleName) : null,
    h("button", { type: "button", onClick: close }, "확인"),
  )
}
const revealText = () => RTL.screen.getByTestId("reveal").textContent

// 7명 판 의사로 로그인 → 시작 알림 → 창 그림
const SEATS = seatPlayers(autoCounts(7), { gameTag: "hook" })
const ME = firstOf(SEATS, "DOCTOR")
function startGame(gameId = nextGameId("hook")) {
  RTL.act(() => {
    useInGameStore.getState().setGamePayload(buildGameStarted(SEATS, ME, { gameId }))
  })
  return gameId
}
function mountWithGame() {
  installSocket()
  loginAs(ME)
  const gameId = startGame()
  RTL.render(h(RevealProbe))
  return gameId
}
const tick = (ms) => RTL.act(() => { mock.timers.tick(ms) })

// 첫 낮 알림 (game_phase_changed 낮 1일째, 마감 시각 같이)
const firstDay = (gameId) => RTL.act(() => {
  useInGameStore.getState().applyPhaseChanged({ gameId, phase: "DAY", dayIndex: 1, dayPhaseDeadline: 1_700_000_060_000 })
})

test("A02-F-108 가짜 시계 9,999ms → 역할 창 열림", () => {
  mountWithGame()
  assert.equal(revealText(), "열림")
  tick(9_999)
  assert.equal(revealText(), "열림")
})

test("A02-F-109 가짜 시계 10,000ms → 역할 창 닫힘", () => {
  mountWithGame()
  tick(10_000)
  assert.equal(revealText(), "닫힘")
})

test("A02-F-110 확인 누르면 창 닫힘, 판 단계는 여전히 역할 확인", () => {
  mountWithGame()
  tick(2_000)
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "확인" }))
  assert.equal(revealText(), "닫힘")
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
})

test("A02-F-111 6초에 game_phase_changed 낮 → 창 닫힘", () => {
  const gameId = mountWithGame()
  tick(6_000)
  assert.equal(revealText(), "열림")
  firstDay(gameId)
  assert.equal(revealText(), "닫힘")
})

test("A02-F-112 닫은 뒤 같은 판 값이 다시 옴 → 창 안 열림", () => {
  const gameId = mountWithGame()
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "확인" }))
  assert.equal(revealText(), "닫힘")
  startGame(gameId)
  assert.equal(revealText(), "닫힘")
})

test("A02-F-113 새 판 id game_started → 창 다시 열림", () => {
  mountWithGame()
  tick(10_000)
  assert.equal(revealText(), "닫힘")
  startGame(nextGameId("hook-2nd"))
  assert.equal(revealText(), "열림")
})

test("A02-F-114 [지금 동작] 역할 확인 중 새로고침(같은 판 스냅샷으로 다시 그림) → 창 다시 안 열림", () => {
  const gameId = mountWithGame()
  assert.equal(revealText(), "열림")
  // 새로고침: 화면·판 값이 사라지고 탭 저장소만 남음 → 스냅샷으로 판을 다시 채우고 다시 그림
  RTL.cleanup()
  RTL.act(() => { useInGameStore.getState().clearGame() })
  RTL.act(() => {
    useInGameStore.getState().bootstrapSessionSnapshot(buildSnapshot(SEATS, ME, { gameId, phase: "ROLE_REVEAL", dayIndex: 0 }))
  })
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
  RTL.render(h(RevealProbe))
  assert.equal(revealText(), "닫힘")
})

test("A02-F-115 game_phase_changed 낮 → 판 단계 낮·토론, 1일째", () => {
  const gameId = mountWithGame()
  firstDay(gameId)
  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "DAY")
  assert.equal(state.dayPhase, "DAY_DISCUSSION")
  assert.equal(state.dayIndex, 1)
})

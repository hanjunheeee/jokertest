// PC 재판 창을 가리는 겹 창 시험: 전적 창에서 신고 창을 연 채 재판이 열리면 신고 창이 닫힘, 재판 뒤 저절로 다시 안 뜸
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-286·287 (돌리기: node --experimental-test-module-mocks --test tests/a04-tribunal/goG2-report-cover.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 흉내 (채팅 칸·스크롤바가 씀)
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.ResizeObserver = globalThis.ResizeObserver
}
// 진짜 요청이 안 나가게 막음 (판 보드가 이모티콘 목록을 받음) → 빈 답
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
globalThis.window.fetch = globalThis.fetch

const React = await import("react")
const { render, screen, act, within, fireEvent, cleanup } = await import("@testing-library/react")
const { MotionGlobalConfig } = await import("framer-motion")
const { createMemoryRouter, RouterProvider, Outlet } = await import("react-router-dom")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { default: InGamePage } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")

// 창 움직임 건너뜀 (닫힌 창이 움직임 동안 남지 않게)
MotionGlobalConfig.skipAnimations = true
const h = React.createElement

// 신고는 판 id·사람 id가 uuid 모양일 때만 됨 → 서버처럼 uuid 모양으로 판을 차림 (0번 자리가 나, 시민)
const GAME = "6f1c2d3e-0000-4000-8000-00000000a004"
const NAMES = ["여우", "달빛", "별빛", "나비", "장미", "백합", "부엉이", "백조"]
const uuidOf = (i) => `a1b2c3d4-0000-4000-8000-00000000000${i}`

// 가짜 소켓: 받기 등록만 하고 요청엔 답 안 함 (서버로 진짜 요청은 안 나감)
function fakeSocket() {
  const listeners = new Map()
  const never = () => new Promise(() => {})
  const socket = {
    id: "goG2-sock",
    connected: true,
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return socket },
    off(event, fn) { listeners.get(event)?.delete(fn); return socket },
    emit() { return socket },
    emitWithAck: never,
    timeout() { return { emitWithAck: never } },
  }
  // 서버가 이 화면에 사건 하나 보냄
  const say = async (event, payload) => {
    await act(async () => { for (const fn of [...(listeners.get(event) ?? [])]) fn(payload) })
  }
  return { socket, say }
}

// 판 진행 알림 받기를 붙인 껍데기 (로그인 화면 묶음이 하는 일과 같음)
function Shell() {
  useGameSessionSocketEvents()
  return h(Outlet)
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.getState().logout()
  setSocket(null)
  try { globalThis.window.sessionStorage.clear() } catch { /* 탭 저장소 막힘 무시 */ }
})

// n명 판 1일 낮 투표 중인 PC 판 화면 전체
async function dayVotePage(n) {
  const { socket, say } = fakeSocket()
  setSocket(socket)
  useAuthStore.getState().login({ uuid: uuidOf(0), nickname: NAMES[0] })
  markRoleRevealSeen(GAME, uuidOf(0))
  const players = NAMES.slice(0, n).map((nickname, i) => ({
    uuid: uuidOf(i), nickname, isAlive: true, isConnected: true, isParticipating: true, themeIndex: i,
  }))
  const self = { uuid: uuidOf(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false }
  useInGameStore.getState().setGamePayload({
    gameId: GAME,
    state: { id: GAME, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE", dayPhaseDeadline: Date.now() + 60_000, players, self },
  })
  const router = createMemoryRouter([
    { element: h(Shell), children: [{ path: "/ingame", element: h(InGamePage) }, { path: "*", element: h("p", null, "다른 화면 (시험 자리)") }] },
  ], { initialEntries: ["/ingame"] })
  await act(async () => { render(h(RouterProvider, { router })) })
  return { say, n }
}
const press = async (element) => { await act(async () => { fireEvent.click(element) }) }

// 창이 떠 있는지 (참거짓만 비교에 넣음 — 화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const reportShown = () => screen.queryByRole("dialog", { name: "플레이어 신고" }) !== null
const tribunalDialog = () => screen.queryByRole("dialog", { name: "재판" })

// 전적 창 → 2번 자리 줄 "신고" → 신고 창
async function openReport() {
  await press(screen.getByRole("button", { name: "플레이어별 전적목록" }))
  await press(screen.getByRole("button", { name: `${NAMES[2]} 신고` }))
  assert.equal(reportShown(), true, "신고 창이 안 열림 (준비 잘못)")
}
// 낮 투표 판정 → 3번 자리 재판 (서버 day_vote_resolved 모양)
async function openTribunal(page) {
  await page.say("day_vote_resolved", {
    gameId: GAME, dayIndex: 1, phase: "TRIBUNAL", round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: uuidOf(3),
    publicVoteCount: page.n, publicAbstainCount: 0, revoteExcludedUuids: [], tribunalDeadline: Date.now() + 60_000,
  })
  assert.ok(tribunalDialog() !== null, "재판 창이 안 뜸 (준비 잘못)")
}

test("A04-F-286 6명 판: 전적 창에서 신고 창을 연 채 재판이 열림 → 신고 창 닫힘, 재판 창에 \"유죄\"·\"무죄\" 단추", async () => {
  const page = await dayVotePage(6)
  await openReport()
  await openTribunal(page)
  assert.equal(reportShown(), false, "신고 창이 재판 창 위에 남음")
  for (const name of ["유죄", "무죄"]) {
    assert.ok(within(tribunalDialog()).queryByRole("button", { name }) !== null, `재판 창에 ${name} 단추가 없음`)
  }
})

test("A04-F-287 7명 판: 재판이 끝나도(무죄 → 밤) 신고 창은 저절로 다시 안 뜸", async () => {
  const page = await dayVotePage(7)
  await openReport()
  await openTribunal(page)
  await page.say("tribunal_vote_resolved", {
    gameId: GAME, dayIndex: 1, phase: "NIGHT", defendantUuid: uuidOf(3), outcome: "NOT_GUILTY", executedUuid: null,
  })
  assert.ok(tribunalDialog() === null, "재판 창이 안 닫힘 (준비 잘못)")
  assert.equal(reportShown(), false, "재판이 끝나자 신고 창이 저절로 다시 뜸")
})

test("A04-F-288 6명 판: 전적 창에서 신고 창을 연 채 전원 기권으로 밤 안내(화면 잠금)가 뜸 → 신고 창 닫힘, 확인 뒤에도 저절로 안 뜸", async () => {
  const page = await dayVotePage(6)
  await openReport()
  await page.say("day_vote_resolved", {
    gameId: GAME, dayIndex: 1, phase: "NIGHT", round: 1, outcome: "ABSTAINED", tribunalTargetUuid: null,
    publicVoteCount: page.n, publicAbstainCount: page.n, revoteExcludedUuids: [],
  })
  assert.equal(reportShown(), false, "신고 창이 밤 안내 위에 남음")
  const confirm = [...document.querySelectorAll("[data-ingame-phase-entrance] button")].find((b) => b.textContent.trim() === "확인")
  assert.ok(confirm, "밤 안내 확인 단추가 없음")
  await press(confirm)
  assert.equal(reportShown(), false, "밤 안내를 닫자 신고 창이 저절로 다시 뜸")
})

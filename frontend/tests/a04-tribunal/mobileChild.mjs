// 따로 띄우는 node에서 그려 보는 재판 화면 두 가지: 모바일 위 단계 줄(PhaseLine)·개발 빌드 인게임 화면
// settle-timebar.test.js(A04-F-064)·gate.test.js(A04-F-220)가 execFileSync로 부르고 마지막 줄 JSON을 읽음
// 까닭: 모바일 화면은 길 풀기(@m/·React 한 벌)가, 개발 빌드는 import.meta.env 값이 달라 한 시험 프로세스에서 같이 못 씀
import { mock } from "node:test"

const scenario = process.argv[2]

// 개발 빌드면 길 풀기 전에 환경값을 정함 (모바일 시험 길 풀기가 이 값을 import.meta.env로 넣음)
if (scenario === "dev-gate") {
  globalThis.__TEST_IMPORT_META_ENV = { DEV: true, PROD: false, MODE: "development", BASE_URL: "/" }
}

await import("../../../frontend-mobile/tests/helpers/mobileLoader.mjs")
const { React, render, act } = await import("../../../frontend-mobile/tests/helpers/dom.mjs")
const h = React.createElement

// jsdom에 없는 크기 감시 흉내 (채팅 칸이 씀)
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver
globalThis.window.ResizeObserver ??= NoopResizeObserver
globalThis.window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve() }
globalThis.window.HTMLMediaElement.prototype.pause = function pause() {}

const { useInGameStore } = await import("@/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("@/domains/auth/store/auth.store.js")
const { setSocket } = await import("@/shared/socket/socketClient.js")
const { createDayHandlers } = await import("@/domains/game/ingame/hooks/sessionEvents/dayHandlers.js")
const { currentReceiptScope } = await import("@/domains/game/ingame/hooks/sessionEvents/scope.js")
const { markRoleRevealSeen } = await import("@/domains/game/ingame/utils/ingameSessionMemory.js")

// 6명 판, 나는 1번 자리 시민, 3번 자리 피고 (재판 중 스냅샷)
const NICKNAMES = ["여우", "달빛", "별빛", "나비", "장미", "백합"]
const players = NICKNAMES.map((nickname, i) => ({
  uuid: `a04c-p${i}`, nickname, isAlive: true, isConnected: true, isParticipating: true, membershipId: null, themeIndex: i,
}))
function tribunalSnapshot({ dayIndex, tribunalDeadline }) {
  return {
    ok: true, gameId: "a04c-game", phase: "TRIBUNAL", dayIndex, hostUuid: players[0].uuid,
    roomId: null, roomInstanceId: null, bootEpoch: null, roomCode: null,
    participationRevision: 0, selfProgressSeq: 0, tribunalDeadline, players,
    self: { uuid: players[1].uuid, nickname: players[1].nickname, role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, hasSubmittedTribunalVote: false },
    progress: { kind: "TRIBUNAL", doneCount: 0, requiredCount: 5 },
    dayVoteResolution: { round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: players[3].uuid, publicVoteCount: 6, publicAbstainCount: 0, revoteExcludedUuids: [] },
    tribunal: { defendantUuid: players[3].uuid, resolved: false },
  }
}

// 받기만 하는 가짜 소켓 (보낸 것은 기록만, 답 없음)
const sent = []
const socket = {
  id: "a04c-sock",
  connected: true,
  on() { return socket },
  off() { return socket },
  emit(event, payload) { sent.push({ event, payload }); return socket },
  emitWithAck(event, payload) { sent.push({ event, payload }); return new Promise(() => {}) },
  timeout() { return { emitWithAck: (event, payload) => { sent.push({ event, payload }); return new Promise(() => {}) } } },
}

function seed({ dayIndex, tribunalDeadline }) {
  setSocket(socket)
  useAuthStore.getState().login({ uuid: players[1].uuid, nickname: players[1].nickname })
  markRoleRevealSeen("a04c-game", players[1].uuid)
  useInGameStore.getState().bootstrapSessionSnapshot(tribunalSnapshot({ dayIndex, tribunalDeadline }), null)
  if (useInGameStore.getState().state?.phase !== "TRIBUNAL") throw new Error("판 차리기 실패")
}

// 모바일 위 단계 줄: 2일 재판 → 다 내 마감 당김 알림 → 1초 뒤 글
async function phaseLine() {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 })
  seed({ dayIndex: 2, tribunalDeadline: Date.now() + 60_000 })
  const { default: PhaseLine } = await import("@m/domains/game/ingame/components/talk/PhaseLine.jsx")
  render(h(PhaseLine, { expanded: false, onToggle: () => {} }))
  // 서버 phase_settle_started 그대로 판 진행 손잡이에 넣음
  act(() => {
    createDayHandlers({ ...currentReceiptScope() }).phaseSettleStarted({
      gameId: "a04c-game", phase: "TRIBUNAL", dayIndex: 2, role: null, deadline: Date.now() + 5_000,
    })
  })
  act(() => mock.timers.tick(0))
  act(() => mock.timers.tick(1_000))
  const line = document.querySelector("[data-talk-phase-line]")
  return { text: line?.textContent ?? "" }
}

// 개발 빌드 인게임 화면: 재판 중 화면에 보이는 단추 이름 전부
async function devGate() {
  seed({ dayIndex: 1, tribunalDeadline: Date.now() + 60_000 })
  const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
  const { default: InGamePage } = await import("@/domains/game/ingame/pages/InGamePage.jsx")
  const router = createMemoryRouter([{ path: "/ingame", element: h(InGamePage) }], { initialEntries: ["/ingame"] })
  render(h(RouterProvider, { router }))
  await act(async () => {})
  const buttons = [...document.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
  const dialog = document.querySelector('[data-ingame-tribunal-presentation]')
  return { devEnv: true, tribunalOpen: Boolean(dialog), buttons, text: document.body.textContent }
}

const result = scenario === "phase-line" ? await phaseLine() : await devGate()
process.stdout.write(`\n${JSON.stringify(result)}\n`)
process.exit(0)

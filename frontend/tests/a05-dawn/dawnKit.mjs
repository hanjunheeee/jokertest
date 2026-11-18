// 낮 시작 연출·5초 마감 화면 시험 도우미: 5~10명 판을 스냅샷으로 차리고, 가짜 소켓으로 서버 알림을 흘리고, 판 화면·조작 묶음·시간 바를 그림
// a05-dawn 폴더 시험 파일만 씀 (목록 A05b-밤-알림-낮연출.md 화면 PC A05-F-501~690), 시험 파일 맨 위에서 import
//
// 쓰는 법
//   import * as kit from "./dawnKit.mjs"
//   test.afterEach(kit.resetAll)
//   const g = await kit.openGame({ n: 7, me: 3, roles: { 0: "JOKER", 1: "DOCTOR" } })   // 1일 밤, 나는 3번 자리
//   await g.page()                                 // 인게임 화면 전체
//   await g.nightResult({ victim: 2 })             // 서버: 밤 결과 → 2일 낮
//   kit.dawnVideo()                                // 암살 영상 칸 (없으면 null)
// 서버 알림 모양은 백엔드 시험(backend/tests/flow/a05b-*·game-core/a05b-dawn-payload)이 받는 값과 같게 만듦
// 조심: 비교에 화면 요소·React 요소를 그대로 넣지 않음(틀리면 메모리가 넘침) → 참거짓·글자로 바꿔 비교
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 (채팅 칸이 씀) → 아무것도 안 함
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.ResizeObserver = globalThis.ResizeObserver
}
window.alert = () => {}

// jsdom엔 그림판(canvas)이 없음 → 아무것도 안 그리는 가짜 2d 판 (없으면 영상이 바로 오류로 끝남)
const FAKE_2D = Object.freeze({
  drawImage() {},
  getImageData() { return { data: new Uint8ClampedArray(0) } },
  createImageData() { return { data: new Uint8ClampedArray(0) } },
  putImageData() {},
})
window.HTMLCanvasElement.prototype.getContext = function getContext() { return FAKE_2D }
// 영상 프레임은 안 옴 (jsdom은 영상을 못 풂) → 0ms 반복 예약이 끝없이 안 돌게 프레임 콜백을 빈 것으로
window.HTMLVideoElement.prototype.requestVideoFrameCallback = function requestVideoFrameCallback() { return 1 }
window.HTMLVideoElement.prototype.cancelVideoFrameCallback = function cancelVideoFrameCallback() {}

// 창 열고 닫는 움직임은 바로 끝냄 (안 끝나면 메모리가 바닥남)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

// 진짜 요청이 안 나가게 fetch를 가짜로: 이모티콘 팔레트는 한 칸, 나머지는 빈 성공
export const sentHttp = []
globalThis.fetch = async (url, options = {}) => {
  sentHttp.push({ url: String(url), method: options.method ?? "GET" })
  const body = String(url).includes("emoji-palette")
    ? { slots: ["emoji-basic-hello"], revision: "r1", ownedEmoticonIds: ["emoji-basic-hello"] }
    : {}
  return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } })
}

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider, Outlet } = await import("react-router-dom")
export const { useInGameStore, selectDawnReport } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { onSessionEvents } = await import("../../src/domains/game/ingame/socket/session.js")
const { currentReceiptScope } = await import("../../src/domains/game/ingame/hooks/sessionEvents/scope.js")
const { createNightHandlers } = await import("../../src/domains/game/ingame/hooks/sessionEvents/nightHandlers.js")
const { createDayHandlers } = await import("../../src/domains/game/ingame/hooks/sessionEvents/dayHandlers.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { default: InGamePage, InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { default: InGameCornerActionPanel } = await import("../../src/domains/game/ingame/components/actions/InGameCornerActionPanel.jsx")
const { default: InGameTimebar } = await import("../../src/domains/game/ingame/components/timebar/InGameTimebar.jsx")
const { mapGamePhaseToTimebarPhaseId } = await import("../../src/domains/game/ingame/constants/timebar/ingameTimebarAssets.js")
const { useTurnProgress } = await import("../../src/domains/game/ingame/hooks/timebar/useTurnProgress.js")
export const { selectInGameTimebarStatusLabel, selectInGamePhaseSettled } = await import("../../src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js")
export const { selectInGameTimebarPhaseDeadline } = await import("../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")

const h = React.createElement

// 자리마다 닉네임 (직업 이름과 안 겹치는 낱말만)
export const NAMES = ["여름", "가을", "겨울", "새벽", "노을", "구름", "바람", "이슬", "햇살", "물결"]
// 직업 화면 이름 (e2e/helpers/ui.js ROLE_LABELS와 같음)
export const ROLE_LABELS = { JOKER: "광대", DOCTOR: "의사", GUARD: "경비원", WITCH_HUNTER: "마녀사냥꾼", CITIZEN: "귀족" }
// 글에 직업 이름이 섞였는지 볼 때 씀
export const ROLE_WORDS = /광대|시민|귀족|의사|경비원|마녀사냥꾼/
// 직업 → 팀 (서버 ROLE_TEAMS와 같음)
const TEAM_OF = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
// 카드 메뉴 밤 행동 단추 이름
export const NIGHT_ACTION_LABELS = { JOKER: "암살", DOCTOR: "보호", GUARD: "조사", WITCH_HUNTER: "확인" }

// 결과 화면 자리 (이동했는지 글로 확인)
export const RESULT_PAGE_TEXT = "결과 화면 (시험 자리)"
// 화면 글 두 가지
// 아무도 안 죽은 밤 글 (의사가 살렸든 광대가 안 죽였든 같음, 사용자 결정 2026-11-18)
export const QUIET_TEXT = "지난밤 아무 일도 일어나지 않았습니다"
export const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`
export const DAY_ENTRANCE_TEXT = "낮이 되었습니다"

// 판마다 다른 id (탭 저장소 역할 공개 기억이 시험끼리 안 섞이게)
let gameSeq = 0
// 지금 열린 판 (시험 하나에 하나)
let current = null

// 가짜 소켓: 보낸 요청은 sent에 모으고, 답은 replies 표대로 (스냅샷 묻기는 답 없음 — 새로고침 묻기가 판을 안 흔들게)
function makeFakeSocket(id) {
  const listeners = new Map()
  const sent = []
  const replies = { submit_night_action: { ok: true } }
  const answer = (event, payload) => {
    if (event === "get_session_snapshot") return new Promise(() => {})
    const rule = Object.hasOwn(replies, event) ? replies[event] : { ok: true }
    return Promise.resolve(typeof rule === "function" ? rule(payload) : rule)
  }
  const socket = {
    id,
    connected: true,
    sent,
    replies,
    on(event, fn) {
      if (typeof fn !== "function") return socket
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload, cb) {
      sent.push({ event, payload })
      if (typeof cb === "function" && event !== "get_session_snapshot") answer(event, payload).then(cb)
      return socket
    },
    emitWithAck(event, payload) {
      sent.push({ event, payload })
      return answer(event, payload)
    },
    timeout() { return { emitWithAck: (event, payload) => socket.emitWithAck(event, payload) } },
    // 서버가 이 소켓에 사건을 보낸 것처럼 받기 손잡이를 부름
    serverEmit(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
    },
  }
  return socket
}

// 사건 받는 껍데기 (로그인 화면 묶음처럼 판 진행 알림 받기를 붙임)
function Shell() {
  useGameSessionSocketEvents()
  return h(Outlet)
}

// 조작 값 엿보기
function Probe({ sink }) {
  sink.ctx = React.useContext(InGameActionContext)
  return null
}

// 시간 바: 인게임 화면이 넘기는 값(상태 글·단계 마감·남은 시간) 그대로 만들어 그림
function TimebarLikePage() {
  const gameState = useInGameStore((s) => s.state)
  const deadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const { remainingRatio, remainingSec } = useTurnProgress(deadline)
  return h(InGameTimebar, {
    day: gameState?.dayIndex,
    activePhaseId: mapGamePhaseToTimebarPhaseId(gameState?.phase),
    statusLabel: selectInGameTimebarStatusLabel(gameState),
    phaseTurnDeadline: deadline,
    remainingRatio,
    remainingSec,
  })
}

// 판 차리기 (빈 스토어에 서버 스냅샷 답을 넣음 — 화면에 처음 들어온 것과 같음)
// n: 5~10명, me: 내 자리, roles: { 자리: 직업 } (안 적은 자리는 시민), dead: 처음부터 죽은 자리
// phase·dayIndex: 처음 단계, nightTurnRole·nightTurnDeadline: 밤 차례 (스냅샷 칸)
export async function openGame({
  n, me = 0, roles = {}, dead = [], phase = "NIGHT", dayIndex = 1, nightTurnRole = null, nightTurnDeadline = null,
  dayPhase = "DAY_DISCUSSION", gameId, events = true,
} = {}) {
  if (!Number.isInteger(n) || n < 5 || n > 10) throw new Error(`판 인원은 5~10명 (받은 값 ${n})`)
  gameSeq += 1
  const g = {
    gameId: gameId ?? `a05-dawn-${gameSeq}`,
    n,
    me,
    seats: Array.from({ length: n }, (_, i) => ({
      uuid: `dw${gameSeq}-p${i}`,
      nickname: NAMES[i],
      role: roles[i] ?? "CITIZEN",
      alive: !dead.includes(i),
    })),
    phase,
    dayIndex,
    view: null,
    router: null,
    off: null,
  }
  current = g
  attach(g)
  g.socket = makeFakeSocket(`a05-dawn-sock-${gameSeq}`)
  setSocket(g.socket)
  useAuthStore.getState().login({ uuid: g.uuid(me), nickname: g.nick(me) })
  markRoleRevealSeen(g.gameId, g.uuid(me))
  // 스토어 값만 보는 시험: 화면이 붙이는 것과 같은 알림 손잡이를 가짜 소켓에 붙임
  if (events === "store") {
    const registered = { ...currentReceiptScope() }
    g.off = onSessionEvents(g.socket, { ...createDayHandlers(registered), ...createNightHandlers(registered) })
  }
  RTL.act(() => {
    useInGameStore.getState().bootstrapSessionSnapshot(g.snapshot({ phase, dayIndex, nightTurnRole, nightTurnDeadline, dayPhase }), null)
  })
  if (useInGameStore.getState().gameId !== g.gameId) throw new Error("판 차리기 실패: 스냅샷을 스토어가 안 받음")
  return g
}

// 판 손잡이 붙이기
function attach(g) {
  g.uuid = (i) => g.seats[i].uuid
  g.nick = (i) => g.seats[i].nickname
  g.store = () => useInGameStore.getState()
  g.state = () => useInGameStore.getState().state
  g.dawn = () => useInGameStore.getState().dawnReport
  g.player = (i) => (g.state()?.players ?? []).find((p) => p.uuid === g.uuid(i)) ?? null
  g.sentOf = (event) => g.socket.sent.filter((e) => e.event === event).map((e) => e.payload)
  g.sentEvents = () => g.socket.sent.map((e) => e.event)
  g.path = () => g.router?.state.location.pathname ?? null

  // 서버 스냅샷 답 (서버 buildSessionSnapshot 모양)
  g.snapshot = ({ phase = g.phase, dayIndex = g.dayIndex, nightTurnRole = null, nightTurnDeadline = null, dayPhase = "DAY_DISCUSSION" } = {}) => {
    const mine = g.seats[g.me]
    const allies = g.seats.filter((s, i) => i !== g.me && s.role === mine.role).map((s) => s.uuid)
    return {
      ok: true,
      gameId: g.gameId,
      phase,
      dayIndex,
      hostUuid: g.seats[0].uuid,
      participationRevision: 0,
      selfProgressSeq: 0,
      ...(phase === "DAY" ? { dayPhase, dayPhaseDeadline: Date.now() + 120_000 } : {}),
      // 밤 차례 칸은 차례 중일 때만 (역할·마감은 같이 오거나 같이 없음)
      ...(phase === "NIGHT" && nightTurnRole ? { nightTurnRole, nightTurnDeadline } : {}),
      players: g.seats.map((s, i) => ({
        uuid: s.uuid, nickname: s.nickname, isAlive: s.alive, isConnected: true, isParticipating: true, themeIndex: i,
      })),
      self: {
        uuid: mine.uuid,
        nickname: mine.nickname,
        role: mine.role,
        team: TEAM_OF[mine.role],
        ...(mine.role === "CITIZEN" ? {} : { allies }),
        hasActedThisPhase: false,
      },
    }
  }

  // 서버가 이 화면에 사건 하나 보냄
  g.say = async (event, payload) => {
    await RTL.act(async () => { g.socket.serverEmit(event, payload) })
    await flush()
  }

  // 밤 차례 시작·끝 (마감은 안 주면 30초 뒤)
  g.turnStarts = (role, { deadline = Date.now() + 30_000, dayIndex = g.dayIndex, gameId = g.gameId } = {}) =>
    g.say("night_turn_started", { gameId, dayIndex, role, deadline })
  g.turnEnds = (role, { dayIndex = g.dayIndex } = {}) =>
    g.say("night_turn_ended", { gameId: g.gameId, dayIndex, role })

  // 다 골라 마감이 5초로 당겨짐 (서버 phase_settle_started 모양)
  g.settlePayload = ({ role = null, phase = "NIGHT", dayIndex = g.dayIndex, gameId = g.gameId, ms = 5_000, deadline } = {}) =>
    ({ gameId, phase, dayIndex, role, deadline: deadline ?? Date.now() + ms })
  g.settle = async (options = {}) => {
    const payload = g.settlePayload(options)
    await g.say("phase_settle_started", payload)
    return payload
  }

  // 내게만 오는 밤 결과 (조사·확인은 대상·직업, 암살은 실패만)
  g.privateResult = (fields, { dayIndex = g.dayIndex } = {}) =>
    g.say("night_action_result", { gameId: g.gameId, dayIndex, ...fields })

  // 밤 결과 값 (서버 buildNightResultAppliedPayload 모양) — victim: 이번 밤에 죽은 자리, ended: 이긴 쪽("JOKER"·"CITIZEN")
  // saved: 의사가 살린 밤이라는 시험 뜻만 (서버는 2026-11-18부터 의사 살림 칸을 안 보냄 → 값은 광대가 안 죽인 밤과 같음)
  g.nightResultPayload = ({ victim = null, saved = false, ended = null, gameId = g.gameId, dayIndex } = {}) => {
    void saved
    const victimUuid = victim === null ? null : g.uuid(victim)
    const aliveAfter = (s) => s.alive && s.uuid !== victimUuid
    const base = {
      gameId,
      victimUuid,
      deathReveals: victimUuid ? [{ victimUuid, source: "JOKER" }] : [],
    }
    if (ended) {
      return {
        ...base,
        phase: "ENDED",
        dayIndex: dayIndex ?? g.dayIndex,
        players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: aliveAfter(s) })),
        winResult: {
          winner: ended,
          reveals: g.seats.map((s) => ({
            uuid: s.uuid, nickname: s.nickname, role: s.role, team: TEAM_OF[s.role], alive: aliveAfter(s),
            deathReason: aliveAfter(s) ? null : "NIGHT", goldReward: 0,
          })),
        },
        resultClosesAt: Date.now() + 180_000,
      }
    }
    return {
      ...base,
      phase: "DAY",
      dayIndex: dayIndex ?? g.dayIndex + 1,
      players: g.seats.map((s) => ({ uuid: s.uuid, alive: aliveAfter(s) })),
      dayPhaseDeadline: Date.now() + 120_000,
    }
  }
  // 밤 결과 보내기 (판 값도 따라 바꿈 — 다른 판·지난 날 값이면 안 바꿈)
  g.nightResult = async (options = {}) => {
    const payload = g.nightResultPayload(options)
    if (payload.gameId === g.gameId && options.dayIndex === undefined) {
      if (options.victim !== null && options.victim !== undefined) g.seats[options.victim].alive = false
      if (payload.phase === "DAY") { g.dayIndex = payload.dayIndex; g.phase = "DAY" } else { g.phase = "ENDED" }
    }
    await g.say("night_result_applied", payload)
    return payload
  }

  // 낮을 모두 기권으로 넘겨 밤으로 (투표 시작 알림 → 판정 알림)
  g.dayToNight = async () => {
    const alive = g.seats.filter((s) => s.alive).length
    await g.say("day_phase_changed", { gameId: g.gameId, dayIndex: g.dayIndex, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: Date.now() + 60_000 })
    await g.say("day_vote_resolved", {
      gameId: g.gameId, dayIndex: g.dayIndex, phase: "NIGHT", round: 1, outcome: "ABSTAINED",
      tribunalTargetUuid: null, publicVoteCount: alive, publicAbstainCount: alive, revoteExcludedUuids: [],
    })
    g.phase = "NIGHT"
  }

  // 그리기: 인게임 화면 전체 / 조작 묶음(카드 판·구석 단추 + 조작 값 엿보기) / 시간 바 / 아무 요소
  g.mountElement = async (element) => {
    g.router = createMemoryRouter([
      {
        element: h(Shell),
        children: [
          { path: "/ingame", element },
          { path: "/gameresult", element: h("p", null, RESULT_PAGE_TEXT) },
          { path: "*", element: h("p", null, "다른 화면 (시험 자리)") },
        ],
      },
    ], { initialEntries: ["/ingame"] })
    await RTL.act(async () => {
      g.view = RTL.render(h(RouterProvider, { router: g.router }))
    })
    await flush()
    return g.view
  }
  g.page = () => g.mountElement(h(InGamePage))
  g.panel = async ({ interactionBlocked = false } = {}) => {
    const sink = { ctx: null }
    await g.mountElement(h(InGamePlayerSessionProvider, null,
      h(InGameActionProvider, { interactionBlocked },
        h(Probe, { sink }),
        h(InGameCornerActionPanel, { onVoteStatusClick: () => {} }),
        h(InGamePlayerBoard))))
    g.sink = sink
    return sink
  }
  g.timebar = () => g.mountElement(h(TimebarLikePage))
  g.ctx = () => g.sink?.ctx ?? null

  // 새로고침: 화면 내림 → 판 값 비움(새 탭 메모리) → 새 소켓 → 서버 스냅샷으로 다시 채움 → 같은 화면 다시 그림
  g.reload = async (snapshotOptions = {}, { view = "page" } = {}) => {
    RTL.cleanup()
    RTL.act(() => { useInGameStore.getState().clearGame() })
    g.socket = makeFakeSocket(`a05-dawn-sock-${gameSeq}-reload`)
    setSocket(g.socket)
    RTL.act(() => {
      useInGameStore.getState().bootstrapSessionSnapshot(g.snapshot(snapshotOptions), null)
    })
    if (view === "page") await g.page()
    else if (view === "panel") await g.panel()
    else if (view === "timebar") await g.timebar()
  }
}

// 약속 풀림·화면 다시 그리기 기다림
export async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await RTL.act(async () => { await Promise.resolve() })
  }
}

// 화면이 바뀔 때까지 진짜 시계로 조금씩 기다림 (판 화면 + RTL waitFor는 안 끝나서 따로 둠), 넘으면 실패
export async function waitUntil(check, { timeoutMs = 3_000, stepMs = 20, what = "화면 바뀜" } = {}) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`${what}: ${timeoutMs}ms 안에 안 됨`)
    await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, stepMs)) })
  }
}

// 누르기 (화면 다시 그리기까지)
export async function click(element) {
  await RTL.act(async () => { RTL.fireEvent.click(element) })
  await flush()
}

// 가짜 시계 (setTimeout + Date), 판 차리기 전에 부름
export function useFakeClock(now = 1_800_000_000_000) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now })
}
export async function tick(ms) {
  await RTL.act(async () => { mock.timers.tick(ms) })
  await flush()
}

// 화면에서 찾기
export const dawnVideo = () => document.querySelector("[data-ingame-night-success-kill]")
export const dawnVideoMessage = () => document.querySelector("[data-ingame-dawn-report-message]")?.textContent ?? null
export const dawnDialog = (kind) => document.querySelector(kind ? `[data-ingame-dawn-report="${kind}"]` : "[data-ingame-dawn-report]")
export const dayEntrance = () => document.querySelector('[data-ingame-phase-entrance="DAY"]')
export const sourceVideo = () => document.querySelector("video[data-ingame-night-success-source-video]")
export const privateResultDialog = () => RTL.screen.queryByRole("dialog", { name: "밤 조사 결과" })
export const deadChoiceDialog = () => RTL.screen.queryByRole("dialog", { name: "사망 후 선택" })
export const settleMark = () => document.querySelector("[data-ingame-phase-settle]")
export const bodyText = () => document.body.textContent

// 아무 낮 시작 연출(영상·글 창)도 없는지
export const noDawn = () => dawnVideo() === null && dawnDialog() === null

// 영상이 끝까지 재생됨 (영상 끝 알림)
export async function endVideo() {
  const video = sourceVideo()
  if (!video) throw new Error("암살 영상이 없음")
  await RTL.act(async () => { RTL.fireEvent(video, new window.Event("ended")) })
  await flush()
}

// 글 창의 "확인" 누르기 (창 안 단추)
export async function confirmIn(element) {
  if (!element) throw new Error("창이 없음")
  const button = RTL.within(element.closest("[role=dialog]") ?? element).getByRole("button", { name: "확인" })
  await click(button)
}

// 낮 시작 연출을 끝냄: 영상이면 영상 끝, 글 창이면 "확인", 그 뒤 창이 빠질 때까지 기다림
export async function finishDawn() {
  if (dawnVideo()) await endVideo()
  else if (dawnDialog()) await confirmIn(dawnDialog())
  await waitUntil(noDawn, { what: "낮 시작 연출 닫힘" })
}

// 닉네임으로 카드 누름 칸 찾기
export function cardOf(nickname) {
  const card = document.querySelector(`[data-ingame-player-nickname="${nickname}"]`)
  if (!card) throw new Error(`카드 없음: ${nickname}`)
  return card.closest("[role=button]")
}
// 카드 정보 칸 (상태·닉네임 표시가 붙은 요소)
export const cardInfo = (nickname) => document.querySelector(`[data-ingame-player-nickname="${nickname}"]`)

// 카드 눌러 열린 메뉴 단추 [{ name, enabled, el }] (메뉴 안 열리면 빈 목록)
// name은 단추에 보이는 글 (밤 행동 단추의 읽기 이름엔 대상 닉네임이 앞에 붙음, 예: 읽기 이름 "지영 암살" → 보이는 글 "암살")
export async function openMenu(nickname) {
  await click(cardOf(nickname))
  const menu = cardOf(nickname).parentElement.querySelector("[role=menu]")
  if (!menu) return []
  return [...menu.querySelectorAll("[role=menuitem]")].map((b) => ({
    name: b.querySelector("span")?.textContent ?? b.getAttribute("aria-label"), enabled: !b.disabled, el: b,
  }))
}
// 메뉴 닫기
export async function closeMenu() {
  await RTL.act(async () => { RTL.fireEvent.keyDown(document, { key: "Escape" }) })
  await flush()
}

// 이름이 "밤 종료"인 단추가 화면 어디에 있는지 (글·읽기 이름 둘 다 봄)
export function findButtonNamed(name) {
  const all = [...document.querySelectorAll("button, [role=button], [role=menuitem]")]
  return all.some((el) => (el.getAttribute("aria-label") ?? "").includes(name) || el.textContent.includes(name))
}

// 시험 하나 끝: 화면 내림 → 시계 풂 → 알림 떼기 → 판·로그인·소켓·탭 저장소 비움
export function resetAll() {
  RTL.cleanup()
  mock.timers.reset()
  if (current?.off) current.off()
  current = null
  RTL.act(() => {
    useInGameStore.getState().clearGame()
    useInGameStore.setState({ snapshotSeq: 0 })
  })
  useAuthStore.getState().logout()
  setSocket(null)
  try { window.sessionStorage.clear() } catch { /* 저장소 막힘은 그냥 둠 */ }
  try { window.localStorage.clear() } catch { /* 저장소 막힘은 그냥 둠 */ }
}

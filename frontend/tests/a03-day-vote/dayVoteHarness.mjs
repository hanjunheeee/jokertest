// 낮 투표 화면 시험 같이 쓰는 준비 파일 (가짜 소켓·판 차리기·화면 그리기·알림 넣기)
// a03-day-vote 폴더 시험 파일들만 씀 — 목록 A03-낮투표.md 화면 PC 번호 A03-F-001~240
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 (채팅 칸이 씀) → 아무것도 안 함
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = globalThis.ResizeObserver
// 판에서 빠질 때 알림 창 → 화면 시험에선 조용히 넘김
window.alert = () => {}

// 창 열고 닫는 움직임은 바로 끝냄 (jsdom엔 그림이 없고, 닫힘 움직임이 act 안에서 안 끝나 시험이 멈춤)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

export const React = await import("react")
export const rtl = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
const { useContext } = React
export const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { INGAME_PLAYER_THEME_PALETTE_SIZE } = await import("../../src/shared/constants/ingamePlayerTheme.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { default: InGamePage, InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { default: InGameCornerActionPanel } = await import("../../src/domains/game/ingame/components/actions/InGameCornerActionPanel.jsx")
const { default: InGamePhaseActionRow } = await import("../../src/domains/game/ingame/components/timebar/InGamePhaseActionRow.jsx")
export const { selectInGameTimebarStatusLabel } = await import("../../src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js")
export const { selectInGameTimebarPhaseDeadline } = await import("../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")

const h = React.createElement
export const GAME = "g-a03"
export const T0 = 1_763_280_000_000
// 판 사람 이름 (10명까지), 직업 이름은 화면에 안 감
export const NAMES = ["가람", "나래", "다솜", "라온", "마루", "바다", "사랑", "아라", "자람", "차미"]
export const uuidOf = (i) => `p${i}`
export const ROLE_TEAM = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
// 화면 우리말 직업 이름 (e2e/helpers/ui.js ROLE_LABELS와 같음)
export const ROLE_LABELS = { JOKER: "광대", DOCTOR: "의사", GUARD: "경비원", WITCH_HUNTER: "마녀사냥꾼", CITIZEN: "귀족" }

// 서버가 주는 모양의 명단 (죽음·끊김·나감은 번호로)
export function roster(n, { dead = [], disconnected = [], left = [] } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    uuid: uuidOf(i),
    nickname: NAMES[i],
    isAlive: !dead.includes(i) && !left.includes(i),
    isConnected: !disconnected.includes(i),
    isParticipating: !left.includes(i),
    themeIndex: i % INGAME_PLAYER_THEME_PALETTE_SIZE,
  }))
}

// 서버 소켓 흉내: 보낸 사건을 모으고, 답은 acks 표대로 (함수면 값 받아 답 만듦)
// get_session_snapshot은 따로 안 주면 답 없음(새로고침 묻기가 판을 안 흔들게)
export function fakeSocket({ acks = {} } = {}) {
  const handlers = new Map()
  const sent = []
  const answer = (event, payload) => {
    const rule = Object.hasOwn(acks, event) ? acks[event] : (event === "get_session_snapshot" ? "never" : { ok: true })
    if (rule === "never") return new Promise(() => {})
    const value = typeof rule === "function" ? rule(payload) : rule
    return Promise.resolve(value)
  }
  const socket = {
    connected: true,
    id: "sock-a03",
    sent,
    acks,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      handlers.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload, cb) {
      sent.push({ event, payload })
      if (typeof cb === "function") answer(event, payload).then(cb)
      return socket
    },
    emitWithAck(event, payload) {
      sent.push({ event, payload })
      return answer(event, payload)
    },
    timeout() {
      return { emitWithAck: (event, payload) => socket.emitWithAck(event, payload) }
    },
    fire(event, payload) {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(payload)
    },
    sentOf(event) {
      return sent.filter((entry) => entry.event === event).map((entry) => entry.payload)
    },
  }
  return socket
}

// 답을 손으로 풀어 주는 약속 (보내는 중 상태를 보려고)
export function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

// 판 차리기: 로그인·역할 창 본 것으로·스토어에 판 시작 값 (me = 내 자리 번호)
// 예: seat({ n: 7, role: "JOKER", allies: [3], phase: "DAY", dayPhase: "DAY_VOTE" })
export function seat({
  n = 5, me = 0, role = "CITIZEN", allies, phase = "DAY", dayIndex = 1, dayPhase = "DAY_VOTE",
  deadline = Date.now() + 60_000, dead = [], disconnected = [], left = [], self = {}, state = {},
  seenRoleReveal = true,
} = {}) {
  const myUuid = uuidOf(me)
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: myUuid, nickname: NAMES[me] } })
  if (seenRoleReveal) markRoleRevealSeen(GAME, myUuid)
  const players = roster(n, { dead, disconnected, left })
  const selfInfo = {
    uuid: myUuid,
    nickname: NAMES[me],
    role,
    team: ROLE_TEAM[role],
    hasActedThisPhase: false,
    ...(role === "JOKER" ? { allies: (allies ?? []).map(uuidOf) } : {}),
    ...(role !== "JOKER" && role !== "CITIZEN" && allies ? { allies: allies.map(uuidOf) } : {}),
    ...self,
  }
  const gameState = {
    id: GAME,
    phase,
    dayIndex,
    ...(phase === "DAY" ? { dayPhase, dayPhaseDeadline: deadline } : {}),
    ...(phase === "TRIBUNAL" ? { tribunalDeadline: deadline } : {}),
    ...(phase === "NIGHT" ? { nightTurnRole: null, nightTurnDeadline: null } : {}),
    players,
    self: selfInfo,
    ...state,
  }
  useInGameStore.getState().setGamePayload({ gameId: GAME, state: gameState })
  return { myUuid, players }
}

// 새로고침 흉내: 판 값 없이 로그인만 (스냅샷 답이 판을 채움)
export function loginOnly({ me = 0 } = {}) {
  const myUuid = uuidOf(me)
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: myUuid, nickname: NAMES[me] } })
  markRoleRevealSeen(GAME, myUuid)
  return { myUuid }
}

// 판 진행 알림 받기 붙이기 (로그인 보호 경로가 하는 일과 같음)
function EventsRoot({ children }) {
  useGameSessionSocketEvents()
  return children
}

function routerFor(element) {
  return createMemoryRouter(
    [
      { path: "/ingame", element: h(EventsRoot, null, element) },
      { path: "*", element: h(EventsRoot, null, h("p", null, "다른 화면")) },
    ],
    { initialEntries: ["/ingame"] },
  )
}

// 인게임 화면 전체 그리기
export async function renderPage(socket) {
  setSocket(socket)
  let view
  await rtl.act(async () => {
    view = rtl.render(h(RouterProvider, { router: routerFor(h(InGamePage)) }))
  })
  await flush()
  return view
}

// 알림 받기만 붙이기 (스토어 값만 보는 시험)
export async function renderEvents(socket) {
  setSocket(socket)
  await rtl.act(async () => {
    rtl.render(h(RouterProvider, { router: routerFor(null) }))
  })
  await flush()
}

// 조작 값 엿보기 (화면이 들고 있는 낮 표·준비·대상 값)
function Probe({ sink }) {
  sink.ctx = useContext(InGameActionContext)
  return null
}

// 판 조작 묶음만 그리기: 카드 판·구석 단추·단계 행동 줄 + 조작 값 엿보기
// 화면 상태 시험이 씀 (sink.ctx 에 지금 값)
export async function renderPanel(socket, { interactionBlocked = false } = {}) {
  setSocket(socket)
  const sink = { ctx: null }
  const tree = h(InGamePlayerSessionProvider, null,
    h(InGameActionProvider, { interactionBlocked },
      h(InGamePlayerBoard),
      h(InGameCornerActionPanel, { onVoteStatusClick: () => {} }),
      h(InGamePhaseActionRow),
      h(Probe, { sink })))
  await rtl.act(async () => {
    rtl.render(h(RouterProvider, { router: routerFor(tree) }))
  })
  await flush()
  return sink
}

// 약속 풀림·화면 다시 그리기 기다림
export async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await rtl.act(async () => { await Promise.resolve() })
  }
}

// 서버 알림 하나 넣기
export async function fire(socket, event, payload) {
  await rtl.act(async () => { socket.fire(event, payload) })
  await flush()
}

// 가짜 시계 넘기기 (mock.timers 켠 시험만)
export async function tick(ms) {
  await rtl.act(async () => { mock.timers.tick(ms) })
  await flush()
}

// 누르기 (화면 다시 그리기까지)
export async function click(element) {
  await rtl.act(async () => { rtl.fireEvent.click(element) })
  await flush()
}

// 키보드: Tab으로 닿는지 보고 초점 → Enter (진짜 단추면 브라우저처럼 누름으로 이어짐)
export function isTabReachable(element) {
  if (!element) return false
  if (element.disabled) return false
  if (element.closest("[inert]")) return false
  return element.tabIndex >= 0
}
export async function pressEnter(element) {
  await rtl.act(async () => {
    element.focus()
    const notCancelled = rtl.fireEvent.keyDown(element, { key: "Enter", code: "Enter" })
    if (notCancelled && element.tagName === "BUTTON" && !element.disabled) rtl.fireEvent.click(element)
  })
  await flush()
}

// 서버 알림 모양 만들기
// 낮 판정 (예: dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }))
export function dayResolved({ outcome, alive, abstain, target = null, dayIndex = 1, gameId = GAME, phase, tribunalDeadline, ...rest }) {
  return {
    gameId,
    dayIndex,
    phase: phase ?? (outcome === "TRIBUNAL" ? "TRIBUNAL" : "NIGHT"),
    round: 1,
    outcome,
    tribunalTargetUuid: target,
    publicVoteCount: alive,
    publicAbstainCount: abstain,
    revoteExcludedUuids: [],
    ...(tribunalDeadline !== undefined ? { tribunalDeadline } : {}),
    ...rest,
  }
}
export const settle = ({ deadline, dayIndex = 1, gameId = GAME, phase = "DAY", role = null } = {}) =>
  ({ gameId, phase, dayIndex, role, deadline })
export const dayPhaseChanged = ({ deadline, dayIndex = 1, gameId = GAME } = {}) =>
  ({ gameId, dayIndex, dayPhase: "DAY_VOTE", round: 1, ...(deadline !== undefined ? { dayPhaseDeadline: deadline } : {}) })
export const firstDay = ({ deadline, gameId = GAME } = {}) =>
  ({ gameId, phase: "DAY", dayIndex: 1, ...(deadline !== undefined ? { dayPhaseDeadline: deadline } : {}) })
// 밤 결과 → 다음 낮 (아무도 안 죽음)
export const nextDay = ({ n, dayIndex = 2, dead = [], deadline, gameId = GAME } = {}) => ({
  gameId,
  phase: "DAY",
  dayIndex,
  players: Array.from({ length: n }, (_, i) => ({ uuid: uuidOf(i), alive: !dead.includes(i) })),
  victimUuid: null,
  deathReveals: [],
  doctorSaved: false,
  ...(deadline !== undefined ? { dayPhaseDeadline: deadline } : {}),
})

// 새로고침 답 (서버 get_session_snapshot 모양), self는 덮어씀
export function snapshot({
  n = 6, me = 0, role = "CITIZEN", phase = "DAY", dayIndex = 1, dayPhase, dead = [], self = {}, extra = {},
} = {}) {
  return {
    ok: true,
    gameId: GAME,
    phase,
    dayIndex,
    hostUuid: uuidOf(0),
    participationRevision: 0,
    selfProgressSeq: 0,
    ...(phase === "DAY" ? { dayPhase: dayPhase ?? "DAY_VOTE" } : {}),
    players: roster(n, { dead }),
    self: {
      uuid: uuidOf(me),
      nickname: NAMES[me],
      role,
      team: ROLE_TEAM[role],
      ...(role === "JOKER" ? { allies: [] } : {}),
      hasActedThisPhase: false,
      ...self,
    },
    ...extra,
  }
}

// 시험마다 끝에 판·소켓·로그인·저장소 비움
export function resetAll() {
  rtl.cleanup()
  setSocket(null)
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ isLoggedIn: false, user: null })
  try { window.sessionStorage.clear() } catch { /* 저장소 막힘 무시 */ }
  try { window.localStorage.clear() } catch { /* 저장소 막힘 무시 */ }
  mock.timers.reset()
}

// 화면에서 찾기 도우미
export const buttons = () => [...document.querySelectorAll("button")]
export const buttonByName = (name) =>
  buttons().find((b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === name) ?? null
// 카드 판의 사람 카드 (닉네임 글로 찾음)
export function cardOf(index) {
  return [...document.querySelectorAll('[role="button"][aria-haspopup="menu"]')]
    .find((el) => el.textContent.includes(NAMES[index])) ?? null
}
// 카드 메뉴 안 단추들 (이름·켜짐)
export function menuItems() {
  const menu = document.querySelector('[role="menu"]')
  if (!menu) return []
  return [...menu.querySelectorAll('[role="menuitem"]')].map((b) => ({ name: b.getAttribute("aria-label"), enabled: !b.disabled, el: b }))
}
// 카드 눌러 메뉴의 이름 붙은 켜진 항목 누르기 (예: voteVia(2, "투표하기")), 없거나 꺼졌으면 false
export async function voteVia(index, itemName = "투표하기") {
  await click(cardOf(index))
  const item = menuItems().find((entry) => entry.name === itemName && entry.enabled)
  if (!item) return false
  await click(item.el)
  return true
}
export const abstainButton = () => buttonByName("기권")

// 카드 눌러 메뉴 열고 항목 읽은 뒤 닫음
export async function readCardMenu(index) {
  const card = cardOf(index)
  if (!card) return []
  await click(card)
  const items = menuItems()
  if (items.length > 0) await click(card)
  return items
}

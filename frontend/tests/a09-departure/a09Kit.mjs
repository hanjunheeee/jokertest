// 끊김·나가기·탈주 화면 시험 도우미: 가짜 소켓·5~10명 판 차리기·서버 알림 넣기·화면 그리기·알림 창 받기
// a09-departure 폴더 시험만 씀 (공용 도우미는 안 고침 → 필요한 것만 여기 작게 둠)
//
// 쓰는 법
//   import * as K from "./a09Kit.mjs"
//   test.afterEach(() => K.reset())
//   const t = K.seat({ n: 6, me: 1, roles: { 1: "DOCTOR" }, phase: "DAY", dayPhase: "DAY_VOTE" })  // 판 값 넣기
//   await K.renderPage()                       // 인게임 화면 전체 (/ingame)
//   await t.say("player_eliminated", t.eliminatedPayload(3))
//   K.dialogs.alerts / K.dialogs.confirms      // 브라우저 알림 창·확인 창에 간 글
// 서버 알림 값 모양은 커밋된 백엔드 시험(backend/tests/flow/a09-*.test.js)과 서버 코드 그대로
// 조심: assert.equal에 화면 요소·React 요소·스토어 통째 안 넣음 (틀리면 차이 글을 만들다 메모리가 넘침)
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 흉내 (채팅 칸·스크롤바가 씀, 아무것도 안 함)
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoopResizeObserver
window.ResizeObserver = NoopResizeObserver

// 창 움직임은 바로 끝냄 (안 끝나면 act 안에서 멈춰 메모리가 바닥남)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider, Outlet, useRouteError } = await import("react-router-dom")
export const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
export const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
export const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { default: InGamePage } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

const h = React.createElement
export { h, InGamePage, GameResultPage }

// 자리마다 닉네임 (직업 이름과 안 겹치는 낱말만), uuid는 a09-<판 번호>-p<자리>
export const NICKS = ["여름", "가을", "겨울", "새벽", "노을", "구름", "바람", "이슬", "들꽃", "호수"]
export const ROLE_TEAM = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
export const ROLE_LABELS = { JOKER: "광대", DOCTOR: "의사", GUARD: "경비원", WITCH_HUNTER: "마녀사냥꾼", CITIZEN: "귀족" }
export const NIGHT_ACTION_LABELS = { JOKER: "암살", DOCTOR: "보호", GUARD: "조사", WITCH_HUNTER: "확인" }
const ALLY_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

// 서버 답을 끝내 안 줌 (정한 답이 없는 요청의 기본)
export const HOLD = Symbol("hold")

// 브라우저 알림 창·확인 창 대신 받기 (확인 창 답은 confirmAnswer)
export const dialogs = { alerts: [], confirms: [], confirmAnswer: true }
function installDialogs() {
  dialogs.alerts.length = 0
  dialogs.confirms.length = 0
  dialogs.confirmAnswer = true
  const alertFn = (message) => { dialogs.alerts.push(String(message)) }
  const confirmFn = (message) => { dialogs.confirms.push(String(message)); return dialogs.confirmAnswer }
  globalThis.alert = alertFn
  window.alert = alertFn
  globalThis.confirm = confirmFn
  window.confirm = confirmFn
}
installDialogs()

// 가짜 HTTP: 진짜 요청이 안 나가게 막음 (판 보드가 이모티콘 목록을 물음), 정한 길 말고는 다 404
// 정한 길만 답함: fetchRoutes["GET /friends/invites"] = { status, body }
export const fetchCalls = []
export const fetchRoutes = {}
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? "GET"
  const urlPath = String(url).replace(/^https?:\/\/[^/]+/, "")
  fetchCalls.push({ url: String(url), method })
  const route = fetchRoutes[`${method} ${urlPath}`]
  if (route) return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200, headers: { "Content-Type": "application/json" } })
  return new Response(JSON.stringify({ ok: false, code: "NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } })
}

// 가짜 소켓: 보낸 요청은 sent에 모이고, 답은 answers 표대로 (없으면 waiting에 쌓여 answer로 줌)
export function createFakeSocket({ id = "a09-sock-1", connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const sent = []
  const waiting = []

  // 정한 답 꺼내기 (함수면 보낸 값·몇 번째인지 넣어 부름)
  const replyFor = (event, payload) => {
    if (!answers.has(event)) return HOLD
    const answer = answers.get(event)
    const count = sent.filter((s) => s.event === event).length
    return typeof answer === "function" ? answer(payload, count) : answer
  }

  const socket = {
    id,
    connected,
    sent,
    waiting,
    // 사건마다 서버 답 정하기 (HOLD면 답 없음)
    answer(event, value) {
      answers.set(event, value)
      return socket
    },
    // 그 사건으로 보낸 값만 → [{ gameId: "g1" }, …]
    sentOf(event) {
      return sent.filter((s) => s.event === event).map((s) => s.payload)
    },
    on(event, fn) {
      if (typeof fn !== "function") return socket
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      if (fn === undefined) listeners.delete(event)
      else listeners.get(event)?.delete(fn)
      return socket
    },
    // 답 받는 함수가 있으면 정한 답을 다음 틱에 넘김 (답 없음이면 기다림 줄에 둠)
    emit(event, payload, cb) {
      const entry = { event, payload }
      sent.push(entry)
      if (typeof cb === "function") {
        const value = replyFor(event, payload)
        if (value === HOLD) waiting.push({ event, resolve: cb })
        else Promise.resolve(value).then(cb)
      }
      return socket
    },
    emitWithAck(event, payload) {
      sent.push({ event, payload })
      return new Promise((resolve) => {
        const value = replyFor(event, payload)
        if (value === HOLD) waiting.push({ event, resolve })
        else Promise.resolve(value).then(resolve)
      })
    },
    timeout() {
      return { emitWithAck: (event, payload) => socket.emitWithAck(event, payload) }
    },
    // 서버가 이 소켓에 알림을 보낸 것처럼 받는 함수를 다 부름
    fire(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
  return socket
}

// 지금 판·소켓 (시험 하나에 하나)
let live = null
let tableSeq = 0
let router = null

// 판 차리기: 서버 스냅샷 모양으로 빈 스토어를 채움 (로그인·가짜 소켓 포함)
// n: 5~10명, me: 내 자리, roles: { 자리: 직업 } (안 적은 자리는 시민, 광대는 jokers로), dead/disconnected/left: 자리 번호
// phase: ROLE_REVEAL·DAY·TRIBUNAL·NIGHT·ENDED, dayPhase: DAY_DISCUSSION·DAY_VOTE, deadline: 그 단계 마감 시각
export function seat({
  n,
  me = 0,
  roles = {},
  jokers = [],
  dead = [],
  disconnected = [],
  left = [],
  phase = "DAY",
  dayIndex = 1,
  dayPhase = "DAY_VOTE",
  deadline = null,
  defendant = null,
  nightTurnRole = null,
  selfExtra = {},
  extra = {},
  socket = null,
  login = true,
  bootstrap = true,
} = {}) {
  if (!Number.isInteger(n) || n < 5 || n > 10) throw new Error(`판 인원은 5~10명 (받은 값 ${n})`)
  reset()
  tableSeq += 1
  const gameId = `a09-game-${tableSeq}`
  const roleOf = (i) => roles[i] ?? (jokers.includes(i) ? "JOKER" : "CITIZEN")
  const seats = Array.from({ length: n }, (_, i) => ({
    uuid: `a09-${tableSeq}-p${i}`,
    nickname: NICKS[i],
    role: roleOf(i),
    alive: !dead.includes(i) && !left.includes(i),
    connected: !disconnected.includes(i) && !left.includes(i),
    participating: !left.includes(i),
  }))
  const fake = socket ?? createFakeSocket()
  const t = { gameId, seats, meIndex: me, fake, phase, dayIndex, dayPhase, defendant, selfProgressSeq: 0, participationRevision: 0 }
  t.uuid = (i) => seats[i].uuid
  t.nick = (i) => seats[i].nickname
  t.me = seats[me].uuid
  t.store = () => useInGameStore.getState()
  t.state = () => useInGameStore.getState().state
  t.player = (i) => (useInGameStore.getState().state?.players ?? []).find((p) => p.uuid === seats[i].uuid) ?? null

  // 서버 스냅샷 답 만들기 (buildSessionSnapshot 모양, over로 칸 바꿈·self는 덧씀)
  t.snapshot = (over = {}) => {
    const mine = seats[me]
    const myRole = over.role ?? mine.role
    const self = {
      uuid: mine.uuid,
      nickname: mine.nickname,
      role: myRole,
      team: ROLE_TEAM[myRole],
      ...(ALLY_ROLES.has(myRole)
        ? { allies: seats.filter((s, i) => i !== me && s.role === myRole).map((s) => s.uuid) }
        : {}),
      hasActedThisPhase: false,
      ...(t.phase === "DAY" && t.dayPhase === "DAY_VOTE" ? { hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1 } : {}),
      ...(t.phase === "TRIBUNAL" ? { hasSubmittedTribunalVote: false } : {}),
      ...selfExtra,
      ...(over.self ?? {}),
    }
    const d = deadline ?? Date.now() + 60_000
    const response = {
      ok: true,
      gameId,
      phase: t.phase,
      dayIndex: t.dayIndex,
      hostUuid: seats[0].uuid,
      roomId: null,
      roomInstanceId: null,
      bootEpoch: null,
      roomCode: null,
      participationRevision: t.participationRevision,
      selfProgressSeq: t.selfProgressSeq,
      ...(t.phase === "DAY" ? { dayPhase: t.dayPhase, dayPhaseDeadline: d } : {}),
      ...(t.phase === "TRIBUNAL" ? { tribunalDeadline: d } : {}),
      ...(t.phase === "NIGHT" && nightTurnRole ? { nightTurnRole, nightTurnDeadline: d } : {}),
      players: seats.map((s, i) => ({
        uuid: s.uuid,
        nickname: s.nickname,
        isAlive: s.alive,
        isConnected: s.connected,
        isParticipating: s.participating,
        membershipId: null,
        themeIndex: i,
      })),
      self,
      ...extra,
    }
    if (t.phase === "TRIBUNAL" && t.defendant !== null) {
      const aliveCount = seats.filter((s) => s.alive).length
      response.dayVoteResolution = {
        round: 1,
        outcome: "TRIBUNAL",
        tribunalTargetUuid: seats[t.defendant].uuid,
        publicVoteCount: aliveCount,
        publicAbstainCount: 0,
        revoteExcludedUuids: [],
      }
      response.tribunal = { defendantUuid: seats[t.defendant].uuid, resolved: false }
    }
    // self·role은 위에서 썼으니 나머지 칸만 덮어씀
    const rest = { ...over }
    delete rest.self
    delete rest.role
    return { ...response, ...rest }
  }

  // 서버가 이 화면에 알림 하나 보냄 (화면 바뀜까지 기다림)
  t.say = async (event, payload) => {
    await RTL.act(async () => {
      fake.fire(event, payload)
      await Promise.resolve()
    })
  }

  // 기다리는 요청 하나에 서버가 답함 (가장 먼저 보낸 것부터)
  t.answer = (event, response) => answerWaiting(fake, event, response)

  // 사람이 판에서 빠짐 (서버 buildDisconnectPayload 모양: 사람 id·생존만)
  t.eliminatedPayload = (index, { phase: p = t.phase, winner = null, gameId: g = gameId } = {}) => {
    const players = seats.map((s, i) => ({ uuid: s.uuid, alive: i === index ? false : s.alive }))
    const payload = {
      gameId: g,
      phase: winner ? "ENDED" : p,
      dayIndex: t.dayIndex,
      players,
      victimUuid: seats[index].uuid,
      sfxEvent: { eventId: `game:${g}:day:${t.dayIndex}:victim:${seats[index].uuid}:eliminated`, gameId: g, origin: "live" },
    }
    if (winner) {
      payload.winResult = {
        winner,
        reveals: seats.map((s, i) => ({
          uuid: s.uuid,
          nickname: s.nickname,
          role: s.role,
          team: ROLE_TEAM[s.role],
          alive: i === index ? false : s.alive,
          deathReason: i === index ? "DISCONNECT" : (s.alive ? null : "EXECUTION"),
          goldReward: 0,
        })),
      }
      payload.resultClosesAt = Date.now() + 180_000
    }
    return payload
  }

  // 다른 사람 끊김·돌아옴 (서버 session_player_connection_changed 모양)
  t.connectionPayload = (index, isConnected, { gameId: g = gameId, uuid } = {}) => ({ gameId: g, uuid: uuid ?? seats[index].uuid, isConnected })

  // 참여 바뀜 (서버 session_participation_changed 모양)
  t.participationPayload = ({ leftIndexes = [], hostIndex = null, revision } = {}) => {
    t.participationRevision = revision ?? t.participationRevision + 1
    return {
      gameId,
      participationRevision: t.participationRevision,
      players: seats.map((s, i) => ({ uuid: s.uuid, isParticipating: !leftIndexes.includes(i) && s.participating })),
      ...(hostIndex === null ? {} : { hostUuid: seats[hostIndex].uuid }),
    }
  }

  // 내 진행 알림 (서버 emitSelfProgress 모양)
  t.selfProgressPayload = (self) => {
    t.selfProgressSeq += 1
    return {
      gameId,
      phase: t.phase,
      dayIndex: t.dayIndex,
      participationRevision: t.participationRevision,
      selfProgressSeq: t.selfProgressSeq,
      self,
    }
  }

  setSocket(fake)
  if (login) {
    useAuthStore.getState().login({ uuid: t.me, nickname: seats[me].nickname })
    markRoleRevealSeen(gameId, t.me)
  }
  if (bootstrap) {
    RTL.act(() => { useInGameStore.getState().bootstrapSessionSnapshot(t.snapshot(), null) })
    if (useInGameStore.getState().gameId !== gameId) throw new Error("판 차리기 실패: 스냅샷을 스토어가 안 받음")
  }
  live = t
  return t
}

// 기다리는 요청 하나에 답 (없으면 오류)
export async function answerWaiting(fake, event, response) {
  const index = fake.waiting.findIndex((entry) => entry.event === event)
  if (index < 0) throw new Error(`답할 ${event} 요청이 없음`)
  const [entry] = fake.waiting.splice(index, 1)
  await RTL.act(async () => {
    entry.resolve(response)
    await Promise.resolve()
    await Promise.resolve()
  })
}

// 판 진행 알림 받기 껍데기 (로그인 보호 경로가 하는 일과 같음)
function Shell() {
  useGameSessionSocketEvents()
  return h(Outlet)
}

// 화면이 그리다 터지면 적어 둠 (라우터가 오류를 삼켜 모르고 지나가지 않게)
let renderError = null
function RenderErrorCatcher() {
  renderError = useRouteError()
  return h("p", null, "화면 오류 (시험 자리)")
}

// 길 표 안에 화면 그리기: path에 element, 그 밖 길은 "다른 화면 <길>" 글
// 판 화면(/ingame)과 결과 화면(/gameresult)은 따로 정하지 않으면 진짜 화면
export async function renderRoutes({ path = "/ingame", element, routes = {}, entries = null, root = null, outside = {} } = {}) {
  const table = {
    "/ingame": h(InGamePage),
    "/gameresult": h("p", null, "결과 화면 (시험 자리)"),
    "/multiplay": h("p", null, "방 목록 화면 (시험 자리)"),
    "/lobby": h("p", null, "로비 화면 (시험 자리)"),
    "/login": h("p", null, "로그인 화면 (시험 자리)"),
    ...routes,
  }
  if (element !== undefined) table[path] = element
  // 바깥(문지기 밖)에 둔 길은 안쪽 표에서 뺌
  for (const key of Object.keys(outside)) delete table[key]
  router = createMemoryRouter([
    {
      element: root ?? h(Shell),
      errorElement: h(RenderErrorCatcher),
      children: [
        ...Object.entries(table).map(([p, el]) => ({ path: p, element: el })),
        { path: "*", element: h("p", null, "다른 화면 (시험 자리)") },
      ],
    },
    ...Object.entries(outside).map(([p, el]) => ({ path: p, element: el })),
  ], { initialEntries: entries ?? [path], initialIndex: entries ? entries.length - 1 : 0 })
  let view
  await RTL.act(async () => {
    view = RTL.render(h(RouterProvider, { router }))
  })
  await flush()
  return view
}

// 인게임 화면 전체 그리기
export const renderPage = (options = {}) => renderRoutes({ path: "/ingame", ...options })

// 나가기 훅만 쓰는 작은 화면: api.current로 훅 값(requestExit·exitStatus …)을 꺼냄, 상태 글을 화면에 띄움
const { useInGameExit } = await import("../../src/domains/game/ingame/hooks/useInGameExit.js")
function ExitProbe({ api, options }) {
  const value = useInGameExit(options)
  api.current = value
  return h("p", { "data-testid": "exit-status" }, `${value.exitStatus}|${value.exitErrorCode ?? ""}`)
}
export async function renderExitProbe(options = {}, { at = "/ingame" } = {}) {
  const api = { current: null }
  await renderRoutes({ path: at, element: h(ExitProbe, { api, options }) })
  return api
}

// 훅 함수 하나 부르기 (화면 바뀜까지)
export async function call(fn) {
  let result
  await RTL.act(async () => {
    result = fn()
    await Promise.resolve()
  })
  await flush()
  return result
}

// 지금 주소 (/ingame·/multiplay …)
export const path = () => router?.state.location.pathname ?? null

// 다른 주소로 옮김 (주소창에 친 것처럼)
export async function navigate(to) {
  await RTL.act(async () => {
    await router.navigate(to)
  })
  await flush()
}

// 뒤로 가기
export async function goBack() {
  await RTL.act(async () => {
    await router.navigate(-1)
  })
  await flush()
}

// 약속(Promise) 몇 번 풀리게 기다림 (가짜 소켓 답은 바로 풀리는 약속)
export async function flush(times = 6) {
  await RTL.act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

// 진짜 시계로 조금씩 기다리며 조건 볼 때까지 (판 화면 + RTL waitFor 대신)
export async function waitUntil(check, { timeoutMs = 2_000, stepMs = 20, what = "화면 바뀜" } = {}) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`${what}: ${timeoutMs}ms 안에 안 됨`)
    await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, stepMs)) })
  }
}

// 가짜 시계 켜기 (setTimeout + Date), 화면 그리기 전에 부름
export function useFakeClock(now = 1_800_000_000_000) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now })
}

// 가짜 시계 넘기기 (화면 바뀜까지)
export async function tick(ms) {
  await RTL.act(async () => {
    mock.timers.tick(ms)
    await Promise.resolve()
  })
}

// 누르기 (화면 바뀜까지)
export async function click(element) {
  await RTL.act(async () => {
    RTL.fireEvent.click(element)
    await Promise.resolve()
  })
}

// 소켓 끊김·다시 붙음 흉내 (연결 칸 바꾸고 받는 함수 부름)
export async function dropConnection(fake = live?.fake) {
  await RTL.act(async () => {
    fake.connected = false
    fake.fire("disconnect", "transport close")
    await Promise.resolve()
  })
}
export async function restoreConnection(fake = live?.fake) {
  await RTL.act(async () => {
    fake.connected = true
    fake.fire("connect")
    await Promise.resolve()
    await Promise.resolve()
  })
}

// 판 화면 카드 누름 칸 (닉네임으로)
export function cardButton(nickname) {
  const card = document.querySelector(`[data-ingame-player-nickname="${nickname}"]`)
  if (!card) throw new Error(`카드 없음: ${nickname}`)
  return card.closest("[role=button]")
}

// 카드를 눌러 연 메뉴의 단추 목록 (안 열리면 빈 목록), 보고 나면 Esc로 닫음
// label은 단추에 보이는 글 (밤 행동 단추의 읽기 이름엔 대상 닉네임이 앞에 붙음, 예: 읽기 이름 "지영 보호" → 보이는 글 "보호")
export async function cardMenuButtons(nickname) {
  await click(cardButton(nickname))
  const slot = cardButton(nickname).parentElement
  const menu = slot.querySelector("[role=menu]")
  const items = menu ? [...menu.querySelectorAll("[role=menuitem]")] : []
  const summary = items.map((b) => ({ label: b.querySelector("span")?.textContent ?? b.getAttribute("aria-label"), enabled: !b.disabled }))
  if (menu) {
    await RTL.act(async () => { RTL.fireEvent.keyDown(document, { key: "Escape" }) })
  }
  return summary
}

// 시험 하나 끝: 화면 내림 → 시계 풂 → 판·방·로그인·소켓·탭 저장소·알림 창 비움
export function reset() {
  RTL.cleanup()
  mock.timers.reset()
  router = null
  RTL.act(() => {
    useInGameStore.getState().clearGame()
    useInGameStore.setState({ snapshotSeq: 0 })
    useMatchingStore.getState().clearRoom()
    if (useAuthStore.getState().isLoggedIn) useAuthStore.getState().logout()
    setSocket(null)
  })
  try {
    globalThis.window?.sessionStorage?.clear()
  } catch {
    // 탭 저장소가 막힌 환경이면 그냥 둠
  }
  installDialogs()
  fetchCalls.length = 0
  for (const key of Object.keys(fetchRoutes)) delete fetchRoutes[key]
  live = null
  const error = renderError
  renderError = null
  if (error) throw error
}

// 지금 판 (도우미 바깥에서 쓸 일 거의 없음)
export const currentTable = () => live

// 판 화면 창 찾기 (읽기 이름으로, 없으면 null)
export const dialogNamed = (name) => document.querySelector(`[role="dialog"][aria-label="${name}"]`)

// 판 화면 위 버튼 줄의 "게임 나가기" 단추
export const topExitButton = () => document.querySelector('[aria-label="인게임 컨트롤"] button[aria-label="게임 나가기"]')

// 글자로 단추 찾기 (안 보이면 null), root 안에서만
export function buttonByText(text, root = document) {
  return [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text) ?? null
}

// 스냅샷 동기화 훅만 쓰는 작은 화면 (처음 판 복구 상태를 글로 띄움)
const { useInGameSessionSnapshotSync } = await import("../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")
function SnapshotProbe({ box }) {
  box.status = useInGameSessionSnapshotSync()
  return h("p", { "data-testid": "snapshot-status" }, box.status)
}
export async function renderSnapshotProbe() {
  const box = { status: null }
  await renderRoutes({ path: "/ingame", element: h(SnapshotProbe, { box }) })
  return box
}

// 판 값 → 카드에 쓰는 사람 목록 (판 화면 Provider와 같은 길: 재료 만들기 → 미리보기 칸에 덧입히기)
const { buildPlayerSessionSourceFromGameState } = await import("../../src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js")
const { mergeSourcePlayerWithPreview } = await import("../../src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js")
export function sessionPlayers(state = useInGameStore.getState().state) {
  const { sourcePlayers } = buildPlayerSessionSourceFromGameState(state)
  if (!sourcePlayers) return []
  return sourcePlayers.map((player) => mergeSourcePlayerWithPreview(player, {}))
}
// 자리 하나의 카드 상태 글 → "alive" | "dead" | "disconnected" (없으면 null)
export function cardStatusOf(uuid) {
  return sessionPlayers().find((p) => p.id === uuid)?.status ?? null
}

// 판 알림 받기만 붙인 빈 화면 (스토어 값만 볼 때)
export const renderEventsOnly = () => renderRoutes({ path: "/ingame", element: h("p", null, "판 알림 받기만 (시험 자리)") })

// 판 조작 값 엿보기: 판 화면과 같은 감싸기(사람 목록 → 조작 값) 안에서 컨텍스트를 꺼냄
const { InGameActionProvider } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { useInGamePlayerSessionContext } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
function ActionProbe({ box }) {
  box.ctx = React.useContext(InGameActionContext)
  box.localPlayerId = useInGamePlayerSessionContext().localPlayerId
  return null
}
export async function renderActionProbe() {
  const box = { ctx: null, localPlayerId: null }
  const element = h(InGamePlayerSessionProvider, null, h(InGameActionProvider, null, h(ActionProbe, { box })))
  await renderRoutes({ path: "/ingame", element })
  return box
}

// 끊겼다 다시 붙음: (처음 물음 답) → 끊김 → 붙음 → 새로 물은 스냅샷에 response로 답 (스냅샷 화면이 그려져 있어야 함)
export async function reconnectWith(t, response) {
  while (t.fake.waiting.some((w) => w.event === "get_session_snapshot")) {
    await answerWaiting(t.fake, "get_session_snapshot", t.snapshot())
  }
  const before = t.fake.sentOf("get_session_snapshot").length
  await dropConnection(t.fake)
  await restoreConnection(t.fake)
  await flush()
  if (t.fake.sentOf("get_session_snapshot").length <= before) throw new Error("다시 붙은 뒤 스냅샷을 안 물음")
  await answerWaiting(t.fake, "get_session_snapshot", response)
  await flush()
}

// 판 없이 로그인만 한 사람 + 가짜 소켓 (방 만들기·입장 화면 시험)
export function signIn({ uuid = "a09-me", nickname = "여름", connected = true } = {}) {
  reset()
  const fake = createFakeSocket({ connected })
  setSocket(fake)
  RTL.act(() => { useAuthStore.getState().login({ uuid, nickname }) })
  return fake
}

// 대기방 값 (서버 get_current_room 답 모양), 첫 사람이 방장
// 예: roomOf({ n: 6 }) → { roomId: "a09-room", players: [a09-r0..r5], hostUuid: "a09-r0", … }
export function roomOf({ n = 6, roomId = "a09-room", host = 0, ready = [], canStart = false, settingsVersion = 1 } = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ uuid: `a09-r${i}`, nickname: NICKS[i], isReady: ready.includes(i) }))
  return {
    roomId,
    roomCode: "AB12CD",
    players,
    hostUuid: players[host].uuid,
    reservedHostUuid: null,
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    canStart,
    accessType: "open",
    settingsVersion,
    settings: { maxPlayers: 10, jokerCount: 2, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
  }
}

// 대기방에 앉은 사람 (me 자리로 로그인, 방 확인 답은 roomAnswer.current)
export function sitInRoom({ room, me = 0 }) {
  const fake = signIn({ uuid: room.players[me].uuid, nickname: room.players[me].nickname })
  const roomAnswer = { current: { ok: true, room } }
  fake.answer("get_current_room", () => roomAnswer.current)
  RTL.act(() => { useMatchingStore.getState().setRoom(room) })
  return { fake, roomAnswer }
}

// 카드 판만 그리기 (판 화면과 같은 감싸기, 안내 창 없이 카드 메뉴만 볼 때)
const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
export async function renderBoard() {
  const element = h(InGamePlayerSessionProvider, null, h(InGameActionProvider, null, h(InGamePlayerBoard)))
  return renderRoutes({ path: "/ingame", element })
}

// 키보드 Tab 한 번 (jsdom은 Tab으로 초점을 안 옮겨서 브라우저처럼 다음 칸으로 옮김, 화면이 막으면 그대로)
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
export async function pressTab({ shift = false } = {}) {
  const target = document.activeElement ?? document.body
  let prevented = false
  await RTL.act(async () => {
    prevented = !RTL.fireEvent.keyDown(target, { key: "Tab", shiftKey: shift })
  })
  if (prevented) return
  const all = [...document.querySelectorAll(TABBABLE)].filter((el) => !el.closest("[inert]"))
  if (all.length === 0) return
  const index = all.indexOf(document.activeElement)
  const next = shift ? all[(index - 1 + all.length) % all.length] : all[(index + 1) % all.length]
  await RTL.act(async () => { next.focus() })
}

// 키보드 Enter (jsdom은 단추에 Enter를 눌러도 누름이 안 일어나서 브라우저처럼 누름을 보냄, 화면이 막으면 그대로)
export async function pressEnter(element = document.activeElement) {
  let prevented = false
  await RTL.act(async () => {
    prevented = !RTL.fireEvent.keyDown(element, { key: "Enter" })
  })
  if (prevented || element?.tagName !== "BUTTON" || element.disabled) return
  await click(element)
}

// 판 화면에 떠 있는 안내 창(단계 안내·밤 차례 안내·낮 시작 연출)을 "확인"으로 다 닫음
export async function dismissOverlays({ keep = [] } = {}) {
  for (let round = 0; round < 6; round += 1) {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => !keep.includes(d.getAttribute("aria-label")))
    const confirm = dialogs.map((d) => buttonByText("확인", d) ?? d.querySelector('button[aria-label="확인"]')).find(Boolean)
    if (!confirm) return
    await click(confirm)
    await flush()
  }
}

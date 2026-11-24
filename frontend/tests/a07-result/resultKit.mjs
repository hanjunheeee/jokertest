// 결과 화면·대기방 화면 시험 몫 도우미: 가짜 소켓·가짜 HTTP·판 값 넣기(스냅샷)·화면 그리기(데이터 라우터)·뒷정리
// a07-result·a08-result-close·a08-result-return·a08-reserved-host 폴더 시험만 씀 (공용 아님, 공용 도우미는 안 고쳐서 여기 작게 둠)
//
// 쓰는 법
//   import * as K from "../a07-result/resultKit.mjs"
//   test.afterEach(K.resetAll)
//   const sock = K.installFakeSocket()                       // 앱 소켓 자리에 가짜 소켓
//   const g = K.endedGame({ n: 6, me: 1, winner: "CITIZEN" })   // 끝난 판 값을 스토어에 넣음 (스냅샷 길)
//   const view = await K.renderAt("/gameresult", K.h(GameResultPage))
//   await K.finishIntro()                                 // 결과 영상 끝 → 결과판
// 서버 값 모양은 백엔드 흐름 시험(backend/tests/flow/a07-end-payload·a08-*)이 받는 값과 같게 만듦
// 조심: assert.equal에 화면 요소·React 요소를 그대로 넣지 않음 (틀리면 차이 글 만들다 메모리 터짐) → 글·숫자·참거짓만 비교
import { mock } from "node:test"
import "../helpers/domSetup.mjs"

// jsdom에 없는 크기 감시 흉내 (결과판 스크롤바·채팅 칸이 씀, 아무것도 안 함)
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

export const React = await import("react")
const { syncWindowPath, resetWindowPath } = await import("../helpers/syncWindowPath.mjs")
export const RTL = await import("@testing-library/react")
const { MotionGlobalConfig } = await import("framer-motion")
// 창 움직임을 바로 끝냄 (안 끝나면 메모리가 바닥남)
MotionGlobalConfig.skipAnimations = true

const { createMemoryRouter, RouterProvider, Outlet, useRouteError, useLocation } = await import("react-router-dom")
export const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
export const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
export const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

export const h = React.createElement

// ── 가짜 HTTP: 진짜 요청이 밖으로 안 나가게 막고, 정한 주소만 답함 ──

// calls에 { method, path, body } 쌓음, routes["GET /economy/..."] = { status, body } 또는 함수
export function installFakeFetch(routes = {}) {
  const calls = []
  const fake = async (url, options = {}) => {
    const method = options.method ?? "GET"
    const path = String(url).replace(/^https?:\/\/[^/]+/, "")
    const body = typeof options.body === "string" ? JSON.parse(options.body) : null
    calls.push({ method, path, body })
    const route = routes[`${method} ${path}`]
    const answer = typeof route === "function" ? await route(body, calls) : route
    const status = answer?.status ?? (answer ? 200 : 404)
    return new Response(JSON.stringify(answer?.body ?? {}), { status, headers: { "Content-Type": "application/json" } })
  }
  globalThis.fetch = fake
  globalThis.window.fetch = fake
  return { calls, routes }
}
// 파일을 불러오자마자 막아 둠 (결과판 이모티콘·영상 등이 HTTP를 불러도 밖으로 안 나감)
installFakeFetch()

// ── 가짜 소켓 ──

// 서버가 답을 끝내 안 줌 / 답을 쥐고 있다가 시험이 release로 줌
export const NO_ANSWER = Symbol("no-answer")
export const HOLD = Symbol("hold")

// 보낸 사건은 sent에, 답은 answer(event, 값|함수|HOLD|NO_ANSWER)로 정함 (정한 답 없으면 답 안 옴)
export function createFakeSocket({ id = "sock-a07", connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const held = []
  const sent = []

  const replyFor = (event, payload) => {
    if (!answers.has(event)) {
      if (event === "enter_lobby") return { ok: true, redirect: null }
      return NO_ANSWER
    }
    const answer = answers.get(event)
    const count = sent.filter((s) => s.event === event).length
    return typeof answer === "function" ? answer(payload, count) : answer
  }

  const socket = {
    id,
    connected,
    sent,
    answer(event, value) {
      answers.set(event, value)
      return socket
    },
    // 그 사건으로 보낸 값만 → [{ gameId: "g1" }, …]
    sentOf(event) {
      return sent.filter((s) => s.event === event).map((s) => s.payload)
    },
    // 쥐고 있던 답 하나 주기 (먼저 쥔 것부터), 없으면 false
    async release(event, value) {
      const index = held.findIndex((item) => item.event === event)
      if (index < 0) return false
      const [item] = held.splice(index, 1)
      await RTL.act(async () => { item.cb(value) })
      return true
    },
    heldCount(event) {
      return held.filter((item) => item.event === event).length
    },
    on(event, fn) {
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
      if (typeof cb !== "function") return socket
      const value = replyFor(event, payload)
      if (value === NO_ANSWER) return socket
      if (value === HOLD) { held.push({ event, payload, cb }); return socket }
      Promise.resolve().then(() => cb(value))
      return socket
    },
    emitWithAck(event, payload) {
      return socket.timeout(null).emitWithAck(event, payload)
    },
    // socket.io timeout(ms).emitWithAck 흉내: 답 없음이면 ms 뒤 시간 초과
    timeout(ms) {
      return {
        emitWithAck(event, payload) {
          sent.push({ event, payload })
          return new Promise((resolve, reject) => {
            const value = replyFor(event, payload)
            if (value === NO_ANSWER) {
              if (Number.isFinite(ms)) setTimeout(() => reject(new Error("operation has timed out")), ms)
              return
            }
            if (value === HOLD) { held.push({ event, payload, cb: resolve }); return }
            Promise.resolve(value).then(resolve, reject)
          })
        },
      }
    },
    // 서버가 보낸 알림 흉내 (붙은 받는 함수 모두, 화면 바뀜까지 기다림)
    async serverSays(event, payload) {
      const fns = [...(listeners.get(event) ?? [])]
      await RTL.act(async () => {
        for (const fn of fns) fn(payload)
      })
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
  return socket
}

// 가짜 소켓을 앱 소켓으로 끼움
export function installFakeSocket(options) {
  const socket = createFakeSocket(options)
  setSocket(socket)
  return socket
}

// 로그인한 사람으로 둠
export function signIn(uuid, nickname = "나") {
  useAuthStore.getState().login({ uuid, nickname })
}

// ── 판 값 ──

// 자리마다 닉네임 (직업 이름과 안 겹치는 낱말만)
export const NICKS = ["여우", "달빛", "별빛", "나비", "장미", "백합", "부엉이", "백조", "고양이", "까마귀"]
// 직업 → 팀 (서버 ROLE_TEAMS와 같음)
export const TEAM_OF = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }
// 같은 직업 동료를 보는 직업 (서버 self.allies 칸이 붙음)
const ALLY_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])
// 스냅샷 self 칸의 직업 부분 (동료 목록 포함), 예: 광대 0번 → { role: "JOKER", team: "JOKER", allies: [1번 uuid] }
const selfRoleFields = (seats, me) => {
  const mine = seats[me]
  return {
    uuid: mine.uuid, nickname: mine.nickname, role: mine.role, team: TEAM_OF[mine.role],
    ...(ALLY_ROLES.has(mine.role) ? { allies: seats.filter((s, i) => i !== me && s.role === mine.role).map((s) => s.uuid) } : {}),
  }
}

let gameSeq = 0
// 서버처럼 uuid 모양 (신고 단추가 uuid 모양일 때만 보임), 예: idOf("a07a", 1201) → "a07a0000-0000-4000-8000-000000001201"
const idOf = (head, n) => `${head}0000-0000-4000-8000-${String(n).padStart(12, "0")}`
export const gameIdOf = (seq) => idOf("a07b", seq)

// 판 자리 만들기: roles 배열(자리 순서)이 없으면 0번 광대·나머지 시민
// 예: seatsOf({ n: 5 }) → [{ uuid: "a07a0000-0000-4000-8000-000000000100", nickname: "여우", role: "JOKER", alive: true }, …]
export function seatsOf({ n, roles = null, dead = [], names = {} }) {
  if (!Number.isInteger(n) || n < 5 || n > 10) throw new Error(`판 인원은 5~10명 (받은 값 ${n})`)
  gameSeq += 1
  return Array.from({ length: n }, (_, i) => ({
    uuid: idOf("a07a", gameSeq * 100 + i),
    nickname: names[i] ?? NICKS[i],
    role: roles?.[i] ?? (i === 0 ? "JOKER" : "CITIZEN"),
    alive: !dead.includes(i),
  }))
}

// 판 끝 칸 (서버 buildPublicWinResult 모양), gold: 자리마다 받은 골드 (숫자 하나면 전원 같음)
// 예: winResultOf(seats, "CITIZEN", 1) → { winner: "CITIZEN", reveals: [{ uuid, nickname, role, team, alive, deathReason, goldReward: 1 }, …] }
export function winResultOf(seats, winner, gold = 1) {
  return {
    winner,
    reveals: seats.map((s, i) => ({
      uuid: s.uuid,
      nickname: s.nickname,
      role: s.role,
      team: TEAM_OF[s.role],
      alive: s.alive,
      deathReason: s.alive ? null : "EXECUTION",
      goldReward: Array.isArray(gold) ? gold[i] : gold,
    })),
  }
}

// 끝난 판 스냅샷 응답 (서버 buildSessionSnapshot 모양), over로 칸 바꿈
export function endedSnapshotOf({ gameId, seats, me, winner, gold = 1, resultClosesAt = Date.now() + 180_000, dayIndex = 2, over = {} }) {
  return {
    ok: true,
    gameId,
    phase: "ENDED",
    dayIndex,
    hostUuid: seats[0].uuid,
    roomId: null,
    roomInstanceId: null,
    bootEpoch: null,
    roomCode: null,
    participationRevision: 0,
    selfProgressSeq: 0,
    players: seats.map((s, i) => ({
      uuid: s.uuid, nickname: s.nickname, isAlive: s.alive, isConnected: true, isParticipating: true, membershipId: null, themeIndex: i,
    })),
    self: { ...selfRoleFields(seats, me), hasActedThisPhase: false },
    progress: { kind: "NONE", doneCount: null, requiredCount: null },
    winResult: winResultOf(seats, winner, gold),
    ...(resultClosesAt === null ? {} : { resultClosesAt }),
    ...over,
  }
}

// 끝난 판을 스토어에 넣음 (새로고침 뒤 스냅샷으로 받은 것과 같은 길), 로그인도 나로
// 돌려줌: { gameId, seats, me, meUuid, snapshot }
export function endedGame({ n = 5, me = 1, roles = null, dead = [], names = {}, winner = "CITIZEN", gold = 1, resultClosesAt, over = {} } = {}) {
  const seats = seatsOf({ n, roles, dead, names })
  const gameId = gameIdOf(gameSeq)
  const snapshot = endedSnapshotOf({ gameId, seats, me, winner, gold, resultClosesAt, over })
  signIn(seats[me].uuid, seats[me].nickname)
  markRoleRevealSeen(gameId, seats[me].uuid)
  useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  if (useInGameStore.getState().gameId !== gameId) throw new Error("끝난 판 넣기 실패: 스냅샷을 스토어가 안 받음")
  return { gameId, seats, me, meUuid: seats[me].uuid, snapshot }
}

// 진행 중 판 스냅샷 (낮 투표 중), 화면 판 값을 처음 채울 때
export function liveSnapshotOf({ gameId, seats, me, phase = "DAY", dayIndex = 1, dayPhase = "DAY_VOTE", over = {} }) {
  return {
    ok: true,
    gameId,
    phase,
    dayIndex,
    hostUuid: seats[0].uuid,
    roomId: null,
    roomInstanceId: null,
    bootEpoch: null,
    roomCode: null,
    participationRevision: 0,
    selfProgressSeq: 0,
    ...(phase === "DAY" ? { dayPhase, dayPhaseDeadline: Date.now() + 60_000 } : {}),
    players: seats.map((s, i) => ({
      uuid: s.uuid, nickname: s.nickname, isAlive: s.alive, isConnected: true, isParticipating: true, membershipId: null, themeIndex: i,
    })),
    self: {
      ...selfRoleFields(seats, me), hasActedThisPhase: false,
      ...(phase === "DAY" && dayPhase === "DAY_VOTE" ? { hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1 } : {}),
    },
    progress: phase === "DAY"
      ? { kind: dayPhase, doneCount: 0, requiredCount: seats.filter((s) => s.alive).length }
      : { kind: phase === "NIGHT" ? "NIGHT" : "NONE", doneCount: null, requiredCount: null },
    ...over,
  }
}

// 진행 중 판을 스토어에 넣음 (로그인도 나로), 돌려줌: { gameId, seats, me, meUuid }
export function liveGame({ n = 5, me = 1, roles = null, dead = [], names = {}, phase = "DAY", dayIndex = 1, dayPhase = "DAY_VOTE" } = {}) {
  const seats = seatsOf({ n, roles, dead, names })
  const gameId = gameIdOf(gameSeq)
  signIn(seats[me].uuid, seats[me].nickname)
  markRoleRevealSeen(gameId, seats[me].uuid)
  useInGameStore.getState().bootstrapSessionSnapshot(liveSnapshotOf({ gameId, seats, me, phase, dayIndex, dayPhase }), null)
  if (useInGameStore.getState().gameId !== gameId) throw new Error("판 넣기 실패: 스냅샷을 스토어가 안 받음")
  return { gameId, seats, me, meUuid: seats[me].uuid }
}

// 서버가 주는 대기방 하나 (판 끝 뒤 다시 연 방 모양: hostUuid·reservedHostUuid)
// 예: roomOf({ uuids: ["b", "c"], hostUuid: null, reservedHostUuid: "a" })
export function roomOf({ uuids, hostUuid = uuids[0], reservedHostUuid = null, max = 10, roomId = "room-a08", roomCode = "AB12CD", ready = [] }) {
  return {
    roomId,
    roomCode,
    players: uuids.map((uuid, i) => ({ uuid, nickname: `사람${i + 1}`, isReady: ready.includes(uuid), membershipId: `m-${uuid}` })),
    hostUuid,
    reservedHostUuid,
    roomInstanceId: "inst-a08",
    bootEpoch: "boot-a08",
    canStart: false,
    accessType: "code",
    settingsVersion: 3,
    settings: { maxPlayers: max, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
  }
}

// ── 화면 그리기 ──

// 판 진행 알림 받기를 붙이는 껍데기 (로그인 화면 묶음 ProtectedRoute처럼)
function Shell() {
  useGameSessionSocketEvents()
  return h(Outlet)
}

// 길마다 자리 글 (이동했는지 글로 확인)
export const placeText = (path) => `자리 ${path}`

let current = null

// 데이터 라우터로 그림: path에 element, 나머지 길은 "자리 <길>" 글, shell이면 판 알림 받기 붙임
// before: path보다 앞 기록 (뒤로 가기 시험용), 돌려줌: { router, path(), navigations }
export async function renderAt(path, element, { shell = true, before = [], extra = {} } = {}) {
  const children = [
    { path, element },
    ...Object.entries(extra).map(([p, el]) => ({ path: p, element: el })),
    { path: "*", element: h(Elsewhere) },
  ]
  const ctx = { renderError: null, navigations: [] }
  function Catcher() {
    ctx.renderError = useRouteError()
    return h("p", null, "화면 오류 (시험 자리)")
  }
  const routes = shell
    ? [{ element: h(Shell), errorElement: h(Catcher), children }]
    : children.map((c) => ({ ...c, errorElement: h(Catcher) }))
  const router = createMemoryRouter(routes, { initialEntries: [...before, path], initialIndex: before.length })
  // 앱(브라우저 라우터)처럼 window 주소도 같이 옮김 (판 끝 정리·결과 화면 이동이 window 주소를 봄)
  syncWindowPath(router)
  let lastKey = router.state.location.key
  router.subscribe((state) => {
    if (state.location.key === lastKey) return
    lastKey = state.location.key
    ctx.navigations.push(state.location.pathname)
  })
  current = ctx
  await RTL.act(async () => {
    RTL.render(h(RouterProvider, { router }))
  })
  return {
    router,
    path: () => router.state.location.pathname,
    navigations: ctx.navigations,
    error: () => ctx.renderError,
  }
}

function Elsewhere() {
  return h("p", null, placeText(useLocation().pathname))
}

// 마이크로 작업 몇 번 흘려 보냄 (답 넘기기·then 줄이 끝나게)
export async function flush(times = 8) {
  await RTL.act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

// 작은 기다림 (진짜 시계, 가짜 시계 켠 동안엔 안 씀): 조건이 맞을 때까지 최대 ms
export async function waitUntil(check, { ms = 1500, label = "조건" } = {}) {
  const start = Date.now()
  for (;;) {
    await flush(4)
    if (check()) return
    if (Date.now() - start > ms) throw new Error(`${label}이 ${ms}ms 안에 안 맞음`)
    await RTL.act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  }
}

// 결과 영상 끝 신호 → 결과판 (영상이 없으면 아무것도 안 함)
export async function finishIntro() {
  const video = document.querySelector("[data-game-result-intro] video")
  if (!video) return false
  await RTL.act(async () => {
    RTL.fireEvent(video, new window.Event("ended"))
  })
  return true
}

// 브라우저 확인 창·알림 창 받기 → 뜬 글 모음, 확인 창 답은 box.confirmAnswer
export function installDialogs() {
  const box = { alerts: [], confirms: [], confirmAnswer: true }
  const alertFn = (message) => { box.alerts.push(String(message)) }
  const confirmFn = (message) => { box.confirms.push(String(message)); return box.confirmAnswer }
  globalThis.alert = alertFn
  globalThis.window.alert = alertFn
  globalThis.confirm = confirmFn
  globalThis.window.confirm = confirmFn
  return box
}

// 이름으로 단추 찾기 (이름은 단추 글·aria-label), 없으면 null
export function button(name) {
  return RTL.screen.queryAllByRole("button").find((b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === name
    || b.textContent.trim() === name) ?? null
}

// 누르기 (화면 바뀜까지 기다림)
export async function click(el) {
  if (!el) throw new Error("누를 요소가 없음")
  await RTL.act(async () => { RTL.fireEvent.click(el) })
}

// 가짜 시계 켜기 (setTimeout·setInterval·Date), 그리기 전에 부름
export function startFakeClock(now = 1_800_000_000_000) {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now })
}

// 가짜 시계 넘기기 (화면 바뀜까지)
export async function tick(ms) {
  await RTL.act(async () => { mock.timers.tick(ms) })
  await flush(4)
}

// 시험 하나 끝날 때: 화면 내림 → 시계 풂 → 판·방·로그인·소켓·저장소 비움 → 화면이 터졌으면 실패로
export function resetAll() {
  const renderError = current?.renderError ?? null
  RTL.cleanup()
  mock.timers.reset()
  useInGameStore.getState().clearGame()
  useInGameStore.setState({ snapshotSeq: 0 })
  useMatchingStore.getState().clearRoom()
  useAuthStore.getState().logout()
  setSocket(null)
  try { globalThis.window?.sessionStorage?.clear() } catch { /* 막힌 환경이면 그냥 둠 */ }
  try { globalThis.window?.localStorage?.clear() } catch { /* 막힌 환경이면 그냥 둠 */ }
  installFakeFetch()
  resetWindowPath()
  current = null
  if (renderError) throw renderError
}

// A10 화면 시험 몫 도우미: 가짜 소켓(서버가 받은 사건 모음·답 흉내·끊김 흉내)·가짜 HTTP·알림 창 받기·데이터 라우터 그리기
// a10-lobby-entry 폴더 시험만 씀 (공용 아님), 시험 파일이 domSetup.mjs를 먼저 부른 뒤 await import로 부름
import { setSocket } from "../../src/shared/socket/socketClient.js"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"
import { useMatchingStore } from "../../src/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../../src/domains/game/ingame/store/ingameStore.js"

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")

// 창 움직임은 바로 끝나게 (안 끝나면 메모리가 바닥남, 시험 환경 설정이라 코드는 그대로)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

// jsdom에 없는 크기 감시 → 아무것도 안 하는 대역 (채팅 칸·스크롤바가 씀)
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

// 진짜 요청이 안 나가게 fetch를 가짜로: 보낸 주소만 모으고 빈 성공으로 답함
export const sentHttp = []
globalThis.fetch = async (url, options = {}) => {
  sentHttp.push({ url: String(url), method: options.method ?? "GET" })
  return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
}

// 서버가 답을 끝내 안 줌
export const NO_ANSWER = Symbol("no-answer")
// 답을 쥐고 있다가 시험이 release로 줌
export const HOLD = Symbol("hold")

// 가짜 소켓: socket.io처럼 연결 안 된 동안 보낸 것은 모아 뒀다 연결되면 보냄
// received = 서버가 실제로 받은 사건 차례, connectCalls = 다시 연결 시도 수
export function createFakeSocket({ id = "sock-1", connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const held = []
  const buffer = []
  const received = []

  const replyFor = (event, payload) => {
    if (!answers.has(event)) return event === "enter_lobby" ? { ok: true, redirect: null, gameId: null } : NO_ANSWER
    const answer = answers.get(event)
    const count = received.filter((r) => r.event === event).length
    return typeof answer === "function" ? answer(payload, count) : answer
  }

  // 서버가 받음: 차례 기록 + 정한 답 넘기기
  const arrive = ({ event, payload, cb }) => {
    received.push({ event, payload })
    if (typeof cb !== "function") return
    const value = replyFor(event, payload)
    if (value === NO_ANSWER) return
    if (value === HOLD) { held.push({ event, payload, cb }); return }
    Promise.resolve().then(() => cb(value))
  }

  const fire = (event, ...args) => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(...args)
  }

  const socket = {
    id,
    connected,
    received,
    connectCalls: 0,
    io: { opts: {} },
    answer(event, value) { answers.set(event, value); return socket },
    // 그 사건을 서버가 받은 수
    countOf(event) { return received.filter((r) => r.event === event).length },
    // 받은 사건 이름 차례 → ["enter_lobby", "create_room"]
    order() { return received.map((r) => r.event) },
    payloadsOf(event) { return received.filter((r) => r.event === event).map((r) => r.payload) },
    release(event, value) {
      const index = held.findIndex((h) => h.event === event)
      if (index < 0) return false
      const [item] = held.splice(index, 1)
      item.cb(value)
      return true
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      if (fn === undefined) listeners.delete(event)
      else listeners.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload, cb) {
      const packet = { event, payload, cb }
      if (socket.connected) arrive(packet)
      else buffer.push(packet)
      return socket
    },
    timeout(ms) {
      return {
        emitWithAck(event, payload) {
          return new Promise((resolve, reject) => {
            const value = replyFor(event, payload)
            if (value === NO_ANSWER) {
              received.push({ event, payload })
              setTimeout(() => reject(new Error("operation has timed out")), ms)
              return
            }
            socket.emit(event, payload, resolve)
          })
        },
      }
    },
    emitWithAck(event, payload) {
      return new Promise((resolve) => socket.emit(event, payload, resolve))
    },
    // 연결 시도 (화면이 스스로 다시 붙으려 하는지 셈)
    connect() { socket.connectCalls += 1; return socket },
    disconnect() { socket.connected = false; return socket },
    // 서버 알림 흉내
    serverSays(event, payload) { fire(event, payload) },
    // 서버가 끊음 (socket.io: io server disconnect → 스스로 안 붙음)
    serverDisconnects(reason = "io server disconnect") {
      socket.connected = false
      fire("disconnect", reason)
    },
    // 연결됨: 모아 둔 것 보내고 connect 알림
    becomeConnected() {
      socket.connected = true
      for (const packet of buffer.splice(0)) arrive(packet)
      fire("connect")
    },
  }
  return socket
}

// 가짜 소켓을 앱 공용 소켓으로 끼움
export function useFakeSocket(options) {
  const socket = createFakeSocket(options)
  setSocket(socket)
  return socket
}

export function signIn(uuid = "me", nickname = "나") {
  useAuthStore.getState().login({ uuid, nickname })
}

// 알림 창(alert)·확인 창(confirm) 받기 → 뜬 글 모음
export function installDialogs(dom) {
  const box = { alerts: [], confirms: [] }
  const alertFn = (message) => { box.alerts.push(String(message)) }
  const confirmFn = (message) => { box.confirms.push(String(message)); return true }
  globalThis.alert = alertFn
  dom.window.alert = alertFn
  globalThis.confirm = confirmFn
  dom.window.confirm = confirmFn
  return box
}

// 대기방 값 (5명, 첫 사람 방장)
export function roomOf({ n = 5, max = 6, host = "me", roomId = "r1" } = {}) {
  const ids = [host, ...Array.from({ length: n - 1 }, (_, i) => `guest-${i + 1}`)]
  return {
    roomId,
    roomCode: "AB12CD",
    players: ids.map((uuid, i) => ({ uuid, nickname: `사람${i + 1}`, isReady: false, membershipId: `m-${uuid}` })),
    hostUuid: ids[0],
    reservedHostUuid: null,
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    canStart: false,
    accessType: "open",
    settingsVersion: 1,
    settings: { maxPlayers: max, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
  }
}

// 방 스토어에 방 넣기
export function putRoom(room = roomOf()) {
  useMatchingStore.getState().setRoom(room)
  return room
}

export const roomState = () => {
  const s = useMatchingStore.getState()
  return { roomId: s.roomId, isInRoom: s.isInRoom }
}

export const gameIdInStore = () => useInGameStore.getState().gameId

// 데이터 라우터로 그림 (나가기 훅이 useBlocker를 써서), 주소는 router.state로 읽음
export function mountRoutes(routes, initialEntries, initialIndex) {
  const router = createMemoryRouter(routes, { initialEntries, ...(initialIndex === undefined ? {} : { initialIndex }) })
  const view = RTL.render(React.createElement(RouterProvider, { router }))
  return { ...view, router, path: () => router.state.location.pathname }
}

// 마이크로 작업 흘려 보냄 (답 넘기기·then 줄 끝나게)
export async function flush(times = 8) {
  await RTL.act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

// 조금씩 기다림 (판 화면과 RTL waitFor를 같이 쓰면 안 끝나서 작게 따로 둠), 넘으면 실패
export async function waitUntil(check, { timeoutMs = 3000, stepMs = 20, what = "화면 바뀜" } = {}) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`${what}: ${timeoutMs}ms 안에 안 됨`)
    await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, stepMs)) })
  }
}

// 시험끼리 안 섞이게 화면·스토어·소켓 비움
export function resetAll() {
  RTL.cleanup()
  setSocket(null)
  useMatchingStore.getState().clearRoom()
  useInGameStore.getState().clearGame?.()
  useAuthStore.getState().logout()
  try { globalThis.window.sessionStorage.clear() } catch { /* 없음 */ }
}

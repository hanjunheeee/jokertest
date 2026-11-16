// A01b 화면 시험 몫 도우미: 가짜 소켓(보낸 사건·값 모음, 서버 답 흉내)·가짜 HTTP·알림 창 받기·로그인·방 값 만들기
// a01-room 폴더의 A01b 몫 시험(입장·준비·추방·초대)이 씀 (공용 아님), 시험 파일이 domSetup.mjs를 먼저 부른 뒤 await import로 부름
import { setSocket } from "../../src/shared/socket/socketClient.js"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"
import { useMatchingStore } from "../../src/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../../src/domains/game/ingame/store/ingameStore.js"
import { useGameInviteStore } from "../../src/domains/lobby/store/gameInvite.store.js"
import { useFriendStore } from "../../src/domains/lobby/store/friend.store.js"

// jsdom에 없는 크기 감시(ResizeObserver) — 추방·친구 초대 창 스크롤바가 씀, 아무것도 안 하는 대역
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  if (globalThis.window) globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

// 서버가 답을 끝내 안 줌 (기다리는 시간이 지나면 시간 초과)
export const NO_ANSWER = Symbol("no-answer")
// 답을 손에 쥐고 있다가 시험이 release로 줌 (보내는 중 화면을 보려고)
export const HOLD = Symbol("hold")

// 가짜 소켓: 보낸 사건 이름·값을 sent에, 정한 답(answer)을 돌려줌, 정한 답이 없으면 답 안 옴
export function createFakeSocket({ id = "sock-1", connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const held = []
  const sent = []

  // 정한 답 꺼내기 (함수면 보낸 값·몇 번째인지 넣어 부름)
  const replyFor = (event, payload) => {
    if (!answers.has(event)) {
      if (event === "enter_lobby") return { ok: true, redirect: null }
      return NO_ANSWER
    }
    const answer = answers.get(event)
    const count = sent.filter((s) => s.event === event).length
    return typeof answer === "function" ? answer(payload, count) : answer
  }

  // 답 넘기기: 쥐기면 held에 모음, 답 없음이면 안 부름
  const deliver = (event, payload, cb) => {
    const value = replyFor(event, payload)
    if (value === NO_ANSWER) return
    if (value === HOLD) { held.push({ event, payload, cb }); return }
    Promise.resolve().then(() => cb(value))
  }

  const socket = {
    id,
    connected,
    sent,
    // 서버 답 정하기
    answer(event, value) {
      answers.set(event, value)
      return socket
    },
    // 그 사건으로 보낸 값만 → [{ roomId: "r1" }, …]
    sentOf(event) {
      return sent.filter((s) => s.event === event).map((s) => s.payload)
    },
    // 쥐고 있던 답 하나를 줌 (가장 먼저 쥔 것부터), 쥔 답이 없으면 false
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
      listeners.get(event)?.delete(fn)
      return socket
    },
    emit(event, payload, cb) {
      sent.push({ event, payload })
      if (typeof cb === "function") deliver(event, payload, cb)
      return socket
    },
    // socket.io의 timeout(ms).emitWithAck 흉내: 답 없음이면 ms 뒤 시간 초과
    timeout(ms) {
      return {
        emitWithAck(event, payload) {
          sent.push({ event, payload })
          return new Promise((resolve, reject) => {
            const value = replyFor(event, payload)
            if (value === NO_ANSWER) {
              setTimeout(() => reject(new Error("operation has timed out")), ms)
              return
            }
            if (value === HOLD) { held.push({ event, payload, cb: resolve }); return }
            Promise.resolve(value).then(resolve, reject)
          })
        },
      }
    },
    // 서버가 보낸 알림 흉내 (붙은 받는 함수 모두 부름)
    serverSays(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
    },
  }
  return socket
}

// 가짜 소켓을 앱 소켓으로 끼움
export function useFakeSocket(options) {
  const socket = createFakeSocket(options)
  setSocket(socket)
  return socket
}

// 로그인한 사람으로 둠
export function signIn(uuid = "host", nickname = "방장") {
  useAuthStore.getState().login({ uuid, nickname })
}

// 브라우저 알림 창(alert)·확인 창(confirm) 대신 받기 → 뜬 글 모음, 확인 창 답은 confirmAnswer로
export function installDialogs(dom) {
  const box = { alerts: [], confirms: [], confirmAnswer: true }
  const alertFn = (message) => { box.alerts.push(String(message)) }
  const confirmFn = (message) => { box.confirms.push(String(message)); return box.confirmAnswer }
  globalThis.alert = alertFn
  dom.window.alert = alertFn
  dom.window.confirm = confirmFn
  return box
}

// 가짜 HTTP: 보낸 요청(주소·방법·몸통)을 calls에, routes에서 "POST /friends/invites" 같은 열쇠로 답을 찾음
// 답 모양: { status, body } (body는 json으로 감), 정한 답이 없으면 404
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
  return { calls, routes }
}

// 시험끼리 안 섞이게 스토어·소켓 비움
export function resetAll() {
  setSocket(null)
  useMatchingStore.getState().clearRoom()
  useInGameStore.getState().clearGame?.()
  useAuthStore.getState().logout()
  useGameInviteStore.getState().__resetForTests?.()
  useFriendStore.getState().__resetForTests?.()
}

// 서버가 주는 방 하나 (명단 n명, 첫 사람이 방장, 사람마다 자리 번호 membershipId)
// 예: roomOf({ n: 5, max: 6 }) → { roomId: "room-1", players: [host, guest-1..4], hostUuid: "host", settings: { maxPlayers: 6 }, … }
export function roomOf({
  n = 5,
  max = 10,
  host = "host",
  uuids = null,
  ready = [],
  roomId = "room-1",
  roomInstanceId = "inst-1",
  bootEpoch = "boot-1",
  accessType = "open",
  settingsVersion = 1,
  hostUuid = undefined,
} = {}) {
  const ids = uuids ?? [host, ...Array.from({ length: n - 1 }, (_, i) => `guest-${i + 1}`)]
  return {
    roomId,
    roomCode: "AB12CD",
    players: ids.map((uuid, i) => ({
      uuid,
      nickname: `사람${i + 1}`,
      isReady: ready.includes(uuid),
      membershipId: `m-${uuid}`,
    })),
    hostUuid: hostUuid === undefined ? ids[0] : hostUuid,
    reservedHostUuid: null,
    roomInstanceId,
    bootEpoch,
    canStart: false,
    accessType,
    settingsVersion,
    settings: { maxPlayers: max, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
  }
}

// 몇 번 마이크로 작업을 흘려 보냄 (답 넘기기·then 줄이 끝나게)
export async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

// Tab으로 닿는 칸 목록 (꺼지지 않은 단추·입력칸·tabindex 0 이상, 숨김 표시 없는 것) → 화면 차례대로
export function tabbables(root = document) {
  const all = [...root.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")]
  return all.filter((el) => {
    if (el.disabled) return false
    if (el.getAttribute("tabindex") !== null && Number(el.getAttribute("tabindex")) < 0) return false
    if (el.closest("[hidden],[aria-hidden='true'],[inert]")) return false
    return true
  })
}

// 브라우저처럼 Enter 누름: 키 내림 사건을 보내고, 막히지 않았고 꺼지지 않은 단추면 누름(click)으로 이어짐
export function pressEnter(el) {
  el.focus()
  const down = new window.KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true })
  const notPrevented = el.dispatchEvent(down)
  if (notPrevented && el.tagName === "BUTTON" && !el.disabled) el.click()
  el.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }))
}

// 클래스에서 색 값 꺼내기: text-[#ffc9bf] → "#ffc9bf", 없으면 null
export function classColor(className, prefix) {
  const m = String(className).match(new RegExp(`(?:^|\\s)${prefix}-\\[(#[0-9a-fA-F]{6})\\]`))
  return m ? m[1].toLowerCase() : null
}

// 두 색의 글자 대비 (WCAG 셈, 투명도는 안 봄 → 짐작 값)
export function contrast(hexA, hexB) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

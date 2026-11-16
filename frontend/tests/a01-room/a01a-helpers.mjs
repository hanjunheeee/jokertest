// A01a 화면 시험 몫 도우미: 가짜 소켓(보낸 사건·값 모음, 서버 답 흉내)·로그인·스토어 비우기·방 값 만들기
// a01-room 폴더의 A01a 몫 시험이 씀 (공용 아님), domSetup.mjs를 먼저 부른 뒤 await import로 부름
import { setSocket } from "../../src/shared/socket/socketClient.js"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"
import { useMatchingStore } from "../../src/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "../../src/domains/game/ingame/store/ingameStore.js"

// 서버가 답을 안 줌 → 기다리는 시간이 지나면 시간 초과 (가짜 시계로 경계 보기)
export const NO_ANSWER = Symbol("no-answer")
// 답을 잃음 → 바로 시간 초과 (진짜로 8초 안 기다리려고)
export const LOST = Symbol("lost")
// 답이 끝내 안 오고 시간 초과도 안 남 (답 정하지 않은 사건의 기본, 진짜 시계가 시험을 붙잡지 않게)
export const HOLD = Symbol("hold")

// 나중에 답 주기 (답 오기 전 화면을 보려고)
export function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

// 가짜 소켓: 화면이 보낸 사건 이름·값을 sent에 모으고, answer로 정한 서버 답을 돌려줌
// 정한 답이 없는 사건은 답이 끝내 안 옴 (enter_lobby만 기본 답 있음)
export function createFakeSocket({ id = "sock-1", connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const sent = []

  // 정한 답 꺼내기 (함수면 보낸 값·몇 번째인지 넣어 부름)
  const replyFor = (event, payload) => {
    if (!answers.has(event)) {
      if (event === "enter_lobby") return { ok: true, redirect: null }
      return HOLD
    }
    const answer = answers.get(event)
    const count = sent.filter((s) => s.event === event).length
    return typeof answer === "function" ? answer(payload, count) : answer
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
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn)
      return socket
    },
    // 답 받는 함수가 있으면 정한 답을 넘김 (답 없음·잃음이면 안 부름)
    emit(event, payload, cb) {
      sent.push({ event, payload })
      if (typeof cb === "function") {
        Promise.resolve(replyFor(event, payload)).then((value) => {
          if (value !== NO_ANSWER && value !== LOST && value !== HOLD) cb(value)
        })
      }
      return socket
    },
    // socket.io의 timeout(ms).emitWithAck 흉내: 답 없음이면 ms 뒤 시간 초과
    timeout(ms) {
      return {
        emitWithAck(event, payload) {
          sent.push({ event, payload })
          return new Promise((resolve, reject) => {
            Promise.resolve(replyFor(event, payload)).then((value) => {
              if (value === HOLD) return
              if (value === LOST) return reject(new Error("operation has timed out"))
              if (value === NO_ANSWER) {
                setTimeout(() => reject(new Error("operation has timed out")), ms)
                return
              }
              resolve(value)
            }, reject)
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

// 시험끼리 안 섞이게 스토어·소켓 비움
export function resetAll() {
  setSocket(null)
  useMatchingStore.getState().clearRoom()
  useInGameStore.getState().clearGame?.()
  useAuthStore.getState().logout()
}

// 방 처음 설정 (서버가 돌려주는 모양, 정원 10·광대 2·60·60·90·자동)
export const BASE_SETTINGS = Object.freeze({
  maxPlayers: 10,
  jokerCount: 2,
  roleCompositionMode: "auto",
  dayDiscussionTime: 60,
  dayVoteTime: 60,
  nightActionTime: 90,
})

// 서버가 주는 방 하나 (명단 n명, 첫 사람이 방장)
// 예: roomOf({ n: 5 }) → { roomId: "room-1", roomCode: "AB12CD", players: [host, guest-1..4], hostUuid: "host", … }
export function roomOf({
  n = 5,
  host = "host",
  ready = [],
  roomId = "room-1",
  roomCode = "AB12CD",
  settingsVersion = 1,
  accessType = "open",
  settings = {},
  canStart = false,
  extra = {},
} = {}) {
  const uuids = [host, ...Array.from({ length: n - 1 }, (_, i) => `guest-${i + 1}`)]
  return {
    roomId,
    roomCode,
    players: uuids.map((uuid, i) => ({ uuid, nickname: `사람${i + 1}`, isReady: ready.includes(uuid) })),
    hostUuid: host,
    reservedHostUuid: null,
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    canStart,
    accessType,
    settingsVersion,
    settings: { ...BASE_SETTINGS, ...settings },
    ...extra,
  }
}

// 방이 확인될 때까지 기다리기 좋게: get_current_room 답을 그 방으로 정함
export function answerCurrentRoom(socket, room) {
  socket.answer("get_current_room", () => ({ ok: true, room }))
}

// 화면 그리기 도구 (domSetup.mjs 뒤라 여기서 불러도 됨)
const React = await import("react")
const { render } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom")

// 브라우저 알림 창 글 모음 (alert는 막고 글만 모음, confirm은 정한 답)
export const alerts = []
export function catchDialogs({ confirm = true } = {}) {
  alerts.length = 0
  const alertFn = (message) => { alerts.push(String(message)) }
  const confirmFn = () => confirm
  globalThis.alert = alertFn
  window.alert = alertFn
  globalThis.confirm = confirmFn
  window.confirm = confirmFn
}

// 화면 하나를 길 표 안에 그림, 다른 길로 옮기면 where.path가 바뀌고 "다른 화면 <길>" 글이 뜸
export function renderAt(path, element) {
  const where = { path }
  function LocationSpy() {
    where.path = useLocation().pathname
    return null
  }
  function Elsewhere() {
    return React.createElement("p", null, `다른 화면 ${useLocation().pathname}`)
  }
  const view = render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(LocationSpy),
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path, element }),
        React.createElement(Route, { path: "*", element: React.createElement(Elsewhere) }),
      ),
    ),
  )
  return { ...view, where }
}

// 숫자 고르기 칸의 지금 글 (감소 단추 옆 칸) → 예: "60초"
export function stepperText(label) {
  const down = document.querySelector(`button[aria-label="${label} 감소"]`)
  if (!down) throw new Error(`${label} 칸 없음`)
  return down.nextElementSibling?.textContent ?? ""
}

// 숫자 고르기 칸의 지금 숫자 → 예: 60
export function stepperValue(label) {
  return Number.parseInt(stepperText(label), 10)
}

// 대기방 훅(useRoom)만 쓰는 작은 화면: 방 확인됨·시작 막힘 글을 화면에 띄우고, api.current로 훅 값을 꺼냄
const { useRoom } = await import("../../src/domains/game/matching/hooks/room/useRoom.js")
const NOOP = () => {}
function RoomProbe({ api }) {
  const room = useRoom({ onRoomDeleted: NOOP, onGameStarted: NOOP })
  api.current = room
  return React.createElement(
    "div",
    null,
    React.createElement("p", { "data-testid": "sync" }, room.isRoomVerified ? "확인됨" : "확인 전"),
    React.createElement("p", { "data-testid": "blocked" }, room.startBlockedMessage ?? ""),
    React.createElement("p", { "data-testid": "settings-error" }, room.settingsError?.message ?? ""),
  )
}

// 방에 앉은 사람으로 대기방 훅을 그림 (get_current_room 답 = 그 방, 확인 끝날 때까지는 부르는 쪽이 기다림)
export function renderRoomHook({ room, me = room.hostUuid, socket = useFakeSocket(), verify = true }) {
  signIn(me)
  // verify 끄면 방 확인 답이 끝내 안 옴 (확인 전 상태 보기)
  if (verify) answerCurrentRoom(socket, room)
  useMatchingStore.getState().setRoom(room)
  const api = {}
  const view = renderAt("/game-matching", React.createElement(RoomProbe, { api }))
  return { api, socket, ...view }
}

// 숫자 칸을 목표 값까지 단추로 옮김 (사람이 −·+ 누르듯), 20번 안에 못 가면 멈춤
const { fireEvent } = await import("@testing-library/react")
export function stepTo(label, target) {
  for (let i = 0; i < 20; i += 1) {
    const now = stepperValue(label)
    if (now === target) return
    const button = document.querySelector(`button[aria-label="${label} ${now > target ? "감소" : "증가"}"]`)
    if (!button || button.disabled) throw new Error(`${label} ${target}까지 못 감 (지금 ${now})`)
    fireEvent.click(button)
  }
  throw new Error(`${label} ${target}까지 못 감`)
}

// 이름으로 단추 찾아 누름
export function press(name) {
  const button = document.querySelector(`button[aria-label="${name}"]`)
  if (!button) throw new Error(`${name} 단추 없음`)
  fireEvent.click(button)
}

// 이름으로 단추 찾기 (없으면 null)
export function buttonNamed(name) {
  return document.querySelector(`button[aria-label="${name}"]`)
}

// 대기방 화면 전체를 그림 (방에 앉은 사람 me, get_current_room 답 = 그 방)
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
export function renderMatchingPage({ room, me = room.hostUuid, socket = useFakeSocket(), verify = true }) {
  signIn(me)
  if (verify) answerCurrentRoom(socket, room)
  useMatchingStore.getState().setRoom(room)
  const view = renderAt("/game-matching", React.createElement(GameMatchingPage))
  return { socket, ...view }
}

// 자리 칸 그림 (준비한 사람·안 한 사람) 전부
export function seatImages() {
  return [...document.querySelectorAll('img[alt="준비 완료한 참가자"], img[alt="준비 전 참가자"]')]
}

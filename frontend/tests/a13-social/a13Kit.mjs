// A13 화면 시험 몫 도우미: 가짜 HTTP(친구·알림·신고·문의 답), 가짜 소켓, 로그인, 효과음 받아 적기, 스토어 비우기
// a13-social 폴더 시험만 씀 (공용 아님), 시험 파일이 domSetup.mjs를 먼저 부른 뒤 await import로 부름
import { act, cleanup } from "@testing-library/react"
import { MotionGlobalConfig } from "framer-motion"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"
import { useFriendStore } from "../../src/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "../../src/domains/lobby/store/gameInvite.store.js"
import { useNotificationsStore } from "../../src/domains/notifications/store/notifications.store.js"
import { useSettingsStore } from "../../src/domains/settings/store/settingsStore.js"
import { setSocket } from "../../src/shared/socket/socketClient.js"
import { createSfxPlayer } from "../../src/shared/audio/sfxPlayer.js"
import { SFX_MANIFEST } from "../../src/shared/audio/sfxManifest.js"
import { setActivePlayer, clearActivePlayer } from "../../src/shared/audio/sfxRuntime.js"

// 창 움직임 건너뜀 (안 끝나는 움직임이 메모리를 먹은 일이 있었음)
MotionGlobalConfig.skipAnimations = true

// jsdom에 없는 크기 감시 — 스크롤 칸이 씀, 아무것도 안 하는 대역
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  if (globalThis.window) globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

// 답을 쥐고 있다가 시험이 release로 줌 (보내는 중 화면을 보려고)
export const HOLD = Symbol("hold")

// 친구 패널·로비가 처음 그릴 때 받는 다섯 목록 (비어 있음)
export function emptyFriendRoutes() {
  return {
    "GET /friends": { body: { data: [] } },
    "GET /friends/requests/incoming": { body: { data: [] } },
    "GET /friends/favorites": { body: { data: [] } },
    "GET /friends/blocks": { body: { data: [] } },
    "GET /friends/invites": { body: { data: { invites: [], cursor: "0" } } },
    "GET /notifications": { body: { data: [] } },
  }
}

// 가짜 HTTP: 보낸 요청(방법·주소·몸통)을 calls에, routes에서 "POST /reports" 같은 열쇠로 답을 찾음
// 답 모양: { status, body } / HOLD / 함수(몸통, 몇 번째) → 둘 중 하나, 정한 답이 없으면 200 {} (진짜 요청은 안 나감)
export function installFetch(ownRoutes = {}) {
  const routes = { ...emptyFriendRoutes(), ...ownRoutes }
  const calls = []
  const held = []
  const fake = async (url, options = {}) => {
    const method = options.method ?? "GET"
    const path = String(url).replace(/^https?:\/\/[^/]+/, "")
    const body = typeof options.body === "string" ? JSON.parse(options.body) : null
    calls.push({ method, path, body })
    const bare = path.split("?")[0]
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${bare}`]
    const count = calls.filter((c) => c.method === method && c.path.split("?")[0] === bare).length
    const answer = typeof route === "function" ? route(body, count, path) : route
    const respond = (value) => new Response(JSON.stringify(value?.body ?? {}), {
      status: value?.status ?? 200, headers: { "Content-Type": "application/json" },
    })
    if (answer === HOLD) {
      return new Promise((resolve) => { held.push({ method, bare, give: (value) => resolve(respond(value)) }) })
    }
    return respond(answer)
  }
  globalThis.fetch = fake
  if (globalThis.window) globalThis.window.fetch = fake
  return {
    calls,
    routes,
    // 그 방법·주소로 보낸 요청만 → [{ method, path, body }]
    to(method, bare) {
      return calls.filter((c) => c.method === method && c.path.split("?")[0] === bare)
    },
    // 쥐고 있던 답 하나를 줌 (그 주소로 가장 먼저 쥔 것부터), 없으면 false
    async release(method, bare, value) {
      const index = held.findIndex((h) => h.method === method && h.bare === bare)
      if (index < 0) return false
      const [item] = held.splice(index, 1)
      await act(async () => { item.give(value); await settle() })
      return true
    },
  }
}

// 가짜 소켓: on/off로 붙고, 서버 알림은 serverSays로 흉내, 보낸 사건은 sent에
// answer(사건, 값)으로 정한 답은 emitWithAck·timeout().emitWithAck가 돌려줌 (안 정하면 답 안 옴)
export function fakeSocket({ connected = true } = {}) {
  const listeners = new Map()
  const answers = new Map()
  const sent = []
  const ack = (event, payload) => {
    sent.push({ event, payload })
    return answers.has(event) ? Promise.resolve(answers.get(event)) : new Promise(() => {})
  }
  const socket = {
    id: "sock-a13",
    connected,
    sent,
    answer(event, value) {
      answers.set(event, value)
      return socket
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
      const value = answers.has(event) ? answers.get(event) : { ok: true, created: false }
      if (typeof cb === "function") Promise.resolve().then(() => cb(value))
      return socket
    },
    timeout() {
      return { emitWithAck: ack }
    },
    emitWithAck: ack,
    // 서버가 보낸 알림 흉내 (붙은 받는 함수 모두 부름)
    serverSays(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
    },
  }
  return socket
}

// 서버 알림 넣고 화면까지 흘림
export async function say(socket, event, payload) {
  await act(async () => { socket.serverSays(event, payload); await settle() })
}

// 로그인한 사람으로 둠
export const ME = "me-uuid"
export function signIn(uuid = ME, nickname = "가면손님") {
  useAuthStore.getState().login({ uuid, nickname })
}

// 효과음: 진짜 효과음 플레이어에 가짜 재생기만 끼워, 재생으로 받아들인 소리 종류를 played에 모음
// 예: 초대 소리 한 번 → played = ["game-invite"]
export function installSoundBox() {
  const played = []
  const player = createSfxPlayer({
    manifest: SFX_MANIFEST,
    getSettings: () => ({ masterVolume: 100, sfxVolume: 100, sfxMuted: false, notifications: {} }),
    getScope: () => ({ accountId: useAuthStore.getState().user?.uuid ?? null, gameId: null, roomId: null }),
    loadAsset: (entry) => ({ sha256: entry.sha256, src: entry.src }),
    createMedia: () => ({ volume: 1, muted: false, play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeEventListener() {} }),
    // 시계는 안 검 (남은 타이머가 시험 끝을 붙잡지 않게)
    setTimer: () => ({}),
    clearTimer: () => {},
  })
  const box = {
    played,
    dispatch(event) {
      const result = player.dispatch(event)
      if (result?.status === "accepted") played.push(event.kind)
      return result
    },
    getMix: player.getMix,
    subscribeMix: player.subscribeMix,
    claimAudio: player.claimAudio,
    getSilenceLog: player.getSilenceLog,
  }
  setActivePlayer(box)
  box.remove = () => { clearActivePlayer(box); player.dispose() }
  return box
}

// 마이크로 작업·0ms 예약을 몇 번 흘려 보냄
export async function settle(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// act 안에서 흘려 보냄 (그리기까지 끝나게)
export async function flushUi(times = 4) {
  await act(async () => { await settle(times) })
}

// 시험끼리 안 섞이게 화면·스토어·소켓 비움
export function resetAll() {
  cleanup()
  setSocket(null)
  useFriendStore.getState().__resetForTests()
  useGameInviteStore.getState().__resetForTests()
  useNotificationsStore.getState().__resetForTests()
  useAuthStore.getState().logout()
  useAuthStore.setState({ loggedOutIntentionally: false })
  useSettingsStore.getState().resetSettings()
  try { window.localStorage.clear() } catch { /* 저장소 막힘 무시 */ }
}

// 친구 목록 패널을 연 채로 그림 (로비가 여는 것과 같은 부품), 열자마자 받는 목록까지 흘림
// 예: await openPanel() → 목록 탭, openPanel({ roomId: "room-1", isRoomVerified: false }) → 초대 단추 있는 패널
export async function openPanel(props = {}) {
  const React = await import("react")
  const { render } = await import("@testing-library/react")
  const { MemoryRouter } = await import("react-router-dom")
  const { default: FriendListPanel } = await import("../../src/domains/lobby/components/friendList/FriendListPanel.jsx")
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, null,
      React.createElement(FriendListPanel, { open: true, onClose: () => {}, ...props })))
    await settle(8)
  })
  return view
}

// 패널 위쪽 탭 누르기 ("친구 추가"·"요청 수락"·"게임 초대"·"차단 목록")
export async function openTab(label) {
  const { screen, fireEvent } = await import("@testing-library/react")
  const tab = screen.getAllByRole("tab").find((el) => el.getAttribute("aria-label")?.startsWith(label))
  await act(async () => { fireEvent.click(tab); await settle(8) })
}

// 단추 누르고 흘림
export async function press(element) {
  const { fireEvent } = await import("@testing-library/react")
  await act(async () => { fireEvent.click(element); await settle(8) })
}

// 입력칸에 글 넣고 흘림
export async function typeInto(input, value) {
  const { fireEvent } = await import("@testing-library/react")
  await act(async () => { fireEvent.change(input, { target: { value } }); await settle() })
}

// 서버가 주는 친구 한 줄 (이름·접속)
// 예: friend("f1", "지유", true) → { id: "f1", name: "지유", online: true, status: "ONLINE" }
export function friend(id, name, online = false) {
  return { id, name, online, status: online ? "ONLINE" : "OFFLINE", accountProfilePhotoId: null, accountProfileBorderId: null }
}

// 서버가 주는 받은 초대 한 줄 (나에게 온 대기 초대)
export function inviteRow({ id = "inv-1", sender = "s-1", senderName = "민수", status = "PENDING", revision = 1, seq = "5", expiresAt = null } = {}) {
  return {
    inviteId: id, senderId: sender, senderName, receiverId: ME, status, revision, creationSeq: seq,
    createdAt: "2026-11-16T00:00:00.000Z", expiresAt: expiresAt ?? new Date(Date.now() + 180_000).toISOString(),
    decidedAt: null, endReason: null, entryOutcome: null,
  }
}

// 서버가 주는 알림 한 줄
// 예: note("n1", { type: "achievement", read: true }) → { id: "n1", type: "achievement", …, readAt: "…" }
export function note(id, { type = "system", title = `제목 ${id}`, body = `본문 ${id}`, target = null, read = false } = {}) {
  return {
    id, type, sourceKey: `${type}:${id}:k`, title, body, target,
    createdAt: "2026-11-16T01:00:00.000Z", readAt: read ? "2026-11-16T02:00:00.000Z" : null,
  }
}

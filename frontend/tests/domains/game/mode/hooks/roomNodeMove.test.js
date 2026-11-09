// Node 이동(조각 5) 방 입장·초대 수락 시험: ROOM_ON_OTHER_NODE면 그 Node로 옮긴 뒤 같은 요청을 한 번만 다시
// 코드 입장·공개 방 입장·파티 방 다시 들어가기·초대 수락, 옮기는 중 연타는 안 보냄, 단일 서버 거절은 예전 그대로
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MutationObserver"]) {
  installDomGlobal(name, name === "window" ? dom.window : dom.window[name])
}
installDomGlobal("sessionStorage", dom.window.sessionStorage)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

// 이동 함수는 늘 같은 것 (훅 효과 의존값이라 바뀌면 다시 붙음)
const navigated = []
const navigate = (path) => navigated.push(path)
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => navigate, useLocation: () => ({ state: null }) },
})

const { act, renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { setNodeHintAccount } = await import("../../../../../src/shared/socket/nodeHint.js")
const { useRoomInvitePage } = await import("../../../../../src/domains/game/mode/hooks/useRoomInvitePage.js")
const { usePublicRooms } = await import("../../../../../src/domains/game/mode/hooks/usePublicRooms.js")
const { usePartyRejoin } = await import("../../../../../src/domains/game/matching/hooks/room/usePartyRejoin.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { requestGameInviteAccept } = await import("../../../../../src/domains/lobby/hooks/friendSocket/inviteAccept.js")
const { useGameInviteStore } = await import("../../../../../src/domains/lobby/store/gameInvite.store.js")

// 가짜 소켓: 진짜처럼 io.opts.query를 접속 때 읽고, connect()하면 다음 차례에 connect 사건을 냄 (id도 바뀜)
// answer(event, payload) → 답 함수 있는 요청의 답 (없으면 안 답함)
function createNodeSocket({ answer = () => undefined, autoConnect = true } = {}) {
  const listeners = new Map()
  let seq = 0
  const socket = {
    id: "n1-0",
    connected: true,
    io: { opts: {} },
    emitted: [],
    disconnectCount: 0,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit(event, payload, ack) {
      socket.emitted.push({ event, payload, node: socket.io.opts.query?.node ?? null })
      if (typeof ack === "function") {
        const reply = answer(event, payload, socket)
        if (reply !== undefined) queueMicrotask(() => ack(reply))
      }
    },
    timeout() { return socket },
    emitWithAck(event, payload) {
      return new Promise((resolve) => socket.emit(event, payload, resolve))
    },
    disconnect() { socket.disconnectCount += 1; socket.connected = false },
    connect() {
      if (!autoConnect) return
      queueMicrotask(() => {
        seq += 1
        socket.id = `${socket.io.opts.query?.node ?? "any"}-${seq}`
        socket.connected = true
        socket.trigger("connect")
      })
    },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    count(event) { return socket.emitted.filter((entry) => entry.event === event).length },
  }
  return socket
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function reset() {
  alerts.length = 0
  navigated.length = 0
  globalThis.sessionStorage.clear()
  setNodeHintAccount("user-a")
  useMatchingStore.getState().clearRoom()
}

test("코드 입장: ROOM_ON_OTHER_NODE면 n2로 옮긴 뒤 같은 요청을 한 번만 다시 보내고, 옮기는 중 연타는 안 보냄", async () => {
  reset()
  const socket = createNodeSocket()
  setSocket(socket)
  const { result } = renderHook(() => useRoomInvitePage())
  act(() => { result.current.setRoomCode("ABC123") })
  act(() => { result.current.joinRoom() })
  assert.equal(socket.count("join_room_by_code"), 1)

  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n2" }) })
  assert.equal(result.current.isJoining, true, "옮기는 동안도 들어가는 중")
  act(() => { result.current.joinRoom() })
  act(() => { result.current.joinRoom() })
  await act(async () => { await flush() })

  const joins = socket.emitted.filter((entry) => entry.event === "join_room_by_code")
  assert.equal(joins.length, 2, "처음 + 옮긴 뒤 한 번 (연타 두 번은 안 보냄)")
  assert.deepEqual(joins[1], { event: "join_room_by_code", payload: { roomCode: "ABC123" }, node: "n2" })
  assert.equal(socket.disconnectCount, 1)
  assert.equal(alerts.length, 0)

  act(() => { socket.trigger("room_joined", { roomId: "room-1", roomCode: "ABC123", players: [] }) })
  assert.equal(result.current.isJoining, false)
  assert.deepEqual(navigated, ["/game-matching"])
  cleanup()
  setSocket(null)
})

test("코드 입장: 옮긴 뒤 또 ROOM_ON_OTHER_NODE면 다시 안 옮기고 실패 안내 (고리 없음)", async () => {
  reset()
  const socket = createNodeSocket()
  setSocket(socket)
  const { result } = renderHook(() => useRoomInvitePage())
  act(() => { result.current.setRoomCode("ABC123") })
  act(() => { result.current.joinRoom() })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n2" }) })
  await act(async () => { await flush() })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n3" }) })
  await act(async () => { await flush() })

  assert.equal(socket.count("join_room_by_code"), 2)
  assert.equal(socket.disconnectCount, 1, "두 번째는 안 옮김")
  assert.equal(result.current.isJoining, false)
  assert.equal(alerts.length, 1)
  cleanup()
  setSocket(null)
})

test("코드 입장: 옮기기가 시간 안에 안 되면 안내하고 다시 누를 수 있게 풂", async (t) => {
  reset()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const socket = createNodeSocket({ autoConnect: false })
  setSocket(socket)
  const { result } = renderHook(() => useRoomInvitePage())
  act(() => { result.current.setRoomCode("ABC123") })
  act(() => { result.current.joinRoom() })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n2" }) })
  t.mock.timers.tick(10000)
  await act(async () => { await flush() })
  t.mock.timers.reset()

  assert.equal(socket.count("join_room_by_code"), 1, "옮기지 못했으면 다시 안 보냄")
  assert.equal(result.current.isJoining, false)
  assert.equal(alerts.length, 1)
  cleanup()
  setSocket(null)
})

test("단일 서버 그대로: 보통 거절(ROOM_FULL)·NODE_UNAVAILABLE은 옮기지 않고 바로 안내", async () => {
  reset()
  const socket = createNodeSocket()
  setSocket(socket)
  const { result } = renderHook(() => useRoomInvitePage())
  act(() => { result.current.setRoomCode("ABC123") })
  act(() => { result.current.joinRoom() })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_FULL" }) })
  act(() => { result.current.joinRoom() })
  act(() => { socket.trigger("room_join_failed", { code: "NODE_UNAVAILABLE" }) })
  await act(async () => { await flush() })

  assert.equal(socket.disconnectCount, 0)
  assert.equal(socket.count("join_room_by_code"), 2)
  assert.equal(alerts.length, 2)
  assert.match(alerts[1], /방을 찾을 수 없습니다/)
  cleanup()
  setSocket(null)
})

test("공개 방 입장: ROOM_ON_OTHER_NODE면 옮긴 뒤 같은 방 id로 한 번만 다시, 옮기는 중 다른 방 눌러도 안 보냄", async () => {
  reset()
  const socket = createNodeSocket({ answer: (event) => (event === "get_public_rooms" ? { ok: true, rooms: [] } : undefined) })
  setSocket(socket)
  const { result } = renderHook(() => usePublicRooms())
  await act(async () => { await flush() })
  act(() => { result.current.joinPublicRoom("room-7") })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n2" }) })
  act(() => { result.current.joinPublicRoom("room-8") })
  await act(async () => { await flush() })

  const joins = socket.emitted.filter((entry) => entry.event === "join_public_room")
  assert.equal(joins.length, 2)
  assert.deepEqual(joins.map((entry) => [entry.payload.roomId, entry.node]), [["room-7", null], ["room-7", "n2"]])
  assert.equal(alerts.length, 0)
  cleanup()
  setSocket(null)
})

test("파티 방 다시 들어가기: 다음 방 묻기 답이 ROOM_ON_OTHER_NODE면 옮긴 뒤 다시 묻고, 입장 거절이면 한 번만 다시 보냄", async () => {
  reset()
  let partyAnswers = 0
  const socket = createNodeSocket({
    answer: (event, payload, s) => {
      if (event === "get_current_room") return { ok: true, room: null }
      if (event !== "get_party_matching_room") return undefined
      partyAnswers += 1
      if (s.io.opts.query?.node !== "n2") return { ok: false, code: "ROOM_ON_OTHER_NODE", node: "n2" }
      return { ok: true, gameId: "game-1", room: { roomId: "room-p", roomCode: "PARTY1" } }
    },
  })
  setSocket(socket)
  const ctx = {
    awaitPartyRef: { current: true },
    endedIdRef: { current: "game-1" },
    partyBusyRef: { current: false },
    applyGenRef: { current: 0 },
    mountedRef: { current: true },
    setSyncStatus: () => {},
  }
  renderHook(() => usePartyRejoin(ctx, socket, "game-1", true, () => {}))
  await act(async () => { await flush(); await flush() })

  assert.ok(partyAnswers >= 2, "옮긴 뒤 다시 물음")
  const joins = socket.emitted.filter((entry) => entry.event === "join_room_by_code")
  assert.equal(joins.length, 1)
  assert.equal(joins[0].node, "n2")

  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n3" }) })
  await act(async () => { await flush() })
  const joinsAfter = socket.emitted.filter((entry) => entry.event === "join_room_by_code")
  assert.equal(joinsAfter.length, 2, "거절 뒤 한 번만 다시")
  assert.equal(joinsAfter[1].node, "n3")
  assert.equal(ctx.partyBusyRef.current, true, "다시 보낸 요청 답 기다리는 중")
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_ON_OTHER_NODE", node: "n2" }) })
  await act(async () => { await flush() })
  assert.equal(socket.count("join_room_by_code"), 2, "두 번째 거절엔 안 옮김")
  assert.equal(ctx.partyBusyRef.current, false)
  cleanup()
  setSocket(null)
})

test("초대 수락: ROOM_ON_OTHER_NODE면 그 Node로 옮겨 수락을 한 번만 다시 보내고 새 연결 기준으로 방 확인", async () => {
  reset()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "user-a" } })
  const room = { roomId: "room-9", roomCode: "INVITE", players: [] }
  const socket = createNodeSocket({
    answer: (event, payload, s) => {
      const onOwner = s.io.opts.query?.node === "n2"
      if (event === "accept_game_invite") return onOwner ? { ok: true, room } : { ok: false, code: "ROOM_ON_OTHER_NODE", node: "n2" }
      if (event === "get_current_room") return { ok: true, room: onOwner ? room : null }
      return { ok: false, code: "UNEXPECTED" }
    },
  })
  setSocket(socket)

  const first = requestGameInviteAccept("invite-1")
  const second = await requestGameInviteAccept("invite-1")
  assert.equal(second.code, "IN_PROGRESS", "옮기는 중 다시 눌러도 두 번 안 감")
  const result = await first

  assert.equal(result.ok, true)
  assert.equal(result.room.roomId, "room-9")
  const accepts = socket.emitted.filter((entry) => entry.event === "accept_game_invite")
  assert.deepEqual(accepts.map((entry) => entry.node), [null, "n2"])
  assert.equal(useGameInviteStore.getState().pendingInviteIds.has("invite-1"), false)
  setSocket(null)
})

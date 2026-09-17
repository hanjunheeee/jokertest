/**
 * F-20(AC-03): 공개 방 목록이 **실제 소켓 교체**를 따라가는지에 대한 회귀.
 *
 * 설정 변경의 마지막 소비처는 이 목록이다. 그런데 목록 훅은 마운트 시점의 소켓 하나에
 * 붙어 있었고, 그 뒤 계정 재연결·재로그인으로 소켓 인스턴스가 **교체되면** 새 소켓의
 * 방송을 구독하지 않았다. 그러면 방장이 정원·입장 방식을 바꿔도 목록은 옛 값에 머물고,
 * 반대로 이미 남이 된 옛 소켓의 늦은 방송·늦은 조회 응답은 그대로 목록을 덮었다.
 *
 * 실제 usePublicRooms를 그대로 마운트한다. 소켓만 대역인데 모듈을 목업하지 않고 **실제
 * socketClient.setSocket**으로 꽂으므로 `--experimental-test-module-mocks` 없이 돈다.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { createElement } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { act, cleanup, renderHook } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../../matching/store/matchingStore.js")
const { usePublicRooms } = await import("../usePublicRooms.js")
const { ROOM_LIST_SOCKET_EVENTS } = await import("../../constants/roomListSocket.js")

/** emitWithAck 응답을 붙잡아 두라는 표식. */
const HOLD = Symbol("hold")

function createFakeSocket(id) {
  const listeners = new Map()
  const socket = {
    id,
    connected: true,
    emitted: [],
    holds: [],
    /** (event, payload) => 응답값 | HOLD. 시험이 매 순간 갈아끼운다. */
    answer: () => HOLD,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    listenerCount(event) { return listeners.get(event)?.size ?? 0 },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    emit(event, payload) { socket.emitted.push({ event, payload }) },
    timeout() { return socket },
    emitWithAck(event, payload) {
      socket.emitted.push({ event, payload })
      return new Promise((resolve, reject) => {
        const result = socket.answer(event, payload)
        if (result === HOLD) { socket.holds.push({ event, resolve, reject }); return }
        resolve(result)
      })
    },
    release(event, value) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.resolve(value)
    },
    countOf(event) { return socket.emitted.filter((entry) => entry.event === event).length },
  }
  return socket
}

/** 목록 응답 한 건. 설정 요약 값(정원·입장 방식)이 실제로 화면까지 오는지 보려고 함께 싣는다. */
function room(id, { current = 1, max = 8, accessType = "open" } = {}) {
  return { id, title: `방 ${id}`, current, max, accessType, status: "waiting" }
}

const wrapper = ({ children }) => createElement(MemoryRouter, null, children)

function mount() {
  return renderHook(() => usePublicRooms(), { wrapper })
}

/** effect·마이크로태스크가 전부 흐르게 한다. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

test.afterEach(() => {
  cleanup()
  setSocket(null)
  alerts.length = 0
  useMatchingStore.getState().clearRoom()
})

test("AC-03 · 소켓이 교체되면 새 소켓으로 목록을 다시 조회하고, 그 소켓의 갱신이 화면까지 온다", async () => {
  const socketA = createFakeSocket("A")
  socketA.answer = () => ({ ok: true, rooms: [room("r1", { max: 8 })] })
  setSocket(socketA)

  const { result } = mount()
  await settle()
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["r1"], "최초 조회가 반영되지 않았다")

  // 계정 재연결로 소켓 인스턴스가 통째로 교체된다.
  const socketB = createFakeSocket("B")
  socketB.answer = () => ({ ok: true, rooms: [room("r1", { max: 6 }), room("r2")] })
  await act(async () => { setSocket(socketB) })
  await settle()

  assert.equal(socketB.countOf(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS), 1,
    "교체된 소켓으로 목록을 다시 조회하지 않았다")
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["r1", "r2"])
  assert.equal(result.current.rooms[0].max, 6, "새 소켓의 조회 결과가 반영되지 않았다")

  // 새 소켓의 설정 변경 방송이 실제로 화면 데이터까지 와야 한다.
  await act(async () => {
    socketB.trigger(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED,
      { rooms: [room("r1", { max: 10, accessType: "code" })] })
  })
  assert.equal(result.current.rooms.length, 1)
  assert.equal(result.current.rooms[0].max, 10, "교체된 소켓의 방송이 목록에 닿지 않았다")
  assert.equal(result.current.rooms[0].accessType, "code")
})

test("AC-03 · 교체된 옛 소켓의 늦은 조회 응답과 늦은 방송은 현재 목록을 덮지 못한다", async () => {
  const socketA = createFakeSocket("A")
  socketA.answer = () => HOLD // 최초 조회를 붙잡아 둔다.
  setSocket(socketA)

  const { result } = mount()
  await settle()
  assert.equal(socketA.countOf(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS), 1)

  const socketB = createFakeSocket("B")
  socketB.answer = () => ({ ok: true, rooms: [room("new", { max: 6 })] })
  await act(async () => { setSocket(socketB) })
  await settle()
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["new"])

  // (a) 옛 소켓의 방송. React가 cleanup을 실행하기 **전**에도 도착할 수 있는 구간이라,
  //     리스너 해제만으로는 막히지 않는다 — 방송을 받은 쪽이 자기 출처를 확인해야 한다.
  await act(async () => {
    socketA.trigger(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED,
      { rooms: [room("stale-broadcast", { max: 10 })] })
  })
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["new"],
    "남이 된 옛 소켓의 방송이 현재 목록을 덮었다")

  // (b) 옛 소켓이 붙잡고 있던 조회 응답이 이제야 도착한다.
  await act(async () => {
    socketA.release(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS,
      { ok: true, rooms: [room("stale-ack", { max: 10 })] })
    await Promise.resolve()
  })
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["new"],
    "옛 소켓의 늦은 조회 응답이 현재 목록을 덮었다")
})

test("AC-03 · 소켓이 나중에 생겨도 폴링 없이 곧바로 붙어 조회한다", async () => {
  setSocket(null)
  const { result } = mount()
  await settle()
  assert.deepEqual(result.current.rooms, [], "소켓이 없는데 목록이 생겼다")

  const socket = createFakeSocket("late")
  socket.answer = () => ({ ok: true, rooms: [room("r1")] })
  await act(async () => { setSocket(socket) })
  await settle()

  assert.equal(socket.countOf(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS), 1,
    "나중에 생긴 소켓으로 조회하지 않았다")
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["r1"])
})

test("AC-03 · 같은 소켓의 재연결은 그대로 목록을 다시 조회한다", async () => {
  const socket = createFakeSocket("A")
  socket.answer = () => ({ ok: true, rooms: [room("r1")] })
  setSocket(socket)

  const { result } = mount()
  await settle()
  assert.equal(socket.countOf(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS), 1)

  socket.answer = () => ({ ok: true, rooms: [room("r1"), room("r2")] })
  await act(async () => { socket.trigger("connect") })
  await settle()

  assert.equal(socket.countOf(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS), 2,
    "같은 소켓의 재연결이 목록을 다시 조회하지 않았다")
  assert.deepEqual(result.current.rooms.map((r) => r.id), ["r1", "r2"])
})

test("AC-03 · 소켓이 교체되면 자기 소켓의 리스너만 걷고 입장 잠금을 남기지 않는다", async () => {
  const socketA = createFakeSocket("A")
  socketA.answer = () => ({ ok: true, rooms: [room("r1")] })
  setSocket(socketA)

  const { result } = mount()
  await settle()

  // 옛 소켓으로 입장을 요청해 잠금이 걸린 상태를 만든다.
  await act(async () => { result.current.joinPublicRoom("r1") })
  assert.equal(result.current.isJoining, true)
  assert.equal(socketA.countOf(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM), 1)

  const socketB = createFakeSocket("B")
  socketB.answer = () => ({ ok: true, rooms: [room("r1")] })
  await act(async () => { setSocket(socketB) })
  await settle()

  assert.equal(result.current.isJoining, false,
    "소켓이 교체됐는데 옛 소켓에 걸린 입장 잠금이 남았다")
  for (const event of Object.values(ROOM_LIST_SOCKET_EVENTS)) {
    assert.equal(socketA.listenerCount(event), 0, `옛 소켓의 ${event} 리스너가 남았다`)
  }
  assert.equal(socketA.listenerCount("connect"), 0, "옛 소켓의 connect 리스너가 남았다")

  // 새 소켓에서는 입장이 정상적으로 다시 동작한다(잠금을 풀어 막아 둔 것이 아니다).
  await act(async () => { result.current.joinPublicRoom("r1") })
  assert.equal(socketB.countOf(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM), 1)
  assert.equal(result.current.isJoining, true)
})

test("AC-03 · 입장 성공·실패는 그대로 동작한다", async () => {
  const socket = createFakeSocket("A")
  socket.answer = () => ({ ok: true, rooms: [room("r1")] })
  setSocket(socket)

  const { result } = mount()
  await settle()

  // 실패: 잠금이 풀리고 안내가 뜬다.
  await act(async () => { result.current.joinPublicRoom("r1") })
  await act(async () => {
    socket.trigger(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, { message: "정원이 가득 찼습니다." })
  })
  assert.equal(result.current.isJoining, false)
  assert.deepEqual(alerts, ["정원이 가득 찼습니다."])

  // 성공: 잠금이 풀리고 matchingStore에 방이 들어간다.
  await act(async () => { result.current.joinPublicRoom("r1") })
  await act(async () => {
    socket.trigger(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED,
      { roomId: "r1", roomCode: "ABCD12", hostUuid: "host-a", players: [], settingsVersion: 1 })
  })
  assert.equal(result.current.isJoining, false)
  assert.equal(useMatchingStore.getState().roomId, "r1")
})

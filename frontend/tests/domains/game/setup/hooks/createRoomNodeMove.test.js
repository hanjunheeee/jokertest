// 방 만들기 Node 이동 시험 (MN-114): 비우는 중인 서버가 ROOM_ON_OTHER_NODE로 답하면 그 Node로 옮긴 뒤 한 번만 다시 보냄
// 데스크톱·모바일 같은 훅(useCreateRoom), 단일 서버 거절은 예전 그대로 알림
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

const { act, renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { setNodeHintAccount } = await import("../../../../../src/shared/socket/nodeHint.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useCreateRoom } = await import("../../../../../src/domains/game/setup/hooks/useCreateRoom.js")
const { NODE_MOVE_MESSAGES } = await import("../../../../../src/shared/constants/connectionSocket.js")

// 가짜 소켓: connect()하면 다음 차례에 connect 사건(id도 바뀜), answer(n번째, 지금 node)로 방 만들기 답
function createNodeSocket(answer) {
  const listeners = new Map()
  let seq = 0
  const socket = {
    id: "n1-0",
    connected: true,
    io: { opts: {} },
    creates: [],
    disconnectCount: 0,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      if (event !== "create_room") return new Promise(() => {})
      const node = socket.io.opts.query?.node ?? null
      socket.creates.push({ payload, node })
      return Promise.resolve(answer(socket.creates.length, node))
    },
    disconnect() { socket.disconnectCount += 1; socket.connected = false },
    connect() {
      queueMicrotask(() => {
        seq += 1
        socket.id = `${socket.io.opts.query?.node ?? "any"}-${seq}`
        socket.connected = true
        for (const handler of [...(listeners.get("connect") ?? [])]) handler()
      })
    },
  }
  return socket
}

const ROOM = { roomId: "r1", roomCode: "ABC123", players: [], hostUuid: "user-a" }
const moveAnswer = (node = "n2") => ({ ok: false, code: "ROOM_ON_OTHER_NODE", node, message: "다른 서버로 옮겨 방을 만듭니다." })

// 훅 띄우고 방 만들기 한 번 → { socket, navigations }
async function runCreate(answer) {
  alerts.length = 0
  globalThis.sessionStorage.clear()
  act(() => {
    useAuthStore.setState({ user: { uuid: "user-a" }, isLoggedIn: true })
    useMatchingStore.getState().clearRoom()
  })
  setNodeHintAccount("user-a")
  const socket = createNodeSocket(answer)
  setSocket(socket)
  const navigations = []
  const identityGeneration = useAuthStore.getState().identityGeneration
  const { result } = renderHook(() => useCreateRoom({
    navigate: (to) => navigations.push(to), accountId: "user-a", identityGeneration,
  }))
  await act(async () => { await result.current.createGame({ maxPlayers: 8 }) })
  cleanup()
  setSocket(null)
  return { socket, navigations, isBusy: result.current.isBusy() }
}

test("MN-114 화면: ROOM_ON_OTHER_NODE면 n2로 옮긴 뒤 한 번 다시 보내고, 만든 방으로 감", async () => {
  const { socket, navigations, isBusy } = await runCreate((n) => (n === 1 ? moveAnswer() : { ok: true, room: ROOM }))
  assert.deepEqual(socket.creates.map((c) => c.node), [null, "n2"])
  assert.deepEqual(socket.creates[1].payload, { maxPlayers: 8 })
  assert.equal(socket.disconnectCount, 1)
  assert.deepEqual(navigations, ["/game-matching"])
  assert.equal(useMatchingStore.getState().roomId, "r1")
  assert.deepEqual(alerts, [])
  assert.equal(isBusy, false)
  assert.equal(JSON.parse(globalThis.sessionStorage.getItem("mmc.node")).node, "n2")
})

test("MN-114 화면: 옮긴 뒤에도 또 옮기라면 더 안 보내고 안내 (한 번만 다시)", async () => {
  const { socket, navigations } = await runCreate((n) => moveAnswer(n === 1 ? "n2" : "n3"))
  assert.equal(socket.creates.length, 2)
  assert.equal(socket.disconnectCount, 1)
  assert.deepEqual(navigations, [])
  assert.deepEqual(alerts, [NODE_MOVE_MESSAGES.ROOM_ON_OTHER_NODE])
})

test("단일 서버 거절(code 없음)은 예전처럼 이유 알림, 옮기지 않음", async () => {
  const { socket } = await runCreate(() => ({ ok: false, message: "이미 참여 중인 방이 있습니다." }))
  assert.equal(socket.creates.length, 1)
  assert.equal(socket.disconnectCount, 0)
  assert.deepEqual(alerts, ["이미 참여 중인 방이 있습니다."])
})

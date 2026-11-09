// Node 이동(조각 5) 화면 공용 소켓 시험: 힌트 붙여 연결·WRONG_NODE 따라가기·3번 넘으면 힌트 버림·로그아웃 때 힌트 지움·moveToNode
// 가짜 socket.io-client로 봄 (진짜 socket.io 동작은 scratchpad 실측 스크립트로 따로 확인함)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" })
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MutationObserver: dom.window.MutationObserver,
  sessionStorage: dom.window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

mock.module("../../../src/shared/env.js", { namedExports: { API_BASE_URL: "http://test-api.local" } })
mock.module("../../../src/shared/api/client.js", { namedExports: { refreshAccessToken: async () => true } })

// 가짜 socket.io: io(url, opts) 기록, 소켓은 io.opts(진짜처럼 접속 때 query를 읽는 칸)와 connect 때 query.node 기록
const created = []
function createIoSocket(opts) {
  const listeners = new Map()
  const socket = {
    id: `s${created.length + 1}`,
    io: { opts: { ...opts } },
    connectCalls: [],
    disconnectCount: 0,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      if (handler) listeners.get(event)?.delete(handler)
      else listeners.delete(event)
    },
    connect() { socket.connectCalls.push(socket.io.opts.query?.node ?? null) },
    disconnect() { socket.disconnectCount += 1 },
    fire(event, ...args) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(...args)
    },
  }
  return socket
}
mock.module("socket.io-client", {
  namedExports: {
    io: (url, opts) => {
      const socket = createIoSocket(opts)
      created.push({ url, opts, socket })
      return socket
    },
  },
})

const authState = { isLoggedIn: false, user: null, logout: () => { authState.isLoggedIn = false } }
mock.module("../../../src/domains/auth/store/auth.store.js", {
  namedExports: { useAuthStore: (selector) => selector(authState) },
})

const { act, renderHook } = await import("@testing-library/react")
const { useSocket } = await import("../../../src/shared/hooks/useSocket.js")
const { setSocket } = await import("../../../src/shared/socket/socketClient.js")
const { moveToNode, nodeToMoveTo } = await import("../../../src/shared/socket/nodeMove.js")
const { setNodeHintAccount, saveNodeHint, readNodeHint } = await import("../../../src/shared/socket/nodeHint.js")
const { NODE_BOUNCE_RETRY_MS } = await import("../../../src/shared/constants/connectionSocket.js")

const HINT_KEY = "mmc.node"
const wrongNode = (node) => Object.assign(new Error("WRONG_NODE"), { data: { node } })
const storedHint = () => JSON.parse(globalThis.sessionStorage.getItem(HINT_KEY) ?? "null")

function signIn(uuid) {
  authState.isLoggedIn = true
  authState.user = { uuid }
}

function reset() {
  created.length = 0
  globalThis.sessionStorage.clear()
  setNodeHintAccount(null)
  authState.isLoggedIn = false
  authState.user = null
}

test("단일 서버 그대로: 힌트가 없으면 ?node 없이 연결하고, WRONG_NODE가 안 오면 다시 붙기·힌트 쓰기 없음", async () => {
  reset()
  signIn("user-a")
  const hook = renderHook(() => useSocket())
  await act(async () => {})

  assert.equal(created.length, 1)
  assert.equal("query" in created[0].opts, false, "힌트 없으면 연결 옵션이 예전과 같아야 함")
  assert.deepEqual(created[0].opts, { withCredentials: true, transports: ["websocket"] })

  act(() => { created[0].socket.fire("connect_error", new Error("transport error")) })
  assert.deepEqual(created[0].socket.connectCalls, [])
  assert.equal(globalThis.sessionStorage.getItem(HINT_KEY), null)
  hook.unmount()
})

test("WRONG_NODE면 같은 소켓에 ?node=n2를 넣고 바로 다시 붙으며, 힌트를 이 계정 것으로 남김", async () => {
  reset()
  signIn("user-a")
  const hook = renderHook(() => useSocket())
  await act(async () => {})
  const { socket } = created[0]

  act(() => { socket.fire("connect_error", wrongNode("n2")) })
  assert.deepEqual(socket.connectCalls, ["n2"], "알려 준 Node로 한 번 다시 붙음")
  assert.equal(socket.io.opts.query.node, "n2")
  assert.deepEqual(storedHint(), { uuid: "user-a", node: "n2" })
  assert.equal(created.length, 1, "새 소켓을 만들지 않음 (구독자 그대로)")
  hook.unmount()
})

test("다시 열 때 이 계정 힌트면 처음부터 ?node로, 다른 계정 힌트는 안 씀", async () => {
  reset()
  globalThis.sessionStorage.setItem(HINT_KEY, JSON.stringify({ uuid: "user-a", node: "n3" }))
  signIn("user-a")
  let hook = renderHook(() => useSocket())
  await act(async () => {})
  assert.deepEqual(created[0].opts.query, { node: "n3" })
  hook.unmount()

  created.length = 0
  signIn("user-b")
  hook = renderHook(() => useSocket())
  await act(async () => {})
  assert.equal("query" in created[0].opts, false, "다른 계정 힌트로 가면 안 됨")
  hook.unmount()
})

test("30초에 3번 넘게 튕기면 힌트를 버리고 아무 Node로 한 번, 그 뒤 또 튕기면 5초 쉬고 붙음 (고리 없음)", async (t) => {
  reset()
  signIn("user-a")
  const hook = renderHook(() => useSocket())
  await act(async () => {})
  const { socket } = created[0]

  for (const node of ["n2", "n3", "n2"]) act(() => { socket.fire("connect_error", wrongNode(node)) })
  assert.deepEqual(socket.connectCalls, ["n2", "n3", "n2"])
  assert.equal(storedHint()?.node, "n2")

  act(() => { socket.fire("connect_error", wrongNode("n3")) })
  assert.deepEqual(socket.connectCalls, ["n2", "n3", "n2", null], "4번째는 ?node 없이 그냥 접속")
  assert.equal(globalThis.sessionStorage.getItem(HINT_KEY), null, "힌트 버림")
  assert.equal("node" in socket.io.opts.query, false)

  t.mock.timers.enable({ apis: ["setTimeout"] })
  act(() => { socket.fire("connect_error", wrongNode("n2")) })
  assert.equal(socket.connectCalls.length, 4, "한도 넘은 뒤엔 바로 다시 붙지 않음")
  t.mock.timers.tick(NODE_BOUNCE_RETRY_MS)
  assert.deepEqual(socket.connectCalls.slice(4), [null], "쉬고 나서 아무 Node로 한 번")
  t.mock.timers.reset()
  hook.unmount()
})

test("쉬는 중에 정리(로그아웃)되면 늦게 다시 붙지 않음", async (t) => {
  reset()
  signIn("user-a")
  const hook = renderHook(() => useSocket())
  await act(async () => {})
  const { socket } = created[0]
  t.mock.timers.enable({ apis: ["setTimeout"] })
  for (let i = 0; i < 5; i += 1) act(() => { socket.fire("connect_error", wrongNode("n2")) })
  const before = socket.connectCalls.length
  hook.unmount()
  t.mock.timers.tick(NODE_BOUNCE_RETRY_MS * 2)
  assert.equal(socket.connectCalls.length, before)
  t.mock.timers.reset()
})

test("로그아웃(로그인 → 로그아웃)하면 Node 힌트를 지움", async () => {
  reset()
  signIn("user-a")
  const hook = renderHook(() => useSocket())
  await act(async () => {})
  act(() => { created[0].socket.fire("connect_error", wrongNode("n2")) })
  assert.equal(storedHint()?.node, "n2")

  authState.isLoggedIn = false
  authState.user = null
  hook.rerender()
  await act(async () => {})
  assert.equal(globalThis.sessionStorage.getItem(HINT_KEY), null)
  assert.equal(readNodeHint(), null)
  hook.unmount()
})

test("moveToNode: 같은 Socket 객체에 query만 바꿔 끊고 다시 붙고, connect가 오면 풀림 · 같은 Node 두 번이면 한 번만 옮김", async () => {
  reset()
  setNodeHintAccount("user-a")
  const socket = createIoSocket({ withCredentials: true })
  setSocket(socket)

  const first = moveToNode("n2")
  const second = moveToNode("n2")
  assert.equal(first, second, "옮기는 중 같은 Node면 같은 약속")
  assert.equal(socket.disconnectCount, 1)
  assert.deepEqual(socket.connectCalls, ["n2"])
  assert.deepEqual(storedHint(), { uuid: "user-a", node: "n2" })

  socket.fire("connect")
  assert.equal(await first, socket)
  setSocket(null)
})

test("moveToNode: 시간 안에 안 붙거나 소켓이 바뀌면 거절, 이상한 Node 이름은 안 옮김", async () => {
  reset()
  const socket = createIoSocket({})
  setSocket(socket)
  await assert.rejects(moveToNode("n2", 5), /NODE_MOVE_TIMEOUT/)
  await assert.rejects(moveToNode("../evil"), /BAD_NODE/)
  assert.equal(socket.disconnectCount, 1, "이상한 이름이면 끊지도 않음")

  const pending = moveToNode("n4")
  setSocket(null)
  await assert.rejects(pending, /SOCKET_REPLACED/)
})

test("nodeToMoveTo: ROOM_ON_OTHER_NODE + 맞는 node만 이동 대상, 나머지 코드는 null", () => {
  assert.equal(nodeToMoveTo({ code: "ROOM_ON_OTHER_NODE", node: "n2" }), "n2")
  assert.equal(nodeToMoveTo({ code: "ROOM_ON_OTHER_NODE" }), null)
  assert.equal(nodeToMoveTo({ code: "ROOM_FULL", node: "n2" }), null)
  assert.equal(nodeToMoveTo({ code: "NODE_UNAVAILABLE" }), null)
  assert.equal(nodeToMoveTo(undefined), null)
})

test("힌트는 계정을 모르면 안 남김", () => {
  reset()
  saveNodeHint("n2")
  assert.equal(globalThis.sessionStorage.getItem(HINT_KEY), null)
})

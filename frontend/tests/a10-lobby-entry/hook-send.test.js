// 화면 상태 시험: 로비 입장 훅이 enter_lobby를 언제 몇 번 보내나 (열 때 한 번·다시 그려도 안 보냄·소켓 생김/바뀜 때 다시·방 만들기보다 먼저)
// 목록 A10-F-001~004·032·034 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/hook-send.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const K = await import("./a10Kit.mjs")
const { React, RTL } = K
const { useLobbyEntryCleanup } = await import("../../src/domains/game/shared/hooks/useLobbyEntryCleanup.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { default: GameSetupPage } = await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")

const h = React.createElement
test.afterEach(() => K.resetAll())

// 훅만 쓰는 작은 화면, 단추를 누르면 다시 그려짐
function Probe() {
  useLobbyEntryCleanup()
  const [n, setN] = React.useState(0)
  return h("button", { type: "button", onClick: () => setN(n + 1) }, `다시 그리기 ${n}`)
}

function openLobby() {
  return K.mountRoutes([
    { path: "/lobby", element: h(Probe) },
    { path: "*", element: h("p", null, "다른 곳") },
  ], ["/lobby"])
}

const redraw = () => RTL.fireEvent.click(RTL.screen.getByRole("button", { name: /다시 그리기/ }))

test("A10-F-001 화면이 열리면 enter_lobby 한 번, 값은 {}", async () => {
  K.signIn()
  const socket = K.useFakeSocket()
  openLobby()
  await K.flush()
  assert.equal(socket.countOf("enter_lobby"), 1)
  assert.deepEqual(socket.payloadsOf("enter_lobby")[0], {})
})

test("A10-F-002 같은 화면 다시 그리기 3번 → enter_lobby 여전히 1개", async () => {
  K.signIn()
  const socket = K.useFakeSocket()
  openLobby()
  await K.flush()
  for (let i = 0; i < 3; i += 1) redraw()
  await K.flush()
  assert.equal(RTL.screen.getByRole("button").textContent, "다시 그리기 3")
  assert.equal(socket.countOf("enter_lobby"), 1)
})

test("A10-F-003 소켓 없음 → 0개, 소켓 생김 → 1개", async () => {
  K.signIn()
  openLobby()
  await K.flush()
  const socket = K.createFakeSocket()
  assert.equal(socket.countOf("enter_lobby"), 0)
  await RTL.act(async () => { setSocket(socket) })
  await K.flush()
  assert.equal(socket.countOf("enter_lobby"), 1)
})

test("A10-F-004 소켓 A로 1개 → 새 소켓 B로 바뀜 → B도 1개 받음", async () => {
  K.signIn()
  const a = K.useFakeSocket({ id: "A" })
  openLobby()
  await K.flush()
  assert.equal(a.countOf("enter_lobby"), 1)
  const b = K.createFakeSocket({ id: "B" })
  await RTL.act(async () => { setSocket(b) })
  await K.flush()
  assert.equal(b.countOf("enter_lobby"), 1)
  assert.equal(a.countOf("enter_lobby"), 1)
})

test("A10-F-032 정리 답 받은 뒤 다시 그리기 → enter_lobby 여전히 1개", async () => {
  K.signIn()
  K.putRoom()
  const socket = K.useFakeSocket()
  socket.answer("enter_lobby", { ok: true, redirect: null, gameId: null, cleared: { liveGame: false, endedGame: false, pending: false, room: true } })
  openLobby()
  await K.flush()
  assert.equal(K.roomState().isInRoom, false)
  redraw()
  redraw()
  await K.flush()
  assert.equal(socket.countOf("enter_lobby"), 1)
})

test("A10-F-034 게임 설정 화면 열림 직후 방 만들기 → 서버가 받은 차례 enter_lobby → create_room", async () => {
  K.signIn("host", "방장")
  K.installDialogs(dom)
  const socket = K.useFakeSocket()
  socket.answer("create_room", K.HOLD)
  const view = K.mountRoutes([
    { path: "/game-setup", element: h(GameSetupPage) },
    { path: "*", element: h("p", null, "다른 곳") },
  ], ["/game-setup"])
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "게임 만들기" }))
  await K.waitUntil(() => socket.countOf("create_room") === 1, { what: "create_room 보냄" })
  assert.deepEqual(socket.order().filter((e) => e === "enter_lobby" || e === "create_room"), ["enter_lobby", "create_room"])
  assert.equal(view.path(), "/game-setup")
})

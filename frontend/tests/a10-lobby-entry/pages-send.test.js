// 화면 부품 시험: 어느 화면이 열릴 때 enter_lobby를 보내나 (로비·모드·방 목록·게임 설정은 보냄, 대기방·판·결과·코드 입력은 안 보냄)
// 목록 A10-F-201~204·213~220 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/pages-send.test.js

// 진짜 화면을 데이터 라우터로 그림, 목록에 없는 주소는 빈 글 화면으로 둠 (다른 화면이 보낸 것이 안 섞이게)
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const K = await import("./a10Kit.mjs")
const { React, RTL } = K
const PAGES = {
  "/lobby": (await import("../../src/domains/lobby/pages/LobbyPage.jsx")).default,
  "/gameMode": (await import("../../src/domains/game/mode/pages/GameModePage.jsx")).default,
  "/multiplay": (await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")).default,
  "/game-setup": (await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")).default,
  "/game-matching": (await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")).default,
  "/ingame": (await import("../../src/domains/game/ingame/pages/InGamePage.jsx")).default,
  "/gameresult": (await import("../../src/domains/game/result/page/GameResultPage.jsx")).default,
  "/roomInvite": (await import("../../src/domains/game/mode/pages/RoomInvitePage.jsx")).default,
}

const h = React.createElement
test.afterEach(() => K.resetAll())

// paths에 있는 주소만 진짜 화면, 나머지는 빈 글 화면
function openAt(paths, start) {
  const routes = paths.map((path) => ({ path, element: h(PAGES[path]) }))
  routes.push({ path: "*", element: h("p", null, "다른 곳") })
  return K.mountRoutes(routes, [start])
}

function ready({ room = null } = {}) {
  K.signIn("me", "나")
  K.installDialogs(dom)
  const socket = K.useFakeSocket()
  if (room) {
    K.putRoom(room)
    socket.answer("get_current_room", { ok: true, room })
  }
  return socket
}

const go = async (view, to) => {
  await RTL.act(async () => { await view.router.navigate(to) })
  await K.flush()
}

const SENDING = [["A10-F-201", "/lobby"], ["A10-F-202", "/gameMode"], ["A10-F-203", "/multiplay"], ["A10-F-204", "/game-setup"]]
for (const [no, path] of SENDING) {
  test(`${no} ${path} 그림 → enter_lobby 1개`, async () => {
    const socket = ready()
    const view = openAt([path], path)
    await K.flush()
    assert.equal(view.path(), path)
    assert.equal(socket.countOf("enter_lobby"), 1)
  })
}

const SILENT = [["A10-F-213", "/game-matching"], ["A10-F-214", "/ingame"], ["A10-F-215", "/gameresult"], ["A10-F-216", "/roomInvite"]]
for (const [no, path] of SILENT) {
  test(`${no} ${path} 그림 → enter_lobby 0개`, async () => {
    const socket = ready({ room: path === "/game-matching" ? K.roomOf() : null })
    const view = openAt([path], path)
    await K.flush()
    // 화면이 터져 라우터 오류 화면이 뜬 게 아님 (그래야 "안 보냄"이 뜻이 있음)
    assert.equal(view.container.textContent.includes("Unexpected Application Error"), false)
    assert.equal(socket.countOf("enter_lobby"), 0)
  })
}

test("A10-F-217 /multiplay → /game-matching → 뒤로 → /multiplay에서 enter_lobby 1개 더", async () => {
  const room = K.roomOf()
  const socket = ready({ room })
  const view = openAt(["/multiplay", "/game-matching"], "/multiplay")
  await K.flush()
  assert.equal(socket.countOf("enter_lobby"), 1)
  await go(view, "/game-matching")
  assert.equal(view.path(), "/game-matching")
  assert.equal(socket.countOf("enter_lobby"), 1)
  await go(view, -1)
  assert.equal(view.path(), "/multiplay")
  assert.equal(socket.countOf("enter_lobby"), 2)
})

test("A10-F-218 /lobby → /gameMode → /multiplay → /game-setup → enter_lobby 4개", async () => {
  const socket = ready()
  const view = openAt(["/lobby", "/gameMode", "/multiplay", "/game-setup"], "/lobby")
  await K.flush()
  for (const to of ["/gameMode", "/multiplay", "/game-setup"]) await go(view, to)
  assert.equal(view.path(), "/game-setup")
  assert.equal(socket.countOf("enter_lobby"), 4)
})

test("A10-F-219 /multiplay → /roomInvite → enter_lobby 1개 그대로", async () => {
  const socket = ready()
  const view = openAt(["/multiplay", "/roomInvite"], "/multiplay")
  await K.flush()
  await go(view, "/roomInvite")
  assert.equal(view.path(), "/roomInvite")
  assert.equal(socket.countOf("enter_lobby"), 1)
})

test("A10-F-220 /game-matching 주소로 바로 옴 → get_current_room 1개, enter_lobby 0개", async () => {
  const socket = ready()
  socket.answer("get_current_room", { ok: true, room: null })
  openAt(["/game-matching"], "/game-matching")
  await K.flush()
  assert.equal(socket.countOf("get_current_room"), 1)
  assert.equal(socket.countOf("enter_lobby"), 0)
})

// 화면 부품 시험: 같은 브라우저 새 창에 밀려난 옛 창 — 대기방 "참가자 추방" 꺼짐과 까닭 글, 로비로 가도 enter_lobby를 안 보냄
// 목록 A10-F-221·222 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/stale-tab.test.js

// 앱 소켓 훅(useSocket)을 진짜로 켜고 socket.io 연결 함수만 가짜로 바꿈, 서버는 밀어낸 뒤 그 소켓을 끊음(replace.js kickLocal)
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"
import { made, useSocketFactory } from "./ioMock.mjs"

const K = await import("./a10Kit.mjs")
const { React, RTL } = K
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: LobbyPage } = await import("../../src/domains/lobby/pages/LobbyPage.jsx")

useSocketFactory(K.createFakeSocket)
const h = React.createElement
test.afterEach(() => K.resetAll())

// 앱처럼: 소켓 훅 + 라우터 (대기방·로비)
function Shell({ children }) {
  useSocket()
  return children
}

// 방장으로 5명 대기방을 연 옛 창
async function openWaitingRoomAsHost() {
  K.signIn("me", "나")
  const box = K.installDialogs(dom)
  const room = K.roomOf({ n: 5, max: 6, host: "me" })
  K.putRoom(room)
  useSocketFactory((opts) => K.createFakeSocket(opts).answer("get_current_room", { ok: true, room }))
  const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
  const router = createMemoryRouter([
    { path: "/game-matching", element: h(GameMatchingPage) },
    { path: "/lobby", element: h(LobbyPage) },
    { path: "*", element: h("p", null, "다른 곳") },
  ], { initialEntries: ["/game-matching"] })
  RTL.render(h(Shell, null, h(RouterProvider, { router })))
  await K.flush()
  const socket = made.at(-1)
  return { socket, router, box }
}

const kickButton = () => RTL.screen.queryByRole("button", { name: "참가자 추방" })

// 새 창이 밀어냄: 까닭 알림 → 서버가 끊음
async function pushedOutBySameBrowser(socket) {
  await RTL.act(async () => {
    socket.serverSays("force_disconnect", { code: "REPLACED_BY_SAME_SESSION", message: "같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다." })
    socket.serverDisconnects()
  })
  await K.flush()
}

test("A10-F-221 방장 대기방 + REPLACED_BY_SAME_SESSION → \"참가자 추방\" 꺼짐 + 까닭 글이 화면 글로 있음", async () => {
  const { socket } = await openWaitingRoomAsHost()
  assert.equal(kickButton().disabled, false, "밀리기 전엔 켜짐")
  await pushedOutBySameBrowser(socket)
  assert.equal(kickButton().disabled, true)
  const reasonId = kickButton().getAttribute("aria-describedby")
  assert.ok(reasonId, "단추에 까닭 글이 이어짐")
  const reason = document.getElementById(reasonId)
  assert.ok(reason && reason.textContent.trim().length > 0, "까닭 글이 화면에 있음")
  // 끊긴 창이니 "방 정보를 확인하는 중" 글이 아니라 끊김 글이어야 함
  assert.equal(reason.textContent, "서버와 연결되어 있지 않아 추방할 수 없습니다.")
})

test("A10-F-222 같은 창 밀림 뒤 /lobby로 이동 → 서버가 받은 enter_lobby 0개", async () => {
  const { socket, router } = await openWaitingRoomAsHost()
  await pushedOutBySameBrowser(socket)
  await RTL.act(async () => { await router.navigate("/lobby") })
  await K.flush()
  assert.equal(router.state.location.pathname, "/lobby")
  assert.equal(socket.countOf("enter_lobby"), 0)
  assert.equal(made.at(-1) === socket, true, "새 소켓도 안 만듦")
})

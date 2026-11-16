// 화면 부품 시험: 로비·모드·방 목록·게임 설정 화면이 로비 입장 답을 받으면 (판으로 되돌림 → /ingame, 정리 → 화면 그대로·방 정보 빔)
// 목록 A10-F-205~212 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/pages-reply.test.js

// 같은 판 10초 막기가 파일 안에서 이어져서 되돌림 시험마다 판 id를 다르게 줌
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const K = await import("./a10Kit.mjs")
const { React } = K
const PAGES = {
  "/lobby": (await import("../../src/domains/lobby/pages/LobbyPage.jsx")).default,
  "/gameMode": (await import("../../src/domains/game/mode/pages/GameModePage.jsx")).default,
  "/multiplay": (await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")).default,
  "/game-setup": (await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")).default,
}

const h = React.createElement
test.afterEach(() => K.resetAll())

function openPage(path, reply) {
  K.signIn("me", "나")
  K.installDialogs(dom)
  const socket = K.useFakeSocket()
  socket.answer("enter_lobby", reply)
  return K.mountRoutes([
    { path, element: h(PAGES[path]) },
    { path: "/ingame", element: h("p", null, "판 화면") },
    { path: "*", element: h("p", null, "다른 곳") },
  ], [path])
}

const REDIRECT = [["A10-F-205", "/lobby"], ["A10-F-206", "/gameMode"], ["A10-F-207", "/multiplay"], ["A10-F-208", "/game-setup"]]
for (const [no, path] of REDIRECT) {
  test(`${no} ${path} + 답 INGAME → 주소 /ingame`, async () => {
    const view = openPage(path, { ok: true, redirect: "INGAME", gameId: `g-${no}`, cleared: { liveGame: false, endedGame: false, pending: false, room: false } })
    await K.flush()
    assert.equal(view.path(), "/ingame")
  })
}

const CLEANUP = [["A10-F-209", "/lobby"], ["A10-F-210", "/gameMode"], ["A10-F-211", "/multiplay"], ["A10-F-212", "/game-setup"]]
for (const [no, path] of CLEANUP) {
  test(`${no} ${path} + 방 스토어 값 + 정리 답 → 화면 그대로·방 스토어 빔`, async () => {
    K.putRoom(K.roomOf({ roomId: "r1" }))
    const view = openPage(path, { ok: true, redirect: null, gameId: null, cleared: { liveGame: false, endedGame: false, pending: false, room: true } })
    await K.flush()
    assert.equal(view.path(), path)
    assert.deepEqual(K.roomState(), { roomId: null, isInRoom: false })
  })
}

// 화면 부품 시험: 서버가 꺼지기 직전 보내는 server_shutdown을 받으면 안내 글 한 번, 로그아웃 안 됨
// 목록 A18-F-210 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-connection/shutdown-notice.test.js

// 앱 소켓 훅(useSocket)을 진짜로 켜고 socket.io 연결 함수만 가짜로 바꿈
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"
import { made, useSocketFactory, catchPageMoves } from "../a10-lobby-entry/ioMock.mjs"

const K = await import("../a10-lobby-entry/a10Kit.mjs")
const { React, RTL } = K
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

useSocketFactory(K.createFakeSocket)
test.afterEach(() => K.resetAll())

function Shell() {
  useSocket()
  return null
}

test("A18-F-210 server_shutdown 받음 → 안내 글 \"서버 점검·업데이트로…\" 한 번, 로그인 상태 그대로", async () => {
  K.signIn("me", "나")
  const box = K.installDialogs(dom)
  RTL.render(React.createElement(Shell))
  await K.flush()
  const socket = made.at(-1)
  assert.ok(socket, "앱 소켓 만듦")
  let moves = []
  await RTL.act(async () => {
    moves = catchPageMoves(() => socket.serverSays("server_shutdown", { code: "SERVER_SHUTDOWN", message: "서버가 곧 재시작됩니다." }))
  })
  await K.flush()
  assert.deepEqual(box.alerts, ["서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요."])
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  assert.deepEqual(moves, [], "로그인 화면으로 안 감")
})

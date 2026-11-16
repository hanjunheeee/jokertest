// 화면 상태 시험: 정지 안내가 http 정지 답·소켓 강제 끊김 두 길로 같이 와도 한 번만, 다른 강제 끊김 안내는 그대로
// 목록 A11-F-940~943 (A11a 목록 "세션 끊김 까닭으로 더한 것"), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/a11e-ban-notice-once.test.js

// 앱 소켓 훅(useSocket)을 그대로 그리고 socket.io 연결 함수만 가짜로 바꿈, http 쪽은 앱이 등록하는 401·정지 처리 함수를 그대로 부름
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"
import { made, useSocketFactory as installSocketFactory, catchPageMoves } from "./ioMock.mjs"

const K = await import("./a10Kit.mjs")
const { React, RTL } = K
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { handleAuthUnauthorized } = await import("../../src/domains/auth/api/unauthorized.js")

installSocketFactory(K.createFakeSocket)
const h = React.createElement
// 로그인 뒤 화면(로비)에 있는 것으로 (공개 화면이면 http 처리가 이동 대신 오류를 던짐)
test.beforeEach(() => dom.reconfigure({ url: "http://localhost/lobby" }))
test.afterEach(() => {
  K.resetAll()
  dom.reconfigure({ url: "http://localhost/" })
})

const BAN_TEXT = "정지된 계정입니다. 사유: 시험 정지"

function Shell() {
  useSocket()
  return null
}

// 로그인한 채 앱 소켓 훅을 켬 → 훅이 만든 가짜 소켓
async function connect() {
  K.signIn("me", "나")
  const box = K.installDialogs(dom)
  const before = made.length
  RTL.render(h(Shell))
  await K.flush()
  assert.equal(made.length, before + 1, "소켓 하나 만듦")
  return { socket: made.at(-1), box }
}

// http 공통 처리 하나 (응답 본문 그대로), 공개 화면에서 던지는 오류는 여기선 안 봄
function httpSays(errorData) {
  handleAuthUnauthorized(errorData).catch(() => {})
}

// 같은 차례에 일이 여럿 (화면이 다시 그려지기 전 = 소켓 받기가 아직 붙어 있는 때) → 그 사이 가려 한 주소 모음
async function sameTurn(...steps) {
  let moves = []
  await RTL.act(async () => { moves = catchPageMoves(() => { for (const step of steps) step() }) })
  return moves
}

test("A11-F-940 http 정지 403이 먼저 알림·로그아웃 → 같은 차례 소켓 ACCOUNT_BANNED → 알림 1번, /login", async () => {
  const { socket, box } = await connect()
  const moves = await sameTurn(
    () => httpSays({ code: "ACCOUNT_BANNED", message: BAN_TEXT }),
    () => socket.serverSays("force_disconnect", { code: "ACCOUNT_BANNED", message: BAN_TEXT }),
  )
  assert.deepEqual(box.alerts, [BAN_TEXT])
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.ok(moves.length >= 1 && moves.every((to) => to === "/login"), `이동: ${moves}`)
})

test("A11-F-941 소켓 ACCOUNT_BANNED가 먼저 알림·로그아웃 → 같은 차례 http 정지 403 → 알림 1번, /login", async () => {
  const { socket, box } = await connect()
  const moves = await sameTurn(
    () => socket.serverSays("force_disconnect", { code: "ACCOUNT_BANNED", message: BAN_TEXT }),
    () => httpSays({ code: "ACCOUNT_BANNED", message: BAN_TEXT }),
  )
  assert.deepEqual(box.alerts, [BAN_TEXT])
  assert.ok(moves.length >= 1 && moves.every((to) => to === "/login"), `이동: ${moves}`)
})

// http 401(세션 끊김)은 알림 없이 로그아웃만 함 → 소켓 안내가 유일한 안내라 사라지면 안 됨
const OTHER_CASES = [
  ["A11-F-942", "REPLACED_BY_OTHER_LOGIN", "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다."],
  ["A11-F-943", "SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해주세요."],
]
for (const [no, code, message] of OTHER_CASES) {
  test(`${no} http 401로 알림 없이 로그아웃된 뒤 같은 차례 소켓 ${code} → 소켓 알림 그대로 1번`, async () => {
    const { socket, box } = await connect()
    await sameTurn(
      () => httpSays({ success: false, message: "세션이 만료되었습니다. 다시 로그인해주세요." }),
      () => socket.serverSays("force_disconnect", { code, message }),
    )
    assert.deepEqual(box.alerts, [message])
  })
}

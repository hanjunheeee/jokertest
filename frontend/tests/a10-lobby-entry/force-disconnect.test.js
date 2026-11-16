// 화면 상태 시험: 서버가 강제로 끊을 때(force_disconnect·server_shutdown) 뜨는 글·로그아웃·로그인 화면 이동·다시 붙기
// 목록 A10-F-022~030·035~038 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md)·A11-F-871~874 (A11a 목록), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/force-disconnect.test.js

// 앱 소켓 훅(useSocket)을 그대로 그리고 socket.io 연결 함수만 가짜로 바꿈
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"
import { made, useSocketFactory, catchPageMoves } from "./ioMock.mjs"

const K = await import("./a10Kit.mjs")
const { React, RTL } = K
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

useSocketFactory(K.createFakeSocket)
const h = React.createElement
test.afterEach(() => K.resetAll())

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

// 서버 알림 하나 받기 → 그 사이 화면이 가려 한 주소 모음
async function serverSays(socket, event, payload) {
  let moves = []
  await RTL.act(async () => { moves = catchPageMoves(() => socket.serverSays(event, payload)) })
  return moves
}

const isLoggedIn = () => useAuthStore.getState().isLoggedIn

const CASES = [
  ["A10-F-022", "REPLACED_BY_SAME_SESSION", "같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.", true],
  ["A10-F-023", "REPLACED_BY_OTHER_LOGIN", "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.", false],
  ["A10-F-024", "ACCOUNT_BANNED", "정지된 계정입니다. 운영정책을 확인해주세요.", false],
  ["A10-F-025", "ACCOUNT_WITHDRAWN", "회원 탈퇴가 완료되었습니다.", false],
  ["A10-F-026", "SESSION_EXPIRED", "로그인 유지 시간이 지났습니다. 다시 로그인해주세요.", false],
]
for (const [no, code, message, staysIn] of CASES) {
  test(`${no} force_disconnect ${code}(서버 글 없음) → 알림 "${message}" + ${staysIn ? "로그인 유지" : "로그아웃"}`, async () => {
    const { socket, box } = await connect()
    await serverSays(socket, "force_disconnect", { code })
    assert.deepEqual(box.alerts, [message])
    assert.equal(isLoggedIn(), staysIn)
  })
}

test("A10-F-027 force_disconnect {} → \"다른 기기 또는 브라우저에서 로그인되어…\" + 로그아웃", async () => {
  const { socket, box } = await connect()
  await serverSays(socket, "force_disconnect", {})
  assert.deepEqual(box.alerts, ["다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다."])
  assert.equal(isLoggedIn(), false)
})

test("A10-F-028 code ACCOUNT_BANNED + 서버 글 \"가\" → 알림 \"가\"", async () => {
  const { socket, box } = await connect()
  await serverSays(socket, "force_disconnect", { code: "ACCOUNT_BANNED", message: "가" })
  assert.deepEqual(box.alerts, ["가"])
})

test("A10-F-029 server_shutdown → 안내 글, 로그인 유지", async () => {
  const { socket, box } = await connect()
  const moves = await serverSays(socket, "server_shutdown", { code: "SERVER_SHUTDOWN", message: "서버가 곧 꺼집니다." })
  assert.deepEqual(box.alerts, ["서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요."])
  assert.equal(isLoggedIn(), true)
  assert.deepEqual(moves, [])
})

test("A10-F-030 REPLACED_BY_SAME_SESSION 뒤 서버가 끊음 → 다시 연결 시도 0번", async () => {
  const { socket } = await connect()
  await serverSays(socket, "force_disconnect", { code: "REPLACED_BY_SAME_SESSION" })
  await RTL.act(async () => { socket.serverDisconnects() })
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
  assert.equal(socket.connectCalls, 0)
  assert.equal(made.at(-1) === socket, true, "새 소켓도 안 만듦")
})

test("A10-F-035 ACCOUNT_INACTIVE → \"이용할 수 없는 계정입니다.\" + 로그아웃", async () => {
  const { socket, box } = await connect()
  await serverSays(socket, "force_disconnect", { code: "ACCOUNT_INACTIVE" })
  assert.deepEqual(box.alerts, ["이용할 수 없는 계정입니다."])
  assert.equal(isLoggedIn(), false)
})

test("A10-F-036 모르는 code X + 서버 글 \"나\" → \"나\" + 로그아웃", async () => {
  const { socket, box } = await connect()
  await serverSays(socket, "force_disconnect", { code: "X", message: "나" })
  assert.deepEqual(box.alerts, ["나"])
  assert.equal(isLoggedIn(), false)
})

test("A10-F-037 REPLACED_BY_OTHER_LOGIN → 주소 /login", async () => {
  const { socket } = await connect()
  const moves = await serverSays(socket, "force_disconnect", { code: "REPLACED_BY_OTHER_LOGIN" })
  assert.deepEqual(moves, ["/login"])
})

test("A10-F-038 REPLACED_BY_SAME_SESSION → 주소 안 바뀜", async () => {
  const { socket } = await connect()
  const moves = await serverSays(socket, "force_disconnect", { code: "REPLACED_BY_SAME_SESSION" })
  assert.deepEqual(moves, [])
})

// 관리자 강제 끊기(정지 아님)는 세션을 안 내림 → 로그인 화면으로 보내면 남은 쿠키로 바로 로비로 돌아옴 (브라우저 A17-H-026)
// 안내만 띄우고 있던 화면에 남아 다시 붙음 (결정 2026-11-16 오전 둘째 7: 다시 붙으면 판에 그대로)
test("A11-F-871 force_disconnect ADMIN_DISCONNECT + 서버 글 → 알림 그 글 + 로그인 유지 + 주소 안 바뀜", async () => {
  const { socket, box } = await connect()
  const moves = await serverSays(socket, "force_disconnect", { code: "ADMIN_DISCONNECT", message: "운영자에 의해 연결이 종료되었습니다." })
  assert.deepEqual(box.alerts, ["운영자에 의해 연결이 종료되었습니다."])
  assert.equal(isLoggedIn(), true)
  assert.deepEqual(moves, [])
})

test("A11-F-872 force_disconnect ADMIN_DISCONNECT(서버 글 없음) → 알림 \"운영자에 의해 연결이 종료되었습니다.\"", async () => {
  const { socket, box } = await connect()
  await serverSays(socket, "force_disconnect", { code: "ADMIN_DISCONNECT" })
  assert.deepEqual(box.alerts, ["운영자에 의해 연결이 종료되었습니다."])
})

test("A11-F-873 ADMIN_DISCONNECT 뒤 서버가 끊음 → 같은 소켓으로 다시 연결 1번 / 화면을 닫아 끊긴 것이면 0번", async () => {
  const { socket } = await connect()
  await serverSays(socket, "force_disconnect", { code: "ADMIN_DISCONNECT" })
  await RTL.act(async () => { socket.serverDisconnects() })
  assert.equal(socket.connectCalls, 1)
  assert.equal(made.at(-1) === socket, true, "새 소켓은 안 만듦")

  RTL.cleanup()
  const second = await connect()
  await serverSays(second.socket, "force_disconnect", { code: "ADMIN_DISCONNECT" })
  await RTL.act(async () => { second.socket.serverDisconnects("io client disconnect") })
  assert.equal(second.socket.connectCalls, 0)
})

const LEAVE_CASES = [
  ["ACCOUNT_BANNED", "정지된 계정입니다. 사유: 운영정책 위반"],
  ["ACCOUNT_WITHDRAWN", "회원 탈퇴가 완료되었습니다."],
  ["SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해주세요."],
]
test("A11-F-874 정지·탈퇴·세션 만료 강제 끊김은 지금대로 알림 + 로그아웃 + 주소 /login (값 3)", async () => {
  for (const [code, message] of LEAVE_CASES) {
    const { socket, box } = await connect()
    const moves = await serverSays(socket, "force_disconnect", { code, message })
    assert.deepEqual(box.alerts, [message], code)
    assert.equal(isLoggedIn(), false, code)
    assert.deepEqual(moves, ["/login"], code)
    RTL.cleanup()
    K.resetAll()
  }
})

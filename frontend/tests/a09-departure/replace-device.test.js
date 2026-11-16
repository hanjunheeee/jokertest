// 다른 기기 접속 알림 시험(화면 상태): 다른 로그인에 밀리면 알림·로그아웃·로그인 화면으로, 같은 브라우저 다른 창이면 알림만
// 목록 A09-끊김-나가기-탈주.md A09-F-158~159, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/replace-device.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

// 진짜 서버에 안 붙게 socket.io 연결 만들기를 가짜 소켓으로 바꿈 (시험 대상보다 먼저)
const holder = { socket: null }
mock.module("socket.io-client", { namedExports: { io: () => holder.socket } })

const K = await import("./a09Kit.mjs")
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")

// 화면 옮기기(주소 바꾸기) 시도는 jsdom이 "못 함" 오류로 알림 → 그 글을 모아 옮기려 했는지 봄
const navigationAttempts = []
dom.virtualConsole.on("jsdomError", (error) => {
  if (String(error?.message ?? error).includes("navigation")) navigationAttempts.push(String(error.message))
})

test.afterEach(() => {
  K.reset()
  navigationAttempts.length = 0
})

// 로그인 동안 소켓을 여는 앱 맨 바깥 틀 흉내 (useSocket만)
function SocketHost() {
  useSocket()
  return null
}

// 6명 판 낮에 앉은 사람, 앱 소켓이 열린 상태까지
async function seatedWithAppSocket() {
  const fake = K.createFakeSocket()
  Object.assign(fake, { connect() {}, disconnect() { fake.connected = false }, io: { opts: {} } })
  holder.socket = fake
  const t = K.seat({ n: 6, me: 1, jokers: [0], socket: fake })
  await K.renderRoutes({ path: "/ingame", element: K.h(SocketHost) })
  assert.ok(fake.listenerCount("force_disconnect") > 0, "강제 끊김 받기가 안 붙음")
  return { t, fake }
}

test("A09-F-158 force_disconnect REPLACED_BY_OTHER_LOGIN → 알림 글·로그아웃·로그인 화면으로 옮김", async () => {
  const { fake } = await seatedWithAppSocket()
  const text = "다른 기기에서 로그인되어 현재 접속이 종료되었습니다."
  await K.RTL.act(async () => { fake.fire("force_disconnect", { code: "REPLACED_BY_OTHER_LOGIN", message: text }) })
  await K.flush()
  assert.deepEqual(K.dialogs.alerts, [text])
  assert.equal(K.useAuthStore.getState().isLoggedIn, false)
  assert.ok(navigationAttempts.length >= 1, "로그인 화면으로 옮기려 하지 않음")
})

test("A09-F-159 force_disconnect REPLACED_BY_SAME_SESSION → 알림만, 로그아웃 안 함", async () => {
  const { fake, t } = await seatedWithAppSocket()
  await K.RTL.act(async () => { fake.fire("force_disconnect", { code: "REPLACED_BY_SAME_SESSION" }) })
  await K.flush()
  assert.equal(K.dialogs.alerts.length, 1)
  assert.ok(K.dialogs.alerts[0].includes("다른 창"), `글: ${K.dialogs.alerts[0]}`)
  assert.equal(K.useAuthStore.getState().isLoggedIn, true)
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.equal(navigationAttempts.length, 0)
})

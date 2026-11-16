// 다른 기기 접속 화면 시험(화면 부품, 로그인 문지기 + 판 화면): 다른 로그인에 밀리면 알림 글 + 로그인 화면, 같은 브라우저 다른 창이면 알림 글 + 지금 화면 그대로
// 목록 A09-끊김-나가기-탈주.md A09-F-242~243, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/replace-device-page.test.js
// 목록 파일 칸은 replace-device.test.jsx지만 상태 시험 replace-device.test.js와 이름이 겹쳐 replace-device-page로 둠
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

// 진짜 서버에 안 붙게 socket.io 연결 만들기를 가짜 소켓으로 바꿈 (시험 대상보다 먼저)
const holder = { socket: null }
mock.module("socket.io-client", { namedExports: { io: () => holder.socket } })

const K = await import("./a09Kit.mjs")
const { useSocket } = await import("../../src/shared/hooks/useSocket.js")
const { default: ProtectedRoute } = await import("../../src/shared/ui/ProtectedRoute.jsx")
const { Outlet } = await import("react-router-dom")

test.afterEach(() => K.reset())

// 앱 맨 바깥 틀 흉내: 로그인 동안 소켓 열기(useSocket) + 로그인 문지기 아래 화면
function AppRoot() {
  useSocket()
  return K.h(ProtectedRoute)
}

// 6명 판 낮 판 화면을 보고 있는 사람 (앱 소켓 열림)
async function seatedPage() {
  const fake = K.createFakeSocket()
  Object.assign(fake, { connect() {}, disconnect() { fake.connected = false }, io: { opts: {} } })
  holder.socket = fake
  const t = K.seat({ n: 6, me: 1, jokers: [0], socket: fake })
  await K.renderRoutes({
    path: "/ingame",
    root: K.h(AppRoot),
    outside: { "/login": K.h("div", null, K.h("p", null, "로그인 화면 (시험 자리)"), K.h(Outlet)) },
  })
  assert.ok(fake.listenerCount("force_disconnect") > 0, "강제 끊김 받기가 안 붙음")
  assert.ok(document.querySelector(`[data-ingame-player-nickname="${t.nick(1)}"]`) !== null, "판 화면이 안 그려짐")
  return { t, fake }
}

test("A09-F-242 판 화면에서 REPLACED_BY_OTHER_LOGIN → 알림 글 + 로그인 화면(/login)", async () => {
  const { fake } = await seatedPage()
  const text = "다른 기기에서 로그인되어 현재 접속이 종료되었습니다."
  await K.RTL.act(async () => { fake.fire("force_disconnect", { code: "REPLACED_BY_OTHER_LOGIN", message: text }) })
  await K.flush()
  assert.ok(K.dialogs.alerts.includes(text), `알림: ${JSON.stringify(K.dialogs.alerts)}`)
  await K.waitUntil(() => K.path() === "/login", { what: "로그인 화면으로" })
  assert.ok(document.body.textContent.includes("로그인 화면 (시험 자리)"))
})

test("A09-F-243 판 화면에서 REPLACED_BY_SAME_SESSION → 알림 글, 지금 판 화면 그대로", async () => {
  const { fake, t } = await seatedPage()
  await K.RTL.act(async () => { fake.fire("force_disconnect", { code: "REPLACED_BY_SAME_SESSION" }) })
  await K.flush()
  assert.equal(K.dialogs.alerts.length, 1)
  assert.ok(K.dialogs.alerts[0].includes("다른 창"), K.dialogs.alerts[0])
  assert.equal(K.path(), "/ingame")
  assert.ok(document.querySelector(`[data-ingame-player-nickname="${t.nick(1)}"]`) !== null, "판 화면이 사라짐")
})

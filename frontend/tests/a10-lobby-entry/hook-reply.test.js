// 화면 상태 시험: 로비 입장 답에 따라 주소·판 스토어·방 스토어가 어떻게 바뀌나 (판으로 되돌림·정리·밀린 옛 창·늦은 답·이상한 답)
// 목록 A10-F-005~021·031·033 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --experimental-test-module-mocks --test tests/a10-lobby-entry/hook-reply.test.js

// 같은 판 10초 막기가 파일 안에서 이어져서 시험마다 가짜 시계 시각을 멀리 띄움
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const K = await import("./a10Kit.mjs")
const { React } = K
const { useLobbyEntryCleanup } = await import("../../src/domains/game/shared/hooks/useLobbyEntryCleanup.js")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")

const h = React.createElement
test.afterEach(() => K.resetAll())

// 시험마다 100만 ms씩 뒤 시각에서 시작 (앞 시험의 되돌림 기억이 안 걸리게)
let base = 1_800_000_000_000
function freshClock(t) {
  base += 1_000_000
  t.mock.timers.enable({ apis: ["Date"], now: base })
  t.after(() => t.mock.timers.reset())
}

function Probe() {
  useLobbyEntryCleanup()
  return h("p", null, "로비 쪽 화면")
}

// /lobby(훅 씀) 그림, 앞 주소 /gameMode (뒤로 가기 확인용)
function openLobby() {
  return K.mountRoutes([
    { path: "/lobby", element: h(Probe) },
    { path: "/multiplay", element: h(Probe) },
    { path: "/ingame", element: h("p", null, "판 화면") },
    { path: "*", element: h("p", null, "다른 곳") },
  ], ["/gameMode", "/lobby"], 1)
}

const INGAME = (gameId) => ({ ok: true, redirect: "INGAME", gameId, cleared: { liveGame: false, endedGame: false, pending: false, room: false } })
const CLEARED = { ok: true, redirect: null, gameId: null, cleared: { liveGame: false, endedGame: false, pending: false, room: true } }

function setup(t, answer) {
  freshClock(t)
  K.signIn()
  const socket = K.useFakeSocket()
  if (answer !== undefined) socket.answer("enter_lobby", answer)
  return socket
}

test("A10-F-005 답 INGAME g1 → 주소 /ingame, 뒤로 가기 해도 로비로 안 돌아옴", async (t) => {
  setup(t, INGAME("g1"))
  const view = openLobby()
  await K.flush()
  assert.equal(view.path(), "/ingame")
  await K.RTL.act(async () => { await view.router.navigate(-1) })
  assert.equal(view.path(), "/gameMode")
})

test("A10-F-006 판 스토어 gameId old + 답 g1 → 판 스토어 비움, /ingame", async (t) => {
  setup(t, INGAME("g1"))
  useInGameStore.getState().setGamePayload({ gameId: "old", state: null })
  assert.equal(K.gameIdInStore(), "old")
  const view = openLobby()
  await K.flush()
  assert.equal(K.gameIdInStore(), null)
  assert.equal(view.path(), "/ingame")
})

test("A10-F-007 판 스토어 gameId g1 + 답 g1 → 판 스토어 그대로, /ingame", async (t) => {
  setup(t, INGAME("g1"))
  useInGameStore.getState().setGamePayload({ gameId: "g1", state: null })
  const view = openLobby()
  await K.flush()
  assert.equal(K.gameIdInStore(), "g1")
  assert.equal(view.path(), "/ingame")
})

const BAD_IDS = [["A10-F-008", "''", ""], ["A10-F-009", "null", null], ["A10-F-010", "123", 123]]
for (const [no, label, gameId] of BAD_IDS) {
  test(`${no} [지금 동작] INGAME + gameId ${label} → 주소 그대로`, async (t) => {
    setup(t, INGAME(gameId))
    const view = openLobby()
    await K.flush()
    assert.equal(view.path(), "/lobby")
  })
}

// g1 되돌림 → 판 화면이 다시 방 목록으로 보냄 → wait ms 뒤 둘째 답
async function bounceBack(t, waitMs, secondGameId) {
  const socket = setup(t, (payload, count) => INGAME(count === 1 ? "g1" : secondGameId))
  const view = openLobby()
  await K.flush()
  assert.equal(view.path(), "/ingame")
  t.mock.timers.tick(waitMs)
  await K.RTL.act(async () => { await view.router.navigate("/multiplay") })
  await K.flush()
  assert.equal(socket.countOf("enter_lobby"), 2)
  return view
}

test("A10-F-011 [지금 동작] 같은 판 g1을 9초 뒤 또 되돌림 → 이동 없음", async (t) => {
  const view = await bounceBack(t, 9_000, "g1")
  assert.equal(view.path(), "/multiplay")
})

test("A10-F-012 [지금 동작] 같은 판 g1을 11초 뒤 → /ingame", async (t) => {
  const view = await bounceBack(t, 11_000, "g1")
  assert.equal(view.path(), "/ingame")
})

test("A10-F-013 [지금 동작] g1 뒤 3초에 다른 판 g2 → /ingame", async (t) => {
  const view = await bounceBack(t, 3_000, "g2")
  assert.equal(view.path(), "/ingame")
})

test("A10-F-014 밀린 옛 창 답 NOT_CURRENT_SOCKET + 방 r1 → 주소·방 스토어 그대로", async (t) => {
  setup(t, { ok: false, code: "NOT_CURRENT_SOCKET" })
  K.putRoom(K.roomOf({ roomId: "r1" }))
  const view = openLobby()
  await K.flush()
  assert.equal(view.path(), "/lobby")
  assert.deepEqual(K.roomState(), { roomId: "r1", isInRoom: true })
})

test("A10-F-015 방 r1·isInRoom + 정리 답 → 방 스토어 빔, 주소 그대로", async (t) => {
  setup(t, CLEARED)
  K.putRoom(K.roomOf({ roomId: "r1" }))
  const view = openLobby()
  await K.flush()
  assert.deepEqual(K.roomState(), { roomId: null, isInRoom: false })
  assert.equal(view.path(), "/lobby")
})

test("A10-F-016 빈 방 스토어 + 정리 답 → 그대로, 오류 없음", async (t) => {
  setup(t, CLEARED)
  const view = openLobby()
  await K.flush()
  assert.deepEqual(K.roomState(), { roomId: null, isInRoom: false })
  assert.equal(view.path(), "/lobby")
  assert.ok(K.RTL.screen.getByText("로비 쪽 화면"))
})

test("A10-F-017 답 전에 화면 닫힘 → 늦게 온 INGAME 답 → 주소·스토어 그대로", async (t) => {
  const socket = setup(t, K.HOLD)
  K.putRoom(K.roomOf({ roomId: "r1" }))
  const view = openLobby()
  await K.flush()
  view.unmount()
  assert.equal(socket.release("enter_lobby", INGAME("g1")), true)
  await K.flush()
  assert.equal(view.path(), "/lobby")
  assert.equal(K.gameIdInStore(), null)
  assert.deepEqual(K.roomState(), { roomId: "r1", isInRoom: true })
})

test("A10-F-018 답이 안 옴 → 주소 그대로, 오류 글 없음", async (t) => {
  setup(t, K.NO_ANSWER)
  const box = K.installDialogs(dom)
  const view = openLobby()
  await K.flush()
  t.mock.timers.tick(30_000)
  await K.flush()
  assert.equal(view.path(), "/lobby")
  assert.deepEqual(box.alerts, [])
  assert.equal(K.RTL.screen.queryByRole("alert") === null, true)
})

const BAD_REPLIES = [["A10-F-019", "undefined", undefined], ["A10-F-020", "'ok'", "ok"]]
for (const [no, label, reply] of BAD_REPLIES) {
  test(`${no} 답 ${label} → 주소·방 스토어 그대로`, async (t) => {
    setup(t, () => reply)
    K.putRoom(K.roomOf({ roomId: "r1" }))
    const view = openLobby()
    await K.flush()
    assert.equal(view.path(), "/lobby")
    assert.deepEqual(K.roomState(), { roomId: "r1", isInRoom: true })
  })
}

test("A10-F-021 방 스토어 값 + INGAME 답 → 방 스토어 그대로", async (t) => {
  setup(t, INGAME("g1"))
  K.putRoom(K.roomOf({ roomId: "r1" }))
  const view = openLobby()
  await K.flush()
  assert.equal(view.path(), "/ingame")
  assert.deepEqual(K.roomState(), { roomId: "r1", isInRoom: true })
})

test("A10-F-031 판 스토어 비어 있음 + INGAME g1 → /ingame", async (t) => {
  setup(t, INGAME("g1"))
  assert.equal(K.gameIdInStore(), null)
  const view = openLobby()
  await K.flush()
  assert.equal(view.path(), "/ingame")
})

test("A10-F-033 [지금 동작] 답 cleared.room:false + 방 스토어 값 → 방 스토어 빔", async (t) => {
  setup(t, { ok: true, redirect: null, gameId: null, cleared: { liveGame: false, endedGame: false, pending: false, room: false } })
  K.putRoom(K.roomOf({ roomId: "r1" }))
  const view = openLobby()
  await K.flush()
  assert.deepEqual(K.roomState(), { roomId: null, isInRoom: false })
  assert.equal(view.path(), "/lobby")
})

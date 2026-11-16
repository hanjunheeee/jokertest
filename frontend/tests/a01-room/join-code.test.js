// 화면 상태 시험: 방 코드로 들어오기 — 입장 실패 코드마다 글, 서버 글 그대로 쓰는 것, 8초 응답 없음, 보내는 중 두 번, 연결 없음
// 목록 A01-F-556~572 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/join-code.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useRoomInvitePage } = await import("../../src/domains/game/mode/hooks/useRoomInvitePage.js")
const { useFakeSocket, createFakeSocket, signIn, resetAll, installDialogs, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 코드 입장 화면 훅 그리기 + 코드 6자리 넣기
async function setup({ socket = true } = {}) {
  signIn("me", "나")
  const dialogs = installDialogs(dom)
  const fake = socket ? useFakeSocket() : createFakeSocket()
  if (!socket) setSocket(null)
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/roomInvite"] }, children)
  const view = renderHook(() => useRoomInvitePage(), { wrapper })
  act(() => view.result.current.setRoomCode("ABC234"))
  return { fake, view, dialogs }
}

// 입장 누르고 서버가 실패 알림을 보냄
async function joinAndFail({ fake, view }, answer) {
  act(() => view.result.current.joinRoom())
  await act(async () => { fake.serverSays("room_join_failed", answer); await flush() })
}

// 코드마다 화면 글 (서버 글은 화면 글에 덮임)
const CODE_CASES = [
  ["A01-F-556", "ROOM_CODE_MISMATCH", "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.", "exact"],
  ["A01-F-557", "ROOM_NOT_FOUND", "방을 찾을 수 없습니다. 이미 사라진 방일 수 있어요.", "exact"],
  ["A01-F-558", "ROOM_ALREADY_STARTED", "이미 게임이 시작된 방이라 입장할 수 없습니다.", "exact"],
  ["A01-F-559", "ROOM_FULL", "방 정원이 가득 찼습니다.", "exact"],
  ["A01-F-560", "CODE_REQUIRED", "입장 코드를 입력해주세요.", "exact"],
  ["A01-F-561", "SESSION_ENDED", "이미 끝난 게임의 방이라", "prefix"],
  ["A01-F-562", "INVALID_REQUEST", "잘못된 참가 요청입니다", "prefix"],
  ["A01-F-563", "KICKED_TOO_MANY_TIMES", "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.", "exact"],
]
for (const [id, code, expected, mode] of CODE_CASES) {
  test(`${id} room_join_failed 코드 ${code} → 알림 "${expected}${mode === "prefix" ? "…" : ""}"`, async () => {
    const ctx = await setup()
    await joinAndFail(ctx, { code, message: "(서버 글)" })
    assert.equal(ctx.dialogs.alerts.length, 1)
    if (mode === "exact") assert.equal(ctx.dialogs.alerts[0], expected)
    else assert.ok(ctx.dialogs.alerts[0].startsWith(expected), `받은 글: ${ctx.dialogs.alerts[0]}`)
  })
}

test("A01-F-564 코드 DESERTION_COOLDOWN + 글 \"탈주로 4분 59초 뒤에 참여할 수 있습니다.\" → 알림 글 같음", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "DESERTION_COOLDOWN", message: "탈주로 4분 59초 뒤에 참여할 수 있습니다." })
  assert.deepEqual(ctx.dialogs.alerts, ["탈주로 4분 59초 뒤에 참여할 수 있습니다."])
})

// 서버가 실제로 같이 보내는 글 (backend join/joinChecks.js·guards.js)
test("A01-F-565 TOO_MANY_JOIN_ATTEMPTS → \"입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.\"", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "TOO_MANY_JOIN_ATTEMPTS", message: "입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요." })
  assert.deepEqual(ctx.dialogs.alerts, ["입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."])
})

test("A01-F-566 ALREADY_IN_GAME → \"진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.\"", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "ALREADY_IN_GAME", message: "진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요." })
  assert.deepEqual(ctx.dialogs.alerts, ["진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요."])
})

test("A01-F-567 ALREADY_IN_ROOM → \"이미 참여 중인 방이 있습니다.\"", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "ALREADY_IN_ROOM", message: "이미 참여 중인 방이 있습니다." })
  assert.deepEqual(ctx.dialogs.alerts, ["이미 참여 중인 방이 있습니다."])
})

test("A01-F-568 글도 코드도 모름 { code: 'X' } → \"방에 참여할 수 없습니다.\"", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "X" })
  assert.deepEqual(ctx.dialogs.alerts, ["방에 참여할 수 없습니다."])
})

test("A01-F-569 코드 입장 8초 응답 없음: 7.9초 → 아직 보내는 중", async (t) => {
  const ctx = await setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  act(() => ctx.view.result.current.joinRoom())
  act(() => t.mock.timers.tick(7900))
  assert.equal(ctx.view.result.current.isJoining, true)
  assert.equal(ctx.dialogs.alerts.length, 0)
})

test("A01-F-570 코드 입장 8초 응답 없음: 8.0초 → \"서버 응답이 없습니다. 잠시 후 다시 시도해주세요.\" + 다시 누를 수 있음", async (t) => {
  const ctx = await setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  act(() => ctx.view.result.current.joinRoom())
  act(() => t.mock.timers.tick(7900))
  act(() => t.mock.timers.tick(100))
  assert.deepEqual(ctx.dialogs.alerts, ["서버 응답이 없습니다. 잠시 후 다시 시도해주세요."])
  assert.equal(ctx.view.result.current.isJoining, false)
  act(() => ctx.view.result.current.joinRoom())
  assert.equal(ctx.fake.sentOf("join_room_by_code").length, 2)
})

test("A01-F-571 보내는 중 입장 두 번 → join_room_by_code 1번", async () => {
  const ctx = await setup()
  act(() => ctx.view.result.current.joinRoom())
  act(() => ctx.view.result.current.joinRoom())
  assert.equal(ctx.fake.sentOf("join_room_by_code").length, 1)
  assert.deepEqual(ctx.fake.sentOf("join_room_by_code")[0], { roomCode: "ABC234" })
})

test("A01-F-572 소켓 없음에서 입장 → 응답 없음 글, 보냄 0번", async () => {
  const ctx = await setup({ socket: false })
  act(() => ctx.view.result.current.joinRoom())
  assert.deepEqual(ctx.dialogs.alerts, ["서버 응답이 없습니다. 잠시 후 다시 시도해주세요."])
  assert.equal(ctx.fake.sentOf("join_room_by_code").length, 0)
  assert.equal(ctx.view.result.current.isJoining, false)
})

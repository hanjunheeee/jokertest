// 화면 상태 시험: 공개 목록으로 들어오기 — 실패는 서버 글 그대로, 글 없으면 공통 글, 8초 응답 없음, 들어오면 대기방, 목록 알림 반영
// 목록 A01-F-573~584 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/join-public.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup } = await import("@testing-library/react")
const { MemoryRouter, useLocation } = await import("react-router-dom")
const { usePublicRooms } = await import("../../src/domains/game/mode/hooks/usePublicRooms.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, flush } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

// 목록 한 줄 (서버 공개 목록 모양)
const listRow = (id, current, max = 6) => ({ id, title: `${id}의 방`, current, max, accessType: "open", status: current >= max ? "full" : "waiting" })

// 방 목록 훅 그리기 (지금 주소는 where.path)
async function setup({ rooms = [listRow("room-1", 3)] } = {}) {
  signIn("me", "나")
  const dialogs = installDialogs(dom)
  const fake = useFakeSocket()
  fake.answer("get_public_rooms", { ok: true, rooms })
  const where = { path: null }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/multiplay"] }, h(Where), children)
  const view = renderHook(() => usePublicRooms(), { wrapper })
  await act(async () => { await flush() })
  return { fake, view, dialogs, where }
}

// 공개 방 들어가기 누르고 서버가 실패 알림
async function joinAndFail({ fake, view }, answer) {
  act(() => view.result.current.joinPublicRoom("room-1"))
  await act(async () => { fake.serverSays("room_join_failed", answer); await flush() })
}

// 서버가 보내는 실패 글 → 알림 글 같음
const SERVER_TEXT = [
  ["A01-F-573", "ROOM_FULL", "방이 가득 찼습니다."],
  ["A01-F-574", "ROOM_CODE_MISMATCH", "이 방은 입장 코드가 필요합니다."],
  ["A01-F-575", "ROOM_NOT_FOUND", "공개 방을 찾을 수 없습니다."],
  ["A01-F-576", "ROOM_ALREADY_STARTED", "이미 게임이 시작된 방입니다."],
  ["A01-F-577", "KICKED_TOO_MANY_TIMES", "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."],
  ["A01-F-578", "DESERTION_COOLDOWN", "탈주로 1분 0초 뒤에 참여할 수 있습니다."],
  ["A01-F-579", "ALREADY_IN_GAME", "진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요."],
  ["A01-F-580", "ALREADY_IN_ROOM", "이미 참여 중인 방이 있습니다."],
]
for (const [id, code, message] of SERVER_TEXT) {
  test(`${id} 공개 입장 실패 ${code} "${message}" → 알림 글 같음`, async () => {
    const ctx = await setup()
    // 이미 참여 중 거절이면 방을 먼저 되찾아 보므로, 방 없음 답이 와야 알림이 뜸
    if (code === "ALREADY_IN_ROOM") ctx.fake.answer("get_current_room", { ok: true, room: null })
    await joinAndFail(ctx, { code, message })
    assert.deepEqual(ctx.dialogs.alerts, [message])
    assert.equal(ctx.view.result.current.isJoining, false)
  })
}

// 방 확인 답이 끝내 안 오면 방 확인 제한 시간(5초)이 지난 뒤에 알림, 그동안은 들어가는 중 그대로
test("A01-F-759 공개 입장 실패 ALREADY_IN_ROOM + 방 확인 답 안 옴 → 5초 뒤 알림, 그 전엔 알림 없음", async (t) => {
  const ctx = await setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  await joinAndFail(ctx, { code: "ALREADY_IN_ROOM", message: "이미 참여 중인 방이 있습니다." })
  assert.deepEqual(ctx.dialogs.alerts, [])
  assert.equal(ctx.view.result.current.isJoining, true)
  await act(async () => { t.mock.timers.tick(4999); await flush() })
  assert.deepEqual(ctx.dialogs.alerts, [])
  await act(async () => { t.mock.timers.tick(1); await flush() })
  assert.deepEqual(ctx.dialogs.alerts, ["이미 참여 중인 방이 있습니다."])
  assert.equal(ctx.view.result.current.isJoining, false)
})

// ALREADY_IN_ROOM은 먼저 서버에 내 방을 다시 물음 (방 확인 답에 내가 앉은 방이 있으면 알림 없이 대기방으로)
test("A01-F-739 공개 입장 실패 ALREADY_IN_ROOM + 방 확인 답에 내가 앉은 방 → 알림 없이 대기방(/game-matching), 방 명단 들어감", async () => {
  const ctx = await setup()
  const room = roomOf({ n: 4, max: 6, uuids: ["host", "g2", "g3", "me"] })
  ctx.fake.answer("get_current_room", { ok: true, room })
  await joinAndFail(ctx, { code: "ALREADY_IN_ROOM", message: "이미 참여 중인 방이 있습니다." })
  await act(async () => { await flush(20) })
  assert.deepEqual(ctx.dialogs.alerts, [])
  assert.equal(ctx.view.result.current.isJoining, false)
  assert.equal(ctx.where.path, "/game-matching")
  assert.deepEqual(useMatchingStore.getState().players.map((p) => p.uuid), ["host", "g2", "g3", "me"])
})

test("A01-F-740 방 목록을 열 때 서버에 내 방이 남아 있음(스토어만 빔) → 대기방(/game-matching)으로 되돌아감", async () => {
  signIn("me", "나")
  installDialogs(dom)
  const fake = useFakeSocket()
  fake.answer("get_public_rooms", { ok: true, rooms: [] })
  fake.answer("get_current_room", { ok: true, room: roomOf({ n: 2, max: 6, uuids: ["host", "me"] }) })
  const where = { path: null }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/multiplay"] }, h(Where), children)
  renderHook(() => usePublicRooms(), { wrapper })
  await act(async () => { await flush(20) })
  assert.equal(where.path, "/game-matching")
  assert.equal(useMatchingStore.getState().roomId, "room-1")
})

test("A01-F-581 글 없는 실패 → \"공개 방에 참여할 수 없습니다.\"", async () => {
  const ctx = await setup()
  await joinAndFail(ctx, { code: "SOMETHING" })
  assert.deepEqual(ctx.dialogs.alerts, ["공개 방에 참여할 수 없습니다."])
})

test("A01-F-582 공개 입장 8초 응답 없음 → 다시 누를 수 있음", async (t) => {
  const ctx = await setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  act(() => ctx.view.result.current.joinPublicRoom("room-1"))
  assert.equal(ctx.view.result.current.isJoining, true)
  act(() => t.mock.timers.tick(8000))
  assert.equal(ctx.view.result.current.isJoining, false)
  act(() => ctx.view.result.current.joinPublicRoom("room-1"))
  assert.equal(ctx.fake.sentOf("join_public_room").length, 2)
})

test("A01-F-583 room_joined → /game-matching 이동, 방 명단 들어감", async () => {
  const ctx = await setup()
  act(() => ctx.view.result.current.joinPublicRoom("room-1"))
  const room = roomOf({ n: 4, max: 6, uuids: ["host", "g2", "g3", "me"] })
  await act(async () => { ctx.fake.serverSays("room_joined", room); await flush() })
  assert.equal(ctx.where.path, "/game-matching")
  assert.deepEqual(useMatchingStore.getState().players.map((p) => p.uuid), ["host", "g2", "g3", "me"])
})

test("A01-F-584 public_rooms_updated → 목록 값 바뀜(인원·방 수)", async () => {
  const ctx = await setup({ rooms: [listRow("room-1", 3)] })
  assert.deepEqual(ctx.view.result.current.rooms.map((r) => [r.id, r.current]), [["room-1", 3]])
  await act(async () => {
    ctx.fake.serverSays("public_rooms_updated", { rooms: [listRow("room-1", 4), listRow("room-2", 1, 8)] })
    await flush()
  })
  assert.deepEqual(ctx.view.result.current.rooms.map((r) => [r.id, r.current]), [["room-1", 4], ["room-2", 1]])
})

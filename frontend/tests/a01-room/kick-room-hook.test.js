// 화면 상태 시험: 대기방 추방 훅 — 방장·확인 끝일 때만 추방, 꺼진 까닭 조건, 성공하면 창 닫힘, 대상 목록, 요청 7칸, 결과 모름 뒤 방 다시 확인
// 목록 A01-F-539~552 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kick-room-hook.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { useMatchingRoomKick } = await import("../../src/domains/game/matching/hooks/useMatchingRoomKick.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { KICK_REQUEST_STATUS: S } = await import("../../src/domains/game/ingame/hooks/useKickPlayerRequest.js")
const { useFakeSocket, signIn, resetAll, roomOf, HOLD, NO_ANSWER, flush } = await import("./a01b-helpers.mjs")

test.afterEach(() => { cleanup(); resetAll() })

// 방에 앉히고 로그인, 가짜 소켓 끼우고 훅 그리기 (verified로 방 확인 끝 여부)
function setup({ me = "host", room = roomOf({ n: 5, max: 6 }), verified = true } = {}) {
  signIn(me)
  const fake = useFakeSocket()
  useMatchingStore.getState().setRoom(room)
  const view = renderHook(({ v }) => useMatchingRoomKick({ isRoomVerified: v }), { initialProps: { v: verified } })
  return { fake, view, room }
}

// 대상 하나 고르기 (자리 번호 붙은 그대로)
const targetOf = (view, uuid) => view.result.current.kickTargets.find((t) => t.uuid === uuid)

test("A01-F-539 방장 + 방 확인 끝 → canKick: true", () => {
  const { view } = setup()
  assert.equal(view.result.current.canKick, true)
})

test("A01-F-540 [버그 7] 방장 + 확인 전 → canKick: false, isKickHost: true (까닭 글 그릴 조건)", () => {
  const { view } = setup({ verified: false })
  assert.equal(view.result.current.canKick, false)
  assert.equal(view.result.current.isKickHost, true)
})

test("A01-F-541 손님 → isKickHost: false, canKick: false", () => {
  const { view } = setup({ me: "guest-1" })
  assert.equal(view.result.current.isKickHost, false)
  assert.equal(view.result.current.canKick, false)
})

test("A01-F-542 [버그 7] 창 열고 추방 성공 답 → kickModalOpen: false", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: true, status: "KICKED" })
  act(() => view.result.current.openKickModal())
  assert.equal(view.result.current.kickModalOpen, true)
  await act(async () => { view.result.current.requestKickConfirm(targetOf(view, "guest-1")); await flush() })
  assert.equal(view.result.current.kickModalOpen, false)
})

test("A01-F-543 거절 답 → 창 열림 그대로 + 오류 코드", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: false, code: "ALREADY_LEFT" })
  act(() => view.result.current.openKickModal())
  await act(async () => { view.result.current.requestKickConfirm(targetOf(view, "guest-1")); await flush() })
  assert.equal(view.result.current.kickModalOpen, true)
  assert.equal(view.result.current.kickErrorCode, "ALREADY_LEFT")
})

test("A01-F-544 정원 10 · 지금 10명 → 대상 = 나 뺀 9명, 자리 번호 없는 사람 없음", () => {
  const { view } = setup({ room: roomOf({ n: 10, max: 10 }) })
  const targets = view.result.current.kickTargets
  assert.equal(targets.length, 9)
  assert.equal(targets.some((t) => t.uuid === "host"), false)
  assert.ok(targets.every((t) => typeof t.membershipId === "string" && t.membershipId.length > 0))
})

test("A01-F-545 혼자 있는 방 (정원 5 · 1명) → 대상 0명", () => {
  const { view } = setup({ room: roomOf({ n: 1, max: 5 }) })
  assert.equal(view.result.current.kickTargets.length, 0)
})

test("A01-F-546 창 열린 채 방 확인 상태가 끊김으로(보내는 중 아님) → 창 닫힘", () => {
  const { view } = setup()
  act(() => view.result.current.openKickModal())
  view.rerender({ v: false })
  assert.equal(view.result.current.kickModalOpen, false)
})

test("A01-F-547 보내는 중 확인 상태 끊김 → 창 열림 그대로, 결과 오면 반영", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.openKickModal())
  act(() => view.result.current.requestKickConfirm(targetOf(view, "guest-1")))
  view.rerender({ v: false })
  assert.equal(view.result.current.kickModalOpen, true, "보내는 중엔 확인을 잃어도 창이 열려 있어야 함")
  // 결과가 오면 반영 (거절 답 → 오류 코드)
  await act(async () => { fake.release("kick_room_player", { ok: false, code: "ALREADY_LEFT" }); await flush() })
  assert.equal(view.result.current.kickStatus, S.FAILED)
  assert.equal(view.result.current.kickErrorCode, "ALREADY_LEFT")
})

test("A01-F-548 성공 → 창 닫힘 → 다시 엶 → 상태 IDLE", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: true, status: "KICKED" })
  act(() => view.result.current.openKickModal())
  await act(async () => { view.result.current.requestKickConfirm(targetOf(view, "guest-1")); await flush() })
  assert.equal(view.result.current.kickModalOpen, false)
  act(() => view.result.current.openKickModal())
  assert.equal(view.result.current.kickModalOpen, true)
  assert.equal(view.result.current.kickStatus, S.IDLE)
})

test("A01-F-549 대상이 나갔다 다시 들어와 자리 번호 바뀜 → 옛 줄 누름 → NOT_READY, 보냄 0번", () => {
  const { fake, view } = setup()
  const oldRow = targetOf(view, "guest-1")
  act(() => {
    const store = useMatchingStore.getState()
    store.removePlayer("guest-1")
    store.addPlayer({ uuid: "guest-1", nickname: "사람2", isReady: false, membershipId: "m-guest-1-again" })
  })
  act(() => view.result.current.requestKickConfirm(oldRow))
  assert.equal(view.result.current.kickErrorCode, "NOT_READY")
  assert.equal(fake.sentOf("kick_room_player").length, 0)
})

test("A01-F-550 방장 바뀐 뒤 옛 창에서 누름 → 보냄 0번", () => {
  const { fake, view } = setup()
  const row = targetOf(view, "guest-1")
  act(() => view.result.current.openKickModal())
  act(() => useMatchingStore.getState().updateHost("guest-2"))
  act(() => view.result.current.requestKickConfirm(row))
  assert.equal(fake.sentOf("kick_room_player").length, 0)
})

test("A01-F-551 요청 7칸 (정원 6): requestId·bootEpoch·roomId·roomInstanceId·requesterMembershipId·targetUuid·targetMembershipId, 다른 칸 없음", () => {
  const { fake, view } = setup({ room: roomOf({ n: 6, max: 6 }) })
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.requestKickConfirm(targetOf(view, "guest-1")))
  const [sent] = fake.sentOf("kick_room_player")
  assert.deepEqual(Object.keys(sent).sort(), [
    "bootEpoch", "requestId", "requesterMembershipId", "roomId", "roomInstanceId", "targetMembershipId", "targetUuid",
  ])
  assert.equal(sent.bootEpoch, "boot-1")
  assert.equal(sent.roomId, "room-1")
  assert.equal(sent.roomInstanceId, "inst-1")
  assert.equal(sent.requesterMembershipId, "m-host")
  assert.equal(sent.targetUuid, "guest-1")
  assert.equal(sent.targetMembershipId, "m-guest-1")
  assert.equal(typeof sent.requestId, "string")
})

test("A01-F-552 결과 모름 → 결과 확인(서버도 모름) → 지금 방 묻기 답이 같은 방 → 방 명단 새로 넣음(대상 없음)", async (t) => {
  const { fake, view, room } = setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.openKickModal())
  act(() => view.result.current.requestKickConfirm(targetOf(view, "guest-1")))
  act(() => t.mock.timers.tick(8000))
  assert.equal(view.result.current.kickStatus, S.UNKNOWN)
  // 서버: 결과 모름, 지금 방은 같은 방인데 guest-1이 빠져 있음
  fake.answer("get_kick_result", { ok: true, status: "UNKNOWN" })
  fake.answer("get_current_room", { ok: true, room: { ...room, players: room.players.filter((p) => p.uuid !== "guest-1") } })
  await act(async () => { view.result.current.lookupKickResult(); await flush(10) })
  assert.equal(fake.sentOf("get_current_room").length, 1)
  assert.equal(targetOf(view, "guest-1"), undefined)
  assert.equal(useMatchingStore.getState().players.some((p) => p.uuid === "guest-1"), false)
  assert.equal(view.result.current.isAwaitingKickResolution, false)
})

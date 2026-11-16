// 화면 상태 시험: 추방 요청 훅 — 누르면 바로 보냄·성공·거절·8초 응답 없음·두 번 눌러도 한 번·결과 확인·계정 바뀜·늦은 답
// 목록 A01-F-523~538·528-2~528-7 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kick-request.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { useKickPlayerRequest, KICK_REQUEST_STATUS } = await import("../../src/domains/game/ingame/hooks/useKickPlayerRequest.js")
const { resolveKickErrorMessage } = await import("../../src/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js")
const { useFakeSocket, signIn, resetAll, HOLD, NO_ANSWER, flush } = await import("./a01b-helpers.mjs")

test.afterEach(() => { cleanup(); resetAll() })

const S = KICK_REQUEST_STATUS
// 대상 둘 (자리 번호 있음)
const TARGET = { uuid: "guest-1", nickname: "사람2", membershipId: "m-guest-1" }
const OTHER = { uuid: "guest-2", nickname: "사람3", membershipId: "m-guest-2" }

// 방 값으로 요청 만들기 (방 회차가 비면 못 만듦 → null)
function requestBuilder(room) {
  return ({ target, requestId }) => {
    if (!room.roomInstanceId) return null
    return {
      requestId, bootEpoch: room.bootEpoch, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
      requesterMembershipId: "m-host", targetUuid: target.uuid, targetMembershipId: target.membershipId,
    }
  }
}

// 방장 로그인 + 가짜 소켓 + 훅 그리기
function setup({ room = { roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1" }, socket = true } = {}) {
  signIn("host", "방장")
  const fake = socket ? useFakeSocket() : null
  if (!socket) setSocket(null)
  const view = renderHook(() => useKickPlayerRequest({ buildRequest: requestBuilder(room), getMembershipScopeId: () => "scope-1" }))
  return { fake, view }
}

// 8초 응답 없음까지 시계 넘김 (결과 모름으로)
function toUnknown(t, fake, view) {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => t.mock.timers.tick(8000))
}

test("A01-F-523 [버그 7] 줄 \"추방\" 한 번 → kick_room_player 1번 보냄, 상태 SENDING (확인 상태 없음)", () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  assert.equal(fake.sentOf("kick_room_player").length, 1)
  assert.equal(fake.sentOf("kick_room_player")[0].targetUuid, "guest-1")
  assert.equal(view.result.current.status, S.SENDING)
})

test("A01-F-524 성공 답 { ok: true, status: 'KICKED' } → 상태 SUCCEEDED, 오류 코드 없음", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: true, status: "KICKED" })
  await act(async () => { view.result.current.kickPlayer(TARGET); await flush() })
  assert.equal(view.result.current.status, S.SUCCEEDED)
  assert.equal(view.result.current.errorCode, null)
})

test("A01-F-525 거절 답 { ok: false, code: 'ALREADY_LEFT' } → FAILED + 코드 ALREADY_LEFT", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: false, code: "ALREADY_LEFT" })
  await act(async () => { view.result.current.kickPlayer(TARGET); await flush() })
  assert.equal(view.result.current.status, S.FAILED)
  assert.equal(view.result.current.errorCode, "ALREADY_LEFT")
})

test("A01-F-526 코드 없는 거절 { ok: false } → FAILED, 글은 \"추방하지 못했습니다. 다시 시도해주세요.\"", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", { ok: false })
  await act(async () => { view.result.current.kickPlayer(TARGET); await flush() })
  assert.equal(view.result.current.status, S.FAILED)
  assert.equal(resolveKickErrorMessage(view.result.current.errorCode), "추방하지 못했습니다. 다시 시도해주세요.")
})

test("A01-F-527 8초 응답 없음 경계: 7.9초 → 아직 SENDING", (t) => {
  const { fake, view } = setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => t.mock.timers.tick(7900))
  assert.equal(view.result.current.status, S.SENDING)
})

test("A01-F-528 8초 응답 없음 경계: 8.0초 → UNKNOWN + 결과 확인 가능(canLookupResult: true)", (t) => {
  const { fake, view } = setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => t.mock.timers.tick(7900))
  act(() => t.mock.timers.tick(100))
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.canLookupResult, true)
})

test("A01-F-529 보내는 중 다시 kickPlayer → 소켓 보냄 1번", () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => view.result.current.kickPlayer(TARGET))
  assert.equal(fake.sentOf("kick_room_player").length, 1)
})

test("A01-F-530 결과 모름(UNKNOWN) 뒤 다른 대상 누름 → 더 보냄 0번", (t) => {
  const { fake, view } = setup()
  toUnknown(t, fake, view)
  assert.equal(view.result.current.status, S.UNKNOWN)
  act(() => view.result.current.kickPlayer(OTHER))
  assert.equal(fake.sentOf("kick_room_player").length, 1)
})

test("A01-F-531 소켓 없음에서 누름 → FAILED + NOT_CONNECTED", () => {
  const { view } = setup({ socket: false })
  act(() => view.result.current.kickPlayer(TARGET))
  assert.equal(view.result.current.status, S.FAILED)
  assert.equal(view.result.current.errorCode, "NOT_CONNECTED")
})

test("A01-F-532 방 회차가 비어 요청 못 만듦 → FAILED + NOT_READY", () => {
  const { fake, view } = setup({ room: { roomId: "room-1", roomInstanceId: "", bootEpoch: "boot-1" } })
  act(() => view.result.current.kickPlayer(TARGET))
  assert.equal(view.result.current.status, S.FAILED)
  assert.equal(view.result.current.errorCode, "NOT_READY")
  assert.equal(fake.sentOf("kick_room_player").length, 0)
})

test("A01-F-533 자리 번호 없는 대상 → 보냄 0번, 상태 IDLE", () => {
  const { fake, view } = setup()
  act(() => view.result.current.kickPlayer({ uuid: "guest-1", nickname: "사람2" }))
  assert.equal(fake.sentOf("kick_room_player").length, 0)
  assert.equal(view.result.current.status, S.IDLE)
})

test("A01-F-534 UNKNOWN 뒤 결과 확인, 답 { ok: true, status: 'KICKED' } → SUCCEEDED", async (t) => {
  const { fake, view } = setup()
  toUnknown(t, fake, view)
  fake.answer("get_kick_result", { ok: true, status: "KICKED" })
  await act(async () => { view.result.current.lookupResult(); await flush() })
  assert.equal(fake.sentOf("get_kick_result").length, 1)
  assert.equal(view.result.current.status, S.SUCCEEDED)
})

test("A01-F-535 결과 확인 답 { ok: false, code: 'NOT_HOST' } → FAILED + NOT_HOST", async (t) => {
  const { fake, view } = setup()
  toUnknown(t, fake, view)
  fake.answer("get_kick_result", { ok: false, code: "NOT_HOST" })
  await act(async () => { view.result.current.lookupResult(); await flush() })
  assert.equal(view.result.current.status, S.FAILED)
  assert.equal(view.result.current.errorCode, "NOT_HOST")
})

test("A01-F-536 보내는 중 로그인 계정 바뀜 → IDLE, 결과 확인 불가", () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => signIn("someone-else", "다른 사람"))
  assert.equal(view.result.current.status, S.IDLE)
  assert.equal(view.result.current.canLookupResult, false)
})

test("A01-F-537 보내고 reset 뒤 성공 답이 늦게 옴 → 상태 IDLE 그대로", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  act(() => view.result.current.reset())
  await act(async () => { fake.release("kick_room_player", { ok: true, status: "KICKED" }); await flush() })
  assert.equal(view.result.current.status, S.IDLE)
})

test("A01-F-538 UNKNOWN → reset(창 닫음) → 다시 열면 결과 확인 가능", (t) => {
  const { fake, view } = setup()
  toUnknown(t, fake, view)
  act(() => view.result.current.reset())
  assert.equal(view.result.current.status, S.IDLE)
  assert.equal(view.result.current.canLookupResult, true)
})

// 연결 끊김 흉내: socket.io는 끊기면 소켓 id가 없어지고, 다시 붙으면 새 id가 됨 (소켓 물건은 그대로)
const dropConnection = (fake) => { fake.connected = false; fake.id = undefined }
const reconnectAs = (fake, id) => { fake.connected = true; fake.id = id }

test("A01-F-528-2 [버그 7] 보내는 중 연결이 끊김(소켓 id 없어짐) → 8초 뒤 UNKNOWN + 결과 확인 가능 (보내는 중에 안 멈춤)", (t) => {
  const { fake, view } = setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  dropConnection(fake)
  act(() => t.mock.timers.tick(8000))
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.isSending, false)
  assert.equal(view.result.current.canLookupResult, true)
})

test("A01-F-528-3 [버그 7] 보내는 중 끊겼다 다시 붙음(소켓 id 바뀜) → 8초 뒤 UNKNOWN + 결과 확인 가능", (t) => {
  const { fake, view } = setup()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  dropConnection(fake)
  act(() => t.mock.timers.tick(3000))
  reconnectAs(fake, "sock-2")
  act(() => t.mock.timers.tick(5000))
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.canLookupResult, true)
})

// 끊긴 채 8초 → 결과 모름 → 다시 붙은 뒤(새 id) 결과 확인
function unknownAfterDrop(t, fake, view) {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  fake.answer("kick_room_player", NO_ANSWER)
  act(() => view.result.current.kickPlayer(TARGET))
  dropConnection(fake)
  act(() => t.mock.timers.tick(8000))
  assert.equal(view.result.current.status, S.UNKNOWN, "끊긴 채 8초가 지났는데 결과 모름이 아님")
  reconnectAs(fake, "sock-2")
}

test("A01-F-528-4 [버그 7] 끊겨서 결과 모름 → 다시 붙은 뒤 결과 확인, 답 KICKED → SUCCEEDED", async (t) => {
  const { fake, view } = setup()
  unknownAfterDrop(t, fake, view)
  fake.answer("get_kick_result", { ok: true, status: "KICKED" })
  await act(async () => { view.result.current.lookupResult(); await flush() })
  assert.equal(fake.sentOf("get_kick_result").length, 1)
  assert.equal(view.result.current.status, S.SUCCEEDED)
})

test("A01-F-528-5 [버그 7] 끊겨서 결과 모름 → 다시 붙은 뒤 결과 확인, 답 UNKNOWN → UNKNOWN 그대로(서버도 모름)", async (t) => {
  const { fake, view } = setup()
  unknownAfterDrop(t, fake, view)
  fake.answer("get_kick_result", { ok: true, status: "UNKNOWN" })
  await act(async () => { view.result.current.lookupResult(); await flush() })
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.errorCode, null)
})

test("A01-F-528-6 소켓 id가 바뀐 뒤 옛 연결의 늦은 성공 답 → 성공으로 안 믿고 UNKNOWN + 결과 확인 가능", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  dropConnection(fake)
  reconnectAs(fake, "sock-2")
  // 옛 연결로 보낸 요청의 답이 새 연결 뒤에 옴 → 답 내용은 안 믿음 (결과 확인으로 정함)
  await act(async () => { fake.release("kick_room_player", { ok: true, status: "KICKED" }); await flush() })
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.canLookupResult, true)
})

test("A01-F-528-7 소켓 id가 바뀐 뒤 옛 연결의 늦은 거절 답 → 실패로 안 믿고 UNKNOWN (오류 코드 없음)", async () => {
  const { fake, view } = setup()
  fake.answer("kick_room_player", HOLD)
  act(() => view.result.current.kickPlayer(TARGET))
  dropConnection(fake)
  reconnectAs(fake, "sock-2")
  await act(async () => { fake.release("kick_room_player", { ok: false, code: "ALREADY_LEFT" }); await flush() })
  assert.equal(view.result.current.status, S.UNKNOWN)
  assert.equal(view.result.current.errorCode, null)
})

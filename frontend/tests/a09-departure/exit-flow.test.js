// 판 나가기 흐름 시험(화면 상태): 성공이면 판·방 비우고 방 목록, 거절·8초 경계·결과 확인 스냅샷·연결 없음·두 번 누름
// 목록 A09-끊김-나가기-탈주.md A09-F-045~054·166~168, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/exit-flow.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

// 판에 앉은 사람 + 그 판이 열린 대기방 값 (나가면 둘 다 비워져야 함)
function seatWithRoom(options) {
  const t = K.seat(options)
  K.RTL.act(() => {
    K.useMatchingStore.getState().setRoom({
      roomId: "a09-room", roomCode: "AB12CD", hostUuid: t.uuid(0),
      players: t.seats.map((s) => ({ uuid: s.uuid, nickname: s.nickname, isReady: true })),
    })
  })
  return t
}

// 나가기 확인 누름까지 (확인 창은 "확인")
async function pressLeave(api) {
  K.dialogs.confirmAnswer = true
  await K.call(() => api.current.requestExit())
}

test("A09-F-045 6명 판 나가기 답 ok:true → 판 스토어·방 스토어 비움, 갈 곳 방 목록(/multiplay)", async () => {
  const t = seatWithRoom({ n: 6, me: 1, jokers: [0] })
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await t.answer("leave_game_session", { ok: true })
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
  assert.equal(K.path(), "/multiplay")
})

test("A09-F-046 7명 판 나가기 답 ok:false + 코드 → 상태 failed·그 코드, 판 그대로", async () => {
  const t = seatWithRoom({ n: 7, me: 2, jokers: [0] })
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await t.answer("leave_game_session", { ok: false, code: "LEAVE_NOT_ALLOWED", message: "지금은 나갈 수 없습니다." })
  assert.equal(api.current.exitStatus, "failed")
  assert.equal(api.current.exitErrorCode, "LEAVE_NOT_ALLOWED")
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.equal(K.path(), "/ingame")
})

test("A09-F-047 8명 판 나가기 7.9초에 답 ok → 성공 처리(판 비움·방 목록)", async () => {
  const t = seatWithRoom({ n: 8, me: 3, jokers: [0, 1] })
  K.useFakeClock()
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await K.tick(7_900)
  assert.equal(api.current.exitStatus, "pending")
  mock.timers.reset()
  await t.answer("leave_game_session", { ok: true })
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.equal(K.path(), "/multiplay")
})

test("A09-F-048 5명 판 나가기 8초까지 답 없음 → 상태 unresolved", async () => {
  seatWithRoom({ n: 5, me: 1, jokers: [0] })
  K.useFakeClock()
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await K.tick(7_999)
  assert.equal(api.current.exitStatus, "pending")
  await K.tick(1)
  mock.timers.reset()
  assert.equal(api.current.exitStatus, "unresolved")
})

// 결과 모름 뒤 "나가기 결과 확인" → 스냅샷 답마다 (값 4)
const OUTCOMES = [
  ["A09-F-049", "참여 중(ok:true)", { ok: true }, "실패·STILL_PARTICIPATING"],
  ["A09-F-050", "NOT_A_PARTICIPANT", { ok: false, code: "NOT_A_PARTICIPANT" }, "나간 것"],
  ["A09-F-051", "FORFEITED_FROM_SESSION", { ok: false, code: "FORFEITED_FROM_SESSION", message: "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다." }, "나간 것"],
  ["A09-F-052", "SESSION_NOT_FOUND", { ok: false, code: "SESSION_NOT_FOUND" }, "나간 것"],
]
for (const [id, name, response, expected] of OUTCOMES) {
  test(`${id} 6명 판 나가기 결과 모름 → 결과 확인 스냅샷 ${name} → ${expected}`, async () => {
    const t = seatWithRoom({ n: 6, me: 2, jokers: [0] })
    K.useFakeClock()
    const api = await K.renderExitProbe()
    await pressLeave(api)
    await K.tick(8_000)
    mock.timers.reset()
    assert.equal(api.current.exitStatus, "unresolved")
    await K.call(() => api.current.resolveExitOutcome())
    assert.deepEqual(t.fake.sentOf("get_session_snapshot"), [{ gameId: t.gameId }])
    await t.answer("get_session_snapshot", response)
    if (expected === "나간 것") {
      assert.equal(K.useInGameStore.getState().gameId, null, `판이 안 비워짐 (상태 ${api.current?.exitStatus}·${api.current?.exitErrorCode})`)
      assert.equal(K.path(), "/multiplay")
    } else {
      assert.equal(api.current.exitStatus, "failed")
      assert.equal(api.current.exitErrorCode, "STILL_PARTICIPATING")
      assert.equal(K.useInGameStore.getState().gameId, t.gameId)
    }
  })
}

test("A09-F-053 7명 판 소켓 끊긴 채 나가기 확인 → failed·OFFLINE, leave_game_session 0번", async () => {
  const t = seatWithRoom({ n: 7, me: 1, jokers: [0] })
  const api = await K.renderExitProbe()
  t.fake.connected = false
  await pressLeave(api)
  assert.equal(api.current.exitStatus, "failed")
  assert.equal(api.current.exitErrorCode, "OFFLINE")
  assert.equal(t.fake.sentOf("leave_game_session").length, 0)
})

test("A09-F-054 8명 판 나가는 중(pending)에 또 나가기 → leave_game_session 1번 [지금 동작]", async () => {
  const t = seatWithRoom({ n: 8, me: 4, jokers: [0, 1] })
  const api = await K.renderExitProbe()
  await pressLeave(api)
  assert.equal(api.current.exitStatus, "pending")
  await pressLeave(api)
  assert.equal(t.fake.sentOf("leave_game_session").length, 1)
})

// 나간 뒤 화면 정리 (값 3)
test("A09-F-166 10명 판 나가기 성공 → 판 스토어 비움(판 id·판 값 없음)", async () => {
  const t = seatWithRoom({ n: 10, me: 5, jokers: [0, 1] })
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await t.answer("leave_game_session", { ok: true })
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.equal(K.useInGameStore.getState().state, null)
})

test("A09-F-167 5명 판 나가기 성공 → 방 스토어 비움(방 id 없음·방 안 아님)", async () => {
  const t = seatWithRoom({ n: 5, me: 2, jokers: [0] })
  const api = await K.renderExitProbe()
  await pressLeave(api)
  await t.answer("leave_game_session", { ok: true })
  assert.equal(K.useMatchingStore.getState().roomId, null)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
})

test("A09-F-168 6명 판 나가기 성공 뒤 판 화면(/ingame)을 다시 열어도 옛 판 카드 안 보임 → 방 목록", async () => {
  const t = seatWithRoom({ n: 6, me: 3, jokers: [0] })
  const api = await K.renderExitProbe({}, { at: "/leave" })
  await K.navigate("/leave")
  await pressLeave(api)
  await t.answer("leave_game_session", { ok: true })
  assert.equal(K.path(), "/multiplay")
  await K.navigate("/ingame")
  assert.equal(document.querySelectorAll("[data-ingame-player-nickname]").length, 0, "옛 판 카드가 보임")
  // 서버: 이 사람은 판이 없음
  if (t.fake.waiting.some((w) => w.event === "get_session_snapshot")) {
    await t.answer("get_session_snapshot", { ok: false, code: "NOT_A_PARTICIPANT" })
  }
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.equal(document.querySelectorAll("[data-ingame-player-nickname]").length, 0)
})

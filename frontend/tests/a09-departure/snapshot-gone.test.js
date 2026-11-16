// 판에서 빠졌다는 스냅샷 답 시험(화면 상태): 빠진 까닭 글·판 비우기·끝난 판은 그대로·다른 판 답 무시·찾는 중이면 다시 물음, 판 없이 물음, 결과 화면 새로고침
// 목록 A09-끊김-나가기-탈주.md A09-F-060~073·172~174·183, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/snapshot-gone.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { isSessionGoneResponse } = await import("../../src/domains/game/ingame/utils/sessionEnd.js")

test.afterEach(() => K.reset())

const FALLBACK = "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."
const SERVER_TEXT = "끊긴 뒤 1분이 지나 이 게임에서 빠졌습니다. (서버 글)"

// 판 + 대기방 값 넣기 (빠지면 둘 다 비워져야 함)
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

test("A09-F-060 6명 판 스냅샷 답 FORFEITED_FROM_SESSION + 서버 글 → 알림 창 글 = 서버 글", async () => {
  const t = seatWithRoom({ n: 6, me: 1, jokers: [0] })
  await K.renderSnapshotProbe()
  await t.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT })
  assert.deepEqual(K.dialogs.alerts, [SERVER_TEXT])
})

test("A09-F-061 7명 판 스냅샷 답 FORFEITED_FROM_SESSION + 글 없음 → 알림 창 글 = 기본 까닭 글", async () => {
  const t = seatWithRoom({ n: 7, me: 2, jokers: [0] })
  await K.renderSnapshotProbe()
  await t.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION" })
  assert.deepEqual(K.dialogs.alerts, [FALLBACK])
})

test("A09-F-062 8명 판 스냅샷 답 SESSION_NOT_FOUND → 알림 없이 판 비움", async () => {
  const t = seatWithRoom({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderSnapshotProbe()
  await t.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  assert.deepEqual(K.dialogs.alerts, [])
  assert.equal(K.useInGameStore.getState().gameId, null)
})

test("A09-F-063 5명 판이 끝난(ENDED) 뒤 스냅샷 답 SESSION_NOT_FOUND → 판 안 비움", async () => {
  const t = seatWithRoom({ n: 5, me: 1, jokers: [0] })
  await K.renderSnapshotProbe()
  // 광대가 나가 시민 승 → 판 끝
  await t.say("player_eliminated", t.eliminatedPayload(0, { winner: "CITIZEN" }))
  assert.equal(t.state()?.phase, "ENDED", "판 끝 반영")
  await t.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.equal(t.state()?.phase, "ENDED")
})

test("A09-F-064 6명 판 A를 묻는 사이 판 B로 바뀜 → A의 FORFEITED 답은 무시(B 그대로·알림 없음) [지금 동작]", async () => {
  const t = seatWithRoom({ n: 6, me: 1, jokers: [0] })
  await K.renderSnapshotProbe()
  // 판 B 시작 (같은 사람들)
  const nextState = { ...t.state(), id: "a09-other-game" }
  await K.RTL.act(async () => {
    K.useInGameStore.getState().setGamePayload({ gameId: "a09-other-game", state: nextState })
  })
  await K.flush()
  await t.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT })
  assert.equal(K.useInGameStore.getState().gameId, "a09-other-game")
  assert.deepEqual(K.dialogs.alerts, [])
})

test("A09-F-065 10명 판 스냅샷 답 FORFEITED_FROM_SESSION → 판 스토어·방 스토어 비움", async () => {
  const t = seatWithRoom({ n: 10, me: 5, jokers: [0, 1] })
  await K.renderSnapshotProbe()
  await t.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT })
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
})

test("A09-F-066 6명 판 스냅샷 답 SESSION_ROUTING_PENDING → 다시 물음", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  K.useFakeClock()
  t.fake.answer("get_session_snapshot", { ok: false, code: "SESSION_ROUTING_PENDING" })
  await K.renderSnapshotProbe()
  assert.equal(t.fake.sentOf("get_session_snapshot").length, 1)
  await K.tick(250)
  await K.flush()
  assert.ok(t.fake.sentOf("get_session_snapshot").length >= 2, `다시 물은 수: ${t.fake.sentOf("get_session_snapshot").length}`)
})

test("A09-F-067 7명 판 계속 SESSION_ROUTING_PENDING → 5초 예산 넘으면 더 안 물음", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  K.useFakeClock()
  t.fake.answer("get_session_snapshot", { ok: false, code: "SESSION_ROUTING_PENDING" })
  await K.renderSnapshotProbe()
  for (let i = 0; i < 24; i += 1) {
    await K.tick(250)
    await K.flush()
  }
  const at6s = t.fake.sentOf("get_session_snapshot").length
  for (let i = 0; i < 8; i += 1) {
    await K.tick(250)
    await K.flush()
  }
  mock.timers.reset()
  const at8s = t.fake.sentOf("get_session_snapshot").length
  assert.ok(at6s > 1, `다시 묻기가 없었음 (${at6s})`)
  assert.equal(at8s, at6s, "5초가 지나도 계속 물음")
})

// 판이 없어졌다는 답 고르기 (값 6)
const GONE_CASES = [
  ["A09-F-068", "SESSION_NOT_FOUND", { ok: false, code: "SESSION_NOT_FOUND" }, true],
  ["A09-F-069", "NOT_A_PARTICIPANT", { ok: false, code: "NOT_A_PARTICIPANT" }, true],
  ["A09-F-070", "FORFEITED_FROM_SESSION", { ok: false, code: "FORFEITED_FROM_SESSION" }, true],
  ["A09-F-071", "SESSION_ROUTING_PENDING", { ok: false, code: "SESSION_ROUTING_PENDING" }, false],
  ["A09-F-072", "ok:true", { ok: true, gameId: "g" }, false],
  ["A09-F-073", "null", null, false],
]
for (const [id, name, response, gone] of GONE_CASES) {
  test(`${id} 답 ${name} → 판 ${gone ? "없어짐" : "없어진 것 아님"}`, () => {
    assert.equal(isSessionGoneResponse(response), gone)
  })
}

test("A09-F-172 새로고침으로 판 값이 빈 화면 → 판 번호 없이 스냅샷 물음({})", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], bootstrap: false })
  await K.renderSnapshotProbe()
  assert.deepEqual(t.fake.sentOf("get_session_snapshot"), [{}])
})

test("A09-F-173 판 값이 빈 판 화면 → 스냅샷 답 SESSION_NOT_FOUND → 방 목록(/multiplay)", async () => {
  const t = K.seat({ n: 7, me: 2, jokers: [0], bootstrap: false })
  await K.renderPage()
  await t.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.equal(K.path(), "/multiplay")
})

test("A09-F-174 8명 판 같은 판 FORFEITED_FROM_SESSION 답이 두 번 → 알림 1번 [지금 동작]", async () => {
  const t = K.seat({ n: 8, me: 3, jokers: [0, 1] })
  t.fake.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT })
  await K.renderSnapshotProbe()
  await K.flush(12)
  assert.ok(t.fake.sentOf("get_session_snapshot").length >= 2, `물은 수 ${t.fake.sentOf("get_session_snapshot").length}`)
  assert.equal(K.dialogs.alerts.length, 1, `알림: ${JSON.stringify(K.dialogs.alerts)}`)
})

test("A09-F-183 결과 화면(판 ENDED)에서 새로고침 → 스냅샷 거절 → \"게임 결과를 확인할 수 없습니다\" 상태", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], bootstrap: false })
  await K.renderRoutes({ path: "/gameresult", routes: { "/gameresult": K.h(K.GameResultPage) } })
  await t.answer("get_session_snapshot", { ok: false, code: "NOT_A_PARTICIPANT" })
  await K.waitUntil(() => document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), { what: "결과 못 봄 글" })
  const alert = [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent)
  assert.ok(alert.includes("게임 결과를 확인할 수 없습니다"), `알림 칸: ${JSON.stringify(alert)}`)
})

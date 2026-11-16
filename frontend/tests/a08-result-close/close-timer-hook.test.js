// 결과 화면 180초 훅 시험: 닫힘 시각이 있으면 다시 안 물음, 없으면 한 번 물어 씀, 서버 닫힘 알림이 오면 판·방 지우고 로비로, 다른 판·모양 틀린 알림은 무시
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-012~016 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"

const { useGameResultCloseTimer } = await import("../../src/domains/game/result/hooks/useGameResultReturnToMatching.js")
const { computeResultSecondsLeft } = await import("../../src/domains/game/result/socket/resultClose.js")

test.afterEach(K.resetAll)

// 훅 값 보기: 닫힘 시각·남은 초를 글로 띄움
function TimerProbe() {
  const { closesAt } = useGameResultCloseTimer()
  const secondsLeft = computeResultSecondsLeft(closesAt, Date.now())
  return K.h("p", { "data-testid": "probe" }, `${closesAt ?? "없음"}|${secondsLeft ?? "없음"}`)
}
const probe = () => document.querySelector('[data-testid="probe"]')?.textContent ?? ""
const openProbe = () => K.renderAt("/gameresult", K.h(TimerProbe), { shell: false })

test("A08-F-012 5명 판: 판 상태에 닫힘 시각 있음 → 결과 화면 열어도 스냅샷 요청 0번", async () => {
  const sock = K.installFakeSocket()
  const closesAt = Date.now() + 180_000
  K.endedGame({ n: 5, me: 1, resultClosesAt: closesAt })
  await openProbe()
  await K.flush()
  assert.equal(sock.sentOf("get_session_snapshot").length, 0)
  assert.equal(probe().split("|")[0], String(closesAt))
})

test("A08-F-013 6명 판: 판 상태에 닫힘 시각 없음 → 스냅샷 한 번 → 받은 값으로 남은 초", async () => {
  const sock = K.installFakeSocket()
  // 새로 열린 결과 화면: 판 상태엔 닫힘 시각이 없음
  const g = K.endedGame({ n: 6, me: 1, resultClosesAt: null })
  const closesAt = Date.now() + 120_000
  sock.answer("get_session_snapshot", { ...g.snapshot, resultClosesAt: closesAt })
  await openProbe()
  await K.waitUntil(() => probe().startsWith(String(closesAt)), { label: "닫힘 시각" })
  assert.equal(sock.sentOf("get_session_snapshot").length, 1)
  assert.deepEqual(sock.sentOf("get_session_snapshot")[0], { gameId: g.gameId })
  assert.equal(probe(), `${closesAt}|120`)
})

test("A08-F-014 7명 판: 같은 판 game_result_closed → 판 정보·방 정보 지움, /lobby로 이동", async () => {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 7, me: 2 })
  K.useMatchingStore.getState().setRoom(K.roomOf({ uuids: [g.meUuid], hostUuid: null, reservedHostUuid: g.seats[0].uuid }))
  const view = await openProbe()
  await sock.serverSays("game_result_closed", { gameId: g.gameId, reason: "RESULT_TIMEOUT" })
  assert.equal(view.path(), "/lobby")
  assert.equal(K.useInGameStore.getState().gameId, null)
  assert.ok(K.useInGameStore.getState().state === null, "없어야 할 것이 있음: K.useInGameStore.getState().state")
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
})

test("A08-F-015 8명 판: 다른 gameId 닫힘 알림 → 이동 없음, 판 정보 그대로", async () => {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 8, me: 2 })
  const view = await openProbe()
  await sock.serverSays("game_result_closed", { gameId: K.gameIdOf(9999), reason: "RESULT_TIMEOUT" })
  assert.equal(view.path(), "/gameresult")
  assert.deepEqual(view.navigations, [])
  assert.equal(K.useInGameStore.getState().gameId, g.gameId)
})

test("A08-F-016 10명 판: 모양 틀린 닫힘 알림(null·글자) → 이동 없음", async () => {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 10, me: 2 })
  const view = await openProbe()
  await sock.serverSays("game_result_closed", null)
  await sock.serverSays("game_result_closed", g.gameId)
  assert.equal(view.path(), "/gameresult")
  assert.deepEqual(view.navigations, [])
  assert.equal(K.useInGameStore.getState().gameId, g.gameId)
  // 받는 함수는 붙어 있음 (알림을 아예 안 듣는 게 아님)
  assert.equal(sock.listenerCount("game_result_closed"), 1)
})

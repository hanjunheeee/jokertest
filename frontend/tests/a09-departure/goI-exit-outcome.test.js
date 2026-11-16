// 나가기 결과 확인·탈락 안내 고치기 시험(화면 상태): 서버가 숨겨 준 답은 나간 것으로 안 봄, 탈락 안내는 판마다 한 번
// 목록 A09-끊김-나가기-탈주.md A09-F-278~280, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/goI-exit-outcome.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

const SERVER_TEXT = "끊긴 뒤 1분이 지나 이 게임에서 빠졌습니다. (서버 글)"
const FORFEITED = { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT }

// 서버는 "그 판에 없음"을 판 밖 사람에게 그대로 안 알려 주고 INTERNAL_ERROR로 숨김 (backend socket/gameSession/core/constants.js)
// 이 답은 진짜 서버 오류일 때도 오므로 나간 것으로 보면 안 됨 → 결과 모름으로 두고 "다시 시도"에 맡김 (나가기는 또 보내도 성공으로 답함)
test("A09-F-278 6명 판 나가기 결과 모름 → 결과 확인 스냅샷 INTERNAL_ERROR → 나간 것으로 안 봄(결과 모름 그대로·판 그대로)", async () => {
  const t = K.seat({ n: 6, me: 2, jokers: [0] })
  K.useFakeClock()
  const api = await K.renderExitProbe()
  K.dialogs.confirmAnswer = true
  await K.call(() => api.current.requestExit())
  await K.tick(8_000)
  mock.timers.reset()
  assert.equal(api.current.exitStatus, "unresolved")
  await K.call(() => api.current.resolveExitOutcome())
  await t.answer("get_session_snapshot", { ok: false, code: "INTERNAL_ERROR", message: "처리 중 오류가 발생했습니다." })
  assert.equal(api.current.exitStatus, "unresolved")
  assert.equal(api.current.exitErrorCode, "INTERNAL_ERROR")
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.equal(K.path(), "/ingame")
})

test("A09-F-279 7명 판 새로고침으로 판 값이 빈 화면 → 판 번호 없이 물은 답이 FORFEITED → 까닭 글 알림 1번", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], bootstrap: false })
  await K.renderSnapshotProbe()
  assert.deepEqual(t.fake.sentOf("get_session_snapshot"), [{}])
  await t.answer("get_session_snapshot", FORFEITED)
  assert.deepEqual(K.dialogs.alerts, [SERVER_TEXT])
})

test("A09-F-280 8명 판에서 탈락 안내를 본 계정이 다음 판을 받았다가 그 판에서도 빠짐 → 안내가 그때 또 뜸(합 2번)", async () => {
  const t = K.seat({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderSnapshotProbe()
  // 첫 판에서 빠짐 → 안내 1번, 판 비움
  await t.answer("get_session_snapshot", FORFEITED)
  assert.equal(K.dialogs.alerts.length, 1)
  assert.equal(K.useInGameStore.getState().gameId, null)
  // 판 번호 없이 다시 물은 답으로 다음 판을 받음
  const nextGameId = `${t.gameId}-next`
  await t.answer("get_session_snapshot", { ...t.snapshot(), gameId: nextGameId })
  assert.equal(K.useInGameStore.getState().gameId, nextGameId)
  assert.equal(K.dialogs.alerts.length, 1)
  // 화면의 판 값이 비워진 채(새로고침과 같은 상태) 다시 물은 답이 탈락 → 다음 판의 안내
  const asked = t.fake.sentOf("get_session_snapshot").length
  K.RTL.act(() => { K.useInGameStore.getState().clearGame() })
  await K.flush()
  assert.ok(t.fake.sentOf("get_session_snapshot").length > asked, "판 값이 비워진 뒤 다시 묻지 않음")
  await t.answer("get_session_snapshot", FORFEITED)
  assert.equal(K.dialogs.alerts.length, 2, `알림: ${JSON.stringify(K.dialogs.alerts)}`)
})

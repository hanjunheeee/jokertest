// 나가기 확인 창 고르기 시험(화면 상태): 취소면 안 나감·확인이면 나가기 보냄, 브라우저 뒤로 가기만 막음
// 목록 A09-끊김-나가기-탈주.md A09-F-037~038·175~177, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/exit-controller.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { isPopNavigationBlocked } = await import("../../src/domains/game/ingame/utils/exitConfirm.js")

test.afterEach(() => K.reset())

test("A09-F-037 6명 판 낮 투표 중 나가기 → 확인 창 취소 → leave_game_session 0번", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  const api = await K.renderExitProbe()
  K.dialogs.confirmAnswer = false
  await K.call(() => api.current.requestExit())
  assert.equal(K.dialogs.confirms.length, 1, "확인 창이 한 번 뜸")
  assert.equal(t.fake.sentOf("leave_game_session").length, 0)
  assert.equal(api.current.exitStatus, "idle")
})

test("A09-F-038 6명 판 낮 투표 중 나가기 → 확인 창 확인 → leave_game_session 1번 (지금 판 id)", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  const api = await K.renderExitProbe()
  K.dialogs.confirmAnswer = true
  await K.call(() => api.current.requestExit())
  assert.deepEqual(t.fake.sentOf("leave_game_session"), [{ gameId: t.gameId }])
})

// 뒤로 가기 막기 표 (값 3)
const NAV_CASES = [
  ["A09-F-175", "POP", true],
  ["A09-F-176", "PUSH", false],
  ["A09-F-177", "REPLACE", false],
]
for (const [id, historyAction, blocked] of NAV_CASES) {
  test(`${id} 화면 옮김 ${historyAction} → ${blocked ? "막고 확인 창" : "안 막음"}`, () => {
    assert.equal(isPopNavigationBlocked({ historyAction }), blocked)
  })
}

// 판에서 빠졌을 때 화면 시험(화면 부품, 판 화면·결과 화면 전체): 빠진 까닭 알림 글·방 목록으로, 결과 화면 새로고침, 판 없음 답
// 목록 A09-끊김-나가기-탈주.md A09-F-240·241·275·277, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/forfeit-page.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

const SERVER_TEXT = "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."

// 판 화면을 열자 서버가 FORFEITED로 답함
async function forfeitedPage() {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  await K.renderPage()
  await t.answer("get_session_snapshot", { ok: false, code: "FORFEITED_FROM_SESSION", message: SERVER_TEXT })
  await K.flush()
  return t
}

test("A09-F-240 6명 판 화면에서 스냅샷 FORFEITED_FROM_SESSION → window.alert 글 = 서버 글", async () => {
  await forfeitedPage()
  assert.deepEqual(K.dialogs.alerts, [SERVER_TEXT])
})

test("A09-F-241 6명 판 FORFEITED 알림 뒤 → 주소 방 목록(/multiplay)", async () => {
  await forfeitedPage()
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.equal(K.path(), "/multiplay")
})

test("A09-F-275 결과 화면 새로고침(판 값 없음) → \"게임 결과를 확인할 수 없습니다\" + \"로비로 돌아가기\" 단추", async () => {
  const t = K.seat({ n: 7, me: 2, jokers: [0], bootstrap: false })
  await K.renderRoutes({ path: "/gameresult", routes: { "/gameresult": K.h(K.GameResultPage) } })
  await t.answer("get_session_snapshot", { ok: false, code: "NOT_A_PARTICIPANT" })
  await K.waitUntil(() => document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), { what: "결과 못 봄 글" })
  const back = K.buttonByText("로비로 돌아가기")
  assert.ok(back !== null, "로비로 돌아가기 단추 없음")
  await K.click(back)
  assert.equal(K.path(), "/lobby")
})

test("A09-F-277 8명 판 화면에서 스냅샷 SESSION_NOT_FOUND → 알림 없이 방 목록(/multiplay)", async () => {
  const t = K.seat({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderPage()
  await t.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.deepEqual(K.dialogs.alerts, [])
})

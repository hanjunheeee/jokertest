// 사망·나가기 안내 창 열림 조건 시험(화면 상태, 판 화면 전체): 죽은 사람은 사망 창, 산 사람은 나가기 실패·나가는 중에만 안내 창(사망 글 없음)
// 목록 A09-끊김-나가기-탈주.md A09-F-055~059, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/dead-choice-open.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

const DEAD_DIALOG = "사망 후 선택"
const LEAVE_DIALOG = "게임 나가기 안내"

// 판 화면 위 "게임 나가기" → 확인 창 "확인"
async function pressTopExit() {
  K.dialogs.confirmAnswer = true
  await K.click(K.topExitButton())
  await K.flush()
}

test("A09-F-055 6명 판 낮에 내가 죽은 채 판 화면 → 사망 창 열림", async () => {
  K.seat({ n: 6, me: 2, jokers: [0], dead: [2] })
  await K.renderPage()
  assert.ok(K.dialogNamed(DEAD_DIALOG) !== null, "사망 창 없음")
})

test("A09-F-056 7명 판 산 사람 나가기 실패 → 안내 창 열림, 사망 글 없음", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  await K.renderPage()
  await pressTopExit()
  await t.answer("leave_game_session", { ok: false, code: "LEAVE_NOT_ALLOWED" })
  const dialog = K.dialogNamed(LEAVE_DIALOG)
  assert.ok(dialog !== null, "안내 창 없음")
  assert.equal(dialog.textContent.includes("사망"), false)
  assert.ok(K.dialogNamed(DEAD_DIALOG) === null, "사망 창이 뜸")
})

test("A09-F-057 8명 판 산 사람 평소(나가기 안 누름) → 사망 창·안내 창 없음", async () => {
  K.seat({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderPage()
  assert.ok(K.dialogNamed(DEAD_DIALOG) === null)
  assert.ok(K.dialogNamed(LEAVE_DIALOG) === null)
})

test("A09-F-058 5명 판 산 사람 나가기 실패 안내 창 → \"게임으로 돌아가기\" 고름 → 창 닫힘", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0] })
  await K.renderPage()
  await pressTopExit()
  await t.answer("leave_game_session", { ok: false, code: "LEAVE_NOT_ALLOWED" })
  const dialog = K.dialogNamed(LEAVE_DIALOG)
  assert.ok(dialog !== null, "안내 창 없음")
  await K.click(K.buttonByText("게임으로 돌아가기", dialog))
  assert.ok(K.dialogNamed(LEAVE_DIALOG) === null, "창이 안 닫힘")
})

test("A09-F-059 10명 판 산 사람 나가기 보낸 뒤 답 오기 전(pending) → 안내 창 열림", async () => {
  K.seat({ n: 10, me: 4, jokers: [0, 1] })
  await K.renderPage()
  await pressTopExit()
  const dialog = K.dialogNamed(LEAVE_DIALOG)
  assert.ok(dialog !== null, "안내 창 없음")
  assert.ok(dialog.textContent.includes("게임에서 나가는 중입니다."))
})

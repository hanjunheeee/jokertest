// 앱 확인 창(appConfirm) 시험: 손잡이 없으면 브라우저 확인 창, 손잡이를 끼우면 그쪽(모바일 양피지 창), 확인 창이 없는 곳이면 false
// 목록 A01-F-746~749 (방 삭제·판 나가기 확인 창이 씀), 돌리기(frontend): node --experimental-test-module-mocks --test tests/shared/utils/appConfirm.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../../helpers/domSetup.mjs"

const { appConfirm, setAppConfirmHandler } = await import("../../../src/shared/utils/appConfirm.js")

const realConfirm = dom.window.confirm
test.afterEach(() => {
  setAppConfirmHandler(null)
  dom.window.confirm = realConfirm
})

test("A01-F-746 손잡이 없음 → 브라우저 확인 창(window.confirm)에 같은 글로 묻고 그 답을 돌려줌", async () => {
  const asked = []
  dom.window.confirm = (message) => { asked.push(message); return true }
  assert.equal(await appConfirm("나가시겠습니까?"), true)
  dom.window.confirm = (message) => { asked.push(message); return false }
  assert.equal(await appConfirm("정말요?"), false)
  assert.deepEqual(asked, ["나가시겠습니까?", "정말요?"])
})

test("A01-F-747 손잡이를 끼움 → 손잡이에만 묻고(브라우저 확인 창 안 부름) 손잡이 약속의 답을 돌려줌", async () => {
  let browserAsked = 0
  dom.window.confirm = () => { browserAsked += 1; return true }
  const asked = []
  setAppConfirmHandler((message) => { asked.push(message); return Promise.resolve(false) })
  assert.equal(await appConfirm("방을 삭제할까요?"), false)
  assert.deepEqual(asked, ["방을 삭제할까요?"])
  assert.equal(browserAsked, 0)
})

test("A01-F-748 함수가 아닌 값을 손잡이로 끼움 / null로 뺌 → 다시 브라우저 확인 창", async () => {
  dom.window.confirm = () => true
  setAppConfirmHandler("양피지")
  assert.equal(await appConfirm("글"), true)
  setAppConfirmHandler(() => false)
  assert.equal(await appConfirm("글"), false)
  setAppConfirmHandler(null)
  assert.equal(await appConfirm("글"), true)
})

test("A01-F-749 손잡이 없고 확인 창 함수도 없음 → false (묻지 못하면 안 한 걸로)", async () => {
  dom.window.confirm = undefined
  assert.equal(await appConfirm("글"), false)
})

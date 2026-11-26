// 결과 화면 브라우저 뒤로 가기(useBlocker) 나가기 실패 배너 시험
// 하단 버튼뿐 아니라 뒤로 가기로 나가는 시도가 실패했을 때도 result-leave-notice 배너가 뜨는지 검증함
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { notice, openResultPage, returnButton } from "./resultPage.mjs"

test.afterEach(K.resetAll)

test("W2-4A 결과 화면 뒤로 가기 + 확인 + 연결 끊김 → 연결 끊김 로비 이동 실패 배너 표시", async () => {
  const r = await openResultPage({ n: 6, connected: false, before: ["/ingame"] })
  r.dialogs.confirmAnswer = true
  await K.RTL.act(async () => { await r.view.router.navigate(-1) })
  await K.flush()

  assert.deepEqual(r.dialogs.confirms, ["로비로 나가시겠습니까?"])
  assert.ok(notice() !== null, "뒤로 가기 실패 안내 배너가 표시되어야 함")
  assert.equal(notice().getAttribute("role"), "alert")
  assert.equal(notice().getAttribute("data-notice-source"), "exit")
  assert.equal(notice().textContent, "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.")
  assert.equal(r.view.path(), "/gameresult")
})

test("W2-4B 결과 화면 뒤로 가기 + 확인 + 서버 거절 → 로비 이동 실패 배너 표시", async () => {
  const r = await openResultPage({ n: 6, before: ["/ingame"] })
  r.dialogs.confirmAnswer = true
  r.sock.answer("leave_game_session", { ok: false, code: "STILL_PARTICIPATING" })

  await K.RTL.act(async () => { await r.view.router.navigate(-1) })
  await K.waitUntil(() => notice() !== null, { label: "뒤로 가기 서버 거절 안내 배너" })

  assert.equal(notice().getAttribute("data-notice-source"), "exit")
  assert.equal(notice().textContent, "로비로 가지 못했습니다. '로비로'를 다시 눌러 주세요.")
  assert.equal(r.view.path(), "/gameresult")
})

test("W2-4C 대기방 복귀 실패 배너가 떠 있을 때 뒤로 가기 나가기 시도 → 이전 대기방 실패 글을 지우고 exit 출처로 전환", async () => {
  const r = await openResultPage({ n: 6, before: ["/ingame"] })
  r.sock.answer("return_to_room", { ok: false, code: "ROOM_FULL" })
  await K.click(returnButton())
  await K.waitUntil(() => notice() !== null, { label: "대기방 실패 글" })
  assert.equal(notice().getAttribute("data-notice-source"), "return")

  r.dialogs.confirmAnswer = true
  r.sock.answer("leave_game_session", K.HOLD)
  await K.RTL.act(async () => { await r.view.router.navigate(-1) })
  await K.flush()

  assert.equal(notice(), null, "새 나가기 진행 중엔 이전 대기방 실패 글이 사라짐")
})

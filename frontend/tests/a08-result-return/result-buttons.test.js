// 결과 화면 단추 시험: 대기방으로 누르는 중엔 "이동 중.."·두 단추 잠김, 로비로 가는 중에도 잠김, 안내는 마지막에 누른 단추 것, 실패 안내 자리, 결과 없음 화면
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-038~041·048·061~062 (화면 부품, 결과 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { GameResultPage, lobbyButton, notice, openResultPage, returnButton } from "./resultPage.mjs"

test.afterEach(K.resetAll)

test("A08-F-038 6명 판: 대기방으로 누르는 중 → 자리 글 \"이동 중..\", 두 단추 다 꺼짐", async () => {
  const r = await openResultPage({ n: 6 })
  r.sock.answer("return_to_room", K.HOLD)
  await K.click(returnButton())
  assert.ok(K.button("이동 중..") !== null, "\"이동 중..\" 글이 없음")
  assert.equal(K.button("이동 중..").disabled, true)
  assert.equal(lobbyButton().disabled, true)
  // 답이 오기 전엔 대기방 화면으로 안 감
  assert.equal(r.view.path(), "/gameresult")
})

test("A08-F-039 7명 판: 로비로 가는 중 → 두 단추 다 꺼짐", async () => {
  const r = await openResultPage({ n: 7 })
  r.sock.answer("leave_game_session", K.HOLD)
  r.dialogs.confirmAnswer = true
  await K.click(lobbyButton())
  assert.equal(r.sock.sentOf("leave_game_session").length, 1)
  assert.equal(returnButton().disabled, true)
  assert.equal(lobbyButton().disabled, true)
})

test("A08-F-040 8명 판: 대기방으로 실패 글 보임 → \"로비로\" 누름 → 대기방 글 사라짐", async () => {
  const r = await openResultPage({ n: 8 })
  r.sock.answer("return_to_room", { ok: false, code: "ROOM_FULL" })
  await K.click(returnButton())
  await K.waitUntil(() => notice() !== null, { label: "대기방 실패 글" })
  assert.equal(notice().textContent, "대기방 정원이 가득 차 들어갈 수 없습니다.")
  r.sock.answer("leave_game_session", K.HOLD)
  r.dialogs.confirmAnswer = true
  await K.click(lobbyButton())
  assert.ok(notice() === null, "없어야 할 것이 있음: notice()")
  assert.equal(document.body.textContent.includes("대기방 정원이 가득 차"), false)
})

test("A08-F-041 9명 판: 실패 안내 자리 → result-leave-notice, role=\"alert\", data-notice-source = return / exit", async () => {
  const r = await openResultPage({ n: 9 })
  // 대기방으로 실패
  r.sock.answer("return_to_room", { ok: false, code: "ROOM_NOT_FOUND" })
  await K.click(returnButton())
  await K.waitUntil(() => notice() !== null, { label: "대기방 실패 글" })
  assert.equal(notice().getAttribute("role"), "alert")
  assert.equal(notice().getAttribute("data-notice-source"), "return")
  // 로비로 실패
  r.dialogs.confirmAnswer = true
  r.sock.answer("leave_game_session", { ok: false, code: "SOMETHING" })
  await K.click(lobbyButton())
  await K.waitUntil(() => notice()?.getAttribute("data-notice-source") === "exit", { label: "로비로 실패 글" })
  assert.equal(notice().getAttribute("role"), "alert")
  assert.equal(notice().textContent, "로비로 가지 못했습니다. '로비로'를 다시 눌러 주세요.")
})

test("A08-F-048 결과 없음 → \"게임 결과를 확인할 수 없습니다\" + \"로비로 돌아가기\" 단추 → 누르면 /lobby", async () => {
  const sock = K.installFakeSocket()
  K.signIn("a07a0000-0000-4000-8000-000000444001", "나")
  sock.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  const view = await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.waitUntil(() => document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), { label: "결과 없음 안내" })
  const back = K.button("로비로 돌아가기")
  assert.ok(back !== null, "로비로 돌아가기 단추 없음")
  await K.click(back)
  assert.equal(view.path(), "/lobby")
})

// ---------- A08-F-061~062 결과 화면에서 끊겼다 다시 이어짐 → 결과 화면이 남아 "다시 눌러 주세요"대로 다시 누를 수 있음 ----------
// 다시 이어질 때 스냅샷을 다시 묻는데, 그 답이 반영되지 않으면 받아 둔 승패 결과를 지워 "게임 결과를 확인할 수 없습니다"로 바뀌던 것

// 끊긴 채 "대기방으로" → 연결 안내 → 새 소켓 번호로 다시 이어짐(스냅샷 답 snapshotAnswer)
async function cutAndReconnect(r, snapshotAnswer) {
  r.sock.connected = false
  await K.click(returnButton())
  await K.waitUntil(() => notice() !== null, { label: "연결 안내" })
  assert.equal(notice().textContent, "연결이 끊겨 대기방으로 가지 못했습니다. 연결을 확인한 뒤 '대기방으로'를 다시 눌러 주세요.")
  r.sock.answer("get_session_snapshot", snapshotAnswer)
  r.sock.id = "sock-a07-again"
  r.sock.connected = true
  await r.sock.serverSays("connect")
  await K.flush(12)
  assert.ok(r.sock.sentOf("get_session_snapshot").length >= 2, "다시 이어진 뒤 스냅샷을 안 물음")
  assert.equal(document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), false, "결과 화면이 사라짐")
  assert.ok(returnButton() !== null, "대기방으로 단추가 없음")
}

test("A08-F-061 5명 판: 끊겨 \"대기방으로\" 실패 → 다시 이어짐(스냅샷 답이 반영 안 됨: INTERNAL_ERROR) → 결과 화면 그대로 → 다시 누르면 대기방", async () => {
  const r = await openResultPage({ n: 5 })
  await cutAndReconnect(r, { ok: false, code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." })
  r.sock.answer("return_to_room", { ok: true, room: K.roomOf({ uuids: r.seats.map((s) => s.uuid) }) })
  await K.click(returnButton())
  await K.waitUntil(() => r.view.path() === "/game-matching", { label: "대기방으로 이동" })
})

test("A08-F-062 6명 판: 끊겨 \"대기방으로\" 실패 → 다시 이어짐(서버가 끊길 때 판에서 뺌: NOT_A_PARTICIPANT) → 결과 화면 그대로 → 다시 누르면 \"결과 화면 시간이 지나…\" 글", async () => {
  const r = await openResultPage({ n: 6 })
  await cutAndReconnect(r, { ok: false, code: "NOT_A_PARTICIPANT", message: "요청이 거절되었습니다." })
  r.sock.answer("return_to_room", { ok: false, code: "SESSION_ENDED" })
  await K.click(returnButton())
  await K.waitUntil(() => notice()?.textContent === "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.", { label: "시간 지남 글" })
  assert.equal(r.view.path(), "/gameresult")
})

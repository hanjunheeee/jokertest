// 결과 화면 "로비로" 시험: 확인 창 글 "로비로 나가시겠습니까?", 취소면 그대로, 확인이면 leave_game_session → /lobby, 실패 글 세 가지, 뒤로 가기도 같은 확인 창
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-042~047·049 (화면 부품, 결과 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { lobbyButton, notice, openResultPage } from "./resultPage.mjs"

test.afterEach(K.resetAll)

const board = () => document.querySelector('section[aria-label="가면무도회 참가자 정체"]')

test("A08-F-042 6명 판: \"로비로\" → 확인 창 글 \"로비로 나가시겠습니까?\" (\"게임에서 나가시겠습니까?\" 아님)", async () => {
  const r = await openResultPage({ n: 6 })
  r.dialogs.confirmAnswer = false
  await K.click(lobbyButton())
  assert.deepEqual(r.dialogs.confirms, ["로비로 나가시겠습니까?"])
  assert.equal(r.dialogs.confirms.some((text) => text.includes("게임에서 나가시겠습니까?")), false)
})

test("A08-F-043 7명 판: 확인 창 취소 → leave_game_session 안 보냄, 결과 화면 그대로", async () => {
  const r = await openResultPage({ n: 7 })
  r.dialogs.confirmAnswer = false
  await K.click(lobbyButton())
  await K.flush()
  assert.equal(r.dialogs.confirms.length, 1)
  assert.equal(r.sock.sentOf("leave_game_session").length, 0)
  assert.equal(r.view.path(), "/gameresult")
  assert.ok(board() !== null, "결과판이 사라짐")
  assert.equal(lobbyButton().disabled, false)
})

test("A08-F-044 8명 판: 확인 → leave_game_session 보냄 → 성공 답 → /lobby", async () => {
  const r = await openResultPage({ n: 8 })
  r.dialogs.confirmAnswer = true
  r.sock.answer("leave_game_session", { ok: true })
  await K.click(lobbyButton())
  await K.waitUntil(() => r.view.path() === "/lobby", { label: "로비 이동" })
  assert.deepEqual(r.sock.sentOf("leave_game_session"), [{ gameId: r.gameId }])
  assert.equal(K.useInGameStore.getState().gameId, null)
})

test("A08-F-045 9명 판 로비로 실패 글: 연결 끊김 → \"연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.\"", async () => {
  const r = await openResultPage({ n: 9, connected: false })
  r.dialogs.confirmAnswer = true
  await K.click(lobbyButton())
  await K.flush()
  assert.equal(notice()?.textContent, "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.")
  assert.equal(r.sock.sentOf("leave_game_session").length, 0)
  assert.equal(r.view.path(), "/gameresult")
})

test("A08-F-046 10명 판 로비로 실패 글: 거절 → \"로비로 가지 못했습니다. '로비로'를 다시 눌러 주세요.\"", async () => {
  const r = await openResultPage({ n: 10 })
  r.dialogs.confirmAnswer = true
  r.sock.answer("leave_game_session", { ok: false, code: "STILL_PARTICIPATING" })
  await K.click(lobbyButton())
  await K.waitUntil(() => notice() !== null, { label: "로비로 실패 글" })
  assert.equal(notice().textContent, "로비로 가지 못했습니다. '로비로'를 다시 눌러 주세요.")
  assert.equal(r.view.path(), "/gameresult")
})

test("A08-F-047 5명 판 로비로 실패 글: 답 없음 → \"서버 답이 없어 로비로 갔는지 확인하지 못했습니다. …\"", async () => {
  K.startFakeClock(Date.now())
  const r = await openResultPage({ n: 5 })
  r.dialogs.confirmAnswer = true
  // leave_game_session 답 안 옴 → 8초 뒤 결과 모름
  await K.click(lobbyButton())
  assert.ok(notice() === null, "없어야 할 것이 있음: notice()")
  await K.tick(8_000)
  assert.match(notice()?.textContent ?? "", /^서버 답이 없어 로비로 갔는지 확인하지 못했습니다\. /)
  assert.equal(r.view.path(), "/gameresult")
})

test("A08-F-049 6명 판: 결과 화면에서 브라우저 뒤로 가기 → 같은 확인 창 \"로비로 나가시겠습니까?\"", async () => {
  const r = await openResultPage({ n: 6, before: ["/ingame"] })
  r.dialogs.confirmAnswer = false
  await K.RTL.act(async () => { await r.view.router.navigate(-1) })
  await K.flush()
  assert.deepEqual(r.dialogs.confirms, ["로비로 나가시겠습니까?"])
  // 취소했으니 결과 화면 그대로
  assert.equal(r.view.path(), "/gameresult")
})

// 판 화면 나가기 단추 시험(화면 부품, 판 화면·결과 화면 전체): 확인 창 글(산·죽음·결과 화면), 취소면 그대로, 단추는 산·죽은 사람 모두, 성공하면 방 목록, 나간 뒤 뒤로 가기
// 목록 A09-끊김-나가기-탈주.md A09-F-215~221·268, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/exit-button.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { EXIT_CONFIRM_MESSAGES } = await import("../../src/domains/game/ingame/utils/exitConfirm.js")

test.afterEach(() => K.reset())

const LOSS_LINE = "지금 나가면 패배로 기록되고 골드를 못 받습니다."
const LIMIT_LINE = "오늘 1번째 5분, 2번째 30분, 3번째부터 1일"
const DEAD_LINE = "사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다."

test("A09-F-215 6명 판 산 사람 \"게임 나가기\" → 확인 창 글 = 산 사람 글(패배·골드·탈주 제한)", async () => {
  K.seat({ n: 6, me: 1, jokers: [0] })
  await K.renderPage()
  K.dialogs.confirmAnswer = false
  await K.click(K.topExitButton())
  assert.equal(K.dialogs.confirms.length, 1)
  const text = K.dialogs.confirms[0]
  assert.ok(text.includes("게임에서 나가시겠습니까?"), text)
  assert.ok(text.includes(LOSS_LINE), text)
  assert.ok(text.includes(LIMIT_LINE), text)
})

test("A09-F-216 7명 판 죽은 사람(관전 계속 뒤) \"게임 나가기\" → 확인 창 글 = 죽은 사람 글", async () => {
  K.seat({ n: 7, me: 2, jokers: [0], dead: [2] })
  await K.renderPage()
  await K.click(K.buttonByText("관전 계속하기", K.dialogNamed("사망 후 선택")))
  K.dialogs.confirmAnswer = false
  await K.click(K.topExitButton())
  assert.equal(K.dialogs.confirms.length, 1)
  assert.ok(K.dialogs.confirms[0].includes(DEAD_LINE), K.dialogs.confirms[0])
  assert.equal(K.dialogs.confirms[0].includes("패배"), false)
})

test("A09-F-217 5명 판 결과 화면 \"로비로\" → 확인 창 글 = \"로비로 나가시겠습니까?\"", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0] })
  await K.renderRoutes({ path: "/gameresult", routes: { "/gameresult": K.h(K.GameResultPage) } })
  // 광대가 빠져 시민 승 → 결과 값
  await t.say("player_eliminated", t.eliminatedPayload(0, { winner: "CITIZEN" }))
  await K.waitUntil(() => document.querySelector("video") !== null || document.querySelector('button[aria-label="로비로"]') !== null, { what: "결과 연출" })
  const video = document.querySelector("video")
  if (video) await K.RTL.act(async () => { K.RTL.fireEvent(video, new Event("ended")) })
  await K.waitUntil(() => document.querySelector('button[aria-label="로비로"]') !== null, { what: "로비로 단추" })
  K.dialogs.confirmAnswer = false
  await K.click(document.querySelector('button[aria-label="로비로"]'))
  assert.deepEqual(K.dialogs.confirms, ["로비로 나가시겠습니까?"])
  assert.equal(EXIT_CONFIRM_MESSAGES.RESULT, "로비로 나가시겠습니까?")
})

test("A09-F-218 8명 판 확인 창 취소 → 판 화면·내 카드 그대로", async () => {
  const t = K.seat({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderPage()
  K.dialogs.confirmAnswer = false
  await K.click(K.topExitButton())
  assert.equal(K.path(), "/ingame")
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.ok(document.querySelector(`[data-ingame-player-nickname="${t.nick(3)}"]`) !== null, "내 카드가 없어짐")
  assert.equal(t.fake.sentOf("leave_game_session").length, 0)
})

test("A09-F-219 10명 판 산 사람 → 판 중 \"게임 나가기\" 단추 보임", async () => {
  K.seat({ n: 10, me: 4, jokers: [0, 1] })
  await K.renderPage()
  assert.ok(K.topExitButton() !== null)
})

test("A09-F-220 6명 판 죽은 사람 → 판 중 \"게임 나가기\" 단추 보임", async () => {
  K.seat({ n: 6, me: 3, jokers: [0], dead: [3] })
  await K.renderPage()
  assert.ok(K.topExitButton() !== null)
})

test("A09-F-221 7명 판 나가기 답 ok → 주소 방 목록(/multiplay)", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  await K.renderPage()
  K.dialogs.confirmAnswer = true
  await K.click(K.topExitButton())
  await t.answer("leave_game_session", { ok: true })
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  assert.equal(K.path(), "/multiplay")
})

test("A09-F-268 8명 판 나가기 성공 → 뒤로 가기 → 옛 판 안 보임(방 목록)", async () => {
  const t = K.seat({ n: 8, me: 2, jokers: [0, 1] })
  await K.renderRoutes({ path: "/ingame", entries: ["/multiplay", "/ingame"] })
  K.dialogs.confirmAnswer = true
  await K.click(K.topExitButton())
  await t.answer("leave_game_session", { ok: true })
  await K.waitUntil(() => K.path() === "/multiplay", { what: "방 목록으로" })
  await K.goBack()
  assert.equal(K.path(), "/multiplay")
  assert.equal(document.querySelectorAll("[data-ingame-player-nickname]").length, 0, "옛 판 카드가 보임")
})

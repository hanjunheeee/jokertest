// 재판 창 거절 까닭 글 시험(jsdom): 서버가 표를 거절하거나 응답이 없으면 role="alert" 글이 뜨고, 재판이 끝나거나 다음 날이면 사라짐
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-214~219, A04-F-257~264
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

test.afterEach(resetTable)

const { screen, within } = RTL

const tribunalDialog = () => screen.queryByRole("dialog", { name: "재판" })
const voteButton = (name) => within(tribunalDialog()).queryByRole("button", { name })
// 화면에 뜬 알림 글 전부
const alertTexts = () => screen.queryAllByRole("alert").map((node) => node.textContent.trim())

// 재판 중인 인게임 화면에서 유죄를 누르고 서버가 거절함 (message가 null이면 글 없이 코드만 옴)
async function rejectedPage(n, code, message = "server says no") {
  const t = await openTable({ n, view: "page" })
  await t.openTribunal(3)
  await t.click(voteButton("유죄"))
  await t.answer("cast_tribunal_vote", { ok: false, code, ...(message === null ? {} : { message }) })
  return t
}

;[
  ["A04-F-214", "TRIBUNAL_ALREADY_RESOLVED", "재판이 이미 판정되어 투표할 수 없습니다."],
  ["A04-F-215", "TRIBUNAL_VOTE_ALREADY_SUBMITTED", "이미 표를 냈습니다. 낸 표는 바꿀 수 없습니다."],
  ["A04-F-216", "INVALID_PHASE", "재판이 끝나 투표할 수 없습니다."],
  ["A04-F-217", "STALE_DAY_INDEX", "지난 재판이라 투표할 수 없습니다."],
].forEach(([id, code, text]) => {
  test(`${id} [버그 8] 6명 판: 거절 ${code} → 재판 창 위 role="alert" 글 "${text}"`, async () => {
    await rejectedPage(6, code)
    assert.deepEqual(alertTexts(), [text])
    // 재판 창은 그대로 (다시 누를 수 있게)
    assert.ok(voteButton("유죄"))
  })
})

test("A04-F-218 7명 판: 응답 없이 5초 → role=\"alert\" \"요청 시간이 초과되었습니다.\"", async () => {
  useFakeClock()
  const t = await openTable({ n: 7, view: "page" })
  await t.openTribunal(3)
  await t.click(voteButton("유죄"))
  assert.deepEqual(alertTexts(), [])
  await tick(5_000)
  assert.deepEqual(alertTexts(), ["요청 시간이 초과되었습니다."])
})

test("A04-F-219 [지금 동작] 8명 판: 거절 글 뒤 다시 누르면 답 전엔 글 없음", async () => {
  const t = await rejectedPage(8, "INTERNAL_ERROR")
  assert.equal(alertTexts().length, 1)
  await t.click(voteButton("유죄"))
  assert.deepEqual(alertTexts(), [])
})

test("A04-F-257 8명 판: 거절 글 뒤 재판 결과 반영 → 글 없음", async () => {
  const t = await rejectedPage(8, "INTERNAL_ERROR")
  assert.equal(alertTexts().length, 1)
  await t.resolve("NOT_GUILTY")
  assert.deepEqual(alertTexts(), [])
})

test("A04-F-258 [버그 8] 6명 판: 1일 거절 글이 2일 재판에 안 남음", async () => {
  const t = await rejectedPage(6, "TRIBUNAL_ALREADY_RESOLVED")
  assert.equal(alertTexts().length, 1)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.ok(tribunalDialog(), "2일 재판 창이 없음")
  assert.deepEqual(alertTexts(), [])
})

;[
  ["A04-F-259", 5, "INTERNAL_ERROR", "서버에서 처리하지 못했습니다. 다시 시도해주세요."],
  ["A04-F-260", 6, "STALE_SOCKET", "다른 창에서 접속 중이라 이 창에서는 투표할 수 없습니다."],
  ["A04-F-261", 7, "NOT_IN_SESSION", "지금 참여 중인 판이 아니라 투표할 수 없습니다."],
  ["A04-F-262", 8, "DEFENDANT_CANNOT_VOTE", "재판에 오른 사람은 투표할 수 없습니다."],
  ["A04-F-263", 10, "PLAYER_NOT_ALIVE", "죽은 사람은 투표할 수 없습니다."],
].forEach(([id, n, code, text]) => {
  test(`${id} ${n}명 판: 거절 ${code} → "${text}"`, async () => {
    await rejectedPage(n, code)
    assert.deepEqual(alertTexts(), [text])
  })
})

test("A04-F-264 5명 판: 모르는 코드 X·글 없음 → \"제출하지 못했습니다. 다시 시도해주세요.\"", async () => {
  await rejectedPage(5, "X", null)
  assert.deepEqual(alertTexts(), ["제출하지 못했습니다. 다시 시도해주세요."])
})

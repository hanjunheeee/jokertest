// 밤 시민 채팅 칸·크게 보기 창 시험(jsdom, 인게임 화면 전체) — 밤 산 시민은 입력칸 대신 까닭 글, 다음 낮엔 다시 씀, 크게 보기에서 보내기·글자 그대로·길이 문구
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-104~112, A06-F-194~196
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable } from "./a06Kit.mjs"

test.afterEach(resetTable)

const CLOSED_TEXT = "밤에는 귀족이 채팅을 쓸 수 없습니다"
const anyInput = () => document.querySelector('textarea[aria-label="채팅 입력"]')
const chatEvents = (t) => t.sentOf("submit_game_chat_message").length + t.sentOf("submit_joker_chat_message").length

// 6명 판: 0번 광대, 5번 의사, 나 = 2번 시민
const citizenTable = (options = {}) =>
  openTable({ n: 6, me: 2, myRole: "CITIZEN", roles: { 0: "JOKER", 5: "DOCTOR" }, view: "page", ...options })

test("A06-F-104 [단위 2] 밤 산 시민 보드 모양: 입력칸·보내기 단추 없음, 그 자리에 까닭 글", async () => {
  const t = await citizenTable({ phase: "NIGHT" })
  assert.equal(t.input("board") === null, true)
  assert.equal(t.sendButton("board") === null, true)
  assert.equal(t.closedText("board")?.textContent, CLOSED_TEXT)
})

test("A06-F-105 [단위 2] 밤 산 시민 크게 보기 모양: 입력칸 없음·까닭 글", async () => {
  const t = await citizenTable({ phase: "NIGHT" })
  await t.openCloseup()
  assert.ok(t.closeup(), "크게 보기 창이 안 열림")
  assert.equal(t.input("closeup") === null, true)
  assert.equal(t.sendButton("closeup") === null, true)
  assert.equal(t.closedText("closeup")?.textContent, CLOSED_TEXT)
})

test("A06-F-106 까닭 글은 화면 읽기에 읽힘: role=\"status\"", async () => {
  const t = await citizenTable({ phase: "NIGHT" })
  assert.equal(t.closedText("board")?.getAttribute("role"), "status")
})

test("A06-F-107 시민이 다음 낮엔 다시 씀: 밤(닫힘) → 낮 시작 알림 → 입력칸 있음, 까닭 글 없음", async () => {
  const t = await citizenTable({ phase: "NIGHT" })
  assert.equal(t.input("board") === null, true)
  await t.nextDay()
  assert.ok(t.input("board"), "낮인데 입력칸이 없음")
  assert.equal(t.closedText("board") === null, true)
})

test("A06-F-108 [단위 2] 낮에 크게 보기 열고 쓰던 중 밤이 됨 → 입력칸 사라지고 까닭 글", async () => {
  const t = await citizenTable({ phase: "DAY" })
  await t.openCloseup()
  await t.type("쓰던 중", "closeup")
  await t.toNight()
  assert.equal(anyInput() === null, true, "밤인데 입력칸이 남음")
  assert.equal(t.closedText()?.textContent, CLOSED_TEXT)
})

test("A06-F-109 [단위 2] 시민이 낮에 쳐 둔 글 \"x\"는 밤에 안 나감: 엔터 칠 칸 없음, 사건 0", async () => {
  const t = await citizenTable({ phase: "DAY" })
  await t.type("x")
  await t.toNight()
  assert.equal(anyInput() === null, true)
  assert.equal(chatEvents(t), 0)
})

test("A06-F-110 [단위 2] 8명 판 밤 산 경비원 → 입력칸 있음, 까닭 글 없음", async () => {
  const t = await openTable({ n: 8, me: 3, myRole: "GUARD", roles: { 0: "JOKER", 5: "DOCTOR" }, phase: "NIGHT", view: "page" })
  assert.ok(t.input("board"), "경비원 입력칸이 없음")
  assert.equal(t.closedText("board") === null, true)
})

test("A06-F-111 10명 판 첫 밤(차례 없음) 산 마녀사냥꾼 → 입력칸 있음", async () => {
  const t = await openTable({
    n: 10, me: 4, myRole: "WITCH_HUNTER", roles: { 0: "JOKER", 1: "JOKER", 5: "DOCTOR", 6: "GUARD" }, phase: "NIGHT", view: "page",
  })
  assert.equal(t.state().nightTurnRole, null)
  assert.ok(t.input("board"), "마녀사냥꾼 입력칸이 없음")
  assert.equal(t.closedText("board") === null, true)
})

test("A06-F-112 시민 화면에 (잘못 온) 같은 직업 글 하나 → 목록에 안 그림", async () => {
  const t = await citizenTable({ phase: "NIGHT" })
  await t.roleChat(0, "광대끼리 비밀")
  assert.deepEqual(t.rows("board"), [])
  assert.equal(document.body.textContent.includes("광대끼리 비밀"), false)
})

test("A06-F-194 크게 보기 창에서 Enter → 사건 1번, 보드 목록에도 같은 줄 [지금 동작]", async () => {
  const t = await citizenTable({ phase: "DAY" })
  await t.openCloseup()
  await t.type("크게 보며 씀", "closeup")
  await t.enter("closeup")
  assert.deepEqual(t.sentOf("submit_game_chat_message"), [{ gameId: t.gameId, text: "크게 보며 씀" }])
  // 서버가 판 전원에게 돌려 보냄
  await t.dayChat(2, "크게 보며 씀")
  assert.equal(t.rows("closeup").filter((row) => row.includes("크게 보며 씀")).length, 1)
  assert.equal(t.rows("board").filter((row) => row.includes("크게 보며 씀")).length, 1)
})

test("A06-F-195 크게 보기 창 XSS: 받은 글 <script> → 글자 그대로, 스크립트 요소 없음", async () => {
  const t = await citizenTable({ phase: "DAY" })
  await t.openCloseup()
  await t.dayChat(1, "<script>alert(1)</script>")
  const row = t.rowEls("closeup")[0]
  assert.ok(row, "크게 보기 목록에 줄이 없음")
  assert.ok(row.textContent.includes("<script>alert(1)</script>"))
  assert.equal(row.querySelectorAll("script").length, 0)
})

test("A06-F-196 크게 보기 창에서 151자 → 상태 줄에 길이 문구", async () => {
  const t = await citizenTable({ phase: "DAY" })
  await t.openCloseup()
  await t.type("가".repeat(151), "closeup")
  await t.enter("closeup")
  assert.equal(t.statusText("closeup"), "메시지는 150자 이하로 입력해주세요.")
  assert.equal(chatEvents(t), 0)
})

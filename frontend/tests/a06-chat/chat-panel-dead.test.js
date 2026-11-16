// 죽은 사람 채팅 칸 시험(jsdom, 인게임 화면 전체) — "죽은 사람끼리" 표시, 죽은 사람 줄만 회색 이름 띠, 밤에도 잠금·차례 안내 없이 씀
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-113~119, A06-F-197~198
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable } from "./a06Kit.mjs"

test.afterEach(resetTable)

// 줄의 이름 띠 글자색 (죽은 사람 줄은 회색 #a9a9a9 이름 띠, 말은 모든 줄이 기본색 — 결정 2026-11-16 밤 "말은 기본 글자색")
const GRAY = "rgb(169, 169, 169)"
const rowColor = (li) => li.querySelector("[data-chat-name-band]")?.style.color ?? ""
// 줄 글 → 회색인지
const grayByText = (rows) => Object.fromEntries(rows.map((li) => [li.textContent.replace(/^.*?"|"$/g, ""), rowColor(li) === GRAY]))

// 7명 판: 0번 광대, 5번 의사, 나 = 3번, 죽은 사람 3·4번
const deadTable = (options = {}) =>
  openTable({ n: 7, me: 3, roles: { 0: "JOKER", 5: "DOCTOR" }, dead: [3, 4], view: "page", ...options })

test("A06-F-113 죽은 사람 낮 → 보드 모양에 \"죽은 사람끼리\" 표시", async () => {
  const t = await deadTable({ phase: "DAY" })
  assert.equal(t.deadBadge("board")?.textContent, "죽은 사람끼리")
})

test("A06-F-114 죽은 사람 낮 → 크게 보기 모양에도 \"죽은 사람끼리\" 표시", async () => {
  const t = await deadTable({ phase: "DAY" })
  await t.openCloseup()
  assert.ok(t.closeup(), "크게 보기 창이 안 열림")
  assert.equal(t.deadBadge("closeup")?.textContent, "죽은 사람끼리")
})

test("A06-F-115 낮 줄·죽은 사람 줄 → 죽은 사람 줄만 회색 이름 띠", async () => {
  const t = await deadTable({ phase: "DAY" })
  await t.dayChat(1, "산사람말")
  await t.deadChat(4, "죽은사람말")
  assert.deepEqual(grayByText(t.rowEls("board")), { 산사람말: false, 죽은사람말: true })
})

test("A06-F-116 산 사람 화면엔 낮·밤 둘 다 \"죽은 사람끼리\" 없음", async () => {
  const t = await openTable({ n: 7, me: 5, myRole: "DOCTOR", roles: { 0: "JOKER" }, dead: [4], phase: "DAY", view: "page" })
  assert.equal(t.deadBadge() === null, true, "낮에 표시가 있음")
  await t.toNight()
  assert.ok(t.input("board"), "밤 의사 입력칸이 없음")
  assert.equal(t.deadBadge() === null, true, "밤에 표시가 있음")
})

test("A06-F-117 죽은 광대 밤(7명 판 광대 2): 광대 말 보이고 내 글은 죽은 사람 채널(submit_game_chat_message)", async () => {
  const t = await openTable({ n: 7, me: 1, myRole: "JOKER", roles: { 0: "JOKER" }, dead: [1, 4], phase: "NIGHT", view: "page" })
  await t.roleChat(0, "오늘 누구")
  assert.ok(t.rows("board").some((row) => row.includes("오늘 누구")), "광대 말이 안 보임")
  await t.type("나는 죽었어")
  await t.enter()
  assert.deepEqual(t.sentOf("submit_game_chat_message"), [{ gameId: t.gameId, text: "나는 죽었어" }])
  assert.equal(t.sentOf("submit_joker_chat_message").length, 0)
})

test("A06-F-118 죽은 사람은 밤에 화면 잠금 없음: 입력칸이 잠긴 덮개 밖, 보내기 됨", async () => {
  const t = await deadTable({ phase: "NIGHT" })
  const input = t.input("board")
  assert.ok(input, "입력칸이 없음")
  assert.equal(input.closest("[inert]") === null, true, "입력칸이 잠긴 덮개 안에 있음")
  assert.equal(input.disabled, false)
  await t.type("밤에도 말함")
  await t.enter()
  assert.equal(t.sentOf("submit_game_chat_message").length, 1)
})

test("A06-F-119 죽은 사람에겐 밤 차례 알림이 와도 안내 창 없음, 입력 됨", async () => {
  const t = await deadTable({ phase: "NIGHT" })
  await t.nightTurn("JOKER")
  assert.equal(document.querySelector("[data-night-turn-role]") === null, true, "차례 안내 창이 뜸")
  assert.equal(document.body.textContent.includes("시간입니다"), false)
  const input = t.input("board")
  assert.ok(input !== null)
  assert.equal(input.closest("[inert]") === null, true, "입력칸이 잠김")
  await t.type("차례 중에도")
  await t.enter()
  assert.equal(t.sentOf("submit_game_chat_message").length, 1)
})

test("A06-F-197 크게 보기 창에서도 죽은 사람 줄 회색 이름 띠", async () => {
  const t = await deadTable({ phase: "DAY" })
  await t.openCloseup()
  await t.dayChat(1, "산사람말")
  await t.deadChat(4, "죽은사람말")
  assert.deepEqual(grayByText(t.rowEls("closeup")), { 산사람말: false, 죽은사람말: true })
})

test("A06-F-198 밤 산 의사 칸엔 \"죽은 사람끼리\" 없음", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER" }, dead: [4], phase: "NIGHT", view: "page" })
  assert.ok(t.input("board"))
  assert.equal(t.deadBadge("board") === null, true)
})

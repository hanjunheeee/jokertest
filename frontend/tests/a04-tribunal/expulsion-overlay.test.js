// 추방 연출 창 시험(jsdom): 유죄면 영상 뒤 "[닉네임]님이 … 추방" 글, 무죄·취소면 없음, 직업·표 수는 안 보이고, 끝나면 밤 안내나 결과 화면
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-233~237, A04-F-265~267
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick, RESULT_PAGE_TEXT } from "./tribunalTable.mjs"

test.afterEach(resetTable)

const { screen } = RTL

// 추방 연출 창 (없으면 null)
const expulsionLayer = () => document.querySelector("[data-ingame-tribunal-expulsion]")
const expelledText = (nick) => `[${nick}]님이 가면무도회에서 추방당하셨습니다.`

// 재판 중인 인게임 화면 (가짜 시계, 나는 1번 자리 시민)
async function tribunalPage(n, { defendant = 3, ...options } = {}) {
  useFakeClock()
  const t = await openTable({ n, view: "page", ...options })
  await t.openTribunal(defendant)
  return t
}

// 추방 영상이 끝나 글이 뜰 때까지: 영상 끝 → 멈춤 0.45초 → 어두워짐 1.6초
async function playUntilMessage() {
  const video = expulsionLayer()?.querySelector("video")
  assert.ok(video, "추방 영상이 없음")
  await RTL.act(async () => {
    RTL.fireEvent(video, new window.Event("ended"))
  })
  await tick(450)
  await tick(0)
  await tick(1_600)
}

// 글이 정한 시간(3.2초) 지나 연출 끝
async function finishMessage() {
  await tick(3_200)
}

test("A04-F-233 7명 판: 결과 counts 3:2 → 화면 글에 유죄·무죄 표 수가 없음", async () => {
  const t = await tribunalPage(7)
  await t.resolve("GUILTY", { counts: { guilty: 3, notGuilty: 2 } })
  await playUntilMessage()
  const text = document.body.textContent
  assert.match(text, /추방당하셨습니다/)
  assert.doesNotMatch(text, /유죄\s*\d|무죄\s*\d|\d\s*표|3\s*[:대]\s*2/)
})

test("A04-F-234 6명 판: 유죄 → \"[닉네임]님이 가면무도회에서 추방당하셨습니다.\"", async () => {
  const t = await tribunalPage(6)
  await t.resolve("GUILTY")
  assert.ok(expulsionLayer(), "추방 연출 창이 없음")
  await playUntilMessage()
  assert.ok(screen.queryByText(expelledText(t.nick(3))), "추방 글이 없음")
})

test("A04-F-235 8명 판: 무죄 → 추방 글 없음", async () => {
  const t = await tribunalPage(8)
  await t.resolve("NOT_GUILTY")
  await tick(6_000)
  assert.equal(expulsionLayer(), null)
  assert.doesNotMatch(document.body.textContent, /추방당하셨습니다/)
})

test("A04-F-236 5명 판: 취소(CANCELLED) → 추방 글 없음", async () => {
  const t = await tribunalPage(5)
  await t.resolve("CANCELLED")
  await tick(6_000)
  assert.equal(expulsionLayer(), null)
  assert.doesNotMatch(document.body.textContent, /추방당하셨습니다/)
})

test("A04-F-237 7명 판: 추방 연출 끝 → \"밤이 되었습니다\" 안내 창", async () => {
  const t = await tribunalPage(7)
  await t.resolve("GUILTY")
  // 연출 동안엔 밤 안내가 미뤄짐
  assert.equal(screen.queryByText("밤이 되었습니다"), null)
  await playUntilMessage()
  await finishMessage()
  assert.equal(expulsionLayer(), null)
  const dialog = screen.queryByRole("dialog", { name: "단계 전환 안내" })
  assert.ok(dialog, "밤 안내 창이 없음")
  assert.match(dialog.textContent, /밤이 되었습니다/)
})

test("A04-F-265 8명 판: 유죄 알림 executedRole 광대 → 추방 연출 글에 \"광대\" 없음", async () => {
  const t = await tribunalPage(8, { defendant: 0, jokers: [0, 5] })
  const payload = await t.resolve("GUILTY", { executedRole: "JOKER" })
  assert.equal(payload.executedRole, "JOKER")
  assert.doesNotMatch(expulsionLayer().textContent, /광대/)
  await playUntilMessage()
  assert.ok(screen.queryByText(expelledText(t.nick(0))))
  assert.doesNotMatch(expulsionLayer().textContent, /광대/)
})

test("A04-F-266 5명 판: 마지막 광대 처형 → 연출 동안 결과 화면 아님, 끝나면 결과 화면", async () => {
  const t = await tribunalPage(5, { defendant: 0 })
  await t.resolve("GUILTY", { ended: "CITIZEN" })
  await playUntilMessage()
  assert.equal(t.path(), "/ingame")
  assert.equal(screen.queryByText(RESULT_PAGE_TEXT), null)
  await finishMessage()
  assert.equal(t.path(), "/gameresult")
  assert.ok(screen.queryByText(RESULT_PAGE_TEXT))
})

test("A04-F-267 7명 판: 판 끝 유죄 → 추방 글 → 결과 화면", async () => {
  const t = await tribunalPage(7, { defendant: 0 })
  await t.resolve("GUILTY", { ended: "CITIZEN" })
  await playUntilMessage()
  assert.ok(screen.queryByText(expelledText(t.nick(0))), "추방 글이 없음")
  await finishMessage()
  assert.deepEqual(t.navigations, ["/gameresult"])
})

// 둘째·셋째 날 재판 창 그리기 시험(jsdom, 스토어부터 그림까지): 전날 표를 낸 사람도 단추가 켜지고, 피고 카드가 그날 피고로 바뀜 (받은 버그 8)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-207~209, A04-F-249~254
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL } from "./tribunalTable.mjs"

test.afterEach(resetTable)

const { screen, within } = RTL

const tribunalDialog = () => screen.queryByRole("dialog", { name: "재판" })
const voteButton = (name) => within(tribunalDialog()).queryByRole("button", { name })

// 재판 창에서 내 표를 냄: 단추 누름 → 서버 성공 답 → 나에게만 오는 "표 냈음" 알림
async function voteOnScreen(t, label = "유죄") {
  const vote = label === "유죄" ? "GUILTY" : "NOT_GUILTY"
  await t.click(voteButton(label))
  await t.answer("cast_tribunal_vote", t.voteOk(vote))
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  assert.ok(within(tribunalDialog()).queryByText("투표가 완료되었습니다."), "그날 표가 안 들어감")
}

// 단추 둘이 다 보이고 켜졌는지
function assertButtonsOn() {
  assert.ok(tribunalDialog(), "재판 창이 없음")
  for (const name of ["유죄", "무죄"]) {
    const button = voteButton(name)
    assert.ok(button, `${name} 단추가 없음`)
    assert.equal(button.disabled, false, `${name} 단추가 꺼짐`)
  }
}

test("A04-F-207 [버그 8] 6명 판: 1일 냄 → 2일 낮 → 2일 재판 진입 → \"유죄\"·\"무죄\" 단추 켜짐", async () => {
  const t = await openTable({ n: 6, view: "page" })
  await t.openTribunal(3)
  await voteOnScreen(t, "유죄")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assertButtonsOn()
})

test("A04-F-208 [버그 8] 8명 판: 1·2일 냄 → 3일 재판 → 단추 켜짐", async () => {
  const t = await openTable({ n: 8, view: "page" })
  await t.openTribunal(3)
  await voteOnScreen(t, "유죄")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  await voteOnScreen(t, "무죄")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(5)
  assert.equal(t.state().dayIndex, 3)
  assertButtonsOn()
})

test("A04-F-209 [버그 8] 7명 판: 1일 냄 → 2일 재판에 \"투표가 완료되었습니다.\" 없음", async () => {
  const t = await openTable({ n: 7, view: "page" })
  await t.openTribunal(3)
  await voteOnScreen(t, "무죄")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.ok(tribunalDialog())
  assert.equal(within(tribunalDialog()).queryByText("투표가 완료되었습니다."), null)
})

test("A04-F-249 8명 판: 피고 \"달빛\" → 재판 창 카드 글 \"달빛\"", async () => {
  const t = await openTable({ n: 8, view: "page", names: { 1: "구름", 3: "달빛" } })
  await t.openTribunal(3)
  assert.match(tribunalDialog().textContent, /달빛/)
})

test("A04-F-250 6명 판: 내가 피고 → 내 닉네임 카드 + 피고 안내", async () => {
  const t = await openTable({ n: 6, view: "page" })
  await t.openTribunal(1)
  const dialog = tribunalDialog()
  assert.match(dialog.textContent, new RegExp(t.nick(1)))
  assert.ok(within(dialog).queryByText("당신은 피고인입니다. 투표할 수 없습니다."))
})

test("A04-F-251 7명 판: 1일 A 무죄 → 2일 B 피고 → 카드가 B로 바뀜", async () => {
  const t = await openTable({ n: 7, view: "page" })
  await t.openTribunal(3)
  assert.match(tribunalDialog().textContent, new RegExp(t.nick(3)))
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  const text = tribunalDialog().textContent
  assert.match(text, new RegExp(t.nick(4)))
  assert.doesNotMatch(text, new RegExp(t.nick(3)))
})

test("A04-F-252 [버그 8] 8명 판: 1일 A 무죄(나 냄) → 2일 A 다시 피고 → 카드 A·단추 켜짐", async () => {
  const t = await openTable({ n: 8, view: "page" })
  await t.openTribunal(3)
  await voteOnScreen(t, "무죄")
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(3)
  assert.match(tribunalDialog().textContent, new RegExp(t.nick(3)))
  assertButtonsOn()
})

test("A04-F-253 5명 판: 1일 나 피고 무죄 → 2일 B 피고 → 나는 투표자로 단추 켜짐", async () => {
  const t = await openTable({ n: 5, view: "page" })
  await t.openTribunal(1)
  assert.equal(voteButton("유죄"), null)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(2)
  assertButtonsOn()
})

test("A04-F-254 10명 판: 1일 나 처형 → 2일 재판 → 사망 안내", async () => {
  const t = await openTable({ n: 10, view: "page" })
  await t.openTribunal(1)
  await t.resolve("GUILTY")
  await t.nextDay()
  await t.openTribunal(3)
  const dialog = tribunalDialog()
  assert.ok(dialog, "재판 창이 없음")
  assert.equal(voteButton("유죄"), null)
  assert.ok(within(dialog).queryByText("사망한 참가자는 투표할 수 없습니다."))
})

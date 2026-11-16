// 재판 중 사람 카드 메뉴 시험(jsdom): 피고 카드엔 "유죄"·"무죄", 다른 카드엔 재판 항목 없음, 내가 피고면 못 누름
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-244~246
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, React, InGameActionProvider, InGamePlayerSessionProvider, InGameChatSessionProvider } from "./tribunalTable.mjs"

const { default: InGamePlayerBoard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")

test.afterEach(resetTable)

const { screen, within } = RTL
const h = React.createElement

// 카드 판 + 조작 묶음 (인게임 화면과 같은 감싸기 차례)
// 화면 전체에선 재판 창이 판 화면을 잠가서(A04-F-227) 카드 판만 그림
const boardView = () => h(InGamePlayerSessionProvider, null,
  h(InGameChatSessionProvider, null, h(InGameActionProvider, null, h(InGamePlayerBoard))))

// 재판 중 카드 판 (나는 1번 자리)
async function tribunalBoard(n, defendant = 3) {
  const t = await openTable({ n, view: boardView })
  await t.openTribunal(defendant)
  return t
}

// 닉네임으로 카드 누르기 → 열린 메뉴 (없으면 null)
async function openCard(t, index) {
  const card = [...document.querySelectorAll('[aria-haspopup="menu"]')].find((node) => node.textContent.includes(t.nick(index)))
  assert.ok(card, `${t.nick(index)} 카드가 없음`)
  await t.click(card)
  return screen.queryByRole("menu", { name: "플레이어 행동" })
}
const menuItem = (menu, name) => (menu ? within(menu).queryByRole("menuitem", { name }) : null)

test("A04-F-244 6명 판: 재판 중 피고 카드 누름 → 메뉴에 \"유죄\"·\"무죄\"", async () => {
  const t = await tribunalBoard(6)
  const menu = await openCard(t, 3)
  assert.ok(menu, "메뉴가 안 열림")
  assert.ok(menuItem(menu, "유죄"), "유죄 항목 없음")
  assert.ok(menuItem(menu, "무죄"), "무죄 항목 없음")
  await t.click(menuItem(menu, "유죄"))
  assert.deepEqual(t.sentOf("cast_tribunal_vote").map((p) => p.vote), ["GUILTY"])
})

test("A04-F-245 7명 판: 피고 아닌 카드엔 재판 항목 없음", async () => {
  const t = await tribunalBoard(7)
  const menu = await openCard(t, 4)
  assert.equal(menuItem(menu, "유죄"), null)
  assert.equal(menuItem(menu, "무죄"), null)
})

test("A04-F-246 5명 판: 내가 피고면 피고 카드의 재판 항목이 꺼져 눌러도 안 보냄", async () => {
  const t = await tribunalBoard(5, 1)
  const menu = await openCard(t, 1)
  const guilty = menuItem(menu, "유죄")
  const notGuilty = menuItem(menu, "무죄")
  assert.ok(guilty && notGuilty, "재판 항목이 안 보임")
  // 꺼져 있고 눌러도 무시
  for (const item of [guilty, notGuilty]) {
    assert.equal(item.disabled, true, `${item.getAttribute("aria-label")} 항목이 켜짐`)
    await t.click(item)
  }
  assert.equal(t.sentOf("cast_tribunal_vote").length, 0)
})

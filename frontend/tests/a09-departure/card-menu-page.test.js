// [B07-1] 카드 메뉴를 열어 보는 시험(화면 부품, 카드 판): 죽고 끊긴 카드엔 낮 "투표하기" 없음, 산·끊긴 카드엔 있음, 밤엔 마녀사냥꾼만 죽고 끊긴 카드에 밤 항목
// 목록 A09-끊김-나가기-탈주.md A09-F-229~232, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/card-menu-page.test.js
// 목록 파일 칸은 card-menu.test.jsx지만 상태 시험 card-menu.test.js와 이름이 겹쳐 card-menu-page로 둠
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

// 그 카드 메뉴에 누를 수 있는 그 이름 단추가 있나
async function canPress(nickname, label) {
  const items = await K.cardMenuButtons(nickname)
  return items.some((item) => item.label === label && item.enabled)
}

// 7명 판: 0 광대·6 광대, 나 1번, 3번 죽고 끊김, 4번 산·끊김
const DAY = { n: 7, me: 1, jokers: [0, 6], dead: [3], disconnected: [3, 4] }

test("A09-F-229 7명 판 낮 투표: 죽고 끊긴 카드 메뉴 → 누를 수 있는 \"투표하기\" 없음", async () => {
  const t = K.seat(DAY)
  await K.renderBoard()
  assert.equal(await canPress(t.nick(3), "투표하기"), false)
  // 같은 판 산 카드엔 있음 (메뉴가 아예 안 열려 통과하는 것 막기)
  assert.equal(await canPress(t.nick(5), "투표하기"), true)
})

test("A09-F-230 7명 판 낮 투표: 산·끊긴 카드 메뉴 → \"투표하기\" 누를 수 있음", async () => {
  const t = K.seat(DAY)
  await K.renderBoard()
  assert.equal(await canPress(t.nick(4), "투표하기"), true)
})

test("A09-F-231 8명 판 둘째 밤 마녀사냥꾼 차례: 죽고 끊긴 카드 메뉴 → 밤 항목(확인) 있음", async () => {
  const t = K.seat({ n: 8, me: 1, roles: { 1: "WITCH_HUNTER" }, jokers: [0, 6], dead: [3], disconnected: [3], phase: "NIGHT", dayIndex: 2, nightTurnRole: "WITCH_HUNTER" })
  await K.renderBoard()
  assert.equal(await canPress(t.nick(3), K.NIGHT_ACTION_LABELS.WITCH_HUNTER), true)
})

test("A09-F-232 8명 판 밤 광대 차례: 죽고 끊긴 카드 메뉴 → 밤 항목(암살) 없음", async () => {
  const t = K.seat({ n: 8, me: 0, jokers: [0, 6], dead: [3], disconnected: [3], phase: "NIGHT", dayIndex: 2, nightTurnRole: "JOKER" })
  await K.renderBoard()
  assert.equal(await canPress(t.nick(3), K.NIGHT_ACTION_LABELS.JOKER), false)
  // 같은 밤 산 시민 카드엔 암살이 있음 (메뉴가 아예 안 열려 통과하는 것 막기)
  assert.equal(await canPress(t.nick(4), K.NIGHT_ACTION_LABELS.JOKER), true)
})

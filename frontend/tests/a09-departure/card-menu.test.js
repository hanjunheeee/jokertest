// [B07-1] 판 상태 → 카드 메뉴 항목 시험(화면 상태): 낮 투표 항목은 산 사람에게만, 밤 항목은 직업대로(마녀사냥꾼은 죽은 사람) — 끊김과 상관없이
// 목록 A09-끊김-나가기-탈주.md A09-F-112~123, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/card-menu.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { buildInGamePlayerCardMenuItems } = await import("../../src/domains/game/ingame/utils/playerCardMenu.js")

test.afterEach(() => K.reset())

// 누를 수 있는 항목 이름들 (잠긴 항목은 고를 수 없어 뺌)
function enabledLabels(box, uuid) {
  return buildInGamePlayerCardMenuItems(box.ctx, uuid, box.localPlayerId)
    .filter((item) => item.visible !== false && item.enabled)
    .map((item) => item.label)
}

// 낮 투표: 1 산·연결 / 2 산·끊김 / 3 죽음·연결 / 4 죽음·끊김 (값 4)
const DAY_TARGETS = [
  [1, "산·연결", true],
  [2, "산·끊김", true],
  [3, "죽음·연결", false],
  [4, "죽음·끊김", false],
]
DAY_TARGETS.forEach(([seatNo, name, votable], i) => {
  const id = `A09-F-${112 + i}`
  test(`${id} 6명 판 낮 투표: ${name} 카드 → "투표하기" ${votable ? "누를 수 있음" : "없음"}`, async () => {
    const t = K.seat({ n: 6, me: 0, jokers: [5], dead: [3, 4], disconnected: [2, 4] })
    const box = await K.renderActionProbe()
    assert.equal(enabledLabels(box, t.uuid(seatNo)).includes("투표하기"), votable)
  })
})

// 밤 내 차례: 직업 4 × (죽음·끊김 / 산·끊김) (값 8)
// 마녀사냥꾼은 죽음·끊김에만, 나머지는 산·끊김에만 밤 항목
const ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]
let no = 116
for (const role of ROLES) {
  for (const [seatNo, name, isDead] of [[4, "죽음·끊김", true], [2, "산·끊김", false]]) {
    const id = `A09-F-${no}`
    no += 1
    const has = role === "WITCH_HUNTER" ? isDead : !isDead
    test(`${id} 8명 판 밤 ${K.ROLE_LABELS[role]} 차례: ${name} 카드 → 밤 항목 ${has ? "있음" : "없음"}`, async () => {
      const t = K.seat({
        n: 8, me: 0, roles: { 0: role, 7: role }, jokers: role === "JOKER" ? [] : [6],
        dead: [4], disconnected: [2, 4], phase: "NIGHT", dayIndex: 2, nightTurnRole: role,
      })
      const box = await K.renderActionProbe()
      const label = box.ctx.nightActionLabel
      assert.ok(typeof label === "string" && label.length > 0, "밤 행동 이름 없음")
      assert.equal(enabledLabels(box, t.uuid(seatNo)).includes(label), has)
    })
  }
}

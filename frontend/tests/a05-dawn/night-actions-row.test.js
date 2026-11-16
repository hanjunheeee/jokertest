// 밤 조작 줄 시험(화면 부품): "밤 종료" 단추는 누구 화면에도 없음, 5초 안에는 다른 카드를 눌러 대상을 바꿀 수 있고 새 대상으로 보냄
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-665~684, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/night-actions-row.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const END_NIGHT = "밤 종료"

// 8명 둘째 밤: 0 광대, 1 의사, 2·3 시민, 4·7 죽은 사람, 5 경비원, 6 마녀사냥꾼
const ROLES8 = { 0: "JOKER", 1: "DOCTOR", 5: "GUARD", 6: "WITCH_HUNTER" }
const SEAT_OF = { JOKER: 0, DOCTOR: 1, GUARD: 5, WITCH_HUNTER: 6 }
// 직업마다 처음 고를 대상 A·바꿀 대상 B (마녀사냥꾼은 죽은 사람만 고름)
const TARGETS = { JOKER: [3, 2], DOCTOR: [3, 2], GUARD: [3, 2], WITCH_HUNTER: [4, 7] }
const ROLE_NAMES = [["광대", "JOKER"], ["의사", "DOCTOR"], ["경비원", "GUARD"], ["마녀사냥꾼", "WITCH_HUNTER"]]

// 그 직업 화면으로 판을 열고 그 직업 차례를 엶 (view: "page" 화면 전체 / "panel" 조작 묶음)
async function roleTurn(role, view = "page") {
  const g = await kit.openGame({ n: 8, me: SEAT_OF[role], roles: ROLES8, dead: [4, 7], dayIndex: 2 })
  if (view === "page") await g.page()
  else await g.panel()
  await g.turnStarts(role)
  return g
}

// 카드 메뉴로 그 사람에게 밤 행동 보내기 (단추가 없거나 꺼졌으면 실패)
async function pick(g, role, seat) {
  const items = await kit.openMenu(g.nick(seat))
  const item = items.find((entry) => entry.name === kit.NIGHT_ACTION_LABELS[role])
  assert.ok(item?.enabled, `${g.nick(seat)} 카드에 켜진 ${kit.NIGHT_ACTION_LABELS[role]} 단추가 없음 (준비 잘못)`)
  await kit.click(item.el)
  await kit.flush()
}

const STATES = ["고르기 전", "고른 뒤", "5초 중"]
let no = 665
for (const [name, role] of ROLE_NAMES) {
  for (const stateName of STATES) {
    test(`A05-F-${no} 차례인 ${name} · ${stateName} → "${END_NIGHT}" 이름 단추 없음`, async () => {
      const g = await roleTurn(role)
      if (stateName !== "고르기 전") {
        await pick(g, role, TARGETS[role][0])
        assert.equal(g.sentOf("submit_night_action").length, 1, "밤 행동이 안 나감 (준비 잘못)")
      }
      if (stateName === "5초 중") {
        await g.settle({ role })
        assert.ok(kit.selectInGamePhaseSettled(g.state()), "5초가 안 걸림 (준비 잘못)")
      }
      assert.equal(kit.findButtonNamed(END_NIGHT), false)
      assert.equal(kit.bodyText().includes(END_NIGHT), false)
    })
    no += 1
  }
}

const OTHERS = [["시민", 3], ["죽은 관전자", 4]]
OTHERS.forEach(([name, me], i) => {
  test(`A05-F-${677 + i} ${name} 밤 화면 → "${END_NIGHT}" 없음`, async () => {
    const g = await kit.openGame({ n: 8, me, roles: ROLES8, dead: [4, 7], dayIndex: 2 })
    await g.page()
    await g.turnStarts("JOKER")
    await g.settle({ role: "JOKER" })
    assert.equal(kit.findButtonNamed(END_NIGHT), false)
    assert.equal(kit.bodyText().includes(END_NIGHT), false)
  })
})

ROLE_NAMES.forEach(([name, role], i) => {
  test(`A05-F-${679 + i} ${name} 5초 중 → 다른 대상 카드의 ${kit.NIGHT_ACTION_LABELS[role]} 단추 켜짐`, async () => {
    const g = await roleTurn(role)
    const [first, other] = TARGETS[role]
    await pick(g, role, first)
    await g.settle({ role })
    assert.ok(kit.selectInGamePhaseSettled(g.state()), "5초가 안 걸림 (준비 잘못)")
    const items = await kit.openMenu(g.nick(other))
    const item = items.find((entry) => entry.name === kit.NIGHT_ACTION_LABELS[role])
    assert.equal(item?.enabled, true)
  })
})

test("A05-F-683 광대 5초 중 B 누름 → 보낸 사건 submit_night_action { targetId: B }", async () => {
  const g = await roleTurn("JOKER")
  const [first, other] = TARGETS.JOKER
  await pick(g, "JOKER", first)
  await g.settle({ role: "JOKER" })
  await pick(g, "JOKER", other)
  const sent = g.sentOf("submit_night_action")
  assert.equal(sent.length, 2)
  assert.equal(sent.at(-1).targetId, g.uuid(other))
})

test("A05-F-684 광대 A 고른 표시 → 5초 중 B 누르고 답 받음 → B에 고른 표시, A엔 없음", async () => {
  const g = await roleTurn("JOKER", "panel")
  const [first, other] = TARGETS.JOKER
  await pick(g, "JOKER", first)
  assert.equal(g.ctx()?.selectedNightTargetId, g.uuid(first), "A 고른 표시가 없음 (준비 잘못)")
  await g.settle({ role: "JOKER" })
  await pick(g, "JOKER", other)
  assert.equal(g.ctx()?.selectedNightTargetId, g.uuid(other))
  assert.notEqual(g.ctx()?.selectedNightTargetId, g.uuid(first))
})

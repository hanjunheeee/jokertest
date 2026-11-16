// 시간 바 "5초 뒤 마감" 시험(화면 부품): 밤 차례가 다 차 마감이 당겨지면 판 전원 시간 바가 펼쳐지고 "[5초 뒤 마감]"·남은 0:05, 줄어듦, 다음 차례·낮이면 사라짐, 새로고침엔 줄어든 남은 시간
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-651~664, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/timebar-settle.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const SETTLE_TEXT = "[5초 뒤 마감]"
const T0 = 1_800_000_000_000

// 8명 둘째 밤: 0 광대, 1 의사, 3 시민, 4 죽은 관전자, 5 경비원, 6 마녀사냥꾼
const ROLES8 = { 0: "JOKER", 1: "DOCTOR", 5: "GUARD", 6: "WITCH_HUNTER" }
const SEAT_OF = { JOKER: 0, DOCTOR: 1, GUARD: 5, WITCH_HUNTER: 6 }

// 가짜 시계 켜고 시간 바를 그린 뒤 그 직업 차례를 엶 (마감 30초 뒤)
async function turnBar({ me, role, turnMs = 30_000 }) {
  kit.useFakeClock(T0)
  const g = await kit.openGame({ n: 8, me, roles: ROLES8, dead: [4], dayIndex: 2 })
  await g.timebar()
  await g.turnStarts(role, { deadline: T0 + turnMs })
  return g
}
const expandButton = () => document.querySelector("[data-ingame-timebar-expand]")
const showsSettle = () => kit.settleMark() !== null && kit.bodyText().includes(SETTLE_TEXT)

const ROLE_NAMES = [["광대", "JOKER"], ["의사", "DOCTOR"], ["경비원", "GUARD"], ["마녀사냥꾼", "WITCH_HUNTER"]]
ROLE_NAMES.forEach(([name, role], i) => {
  test(`A05-F-${651 + i} ${name} 차례 5초 알림 → 시간 바 [data-ingame-phase-settle], "${SETTLE_TEXT}", 남은 0:05`, async () => {
    const g = await turnBar({ me: SEAT_OF[role], role })
    await g.settle({ role, deadline: T0 + 5_000 })
    assert.ok(kit.settleMark(), "5초 표시 칸이 없음")
    assert.match(kit.bodyText(), /\[5초 뒤 마감\]/)
    assert.match(kit.bodyText(), /0:05/)
  })
})

const VIEWERS = [["그 직업(광대)", 0], ["다른 직업(의사)", 1], ["시민", 3], ["죽은 관전자", 4]]
VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${655 + i} 8명 광대 차례 5초 알림 · ${name} 화면 → 같은 표시("${SETTLE_TEXT}"·0:05)`, async () => {
    const g = await turnBar({ me, role: "JOKER" })
    await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
    assert.ok(kit.settleMark(), "5초 표시 칸이 없음")
    assert.match(kit.bodyText(), /\[5초 뒤 마감\]/)
    assert.match(kit.bodyText(), /0:05/)
  })
})

test("A05-F-659 5초 알림 뒤 가짜 시계 3초 → 남은 0:02", async () => {
  const g = await turnBar({ me: 0, role: "JOKER" })
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.match(kit.bodyText(), /0:05/, "처음 남은 시간이 틀림 (준비 잘못)")
  await kit.tick(3_000)
  assert.match(kit.bodyText(), /0:02/)
  assert.doesNotMatch(kit.bodyText(), /0:05/)
})

test("A05-F-660 접어 둔 시간 바 + 5초 알림 → 펼쳐지고 \"[5초 뒤 마감]\" 있음", async () => {
  const g = await turnBar({ me: 3, role: "JOKER" })
  assert.equal(expandButton()?.getAttribute("aria-expanded"), "false", "처음에 펼쳐져 있음 (준비 잘못)")
  assert.equal(kit.bodyText().includes(SETTLE_TEXT), false)
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.equal(expandButton()?.getAttribute("aria-expanded"), "true")
  assert.match(kit.bodyText(), /\[5초 뒤 마감\]/)
})

test("A05-F-661 5초 알림 뒤 night_turn_started(DOCTOR) → 표시·글 없음", async () => {
  const g = await turnBar({ me: 3, role: "JOKER" })
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.ok(showsSettle(), "5초 표시가 안 켜짐 (준비 잘못)")
  await g.turnStarts("DOCTOR", { deadline: T0 + 40_000 })
  assert.equal(kit.settleMark(), null)
  assert.equal(kit.bodyText().includes(SETTLE_TEXT), false)
})

test("A05-F-662 5초 알림 없이 원래 마감이 4초 남음 → 표시 없음", async () => {
  await turnBar({ me: 3, role: "JOKER", turnMs: 4_000 })
  assert.equal(kit.settleMark(), null)
  assert.equal(kit.bodyText().includes(SETTLE_TEXT), false)
})

test("A05-F-663 5초 알림 뒤 밤 결과(낮) → 표시 없음", async () => {
  const g = await turnBar({ me: 3, role: "JOKER" })
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.ok(showsSettle(), "5초 표시가 안 켜짐 (준비 잘못)")
  await g.nightResult({ victim: null })
  assert.equal(g.state().phase, "DAY", "낮으로 안 넘어감 (준비 잘못)")
  assert.equal(kit.settleMark(), null)
  assert.equal(kit.bodyText().includes(SETTLE_TEXT), false)
})

test("A05-F-664 새로고침 스냅샷의 당긴 마감(남은 3초) → 시간 바 0:03", async () => {
  kit.useFakeClock(T0)
  const g = await kit.openGame({ n: 8, me: 3, roles: ROLES8, dead: [4], dayIndex: 2, nightTurnRole: "JOKER", nightTurnDeadline: T0 + 3_000 })
  await g.timebar()
  // 스냅샷엔 당긴 마감만 있어 바가 접혀 있음 → 펼쳐서 남은 시간을 봄
  await kit.click(expandButton())
  assert.match(kit.bodyText(), /0:03/)
})

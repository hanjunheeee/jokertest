// 밤 화면 시험(화면 상태): 연달아 고르기 — 둘째 밤엔 "보냄" 표시가 지워지고 같은 대상·자기를 다시 고를 수 있는지, 둘째 밤 결과 글
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-067~070, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/repeat-pick.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { reduceInGameNightPrivateResult } = await import("../../src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js")

test.afterEach(() => kit.reset())

// 카드 메뉴로 그 사람에게 밤 행동 보내기 (답까지 기다림)
async function pick(view, index, role) {
  const item = kit.openNightItem(view.container, kit.NICKS[index], role)
  assert.ok(item, `${kit.NICKS[index]} 카드에 밤 행동 단추 없음`)
  assert.equal(item.disabled, false, `${kit.NICKS[index]} 카드 밤 행동 단추가 잠김`)
  kit.act(() => { kit.fireEvent.click(item) })
  await kit.settle()
}

// 한 밤 끝내고 다음 밤 그 직업 차례까지 (희생자 없음 = 아무도 안 죽음)
function nextNight(t, role, { victim = null } = {}) {
  t.turnEnds(role)
  t.actionsResolved()
  t.nightApplied({ victim })
  t.dayToNight()
  t.turnStarts(role)
}

test("A05-F-067 6명 광대: 첫 밤 대상 냄 → 둘째 밤 차례 시작 → 보냄 표시 지워지고 다시 고르기 켜짐", async () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  await pick(view, 3, "JOKER")
  assert.equal(view.probe.ctx.nightActionHasSubmitted, true, "첫 밤 보냄이 안 됨 (준비 잘못)")
  nextNight(t, "JOKER", { victim: 3 })
  assert.equal(t.store().state.dayIndex, 2, "둘째 밤이 아님 (준비 잘못)")
  assert.equal(view.probe.ctx.nightActionHasSubmitted, false)
  const item = kit.nightMenuItem(view.container, kit.NICKS[4], "JOKER")
  assert.ok(item, "둘째 밤 암살 단추 없음")
  assert.equal(item.disabled, false)
})

test("A05-F-068 6명 의사: 첫 밤 A 보호 → 둘째 밤 A를 다시 누르면 A로 보냄 (막는 표시 없음)", async () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR" })
  const view = kit.mountTable()
  t.turnStarts("DOCTOR")
  await pick(view, 3, "DOCTOR")
  nextNight(t, "DOCTOR")
  await pick(view, 3, "DOCTOR")
  assert.deepEqual(t.nightSubmits(), [kit.uuidOf(3), kit.uuidOf(3)])
  assert.equal(view.probe.ctx.nightActionError, null)
})

test("A05-F-069 6명 의사 세 밤 연속 자기 보호: 매 밤 자기 카드 보호 단추 켜짐", async () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR" })
  const view = kit.mountTable()
  t.turnStarts("DOCTOR")
  await pick(view, 0, "DOCTOR")
  nextNight(t, "DOCTOR")
  await pick(view, 0, "DOCTOR")
  nextNight(t, "DOCTOR")
  await pick(view, 0, "DOCTOR")
  assert.equal(t.store().state.dayIndex, 3, "셋째 밤이 아님 (준비 잘못)")
  assert.deepEqual(t.nightSubmits(), [kit.uuidOf(0), kit.uuidOf(0), kit.uuidOf(0)])
})

test("A05-F-070 [지금 동작] 8명 경비원: 첫 밤 조사 글(민수)이 남은 채 둘째 밤 결과(현우) → 새 글", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  t.turnStarts("GUARD")
  t.turnEnds("GUARD")
  t.actionsResolved()
  t.privateResult({ actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "CITIZEN" })
  t.nightApplied({ victim: null })
  t.dayToNight()
  t.turnStarts("GUARD")
  t.turnEnds("GUARD")
  t.actionsResolved()
  t.privateResult({ actionType: "INVESTIGATE", targetId: kit.uuidOf(2), role: "DOCTOR" })
  const label = reduceInGameNightPrivateResult(t.store().nightPrivateResult, t.store().state.players)?.label ?? ""
  assert.match(label, /현우/)
  assert.doesNotMatch(label, /민수/)
})

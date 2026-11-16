// 개인 결과 화면 상태 시험: 밤 능력 결과는 쓴 사람에게만 글 창으로 (경비원 조사·마녀사냥꾼 확인·광대 암살 실패), 개인 결과를 안 받은 사람은 결과 창 없음
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-572~577, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/private-result.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const { React } = kit
const { useInGameNightPrivateResult } = await import("../../src/domains/game/ingame/hooks/useInGameNightPrivateResult.js")
const { default: InGameNightPrivateResultOverlay } = await import("../../src/domains/game/ingame/components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx")

// 인게임 화면처럼: 낮 시작 연출이 남아 있으면 미뤘다가 결과 창을 그림
function PrivateResult() {
  const dawnPending = kit.useInGameStore(kit.selectDawnReport) !== null
  const result = useInGameNightPrivateResult({ hold: dawnPending })
  return React.createElement(InGameNightPrivateResultOverlay, {
    open: result.open, kind: result.kind, label: result.label, onConfirm: result.confirm,
  })
}

// 8명 판: 0 광대, 1 의사, 2 A(시민, 경비원이 조사한 사람), 3 시민, 5 경비원
const ROLES8 = { 0: "JOKER", 1: "DOCTOR", 2: "CITIZEN", 5: "GUARD" }

test("A05-F-572 8명 경비원 조사 결과(대상 A·의사) → 결과 창 글에 A 닉네임과 \"의사\"", async () => {
  // 이 판은 A(2번 자리)가 의사
  const g = await kit.openGame({ n: 8, me: 5, roles: { 0: "JOKER", 2: "DOCTOR", 5: "GUARD" }, dayIndex: 1 })
  await g.mountElement(React.createElement(PrivateResult))
  await g.turnStarts("GUARD")
  await g.turnEnds("GUARD")
  await g.privateResult({ actionType: "INVESTIGATE", targetId: g.uuid(2), role: "DOCTOR" })
  const dialog = kit.privateResultDialog()
  assert.ok(dialog, "결과 창이 안 뜸")
  assert.match(dialog.textContent, new RegExp(g.nick(2)))
  assert.match(dialog.textContent, /의사/)
})

test("A05-F-573 10명 마녀사냥꾼 확인 결과(죽은 C·시민) → 글에 C 닉네임과 \"시민\"", async () => {
  const g = await kit.openGame({ n: 10, me: 4, roles: { 0: "JOKER", 1: "JOKER", 4: "WITCH_HUNTER" }, dead: [6], dayIndex: 2 })
  await g.mountElement(React.createElement(PrivateResult))
  await g.turnStarts("WITCH_HUNTER")
  await g.turnEnds("WITCH_HUNTER")
  await g.privateResult({ actionType: "CONFIRM", targetId: g.uuid(6), role: "CITIZEN" })
  const dialog = kit.privateResultDialog()
  assert.ok(dialog, "결과 창이 안 뜸")
  assert.match(dialog.textContent, new RegExp(g.nick(6)))
  assert.match(dialog.textContent, /시민/)
})

test("A05-F-574 7명 광대 암살 실패(ASSASSINATE success 거짓) → 실패 글", async () => {
  const g = await kit.openGame({ n: 7, me: 0, roles: { 0: "JOKER", 1: "DOCTOR" }, dayIndex: 1 })
  await g.mountElement(React.createElement(PrivateResult))
  await g.turnStarts("DOCTOR")
  await g.turnEnds("DOCTOR")
  await g.privateResult({ actionType: "ASSASSINATE", success: false })
  const dialog = kit.privateResultDialog()
  assert.ok(dialog, "결과 창이 안 뜸")
  assert.match(dialog.textContent, /암살.*실패/)
})

// 개인 결과 사건 없이 밤 결과만 받은 사람 (경비원이 A를 조사한 밤)
const NO_RESULT_VIEWERS = [["조사당한 A", 2], ["의사", 1], ["시민", 3]]
NO_RESULT_VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${575 + i} 8명 ${name} 화면: 개인 결과 사건 없음 + 밤 결과만 → 결과 창 없음`, async () => {
    const g = await kit.openGame({ n: 8, me, roles: ROLES8, dayIndex: 1 })
    await g.mountElement(React.createElement(PrivateResult))
    await g.turnStarts("GUARD")
    await g.turnEnds("GUARD")
    await g.nightResult({ victim: null })
    assert.equal(g.state().phase, "DAY", "낮으로 안 넘어감 (준비 잘못)")
    assert.equal(kit.privateResultDialog(), null)
    assert.doesNotMatch(kit.bodyText(), /조사|경비원/)
  })
})

// 밤 화면 시험(화면 부품): 내게만 오는 밤 결과 창 — 조사·확인 글(닉네임·직업 이름)·암살 실패 글, 확인으로 닫힘, 결과 없는 직업엔 창 없음, 초점
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-149~163·186, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/private-result-overlay.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { createElement } = await import("react")
const { selectDawnReport } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useInGameNightPrivateResult } = await import("../../src/domains/game/ingame/hooks/useInGameNightPrivateResult.js")
const { default: InGameNightPrivateResultOverlay } = await import("../../src/domains/game/ingame/components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx")

test.afterEach(() => kit.reset())

// 인게임 화면처럼: 낮 시작 연출이 남아 있으면 미뤘다가 결과 창을 그림
function PrivateResult() {
  const dawnPending = kit.useInGameStore(selectDawnReport) !== null
  const result = useInGameNightPrivateResult({ hold: dawnPending })
  return createElement(InGameNightPrivateResultOverlay, {
    open: result.open, kind: result.kind, label: result.label, onConfirm: result.confirm,
  })
}

const resultDialog = () => kit.screen.queryByRole("dialog", { name: "밤 조사 결과" })

// 밤 끝 차례대로 받기: 마지막 차례 끝 → 판정 끝 → 내 결과
function endNightWith(t, lastRole, fields) {
  t.turnStarts(lastRole)
  t.turnEnds(lastRole)
  t.actionsResolved()
  if (fields) t.privateResult(fields)
}

const ALL_ROLES = [["JOKER", "광대"], ["CITIZEN", "시민"], ["DOCTOR", "의사"], ["GUARD", "경비원"], ["WITCH_HUNTER", "마녀사냥꾼"]]

// 경비원 화면: 8명, 1 나(지영), 0 "민수" 조사
ALL_ROLES.forEach(([role, name], i) => {
  test(`A05-F-${149 + i} 8명 경비원 조사 결과 창: "민수" 직업 ${role} → 창에 "민수"·"${name}", "확인" 단추`, () => {
    const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
    kit.render(createElement(PrivateResult))
    endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role })
    const dialog = resultDialog()
    assert.ok(dialog, "결과 창이 안 뜸")
    assert.match(dialog.textContent, /민수/)
    assert.match(dialog.textContent, new RegExp(`${name}입니다`))
    assert.ok(kit.within(dialog).getByRole("button", { name: "확인" }))
  })
})

// 마녀사냥꾼 화면: 10명 둘째 밤, 1 나(지영), 0 "민수"는 죽은 사람
ALL_ROLES.forEach(([role, name], i) => {
  test(`A05-F-${154 + i} 10명 둘째 밤 마녀사냥꾼 확인 결과 창: 죽은 "민수" 직업 ${role} → 창에 "민수"·"${name}", "확인" 단추`, () => {
    const t = kit.openNight({ n: 10, me: 1, role: "WITCH_HUNTER", dead: [0], dayIndex: 2 })
    kit.render(createElement(PrivateResult))
    endNightWith(t, "WITCH_HUNTER", { actionType: "CONFIRM", targetId: kit.uuidOf(0), role })
    const dialog = resultDialog()
    assert.ok(dialog, "결과 창이 안 뜸")
    assert.match(dialog.textContent, /민수/)
    assert.match(dialog.textContent, new RegExp(`${name}입니다`))
    assert.ok(kit.within(dialog).getByRole("button", { name: "확인" }))
  })
})

test("A05-F-159 6명 광대 암살 실패 창 → \"이번 밤의 암살이 실패했습니다.\"", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "DOCTOR", { actionType: "ASSASSINATE", success: false })
  assert.match(resultDialog()?.textContent ?? "", /이번 밤의 암살이 실패했습니다\./)
})

test("A05-F-160 결과 창 \"확인\" 누르면 창 없음", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "JOKER" })
  assert.ok(resultDialog(), "결과 창이 안 뜸 (준비 잘못)")
  kit.act(() => { kit.fireEvent.click(kit.within(resultDialog()).getByRole("button", { name: "확인" })) })
  assert.equal(resultDialog() === null, true, "결과 창이 떠 있음")
})

test("A05-F-161 6명 시민 화면: 밤 끝(결과 안 옴) → 결과 창 없음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "DOCTOR", null)
  t.nightApplied({ victim: 3 })
  assert.equal(resultDialog() === null, true, "결과 창이 떠 있음")
})

test("A05-F-162 6명 의사 화면: 의사가 살린 밤에도 결과 창 없음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "DOCTOR", null)
  t.nightApplied({ victim: null, doctorSaved: true })
  kit.act(() => { kit.useInGameStore.getState().finishDawnReport(kit.useInGameStore.getState().dawnReport?.key) })
  assert.equal(resultDialog() === null, true, "결과 창이 떠 있음")
})

test("A05-F-163 8명 경비원: 둘째 밤 결과 창 글은 둘째 밤 대상(현우)", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "CITIZEN" })
  kit.act(() => { kit.fireEvent.click(kit.within(resultDialog()).getByRole("button", { name: "확인" })) })
  t.nightApplied({ victim: null })
  t.dayToNight()
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(2), role: "DOCTOR" })
  const text = resultDialog()?.textContent ?? ""
  assert.match(text, /현우/)
  assert.doesNotMatch(text, /민수/)
})

test("A05-F-186 결과 창이 열리면 초점이 \"확인\" 단추에 감", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  kit.render(createElement(PrivateResult))
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "JOKER" })
  const confirm = kit.within(resultDialog()).getByRole("button", { name: "확인" })
  assert.equal(document.activeElement === confirm, true, `초점이 확인 단추가 아님: ${document.activeElement?.tagName}`)
})

// PC 채팅 크게 보기가 아침 연출·밤 개인 결과·사망 선택·단계 안내(죽은 사람 포함)·밤 차례 창 위에 남지 않는지 시험
// 목록 A05b-밤-알림-낮연출.md 번호 A05-F-696~702 (돌리기: node --experimental-test-module-mocks --test tests/a05-night/goG3-closeup-cover.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import { RTL, flush, openTable, resetTable, startFakeClock, tick } from "../a06-chat/a06Kit.mjs"

test.afterEach(resetTable)

// 단계 안내 창 (값 = 단계 이름, 없으면 null)·밤 차례·아침 글·밤 조사 결과·사망 선택 창이 떠 있는지
const entrancePhase = () => document.querySelector("[data-ingame-phase-entrance]")?.getAttribute("data-ingame-phase-entrance") ?? null
const entranceReason = () => document.querySelector("[data-ingame-phase-entrance-reason]")?.textContent ?? null
const nightTurnShown = () => document.querySelector("[data-night-turn-role]") !== null
const dawnReportShown = () => document.querySelector("[data-ingame-dawn-report]") !== null
const privateResultShown = () => RTL.screen.queryByRole("dialog", { name: "밤 조사 결과" }) !== null
const deadChoiceShown = () => RTL.screen.queryByRole("dialog", { name: "사망 후 선택" }) !== null

// 떠 있는 단계 안내를 "확인"으로 닫음 (처음 그릴 때 뜬 안내 포함, 많아야 3번)
async function confirmEntrances() {
  for (let i = 0; i < 3; i += 1) {
    const box = document.querySelector("[data-ingame-phase-entrance]")
    const ok = box ? [...box.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인") : null
    if (!ok) return
    await RTL.act(async () => { RTL.fireEvent.click(ok) })
    await flush()
  }
}
// 희생자 없는 밤 뒤 "지난밤 아무 일도 일어나지 않았습니다" 글 창을 "확인"으로 닫음 (닫아야 낮 안내가 뜸, 2026-11-18)
async function confirmDawnReport() {
  const box = document.querySelector("[data-ingame-dawn-report]")
  const ok = box ? [...(box.closest("[role=dialog]") ?? box).querySelectorAll("button")].find((b) => b.textContent.trim() === "확인") : null
  if (!ok) return
  await RTL.act(async () => { RTL.fireEvent.click(ok) })
  await flush()
}
// 판 화면 + 처음 안내 닫고 크게 보기 엶 (비교엔 참거짓만 넣음 — 화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
async function tableWithCloseup(options) {
  const t = await openTable({ view: "page", ...options })
  await confirmEntrances()
  await t.openCloseup()
  assert.equal(t.closeup() !== null, true, "크게 보기 창이 안 열림 (준비 잘못)")
  return t
}

test("A05-F-696 6명 판 낮 산 나: 크게 보기를 연 채 \"밤이 되었습니다\" 안내가 뜸 → 크게 보기 닫힘, 확인 뒤에도 저절로 안 뜸", async () => {
  const t = await tableWithCloseup({ n: 6, me: 2, roles: { 0: "JOKER" }, phase: "DAY" })
  await t.toNight()
  assert.equal(entrancePhase(), "NIGHT", "밤 안내가 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 밤 안내 위에 남음")
  await confirmEntrances()
  assert.deepEqual({ entrance: entrancePhase(), closeup: t.closeup() !== null }, { entrance: null, closeup: false })
})

test("A05-F-697 7명 판 밤 산 의사 나: 크게 보기를 연 채 밤 차례 창이 뜸 → 크게 보기 닫힘", async () => {
  const t = await tableWithCloseup({ n: 7, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER" }, phase: "NIGHT" })
  await t.nightTurn("DOCTOR")
  assert.equal(nightTurnShown(), true, "밤 차례 창이 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 밤 차례 창 위에 남음")
})

test("A05-F-698 5명 판 밤 산 나: 크게 보기를 연 채 아침 글 창·낮 안내가 뜸 → 아침 글 창부터 크게 보기 닫힘, 확인 뒤 낮 안내에서도 닫힘", async () => {
  const t = await tableWithCloseup({ n: 5, me: 3, roles: { 0: "JOKER" }, phase: "NIGHT" })
  await t.nextDay()
  assert.equal(dawnReportShown(), true, "아침 글 창이 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 아침 글 창 위에 남음")
  await confirmDawnReport()
  assert.equal(entrancePhase(), "DAY", "낮 안내가 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 낮 안내 위에 남음")
  await confirmEntrances()
  assert.equal(t.closeup() !== null, false, "낮 안내 확인 뒤 크게 보기가 저절로 다시 뜸")
})

test("A05-F-699 8명 판 낮 죽은 나: 크게 보기를 연 채 전원 기권으로 밤이 됨 → 2초 안내·까닭 줄을 가리지 않게 크게 보기 닫힘, 2초 뒤에도 저절로 안 뜸", async () => {
  startFakeClock()
  const t = await tableWithCloseup({ n: 8, me: 4, roles: { 0: "JOKER" }, phase: "DAY", dead: [4] })
  await t.toNight()
  assert.equal(entrancePhase(), "NIGHT", "죽은 사람 밤 안내가 안 뜸 (준비 잘못)")
  assert.equal(entranceReason(), "모두 기권하여 재판이 열리지 않았습니다")
  assert.equal(t.closeup() !== null, false, "크게 보기가 죽은 사람 단계 안내 위에 남음")
  await tick(2_100)
  assert.deepEqual({ entrance: entrancePhase(), closeup: t.closeup() !== null }, { entrance: null, closeup: false })
})

test("A05-F-700 8명 판 밤 경비원 나: 밤 조사 뒤 아침 글 창·밤 조사 결과 창이 차례로 뜸 → 크게 보기 닫힘", async () => {
  const t = await tableWithCloseup({ n: 8, me: 1, myRole: "GUARD", roles: { 0: "JOKER" }, phase: "NIGHT" })
  await t.say("night_actions_resolved", { gameId: t.gameId, dayIndex: 1 })
  await t.say("night_action_result", {
    gameId: t.gameId, dayIndex: 1, actionType: "INVESTIGATE", targetId: t.uuid(0), role: "JOKER",
  })
  await t.nextDay()
  assert.equal(dawnReportShown(), true, "아침 글 창이 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 아침 글 창 위에 남음")
  await confirmDawnReport()
  assert.equal(privateResultShown(), true, "밤 조사 결과 창이 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 밤 조사 결과 창 위에 남음")
})

test("A05-F-701 6명 판 밤 산 나: 밤에 내가 암살당한 뒤 사망 선택 창이 뜸 → 크게 보기 닫힘", async () => {
  const t = await tableWithCloseup({ n: 6, me: 2, roles: { 0: "JOKER" }, phase: "NIGHT" })
  await t.nextDay({ victim: 2 })
  assert.equal(t.closeup() !== null, false, "크게 보기가 아침 사망 연출 위에 남음")
  // 암살 영상은 시험 환경에서 안 돌아 스토어로 아침 연출을 마침 → 사망 후 선택 창이 뜸
  await RTL.act(async () => {
    const { dawnReport, finishDawnReport } = (await import("../../src/domains/game/ingame/store/ingameStore.js")).useInGameStore.getState()
    if (dawnReport) finishDawnReport(dawnReport.key)
  })
  await flush()
  assert.equal(deadChoiceShown(), true, "사망 후 선택 창이 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 사망 후 선택 창 위에 남음")
})

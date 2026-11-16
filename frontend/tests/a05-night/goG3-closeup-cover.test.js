// PC 채팅 크게 보기가 단계 안내·밤 차례 창 위에 남지 않는지 시험 (그 창이 뜨면 닫힘, 끝난 뒤 저절로 다시 안 뜸, 죽은 사람 안내는 안 닫음) — 인게임 화면 전체를 그려 봄
// 목록 A05b-밤-알림-낮연출.md 번호 A05-F-696~699 (돌리기: node --experimental-test-module-mocks --test tests/a05-night/goG3-closeup-cover.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import { RTL, flush, openTable, resetTable } from "../a06-chat/a06Kit.mjs"

test.afterEach(resetTable)

// 단계 안내 창 (값 = 단계 이름, 없으면 null)·밤 차례 창이 떠 있는지
const entrancePhase = () => document.querySelector("[data-ingame-phase-entrance]")?.getAttribute("data-ingame-phase-entrance") ?? null
const nightTurnShown = () => document.querySelector("[data-night-turn-role]") !== null

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

test("A05-F-698 5명 판 밤 산 나: 크게 보기를 연 채 \"낮이 되었습니다\" 안내가 뜸 → 크게 보기 닫힘", async () => {
  const t = await tableWithCloseup({ n: 5, me: 3, roles: { 0: "JOKER" }, phase: "NIGHT" })
  await t.nextDay()
  assert.equal(entrancePhase(), "DAY", "낮 안내가 안 뜸 (준비 잘못)")
  assert.equal(t.closeup() !== null, false, "크게 보기가 낮 안내 위에 남음")
})

test("A05-F-699 8명 판 낮 죽은 나: 크게 보기를 연 채 밤이 됨 → 크게 보기 그대로 (죽은 사람 안내는 저절로 닫히고 안 잠금)", async () => {
  const t = await tableWithCloseup({ n: 8, me: 4, roles: { 0: "JOKER" }, phase: "DAY", dead: [4] })
  await t.toNight()
  assert.equal(t.state().phase, "NIGHT", "밤으로 안 넘어감 (준비 잘못)")
  assert.equal(t.closeup() !== null, true, "죽은 사람 크게 보기가 닫힘")
})

// 투표 현황 창(결과 문구·재판 대상·기권 칸·여닫기) 화면 부품 시험 — 인게임 화면을 그리고 판정 알림을 넣어 봄
// 목록 A03-낮투표.md 번호 A03-F-121~131, 229~230
import test from "node:test"
import assert from "node:assert/strict"
import {
  NAMES, buttonByName, click, dayPhaseChanged, dayResolved, fakeSocket, fire, nextDay, renderPage, resetAll,
  seat, uuidOf,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const statusDialog = () => document.querySelector('[role="dialog"][aria-label="투표 현황"]')
const cell = (name) => statusDialog()?.querySelector(`[data-testid="vote-status-${name}"]`)?.textContent ?? null
// 낮/밤 시작 창이 떠 있으면 확인으로 닫음 (사람이 하는 대로)
async function confirmEntrances() {
  for (let i = 0; i < 3; i += 1) {
    const box = document.querySelector("[data-ingame-phase-entrance]")
    if (!box) return
    const confirm = [...box.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인")
    if (!confirm) return
    await click(confirm)
  }
}

// n명 판 1일 투표 중 화면, 투표 현황 창을 먼저 열어 둠
async function openStatusPage({ n = 6 } = {}) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await click(buttonByName("투표 현황 열기"))
  return socket
}
async function resultText(n, spec) {
  const socket = await openStatusPage({ n })
  await fire(socket, "day_vote_resolved", dayResolved(spec))
  return { socket, outcome: cell("outcome"), text: statusDialog()?.textContent ?? "" }
}

test("A03-F-121 ① 재판 판정 → 결과 '재판 회부'", async () => {
  const { outcome } = await resultText(6, { outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 })
  assert.equal(outcome, "재판 회부")
})

test("A03-F-122 ② 동점 판정 → 결과 '동점'", async () => {
  const { outcome } = await resultText(6, { outcome: "TIE", alive: 6, abstain: 0 })
  assert.equal(outcome, "동점")
})

test("A03-F-123 ③ [버그 9] 기권 많음 판정 → 결과 '기권이 많아 재판 없음'", async () => {
  const { outcome } = await resultText(7, { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 })
  assert.equal(outcome, "기권이 많아 재판 없음")
})

test("A03-F-124 ④ 전원 기권 판정 → 결과 '전원 기권'", async () => {
  const { outcome } = await resultText(6, { outcome: "ABSTAINED", alive: 6, abstain: 6 })
  assert.equal(outcome, "전원 기권")
})

test("A03-F-125 ⑤ 결과 없음 → '집계 전'", async () => {
  await openStatusPage()
  assert.match(statusDialog().textContent, /집계 전/)
})

test("A03-F-126 ⑥ 재판 대상 칸에 닉네임", async () => {
  await resultText(6, { outcome: "TRIBUNAL", alive: 6, abstain: 0, target: uuidOf(4), tribunalDeadline: Date.now() + 60_000 })
  assert.equal(cell("tribunal-target"), NAMES[4])
})

test("A03-F-127 ⑦ 재판 대상 이름 못 찾음 → '알 수 없는 플레이어'", async () => {
  await resultText(6, { outcome: "TRIBUNAL", alive: 6, abstain: 0, target: "p-ghost", tribunalDeadline: Date.now() + 60_000 })
  assert.equal(cell("tribunal-target"), "알 수 없는 플레이어")
})

test("A03-F-128 ⑧ 2일 새 결과로 바뀜 (1일 전원 기권 → 2일 동점)", async () => {
  const socket = await openStatusPage({ n: 6 })
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  assert.equal(cell("outcome"), "전원 기권")
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: 6, abstain: 0, dayIndex: 2 }))
  await confirmEntrances()
  if (!statusDialog()) await click(buttonByName("투표 현황 열기"))
  assert.equal(cell("outcome"), "동점")
})

test("A03-F-129 ⑨ 누가 누굴 찍었는지 없음 (재판 대상 말고 다른 이름 안 보임)", async () => {
  const { text } = await resultText(6, { outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 })
  for (const [i, name] of NAMES.slice(0, 6).entries()) {
    if (i === 2) continue
    assert.equal(text.includes(name), false, `${name} 이름이 집계 창에 나옴`)
  }
})

test("A03-F-130 ⑩ [버그 9] 7명 1표 6기권 → 기권 칸 6", async () => {
  await resultText(7, { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 })
  assert.equal(cell("public-abstain-count"), "6")
})

test("A03-F-131 ⑪ [버그 9] 6명 3표 3기권 → 기권 칸 3", async () => {
  await resultText(6, { outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 3 })
  assert.equal(cell("public-abstain-count"), "3")
})

// A03-F-229~230 여는 단추
test("A03-F-229 ① '투표 현황' 단추 누르면 창 열림", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  assert.equal(statusDialog() === null, true)
  await click(buttonByName("투표 현황 열기"))
  assert.ok(statusDialog())
})

test("A03-F-230 ② 열린 채 같은 자리 다시 누르면 닫힘 (창이 덮은 자리는 덮개가 받음)", async () => {
  await openStatusPage()
  assert.ok(statusDialog())
  // 창이 떠 있으면 화면 전체를 덮개가 덮음 → 같은 자리 누름은 덮개 "투표 현황 닫기"가 받음
  const backdrop = [...document.querySelectorAll('button[aria-label="투표 현황 닫기"]')].find((b) => !statusDialog().contains(b))
  assert.ok(backdrop, "창 밖 덮개가 있음")
  await click(backdrop)
  assert.equal(statusDialog() === null, true)
})

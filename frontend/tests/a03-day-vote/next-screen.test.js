// 낮 판정 뒤 다음 화면: 재판이면 재판 창, 동점·기권 많음·전원 기권이면 재판 창 없이 밤 — 화면 부품 시험
// 목록 A03-낮투표.md 번호 A03-F-231~235, 241
import test from "node:test"
import assert from "node:assert/strict"
import { NAMES, dayResolved, fakeSocket, fire, renderPage, resetAll, seat, useInGameStore, uuidOf } from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const tribunalDialog = () => document.querySelector('[role="dialog"][aria-label="재판"]')
const nightEntrance = () => document.querySelector('[data-ingame-phase-entrance="NIGHT"]')

// n명 판 1일 투표 중 화면에 판정 알림 넣기
async function afterResolution(n, spec) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await fire(socket, "day_vote_resolved", dayResolved(spec))
}

test("A03-F-231 ① TRIBUNAL → 재판 창 그려짐(피고 이름)", async () => {
  await afterResolution(6, { outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 })
  assert.ok(tribunalDialog(), "재판 창 있음")
  assert.match(tribunalDialog().textContent, new RegExp(NAMES[2]))
  assert.equal(nightEntrance() === null, true)
})

// A03-F-232~234 밤으로 가는 결과
;[
  ["A03-F-232", "② TIE", { outcome: "TIE", alive: 6, abstain: 0 }],
  ["A03-F-233", "③ ABSTAIN_MAJORITY", { outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 4 }],
  ["A03-F-234", "④ ABSTAINED", { outcome: "ABSTAINED", alive: 6, abstain: 6 }],
].forEach(([id, label, spec]) => {
  test(`${id} ${label} → 재판 창 없음·'밤이 되었습니다'`, async () => {
    await afterResolution(6, spec)
    assert.equal(tribunalDialog() === null, true, "재판 창이 그려짐")
    assert.ok(nightEntrance(), "밤 시작 창 있음")
    assert.match(nightEntrance().textContent, /밤이 되었습니다/)
  })
})

test("A03-F-235 ⑤ [버그 9] 7명 1표 6기권 → 재판 창 안 그려짐·밤", async () => {
  await afterResolution(7, { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 })
  assert.equal(tribunalDialog() === null, true, "재판 창이 그려짐")
  assert.ok(nightEntrance(), "밤 시작 창 있음")
})

test("A03-F-241 ⑥ DEFENDANT_DISCONNECTED(뽑힌 사람이 끊겨 있음) → 재판 창 없음·밤, 판 상태에 그 결과 이름", async () => {
  // 6명 중 5명이 끊긴 한 사람을 찍음 (끊긴 사람 표는 마감에 기권) → 서버는 누가 뽑혔는지 안 싣고 밤으로 보냄
  await afterResolution(6, { outcome: "DEFENDANT_DISCONNECTED", alive: 6, abstain: 1 })
  assert.equal(tribunalDialog() === null, true, "재판 창이 그려짐")
  assert.ok(nightEntrance(), "밤 시작 창 있음")
  const state = useInGameStore.getState().state
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.dayVoteResolution?.outcome, "DEFENDANT_DISCONNECTED")
  assert.equal(state.dayVoteResolution?.tribunalTargetUuid, null)
  assert.equal(state.tribunal ?? null, null)
})

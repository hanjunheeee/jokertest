// 낮 판정 알림(day_vote_resolved) 받아들이기·버리기 화면 상태 시험 — 맞는 모양만 받고 틀린 모양은 버림
// 목록 A03-낮투표.md 번호 A03-F-001~040 (F-025~040 중 ②·⑦~⑪·⑮·⑯은 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, dayResolved, fakeSocket, fire, renderEvents, resetAll, seat, useInGameStore, uuidOf,
} from "./dayVoteHarness.mjs"

const { parseDayVoteResolvedPayload } = await import("../../src/domains/game/ingame/utils/dayVoteResolve.js")

test.afterEach(() => resetAll())

// 결과마다 맞는 모양 (산 사람 수 n): 재판·동점은 찍은 표가 기권보다 많게, 기권 많음은 찍은 표 1·나머지 기권, 전원 기권은 찍은 표 0
const GOOD = {
  TRIBUNAL: (n) => ({ outcome: "TRIBUNAL", alive: n, abstain: 1, target: uuidOf(1), tribunalDeadline: 1_763_280_090_000 }),
  TIE: (n) => ({ outcome: "TIE", alive: n, abstain: 1 }),
  ABSTAIN_MAJORITY: (n) => ({ outcome: "ABSTAIN_MAJORITY", alive: n, abstain: n - 1 }),
  ABSTAINED: (n) => ({ outcome: "ABSTAINED", alive: n, abstain: n }),
}

// A03-F-001~024 결과 4 × 산 사람 5~10 → 결과·피고·수 그대로
let no = 1
for (const outcome of ["TRIBUNAL", "TIE", "ABSTAIN_MAJORITY", "ABSTAINED"]) {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    const id = `A03-F-${String(no).padStart(3, "0")}`
    no += 1
    test(`${id} 산 사람 ${n}명 ${outcome} 판정 알림 → 결과·다음 단계·피고·수 그대로 받음`, () => {
      const spec = GOOD[outcome](n)
      const parsed = parseDayVoteResolvedPayload({ payload: dayResolved(spec), gameId: GAME, dayIndex: 1 })
      assert.ok(parsed, "받아야 함")
      assert.equal(parsed.outcome, outcome)
      assert.equal(parsed.phase, outcome === "TRIBUNAL" ? "TRIBUNAL" : "NIGHT")
      assert.equal(parsed.tribunalTargetUuid, outcome === "TRIBUNAL" ? uuidOf(1) : null)
      assert.equal(parsed.publicVoteCount, n)
      assert.equal(parsed.publicAbstainCount, spec.abstain)
    })
  }
}

// A03-F-025~040 틀린 모양 → null, 스토어 판 상태도 그대로
const BAD = [
  ["①", "옛 재투표 결과 REVOTE", () => ({ ...dayResolved({ outcome: "TIE", alive: 6, abstain: 1 }), outcome: "REVOTE", phase: "DAY" })],
  ["②", "모르는 결과 이름", () => ({ ...dayResolved({ outcome: "TIE", alive: 6, abstain: 1 }), outcome: "MYSTERY" })],
  ["③", "TRIBUNAL인데 다음 단계 밤", () => dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(1), phase: "NIGHT" })],
  ["④", "TIE인데 다음 단계 재판", () => dayResolved({ outcome: "TIE", alive: 6, abstain: 1, phase: "TRIBUNAL" })],
  ["⑤", "TRIBUNAL 피고 없음", () => dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 1, target: null })],
  ["⑥", "TIE 피고 있음", () => dayResolved({ outcome: "TIE", alive: 6, abstain: 1, target: uuidOf(1) })],
  ["⑦", "다른 판 id", () => dayResolved({ outcome: "TIE", alive: 6, abstain: 1, gameId: "g-other" })],
  ["⑧", "다른 날", () => dayResolved({ outcome: "TIE", alive: 6, abstain: 1, dayIndex: 2 })],
  ["⑨", "기권 수 > 산 사람 수", () => dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 7 })],
  ["⑩", "음수 수", () => dayResolved({ outcome: "TIE", alive: -6, abstain: 1 })],
  ["⑪", "글자 수", () => dayResolved({ outcome: "TIE", alive: "6", abstain: 1 })],
  ["⑫", "TRIBUNAL인데 찍은 표 ≤ 기권(옛 규칙 모양 7명 1표 6기권)", () => dayResolved({ outcome: "TRIBUNAL", alive: 7, abstain: 6, target: uuidOf(1) })],
  ["⑬", "ABSTAIN_MAJORITY 찍은 표 0", () => dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 6 })],
  ["⑭", "ABSTAINED 찍은 표 1", () => dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 5 })],
  ["⑮", "null", () => null],
  ["⑯", "배열", () => [dayResolved({ outcome: "TIE", alive: 6, abstain: 1 })]],
]
BAD.forEach(([mark, label, make], i) => {
  const id = `A03-F-${String(25 + i).padStart(3, "0")}`
  test(`${id} ${mark} ${label} → 버림(null), 판 상태 그대로`, async () => {
    const payload = make()
    assert.equal(parseDayVoteResolvedPayload({ payload, gameId: GAME, dayIndex: 1 }), null)
    // 실제 받는 길로도 넣어 봄: 6명 판 투표 중 그대로여야 함
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    await renderEvents(socket)
    const before = useInGameStore.getState().state
    await fire(socket, "day_vote_resolved", payload)
    const after = useInGameStore.getState().state
    assert.equal(after.phase, "DAY")
    assert.equal(after.dayPhase, "DAY_VOTE")
    assert.equal(after.dayVoteResolution ?? null, null)
    assert.equal(after, before)
  })
})

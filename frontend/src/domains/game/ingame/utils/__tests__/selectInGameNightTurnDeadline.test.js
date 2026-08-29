import test from "node:test"
import assert from "node:assert/strict"
import {
  computeInGameNightTurnRemainingSec,
  selectInGameNightTurnDeadline,
} from "../selectInGameNightTurnDeadline.js"

const DEADLINE = 1_700_000_030_000

function buildNightState(patch = {}) {
  return { phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER", nightTurnDeadline: DEADLINE, ...patch }
}

test("selectInGameNightTurnDeadline: 진행 중인 턴의 deadline을 그대로 돌려준다", () => {
  assert.equal(selectInGameNightTurnDeadline(buildNightState()), DEADLINE)
})

test("selectInGameNightTurnDeadline: 밤이 아니면 역할과 함께 남은 시간도 사라진다", () => {
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ phase: "DAY" })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ phase: "TRIBUNAL" })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ phase: "ENDED" })), null)
})

test("selectInGameNightTurnDeadline: 보여줄 턴이 없으면 deadline도 없다(역할 판정에 종속)", () => {
  // 첫 밤의 마녀사냥꾼은 canonical하게 건너뛰는 턴이라 역할 자체가 null이다.
  assert.equal(
    selectInGameNightTurnDeadline(buildNightState({ dayIndex: 0, nightTurnRole: "WITCH_HUNTER" })),
    null,
  )
})

test("selectInGameNightTurnDeadline: 형태가 어긋난 deadline은 표시하지 않는다", () => {
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ nightTurnDeadline: 0 })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ nightTurnDeadline: -1 })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ nightTurnDeadline: "later" })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ nightTurnDeadline: Number.NaN })), null)
  assert.equal(selectInGameNightTurnDeadline(buildNightState({ nightTurnDeadline: undefined })), null)
})

test("selectInGameNightTurnDeadline: state가 없어도 throw하지 않는다", () => {
  assert.equal(selectInGameNightTurnDeadline(null), null)
  assert.equal(selectInGameNightTurnDeadline(undefined), null)
})

test("computeInGameNightTurnRemainingSec: deadline까지 남은 초를 올림해 돌려준다", () => {
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE - 30_000), 30)
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE - 1_000), 1)
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE - 1), 1)
})

test("computeInGameNightTurnRemainingSec: 마감을 지나도 음수로 흐르지 않고 0에서 멈춘다", () => {
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE), 0)
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE + 1), 0)
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, DEADLINE + 60_000), 0)
})

test("computeInGameNightTurnRemainingSec: deadline이 없으면 null이다(0초가 아니다)", () => {
  assert.equal(computeInGameNightTurnRemainingSec(null, DEADLINE), null)
  assert.equal(computeInGameNightTurnRemainingSec(undefined, DEADLINE), null)
  assert.equal(computeInGameNightTurnRemainingSec(0, DEADLINE), null)
  assert.equal(computeInGameNightTurnRemainingSec(DEADLINE, Number.NaN), null)
})

test("computeInGameNightTurnRemainingSec: 30초 턴은 30에서 0까지 한 칸씩 내려간다", () => {
  const start = DEADLINE - 30_000
  const seen = []
  for (let elapsed = 0; elapsed <= 30_000; elapsed += 1_000) {
    seen.push(computeInGameNightTurnRemainingSec(DEADLINE, start + elapsed))
  }
  assert.deepEqual(seen, [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
})

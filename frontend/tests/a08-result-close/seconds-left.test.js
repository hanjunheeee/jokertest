// 결과 화면 남은 초 계산 시험: 닫힘 시각까지 올림한 초, 지나면 0, 180초 위는 자름, 닫힘 시각 모르면 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-001~005 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { computeResultSecondsLeft } = await import("../../src/domains/game/result/socket/resultClose.js")

// 지금 시각 하나로 고정 (판 끝 시각 + 180초 = 닫힘)
const NOW = 1_800_000_000_000

// (닫힘 − 지금) → 남은 초
const CASES = [
  ["A08-F-001", "179.2초 → 180", NOW + 179_200, 180],
  ["A08-F-002", "0.4초 → 1", NOW + 400, 1],
  ["A08-F-003", "지남(−1초) → 0", NOW - 1_000, 0],
  ["A08-F-004", "200초 → 180으로 자름", NOW + 200_000, 180],
  ["A08-F-005", "닫힘 시각 없음 → null", null, null],
]

for (const [no, name, closesAt, expected] of CASES) {
  test(`${no} 남은 초 계산: ${name}`, () => {
    assert.equal(computeResultSecondsLeft(closesAt, NOW), expected)
  })
}

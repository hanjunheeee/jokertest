// 판 끝 칸 다듬기 시험: 받은 골드 값 읽기·모르는 승자 버림·MVP 안 씀·모양 틀린 줄만 뺌·산 사람 죽은 이유 비움
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-001~013 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { normalizePublicWinResult } = await import("../../src/domains/game/ingame/utils/normalizePublicWinResult.js")

// 5명 판 공개 줄 (서버 buildPublicWinResult 모양), 0번 광대·나머지 시민, 골드 1
const reveal = (i, over = {}) => ({
  uuid: `u${i}`,
  nickname: ["여우", "달빛", "별빛", "나비", "장미"][i],
  role: i === 0 ? "JOKER" : "CITIZEN",
  team: i === 0 ? "JOKER" : "CITIZEN",
  alive: i !== 0,
  deathReason: i === 0 ? "EXECUTION" : null,
  goldReward: 1,
  ...over,
})
const fiveReveals = () => [0, 1, 2, 3, 4].map((i) => reveal(i))

// 받은 골드: 서버 값 → 화면이 쥐는 값 (1 이상 정수만, 나머지는 못 받은 것으로 0)
const GOLD_CASES = [
  ["A07-F-001", "1 → 1", 1, 1],
  ["A07-F-002", "100 → 100", 100, 100],
  ["A07-F-003", "0 → 0", 0, 0],
  ["A07-F-004", "−1 → 0", -1, 0],
  ["A07-F-005", "1.5 → 0", 1.5, 0],
  ["A07-F-006", "글자 \"1\" → 0", "1", 0],
  ["A07-F-007", "칸 없음 → 0", undefined, 0],
]

for (const [no, name, given, expected] of GOLD_CASES) {
  test(`${no} 받은 골드 값 읽기: ${name}`, () => {
    const reveals = fiveReveals()
    // 내 줄(1번) 값만 바꿈, 칸 없음이면 칸째 뺌
    if (given === undefined) delete reveals[1].goldReward
    else reveals[1].goldReward = given
    const result = normalizePublicWinResult({ winner: "CITIZEN", reveals })
    assert.equal(result.reveals[1].goldReward, expected)
    // 다른 줄은 그대로 1
    assert.equal(result.reveals[2].goldReward, 1)
  })
}

test("A07-F-008 모르는 승자는 버림: winner NONE → 결과 없음(null)", () => {
  assert.equal(normalizePublicWinResult({ winner: "NONE", reveals: fiveReveals() }), null)
  // 아는 승자면 결과가 있음 (늘 null인 함수가 아님)
  assert.notEqual(normalizePublicWinResult({ winner: "JOKER", reveals: fiveReveals() }), null)
})

test("A07-F-009 옛 서버가 MVP를 보내도 안 씀: { winner, reveals, mvp } → 다듬은 값에 mvp 없음", () => {
  const result = normalizePublicWinResult({ winner: "CITIZEN", reveals: fiveReveals(), mvp: { uuid: "u2" } })
  assert.equal(Object.hasOwn(result, "mvp"), false)
  assert.equal(JSON.stringify(result).includes("mvp"), false)
  assert.equal(result.winner, "CITIZEN")
})

// 모양 틀린 공개 줄: 그 줄만 빠지고 나머지 남음
const BAD_ROW_CASES = [
  ["A07-F-010", "같은 uuid 두 번", (reveals) => { reveals.push(reveal(2, { nickname: "가짜" })) }, ["u0", "u1", "u2", "u3", "u4"]],
  ["A07-F-011", "팀 모르는 값", (reveals) => { reveals[3].team = "NEUTRAL" }, ["u0", "u1", "u2", "u4"]],
  ["A07-F-012", "생사 칸 없음", (reveals) => { delete reveals[4].alive }, ["u0", "u1", "u2", "u3"]],
]

for (const [no, name, spoil, expectedUuids] of BAD_ROW_CASES) {
  test(`${no} 모양 틀린 공개 줄은 그 줄만 뺌: ${name}`, () => {
    const reveals = fiveReveals()
    spoil(reveals)
    const result = normalizePublicWinResult({ winner: "CITIZEN", reveals })
    assert.deepEqual(result.reveals.map((r) => r.uuid), expectedUuids)
    // 두 번 온 줄은 앞 것만 (닉네임이 "가짜"가 아님)
    assert.equal(result.reveals.some((r) => r.nickname === "가짜"), false)
  })
}

test("A07-F-013 산 사람 죽은 이유 비움: alive true·deathReason \"EXECUTION\" → 이유 null", () => {
  const reveals = fiveReveals()
  reveals[2].deathReason = "EXECUTION"
  const result = normalizePublicWinResult({ winner: "CITIZEN", reveals })
  assert.equal(result.reveals[2].alive, true)
  assert.equal(result.reveals[2].deathReason, null)
  // 죽은 사람 이유는 그대로
  assert.equal(result.reveals[0].deathReason, "EXECUTION")
})

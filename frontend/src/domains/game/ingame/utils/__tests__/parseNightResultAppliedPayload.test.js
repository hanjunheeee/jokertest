import test from "node:test"
import assert from "node:assert/strict"

import { parseNightResultAppliedPayload } from "../parseNightResultAppliedPayload.js"

const CANONICAL_IDS = new Set(["p1", "p2", "p3"])

function baseArgs(overrides = {}) {
  return { gameId: "g1", dayIndex: 2, canonicalPlayerIds: CANONICAL_IDS, ...overrides }
}

function nonTerminalPayload(overrides = {}) {
  return {
    gameId: "g1",
    phase: "DAY",
    dayIndex: 3,
    victimUuid: "p1",
    players: [
      { uuid: "p1", alive: false },
      { uuid: "p2", alive: true },
      { uuid: "p3", alive: true },
    ],
    ...overrides,
  }
}

function terminalPayload(overrides = {}) {
  return {
    gameId: "g1",
    phase: "ENDED",
    dayIndex: 2,
    victimUuid: "p1",
    winResult: { winner: "CITIZEN" },
    players: [
      { uuid: "p1", isAlive: false },
      { uuid: "p2", isAlive: true },
      { uuid: "p3", isAlive: true },
    ],
    ...overrides,
  }
}

function parse(payload, argOverrides = {}) {
  return parseNightResultAppliedPayload({ payload, ...baseArgs(argOverrides) })
}

// --- 정상 비종료 NIGHT→DAY 결과 ---

test("정상 비종료 NIGHT→DAY 결과 payload는 파싱되어 정규화된 필드를 반환한다", () => {
  const result = parse(nonTerminalPayload())
  assert.notEqual(result, null)
  assert.deepEqual(result, {
    gameId: "g1",
    phase: "DAY",
    dayIndex: 3,
    players: [
      { uuid: "p1", alive: false },
      { uuid: "p2", alive: true },
      { uuid: "p3", alive: true },
    ],
    victimUuid: "p1",
  })
})

// --- 정상 종료(ENDED) payload ---

test("정상 종료(ENDED) payload는 파싱되어 정규화된 필드를 반환한다", () => {
  const result = parse(terminalPayload())
  assert.notEqual(result, null)
  assert.deepEqual(result, {
    gameId: "g1",
    phase: "ENDED",
    dayIndex: 2,
    players: [
      { uuid: "p1", isAlive: false },
      { uuid: "p2", isAlive: true },
      { uuid: "p3", isAlive: true },
    ],
    victimUuid: "p1",
    winResult: { winner: "CITIZEN" },
  })
})

test("종료 payload는 dayIndex가 현재값과 같아도(DAY 전이 없이 즉시 종료) 통과한다", () => {
  const result = parse(terminalPayload({ dayIndex: 2 }), { dayIndex: 2 })
  assert.notEqual(result, null)
  assert.equal(result.dayIndex, 2)
})

// --- winResult 보존 ---

test("종료 payload의 winResult.winner가 CITIZEN이면 그대로 보존된다", () => {
  const result = parse(terminalPayload({ winResult: { winner: "CITIZEN" } }))
  assert.deepEqual(result.winResult, { winner: "CITIZEN" })
})

test("종료 payload의 winResult.winner가 JOKER면 그대로 보존된다", () => {
  const result = parse(terminalPayload({ winResult: { winner: "JOKER" } }))
  assert.deepEqual(result.winResult, { winner: "JOKER" })
})

// --- 식별자 보존 ---

test("종료 payload의 gameId/phase/victimUuid 식별자가 그대로 보존된다", () => {
  const result = parse(terminalPayload())
  assert.notEqual(result, null)
  assert.equal(result.gameId, "g1")
  assert.equal(result.phase, "ENDED")
  assert.equal(result.dayIndex, 2)
  assert.equal(result.victimUuid, "p1")
})

test("종료 payload의 dayIndex가 현재보다 미래면(임의의 미래 dayIndex) 거부된다", () => {
  const result = parse(terminalPayload({ dayIndex: 5 }), { dayIndex: 2 })
  assert.equal(result, null)
})

// --- malformed winResult ---

test("종료 payload의 winResult가 구조 불량이면 거부된다", () => {
  const malformedWinResults = ["CITIZEN", [], {}, { winner: "TIE" }, { winner: "citizen" }, 42]
  for (const winResult of malformedWinResults) {
    const result = parse(terminalPayload({ winResult }))
    assert.equal(result, null, `winResult=${JSON.stringify(winResult)}`)
  }
})

// --- ENDED without a valid winResult ---

test("종료 payload에 winResult가 null로 명시되면 거부된다", () => {
  const result = parse(terminalPayload({ winResult: null }))
  assert.equal(result, null)
})

test("종료 payload에 winResult 필드 자체가 없으면 거부된다", () => {
  const payload = terminalPayload()
  delete payload.winResult
  const result = parse(payload)
  assert.equal(result, null)
})

// --- 잘못된 public player 스냅샷 ---

test("players가 배열이 아니면 종료·비종료 모두 거부된다", () => {
  assert.equal(parse(terminalPayload({ players: "not-array" })), null)
  assert.equal(parse(nonTerminalPayload({ players: "not-array" })), null)
})

test("player 항목 자체가 유효한 객체가 아니면 거부된다", () => {
  const invalidEntries = [null, "p1", 42, ["p1", true]]
  for (const entry of invalidEntries) {
    const result = parse(terminalPayload({ players: [entry, { uuid: "p2", isAlive: true }, { uuid: "p3", isAlive: true }] }))
    assert.equal(result, null, `entry=${JSON.stringify(entry)}`)
  }
})

test("player 항목에 uuid가 없거나 문자열이 아니면 거부된다", () => {
  const result = parse(
    terminalPayload({
      players: [{ isAlive: false }, { uuid: "p2", isAlive: true }, { uuid: "p3", isAlive: true }],
    }),
  )
  assert.equal(result, null)
})

test("종료 payload의 player 항목의 isAlive가 boolean이 아니면 거부된다", () => {
  const result = parse(
    terminalPayload({
      players: [{ uuid: "p1", isAlive: "dead" }, { uuid: "p2", isAlive: true }, { uuid: "p3", isAlive: true }],
    }),
  )
  assert.equal(result, null)
})

test("비종료 결과의 player 항목의 alive가 boolean이 아니면 거부된다", () => {
  const result = parse(
    nonTerminalPayload({
      players: [{ uuid: "p1", alive: "dead" }, { uuid: "p2", alive: true }, { uuid: "p3", alive: true }],
    }),
  )
  assert.equal(result, null)
})

test("player uuid가 중복되면 거부된다", () => {
  const result = parse(
    terminalPayload({
      players: [{ uuid: "p1", isAlive: false }, { uuid: "p1", isAlive: true }, { uuid: "p3", isAlive: true }],
    }),
  )
  assert.equal(result, null)
})

test("canonical roster보다 players 수가 적으면(누락) 거부된다", () => {
  const result = parse(
    terminalPayload({
      players: [{ uuid: "p1", isAlive: false }, { uuid: "p2", isAlive: true }],
    }),
  )
  assert.equal(result, null)
})

test("canonical roster에 없는 uuid가 섞이면 거부된다", () => {
  const result = parse(
    terminalPayload({
      players: [{ uuid: "p1", isAlive: false }, { uuid: "p2", isAlive: true }, { uuid: "px", isAlive: true }],
    }),
  )
  assert.equal(result, null)
})

test("비종료 결과에서 victimUuid와 실제 사망자가 불일치하면 거부된다", () => {
  const result = parse(nonTerminalPayload({ victimUuid: "p2" }))
  assert.equal(result, null)
})

test("비종료 결과에서 victimUuid가 null인데 사망자가 있으면 거부된다", () => {
  const result = parse(nonTerminalPayload({ victimUuid: null }))
  assert.equal(result, null)
})

// --- 두 번째 이후 밤(과거 사망자가 roster에 남아있는 상태) 회귀 ---
// 실제 브라우저 버그(첫 DAY/TRIBUNAL 사이클을 마치고 NIGHT 2로 들어간 뒤 DAY 2로 넘어가지
// 않음)의 근본 원인이었다: buildNightResultAppliedPayload는 매번 전체 roster의 alive 상태를
// 보내므로, 두 번째 밤부터는 payload.players에 과거(이전 밤/TRIBUNAL) 사망자가 계속 포함된다.
// victimUuid 하나만으로 "사망자는 0명 또는 victimUuid 하나뿐"이라고 검증하면 이 정상적인
// 두 번째 밤 결과가 거부된다.

test("이전에 죽은 참가자가 있고 이번 밤 새 희생자가 없으면(둘 다 정상) 파싱된다", () => {
  const result = parse(
    nonTerminalPayload({
      victimUuid: null,
      players: [
        { uuid: "p1", alive: false }, // 지난 TRIBUNAL에서 이미 처형됨
        { uuid: "p2", alive: true },
        { uuid: "p3", alive: true },
      ],
    }),
    { previouslyDeadUuids: new Set(["p1"]) },
  )
  assert.notEqual(result, null)
  assert.deepEqual(result.players, [
    { uuid: "p1", alive: false },
    { uuid: "p2", alive: true },
    { uuid: "p3", alive: true },
  ])
  assert.equal(result.victimUuid, null)
})

test("이전에 죽은 참가자가 있고 이번 밤 새 희생자가 생기면 둘 다 죽은 채로 파싱된다", () => {
  const result = parse(
    nonTerminalPayload({
      victimUuid: "p2",
      players: [
        { uuid: "p1", alive: false }, // 지난 TRIBUNAL에서 이미 처형됨
        { uuid: "p2", alive: false }, // 이번 밤의 새 희생자
        { uuid: "p3", alive: true },
      ],
    }),
    { previouslyDeadUuids: new Set(["p1"]) },
  )
  assert.notEqual(result, null)
  assert.equal(result.victimUuid, "p2")
})

test("previouslyDeadUuids를 넘기지 않으면 빈 Set으로 취급한다(첫 밤과 동일한 기존 동작)", () => {
  const result = parse(nonTerminalPayload())
  assert.notEqual(result, null)
})

test("이미 죽은 참가자가 roster에서 다시 살아나면(resurrection) 거부된다", () => {
  const result = parse(
    nonTerminalPayload({
      victimUuid: null,
      players: [
        { uuid: "p1", alive: true }, // 지난 TRIBUNAL에서 죽었는데 되살아난 것처럼 옴 — 거부돼야 함
        { uuid: "p2", alive: true },
        { uuid: "p3", alive: true },
      ],
    }),
    { previouslyDeadUuids: new Set(["p1"]) },
  )
  assert.equal(result, null)
})

test("victimUuid가 이미 죽은 사람을 가리키면 거부된다(재처형 불가)", () => {
  const result = parse(
    nonTerminalPayload({
      victimUuid: "p1",
      players: [
        { uuid: "p1", alive: false },
        { uuid: "p2", alive: true },
        { uuid: "p3", alive: true },
      ],
    }),
    { previouslyDeadUuids: new Set(["p1"]) },
  )
  assert.equal(result, null)
})

test("과거 사망자를 반영하지 않고 victimUuid만으로 세면(옛 검증 방식) 실패했을 payload가, previouslyDeadUuids와 함께라면 통과한다", () => {
  // 이 테스트는 회귀 재현용이다: previouslyDeadUuids를 생략하면(옛 동작과 동일) 아래 payload는
  // deadUuids.length(1, p1) !== 0(victimUuid가 null이므로 기대값 0)이라 거부됐을 것이다.
  const withoutPriorDead = parse(
    nonTerminalPayload({
      victimUuid: null,
      players: [
        { uuid: "p1", alive: false },
        { uuid: "p2", alive: true },
        { uuid: "p3", alive: true },
      ],
    }),
  )
  assert.equal(withoutPriorDead, null, "canonical dead 정보 없이 과거 사망자를 포함한 payload는 여전히 거부된다")

  const withPriorDead = parse(
    nonTerminalPayload({
      victimUuid: null,
      players: [
        { uuid: "p1", alive: false },
        { uuid: "p2", alive: true },
        { uuid: "p3", alive: true },
      ],
    }),
    { previouslyDeadUuids: new Set(["p1"]) },
  )
  assert.notEqual(withPriorDead, null, "previouslyDeadUuids를 전달하면 동일한 payload가 통과해야 한다(버그 수정 확인)")
})

// --- stale / 불일치 payload 거부 ---

test("gameId가 현재와 다르면 종료·비종료 모두 거부된다", () => {
  assert.equal(parse(terminalPayload({ gameId: "g-other" })), null)
  assert.equal(parse(nonTerminalPayload({ gameId: "g-other" })), null)
})

test("종료 payload의 dayIndex가 현재보다 과거면(stale) 거부된다", () => {
  const result = parse(terminalPayload({ dayIndex: 1 }), { dayIndex: 2 })
  assert.equal(result, null)
})

test("비종료 결과의 dayIndex가 현재 이하이면(stale) 거부된다", () => {
  const result = parse(nonTerminalPayload({ dayIndex: 2 }), { dayIndex: 2 })
  assert.equal(result, null)
})

test("victimUuid가 canonical roster에 없으면 거부된다", () => {
  assert.equal(parse(terminalPayload({ victimUuid: "px" })), null)
  // players는 canonical roster와 정확히 일치시켜(p1/p2/p3) roster 불일치가 아닌
  // victimUuid 자체의 canonical 미포함 검증만 단독으로 발생시킨다.
  assert.equal(parse(nonTerminalPayload({ victimUuid: "px" })), null)
})

test("victimUuid가 문자열이 아니면(null 제외) 거부된다", () => {
  assert.equal(parse(terminalPayload({ victimUuid: 123 })), null)
  assert.equal(parse(nonTerminalPayload({ victimUuid: 123 })), null)
})

// --- private 정보 미노출 ---

test("private 필드(role/team/allies/privateResults/nightActions/ballotSnapshot/투표 원문)는 반환값에 포함되지 않는다", () => {
  const payload = terminalPayload({
    role: "JOKER",
    team: "JOKER",
    allies: ["p2"],
    privateResults: { p1: "killed" },
    nightActions: [{ actorUuid: "p2", targetUuid: "p1" }],
    ballotSnapshot: { p1: "guilty" },
    votes: [{ voterUuid: "p2", targetUuid: "p1" }],
    players: [
      { uuid: "p1", isAlive: false, role: "CITIZEN" },
      { uuid: "p2", isAlive: true, team: "JOKER" },
      { uuid: "p3", isAlive: true },
    ],
  })

  const result = parse(payload)
  assert.notEqual(result, null)
  assert.deepEqual(Object.keys(result).sort(), ["dayIndex", "gameId", "phase", "players", "victimUuid", "winResult"].sort())
  for (const player of result.players) {
    assert.deepEqual(Object.keys(player).sort(), ["isAlive", "uuid"])
  }
})

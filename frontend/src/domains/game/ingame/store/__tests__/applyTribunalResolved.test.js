import test from "node:test"
import assert from "node:assert/strict"

import { applyTribunalResolvedPure } from "../applyTribunalResolved.js"

function baseCurrent(overrides = {}) {
  return {
    gameId: "g1",
    error: null,
    state: {
      id: "g1",
      phase: "TRIBUNAL",
      dayIndex: 2,
      tribunal: { defendantUuid: "d1" },
      players: [
        { uuid: "d1", nickname: "D", alive: true },
        { uuid: "p2", nickname: "P2", alive: true },
      ],
    },
    ...overrides,
  }
}

function basePayload(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "TRIBUNAL",
    defendantUuid: "d1",
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "d1",
    ...overrides,
  }
}

test("applyTribunalResolvedPure: gameId 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ gameId: "other" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: dayIndex 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ dayIndex: 99 }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: phase 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ phase: "DAY" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: defendantUuid 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ defendantUuid: "someone-else" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: 정상 GUILTY 판정은 tribunal 결과 필드와 executedUuid 대상 alive:false만 반영한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload())

  assert.notEqual(result, current)
  assert.equal(result.state.tribunal.outcome, "GUILTY")
  assert.deepEqual(result.state.tribunal.counts, { guilty: 2, notGuilty: 1 })
  assert.equal(result.state.tribunal.executedUuid, "d1")
  assert.equal(result.state.tribunal.resolved, true)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, false)
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, true)
})

test("applyTribunalResolvedPure: NOT_GUILTY 판정은 아무도 alive를 false로 바꾸지 않는다", () => {
  const current = baseCurrent()
  const payload = basePayload({ outcome: "NOT_GUILTY", counts: { guilty: 1, notGuilty: 2 }, executedUuid: null })
  const result = applyTribunalResolvedPure(current, payload)

  assert.equal(result.state.tribunal.outcome, "NOT_GUILTY")
  assert.equal(result.state.tribunal.executedUuid, null)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, true)
})

test("applyTribunalResolvedPure: 승리 없음(비종료) 판정은 phase를 TRIBUNAL로 유지한 채 resolved 상태로 잠근다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload())

  assert.equal(result.state.phase, "TRIBUNAL")
  assert.equal(result.state.tribunal.resolved, true)
})

// --- 종료(ENDED) 판정 ---

function terminalTribunalPayload(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "ENDED",
    defendantUuid: "d1",
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "d1",
    winResult: { winner: "CITIZEN" },
    players: [
      { uuid: "d1", isAlive: false },
      { uuid: "p2", isAlive: true },
    ],
    ...overrides,
  }
}

test("applyTribunalResolvedPure: 종료(ENDED) GUILTY 판정으로 시민 진영이 승리하면 phase가 ENDED로 바뀌고 winResult가 반영된다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, terminalTribunalPayload({ winResult: { winner: "CITIZEN" } }))

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "ENDED")
  assert.deepEqual(result.state.winResult, { winner: "CITIZEN", reveals: [], mvp: null })
  assert.equal(result.state.tribunal.outcome, "GUILTY")
  assert.equal(result.state.tribunal.resolved, true)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, false)
})

test("applyTribunalResolvedPure: 종료(ENDED) NOT_GUILTY 판정으로 조커 진영이 승리하면 phase가 ENDED로 바뀌고 winResult가 반영된다", () => {
  const current = baseCurrent()
  const payload = terminalTribunalPayload({
    outcome: "NOT_GUILTY",
    executedUuid: null,
    counts: { guilty: 1, notGuilty: 2 },
    winResult: { winner: "JOKER" },
    players: [
      { uuid: "d1", isAlive: true },
      { uuid: "p2", isAlive: true },
    ],
  })
  const result = applyTribunalResolvedPure(current, payload)

  assert.equal(result.state.phase, "ENDED")
  assert.deepEqual(result.state.winResult, { winner: "JOKER", reveals: [], mvp: null })
  assert.equal(result.state.tribunal.outcome, "NOT_GUILTY")
  assert.equal(result.state.tribunal.executedUuid, null)
})

// --- winResult 전체 보존(reveals/mvp) ---

function tribunalReveals() {
  return [
    { uuid: "d1", nickname: "D", role: "JOKER", team: "JOKER", alive: false },
    { uuid: "p2", nickname: "P2", role: "GUARD", team: "CITIZEN", alive: true },
  ]
}

test("applyTribunalResolvedPure: 종료 payload의 winResult.reveals와 mvp가 순서·필드 그대로 보존된다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(
    current,
    terminalTribunalPayload({ winResult: { winner: "CITIZEN", reveals: tribunalReveals(), mvp: { uuid: "p2" } } }),
  )

  assert.deepEqual(result.state.winResult, {
    winner: "CITIZEN",
    reveals: tribunalReveals(),
    mvp: { uuid: "p2" },
  })
})

test("applyTribunalResolvedPure: winResult.reveals가 배열이 아니거나 없으면 거부가 아니라 빈 배열로 정규화된다", () => {
  const current = baseCurrent()

  for (const reveals of ["not-an-array", 42, null, undefined]) {
    const result = applyTribunalResolvedPure(
      current,
      terminalTribunalPayload({ winResult: { winner: "CITIZEN", reveals } }),
    )
    assert.notEqual(result, current, `reveals=${String(reveals)}`)
    assert.deepEqual(result.state.winResult.reveals, [], `reveals=${String(reveals)}`)
  }
})

test("applyTribunalResolvedPure: 종료 payload의 winResult 객체를 이후 변형해도 store 결과가 영향받지 않는다", () => {
  const current = baseCurrent()
  const payload = terminalTribunalPayload({
    winResult: { winner: "CITIZEN", reveals: tribunalReveals(), mvp: { uuid: "p2" } },
  })

  const result = applyTribunalResolvedPure(current, payload)
  const expected = structuredClone(result.state.winResult)

  payload.winResult.winner = "JOKER"
  payload.winResult.reveals[0].role = "CITIZEN"
  payload.winResult.reveals.length = 0
  payload.winResult.mvp.uuid = "d1"

  assert.deepStrictEqual(result.state.winResult, expected)
})

test("applyTribunalResolvedPure: 종료 payload의 players 배열이 canonical roster와 정확히 일치하면 생존 상태가 그대로 반영된다", () => {
  const current = baseCurrent({
    state: {
      ...baseCurrent().state,
      players: [
        { uuid: "d1", nickname: "D", alive: true },
        { uuid: "p2", nickname: "P2", alive: true },
        { uuid: "p3", nickname: "P3", alive: true },
      ],
    },
  })
  const result = applyTribunalResolvedPure(
    current,
    terminalTribunalPayload({
      players: [
        { uuid: "d1", isAlive: false },
        { uuid: "p2", isAlive: false },
        { uuid: "p3", isAlive: true },
      ],
    }),
  )

  assert.notEqual(result, current)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, false)
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, false)
  assert.equal(result.state.players.find((p) => p.uuid === "p3").alive, true)
})

test("applyTribunalResolvedPure: 구조 불량 종료 payload는 상태를 바꾸지 않는다", () => {
  const current = baseCurrent()

  assert.equal(applyTribunalResolvedPure(current, terminalTribunalPayload({ players: "not-array" })), current)
  assert.equal(
    applyTribunalResolvedPure(
      current,
      terminalTribunalPayload({ players: [{ uuid: "d1", isAlive: "dead" }, { uuid: "p2", isAlive: true }] }),
    ),
    current,
  )
  assert.equal(applyTribunalResolvedPure(current, terminalTribunalPayload({ winResult: { winner: "TIE" } })), current)
  assert.equal(applyTribunalResolvedPure(current, terminalTribunalPayload({ winResult: null })), current)
})

test("applyTribunalResolvedPure: 종료 payload에 winResult 필드 자체가 없으면 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const payload = terminalTribunalPayload()
  delete payload.winResult

  const result = applyTribunalResolvedPure(current, payload)

  assert.equal(result, current)
  assert.equal(result.state, current.state)
  assert.equal(result.state.players, current.state.players)
  assert.equal(result.state.tribunal, current.state.tribunal)
})

test("applyTribunalResolvedPure: 종료 payload에서 canonical uuid 하나가 누락되면 원래 state 참조를 그대로 반환하고 어떤 중첩 상태도 바뀌지 않는다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(
    current,
    terminalTribunalPayload({
      players: [{ uuid: "d1", isAlive: false }],
      // p2는 의도적으로 생략 — 부분 반영 없이 전체 payload가 거부되어야 한다.
    }),
  )

  assert.equal(result, current)
  assert.equal(result.state, current.state)
  assert.equal(result.state.players, current.state.players)
  assert.equal(result.state.tribunal, current.state.tribunal)
})

test("applyTribunalResolvedPure: 종료 payload에 canonical roster에 없는 uuid가 섞이면 원래 state 참조를 그대로 반환하고 어떤 중첩 상태도 바뀌지 않는다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(
    current,
    terminalTribunalPayload({
      players: [
        { uuid: "d1", isAlive: false },
        { uuid: "p2", isAlive: true },
        { uuid: "unknown", isAlive: true },
      ],
    }),
  )

  assert.equal(result, current)
  assert.equal(result.state, current.state)
  assert.equal(result.state.players, current.state.players)
  assert.equal(result.state.tribunal, current.state.tribunal)
})

test("applyTribunalResolvedPure: 종료 payload의 players에 uuid가 중복되면 원래 state 참조를 그대로 반환하고 마지막 항목을 조용히 채택하지 않는다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(
    current,
    terminalTribunalPayload({
      players: [
        { uuid: "d1", isAlive: false },
        { uuid: "d1", isAlive: true },
      ],
      // p2는 의도적으로 생략 — 중복 검출이 누락 검사보다 먼저 전체 payload를 거부해야 한다.
    }),
  )

  assert.equal(result, current)
  assert.equal(result.state, current.state)
  assert.equal(result.state.players, current.state.players)
  assert.equal(result.state.tribunal, current.state.tribunal)
})

test("applyTribunalResolvedPure: current.state.phase가 TRIBUNAL이 아니면(stale) 종료 payload를 거부한다", () => {
  const current = baseCurrent({ state: { ...baseCurrent().state, phase: "DAY" } })
  const result = applyTribunalResolvedPure(current, terminalTribunalPayload())
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: dayIndex가 현재와 다르면(stale/mismatch) 종료 payload도 거부된다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, terminalTribunalPayload({ dayIndex: 3 }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: ENDED 확정 이후 도착하는 비종료·종료 payload가 상태를 되돌리지 못한다", () => {
  const current = baseCurrent()
  const patch = applyTribunalResolvedPure(current, terminalTribunalPayload())
  const merged = { ...current, ...patch } // zustand의 set() 병합 방식을 그대로 재현한다.
  assert.equal(merged.state.phase, "ENDED")

  const afterNonTerminal = applyTribunalResolvedPure(merged, basePayload())
  assert.equal(afterNonTerminal, merged)

  const afterAnotherTerminal = applyTribunalResolvedPure(merged, terminalTribunalPayload({ winResult: { winner: "JOKER" } }))
  assert.equal(afterAnotherTerminal, merged)
})

// --- 승리 없음(no-winner) 전이: TRIBUNAL → NIGHT ---

function nightTribunalPayload(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: "d1",
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "d1",
    ...overrides,
  }
}

test("applyTribunalResolvedPure: 승리 없는 GUILTY 판정은 phase를 NIGHT로 전이하고 dayIndex를 유지하며 피고인을 alive:false로 반영한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, nightTribunalPayload())

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "NIGHT")
  assert.equal(result.state.dayIndex, current.state.dayIndex)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, false)
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, true)
})

test("applyTribunalResolvedPure: 승리 없는 NOT_GUILTY 판정은 phase를 NIGHT로 전이하되 아무도 죽이지 않는다", () => {
  const current = baseCurrent()
  const payload = nightTribunalPayload({ outcome: "NOT_GUILTY", executedUuid: null, counts: { guilty: 1, notGuilty: 2 } })
  const result = applyTribunalResolvedPure(current, payload)

  assert.equal(result.state.phase, "NIGHT")
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, true)
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, true)
})

test("applyTribunalResolvedPure: NIGHT 전이는 stale tribunal UI 상태를 null로 비운다(ENDED 분기와 달리 결과를 남겨두지 않는다)", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, nightTribunalPayload())

  assert.equal(result.state.tribunal, null)
})

test("applyTribunalResolvedPure: NIGHT 전이 payload의 dayIndex가 현재와 다르면(stale) 거부되고 상태가 바뀌지 않는다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, nightTribunalPayload({ dayIndex: 3 }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: current.state.phase가 TRIBUNAL이 아니면(stale) NIGHT 전이 payload를 거부한다", () => {
  const current = baseCurrent({ state: { ...baseCurrent().state, phase: "DAY" } })
  const result = applyTribunalResolvedPure(current, nightTribunalPayload())
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: 구조 불량 NIGHT 전이 payload는 상태를 바꾸지 않는다", () => {
  const current = baseCurrent()

  assert.equal(applyTribunalResolvedPure(current, nightTribunalPayload({ defendantUuid: "someone-else" })), current)
  assert.equal(applyTribunalResolvedPure(current, nightTribunalPayload({ outcome: "NOT_GUILTY" })), current) // executedUuid가 defendantUuid와 불일치
  assert.equal(applyTribunalResolvedPure(current, nightTribunalPayload({ gameId: "other" })), current)
})

test("applyTribunalResolvedPure: NIGHT 전이 이후 재도착하는 NIGHT/TRIBUNAL payload는 상태를 되돌리지 못한다(멱등)", () => {
  const current = baseCurrent()
  const patch = applyTribunalResolvedPure(current, nightTribunalPayload())
  const merged = { ...current, ...patch } // zustand의 set() 병합 방식을 그대로 재현한다.
  assert.equal(merged.state.phase, "NIGHT")
  assert.equal(merged.state.tribunal, null)

  // NIGHT 전이 이후 current.state.tribunal이 null이 됐으므로, 동일 defendantUuid를 요구하는
  // 위쪽 공용 검사(current.state.tribunal?.defendantUuid !== payload.defendantUuid)에서 이미
  // 자연히 거부된다.
  const afterDuplicateNight = applyTribunalResolvedPure(merged, nightTribunalPayload())
  assert.equal(afterDuplicateNight, merged)

  const afterStaleTribunal = applyTribunalResolvedPure(merged, basePayload())
  assert.equal(afterStaleTribunal, merged)
})

test("applyTribunalResolvedPure: ENDED 확정 이후 도착하는 NIGHT 전이 payload도 상태를 되돌리지 못한다(ENDED rollback 보호)", () => {
  const current = baseCurrent()
  const patch = applyTribunalResolvedPure(current, terminalTribunalPayload())
  const merged = { ...current, ...patch }
  assert.equal(merged.state.phase, "ENDED")

  const afterNight = applyTribunalResolvedPure(merged, nightTribunalPayload())
  assert.equal(afterNight, merged)
})

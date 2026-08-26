import test from "node:test"
import assert from "node:assert/strict"

import { applySessionSnapshotPure } from "../applySessionSnapshot.js"
import { applyTribunalResolvedPure } from "../applyTribunalResolved.js"
import { parseNightResultAppliedPayload } from "../../utils/parseNightResultAppliedPayload.js"

function baseCurrentState(overrides = {}) {
  return {
    id: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: [
      { uuid: "p1", nickname: "P1", alive: true },
      { uuid: "p2", nickname: "P2", alive: true },
      { uuid: "p3", nickname: "P3", alive: true },
    ],
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    tribunal: null,
    winResult: null,
    ...overrides,
  }
}

function baseCurrent(stateOverrides = {}, topOverrides = {}) {
  return {
    gameId: "game-1",
    error: null,
    state: baseCurrentState(stateOverrides),
    ...topOverrides,
  }
}

function basePlayers() {
  return [
    { uuid: "p1", nickname: "P1", isAlive: true, isConnected: true },
    { uuid: "p2", nickname: "P2", isAlive: true, isConnected: true },
    { uuid: "p3", nickname: "P3", isAlive: true, isConnected: true },
  ]
}

function baseSelfObj(overrides = {}) {
  return { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, ...overrides }
}

function baseResponse(overrides = {}) {
  return {
    ok: true,
    gameId: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: basePlayers(),
    self: baseSelfObj(),
    ...overrides,
  }
}

// pure-function 수준 거부 레시피: 호출 전 current를 독립적으로 clone해두고, 호출 후
// (a) 참조 동일성과 (b) clone과의 deep equality를 함께 검증한다 — 거부 경로가 current를
// 제자리에서 바꾼 뒤 그 참조를 그대로 돌려주는 경우까지 잡아낸다.
function assertRejected(current, response) {
  const preCall = structuredClone(current)
  const result = applySessionSnapshotPure(current, response)
  assert.equal(result, current)
  assert.equal(result.state, current.state)
  assert.deepStrictEqual(result, preCall)
}

// --- 정상 반영: phase별 ---

test("applySessionSnapshotPure: 유효한 ROLE_REVEAL 스냅샷을 반영하고 phase별 결과 필드를 모두 null로 비운다", () => {
  const current = baseCurrent()
  const response = baseResponse()

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.notEqual(result.state, current.state)
  assert.equal(result.state.id, "game-1")
  assert.equal(result.state.phase, "ROLE_REVEAL")
  assert.equal(result.state.dayIndex, 0)
  assert.deepEqual(result.state.players, [
    { uuid: "p1", nickname: "P1", alive: true, isConnected: true },
    { uuid: "p2", nickname: "P2", alive: true, isConnected: true },
    { uuid: "p3", nickname: "P3", alive: true, isConnected: true },
  ])
  assert.deepEqual(result.state.self, { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false })
  assert.equal(result.state.tribunal, null)
  assert.equal(result.state.winResult, null)
  assert.equal(result.state.nightResult, null)
  assert.equal(result.state.dayVoteResolution, null)
})

test("applySessionSnapshotPure: 유효한 NIGHT 스냅샷을 반영한다(nightResult 없음)", () => {
  const current = baseCurrent()
  const response = baseResponse({ phase: "NIGHT" })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "NIGHT")
  assert.equal(result.state.nightResult, null)
})

test("applySessionSnapshotPure: 유효한 DAY 스냅샷은 nightResult를 반영하고 희생자 alive를 false로 표시한다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY",
    dayIndex: 1,
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: { dayIndex: 1, victimUuid: "p3" },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "DAY")
  assert.deepEqual(result.state.nightResult, { dayIndex: 1, victimUuid: "p3" })
  assert.equal(result.state.players.find((p) => p.uuid === "p3").alive, false)
  assert.equal(result.state.dayVoteResolution, null)
  assert.equal(result.state.tribunal, null)
})

test("applySessionSnapshotPure: 유효한 TRIBUNAL(미확정) 스냅샷은 dayVoteResolution/tribunal을 함께 반영한다", () => {
  const current = baseCurrent({ phase: "DAY", dayIndex: 1 })
  const response = baseResponse({
    phase: "TRIBUNAL",
    dayIndex: 1,
    dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
    tribunal: { defendantUuid: "p2", resolved: false },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "TRIBUNAL")
  assert.deepEqual(result.state.tribunal, { defendantUuid: "p2", resolved: false })
  assert.deepEqual(result.state.dayVoteResolution, {
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "p2",
    publicVoteCount: 2,
    publicAbstainCount: 0,
  })
})

test("applySessionSnapshotPure: 유효한 ENDED 스냅샷은 winResult와 확정된 tribunal 결과를 반영한다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isAlive: false } : p)),
    tribunal: {
      defendantUuid: "p2",
      resolved: true,
      outcome: "GUILTY",
      counts: { guilty: 2, notGuilty: 1 },
      executedUuid: "p2",
    },
    dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
    winResult: { winner: "CITIZEN" },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "ENDED")
  assert.deepEqual(result.state.winResult, { winner: "CITIZEN", reveals: [], mvp: null })
  assert.deepEqual(result.state.tribunal, {
    defendantUuid: "p2",
    resolved: true,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "p2",
  })
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, false)
})

// --- winResult 전체 보존(reveals/mvp) ---

function endedReveals() {
  return [
    { uuid: "p1", nickname: "P1", role: "JOKER", team: "JOKER", alive: true },
    { uuid: "p2", nickname: "P2", role: "CITIZEN", team: "CITIZEN", alive: false },
    { uuid: "p3", nickname: "P3", role: "DOCTOR", team: "CITIZEN", alive: true },
  ]
}

test("applySessionSnapshotPure: ENDED 스냅샷의 winResult.reveals는 순서·필드 그대로 보존된다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    winResult: { winner: "JOKER", reveals: endedReveals(), mvp: null },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.deepEqual(result.state.winResult, { winner: "JOKER", reveals: endedReveals(), mvp: null })
})

test("applySessionSnapshotPure: winResult.reveals가 배열이 아니거나 없으면 빈 배열로 정규화된다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })

  for (const reveals of ["not-an-array", 42, { uuid: "p1" }, null]) {
    const response = baseResponse({ phase: "ENDED", dayIndex: 1, winResult: { winner: "CITIZEN", reveals } })
    const result = applySessionSnapshotPure(current, response)
    assert.notEqual(result, current, `reveals=${JSON.stringify(reveals)}는 거부가 아니라 정규화다`)
    assert.deepEqual(result.state.winResult.reveals, [], `reveals=${JSON.stringify(reveals)}`)
  }

  const withoutReveals = baseResponse({ phase: "ENDED", dayIndex: 1, winResult: { winner: "CITIZEN" } })
  assert.deepEqual(applySessionSnapshotPure(current, withoutReveals).state.winResult.reveals, [])
})

test("applySessionSnapshotPure: reveals 원소 중 하나라도 객체가 아니면 명단 전체를 빈 배열로 만든다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    winResult: { winner: "CITIZEN", reveals: [endedReveals()[0], "p2"] },
  })

  assert.deepEqual(applySessionSnapshotPure(current, response).state.winResult.reveals, [])
})

test("applySessionSnapshotPure: winResult.mvp는 객체면 보존되고, 없거나 원시값이면 null이다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const withMvp = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    winResult: { winner: "CITIZEN", reveals: endedReveals(), mvp: { uuid: "p3" } },
  })
  const withoutMvp = baseResponse({ phase: "ENDED", dayIndex: 1, winResult: { winner: "CITIZEN", mvp: "p3" } })

  assert.deepEqual(applySessionSnapshotPure(current, withMvp).state.winResult.mvp, { uuid: "p3" })
  assert.equal(applySessionSnapshotPure(current, withoutMvp).state.winResult.mvp, null)
})

test("applySessionSnapshotPure: 이미 ENDED인 store에 동일 phase의 ENDED 스냅샷을 재적용하는 것은 허용된다", () => {
  const current = baseCurrent({
    phase: "ENDED",
    dayIndex: 1,
    winResult: { winner: "CITIZEN" },
    tribunal: { defendantUuid: "p2", resolved: true, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 1 }, executedUuid: "p2" },
  })
  const response = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isAlive: false } : p)),
    tribunal: { defendantUuid: "p2", resolved: true, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 1 }, executedUuid: "p2" },
    winResult: { winner: "CITIZEN" },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "ENDED")
})

// --- 거부: 구조/신원/roster/self ---

const rejectionCases = [
  ["response가 null이면 거부된다", () => baseCurrent(), () => null],
  ["response가 배열이면 거부된다", () => baseCurrent(), () => ["a", "b"]],
  ["response.ok가 true가 아니면 거부된다", () => baseCurrent(), () => baseResponse({ ok: false })],
  ["response.ok가 없으면 거부된다", () => baseCurrent(), () => baseResponse({ ok: undefined })],
  ["알 수 없는 phase는 거부된다", () => baseCurrent(), () => baseResponse({ phase: "UNKNOWN" })],
  ["dayIndex가 음수이면 거부된다", () => baseCurrent(), () => baseResponse({ dayIndex: -1 })],
  ["dayIndex가 정수가 아니면 거부된다", () => baseCurrent(), () => baseResponse({ dayIndex: 1.5 })],
  ["dayIndex가 문자열이면 거부된다", () => baseCurrent(), () => baseResponse({ dayIndex: "0" })],
  [
    "재접속할 기존 세션(gameId/state)이 없으면 거부된다",
    () => ({ gameId: null, error: null, state: null }),
    () => baseResponse(),
  ],
  ["gameId가 다르면 거부된다", () => baseCurrent(), () => baseResponse({ gameId: "other-game" })],
  [
    "gameId가 양쪽 다 문자열이 아니면(진짜 값처럼 보여도) 신원 일치로 인정되지 않는다",
    () => baseCurrent({}, { gameId: true }),
    () => baseResponse({ gameId: true }),
  ],
  [
    "roster에서 기존 참가자가 누락되면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ players: basePlayers().slice(0, 2) }),
  ],
  [
    "roster에 알 수 없는 참가자가 추가되면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ players: [...basePlayers(), { uuid: "p4", nickname: "P4", isAlive: true, isConnected: true }] }),
  ],
  [
    "roster에 중복 uuid가 있으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ players: [...basePlayers(), { uuid: "p1", nickname: "P1-dup", isAlive: true, isConnected: true }] }),
  ],
  [
    "roster 항목의 isAlive가 boolean이 아니면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isAlive: "yes" } : p)) }),
  ],
  [
    "roster 항목의 isConnected가 boolean이 아니면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isConnected: 1 } : p)) }),
  ],
  [
    "self.uuid가 roster 어디에도 없으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ uuid: "phantom" }) }),
  ],
  [
    "self.nickname이 같은 uuid의 roster 항목 nickname과 다르면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ nickname: "WrongName" }) }),
  ],
  [
    "response.self.uuid가 현재 세션이 기대하는 본인 uuid와 다르면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: { uuid: "p2", nickname: "P2", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false } }),
  ],
  [
    "self.role이 알 수 없는 값이면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "WIZARD" }) }),
  ],
  [
    "self.role과 self.team 조합이 정책과 다르면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "JOKER", team: "CITIZEN" }) }),
  ],
  [
    "self.hasActedThisPhase가 boolean이 아니면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ hasActedThisPhase: "yes" }) }),
  ],
  [
    "JOKER인데 allies own-property가 없으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "JOKER", team: "JOKER" }) }),
  ],
  [
    "비-JOKER인데 allies own-property가 있으면(undefined여도) 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: { ...baseSelfObj(), allies: undefined } }),
  ],
  [
    "allies에 자기 자신의 uuid가 포함되면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "JOKER", team: "JOKER", allies: ["p1"] }) }),
  ],
  [
    "allies에 roster에 없는 uuid가 포함되면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "JOKER", team: "JOKER", allies: ["phantom"] }) }),
  ],
  [
    "allies에 중복 uuid가 있으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ self: baseSelfObj({ role: "JOKER", team: "JOKER", allies: ["p2", "p2"] }) }),
  ],
  [
    "ROLE_REVEAL에서 nightResult가 있으면(계약상 절대 없어야 함) 거부된다",
    () => baseCurrent(),
    () => baseResponse({ nightResult: { dayIndex: 0, victimUuid: null } }),
  ],
  [
    "NIGHT에서 nightResult가 있으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ phase: "NIGHT", nightResult: { dayIndex: 0, victimUuid: null } }),
  ],
  [
    "NIGHT에서 dayVoteResolution이 있으면 거부된다",
    () => baseCurrent(),
    () =>
      baseResponse({
        phase: "NIGHT",
        dayVoteResolution: { outcome: "ABSTAINED", tribunalTargetUuid: null, publicVoteCount: 0, publicAbstainCount: 0 },
      }),
  ],
  [
    "ROLE_REVEAL에서 tribunal이 있으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ tribunal: { defendantUuid: "p1", resolved: false } }),
  ],
  [
    "nightResult.dayIndex가 response.dayIndex와 다르면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, nightResult: { dayIndex: 0, victimUuid: null } }),
  ],
  [
    "nightResult.victimUuid가 roster에 없으면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, nightResult: { dayIndex: 1, victimUuid: "phantom" } }),
  ],
  [
    "dayVoteResolution.tribunalTargetUuid가 roster에 없으면 거부된다",
    () => baseCurrent({ phase: "DAY", dayIndex: 1 }),
    () =>
      baseResponse({
        phase: "TRIBUNAL",
        dayIndex: 1,
        dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "phantom", publicVoteCount: 2, publicAbstainCount: 0 },
      }),
  ],
  [
    "tribunal.defendantUuid가 roster에 없으면 거부된다",
    () => baseCurrent({ phase: "DAY", dayIndex: 1 }),
    () => baseResponse({ phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: "phantom", resolved: false } }),
  ],
  [
    "dayVoteResolution.outcome이 TRIBUNAL이 아닌데 tribunal이 함께 있으면 거부된다",
    () => baseCurrent({ phase: "DAY", dayIndex: 1 }),
    () =>
      baseResponse({
        phase: "TRIBUNAL",
        dayIndex: 1,
        dayVoteResolution: { outcome: "TIE", tribunalTargetUuid: null, publicVoteCount: 1, publicAbstainCount: 1 },
        tribunal: { defendantUuid: "p2", resolved: false },
      }),
  ],
  [
    "dayVoteResolution.tribunalTargetUuid와 tribunal.defendantUuid가 다르면 거부된다",
    () => baseCurrent({ phase: "DAY", dayIndex: 1 }),
    () =>
      baseResponse({
        phase: "TRIBUNAL",
        dayIndex: 1,
        dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
        tribunal: { defendantUuid: "p3", resolved: false },
      }),
  ],
  [
    "ENDED인데 winResult가 없으면 거부된다",
    () => baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 }),
    () => baseResponse({ phase: "ENDED", dayIndex: 1 }),
  ],
  [
    "ENDED가 아닌데 winResult가 있으면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, winResult: { winner: "CITIZEN" } }),
  ],
  [
    "winResult.winner가 알 수 없는 값이면 거부된다",
    () => baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 }),
    () => baseResponse({ phase: "ENDED", dayIndex: 1, winResult: { winner: "NOBODY" } }),
  ],
  [
    "이미 ENDED인 store에 활성 phase 스냅샷을 적용하면 거부된다(종료 롤백 금지)",
    () => baseCurrent({ phase: "ENDED", dayIndex: 1, winResult: { winner: "CITIZEN" } }),
    () => baseResponse({ phase: "DAY", dayIndex: 2 }),
  ],
  [
    "깊이 중첩된 필드 하나가 잘못되어도(tribunal.counts.guilty 음수) 전체 payload가 거부된다",
    () => baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 }),
    () =>
      baseResponse({
        phase: "ENDED",
        dayIndex: 1,
        tribunal: { defendantUuid: "p2", resolved: true, outcome: "GUILTY", counts: { guilty: -1, notGuilty: 1 }, executedUuid: "p2" },
        winResult: { winner: "CITIZEN" },
      }),
  ],
]

for (const [label, buildCurrent, buildResponse] of rejectionCases) {
  test(`applySessionSnapshotPure: ${label} — store는 완전히 변경되지 않는다`, () => {
    assertRejected(buildCurrent(), buildResponse())
  })
}

// --- 공개 roster에 섞여 들어온 비공개 필드 ---

test("applySessionSnapshotPure: 공개 roster 항목에 비공개 필드(role 등)가 섞여 있어도 store에는 절대 복사되지 않는다", () => {
  const current = baseCurrent()
  const response = baseResponse({
    players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, role: "JOKER", team: "JOKER", secretNote: "leak" } : p)),
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  const p2 = result.state.players.find((p) => p.uuid === "p2")
  assert.deepEqual(Object.keys(p2).sort(), ["alive", "isConnected", "nickname", "uuid"])
})

// --- 방어적 복사 ---

test("applySessionSnapshotPure: 반영 이후 원본 response의 중첩 구조를 변형해도 store 결과가 영향받지 않는다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY",
    dayIndex: 1,
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: { dayIndex: 1, victimUuid: "p3" },
  })

  const result = applySessionSnapshotPure(current, response)
  const expected = structuredClone(result.state)

  response.players[0].isAlive = false
  response.players.push({ uuid: "p9", nickname: "P9", isAlive: true, isConnected: true })
  response.self.nickname = "MUTATED"
  response.nightResult.victimUuid = "p1"

  assert.deepStrictEqual(result.state, expected)
})

test("applySessionSnapshotPure: self.allies 배열은 방어적으로 복사되어 원본 변형에 영향받지 않는다", () => {
  const current = baseCurrent({
    self: { uuid: "p1", nickname: "P1", role: "JOKER", team: "JOKER", hasActedThisPhase: false, allies: ["p2"] },
  })
  const response = baseResponse({
    self: { uuid: "p1", nickname: "P1", role: "JOKER", team: "JOKER", hasActedThisPhase: false, allies: ["p2"] },
  })

  const result = applySessionSnapshotPure(current, response)
  response.self.allies.push("p3")

  assert.deepEqual(result.state.self.allies, ["p2"])
})

test("applySessionSnapshotPure: tribunal/winResult/dayVoteResolution 응답 객체를 변형해도 store 결과가 영향받지 않는다", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({
    phase: "ENDED",
    dayIndex: 1,
    players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isAlive: false } : p)),
    tribunal: { defendantUuid: "p2", resolved: true, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 1 }, executedUuid: "p2" },
    dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
    winResult: { winner: "CITIZEN", reveals: endedReveals(), mvp: { uuid: "p3" } },
  })

  const result = applySessionSnapshotPure(current, response)
  const expected = structuredClone(result.state)

  response.tribunal.outcome = "NOT_GUILTY"
  response.tribunal.counts.guilty = 0
  response.winResult.winner = "JOKER"
  response.winResult.reveals.push({ uuid: "p9", nickname: "P9", role: "GUARD", team: "CITIZEN", alive: true })
  response.winResult.reveals[0].role = "GUARD"
  response.winResult.mvp.uuid = "p1"
  response.dayVoteResolution.tribunalTargetUuid = "p3"

  assert.deepStrictEqual(result.state, expected)
})

// --- 멱등 재적용 ---

test("applySessionSnapshotPure: 구조적으로 동등한 ENDED 스냅샷을 두 번 연속 적용해도 값이 동일하다(참조는 매번 새로 생성됨)", () => {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const buildEndedResponse = () =>
    baseResponse({
      phase: "ENDED",
      dayIndex: 1,
      players: basePlayers().map((p) => (p.uuid === "p2" ? { ...p, isAlive: false } : p)),
      tribunal: { defendantUuid: "p2", resolved: true, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 1 }, executedUuid: "p2" },
      dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
      winResult: { winner: "CITIZEN" },
    })

  const resultA = applySessionSnapshotPure(current, buildEndedResponse())
  const currentAfterA = { gameId: current.gameId, error: current.error, state: resultA.state }
  const resultB = applySessionSnapshotPure(currentAfterA, buildEndedResponse())

  assert.notEqual(resultA.state, resultB.state)
  assert.deepStrictEqual(resultA.state, resultB.state)
})

// --- winResult 검증 패리티 ---

// 세 파서가 실제로 store/반환값에 남긴 winResult를 꺼낸다 — 거부한 경우에만 null이다.
// accept/reject 패리티와 정규화 결과 패리티를 같은 fixture로 함께 검증하기 위한 형태다.
function applySessionSnapshotWinResult(winResultValue) {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({ phase: "ENDED", dayIndex: 1, players: basePlayers(), winResult: winResultValue })
  const result = applySessionSnapshotPure(current, response)
  return result === current ? null : result.state.winResult
}

function applyTribunalResolvedWinResult(winResultValue) {
  const current = {
    gameId: "game-1",
    error: null,
    state: {
      id: "game-1",
      phase: "TRIBUNAL",
      dayIndex: 1,
      tribunal: { defendantUuid: "p2" },
      players: [
        { uuid: "p1", nickname: "P1", alive: true },
        { uuid: "p2", nickname: "P2", alive: true },
        { uuid: "p3", nickname: "P3", alive: true },
      ],
    },
  }
  const payload = {
    gameId: "game-1",
    dayIndex: 1,
    phase: "ENDED",
    defendantUuid: "p2",
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "p2",
    players: [
      { uuid: "p1", isAlive: true },
      { uuid: "p2", isAlive: false },
      { uuid: "p3", isAlive: true },
    ],
    winResult: winResultValue,
  }
  const result = applyTribunalResolvedPure(current, payload)
  return result === current ? null : result.state.winResult
}

function parseNightResultWinResult(winResultValue) {
  const payload = {
    gameId: "game-1",
    phase: "ENDED",
    dayIndex: 1,
    victimUuid: null,
    players: [
      { uuid: "p1", isAlive: true },
      { uuid: "p2", isAlive: true },
      { uuid: "p3", isAlive: true },
    ],
    winResult: winResultValue,
  }
  const result = parseNightResultAppliedPayload({
    payload,
    gameId: "game-1",
    dayIndex: 1,
    canonicalPlayerIds: new Set(["p1", "p2", "p3"]),
  })
  return result === null ? null : result.winResult
}

const winResultFixtures = [
  { label: "valid CITIZEN", value: { winner: "CITIZEN" }, expected: true },
  { label: "valid JOKER", value: { winner: "JOKER" }, expected: true },
  { label: "valid with extra key", value: { winner: "CITIZEN", extra: true }, expected: true },
  // reveals가 어긋난 것은 거부 사유가 아니라 정규화 대상이다(빈 명단으로 떨어질 뿐).
  { label: "non-array reveals", value: { winner: "CITIZEN", reveals: "nope" }, expected: true },
  { label: "reveals with non-object element", value: { winner: "JOKER", reveals: [{ uuid: "p1" }, 7] }, expected: true },
  { label: "valid with reveals and mvp", value: { winner: "JOKER", reveals: [{ uuid: "p1" }], mvp: { uuid: "p1" } }, expected: true },
  { label: "null", value: null, expected: false },
  { label: "array", value: ["CITIZEN"], expected: false },
  { label: "wrong winner value", value: { winner: "NOBODY" }, expected: false },
  { label: "missing winner key", value: {}, expected: false },
]

test("winResult 검증: applySessionSnapshotPure/applyTribunalResolvedPure/parseNightResultAppliedPayload의 accept/reject가 동일하다", () => {
  for (const { label, value, expected } of winResultFixtures) {
    assert.equal(applySessionSnapshotWinResult(value) !== null, expected, `applySessionSnapshotPure: ${label}`)
    assert.equal(applyTribunalResolvedWinResult(value) !== null, expected, `applyTribunalResolvedPure: ${label}`)
    assert.equal(parseNightResultWinResult(value) !== null, expected, `parseNightResultAppliedPayload: ${label}`)
  }
})

test("winResult 정규화: 세 파서가 남기는 { winner, reveals, mvp }가 완전히 동일하다", () => {
  for (const { label, value, expected } of winResultFixtures) {
    if (!expected) continue
    const fromSnapshot = applySessionSnapshotWinResult(value)
    assert.deepEqual(Object.keys(fromSnapshot).sort(), ["mvp", "reveals", "winner"], `키 집합: ${label}`)
    assert.deepEqual(applyTribunalResolvedWinResult(value), fromSnapshot, `applyTribunalResolvedPure: ${label}`)
    assert.deepEqual(parseNightResultWinResult(value), fromSnapshot, `parseNightResultAppliedPayload: ${label}`)
  }
})

// --- 재접속 시 참가자 색(colorIndex) 보존 ---

test("applySessionSnapshotPure: roster의 colorIndex가 재접속 후에도 state.players에 보존된다", () => {
  const current = baseCurrent()
  const response = baseResponse({
    players: basePlayers().map((p, index) => ({ ...p, colorIndex: index * 3 })),
  })

  const result = applySessionSnapshotPure(current, response)

  assert.deepEqual(result.state.players, [
    { uuid: "p1", nickname: "P1", alive: true, isConnected: true, colorIndex: 0 },
    { uuid: "p2", nickname: "P2", alive: true, isConnected: true, colorIndex: 3 },
    { uuid: "p3", nickname: "P3", alive: true, isConnected: true, colorIndex: 6 },
  ])
})

test("applySessionSnapshotPure: colorIndex를 보내지 않는 구세션 응답도 거부되지 않고 키 없이 통과한다", () => {
  const current = baseCurrent()
  const response = baseResponse()

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  for (const player of result.state.players) {
    assert.equal(Object.hasOwn(player, "colorIndex"), false)
  }
})

test("applySessionSnapshotPure: colorIndex 형태가 어긋나도 스냅샷은 반영되고 그 참가자만 키가 없다", () => {
  for (const badColorIndex of [-1, "3", 1.5, null, {}]) {
    const current = baseCurrent()
    const response = baseResponse({
      players: basePlayers().map((p) =>
        p.uuid === "p2" ? { ...p, colorIndex: badColorIndex } : { ...p, colorIndex: 1 },
      ),
    })

    const result = applySessionSnapshotPure(current, response)

    // 색은 순전히 표시용이라 하이드레이션 거부 사유가 아니다 — stale 상태에 갇히면 안 된다.
    assert.notEqual(result, current, `${String(badColorIndex)}는 거부 사유가 아니어야 한다`)
    const bad = result.state.players.find((p) => p.uuid === "p2")
    assert.equal(Object.hasOwn(bad, "colorIndex"), false)
    assert.equal(result.state.players.find((p) => p.uuid === "p1").colorIndex, 1)
  }
})

test("applySessionSnapshotPure: colorIndex 0도 보존된다(falsy 값이 조용히 사라지지 않는다)", () => {
  const current = baseCurrent()
  const response = baseResponse({ players: basePlayers().map((p) => ({ ...p, colorIndex: 0 })) })

  const result = applySessionSnapshotPure(current, response)

  for (const player of result.state.players) {
    assert.equal(player.colorIndex, 0)
  }
})

// --- 재접속 시 밤 연출 릴의 재료(nightTurnRoles) 보존 ---

test("applySessionSnapshotPure: nightTurnRoles는 스냅샷에 없어도 이전 state에서 이어받는다", () => {
  // 게임당 상수라 stale해질 수 없고, 잃어버리면 재접속한 창만 릴이 폴백으로 떨어져
  // 창마다 다른 밤 연출이 재생된다.
  const current = baseCurrent({ nightTurnRoles: ["JOKER", "DOCTOR", "GUARD"] })
  const response = baseResponse({ phase: "NIGHT", dayIndex: 1 })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.deepEqual(result.state.nightTurnRoles, ["JOKER", "DOCTOR", "GUARD"])
})

test("applySessionSnapshotPure: 이어받은 nightTurnRoles는 방어적으로 복사된다", () => {
  const current = baseCurrent({ nightTurnRoles: ["JOKER", "GUARD"] })
  const result = applySessionSnapshotPure(current, baseResponse({ phase: "NIGHT", dayIndex: 1 }))

  current.state.nightTurnRoles.push("WITCH_HUNTER")

  assert.deepEqual(result.state.nightTurnRoles, ["JOKER", "GUARD"])
})

test("applySessionSnapshotPure: nightTurnRoles가 없던 세션은 키 자체를 만들지 않는다", () => {
  const result = applySessionSnapshotPure(baseCurrent(), baseResponse({ phase: "NIGHT", dayIndex: 1 }))

  assert.equal(Object.hasOwn(result.state, "nightTurnRoles"), false)
})

import test from "node:test"
import assert from "node:assert/strict"

import { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "../applySessionSnapshot.js"
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
  // F-21(AC-03): isParticipating은 새로 승인된 **공개** 필드다. 스냅샷에 그 키가 없는
  // 구버전 응답은 "참여 중"으로 본다(그 서버에는 아직 이탈 개념이 없었다).
  assert.deepEqual(result.state.players, [
    { uuid: "p1", nickname: "P1", alive: true, isConnected: true, isParticipating: true },
    { uuid: "p2", nickname: "P2", alive: true, isConnected: true, isParticipating: true },
    { uuid: "p3", nickname: "P3", alive: true, isConnected: true, isParticipating: true },
  ])
  assert.deepEqual(result.state.self, { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false })
  assert.equal(result.state.tribunal, null)
  assert.equal(result.state.winResult, null)
  assert.equal(result.state.nightResult, null)
  assert.equal(result.state.dayVoteResolution, null)
})

test("F-13(AC-05) CODEX-2 회귀: 응답의 accountProfilePhotoId/accountProfileBorderId가 있는 참가자는 반영된 players에도 그대로 남고, 없는 참가자는 키 자체가 생기지 않는다(재접속·새로고침이 계정 사진·테두리를 조용히 지우면 안 된다)", () => {
  const current = baseCurrent()
  const response = baseResponse({
    players: [
      { uuid: "p1", nickname: "P1", isAlive: true, isConnected: true, accountProfilePhotoId: "player-profile-그림자", accountProfileBorderId: "profile-border-귀족" },
      { uuid: "p2", nickname: "P2", isAlive: true, isConnected: true },
      { uuid: "p3", nickname: "P3", isAlive: true, isConnected: true },
    ],
  })

  const result = applySessionSnapshotPure(current, response)

  const p1 = result.state.players.find((p) => p.uuid === "p1")
  const p2 = result.state.players.find((p) => p.uuid === "p2")
  assert.equal(p1.accountProfilePhotoId, "player-profile-그림자")
  assert.equal(p1.accountProfileBorderId, "profile-border-귀족")
  assert.equal(Object.hasOwn(p2, "accountProfilePhotoId"), false)
  assert.equal(Object.hasOwn(p2, "accountProfileBorderId"), false)
})

test("applySessionSnapshotPure: accountProfilePhotoId/accountProfileBorderId가 있지만 빈 문자열이면 전체 스냅샷을 거부한다", () => {
  const current = baseCurrent()
  const response = baseResponse({
    players: [
      { uuid: "p1", nickname: "P1", isAlive: true, isConnected: true, accountProfilePhotoId: "" },
      { uuid: "p2", nickname: "P2", isAlive: true, isConnected: true },
      { uuid: "p3", nickname: "P3", isAlive: true, isConnected: true },
    ],
  })

  assertRejected(current, response)
})

test("applySessionSnapshotPure: 유효한 NIGHT 스냅샷을 반영한다(nightResult 없음)", () => {
  const current = baseCurrent()
  const response = baseResponse({ phase: "NIGHT" })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "NIGHT")
  assert.equal(result.state.nightResult, null)
})

// F-26(AC-04): 아래 DAY 스냅샷 fixture들은 **실제 날짜 전이**를 쓴다(NIGHT n → DAY n+1).
// 예전에는 같은 날짜의 NIGHT → DAY로 적어 두었는데 서버는 그런 전이를 만들지 않는다 —
// enterDayPhase가 날짜를 올리고, 그 낮의 nightResult.dayIndex도 올라간 날짜와 같다
// (game-core buildSessionSnapshot 참고). 검증 목적(DAY 스냅샷의 nightResult·deathReveals 반영)은
// 그대로 두고 날짜만 현실화한다 — 같은 날짜의 역행은 이제 시간을 거스르는 응답으로 거부된다.
test("applySessionSnapshotPure: 유효한 DAY 스냅샷은 nightResult를 반영하고 희생자 alive를 false로 표시한다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY",
    dayIndex: 2,
    dayPhase: "DAY_DISCUSSION",
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: { dayIndex: 2, victimUuid: "p3" },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "DAY")
  assert.equal(result.state.dayPhase, "DAY_DISCUSSION")
  assert.deepEqual(result.state.nightResult, { dayIndex: 2, victimUuid: "p3" })
  assert.equal(result.state.players.find((p) => p.uuid === "p3").alive, false)
  assert.equal(result.state.dayVoteResolution, null)
  assert.equal(result.state.tribunal, null)
})

// ── F-23(AC-05): 공개 밤 사망 연출(deathReveals)의 스냅샷 복구 ──────────────────
//
// 서버는 예전부터 이 필드를 스냅샷에 실었지만 store가 버려서, 연출이 재생되기 전에
// 새로고침·재연결한 참가자는 그 밤의 공개 사망을 끝내 보지 못했다.

test("F-23(AC-05) DAY 스냅샷의 공개 deathReveals를 정규화해 그대로 옮긴다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION",
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: {
      dayIndex: 2, victimUuid: "p3",
      deathReveals: [{ victimUuid: "p3", source: "JOKER" }],
    },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.deepEqual(result.state.nightResult, {
    dayIndex: 2, victimUuid: "p3", deathReveals: [{ victimUuid: "p3", source: "JOKER" }],
  })
})

test("F-23(AC-05) 허용되지 않은 source·roster 밖 uuid·형태가 틀린 원소는 연출에서 제외되고 정상 원소만 남는다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION",
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: {
      dayIndex: 2, victimUuid: "p3",
      deathReveals: [
        { victimUuid: "p3", source: "WITCH_HUNTER" },
        // roster 밖 — 화면이 닉네임조차 만들 수 없다.
        { victimUuid: "outsider", source: "JOKER" },
        // 허용 목록 밖 source.
        { victimUuid: "p2", source: "MADE_UP" },
        // 형태가 틀린 원소.
        null,
        // 살해자 identity 같은 예상치 못한 필드는 통과하지 않는다.
        { victimUuid: "p2", source: "OTHER", killerUuid: "p1" },
      ],
    },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.deepEqual(result.state.nightResult.deathReveals, [
    { victimUuid: "p3", source: "WITCH_HUNTER" },
    { victimUuid: "p2", source: "OTHER" },
  ])
})

test("F-23(AC-05) deathReveals 키가 없는 옛 스냅샷은 그대로 복원되고 그 키를 만들지도 않는다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION",
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: { dayIndex: 2, victimUuid: "p3" },
  })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(Object.hasOwn(result.state.nightResult, "deathReveals"), false)
})

test("F-23(AC-05) 복원된 deathReveals는 원본 응답과 독립이다(응답을 나중에 바꿔도 store가 변하지 않는다)", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const reveals = [{ victimUuid: "p3", source: "JOKER" }]
  const response = baseResponse({
    phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION",
    players: basePlayers().map((p) => (p.uuid === "p3" ? { ...p, isAlive: false } : p)),
    nightResult: { dayIndex: 2, victimUuid: "p3", deathReveals: reveals },
  })

  const result = applySessionSnapshotPure(current, response)

  reveals.push({ victimUuid: "p2", source: "OTHER" })
  reveals[0].source = "OTHER"

  assert.deepEqual(result.state.nightResult.deathReveals, [{ victimUuid: "p3", source: "JOKER" }])
})

// ── F-26(AC-04): **시간을 거스르는 스냅샷은 적용하지 않는다** ────────────────────
//
// 조회를 보낸 뒤 진행이 다음 밤으로 넘어가면, 보류돼 있던 이전 밤의 응답이 기존 검사(같은 판·
// 같은 인원·앞서지 않은 참여 세대·앞서지 않은 개인 순서)를 **전부 만족한 채** 늦게 도착할 수
// 있다. 그 응답이 반영되면 화면이 지나간 밤으로 되돌아가고, 같은 커밋이 그 밤의 성공 사건까지
// 되살린다. 날짜와 같은 날짜 안의 단계 순서가 그것을 가르는 유일한 값이다.

test("F-26(AC-04): 현재보다 과거 날짜의 스냅샷은 거부된다 — store는 완전히 변경되지 않는다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 3 })
  assertRejected(current, baseResponse({ phase: "NIGHT", dayIndex: 2 }))
  assertRejected(current, baseResponse({ phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION" }))
})

test("F-26(AC-04): 같은 날짜의 단계 역행(NIGHT→DAY/TRIBUNAL·TRIBUNAL→DAY)은 거부된다", () => {
  assertRejected(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({ phase: "DAY", dayIndex: 2, dayPhase: "DAY_VOTE" }),
  )
  assertRejected(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({
      phase: "TRIBUNAL",
      dayIndex: 2,
      dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
      tribunal: { defendantUuid: "p2", resolved: false },
    }),
  )
  assertRejected(
    baseCurrent({ phase: "TRIBUNAL", dayIndex: 2 }),
    baseResponse({ phase: "DAY", dayIndex: 2, dayPhase: "DAY_VOTE" }),
  )
  assertRejected(
    baseCurrent({ phase: "DAY", dayIndex: 2 }),
    baseResponse({ phase: "ROLE_REVEAL", dayIndex: 2 }),
  )
})

test("F-26(AC-04): 앞으로 가는 전이와 같은 단계 재적용은 그대로 허용된다(양성 대조)", () => {
  // NIGHT n → DAY n+1: 서버가 실제로 만드는 전이다(enterDayPhase가 날짜를 올린다).
  const toNextDay = applySessionSnapshotPure(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({ phase: "DAY", dayIndex: 3, dayPhase: "DAY_DISCUSSION" }),
  )
  assert.equal(toNextDay.state.phase, "DAY")
  assert.equal(toNextDay.state.dayIndex, 3)

  // 같은 날짜 안의 정상 진행(DAY → TRIBUNAL → NIGHT).
  const toTribunal = applySessionSnapshotPure(
    baseCurrent({ phase: "DAY", dayIndex: 2 }),
    baseResponse({
      phase: "TRIBUNAL",
      dayIndex: 2,
      dayVoteResolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "p2", publicVoteCount: 2, publicAbstainCount: 0 },
      tribunal: { defendantUuid: "p2", resolved: false },
    }),
  )
  assert.equal(toTribunal.state.phase, "TRIBUNAL")
  const toNight = applySessionSnapshotPure(
    baseCurrent({ phase: "TRIBUNAL", dayIndex: 2 }),
    baseResponse({ phase: "NIGHT", dayIndex: 2 }),
  )
  assert.equal(toNight.state.phase, "NIGHT")

  // 같은 단계·같은 날짜의 재적용(멱등 복원)은 막지 않는다.
  const reapplied = applySessionSnapshotPure(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({ phase: "NIGHT", dayIndex: 2 }),
  )
  assert.equal(reapplied.state.phase, "NIGHT")
  assert.equal(reapplied.state.dayIndex, 2)

  // 밤 킬로 곧바로 끝난 판은 날짜가 오르지 않는다 — 그 ENDED 복원도 허용된다.
  const ended = applySessionSnapshotPure(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({ phase: "ENDED", dayIndex: 2, winResult: { winner: "JOKER" } }),
  )
  assert.equal(ended.state.phase, "ENDED")
  assert.deepEqual(ended.state.winResult, { winner: "JOKER" })
})

test("ENDED 스냅샷의 공개 winResult.reveals는 store에 보존된다", () => {
  const reveals = [
    { uuid: "p1", nickname: "P1", role: "JOKER", team: "JOKER", alive: true, deathReason: null },
    { uuid: "p2", nickname: "P2", role: "DOCTOR", team: "CITIZEN", alive: false, deathReason: "NIGHT" },
    { uuid: "p3", nickname: "P3", role: "CITIZEN", team: "CITIZEN", alive: true, deathReason: null },
  ]
  const ended = applySessionSnapshotPure(
    baseCurrent({ phase: "NIGHT", dayIndex: 2 }),
    baseResponse({ phase: "ENDED", dayIndex: 2, winResult: { winner: "JOKER", reveals } }),
  )

  assert.deepEqual(ended.state.winResult, { winner: "JOKER", reveals })
})

test("F-26(AC-04): 현재 날짜를 모르는 화면(구버전 state)은 이 축으로 판단하지 않는다", () => {
  // bootstrapSessionSnapshotPure가 쓰는 최소 seed가 바로 이 모양이다(날짜가 없다).
  const seed = {
    gameId: "game-1",
    state: {
      id: "game-1",
      players: [{ uuid: "p1" }, { uuid: "p2" }, { uuid: "p3" }],
      self: { uuid: "p1" },
    },
  }
  const result = applySessionSnapshotPure(seed, baseResponse({ phase: "NIGHT", dayIndex: 2 }))
  assert.notEqual(result, seed)
  assert.equal(result.state.dayIndex, 2)
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
  assert.deepEqual(result.state.winResult, { winner: "CITIZEN" })
  assert.deepEqual(result.state.tribunal, {
    defendantUuid: "p2",
    resolved: true,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "p2",
  })
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, false)
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

// --- dayPhase(낮 하위 구간) 반영 ---

test("applySessionSnapshotPure: DAY_VOTE 스냅샷은 dayPhase를 그대로 복원한다(재접속해도 투표 화면이 유지된다)", () => {
  const current = baseCurrent({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION" })
  const response = baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE" })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.phase, "DAY")
  assert.equal(result.state.dayPhase, "DAY_VOTE")
})

test("applySessionSnapshotPure: 낮이 아닌 스냅샷은 dayPhase를 null로 비운다", () => {
  const current = baseCurrent({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE" })
  const response = baseResponse({ phase: "NIGHT", dayIndex: 1 })

  const result = applySessionSnapshotPure(current, response)

  assert.notEqual(result, current)
  assert.equal(result.state.dayPhase, null)
})

// --- 거부: 구조/신원/roster/self ---

const rejectionCases = [
  [
    "phase가 DAY인데 dayPhase 키가 없으면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1 }),
  ],
  [
    "phase가 DAY인데 dayPhase가 미지값이면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_LUNCH" }),
  ],
  [
    "phase가 DAY인데 dayPhase가 null이면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: null }),
  ],
  [
    "phase가 NIGHT인데 dayPhase 키가 있으면 거부된다(양방향 불변조건)",
    () => baseCurrent({ phase: "DAY", dayIndex: 1 }),
    () => baseResponse({ phase: "NIGHT", dayIndex: 1, dayPhase: "DAY_VOTE" }),
  ],
  [
    "phase가 ROLE_REVEAL인데 dayPhase 키가 있으면 거부된다",
    () => baseCurrent(),
    () => baseResponse({ dayPhase: "DAY_DISCUSSION" }),
  ],
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
    "F-23(AC-05) deathReveals가 배열이 아니면 거부된다(구조는 엄격하게 본다)",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({
      phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
      nightResult: { dayIndex: 1, victimUuid: "p3", deathReveals: { victimUuid: "p3", source: "JOKER" } },
    }),
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
    () => baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION", nightResult: { dayIndex: 0, victimUuid: null } }),
  ],
  [
    "nightResult.victimUuid가 roster에 없으면 거부된다",
    () => baseCurrent({ phase: "NIGHT", dayIndex: 1 }),
    () => baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION", nightResult: { dayIndex: 1, victimUuid: "phantom" } }),
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
    () => baseResponse({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION", winResult: { winner: "CITIZEN" } }),
  ],
  [
    "winResult.winner가 알 수 없는 값이면 거부된다",
    () => baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 }),
    () => baseResponse({ phase: "ENDED", dayIndex: 1, winResult: { winner: "NOBODY" } }),
  ],
  [
    "이미 ENDED인 store에 활성 phase 스냅샷을 적용하면 거부된다(종료 롤백 금지)",
    () => baseCurrent({ phase: "ENDED", dayIndex: 1, winResult: { winner: "CITIZEN" } }),
    () => baseResponse({ phase: "DAY", dayIndex: 2, dayPhase: "DAY_DISCUSSION" }),
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
  // F-21: isParticipating이 승인 목록에 더해졌다 — 이 단언의 핵심(role/team/임의 필드가
  // 절대 복사되지 않는다)은 그대로다. membershipId는 응답에 그 키가 있을 때만 생긴다.
  assert.deepEqual(Object.keys(p2).sort(), ["alive", "isConnected", "isParticipating", "nickname", "uuid"])
})

// --- 방어적 복사 ---

test("applySessionSnapshotPure: 반영 이후 원본 response의 중첩 구조를 변형해도 store 결과가 영향받지 않는다", () => {
  const current = baseCurrent({ phase: "NIGHT", dayIndex: 1 })
  const response = baseResponse({
    phase: "DAY",
    dayIndex: 1,
    dayPhase: "DAY_DISCUSSION",
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
    winResult: { winner: "CITIZEN" },
  })

  const result = applySessionSnapshotPure(current, response)
  const expected = structuredClone(result.state)

  response.tribunal.outcome = "NOT_GUILTY"
  response.tribunal.counts.guilty = 0
  response.winResult.winner = "JOKER"
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

// --- themeIndex(표시 색상) 이어받기 ---

test("applySessionSnapshotPure: 스냅샷에 없는 themeIndex를 기존 store roster에서 uuid로 이어받는다", () => {
  const current = baseCurrent({
    players: [
      { uuid: "p1", nickname: "P1", alive: true, themeIndex: 5 },
      { uuid: "p2", nickname: "P2", alive: true, themeIndex: 2 },
      { uuid: "p3", nickname: "P3", alive: true, themeIndex: 9 },
    ],
  })
  // 응답 roster 순서가 뒤바뀌어도 uuid 기준으로 이어받는다.
  const response = baseResponse({ players: [...basePlayers()].reverse() })

  const result = applySessionSnapshotPure(current, response)

  assert.deepEqual(
    result.state.players.map((p) => [p.uuid, p.themeIndex]),
    [["p3", 9], ["p2", 2], ["p1", 5]],
  )
})

test("applySessionSnapshotPure: 기존 roster에 유효한 themeIndex가 없으면 키 자체를 만들지 않는다", () => {
  const current = baseCurrent({
    players: [
      { uuid: "p1", nickname: "P1", alive: true, themeIndex: "5" },
      { uuid: "p2", nickname: "P2", alive: true },
      { uuid: "p3", nickname: "P3", alive: true, themeIndex: 9 },
    ],
  })

  const result = applySessionSnapshotPure(current, baseResponse())

  assert.equal(Object.hasOwn(result.state.players[0], "themeIndex"), false)
  assert.equal(Object.hasOwn(result.state.players[1], "themeIndex"), false)
  assert.equal(result.state.players[2].themeIndex, 9)
})

// --- winResult 검증 패리티 ---

function applySessionSnapshotAcceptsWinResult(winResultValue) {
  const current = baseCurrent({ phase: "TRIBUNAL", dayIndex: 1 })
  const response = baseResponse({ phase: "ENDED", dayIndex: 1, players: basePlayers(), winResult: winResultValue })
  return applySessionSnapshotPure(current, response) !== current
}

function applyTribunalResolvedAcceptsWinResult(winResultValue) {
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
  return applyTribunalResolvedPure(current, payload) !== current
}

function parseNightResultAcceptsWinResult(winResultValue) {
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
  return result !== null
}

const winResultFixtures = [
  { label: "valid CITIZEN", value: { winner: "CITIZEN" }, expected: true },
  { label: "valid JOKER", value: { winner: "JOKER" }, expected: true },
  { label: "valid with extra key", value: { winner: "CITIZEN", extra: true }, expected: true },
  { label: "null", value: null, expected: false },
  { label: "array", value: ["CITIZEN"], expected: false },
  { label: "wrong winner value", value: { winner: "NOBODY" }, expected: false },
  { label: "missing winner key", value: {}, expected: false },
]

test("winResult 검증: applySessionSnapshotPure/applyTribunalResolvedPure/parseNightResultAppliedPayload의 accept/reject가 동일하다", () => {
  for (const { label, value, expected } of winResultFixtures) {
    assert.equal(applySessionSnapshotAcceptsWinResult(value), expected, `applySessionSnapshotPure: ${label}`)
    assert.equal(applyTribunalResolvedAcceptsWinResult(value), expected, `applyTribunalResolvedPure: ${label}`)
    assert.equal(parseNightResultAcceptsWinResult(value), expected, `parseNightResultAppliedPayload: ${label}`)
  }
})


test('F14 browser regression: snapshot preserves public cards and only own skin', () => {
  const response = baseResponse({
    players: basePlayers().map((p) => ({ ...p, accountCardFrameId: 'player-card-왕관', accountSkinsByJob: { noble: 'private-must-not-copy' }, accountSkinId: 'private-must-not-copy' })),
    self: baseSelfObj({ accountSkinId: 'player-skin-귀족1-블러드', accountSkinsByJob: { noble: 'private-must-not-copy' } }),
  })
  const result = applySessionSnapshotPure(baseCurrent(), response)
  assert.equal(result.state.self.accountSkinId, 'player-skin-귀족1-블러드')
  assert.equal(Object.hasOwn(result.state.self, 'accountSkinsByJob'), false)
  for (const p of result.state.players) {
    assert.equal(p.accountCardFrameId, 'player-card-왕관')
    assert.equal(Object.hasOwn(p, 'accountSkinId'), false)
    assert.equal(Object.hasOwn(p, 'accountSkinsByJob'), false)
  }
})

test('F14 snapshot: null own skin is retained and malformed equipment is rejected', () => {
  assert.equal(applySessionSnapshotPure(baseCurrent(), baseResponse({self:baseSelfObj({accountSkinId:null})})).state.self.accountSkinId, null)
  assertRejected(baseCurrent(), baseResponse({self:baseSelfObj({accountSkinId:{bad:true}})}))
  assertRejected(baseCurrent(), baseResponse({players:basePlayers().map(p=>({...p,accountCardFrameId:42}))}))
})


test('F14 real QA roster: unequipped null cards coexist with a purchased card', () => {
  const current=baseCurrent()
  const response=baseResponse({players:basePlayers().map((p,i)=>({...p,accountCardFrameId:i===0?'player-card-왕관':null}))})
  const result=applySessionSnapshotPure(current,response)
  assert.notEqual(result,current)
  assert.deepEqual(result.state.players.map(p=>p.accountCardFrameId),response.players.map(p=>p.accountCardFrameId))
})

// ── CO S-1(AC-04): 계정 전적(accountTotalGames·accountWinRate) 검증·복사 ──────────
//
// 서버는 두 값을 조회한 참가자에게만 싣는다(own-property 계약) — 그래서 "없음"은 정상이고,
// "있는데 모양이 틀림"은 응답 전체를 믿을 수 없다는 뜻이다(다른 모든 필드와 같은 원자적 거부).

/** 응답 roster에 계정 전적을 얹는다(index별로 서로 다른 값을 주고, undefined면 키 자체를 뺀다). */
function playersWithRecords(records) {
  return basePlayers().map((player, index) => (
    records[index] === undefined ? player : { ...player, ...records[index] }
  ))
}

test('CO S-1(AC-04): 정수이며 범위 안인 계정 전적만 own-property로 채택되고, 없는 참가자는 키 자체가 생기지 않는다', () => {
  const current = baseCurrent()
  const response = baseResponse({
    players: playersWithRecords([
      { accountTotalGames: 3, accountWinRate: 67 },
      // 0판 0%와 100%는 모두 유효한 경계값이다 — 거부하면 안 된다.
      { accountTotalGames: 0, accountWinRate: 0 },
      undefined, // 조회 실패: 서버가 두 키를 아예 싣지 않은 참가자
    ]),
  })

  const result = applySessionSnapshotPure(current, response)
  assert.notEqual(result, current)
  assert.equal(result.state.players[0].accountTotalGames, 3)
  assert.equal(result.state.players[0].accountWinRate, 67)
  assert.equal(Object.hasOwn(result.state.players[1], 'accountTotalGames'), true, '0을 누락으로 취급하면 안 된다')
  assert.equal(result.state.players[1].accountTotalGames, 0)
  assert.equal(result.state.players[1].accountWinRate, 0)
  assert.equal(Object.hasOwn(result.state.players[2], 'accountTotalGames'), false)
  assert.equal(Object.hasOwn(result.state.players[2], 'accountWinRate'), false)
})

test('CO S-1(AC-04): 승률 100은 허용되고 101은 응답 전체를 거부한다', () => {
  const accepted = applySessionSnapshotPure(
    baseCurrent(),
    baseResponse({ players: playersWithRecords([{ accountTotalGames: 7, accountWinRate: 100 }]) }),
  )
  assert.equal(accepted.state.players[0].accountWinRate, 100)

  assertRejected(
    baseCurrent(),
    baseResponse({ players: playersWithRecords([{ accountTotalGames: 7, accountWinRate: 101 }]) }),
  )
})

test('CO S-1(AC-04): 정수가 아니거나 범위를 벗어난 계정 전적은 응답 전체를 거부한다(부분 반영 없음)', () => {
  const badValues = [-1, 1.5, '3', null, NaN, Infinity, true, {}, []]
  for (const bad of badValues) {
    assertRejected(
      baseCurrent(),
      baseResponse({ players: playersWithRecords([{ accountTotalGames: bad, accountWinRate: 50 }]) }),
    )
    assertRejected(
      baseCurrent(),
      baseResponse({ players: playersWithRecords([{ accountTotalGames: 3, accountWinRate: bad }]) }),
    )
  }
})

test('CO S-1(AC-04): 프로토타입으로 상속된 전적은 검증도 복사도 하지 않는다(own-property만 본다)', () => {
  const inherited = Object.create({ accountTotalGames: 99, accountWinRate: 999 })
  Object.assign(inherited, basePlayers()[0])
  const current = baseCurrent()
  const response = baseResponse({ players: [inherited, ...basePlayers().slice(1)] })

  const result = applySessionSnapshotPure(current, response)
  assert.notEqual(result, current, '상속된 값은 검증 대상이 아니므로 거부 사유가 되면 안 된다')
  assert.equal(Object.hasOwn(result.state.players[0], 'accountTotalGames'), false)
  assert.equal(Object.hasOwn(result.state.players[0], 'accountWinRate'), false)
})

test('CO S-1(AC-04): bootstrapSessionSnapshotPure도 같은 규칙을 그대로 따른다(위임 구조)', () => {
  const accepted = bootstrapSessionSnapshotPure(baseResponse({
    players: playersWithRecords([
      { accountTotalGames: 3, accountWinRate: 67 },
      { accountTotalGames: 0, accountWinRate: 0 },
      undefined,
    ]),
  }))
  assert.notEqual(accepted, null, '유효한 전적이 새로고침 하이드레이션을 막으면 안 된다')
  assert.equal(accepted.gameId, 'game-1')
  assert.equal(accepted.state.players[0].accountTotalGames, 3)
  assert.equal(accepted.state.players[0].accountWinRate, 67)
  assert.equal(accepted.state.players[1].accountTotalGames, 0)
  assert.equal(Object.hasOwn(accepted.state.players[2], 'accountTotalGames'), false)

  // 거부는 patch===seed로 나타나므로 bootstrap의 답은 null이다(부분 하이드레이션 없음).
  for (const bad of [-1, 1.5, '3', null, NaN]) {
    assert.equal(
      bootstrapSessionSnapshotPure(baseResponse({ players: playersWithRecords([{ accountTotalGames: bad, accountWinRate: 50 }]) })),
      null,
    )
  }
  assert.equal(
    bootstrapSessionSnapshotPure(baseResponse({ players: playersWithRecords([{ accountTotalGames: 3, accountWinRate: 101 }]) })),
    null,
  )
})

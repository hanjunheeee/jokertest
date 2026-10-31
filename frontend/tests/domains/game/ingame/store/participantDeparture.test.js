import test from "node:test"
import assert from "node:assert/strict"

import { applyTribunalResolvedPure } from "../../../../../src/domains/game/ingame/store/applyTribunalResolved.js"
import { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "../../../../../src/domains/game/ingame/store/applySessionSnapshot.js"

function tribunalCurrent() {
  return {
    gameId: "g1",
    state: {
      id: "g1",
      phase: "TRIBUNAL",
      dayIndex: 2,
      tribunal: { defendantUuid: "d1", resolved: false },
      players: [
        { uuid: "d1", nickname: "D", alive: true },
        { uuid: "p2", nickname: "P2", alive: true },
      ],
    },
  }
}

function cancelledPayload(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: "d1",
    outcome: "CANCELLED",
    reason: "DEFENDANT_LEFT",
    counts: { guilty: 1, notGuilty: 0 },
    executedUuid: null,
    ...overrides,
  }
}

test("AC-03: CANCELLED는 tribunal을 비우고 같은 날 밤으로 넘기되 아무도 죽이지 않는다", () => {
  const current = tribunalCurrent()
  const next = applyTribunalResolvedPure(current, cancelledPayload())

  assert.notEqual(next, current)
  assert.equal(next.state.phase, "NIGHT")
  assert.equal(next.state.tribunal, null)
  assert.equal(next.state.dayIndex, 2, "취소는 날짜를 넘기지 않는다")
  for (const player of next.state.players) assert.equal(player.alive, true)
})

test("AC-03: 취소 조합이 하나라도 어긋나면 완전한 no-op이다(참조까지 보존)", () => {
  const current = tribunalCurrent()
  const rejected = [
    cancelledPayload({ phase: "ENDED" }),
    cancelledPayload({ phase: "TRIBUNAL" }),
    cancelledPayload({ reason: "SOMETHING_ELSE" }),
    cancelledPayload({ reason: undefined }),
    cancelledPayload({ executedUuid: "d1" }),
    cancelledPayload({ defendantUuid: "p2" }),
    cancelledPayload({ dayIndex: 3 }),
    cancelledPayload({ gameId: "다른-게임" }),
    cancelledPayload({ counts: null }),
    cancelledPayload({ counts: { guilty: -1, notGuilty: 0 } }),
  ]
  for (const payload of rejected) {
    assert.equal(applyTribunalResolvedPure(current, payload), current, JSON.stringify(payload))
  }
})

test("AC-03: TRIBUNAL이 아닌 현재 상태로 도착한 취소는 거부된다(늦은 사건)", () => {
  const afterNight = tribunalCurrent()
  afterNight.state.phase = "NIGHT"
  assert.equal(applyTribunalResolvedPure(afterNight, cancelledPayload()), afterNight)
})

test("AC-03: 취소 분기가 정상 GUILTY/NOT_GUILTY 판정 계약을 잠식하지 않는다", () => {
  const current = tribunalCurrent()

  const guilty = applyTribunalResolvedPure(current, {
    gameId: "g1", dayIndex: 2, phase: "TRIBUNAL", defendantUuid: "d1",
    outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "d1",
  })
  assert.equal(guilty.state.tribunal.outcome, "GUILTY")
  assert.equal(guilty.state.tribunal.resolved, true)
  assert.equal(guilty.state.players.find((p) => p.uuid === "d1").alive, false)

  const notGuilty = applyTribunalResolvedPure(current, {
    gameId: "g1", dayIndex: 2, phase: "NIGHT", defendantUuid: "d1",
    outcome: "NOT_GUILTY", counts: { guilty: 0, notGuilty: 2 }, executedUuid: null,
  })
  assert.equal(notGuilty.state.phase, "NIGHT")
  assert.equal(notGuilty.state.tribunal, null)
  assert.equal(notGuilty.state.players.find((p) => p.uuid === "d1").alive, true)

  assert.equal(applyTribunalResolvedPure(current, cancelledPayload({ outcome: "WHATEVER" })), current)
})

function snapshotCurrent() {
  return {
    gameId: "g1",
    state: {
      id: "g1",
      phase: "NIGHT",
      dayIndex: 1,
      players: [
        { uuid: "u1", nickname: "U1", alive: true, themeIndex: 3 },
        { uuid: "u2", nickname: "U2", alive: true, themeIndex: 5 },
      ],
      self: { uuid: "u1" },
    },
  }
}

function snapshotResponse(overrides = {}) {
  return {
    ok: true,
    gameId: "g1",
    phase: "NIGHT",
    dayIndex: 1,
    hostUuid: "u1",
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    participationRevision: 4,
    players: [
      { uuid: "u1", nickname: "U1", isAlive: true, isConnected: true, isParticipating: true, membershipId: "mem-1" },
      { uuid: "u2", nickname: "U2", isAlive: false, isConnected: false, isParticipating: true, membershipId: "mem-2" },
    ],
    self: { uuid: "u1", nickname: "U1", role: "DOCTOR", team: "CITIZEN", hasActedThisPhase: false },
    ...overrides,
  }
}

test("AC-01: 스냅샷 복원은 서버 hostUuid와 세 식별자를 그대로 싣는다(새로고침한 방장이 권한을 잃지 않는다)", () => {
  const current = snapshotCurrent()
  const patch = applySessionSnapshotPure(current, snapshotResponse())

  assert.notEqual(patch, current)
  assert.equal(patch.hostUuid, "u1")
  assert.equal(patch.state.hostUuid, "u1")
  assert.equal(patch.state.roomId, "room-1")
  assert.equal(patch.state.roomInstanceId, "inst-1")
  assert.equal(patch.state.bootEpoch, "boot-1")
  assert.equal(patch.state.participationRevision, 4)
})

test("AC-03/AC-06: 스냅샷 roster는 생존과 참여를 분리해 복원한다 — 사망했지만 참여 중인 참가자가 남는다", () => {
  const patch = applySessionSnapshotPure(snapshotCurrent(), snapshotResponse())

  const dead = patch.state.players.find((p) => p.uuid === "u2")
  assert.equal(dead.alive, false)
  assert.equal(dead.isParticipating, true, "보드 사망 표시와 추방 목록 포함 여부는 다른 사실이다")
  assert.equal(dead.membershipId, "mem-2")
  assert.equal(dead.themeIndex, 5)
})

test("AC-03: 참여가 끝난 참가자는 roster에 남고 isParticipating만 false다", () => {
  const patch = applySessionSnapshotPure(snapshotCurrent(), snapshotResponse({
    players: [
      { uuid: "u1", nickname: "U1", isAlive: true, isConnected: true, isParticipating: true, membershipId: "mem-1" },
      { uuid: "u2", nickname: "U2", isAlive: false, isConnected: false, isParticipating: false, membershipId: "mem-2" },
    ],
  }))

  assert.equal(patch.state.players.length, 2, "전적 레코드와 명단이 갈리지 않게 roster는 유지된다")
  assert.equal(patch.state.players.find((p) => p.uuid === "u2").isParticipating, false)
})

test("AC-01: 모양이 틀린 hostUuid·식별자는 null로 두어 '모른다'와 '방장이다'를 섞지 않는다(fail-closed)", () => {
  const patch = applySessionSnapshotPure(snapshotCurrent(), snapshotResponse({
    hostUuid: "", roomId: null, roomInstanceId: 42, bootEpoch: undefined, participationRevision: -1,
  }))

  assert.equal(patch.hostUuid, null)
  assert.equal(patch.state.roomId, null)
  assert.equal(patch.state.roomInstanceId, null)
  assert.equal(patch.state.bootEpoch, null)
  assert.equal(patch.state.participationRevision, 0)
})

test("AC-03: isParticipating/membershipId의 형태가 틀리면 스냅샷 전체를 거부한다(부분 반영 없음)", () => {
  const current = snapshotCurrent()
  for (const players of [
    [
      { uuid: "u1", nickname: "U1", isAlive: true, isConnected: true, isParticipating: "yes" },
      { uuid: "u2", nickname: "U2", isAlive: true, isConnected: true },
    ],
    [
      { uuid: "u1", nickname: "U1", isAlive: true, isConnected: true, membershipId: "" },
      { uuid: "u2", nickname: "U2", isAlive: true, isConnected: true },
    ],
  ]) {
    assert.equal(applySessionSnapshotPure(current, snapshotResponse({ players })), current)
  }
})

test("AC-03: 두 필드가 없는 구버전 스냅샷도 그대로 복원된다(참여 중으로 본다)", () => {
  const patch = applySessionSnapshotPure(snapshotCurrent(), snapshotResponse({
    players: [
      { uuid: "u1", nickname: "U1", isAlive: true, isConnected: true },
      { uuid: "u2", nickname: "U2", isAlive: true, isConnected: true },
    ],
  }))

  assert.notEqual(patch.state, undefined)
  for (const player of patch.state.players) {
    assert.equal(player.isParticipating, true)
    assert.equal(Object.hasOwn(player, "membershipId"), false, "없던 키를 만들어내지 않는다")
  }
})

test("AC-03/AC-05: 개인 제출 순서값이 뒷걸음질치는 스냅샷은 적용하지 않는다", () => {
  const current = snapshotCurrent()
  current.state.participationRevision = 4
  current.state.selfProgressSeq = 7

  const stale = applySessionSnapshotPure(current, snapshotResponse({ selfProgressSeq: 6 }))
  assert.equal(stale, current, "방금 낸 제출을 옛 스냅샷이 되돌렸다")

  const same = applySessionSnapshotPure(current, snapshotResponse({ selfProgressSeq: 7 }))
  assert.notEqual(same, current)
  assert.equal(same.state.selfProgressSeq, 7)

  const newer = applySessionSnapshotPure(current, snapshotResponse({ selfProgressSeq: 9 }))
  assert.equal(newer.state.selfProgressSeq, 9)
})

test("AC-03/AC-05: 순서값을 싣지 않은 스냅샷은 이미 순서를 아는 화면에서만 막힌다", () => {
  const fresh = snapshotCurrent()
  const applied = applySessionSnapshotPure(fresh, snapshotResponse())
  assert.notEqual(applied, fresh)
  assert.equal(applied.state.selfProgressSeq, 0)

  const known = snapshotCurrent()
  known.state.participationRevision = 4
  known.state.selfProgressSeq = 2
  assert.equal(applySessionSnapshotPure(known, snapshotResponse()), known)
})

test("AC-01: 새로고침 부트스트랩도 hostUuid와 세 식별자를 함께 복원한다", () => {
  const patch = bootstrapSessionSnapshotPure(snapshotResponse())

  assert.notEqual(patch, null)
  assert.equal(patch.gameId, "g1")
  assert.equal(patch.hostUuid, "u1")
  assert.equal(patch.state.roomId, "room-1")
  assert.equal(patch.state.bootEpoch, "boot-1")
  assert.equal(patch.state.players.find((p) => p.uuid === "u2").isParticipating, true)
})

import test from "node:test"
import assert from "node:assert/strict"
import { buildCreateRoomPayload } from "../buildCreateRoomPayload.js"

function state(overrides = {}) {
  return {
    checks: {
      "private-lobby": false,
      "lights-out": false,
      "soul-betting": false,
      "vote-reveal": true,
      ...overrides.checks,
    },
    ranges: {
      "max-players": 8,
      "joker-count": 2,
      "day-discussion-time": 60,
      "day-vote-time": 60,
      "night-action-time": 90,
      ...overrides.ranges,
    },
    ...(overrides.roleComposition ? { roleComposition: overrides.roleComposition } : {}),
  }
}

const AUTO_PAYLOAD = {
  accessType: "open",
  maxPlayers: 8,
  jokerCount: 2,
  lightsOut: false,
  soulBetting: false,
  dayDiscussionTime: 60,
  dayVoteTime: 60,
  nightActionTime: 90,
  voteReveal: true,
  roleCompositionMode: "auto",
}

test("모든 체크박스/숫자 설정이 payload 필드로 정확히 변환된다", () => {
  const payload = buildCreateRoomPayload(state())
  assert.deepEqual(payload, AUTO_PAYLOAD)
})

test("역할 구성 상태가 없으면 AUTO로 취급하고 기존 jokerCount 계약을 그대로 유지한다", () => {
  // 역할 구성 UI를 건드리지 않은 사용자의 payload는 기존과 동일한 필드 + 명시적 auto 표기다.
  const payload = buildCreateRoomPayload(state())
  assert.equal(payload.roleCompositionMode, "auto")
  assert.equal(payload.jokerCount, 2)
  assert.equal(Object.hasOwn(payload, "roleCounts"), false)
})

test("private-lobby 체크 여부가 accessType(open/code)으로 매핑된다", () => {
  const unchecked = buildCreateRoomPayload(state({ checks: { "private-lobby": false } }))
  const checked = buildCreateRoomPayload(state({ checks: { "private-lobby": true } }))
  assert.equal(unchecked.accessType, "open")
  assert.equal(checked.accessType, "code")
})

test("서버 권한 필드(uuid, hostUuid, title 등)를 생성하지 않는다", () => {
  const payload = buildCreateRoomPayload(state())
  for (const forbidden of ["uuid", "hostUuid", "roomId", "roomCode", "players", "title", "status", "createdAt"]) {
    assert.equal(Object.hasOwn(payload, forbidden), false)
  }
})

// ── CUSTOM 역할 구성 ────────────────────────────────────────────────────────

test("CUSTOM payload는 허용된 4개 역할 수만 담고 jokerCount를 roleCounts.JOKER와 일치시킨다", () => {
  const payload = buildCreateRoomPayload(
    state({
      roleComposition: {
        mode: "custom",
        roleCounts: { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
      },
    }),
  )

  assert.equal(payload.roleCompositionMode, "custom")
  assert.deepEqual(payload.roleCounts, { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  assert.deepEqual(Object.keys(payload.roleCounts), ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])
  // ranges["joker-count"]가 2였더라도 CUSTOM에서는 roleCounts.JOKER가 canonical이다.
  assert.equal(payload.jokerCount, 3)
})

test("CUSTOM payload에 CITIZEN이나 서버 권한 필드가 섞이지 않는다", () => {
  const payload = buildCreateRoomPayload(
    state({
      roleComposition: {
        mode: "custom",
        // 상태에 CITIZEN/서버 소유 필드가 잘못 섞여 있어도 payload로 새어 나가면 안 된다.
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 5, hostUuid: "x" },
      },
    }),
  )

  assert.equal(Object.hasOwn(payload.roleCounts, "CITIZEN"), false)
  assert.equal(Object.hasOwn(payload.roleCounts, "hostUuid"), false)
  assert.equal(Object.hasOwn(payload, "CITIZEN"), false)
  for (const forbidden of ["uuid", "hostUuid", "roomId", "roomCode", "players", "title", "status", "createdAt"]) {
    assert.equal(Object.hasOwn(payload, forbidden), false)
  }
})

test("CUSTOM에서 잘못된 값도 보정하지 않고 그대로 실어 서버가 거부하게 한다", () => {
  const payload = buildCreateRoomPayload(
    state({
      roleComposition: {
        mode: "custom",
        roleCounts: { JOKER: "2", DOCTOR: -1, GUARD: 1.5, WITCH_HUNTER: undefined },
      },
    }),
  )

  assert.deepEqual(payload.roleCounts, { JOKER: "2", DOCTOR: -1, GUARD: 1.5, WITCH_HUNTER: undefined })
  assert.equal(payload.jokerCount, "2")
})

test("CUSTOM에서 AUTO로 되돌아가면 이전 custom 필드가 payload에 남지 않는다", () => {
  const custom = buildCreateRoomPayload(
    state({
      roleComposition: { mode: "custom", roleCounts: { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } },
    }),
  )
  assert.equal(Object.hasOwn(custom, "roleCounts"), true)

  // 같은 roleCounts 상태를 그대로 들고 있어도 모드가 auto면 payload에는 실리지 않는다.
  const backToAuto = buildCreateRoomPayload(
    state({
      roleComposition: { mode: "auto", roleCounts: { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } },
    }),
  )
  assert.deepEqual(backToAuto, AUTO_PAYLOAD)
  assert.equal(Object.hasOwn(backToAuto, "roleCounts"), false)
  assert.equal(backToAuto.jokerCount, 2) // AUTO는 다시 기존 스테퍼 값을 쓴다
})

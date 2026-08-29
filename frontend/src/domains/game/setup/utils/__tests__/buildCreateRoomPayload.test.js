import test from "node:test"
import assert from "node:assert/strict"
import { buildCreateRoomPayload } from "../buildCreateRoomPayload.js"
import { MEETING_GAME_SETUP, ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../../constants/gameSetupOptions.js"

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

// ── 직업별 밤 제한시간 ───────────────────────────────────────────────────────

/** 설정 화면이 실제로 만들어내는 초기 ranges 상태(스테퍼 항목의 기본값)를 그대로 재현한다. */
function meetingTabRanges() {
  const ranges = {}
  for (const item of MEETING_GAME_SETUP) {
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return ranges
}

test("직업별 밤 시간 스테퍼가 없으면 payload에 roleNightActionTimes를 만들지 않는다", () => {
  // 필드가 없어야 서버가 nightActionTime으로 폴백한다 — 빈 객체를 보내면 안 된다.
  const payload = buildCreateRoomPayload(state())
  assert.equal(Object.hasOwn(payload, "roleNightActionTimes"), false)
})

test("설정 화면의 직업별 스테퍼 값이 역할 키로 그대로 전달된다", () => {
  const payload = buildCreateRoomPayload(
    state({
      ranges: {
        ...meetingTabRanges(),
        "night-action-time-joker": 30,
        "night-action-time-doctor": 60,
        "night-action-time-guard": 120,
        "night-action-time-witch-hunter": 90,
      },
    }),
  )

  assert.deepEqual(payload.roleNightActionTimes, {
    JOKER: 30,
    DOCTOR: 60,
    GUARD: 120,
    WITCH_HUNTER: 90,
  })
  // 전체 밤 행동 시간 필드는 그대로 남는다(지정하지 않은 직업의 폴백 대상이다).
  assert.equal(payload.nightActionTime, 90)
})

test("회의&투표 탭 기본 상태에서도 네 직업의 값이 모두 실린다", () => {
  const payload = buildCreateRoomPayload(state({ ranges: meetingTabRanges() }))
  assert.deepEqual(Object.keys(payload.roleNightActionTimes), ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])
  for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
    const item = MEETING_GAME_SETUP.find((entry) => entry.id === id)
    assert.ok(item, `${id} 스테퍼가 회의&투표 탭에 있다`)
    assert.equal(payload.roleNightActionTimes[role], item.defaultValue)
  }
})

test("일부 직업만 입력하면 그 직업만 실리고 나머지는 서버 폴백에 맡긴다", () => {
  const payload = buildCreateRoomPayload(state({ ranges: { "night-action-time-guard": 120 } }))
  assert.deepEqual(payload.roleNightActionTimes, { GUARD: 120 })
})

test("직업별 값도 보정하지 않고 그대로 실어 서버가 거부하게 한다", () => {
  const payload = buildCreateRoomPayload(state({ ranges: { "night-action-time-joker": 45 } }))
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 45 })
})

test("CUSTOM 역할 구성에서도 직업별 밤 시간이 그대로 유지된다", () => {
  const payload = buildCreateRoomPayload(
    state({
      ranges: { "night-action-time-joker": 30 },
      roleComposition: { mode: "custom", roleCounts: { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } },
    }),
  )
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 30 })
  assert.equal(payload.jokerCount, 3)
})

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
  }
}

test("모든 체크박스/숫자 설정이 payload 필드로 정확히 변환된다", () => {
  const payload = buildCreateRoomPayload(state())
  assert.deepEqual(payload, {
    accessType: "open",
    maxPlayers: 8,
    jokerCount: 2,
    lightsOut: false,
    soulBetting: false,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 90,
    voteReveal: true,
  })
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

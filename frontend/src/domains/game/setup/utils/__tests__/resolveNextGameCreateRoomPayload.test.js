import assert from "node:assert/strict"
import test from "node:test"
import { NEXT_ROOM_SETTINGS_RESTORE_CODES } from "../../store/nextRoomSettingsStore.js"
import { resolveNextGameCreateRoomPayload } from "../resolveNextGameCreateRoomPayload.js"

test("유지 해제·저장 없음이면 게임 만들기 기본값 payload를 만든다", () => {
  const payload = resolveNextGameCreateRoomPayload("acct", () => ({
    code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED,
    source: null,
  }))
  assert.equal(payload.maxPlayers, 10)
  assert.equal(payload.jokerCount, 2)
  assert.equal(payload.roleCompositionMode, "auto")
})

test("복원 원본이 있으면 F-24 저장값으로 payload를 만든다", () => {
  const payload = resolveNextGameCreateRoomPayload("acct", () => ({
    code: NEXT_ROOM_SETTINGS_RESTORE_CODES.RESTORED,
    source: {
      accessType: "code",
      settings: {
        maxPlayers: 6,
        jokerCount: 1,
        dayDiscussionTime: 120,
        dayVoteTime: 30,
        nightActionTime: 60,
        roleCompositionMode: "custom",
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
        roleNightActionTimes: { DOCTOR: 120 },
      },
    },
  }))
  assert.equal(payload.accessType, "code")
  assert.equal(payload.maxPlayers, 6)
  assert.deepEqual(payload.roleNightActionTimes, { DOCTOR: 120 })
  assert.deepEqual(payload.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
})

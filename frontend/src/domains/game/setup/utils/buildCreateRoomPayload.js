// 설정 폼 값 → 방 만들기 요청 payload
// GameSetupPanel·resolveNextGameCreateRoomPayload가 씀, 시험도 씀
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { collectSpecifiedRoleTimes } from "./roomSettingsForm/nightTimes.js"

// 방 만들기 payload 만들기
export function buildCreateRoomPayload({ checks, ranges, roleComposition, specifiedRoleNightActionTimes }) {
  // 직접 지정이 아니면 자동으로 봄
  const mode =
    roleComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
      ? ROLE_COMPOSITION_MODES.CUSTOM
      : ROLE_COMPOSITION_MODES.AUTO

  const payload = {
    accessType: checks["private-lobby"] ? "code" : "open",
    maxPlayers: ranges["max-players"],
    jokerCount: ranges["joker-count"],
    lightsOut: checks["lights-out"],
    soulBetting: checks["soul-betting"],
    dayDiscussionTime: ranges["day-discussion-time"],
    dayVoteTime: ranges["day-vote-time"],
    nightActionTime: ranges["night-action-time"],
    voteReveal: checks["vote-reveal"],
    roleCompositionMode: mode,
  }

  // 직업별 밤 시간은 있을 때만 실음
  const roleNightActionTimes = collectSpecifiedRoleTimes(ranges, specifiedRoleNightActionTimes)
  if (roleNightActionTimes !== null) payload.roleNightActionTimes = roleNightActionTimes

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    return payload
  }

  // 직접 지정: 직업 수를 싣고 광대 수는 직업 수의 광대로 맞춤
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}

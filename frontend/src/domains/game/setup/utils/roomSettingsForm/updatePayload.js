// 설정 편집 폼 값 → 방 설정 바꾸기 요청 payload
// matching/hooks/room/useSettingsSave가 씀
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../../constants/roleComposition.js"
import { collectSpecifiedRoleNightActionTimes } from "./nightTimes.js"

export function buildUpdateRoomSettingsPayload({
  checks,
  ranges,
  roleComposition,
  specifiedRoleNightActionTimes,
  roomId,
  requestId,
  expectedSettingsVersion,
}) {
  // 직접 지정이 아니면 자동으로 봄
  const mode =
    roleComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
      ? ROLE_COMPOSITION_MODES.CUSTOM
      : ROLE_COMPOSITION_MODES.AUTO

  const payload = {
    roomId,
    requestId,
    expectedSettingsVersion,
    accessType: checks?.["private-lobby"] ? "code" : "open",
    maxPlayers: ranges?.["max-players"],
    jokerCount: ranges?.["joker-count"],
    roleCompositionMode: mode,
    dayDiscussionTime: ranges?.["day-discussion-time"],
    dayVoteTime: ranges?.["day-vote-time"],
    nightActionTime: ranges?.["night-action-time"],
  }

  // 직업별 밤 시간은 있을 때만 실음
  const roleNightActionTimes = collectSpecifiedRoleNightActionTimes(ranges, specifiedRoleNightActionTimes)
  if (roleNightActionTimes !== null) payload.roleNightActionTimes = roleNightActionTimes

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    return payload
  }

  // 직접 지정: 직업 수를 싣고 조커 수는 직업 수의 조커로 맞춤
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}

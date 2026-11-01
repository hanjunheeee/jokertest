import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { collectSpecifiedRoleTimes } from "./roomSettingsForm/nightTimes.js"

export function buildCreateRoomPayload({ checks, ranges, roleComposition, specifiedRoleNightActionTimes }) {
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

  const roleNightActionTimes = collectSpecifiedRoleTimes(ranges, specifiedRoleNightActionTimes)
  if (roleNightActionTimes !== null) payload.roleNightActionTimes = roleNightActionTimes

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    return payload
  }

  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}

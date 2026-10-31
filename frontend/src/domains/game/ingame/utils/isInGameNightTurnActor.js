export function isInGameNightTurnActor(nightTurnRole, myRole) {
  if (typeof nightTurnRole !== "string" || nightTurnRole.length === 0) return false
  if (typeof myRole !== "string" || myRole.length === 0) return false
  return nightTurnRole === myRole
}

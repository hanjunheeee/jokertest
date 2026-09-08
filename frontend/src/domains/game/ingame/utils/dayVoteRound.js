// Shared by live events and reconnect snapshots. Round is the resolved round;
// REVOTE opens the following round without changing dayIndex or DAY_VOTE.
export function parseDayVoteRoundFields(raw, rosterIds) {
  const round = Object.hasOwn(raw, "round") ? raw.round : 1
  if (!Number.isInteger(round) || round < 1 || round > 2) return null
  const excluded = Object.hasOwn(raw, "revoteExcludedUuids") ? raw.revoteExcludedUuids : []
  if (!Array.isArray(excluded)) return null
  if (excluded.some((id) => typeof id !== "string" || !id || (rosterIds && !rosterIds.has(id)))) return null
  if (new Set(excluded).size !== excluded.length) return null
  if (raw.outcome === "REVOTE") {
    if (raw.round !== 1 || excluded.length < 2) return null
  } else if (excluded.length !== 0) return null
  // Preserve the legacy payload shape when neither optional field was supplied.
  return Object.hasOwn(raw, "round") || Object.hasOwn(raw, "revoteExcludedUuids")
    ? { round, revoteExcludedUuids: [...excluded] }
    : {}
}

export function getDayVoteRound(state) {
  return state?.dayVoteRound ?? 1
}

const KNOWN_WINNERS = new Set(["CITIZEN", "JOKER"])
const KNOWN_TEAMS = new Set(["CITIZEN", "JOKER"])

function normalizeRoleReveals(rawReveals) {
  if (!Array.isArray(rawReveals)) return []

  const normalized = []
  const seenUuids = new Set()
  for (const raw of rawReveals) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue
    if (typeof raw.uuid !== "string" || raw.uuid.length === 0) continue
    if (seenUuids.has(raw.uuid)) continue
    if (typeof raw.nickname !== "string") continue
    if (typeof raw.role !== "string" || raw.role.length === 0) continue
    if (raw.team !== null && (typeof raw.team !== "string" || !KNOWN_TEAMS.has(raw.team))) continue
    if (typeof raw.alive !== "boolean") continue
    if (raw.deathReason !== null && raw.deathReason !== undefined && typeof raw.deathReason !== "string") {
      continue
    }
    seenUuids.add(raw.uuid)
    normalized.push({
      uuid: raw.uuid,
      nickname: raw.nickname,
      role: raw.role,
      team: raw.team,
      alive: raw.alive,
      deathReason: raw.alive ? null : (raw.deathReason ?? null),
    })
  }
  return normalized
}

function normalizeWinResultMvp(rawMvp) {
  if (rawMvp === null || rawMvp === undefined) return null
  if (typeof rawMvp !== "object" || Array.isArray(rawMvp)) return null
  if (typeof rawMvp.uuid !== "string" || rawMvp.uuid.length === 0) return null
  return { uuid: rawMvp.uuid }
}

export function normalizePublicWinResult(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (!KNOWN_WINNERS.has(raw.winner)) return null

  const winResult = { winner: raw.winner }

  const reveals = normalizeRoleReveals(raw.reveals)
  if (reveals.length > 0) {
    winResult.reveals = reveals
  }

  const mvp = normalizeWinResultMvp(raw.mvp)
  if (mvp !== null) {
    winResult.mvp = mvp
  }

  return winResult
}

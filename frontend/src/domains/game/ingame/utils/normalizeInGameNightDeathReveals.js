export const DEATH_SOURCES = Object.freeze([
  "JOKER",
  "WITCH_HUNTER",
  "OTHER",
  "UNKNOWN_NIGHT",
])

const KNOWN_SOURCES = new Set(DEATH_SOURCES)

export function normalizeInGameNightDeathReveals(rawReveals) {
  if (!Array.isArray(rawReveals)) return []

  const normalized = []
  for (const raw of rawReveals) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue
    if (typeof raw.victimUuid !== "string" || raw.victimUuid.length === 0) continue
    if (typeof raw.source !== "string" || !KNOWN_SOURCES.has(raw.source)) continue
    normalized.push({ victimUuid: raw.victimUuid, source: raw.source })
  }
  return normalized
}

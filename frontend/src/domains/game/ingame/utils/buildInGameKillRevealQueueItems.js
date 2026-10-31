import { normalizeInGameNightDeathReveals } from "./normalizeInGameNightDeathReveals.js"

export function buildInGameKillRevealQueueItems({ gameId, authUuid, epoch, nightResult }) {
  if (typeof gameId !== "string" || gameId.length === 0) return []
  if (typeof authUuid !== "string" || authUuid.length === 0) return []
  if (nightResult === null || typeof nightResult !== "object" || Array.isArray(nightResult)) return []
  if (!Number.isInteger(nightResult.dayIndex) || nightResult.dayIndex < 0) return []

  const reveals = normalizeInGameNightDeathReveals(nightResult.deathReveals)
  if (reveals.length === 0) return []

  const seen = new Set()
  const items = []
  for (const reveal of reveals) {
    const id = `${gameId}|${nightResult.dayIndex}|${reveal.victimUuid}|${reveal.source}|${authUuid}|${epoch}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({ id, victimUuid: reveal.victimUuid, source: reveal.source })
  }
  return items
}

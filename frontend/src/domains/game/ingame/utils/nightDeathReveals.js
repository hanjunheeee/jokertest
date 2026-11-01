// 밤 사망 공개 목록 다듬기와 사망 연출 줄 항목 만들기
// 사망 연출 훅(useInGameKillReveal)·스냅샷 낮 필드 검사가 사용

// 서버가 보내는 사망 원인
export const DEATH_SOURCES = Object.freeze([
  "JOKER",
  "WITCH_HUNTER",
  "OTHER",
  "UNKNOWN_NIGHT",
])

const KNOWN_SOURCES = new Set(DEATH_SOURCES)

// 모양이 맞고 아는 사망 원인인 공개만 남김
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

// 판·날짜·피해자·원인·계정·세대로 키를 만들어 겹치지 않는 줄 항목
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

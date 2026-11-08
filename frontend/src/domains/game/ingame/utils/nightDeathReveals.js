// 밤 사망 공개 목록 다듬기
// 스냅샷 낮 필드 검사(utils/snapshot/dayFields.js)가 사용

// 받아 주는 사망 원인: 서버는 광대·마녀사냥꾼·모름(UNKNOWN_NIGHT)만 보냄
// OTHER는 서버가 안 보내지만 옛 기록 호환으로 받아 둠 (안내 글도 있음)
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

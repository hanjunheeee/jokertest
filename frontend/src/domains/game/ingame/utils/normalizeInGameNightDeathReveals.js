/**
 * 공개용 밤 사망 연출 데이터(deathReveals)를 엄격하게 정규화한다.
 *
 * 서버(game-core buildNightResultAppliedPayload)가 night_result_applied 방송과
 * get_session_snapshot 응답에 함께 실어 보내는 공개 정보다. 신뢰하지 않는 외부 입력이므로
 * 다음 두 필드만 통과시키고, 나머지(살해자 identity 등 예상치 못한 필드)는 전부 버린다.
 *
 *  - victimUuid: 비어 있지 않은 문자열
 *  - source: JOKER | WITCH_HUNTER | OTHER | UNKNOWN_NIGHT
 *
 * 형태가 어긋난 원소는 전체를 거부하지 않고 그 원소만 조용히 무시한다 — 하나가 깨졌다고
 * 나머지 정상 연출까지 사라지면 사망 사실 자체가 화면에서 누락되기 때문이다. 배열이
 * 아니면 빈 배열을 돌려준다. 반환 원소는 항상 새로 만든 {victimUuid, source} 객체라
 * 호출부가 원본을 변형해도 영향이 없다.
 */

/** 공개 사망 출처(서버 PUBLIC_NIGHT_DEATH_SOURCES의 프런트 사본) */
export const INGAME_NIGHT_DEATH_SOURCES = Object.freeze([
  "JOKER",
  "WITCH_HUNTER",
  "OTHER",
  "UNKNOWN_NIGHT",
])

const KNOWN_SOURCES = new Set(INGAME_NIGHT_DEATH_SOURCES)

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

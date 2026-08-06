import { normalizeInGameNightDeathReveals } from "./normalizeInGameNightDeathReveals.js"

/**
 * 현재 nightResult로부터 사망 연출 큐 항목을 payload 순서 그대로 만든다(순수 함수).
 *
 * 각 항목의 id가 곧 "연출 identity"다. 다음 값들로 범위를 좁혀, 같은 연출이 두 번
 * 재생되는 일도(같은 이벤트 재수신·스냅샷 재적용·roster 갱신·phase 리렌더) 다른 세션의
 * 연출이 새 세션으로 새어 들어오는 일도 없게 한다.
 *
 *  - gameId
 *  - 판정된 밤의 dayIndex (서버가 그 밤 결과와 함께 보고하는 dayIndex)
 *  - victimUuid
 *  - source
 *  - 인증 계정 uuid
 *  - 현재 소켓 세대(epoch) — 소켓 교체/재연결이면 이전 세대의 큐·콜백은 전부 무효가 된다
 *
 * 같은 payload 안에 완전히 동일한 identity가 중복으로 들어 있으면 한 번만 남긴다.
 * 유효하지 않은 입력(게임/계정 미확정, nightResult 형태 불일치)이면 빈 배열이다.
 */
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

// 공개 승패 결과 다듬기: 이긴 쪽, 직업 공개 목록, MVP (모양 틀린 항목은 뺌)
// 재판 판정 반영·밤 결과·사망 방송 검사와 스냅샷 승패 검사가 사용

// 받는 이긴 쪽·팀 이름
const KNOWN_WINNERS = new Set(["CITIZEN", "JOKER"])
const KNOWN_TEAMS = new Set(["CITIZEN", "JOKER"])

// 직업 공개 목록: 모양이 틀리거나 같은 사람이 두 번이면 그 항목만 뺌
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
    // 살아 있는 사람은 죽은 이유 비움
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

// MVP: uuid만 남김 (없거나 모양이 틀리면 null)
function normalizeWinResultMvp(rawMvp) {
  if (rawMvp === null || rawMvp === undefined) return null
  if (typeof rawMvp !== "object" || Array.isArray(rawMvp)) return null
  if (typeof rawMvp.uuid !== "string" || rawMvp.uuid.length === 0) return null
  return { uuid: rawMvp.uuid }
}

// 이긴 쪽을 모르면 null, 공개 목록·MVP는 있을 때만 붙임
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

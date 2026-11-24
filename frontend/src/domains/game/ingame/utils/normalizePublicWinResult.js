// 공개 승패 결과 다듬기: 이긴 쪽, 직업 공개 목록·받은 판 골드 (모양 틀린 항목은 뺌), 결과 화면 닫힘 시각 읽기
// 재판 판정 반영·밤 결과·사망 방송 검사와 스냅샷 승패 검사가 사용

// 받는 이긴 쪽·팀 이름
const KNOWN_WINNERS = new Set(["CITIZEN", "JOKER"])
const KNOWN_TEAMS = new Set(["CITIZEN", "JOKER"])

// 받은 판 골드: 1 이상 정수만, 없거나 틀리면 0 (못 받은 사람·옛 서버)
function normalizeGoldReward(value) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

// null 또는 비지 않은 문자열만 허용 (없으면 칸 안 붙임)
function normalizeOptionalAccountItemId(value) {
  if (value === null) return null
  if (typeof value === "string" && value.length > 0) return value
  return undefined
}

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
    // 살아 있는 사람은 죽은 이유 비움, 프로필 사진·테두리는 왔을 때만 붙임
    const entry = {
      uuid: raw.uuid,
      nickname: raw.nickname,
      role: raw.role,
      team: raw.team,
      alive: raw.alive,
      deathReason: raw.alive ? null : (raw.deathReason ?? null),
      goldReward: normalizeGoldReward(raw.goldReward),
    }
    const photoId = normalizeOptionalAccountItemId(raw.accountProfilePhotoId)
    if (photoId !== undefined) entry.accountProfilePhotoId = photoId
    const borderId = normalizeOptionalAccountItemId(raw.accountProfileBorderId)
    if (borderId !== undefined) entry.accountProfileBorderId = borderId
    normalized.push(entry)
  }
  return normalized
}

// 이긴 쪽을 모르면 null, 공개 목록은 있을 때만 붙임
export function normalizePublicWinResult(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (!KNOWN_WINNERS.has(raw.winner)) return null

  const winResult = { winner: raw.winner }

  const reveals = normalizeRoleReveals(raw.reveals)
  if (reveals.length > 0) {
    winResult.reveals = reveals
  }

  return winResult
}

// 판 끝 칸 맨 위의 결과 화면 닫힘 시각 (판 끝 + 180초, ms), 없거나 틀리면 null
// 판 상태에 담아 두어 결과 화면이 판 상태를 다시 안 물어도 우측 위 타이머를 바로 셈
// 예: { resultClosesAt: 1763290000000 } → 1763290000000, {} → null
export function readResultClosesAtField(payload) {
  const value = payload?.resultClosesAt
  return Number.isFinite(value) && value > 0 ? value : null
}

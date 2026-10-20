/**
 * 공개 winResult — canonical { winner }에 선택적 전원 정체 공개(reveals)·mvp를 붙인 형태.
 *
 * 서버(game-core buildPublicWinResult)가 ENDED 스냅샷·terminal payload에 실어 보낸다.
 * store에는 winner만 남기면 결과 화면(buildGameResultViewModel)이 참가자 명단을 그릴 수 없으므로,
 * applySessionSnapshot·parseNightResultAppliedPayload·applyTribunalResolved·
 * parsePlayerEliminatedPayload가 모두 이 정규화기를 공유한다.
 */

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

/**
 * @param {unknown} raw 서버가 내려준 winResult 원본
 * @returns {{ winner: "CITIZEN"|"JOKER", reveals?: object[], mvp?: { uuid: string } } | null}
 */
export function normalizePublicWinResult(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (!KNOWN_WINNERS.has(raw.winner)) return null

  /** @type {{ winner: "CITIZEN"|"JOKER", reveals?: object[], mvp?: { uuid: string } }} */
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

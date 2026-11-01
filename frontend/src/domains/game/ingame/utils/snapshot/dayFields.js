// 스냅샷의 밤 결과·낮 투표 판정·재판 필드 검사 (순수 계산)
// 필드가 없으면 null, 모양이 틀리면 BAD (utils/snapshot/applySnapshot.js가 사용)
import { DAY_VOTE_OUTCOMES, TRIBUNAL_OUTCOMES } from "../../constants/store/sessionSnapshot.js"
import { parseDayVoteRoundFields } from "../dayVoteRound.js"
import { normalizeInGameNightDeathReveals } from "../normalizeInGameNightDeathReveals.js"
import { BAD, isNonEmptyString, isNonNegativeInteger, isPlainObject } from "./checks.js"

// 밤 결과: 그날 것, 죽은 사람은 명단 안 (사망 공개 목록은 명단 안 사람만 남김)
function readNightResult(response, roster) {
  const raw = response.nightResult
  if (!isPlainObject(raw)) return BAD
  if (!isNonNegativeInteger(raw.dayIndex) || raw.dayIndex !== response.dayIndex) return BAD
  if (raw.victimUuid !== null && !isNonEmptyString(raw.victimUuid)) return BAD
  if (raw.victimUuid !== null && !roster.has(raw.victimUuid)) return BAD
  const nightResult = { dayIndex: raw.dayIndex, victimUuid: raw.victimUuid }
  if (Object.hasOwn(raw, "deathReveals")) {
    if (!Array.isArray(raw.deathReveals)) return BAD
    nightResult.deathReveals = normalizeInGameNightDeathReveals(raw.deathReveals)
      .filter((reveal) => roster.has(reveal.victimUuid))
  }
  return nightResult
}

// 낮 투표 판정: 결과 이름·회차 필드·재투표는 투표 중일 때만·재판이면 피고가 명단 안
function readDayVoteResolution(response, roster) {
  const raw = response.dayVoteResolution
  if (!isPlainObject(raw)) return BAD
  if (!DAY_VOTE_OUTCOMES.has(raw.outcome)) return BAD
  const roundFields = parseDayVoteRoundFields(raw, new Set(roster.keys()))
  if (!roundFields) return BAD
  if (raw.outcome === "REVOTE" && (response.phase !== "DAY" || response.dayPhase !== "DAY_VOTE")) return BAD
  if (raw.outcome === "TRIBUNAL") {
    if (!isNonEmptyString(raw.tribunalTargetUuid)) return BAD
    if (!roster.has(raw.tribunalTargetUuid)) return BAD
  } else if (raw.tribunalTargetUuid !== null) {
    return BAD
  }
  if (!isNonNegativeInteger(raw.publicVoteCount) || !isNonNegativeInteger(raw.publicAbstainCount)) return BAD
  if (raw.outcome === "REVOTE" && raw.publicVoteCount <= raw.publicAbstainCount) return BAD
  return {
    outcome: raw.outcome,
    tribunalTargetUuid: raw.outcome === "TRIBUNAL" ? raw.tribunalTargetUuid : null,
    publicVoteCount: raw.publicVoteCount,
    publicAbstainCount: raw.publicAbstainCount,
    ...roundFields,
  }
}

// 재판: 피고는 명단 안, 끝났으면 결과·표 수·처형자가 결과와 맞아야 함
function readTribunal(response, roster) {
  const raw = response.tribunal
  if (!isPlainObject(raw)) return BAD
  if (!isNonEmptyString(raw.defendantUuid)) return BAD
  if (!roster.has(raw.defendantUuid)) return BAD
  if (typeof raw.resolved !== "boolean") return BAD

  if (!raw.resolved) return { defendantUuid: raw.defendantUuid, resolved: false }

  if (!TRIBUNAL_OUTCOMES.has(raw.outcome)) return BAD
  const counts = raw.counts
  if (!isPlainObject(counts)) return BAD
  if (!isNonNegativeInteger(counts.guilty) || !isNonNegativeInteger(counts.notGuilty)) return BAD
  if (raw.outcome === "GUILTY" && raw.executedUuid !== raw.defendantUuid) return BAD
  if (raw.outcome === "NOT_GUILTY" && raw.executedUuid !== null) return BAD
  return {
    defendantUuid: raw.defendantUuid,
    resolved: true,
    outcome: raw.outcome,
    counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
    executedUuid: raw.executedUuid,
  }
}

// 응답에 있는 필드만 검사 (이 단계에서 오면 안 되는 필드가 오면 BAD)
function readField(response, key, allowed, read, roster) {
  if (!Object.hasOwn(response, key)) return null
  if (!allowed) return BAD
  return read(response, roster)
}

// 세 필드 함께 검사 → { nightResult, dayVoteResolution, tribunal } (하나라도 틀리면 BAD)
// 낮 투표 판정과 재판이 같이 오면 재판 결과로 간 판정이어야 하고 피고가 같아야 함
export function readDayFields(response, roster, allowed) {
  const nightResult = readField(response, "nightResult", allowed, readNightResult, roster)
  if (nightResult === BAD) return BAD
  const dayVoteResolution = readField(response, "dayVoteResolution", allowed, readDayVoteResolution, roster)
  if (dayVoteResolution === BAD) return BAD
  const tribunal = readField(response, "tribunal", allowed, readTribunal, roster)
  if (tribunal === BAD) return BAD

  if (dayVoteResolution !== null && tribunal !== null) {
    if (dayVoteResolution.outcome !== "TRIBUNAL") return BAD
    if (dayVoteResolution.tribunalTargetUuid !== tribunal.defendantUuid) return BAD
  }
  return { nightResult, dayVoteResolution, tribunal }
}

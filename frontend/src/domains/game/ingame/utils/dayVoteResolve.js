// 낮 투표 판정 계산: 판정 응답·무효화 조각, 판정 방송 검사 (상태를 안 건드리는 순수 계산)
// 판정 훅(useDayVoteResolve)·낮 이벤트 손잡이가 사용, 행동 패널 입구가 다시 내보냄
import { FAILED_MSG } from "../constants/actions/dayVoteResolve.js"
import { parseDayVoteRoundFields } from "./dayVoteRound.js"

// 받는 판정 결과·다음 단계 이름과 표 수 검사
const RESOLVED_OUTCOMES = new Set(["TRIBUNAL", "TIE", "ABSTAINED", "REVOTE"])
const RESOLVED_PHASES = new Set(["NIGHT", "TRIBUNAL", "DAY"])

const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0

// 판정 요청 응답 → 상태 조각 (재투표면 다시 idle, 실패면 문구)
export function computeDayVoteResolveAckPatch(response) {
  if (response?.ok) {
    return {
      status: response.outcome === "REVOTE" ? "idle" : "resolved",
      error: null,
      resolution: { outcome: response.outcome ?? null, tribunalTargetUuid: response.tribunalTargetUuid ?? null },
    }
  }
  return { status: "idle", error: response?.message ?? FAILED_MSG, resolution: null }
}

// 방송이 지금 판·지금 낮 것인지
export function shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false
  if (!Number.isInteger(dayIndex)) return false
  if (payload.gameId !== gameId) return false
  if (payload.dayIndex !== dayIndex) return false
  return true
}

// 판정 방송 검사: 결과별로 다음 단계·피고·공개 표 수가 맞아야 함 (틀리면 null)
export function parseDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex })) return null
  if (!RESOLVED_PHASES.has(payload.phase)) return null
  if (!RESOLVED_OUTCOMES.has(payload.outcome)) return null
  if (!isNonNegativeInteger(payload.publicVoteCount)) return null
  if (!isNonNegativeInteger(payload.publicAbstainCount)) return null
  if (payload.publicAbstainCount > payload.publicVoteCount) return null
  const roundFields = parseDayVoteRoundFields(payload)
  if (!roundFields) return null

  // 재투표: 낮 그대로, 피고 없음, 기권보다 표가 많음
  if (payload.outcome === "REVOTE") {
    if (payload.phase !== "DAY" || payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  // 재판: 피고가 있고 기권보다 표가 많음
  } else if (payload.outcome === "TRIBUNAL") {
    if (payload.phase !== "TRIBUNAL") return null
    if (typeof payload.tribunalTargetUuid !== "string" || payload.tribunalTargetUuid.length === 0) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  // 동표: 밤으로, 피고 없음, 기권보다 표가 많음
  } else if (payload.outcome === "TIE") {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  // 기권: 밤으로, 피고 없음, 전부 기권
  } else {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount !== payload.publicAbstainCount) return null
  }

  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    phase: payload.phase,
    outcome: payload.outcome,
    tribunalTargetUuid: payload.outcome === "TRIBUNAL" ? payload.tribunalTargetUuid : null,
    publicVoteCount: payload.publicVoteCount,
    publicAbstainCount: payload.publicAbstainCount,
    ...roundFields,
  }
}

// 무효화 조각 (화면이 내려갔으면 null)
export function computeDayVoteResolveInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, resolution: null }
}

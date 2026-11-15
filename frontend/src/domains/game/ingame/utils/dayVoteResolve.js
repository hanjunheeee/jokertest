// 낮 투표 판정 계산: 판정 응답·무효화 조각, 판정 방송 검사 (상태를 안 건드리는 순수 계산)
// 판정 훅(useDayVoteResolve)·낮 이벤트 손잡이가 사용, 행동 패널 입구가 다시 내보냄
import { FAILED_MSG } from "../constants/actions/dayVoteResolve.js"
import { parseDayVoteRoundFields } from "./dayVoteRound.js"

// 받는 판정 결과·다음 단계 이름과 표 수 검사
// 재투표 삭제로 REVOTE·낮 그대로는 안 받음 (사용자 결정 2026-11-09)
// ABSTAIN_MAJORITY = 기권이 최다 득표 이상이라 재판 없이 밤 (사용자 결정 2026-11-16)
const RESOLVED_OUTCOMES = new Set(["TRIBUNAL", "TIE", "ABSTAIN_MAJORITY", "ABSTAINED"])
const RESOLVED_PHASES = new Set(["NIGHT", "TRIBUNAL"])

const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0

// 판정 요청 응답 → 상태 조각 (실패면 문구)
export function computeDayVoteResolveAckPatch(response) {
  if (response?.ok) {
    return {
      status: "resolved",
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
// 마감 시각 값 검사 (양수 숫자)
function isValidDeadline(value) {
  return Number.isFinite(value) && value > 0
}

export function parseDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex })) return null
  if (!RESOLVED_PHASES.has(payload.phase)) return null
  if (!RESOLVED_OUTCOMES.has(payload.outcome)) return null
  if (!isNonNegativeInteger(payload.publicVoteCount)) return null
  if (!isNonNegativeInteger(payload.publicAbstainCount)) return null
  if (payload.publicAbstainCount > payload.publicVoteCount) return null
  const roundFields = parseDayVoteRoundFields(payload)
  if (!roundFields) return null
  // 실제로 누군가를 찍은 표 수 (publicVoteCount는 산 사람 수라 기권 포함) → 7명 중 1기권이면 6
  const castCount = payload.publicVoteCount - payload.publicAbstainCount

  // 재판: 피고가 있고, 최다 득표가 기권보다 많으니 찍은 표도 기권보다 많음
  if (payload.outcome === "TRIBUNAL") {
    if (payload.phase !== "TRIBUNAL") return null
    if (typeof payload.tribunalTargetUuid !== "string" || payload.tribunalTargetUuid.length === 0) return null
    if (castCount <= payload.publicAbstainCount) return null
  // 동표: 밤으로, 피고 없음, 재판과 같은 까닭으로 찍은 표가 기권보다 많음
  } else if (payload.outcome === "TIE") {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (castCount <= payload.publicAbstainCount) return null
  // 기권 많음: 밤으로, 피고 없음, 찍은 표·기권 둘 다 1개 이상
  } else if (payload.outcome === "ABSTAIN_MAJORITY") {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (castCount < 1 || payload.publicAbstainCount < 1) return null
  // 전원 기권: 밤으로, 피고 없음, 찍은 표 0개
  } else {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (castCount !== 0) return null
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
    // 재판 마감 시각은 실려 왔고 맞는 값일 때만 (없으면 스냅샷이 채움)
    ...(payload.outcome === "TRIBUNAL" && isValidDeadline(payload.tribunalDeadline)
      ? { tribunalDeadline: payload.tribunalDeadline }
      : {}),
  }
}

// 무효화 조각 (화면이 내려갔으면 null)
export function computeDayVoteResolveInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, resolution: null }
}

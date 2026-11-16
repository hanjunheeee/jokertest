// 재판 판정 반영 계산: 재판 결과 사건으로 바뀔 조각 만들기 (상태는 안 건드림)
// 투표 결과 액션(voteActions의 applyTribunalResolved)이 사용
import { normalizePublicWinResult, readResultClosesAtField } from "../utils/normalizePublicWinResult.js"
import { isNonNegativeInteger } from "../../shared/utils/valueChecks.js"

// 정상 판정 결과 값
const RESOLVED_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

// 재판 취소 값과 받아 주는 취소 이유 (옛 값: 지금 서버는 피고가 나가도 피고 사망으로 보냄, 받기만 남겨 둠)
const CANCELLED_OUTCOME = "CANCELLED"
const TRIBUNAL_CANCEL_REASONS = new Set(["DEFENDANT_LEFT"])

// 재판 도중 피고가 스스로 나갔거나 끊겨 60초 안에 못 돌아와 죽음 (재판 취소가 아니라 피고 사망으로 닫힘, 사용자 결정 2026-11-16)
const DEFENDANT_DIED_OUTCOME = "DEFENDANT_DIED"

// 판 끝 명단 → uuid별 생존 (모양 틀림·중복·지금 명단과 사람 다르면 null)
function readAliveByUuid(players, canonicalUuids) {
  const aliveByUuid = new Map()
  for (const p of players) {
    if (p === null || typeof p !== "object" || Array.isArray(p)) return null
    if (typeof p.uuid !== "string" || p.uuid.length === 0) return null
    if (typeof p.isAlive !== "boolean") return null
    if (aliveByUuid.has(p.uuid)) return null
    aliveByUuid.set(p.uuid, p.isAlive)
  }
  if (aliveByUuid.size !== canonicalUuids.size) return null
  for (const uuid of aliveByUuid.keys()) {
    if (!canonicalUuids.has(uuid)) return null
  }
  return aliveByUuid
}

// 표 수 칸이 깨졌는지: 서버가 이제 안 보내 없어도 되지만, 실려 왔는데 모양이 틀리면 깨진 알림으로 보고 버림
function hasBrokenCounts(payload) {
  if (!Object.hasOwn(payload, "counts")) return false
  const counts = payload.counts
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return true
  return !isNonNegativeInteger(counts.guilty) || !isNonNegativeInteger(counts.notGuilty)
}

// 취소/피고 사망·판 끝·밤으로·같은 단계 머묾 넷으로 나눠 반영 (하나라도 안 맞으면 그대로)
// 표 수·처형된 사람 직업은 서버가 안 보냄 (실려 와도 판 상태에 안 넣음, 사용자 결정 2026-11-16)
export function applyTribunalResolvedPure(current, payload) {
  // 사건 모양: 판 id·날짜·단계·피고
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
  if (!Number.isInteger(payload.dayIndex)) return current
  if (typeof payload.phase !== "string") return current
  if (typeof payload.defendantUuid !== "string" || payload.defendantUuid.length === 0) return current

  // 재판 취소(옛 값)·피고 사망(피고가 나감·끊긴 피고 60초 지남): 밤으로 가고 처형 없음, 지금 그 피고 재판 중일 때만
  // 둘 다 피고는 죽은 것으로 둠, 화면이 둘을 가를 땐 알림의 outcome 값으로
  const isCancelled = payload.outcome === CANCELLED_OUTCOME
  if (isCancelled || payload.outcome === DEFENDANT_DIED_OUTCOME) {
    if (payload.phase !== "NIGHT") return current
    if (isCancelled && !TRIBUNAL_CANCEL_REASONS.has(payload.reason)) return current
    if (payload.executedUuid !== null) return current
    if (hasBrokenCounts(payload)) return current

    if (!current.gameId || !current.state) return current
    if (payload.gameId !== current.gameId) return current
    if (payload.dayIndex !== current.state.dayIndex) return current
    if (current.state.phase !== "TRIBUNAL") return current
    if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

    // 피고는 판에서 빠짐: 사망 방송을 놓쳤어도 죽은 것으로 둠 (다음 밤 결과의 죽은 사람 수 맞추기)
    const nextCancelPlayers = (current.state.players ?? []).map((p) =>
      (p.uuid === payload.defendantUuid && p.alive !== false ? { ...p, alive: false } : p))

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
        // 재판을 벗어나니 옛 재판 마감 시각 비움
        tribunalDeadline: null,
        players: nextCancelPlayers,
      },
    }
  }

  // 유죄·무죄만, 유죄면 처형된 사람 = 피고, 무죄면 처형 없음
  if (!RESOLVED_OUTCOMES.has(payload.outcome)) return current
  if (hasBrokenCounts(payload)) return current

  if (payload.executedUuid !== null && (typeof payload.executedUuid !== "string" || payload.executedUuid.length === 0)) return current
  if (payload.outcome === "GUILTY" && payload.executedUuid !== payload.defendantUuid) return current
  if (payload.outcome === "NOT_GUILTY" && payload.executedUuid !== null) return current

  // 지금 판·같은 날·같은 피고일 때만
  if (!current.gameId || !current.state) return current
  if (payload.gameId !== current.gameId) return current
  if (payload.dayIndex !== current.state.dayIndex) return current
  if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

  // 판 끝남: 재판 중이고 승패 결과가 제대로 왔을 때만
  if (payload.phase === "ENDED") {
    if (current.state.phase !== "TRIBUNAL") return current
    if (!Array.isArray(payload.players)) return current
    if (!Object.hasOwn(payload, "winResult") || payload.winResult === null) {
      return current
    }
    const winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) {
      return current
    }

    // 명단 검사: 항목 모양, 같은 사람 두 번 없이 지금 명단과 똑같은 사람들
    const canonicalUuids = new Set((current.state.players ?? []).map((p) => p.uuid))

    const aliveByUuid = readAliveByUuid(payload.players, canonicalUuids)
    if (aliveByUuid === null) return current

    // 생존은 사건 값으로 덮고 재판 결과·승패 결과 기록
    const nextEndedPlayers = (current.state.players ?? []).map((p) => ({ ...p, alive: aliveByUuid.get(p.uuid) }))

    return {
      state: {
        ...current.state,
        phase: "ENDED",
        tribunal: {
          ...current.state.tribunal,
          outcome: payload.outcome,
          executedUuid: payload.executedUuid,
          resolved: true,
        },
        players: nextEndedPlayers,
        winResult,
        // 결과 화면 닫힘 시각 (판 끝 칸 맨 위, 없으면 null)
        resultClosesAt: readResultClosesAtField(payload),
      },
    }
  }

  // 밤으로: 재판 중일 때만, 처형된 사람만 죽이고 재판 상태 지움
  if (payload.phase === "NIGHT") {
    if (current.state.phase !== "TRIBUNAL") return current

    const nextNightPlayers =
      payload.executedUuid === null
        ? current.state.players
        : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
        // 재판을 벗어나니 옛 재판 마감 시각 비움
        tribunalDeadline: null,
        players: nextNightPlayers,
      },
    }
  }

  // 그 밖엔 단계가 같을 때만, 처형 반영하고 재판 결과 기록 (재판 상태는 남김)
  if (payload.phase !== current.state.phase) return current

  const nextPlayers =
    payload.executedUuid === null
      ? current.state.players
      : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

  return {
    state: {
      ...current.state,
      tribunal: {
        ...current.state.tribunal,
        outcome: payload.outcome,
        executedUuid: payload.executedUuid,
        resolved: true,
      },
      players: nextPlayers,
    },
  }
}

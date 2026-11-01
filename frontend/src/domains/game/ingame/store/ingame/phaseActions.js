// 단계 진행 액션 묶음: 첫 단계 넘어감·사망·밤 결과 적용·밤 차례·낮 단계
// 입구 파일이 create 할 때 펼쳐 씀, 소켓 사건은 판 진행 이벤트 훅이 파싱해서 넘김
import {
  CLEARED_NIGHT_PRIVATE_RESULT,
  CLEARED_NIGHT_TURN,
} from "../../constants/store/ingameStore.js"
import { applyPlayerEliminatedPure } from "../applyPlayerEliminated.js"
import { clearQueue } from "./nightSuccessRecords.js"
import { commitWithReceipt } from "./receiptScope.js"

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const hasGameId = (value) => typeof value.gameId === "string" && value.gameId.trim().length > 0

// uuid별 생존 값으로 명단 덮기 (값이 없는 사람은 그대로)
function mergeAlive(players, aliveByUuid) {
  return players.map((p) => (aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p))
}

export const phaseActions = (set) => ({
  // 역할 공개 끝나고 첫 단계로 넘어감 (첫 낮, 또는 옛 방식의 0일 밤만)
  applyPhaseChanged: (payload) =>
    set((current) => {
      if (!isPlainObject(payload)) return current
      if (!hasGameId(payload)) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      const isFirstDay = payload.phase === "DAY" && payload.dayIndex === 1
      const isLegacyFirstNight = payload.phase === "NIGHT" && payload.dayIndex === 0
      if (!isFirstDay && !isLegacyFirstNight) return current

      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: isFirstDay ? "DAY_DISCUSSION" : null,
        },
        ...(isLegacyFirstNight ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...clearQueue() } : {}),
      }
    }),

  // 사망 반영 (계산은 applyPlayerEliminatedPure)
  applyPlayerEliminated: (parsed, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => applyPlayerEliminatedPure(current, parsed)),

  // 밤 결과 적용: 끝났으면 ENDED로, 아니면 다음 낮 토론으로
  applyNightResultAppliedPayload: (payload, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => {
      if (!isPlainObject(payload)) return current
      if (!hasGameId(payload)) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase === "ENDED") return current

      // 판 끝남: 날짜가 뒤로 가지 않을 때만, 생존은 isAlive로 받음
      if (payload.phase === "ENDED") {
        if (!Number.isInteger(payload.dayIndex)) return current
        if (!Array.isArray(payload.players)) return current
        if (payload.dayIndex < current.state.dayIndex) return current

        const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.isAlive]))
        return {
          state: {
            ...current.state,
            phase: "ENDED",
            dayIndex: payload.dayIndex,
            dayPhase: null,
            ...CLEARED_NIGHT_TURN,
            players: mergeAlive(current.state.players, aliveByUuid),
            ...(payload.winResult ? { winResult: payload.winResult } : {}),
          },
        }
      }

      // 다음 낮: 날짜가 앞으로 갈 때만, 투표 회차·제외·판정 초기화
      if (payload.phase !== "DAY") return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!Array.isArray(payload.players)) return current
      if (payload.dayIndex <= current.state.dayIndex) return current

      const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.alive]))
      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: "DAY_DISCUSSION",
          dayVoteRound: 1,
          dayVoteExcludedUuids: [],
          dayVoteResolution: null,
          ...CLEARED_NIGHT_TURN,
          players: mergeAlive(current.state.players, aliveByUuid),
        },
      }
    }),

  // 밤 역할 차례 시작 (같은 밤·같은 차례면 그대로, 차례가 오면 연출 대기는 끝)
  applyNightTurnStarted: (parsed) =>
    set((current) => {
      if (!isPlainObject(parsed)) return current
      if (!hasGameId(parsed)) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role.length === 0) return current
      if (!Number.isFinite(parsed.deadline) || parsed.deadline <= 0) return current
      if (current.state.nightTurnRole === parsed.role && current.state.nightTurnDeadline === parsed.deadline) {
        return current
      }

      return {
        state: { ...current.state, nightTurnRole: parsed.role, nightTurnDeadline: parsed.deadline },
        ...(current.nightPresentationWait !== null ? { nightPresentationWait: null } : {}),
      }
    }),

  // 밤 역할 차례 끝 (지금 차례인 역할일 때만 비움)
  applyNightTurnEnded: (parsed) =>
    set((current) => {
      if (!isPlainObject(parsed)) return current
      if (!hasGameId(parsed)) return current
      if (!current.gameId || !current.state || parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role !== current.state.nightTurnRole) return current

      return { state: { ...current.state, ...CLEARED_NIGHT_TURN } }
    }),

  // 낮 토론 → 투표 (그 낮일 때 한 번만)
  applyDayPhaseChanged: (parsed) =>
    set((current) => {
      if (!isPlainObject(parsed)) return current
      if (!hasGameId(parsed)) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (parsed.dayPhase !== "DAY_VOTE") return current
      if (current.state.dayPhase === "DAY_VOTE") return current

      return { state: { ...current.state, dayPhase: "DAY_VOTE" } }
    }),
})

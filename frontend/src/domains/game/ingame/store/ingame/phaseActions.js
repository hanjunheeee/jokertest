// 단계 진행 액션 묶음: 첫 단계 넘어감·사망·밤 결과 적용(낮 시작 연출 같이)·밤 차례·낮 단계 (낮 마감 시각 같이 반영)
// 입구가 create 때 펼쳐 씀, 판 진행 손잡이가 사건을 넘김 (첫 단계만 파싱 없이)
import {
  CLEARED_DAWN_REPORT,
  CLEARED_DAY_PHASE_TIMER,
  CLEARED_NIGHT_PRIVATE_RESULT,
  CLEARED_NIGHT_TURN,
} from "../../constants/store/ingameStore.js"
import { parseDayPhaseDeadlineField } from "../../utils/dayPhase.js"
import { buildDawnReport, readDawnKilledUuids } from "../../utils/dawnReport.js"
import { applyPlayerEliminatedPure } from "../applyPlayerEliminated.js"
import { clearLastDaySubmissions, clearSelfActed } from "../../utils/store/selfActed.js"
import { commitWithReceipt } from "./receiptScope.js"

// 사건 모양 검사용 (객체인지·판 id가 있는지)
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const hasGameId = (value) => typeof value.gameId === "string" && value.gameId.trim().length > 0

// uuid별 생존 값으로 명단 덮기 (값이 없는 사람은 그대로)
// 광대에게 죽은 사람은 nightKilled 표시 (모바일 채팅 알림 줄이 "살해당했습니다"로 씀)
function mergeAlive(players, aliveByUuid, killedUuids = new Set()) {
  return players.map((p) => {
    if (!aliveByUuid.has(p.uuid)) return p
    const next = { ...p, alive: aliveByUuid.get(p.uuid) }
    if (killedUuids.has(p.uuid)) next.nightKilled = true
    return next
  })
}

// 밤 결과 → 낮 시작 연출 (그 밤 날짜·넣기 전 명단으로 닉네임 찾음)
function readDawnReport(current, payload) {
  return buildDawnReport({
    gameId: current.gameId,
    nightDayIndex: current.state.dayIndex,
    victimUuid: payload.victimUuid ?? null,
    deathReveals: payload.deathReveals,
    doctorSaved: payload.doctorSaved === true,
    players: current.state.players,
  })
}

export const phaseActions = (set) => ({
  // 역할 공개 끝나고 첫 단계로 넘어감 (첫 낮, 또는 옛 방식의 0일 밤만)
  applyPhaseChanged: (payload) =>
    set((current) => {
      // 지금 판이 역할 공개 중일 때만
      if (!isPlainObject(payload)) return current
      if (!hasGameId(payload)) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      const isFirstDay = payload.phase === "DAY" && payload.dayIndex === 1
      const isLegacyFirstNight = payload.phase === "NIGHT" && payload.dayIndex === 0
      if (!isFirstDay && !isLegacyFirstNight) return current

      // 첫 낮 마감 시각은 틀리면 거절, 옛 방식 밤이면 비움
      const dayPhaseDeadline = isFirstDay ? parseDayPhaseDeadlineField(payload) : undefined
      if (dayPhaseDeadline === null) return current

      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: isFirstDay ? "DAY_DISCUSSION" : null,
          ...clearSelfActed(current.state),
          ...(isFirstDay ? { dayPhaseDeadline: dayPhaseDeadline ?? null } : { ...CLEARED_DAY_PHASE_TIMER }),
        },
        ...(isLegacyFirstNight ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...CLEARED_DAWN_REPORT } : {}),
      }
    }),

  // 사망 반영 (계산은 applyPlayerEliminatedPure)
  applyPlayerEliminated: (parsed, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => applyPlayerEliminatedPure(current, parsed)),

  // 밤 결과 적용: 끝났으면 ENDED로, 아니면 다음 낮 토론으로
  // 낮 시작 연출도 같이 넣음 (판이 끝나도 넣음 → 연출 뒤 결과 화면, 보여 줄 것 없으면 비움)
  applyNightResultAppliedPayload: (payload, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => {
      // 지금 판이고 아직 안 끝났을 때만
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
        const dawnReport = readDawnReport(current, payload)
        return {
          state: {
            ...current.state,
            phase: "ENDED",
            dayIndex: payload.dayIndex,
            dayPhase: null,
            ...CLEARED_DAY_PHASE_TIMER,
            ...CLEARED_NIGHT_TURN,
            players: mergeAlive(current.state.players, aliveByUuid, readDawnKilledUuids(dawnReport)),
            ...(payload.winResult ? { winResult: payload.winResult } : {}),
            // 결과 화면 닫힘 시각 (파싱에서 이미 검사함, 없으면 null)
            resultClosesAt: payload.resultClosesAt ?? null,
          },
          dawnReport,
        }
      }

      // 다음 낮: 날짜가 앞으로 갈 때만, 투표 회차·제외·판정 초기화
      if (payload.phase !== "DAY") return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!Array.isArray(payload.players)) return current
      if (payload.dayIndex <= current.state.dayIndex) return current

      // 새 낮 토론 마감 시각 (틀리면 거절, 없으면 비움)
      const dayPhaseDeadline = parseDayPhaseDeadlineField(payload)
      if (dayPhaseDeadline === null) return current

      const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.alive]))
      const dawnReport = readDawnReport(current, payload)
      // 지난 날 내 낮 표·재판 표 기록도 지움 (안 지우면 둘째 날 기권 버튼·재판 단추가 잠김)
      const stateWithoutVote = { ...current.state, ...clearLastDaySubmissions(current.state) }
      return {
        state: {
          ...stateWithoutVote,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: "DAY_DISCUSSION",
          dayVoteRound: 1,
          dayVoteResolution: null,
          dayPhaseDeadline: dayPhaseDeadline ?? null,
          ...CLEARED_NIGHT_TURN,
          ...clearSelfActed(stateWithoutVote),
          players: mergeAlive(current.state.players, aliveByUuid, readDawnKilledUuids(dawnReport)),
        },
        dawnReport,
      }
    }),

  // 밤 역할 차례 시작 (같은 밤·같은 차례면 그대로)
  applyNightTurnStarted: (parsed) =>
    set((current) => {
      // 지금 판의 그 날이고 역할·마감 값이 제대로일 때만
      if (!isPlainObject(parsed)) return current
      if (!hasGameId(parsed)) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      // 밤 첫 차례 방송이 낮 판정 방송보다 먼저 올 수 있어 같은 날 낮이면 받아 둠 (안 그러면 첫 차례 타이머가 00:00에 멈춤)
      const phase = current.state.phase
      const phaseAcceptsTurn =
        phase === "NIGHT"
        || (phase === "DAY" && current.state.dayIndex === parsed.dayIndex)
      if (!phaseAcceptsTurn) return current
      if (typeof parsed.role !== "string" || parsed.role.length === 0) return current
      if (!Number.isFinite(parsed.deadline) || parsed.deadline <= 0) return current
      if (current.state.nightTurnRole === parsed.role && current.state.nightTurnDeadline === parsed.deadline) {
        return current
      }

      return {
        state: { ...current.state, nightTurnRole: parsed.role, nightTurnDeadline: parsed.deadline },
      }
    }),

  // 밤 역할 차례 끝 (지금 차례인 역할일 때만 비움)
  applyNightTurnEnded: (parsed) =>
    set((current) => {
      // 지금 판의 그 밤일 때만
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
      // 지금 판의 그 낮이고 아직 토론 중일 때만
      if (!isPlainObject(parsed)) return current
      if (!hasGameId(parsed)) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (parsed.dayPhase !== "DAY_VOTE") return current
      if (current.state.dayPhase === "DAY_VOTE") return current

      // 투표 마감 시각은 실려 왔을 때만 바꿈 (틀리면 거절)
      const nextState = { ...current.state, dayPhase: "DAY_VOTE", ...clearSelfActed(current.state) }
      const dayPhaseDeadline = parseDayPhaseDeadlineField(parsed)
      if (dayPhaseDeadline === null) return current
      if (dayPhaseDeadline !== undefined) nextState.dayPhaseDeadline = dayPhaseDeadline

      return { state: nextState }
    }),
})

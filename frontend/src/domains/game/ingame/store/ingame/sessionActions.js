// 판 정보 액션 묶음: 판 시작 정보·참여 바뀜·본인 진행·종료 결과 무효화·오류·비우기
// 입구 파일이 create 할 때 펼쳐 씀
import {
  CLEARED_NIGHT_PRIVATE_RESULT,
  SELF_SUBMISSION_KEYS,
} from "../../constants/store/ingameStore.js"
import { isPublicProgress, normalizeGameState, pickHostUuid } from "../../utils/store/gamePayload.js"
import { clearQueue } from "./nightSuccessRecords.js"
import { isConfirmedWin } from "./terminalScope.js"

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

export const sessionActions = (set) => ({
  // 판 시작 정보 넣기 (다른 판으로 바뀌면 밤 개인 결과·성공 연출·연출 대기를 비움)
  setGamePayload: ({ gameId, state, hostUuid }) =>
    set((current) => {
      const nextGameId = gameId ?? state?.id ?? null
      return {
        gameId: nextGameId,
        state: normalizeGameState(state),
        hostUuid: pickHostUuid(state, hostUuid),
        error: null,
        snapshotResultOwner: null,
        ...(nextGameId !== current.gameId
          ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...clearQueue(), nightPresentationWait: null }
          : {}),
      }
    }),

  // 참여 여부 바뀜 반영 (더 새 버전이고, 지금 명단과 정확히 같은 사람들일 때만)
  applyParticipationChanged: (payload) =>
    set((current) => {
      if (!isPlainObject(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      if (payload.participationRevision <= (current.state.participationRevision ?? 0)) return current
      if (!Array.isArray(payload.players) || payload.players.length === 0) return current

      // 항목 모양 검사, 같은 사람 두 번이면 거절
      const byUuid = new Map()
      for (const entry of payload.players) {
        if (!isPlainObject(entry)) return current
        if (typeof entry.uuid !== "string" || entry.uuid.length === 0) return current
        if (typeof entry.isParticipating !== "boolean") return current
        if (byUuid.has(entry.uuid)) return current
        byUuid.set(entry.uuid, entry.isParticipating)
      }
      // 지금 명단과 사람 수·얼굴이 같아야 함
      const roster = new Set((current.state.players ?? []).map((p) => p.uuid))
      if (byUuid.size !== roster.size) return current
      for (const uuid of byUuid.keys()) {
        if (!roster.has(uuid)) return current
      }

      // 방장이 같이 오면 바꾸고, 아니면 그대로
      const nextHostUuid = typeof payload.hostUuid === "string" && payload.hostUuid.length > 0
        ? payload.hostUuid
        : current.hostUuid

      return {
        hostUuid: nextHostUuid,
        state: {
          ...current.state,
          hostUuid: nextHostUuid,
          participationRevision: payload.participationRevision,
          players: (current.state.players ?? []).map((p) => ({
            ...p,
            isParticipating: byUuid.get(p.uuid),
          })),
          ...(isPublicProgress(payload.progress)
            ? { progress: { ...payload.progress } }
            : {}),
        },
      }
    }),

  // 본인 제출 상태 반영 (참여 버전이 뒤처지지 않고, 진행 순번이 더 새 것일 때만)
  applySelfProgress: (payload) =>
    set((current) => {
      if (!isPlainObject(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      if (payload.participationRevision < (current.state.participationRevision ?? 0)) return current
      if (!isPlainObject(payload.self)) return current

      // 순번이 오면 더 커야 하고, 안 오면 아직 순번을 받은 적 없을 때만
      const appliedSeq = current.state.selfProgressSeq ?? 0
      const incomingSeq = payload.selfProgressSeq
      if (Number.isInteger(incomingSeq)) {
        if (incomingSeq <= appliedSeq) return current
      } else if (appliedSeq > 0) {
        return current
      }

      // 제출 상태 키만 골라 덮음
      const nextSelf = { ...current.state.self }
      for (const key of SELF_SUBMISSION_KEYS) {
        if (Object.hasOwn(payload.self, key)) nextSelf[key] = payload.self[key]
      }

      return {
        state: {
          ...current.state,
          self: nextSelf,
          ...(Number.isInteger(incomingSeq) ? { selfProgressSeq: incomingSeq } : {}),
          ...(isPublicProgress(payload.progress) ? { progress: { ...payload.progress } } : {}),
        },
      }
    }),

  // 지금 범위에서 확정되지 않은 승패 결과는 지움 (재결속 실패 때 옛 계정 결과로 이동 막기)
  invalidateUnconfirmedTerminalResult: (currentScope = null) =>
    set((current) => {
      if (!current.gameId || !current.state) return current
      if (current.state.phase !== "ENDED") return current
      if (!current.state.winResult) return current
      if (isConfirmedWin(current.state.winResult, currentScope, current)) return current
      return { state: { ...current.state, winResult: null } }
    }),

  setGameError: (error) => set({ error }),

  // 판 정보 전부 비우기
  clearGame: () =>
    set({
      gameId: null, state: null, hostUuid: null, error: null,
      snapshotResultOwner: null,
      ...CLEARED_NIGHT_PRIVATE_RESULT,
      ...clearQueue(),
      nightPresentationWait: null,
    }),
})

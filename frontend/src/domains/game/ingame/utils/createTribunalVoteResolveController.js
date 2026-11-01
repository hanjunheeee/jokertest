// 재판 판정 요청 컨트롤러: 한 번에 하나만 보내고, 시간 초과·옛 응답을 걸러 상태를 정함
// 재판 판정 훅(useInGameTribunalVoteResolve)이 사용, 보내기는 socket/tribunal.js가 맡음
import { emitResolveTribunal } from "../socket/tribunal.js"

// 응답 기다리는 시간 (넘으면 시간 초과 문구)
export const ACK_TIMEOUT_MS = 5000

// 판정 요청 처음 상태 (훅도 처음 값으로 씀)
export const INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE = {
  status: "idle",
  error: null,
  outcome: null,
  counts: null,
  executedUuid: null,
}

// 시간 초과·응답 없음·응답 모양 틀림 때 상태 조각
const TIMEOUT_PATCH = { status: "idle", error: "요청 시간이 초과되었습니다.", outcome: null, counts: null, executedUuid: null }
const NO_ACK_PATCH = { status: "idle", error: "요청에 응답하지 않습니다. 다시 시도해주세요.", outcome: null, counts: null, executedUuid: null }
const MALFORMED_ACK_PATCH = { status: "idle", error: "판정하지 못했습니다. 다시 시도해주세요.", outcome: null, counts: null, executedUuid: null }

// 판정 결과로 받는 값 (유죄·무죄)
const VALID_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

// 판정 응답 검사 → 상태 조각 (모양이 틀리면 null)
function computeResolveAckPatch(response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return null

  // 성공: 판·날짜·결과·표 수, 유죄면 처형자가 있고 무죄면 없어야 함
  if (response.ok === true) {
    if (typeof response.gameId !== "string" || response.gameId.trim().length === 0) return null
    if (!Number.isInteger(response.dayIndex)) return null
    if (!VALID_OUTCOMES.has(response.outcome)) return null
    const counts = response.counts
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null
    if (!Number.isInteger(counts.guilty) || counts.guilty < 0) return null
    if (!Number.isInteger(counts.notGuilty) || counts.notGuilty < 0) return null
    if (response.outcome === "GUILTY" && (typeof response.executedUuid !== "string" || response.executedUuid.length === 0)) return null
    if (response.outcome === "NOT_GUILTY" && response.executedUuid !== null) return null
    return {
      status: "resolved",
      error: null,
      outcome: response.outcome,
      counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
      executedUuid: response.executedUuid,
    }
  }

  // 실패: 서버 문구, 없으면 기본 문구
  const message =
    typeof response.message === "string" && response.message.trim().length > 0
      ? response.message
      : "판정하지 못했습니다. 다시 시도해주세요."
  return { status: "idle", error: message, outcome: null, counts: null, executedUuid: null }
}

// 컨트롤러 만들기 (상태는 안에 들고, 바뀔 때마다 onStateChange로 알림)
export function createTribunalVoteResolveController({ getSocket, timeoutMs = ACK_TIMEOUT_MS, onStateChange, getLatestContext }) {
  let state = INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE
  let resolving = false
  let generation = 0
  let activeTimer = null
  let disposed = false

  // 상태 바꾸고 알림 (버린 뒤엔 알리지 않음)
  const setState = (next) => {
    state = next
    if (!disposed) onStateChange?.(state)
  }

  // 걸려 있는 시간 초과 타이머 끄기
  const clearActiveTimer = () => {
    if (activeTimer !== null) {
      clearTimeout(activeTimer)
      activeTimer = null
    }
  }

  return {
    getState() {
      return state
    },

    // 판정 요청: 버렸거나 요청 중·이미 판정됐거나 연결이 없으면 막기
    resolve({ gameId, dayIndex, phase, actorUuid, defendantUuid }) {
      if (disposed) return
      if (resolving) return
      if (state.status !== "idle") return

      const requestSocket = getSocket?.()
      if (!requestSocket || !requestSocket.connected) return

      resolving = true
      generation += 1
      const requestGeneration = generation
      let settled = false

      setState({ ...state, status: "resolving", error: null })

      // 버렸거나 더 새 요청이 있거나 소켓이 바뀌거나 끊겼으면 옛 요청
      const isSocketStale = () =>
        disposed || requestGeneration !== generation || requestSocket !== getSocket?.() || !requestSocket.connected

      // 판·날짜·단계·요청한 사람·피고가 바뀌었으면 옛 요청
      const isContextStale = () => {
        const latest = getLatestContext?.() ?? {}
        if (latest.gameId !== gameId) return true
        if (latest.dayIndex !== dayIndex) return true
        if (latest.phase !== phase) return true
        if (latest.actorUuid !== actorUuid) return true
        if (latest.defendantUuid !== defendantUuid) return true
        return false
      }

      // 실패로 한 번만 정함 (옛 요청이면 무시)
      const settleFailure = (patch) => {
        if (settled) return
        if (isSocketStale()) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        resolving = false
        setState(patch)
      }

      // 성공으로 한 번만 정함 (응답의 판·날짜가 요청과 같아야 함)
      const settleSuccess = (patch, ackGameId, ackDayIndex) => {
        if (settled) return
        if (isSocketStale()) return
        if (ackGameId !== gameId || ackDayIndex !== dayIndex) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        resolving = false
        setState(patch)
      }

      // 시간 초과면 실패
      activeTimer = setTimeout(() => settleFailure(TIMEOUT_PATCH), timeoutMs)

      // 응답 모양이 틀리면 실패 문구, 아니면 성공·실패대로 정함, 응답이 없으면 실패
      emitResolveTribunal(requestSocket, gameId, dayIndex)
        .then((ackResult) => {
          const patch = computeResolveAckPatch(ackResult)
          if (patch === null) {
            settleFailure(MALFORMED_ACK_PATCH)
            return
          }
          if (ackResult.ok === true) {
            settleSuccess(patch, ackResult.gameId, ackResult.dayIndex)
          } else {
            settleFailure(patch)
          }
        })
        .catch(() => settleFailure(NO_ACK_PATCH))
    },

    // 판·연결이 바뀌면 요청 버리고 처음 상태로 되돌림
    invalidate(_reason) {
      if (disposed) return
      generation += 1
      resolving = false
      clearActiveTimer()
      setState(INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE)
    },

    // 훅이 내려갈 때: 요청 버리고 더는 알리지 않음
    dispose() {
      if (disposed) return
      generation += 1
      resolving = false
      clearActiveTimer()
      disposed = true
    },
  }
}

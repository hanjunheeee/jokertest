export const TRIBUNAL_VOTE_RESOLVE_ACK_TIMEOUT_MS = 5000

export const INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE = {
  status: "idle",
  error: null,
  outcome: null,
  counts: null,
  executedUuid: null,
}

const TIMEOUT_PATCH = { status: "idle", error: "요청 시간이 초과되었습니다.", outcome: null, counts: null, executedUuid: null }
const NO_ACK_PATCH = { status: "idle", error: "요청에 응답하지 않습니다. 다시 시도해주세요.", outcome: null, counts: null, executedUuid: null }
const MALFORMED_ACK_PATCH = { status: "idle", error: "판정하지 못했습니다. 다시 시도해주세요.", outcome: null, counts: null, executedUuid: null }

const VALID_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function computeResolveAckPatch(response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return null

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

  const message =
    typeof response.message === "string" && response.message.trim().length > 0
      ? response.message
      : "판정하지 못했습니다. 다시 시도해주세요."
  return { status: "idle", error: message, outcome: null, counts: null, executedUuid: null }
}

/**
 * TRIBUNAL 판정 요청(resolve_tribunal_vote)의 경쟁 조건 방어를 전담하는 프레임워크 무관
 * 컨트롤러. createTribunalVoteSubmitController와 동일한 계약(socket identity 캡처, generation,
 * 요청 시점 context vs settle 시점 최신 context 비교)을 따르되, 판정은 게임당 한 번만
 * 유효하므로 성공 시 status를 'resolved'로 잠그고 이후 resolve() 호출은 전부 no-op이다
 * (제출과 달리 재판정을 허용하지 않는다).
 */
export function createTribunalVoteResolveController({ getSocket, timeoutMs = TRIBUNAL_VOTE_RESOLVE_ACK_TIMEOUT_MS, onStateChange, getLatestContext }) {
  let state = INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE
  let resolving = false
  let generation = 0
  let activeTimer = null
  let disposed = false

  const setState = (next) => {
    state = next
    if (!disposed) onStateChange?.(state)
  }

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

      const isSocketStale = () =>
        disposed || requestGeneration !== generation || requestSocket !== getSocket?.() || !requestSocket.connected

      const isContextStale = () => {
        const latest = getLatestContext?.() ?? {}
        if (latest.gameId !== gameId) return true
        if (latest.dayIndex !== dayIndex) return true
        if (latest.phase !== phase) return true
        if (latest.actorUuid !== actorUuid) return true
        if (latest.defendantUuid !== defendantUuid) return true
        return false
      }

      const settleFailure = (patch) => {
        if (settled) return
        if (isSocketStale()) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        resolving = false
        setState(patch)
      }

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

      activeTimer = setTimeout(() => settleFailure(TIMEOUT_PATCH), timeoutMs)

      requestSocket
        .emitWithAck("resolve_tribunal_vote", { gameId, dayIndex })
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

    invalidate(_reason) {
      if (disposed) return
      generation += 1
      resolving = false
      clearActiveTimer()
      setState(INITIAL_TRIBUNAL_VOTE_RESOLVE_STATE)
    },

    dispose() {
      if (disposed) return
      generation += 1
      resolving = false
      clearActiveTimer()
      disposed = true
    },
  }
}

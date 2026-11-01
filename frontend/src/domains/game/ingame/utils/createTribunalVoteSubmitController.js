// 재판 투표 제출 컨트롤러: 한 번에 하나만 보내고, 시간 초과·옛 응답을 걸러 상태를 정함
// 재판 투표 훅(useInGameTribunalVoteSubmit)이 사용, 보내기는 socket/tribunal.js가 맡음
import { emitTribunalVote } from "../socket/tribunal.js"
import { computeTribunalVoteAckPatch, INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE } from "./computeTribunalVoteSubmitPatch.js"

export const TRIBUNAL_VOTE_ACK_TIMEOUT_MS = 5000

const TIMEOUT_PATCH = { status: "idle", submittedVote: null, error: "요청 시간이 초과되었습니다." }
const NO_ACK_PATCH = { status: "idle", submittedVote: null, error: "요청에 응답하지 않습니다. 다시 시도해주세요." }
const MALFORMED_ACK_PATCH = { status: "idle", submittedVote: null, error: "제출하지 못했습니다. 다시 시도해주세요." }

export function createTribunalVoteSubmitController({ getSocket, timeoutMs = TRIBUNAL_VOTE_ACK_TIMEOUT_MS, onStateChange, getLatestContext, onAccepted }) {
  let state = INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE
  let submitting = false
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

    submit({ gameId, dayIndex, vote, defendantUuid, actorUuid }) {
      if (disposed) return
      if (submitting) return

      const requestSocket = getSocket?.()
      if (!requestSocket || !requestSocket.connected) return

      submitting = true
      generation += 1
      const requestGeneration = generation
      let settled = false

      setState({ ...state, status: "submitting", error: null })

      const isSocketStale = () =>
        disposed || requestGeneration !== generation || requestSocket !== getSocket?.() || !requestSocket.connected

      const isContextStale = () => {
        const latest = getLatestContext?.() ?? {}
        if (latest.gameId !== gameId) return true
        if (latest.dayIndex !== dayIndex) return true
        if (latest.phase !== "TRIBUNAL") return true
        if (latest.alive !== true) return true
        if (latest.defendantUuid !== defendantUuid) return true
        if (latest.actorUuid !== actorUuid) return true
        return false
      }

      const settleFailure = (patch) => {
        if (settled) return
        if (isSocketStale()) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
      }

      const settleSuccess = (patch, ackGameId, ackDayIndex, sfxEvent) => {
        if (settled) return
        if (isSocketStale()) return
        if (ackGameId !== gameId || ackDayIndex !== dayIndex) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
        if (sfxEvent !== null && typeof sfxEvent === "object") {
          try {
            onAccepted?.(sfxEvent, { gameId, dayIndex })
          } catch {
          }
        }
      }

      activeTimer = setTimeout(() => settleFailure(TIMEOUT_PATCH), timeoutMs)

      emitTribunalVote(requestSocket, gameId, dayIndex, vote)
        .then((ackResult) => {
          const patch = computeTribunalVoteAckPatch(ackResult)
          if (patch === null) {
            settleFailure(MALFORMED_ACK_PATCH)
            return
          }
          if (ackResult.ok === true) {
            settleSuccess(patch, ackResult.gameId, ackResult.dayIndex, ackResult.sfxEvent ?? null)
          } else {
            settleFailure(patch)
          }
        })
        .catch(() => settleFailure(NO_ACK_PATCH))
    },

    invalidate(_reason) {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      setState(INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE)
    },

    dispose() {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      disposed = true
    },
  }
}

import { computeDayVoteSubmitPatch, INITIAL_DAY_VOTE_SUBMIT_STATE } from "./computeDayVoteSubmitPatch.js"

export const ACK_TIMEOUT_MS = 5000

export function createDayVoteSubmitController({ emitWithAck, timeoutMs = ACK_TIMEOUT_MS, onStateChange, onAccepted }) {
  let state = INITIAL_DAY_VOTE_SUBMIT_STATE
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

    submit({ gameId, dayIndex, targetId }) {
      if (disposed) return
      if (submitting) return

      submitting = true
      generation += 1
      const requestGeneration = generation
      let settled = false

      setState({ ...state, status: "submitting", error: null })

      const settleOnce = (patch) => {
        if (settled) return
        if (disposed) return
        if (requestGeneration !== generation) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
      }

      activeTimer = setTimeout(() => {
        settleOnce({
          status: "idle",
          error: { code: "ACK_TIMEOUT", message: "요청 시간이 초과되었습니다." },
          hasSubmitted: state.hasSubmitted,
          lastSubmittedTargetId: state.lastSubmittedTargetId,
        })
      }, timeoutMs)

      const notifyAccepted = (ackResult) => {
        if (ackResult?.ok !== true) return
        const sfxEvent = ackResult.sfxEvent
        if (sfxEvent === null || typeof sfxEvent !== "object") return
        try {
          onAccepted?.(sfxEvent, { gameId, dayIndex })
        } catch {
        }
      }

      emitWithAck({ gameId, dayIndex, targetId })
        .then((ackResult) => {
          const wasSettled = settled
          settleOnce(computeDayVoteSubmitPatch(state, ackResult, targetId))
          if (!wasSettled && settled) notifyAccepted(ackResult)
        })
        .catch((ackResult) => {
          settleOnce(computeDayVoteSubmitPatch(state, ackResult, targetId))
        })
    },

    invalidate(_reason) {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      setState(INITIAL_DAY_VOTE_SUBMIT_STATE)
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

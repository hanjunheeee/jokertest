import { computeDayVoteSubmitPatch, INITIAL_DAY_VOTE_SUBMIT_STATE } from "./computeDayVoteSubmitPatch.js"

/** useInGameNightActionSubmit의 SUBMIT_TIMEOUT_MS와 동일한 값(§11-3). */
export const DAY_VOTE_ACK_TIMEOUT_MS = 5000

/**
 * DAY 투표 제출의 경쟁 조건 방어를 전담하는 프레임워크 무관 컨트롤러. socket 하나에 바인딩되는
 * 1회용 객체다 — socket이 바뀌면 이 컨트롤러를 재사용하지 않고 dispose() 후 새로 만든다
 * (그 배선은 useInGameDayVoteSubmit의 책임).
 *
 * settle-once: 각 submit()은 자기 세대(requestGeneration)와 자기만의 settled 플래그를 갖는다.
 * emitWithAck의 resolve/reject와 timeout 중 먼저 도착한 하나만 상태를 바꾸고, 이후 도착하는
 * 모든 콜백(늦은 resolve, 늦은 timeout, 중복 resolve)은 no-op이다. invalidate()/dispose()는
 * generation을 올려 그 시점 이후의 모든 정착 시도를 무효화한다.
 */
export function createDayVoteSubmitController({ emitWithAck, timeoutMs = DAY_VOTE_ACK_TIMEOUT_MS, onStateChange }) {
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

      emitWithAck({ gameId, dayIndex, targetId })
        .then((ackResult) => {
          settleOnce(computeDayVoteSubmitPatch(state, ackResult, targetId))
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

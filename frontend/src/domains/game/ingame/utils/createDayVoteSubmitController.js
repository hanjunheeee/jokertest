// 낮 투표 제출 컨트롤러: 한 번에 하나만 보내고, 시간 초과·옛 응답을 걸러 상태를 정함
// 낮 투표 훅(useInGameDayVoteSubmit)이 사용, 보내기 함수는 훅이 넘김 (socket/day.js)
import { computeDayVoteSubmitPatch, INITIAL_DAY_VOTE_SUBMIT_STATE } from "./voteSubmitPatch.js"

// 응답 기다리는 시간 (넘으면 시간 초과 문구)
export const ACK_TIMEOUT_MS = 5000

// 컨트롤러 만들기 (상태는 안에 들고, 바뀔 때마다 onStateChange로 알림)
export function createDayVoteSubmitController({ emitWithAck, timeoutMs = ACK_TIMEOUT_MS, onStateChange, onAccepted }) {
  let state = INITIAL_DAY_VOTE_SUBMIT_STATE
  let submitting = false
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

    // 투표 보내기: 버렸거나 보내는 중이면 막기, 세대를 올려 이번 요청 응답만 받음
    submit({ gameId, dayIndex, targetId }) {
      if (disposed) return
      if (submitting) return

      submitting = true
      generation += 1
      const requestGeneration = generation
      let settled = false

      setState({ ...state, status: "submitting", error: null })

      // 결과는 한 번만 정함: 이미 정했거나 버렸거나 더 새 요청이 있으면 무시
      const settleOnce = (patch) => {
        if (settled) return
        if (disposed) return
        if (requestGeneration !== generation) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
      }

      // 시간 초과면 실패로 정하고 전에 낸 표는 그대로 둠
      activeTimer = setTimeout(() => {
        settleOnce({
          status: "idle",
          error: { code: "ACK_TIMEOUT", message: "요청 시간이 초과되었습니다." },
          hasSubmitted: state.hasSubmitted,
          lastSubmittedTargetId: state.lastSubmittedTargetId,
        })
      }, timeoutMs)

      // 받아들여졌고 효과음 봉투가 있을 때만 효과음 알림
      const notifyAccepted = (ackResult) => {
        if (ackResult?.ok !== true) return
        const sfxEvent = ackResult.sfxEvent
        if (sfxEvent === null || typeof sfxEvent !== "object") return
        try {
          onAccepted?.(sfxEvent, { gameId, dayIndex })
        } catch {
          // 효과음 알림 실패가 제출 결과 처리를 막지 않게 무시함
        }
      }

      // 응답을 상태 조각으로 정함, 이번에 처음 정했을 때만 효과음 알림
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

    // 판·연결이 바뀌면 보내던 요청 버리고 처음 상태로 되돌림
    invalidate(_reason) {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      setState(INITIAL_DAY_VOTE_SUBMIT_STATE)
    },

    // 훅이 내려갈 때: 요청 버리고 더는 알리지 않음
    dispose() {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      disposed = true
    },
  }
}

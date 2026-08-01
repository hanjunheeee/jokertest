import { computeTribunalVoteAckPatch, INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE } from "./computeTribunalVoteSubmitPatch.js"

export const TRIBUNAL_VOTE_ACK_TIMEOUT_MS = 5000

const TIMEOUT_PATCH = { status: "idle", submittedVote: null, error: "요청 시간이 초과되었습니다." }
const NO_ACK_PATCH = { status: "idle", submittedVote: null, error: "요청에 응답하지 않습니다. 다시 시도해주세요." }
const MALFORMED_ACK_PATCH = { status: "idle", submittedVote: null, error: "제출하지 못했습니다. 다시 시도해주세요." }

/**
 * TRIBUNAL 투표 제출의 경쟁 조건 방어를 전담하는 프레임워크 무관 컨트롤러. createDayVoteSubmitController와
 * 달리 socket identity를 직접 캡처한다(getSocket을 매 submit()마다 호출해 요청 시점 소켓을 고정) —
 * settle 시 성공·실패 ack(및 malformed 성공 ack) 모두 (1) generation 일치 (2) 소켓 identity 동일·
 * connected===true (3) 최신 컨텍스트(gameId/dayIndex/phase/생존 상태/정확한 defendantUuid/정확한
 * actorUuid) 전부 요청 시점 값과 일치할 때만 반영된다. 성공 ack는 추가로 (4) ack가 echo한
 * gameId/dayIndex가 요청과 일치해야 한다. defendantUuid와 actorUuid는 요청 시점에 submit()으로
 * 캡처해 latest.defendantUuid/latest.actorUuid와 정확히 동일성 비교한다 — isDefendant boolean만으로는
 * 로컬 플레이어가 이전/이후 피고인 어느 쪽도 아닌 채로 피고인이 바뀐 경우를 감지하지 못하고,
 * alive boolean만으로는 로컬 세션의 actor 자체가 바뀐(예: state.self.uuid 교체) 경우를 감지하지
 * 못하기 때문이다. isContextStale은 성공·실패 두 settle 경로 모두가 공유하므로 이 재검증은 둘
 * 다에 항상 적용된다.
 */
export function createTribunalVoteSubmitController({ getSocket, timeoutMs = TRIBUNAL_VOTE_ACK_TIMEOUT_MS, onStateChange, getLatestContext }) {
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

      const settleSuccess = (patch, ackGameId, ackDayIndex) => {
        if (settled) return
        if (isSocketStale()) return
        if (ackGameId !== gameId || ackDayIndex !== dayIndex) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
      }

      activeTimer = setTimeout(() => settleFailure(TIMEOUT_PATCH), timeoutMs)

      requestSocket
        .emitWithAck("cast_tribunal_vote", { gameId, dayIndex, vote })
        .then((ackResult) => {
          const patch = computeTribunalVoteAckPatch(ackResult)
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

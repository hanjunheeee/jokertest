// 재판 투표 제출 컨트롤러: 한 번에 하나만 보내고, 시간 초과·옛 응답을 걸러 상태를 정함
// 재판 투표 훅(useInGameTribunalVoteSubmit)이 사용, 보내기는 socket/tribunal.js가 맡음
import { emitTribunalVote } from "../socket/tribunal.js"
import {
  computeTribunalVoteAckPatch,
  INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE,
} from "./voteSubmitPatch.js"

// 응답 기다리는 시간 (넘으면 시간 초과 문구)
export const ACK_TIMEOUT_MS = 5000

// 시간 초과·응답 없음·응답 모양 틀림 때 상태 조각
const TIMEOUT_PATCH = { status: "idle", submittedVote: null, error: "요청 시간이 초과되었습니다." }
const NO_ACK_PATCH = { status: "idle", submittedVote: null, error: "요청에 응답하지 않습니다. 다시 시도해주세요." }
const MALFORMED_ACK_PATCH = { status: "idle", submittedVote: null, error: "제출하지 못했습니다. 다시 시도해주세요." }

// 컨트롤러 만들기 (상태는 안에 들고, 바뀔 때마다 onStateChange로 알림)
export function createTribunalVoteSubmitController({ getSocket, timeoutMs = ACK_TIMEOUT_MS, onStateChange, getLatestContext, onAccepted }) {
  let state = INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE
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

    // 투표 보내기: 버렸거나 보내는 중이거나 연결이 없으면 막기
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

      // 버렸거나 더 새 요청이 있거나 소켓이 바뀌거나 끊겼으면 옛 요청
      const isSocketStale = () =>
        disposed || requestGeneration !== generation || requestSocket !== getSocket?.() || !requestSocket.connected

      // 판·날짜·재판 단계·생존·피고·투표한 사람이 바뀌었으면 옛 요청
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

      // 실패로 한 번만 정함 (옛 요청이면 무시)
      const settleFailure = (patch) => {
        if (settled) return
        if (isSocketStale()) return
        if (isContextStale()) return
        settled = true
        clearActiveTimer()
        submitting = false
        setState(patch)
      }

      // 성공으로 한 번만 정함 (응답의 판·날짜가 맞아야 함), 효과음 봉투가 있으면 알림
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
            // 효과음 알림 실패가 제출 결과 처리를 막지 않게 무시함
          }
        }
      }

      // 시간 초과면 실패
      activeTimer = setTimeout(() => settleFailure(TIMEOUT_PATCH), timeoutMs)

      // 응답 모양이 틀리면 실패 문구, 아니면 성공·실패대로 정함, 응답이 없으면 실패
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

    // 판·연결이 바뀌면 요청 버리고 처음 상태로 되돌림
    invalidate(_reason) {
      if (disposed) return
      generation += 1
      submitting = false
      clearActiveTimer()
      setState(INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE)
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

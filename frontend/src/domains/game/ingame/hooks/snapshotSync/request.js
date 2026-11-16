// 스냅샷 묻기: 시도 예산 잡기, 묻기, 응답을 판 복구·스냅샷 반영으로 넘기기 (끊겨 판에서 빠졌으면 까닭 글 띄움)
// 스냅샷 동기화 훅(useInGameSessionSnapshotSync)이 effect마다 만듦, 묻기는 socket/session.js
import { useInGameStore } from "../../store/ingameStore.js"
import { useMatchingStore } from "../../../matching/store/matchingStore.js"
import { isSessionGoneResponse } from "../../utils/sessionEnd.js"
import { fetchSnapshot } from "../../socket/session.js"
import { openAttempt } from "./attempt.js"

// 한 번 묻기 시간 제한·다시 묻기 전체 시간 예산, 서버가 판을 찾는 중일 때 코드
const SESSION_SNAP_TIMEOUT_MS = 5000
const RETRY_BUDGET_MS = 5000
const SESSION_ROUTING_PENDING_CODE = "SESSION_ROUTING_PENDING"

// 서버가 아직 판을 못 찾았다는 응답
const isRoutingPending = (response) =>
  response !== null && typeof response === "object"
  && response.ok !== true && response.code === SESSION_ROUTING_PENDING_CODE

// 끊김 기다림(60초)이 지나 판에서 빠졌다는 거절 코드와 서버 글이 없을 때 쓸 글
const FORFEITED_CODE = "FORFEITED_FROM_SESSION"
const FORFEITED_FALLBACK_MESSAGE = "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."

// 까닭 글을 이미 띄운 계정 (판을 비우면 판 번호 없이 다시 묻는데, 그 답도 탈락이면 같은 글이 또 뜸)
let forfeitAlertedAuthUuid = null

// 끊겨서 판에서 빠졌으면 까닭 글을 알림 창으로 (안 띄우면 말없이 방 목록으로 가서 왜 나왔는지 모름)
// 띄웠으면 true
function alertIfForfeited(response) {
  if (response?.code !== FORFEITED_CODE) return false
  const message = typeof response.message === "string" && response.message.length > 0
    ? response.message
    : FORFEITED_FALLBACK_MESSAGE
  window.alert(message)
  return true
}

// 판이 있는데 서버가 판 없음이라 하면 판·방 정리 (끝난 판의 결과 화면은 그대로 둠)
// 화면 이동은 인게임 화면의 "맞는 판 아님" 검사가 맡음 (방 목록), 그 전에 빠진 까닭 글을 보여 줌
function clearGoneSession(ctx, requestGameId, response) {
  const { gameId, state } = useInGameStore.getState()
  if (gameId !== requestGameId) return
  if (state?.phase === "ENDED") return
  if (alertIfForfeited(response)) forfeitAlertedAuthUuid = ctx.authUuid
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
}

// 응답 반영: 옛 응답·길 찾는 중·판 없음·밤 관찰 충돌을 거르고, 판 없이 물었으면 복구, 아니면 반영
function applyResponse(ctx, a, response) {
  const scopeOnArrival = a.readScopeNow()
  if (a.isStaleNow()) {
    a.finishRebindUnapplied(scopeOnArrival)
    return
  }
  if (isRoutingPending(response) && a.scheduleRetry()) return
  if (a.requestGameId && isSessionGoneResponse(response)) {
    a.finishRebindUnapplied(scopeOnArrival)
    clearGoneSession(ctx, a.requestGameId, response)
    return
  }
  if (a.hasConflictingNightObservation(response)) {
    if (a.scheduleRetry()) return
    a.settleUnapplied()
    return
  }
  // 판 없이 물었으면 빈 스토어 채우기 (복구됐는지를 처음 확인 결과로 둠)
  if (!a.requestGameId) {
    if (response?.ok !== true) {
      a.finishRebindUnapplied(scopeOnArrival)
      // 방금 판을 비우며 이 계정에 띄운 글이면 또 안 띄움 (같은 판 탈락 안내는 1번), 탈락 아닌 답이 오면 띄운 기록을 지움
      const alreadyAlerted = forfeitAlertedAuthUuid === ctx.authUuid
      if (response?.code !== FORFEITED_CODE) forfeitAlertedAuthUuid = null
      else if (!alreadyAlerted) alertIfForfeited(response)
      ctx.setBootstrapStatus("missing")
      return
    }
    // 판을 다시 받았으면 띄운 기록을 지움 (다음 판에서 빠지면 그때 다시 띄움)
    forfeitAlertedAuthUuid = null
    useInGameStore.getState().bootstrapSessionSnapshot(response, a.receiptContext)
    const recovered = Boolean(useInGameStore.getState().gameId)
    if (recovered) {
      a.rememberFulfilled()
      a.finishRebindApplied(scopeOnArrival)
    } else {
      a.finishRebindUnapplied(scopeOnArrival)
    }
    ctx.setBootstrapStatus(recovered ? "recovered" : "missing")
    return
  }
  // 판에 있다는 답이면 띄운 기록을 지움 (이 판에서 빠지면 그때 다시 띄움)
  if (response?.ok === true) forfeitAlertedAuthUuid = null
  // 스냅샷 순번이 올라갔을 때만 반영된 것으로 봄
  const seqBefore = useInGameStore.getState().snapshotSeq
  useInGameStore.getState().applySessionSnapshot(response, a.receiptContext)
  if (useInGameStore.getState().snapshotSeq !== seqBefore) {
    a.rememberFulfilled()
    a.finishRebindApplied(scopeOnArrival)
    return
  }
  a.finishRebindUnapplied(scopeOnArrival)
}

// 스냅샷 묻기 함수 만들기 (같은 세대는 한 번만, 다시 묻기는 같은 예산 안에서)
export function createSnapshotRequester(ctx) {
  const requestSnapshot = ({ retry = false } = {}) => {
    const requestEpochVersion = ctx.epochVersionRef.current
    // 첫 묻기면 이 세대 몫 예산 새로 잡음 (이미 물은 세대면 막기)
    if (!retry) {
      if (ctx.requestedVersionRef.current === requestEpochVersion) return
      ctx.requestedVersionRef.current = requestEpochVersion
      ctx.cancelScheduledRetry()
      ctx.retryRef.current = {
        epoch: requestEpochVersion,
        attempts: 0,
        deadline: Date.now() + RETRY_BUDGET_MS,
        timerId: null,
      }
    }
    // 다른 세대 예산이면 막기, 시간 제한은 남은 예산을 넘지 않게
    const attemptBudget = ctx.retryRef.current
    if (attemptBudget.epoch !== requestEpochVersion) return
    attemptBudget.attempts += 1
    const ackTimeoutMs = Math.max(
      1, Math.min(SESSION_SNAP_TIMEOUT_MS, attemptBudget.deadline - Date.now()),
    )

    const a = openAttempt(ctx, {
      requestEpochVersion,
      attemptBudget,
      retry: () => requestSnapshot({ retry: true }),
    })

    // 묻다 터지거나 응답 없으면 다시 묻기, 못 하면 반영 못 하고 끝냄
    let ackPromise
    try {
      ackPromise = fetchSnapshot(a.requestSocket, ackTimeoutMs, a.requestGameId)
    } catch {
      if (!a.isStaleNow() && a.scheduleRetry()) return
      a.settleUnapplied()
      return
    }

    ackPromise
      .then((response) => applyResponse(ctx, a, response))
      .catch(() => {
        if (!a.isStaleNow() && a.scheduleRetry()) return
        a.settleUnapplied()
      })
  }
  return requestSnapshot
}

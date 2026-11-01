// 스냅샷 묻기: 시도 예산 잡기, 묻기, 응답을 판 복구·스냅샷 반영으로 넘기기
// 스냅샷 동기화 훅(useInGameSessionSnapshotSync)이 effect마다 만듦, 묻기는 socket/session.js
import { useInGameStore } from "../../store/ingameStore.js"
import { fetchSnapshot } from "../../socket/session.js"
import { openAttempt } from "./attempt.js"

const SESSION_SNAP_TIMEOUT_MS = 5000
const RETRY_BUDGET_MS = 5000
const SESSION_ROUTING_PENDING_CODE = "SESSION_ROUTING_PENDING"

// 서버가 아직 판을 못 찾았다는 응답
const isRoutingPending = (response) =>
  response !== null && typeof response === "object"
  && response.ok !== true && response.code === SESSION_ROUTING_PENDING_CODE

// 응답 반영: 옛 응답·길 찾는 중·밤 관찰 충돌을 거르고, 판 없이 물었으면 복구, 아니면 반영
function applyResponse(ctx, a, response) {
  const scopeOnArrival = a.readScopeNow()
  if (a.isStaleNow()) {
    a.finishRebindUnapplied(scopeOnArrival)
    return
  }
  if (isRoutingPending(response) && a.scheduleRetry()) return
  if (a.hasConflictingNightObservation(response)) {
    if (a.scheduleRetry()) return
    a.settleUnapplied()
    return
  }
  if (!a.requestGameId) {
    if (response?.ok !== true) {
      a.finishRebindUnapplied(scopeOnArrival)
      ctx.setBootstrapStatus("missing")
      return
    }
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

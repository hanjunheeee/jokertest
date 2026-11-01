// 판 나가기 보내기: 기다림 시작(시간 재기 포함), 나가기 요청 만들기·보내기
// 나가기 훅(useInGameExit)과 결과 조회가 사용 (ctx = 훅의 ref와 상태 바꾸기 묶음)
import { getSocket } from "@/shared/socket/socketClient.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { createLeaveGameSessionRequest } from "../../utils/createLeaveGameSessionRequest.js"
import { EXIT_STATUS, EXIT_ACK_TIMEOUT_MS } from "../../constants/ingameExit.js"
import { isRequestScopeCurrent, readExitScopeNow, readMembershipId } from "./scope.js"

// 기다림 시작: 이번 시도가 그대로인데 시간이 지나면 결과 모름으로 두고 시도 번호를 올림
export function startPending(ctx, isThisAttempt) {
  ctx.pendingRef.current = true
  ctx.setStatus(EXIT_STATUS.PENDING)
  ctx.clearTimer()
  ctx.timerRef.current = window.setTimeout(() => {
    ctx.timerRef.current = null
    if (!isThisAttempt()) return
    ctx.pendingRef.current = false
    ctx.setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
    ctx.bumpAttempt()
  }, EXIT_ACK_TIMEOUT_MS)
}

// 나가기 요청 만들기: 응답이 이번 시도·지금 범위 것일 때만 끝내거나 실패로 둠
function buildLeave(ctx, requestToken, requestScope) {
  const isCurrent = () => ctx.mountedRef.current
    && ctx.requestTokenRef.current === requestToken
    && isRequestScopeCurrent(requestScope)

  return createLeaveGameSessionRequest({
    getSocket,
    getCurrentGameId: () => useInGameStore.getState().gameId,
    getCurrentAccountId: () => useAuthStore.getState().user?.uuid ?? null,
    getIdentityGeneration: () => useAuthStore.getState().identityGeneration ?? null,
    getCurrentMembershipId: readMembershipId,
    finalize: () => {
      if (!isCurrent()) return
      ctx.settle()
    },
    onFailure: (response) => {
      if (!isCurrent()) return
      ctx.pendingRef.current = false
      ctx.clearTimer()
      ctx.setStatus(EXIT_STATUS.FAILED, response?.code ?? "UNKNOWN")
    },
  })
}

// 나가기 보내기 (기다리는 중이거나 이미 끝났으면 막기), 못 보냈으면 연결 없음 실패로 둠
export function sendLeave(ctx) {
  if (ctx.pendingRef.current || ctx.settledRef.current) return false
  const requestToken = ctx.bumpAttempt()
  const requestScope = readExitScopeNow()

  startPending(ctx, () => ctx.mountedRef.current
    && !ctx.settledRef.current
    && ctx.requestTokenRef.current === requestToken
    && isRequestScopeCurrent(requestScope))

  let sent
  try {
    sent = buildLeave(ctx, requestToken, requestScope)()
  } catch {
    sent = false
  }
  if (sent) return true
  if (ctx.requestTokenRef.current !== requestToken || ctx.settledRef.current) return false
  ctx.pendingRef.current = false
  ctx.clearTimer()
  ctx.setStatus(EXIT_STATUS.FAILED, "OFFLINE")
  return false
}

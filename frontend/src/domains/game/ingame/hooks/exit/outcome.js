// 나가기 결과 조회: 결과를 모를 때 스냅샷을 다시 물어 판에서 빠졌는지 확인
// 나가기 훅(useInGameExit)이 사용, 묻기는 socket/session.js를 부름
import { getSocket } from "@/shared/socket/socketClient.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { readInGameReceiptScope, useInGameStore } from "../../store/ingameStore.js"
import { EXIT_STATUS } from "../../constants/ingameExit.js"
import { askSnapshot } from "../../socket/session.js"
import { isRequestScopeCurrent } from "./scope.js"
import { startPending } from "./leave.js"

// 결과 조회 보내기 (기다리는 중이거나 끝났으면 막기, 연결·판 없으면 결과 모름)
export function lookupExitOutcome(ctx) {
  if (ctx.settledRef.current || ctx.pendingRef.current) return false
  const socket = getSocket()
  const gameId = useInGameStore.getState().gameId
  if (!socket || socket.connected === false || !gameId) {
    ctx.setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
    return false
  }
  const requestToken = ctx.bumpAttempt()
  const requestedGameId = gameId
  const requestedAccountId = useAuthStore.getState().user?.uuid ?? null
  const requestedIdentityGeneration = useAuthStore.getState().identityGeneration ?? null
  const requestedSocketId = socket?.id ?? null
  const requestedScope = readInGameReceiptScope({
    accountId: requestedAccountId, identityGeneration: requestedIdentityGeneration,
  })

  const isThisAttempt = () =>
    ctx.mountedRef.current
    && !ctx.settledRef.current
    && ctx.requestTokenRef.current === requestToken
    && isRequestScopeCurrent(requestedScope)

  startPending(ctx, isThisAttempt)

  let sent = false
  try {
    askSnapshot(socket, requestedGameId, (response) => {
      // 묻던 때와 판·계정·신원·소켓·소속·연결이 하나라도 다르면 버림
      if (!isThisAttempt()) return
      if (useInGameStore.getState().gameId !== requestedGameId) return
      if ((useAuthStore.getState().user?.uuid ?? null) !== requestedAccountId) return
      if ((useAuthStore.getState().identityGeneration ?? null) !== requestedIdentityGeneration) return
      if (getSocket() !== socket) return
      if ((socket?.id ?? null) !== requestedSocketId) return
      const now = readInGameReceiptScope({
        accountId: requestedAccountId, identityGeneration: requestedIdentityGeneration,
      })
      if (now.membershipId !== requestedScope.membershipId) return
      if (now.membershipEpoch !== requestedScope.membershipEpoch) return
      if (now.socketEpoch !== requestedScope.socketEpoch) return
      if (now.socketConnected !== requestedScope.socketConnected) return

      // 판에서 빠졌으면 나가기 끝, 아직 참여 중이면 실패, 그 밖엔 결과 모름
      ctx.pendingRef.current = false
      ctx.clearTimer()
      if (response?.ok === false && response?.code === "FORFEITED_FROM_SESSION") {
        ctx.settle()
        return
      }
      if (response?.ok === true) {
        ctx.setStatus(EXIT_STATUS.FAILED, "STILL_PARTICIPATING")
        return
      }
      ctx.setStatus(EXIT_STATUS.UNRESOLVED, response?.code ?? "NO_ACK")
    })
    sent = true
  } catch {
    sent = false
  }
  if (sent) return true
  if (!isThisAttempt()) return false
  ctx.pendingRef.current = false
  ctx.clearTimer()
  ctx.setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
  return false
}

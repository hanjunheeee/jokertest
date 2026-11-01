// 스냅샷 묻기 한 번의 판단 묶음: 옛 응답인지, 다시 묶기 기다림 풀기, 다시 묻기 예약
// 스냅샷 묻기(request.js)가 시도마다 만듦, 셋 다 묻던 때 잡은 값을 같이 써서 한 파일에 둠
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import {
  getIdentityScopeVersion,
  isSameReceiptScope,
  readInGameReceiptScope,
  useInGameStore,
} from "../../store/ingameStore.js"
import { isStaleSessionSnapshotAckResponse } from "../../utils/staleAck.js"
import { hasNightObservationChanged } from "../../utils/snapshot/nightObservation.js"
import { getInGameSnapshotRebindPending, setIdentityRebindPending } from "./rebindPending.js"

// 다시 묻기 간격·한 세대 최대 횟수
const SNAPSHOT_RETRY_DELAY_MS = 250
const SNAPSHOT_MAX_ATTEMPTS = 20

// 지금 판에서 내 소속 id
function readCurrentMembershipId() {
  const { state } = useInGameStore.getState()
  const me = useAuthStore.getState().user?.uuid ?? null
  if (!state || !me) return null
  return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
}

// 지금 로그인 계정·신원 세대
function readCurrentAuthScope() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  }
}

// 묻는 때의 값을 잡아 두고, 응답 때 비교·정리할 함수들을 돌려줌
// ctx = 훅 effect의 값·ref 묶음
export function openAttempt(ctx, { requestEpochVersion, attemptBudget, retry }) {
  const requestSocket = ctx.socket
  const requestGameId = ctx.gameId
  const requestAuthUuid = ctx.authUuid
  const requestIdentityGeneration = ctx.identityGeneration
  const requestMembershipId = readCurrentMembershipId()
  const requestSocketId = requestSocket?.id ?? null
  const receiptContext = readInGameReceiptScope({
    accountId: requestAuthUuid, identityGeneration: requestIdentityGeneration,
  })
  const observationsAtRequest = new Map(ctx.nightObservationsRef.current)

  // 묻는 사이 그 밤 사건을 따로 받았으면 응답이 뒤처졌을 수 있음
  const hasConflictingNightObservation = (response) =>
    hasNightObservationChanged(ctx.nightObservationsRef.current, observationsAtRequest, response, requestGameId)

  const readScopeNow = () => readInGameReceiptScope(readCurrentAuthScope())

  // 이 시도의 세대·범위가 판단 때도 그대로여야 기다림을 풂
  const ownsCurrentScope = (scopeAtDecision) =>
    ctx.epochVersionRef.current === requestEpochVersion
    && isSameReceiptScope(receiptContext, scopeAtDecision)

  // 반영했으면 기다림만 풂
  const finishRebindApplied = (scopeAtDecision) => {
    if (!ownsCurrentScope(scopeAtDecision)) return
    setIdentityRebindPending(false)
  }

  // 반영 못 하고 기다림을 풀 땐 확인 안 된 종료 결과를 버림
  const finishRebindUnapplied = (scopeAtDecision) => {
    if (!ownsCurrentScope(scopeAtDecision)) return
    if (!getInGameSnapshotRebindPending()) return
    useInGameStore.getState().invalidateUnconfirmedTerminalResult(scopeAtDecision)
    setIdentityRebindPending(false)
  }

  // 반영 못 하고 끝냄 (판 없이 묻던 거면 처음 확인 실패로 둠)
  const settleUnapplied = () => {
    const scopeNow = readScopeNow()
    const stale = isStaleNow()
    finishRebindUnapplied(scopeNow)
    if (stale) return
    if (!requestGameId) ctx.setBootstrapStatus("failed")
  }

  // 묻던 때와 화면·세대·판·계정·소켓·신원·소속·연결 중 하나라도 다르면 옛 응답
  const isStaleNow = () => {
    const auth = readCurrentAuthScope()
    const currentScope = readInGameReceiptScope(auth)
    return isStaleSessionSnapshotAckResponse({
      mounted: ctx.mountedRef.current,
      requestEpochVersion,
      currentEpochVersion: ctx.epochVersionRef.current,
      requestGameId,
      currentGameId: useInGameStore.getState().gameId,
      requestAuthUuid,
      currentAuthUuid: auth.accountId,
      requestSocket,
      currentSocket: getSocket(),
      requestIdentityGeneration,
      currentIdentityGeneration: auth.identityGeneration,
      requestMembershipId,
      currentMembershipId: readCurrentMembershipId(),
      requestSocketId,
      currentSocketId: getSocket()?.id ?? null,
      requestMembershipEpoch: receiptContext.membershipEpoch,
      currentMembershipEpoch: currentScope.membershipEpoch,
      requestSocketEpoch: receiptContext.socketEpoch,
      currentSocketEpoch: currentScope.socketEpoch,
      requestSocketConnected: receiptContext.socketConnected,
      currentSocketConnected: currentScope.socketConnected,
    })
  }

  // 다시 묻기 자리는 같은 세대의 같은 예산일 때만 씀
  const ownsRetrySlot = () =>
    ctx.mountedRef.current
    && ctx.epochVersionRef.current === requestEpochVersion
    && ctx.retryRef.current === attemptBudget
    && attemptBudget.epoch === requestEpochVersion
  const hasAttemptsLeft = () => attemptBudget.attempts < SNAPSHOT_MAX_ATTEMPTS
  const retryBudgetLeftMs = () => attemptBudget.deadline - Date.now()

  // 다시 묻기 예약 (횟수·시간이 남을 때만, 이미 예약돼 있으면 그대로)
  const scheduleRetry = () => {
    if (!ownsRetrySlot()) return false
    if (!hasAttemptsLeft()) return false
    if (retryBudgetLeftMs() <= SNAPSHOT_RETRY_DELAY_MS) return false
    if (attemptBudget.timerId !== null) return true
    attemptBudget.timerId = setTimeout(() => {
      attemptBudget.timerId = null
      if (!ownsRetrySlot()) return
      if (getSocket() !== requestSocket) return
      if (!hasAttemptsLeft() || retryBudgetLeftMs() <= 0) {
        settleUnapplied()
        return
      }
      retry()
    }, SNAPSHOT_RETRY_DELAY_MS)
    return true
  }

  // 반영한 범위를 적어 둠 (그 범위로 effect가 다시 돌면 새 세대로 안 봄)
  const rememberFulfilled = () => {
    const auth = readCurrentAuthScope()
    ctx.fulfilledRef.current = {
      socket: getSocket(),
      gameId: useInGameStore.getState().gameId,
      authUuid: auth.accountId,
      identityGeneration: auth.identityGeneration,
      identityScopeVersion: getIdentityScopeVersion(),
    }
  }

  return {
    requestSocket,
    requestGameId,
    receiptContext,
    hasConflictingNightObservation,
    readScopeNow,
    finishRebindApplied,
    finishRebindUnapplied,
    settleUnapplied,
    isStaleNow,
    scheduleRetry,
    rememberFulfilled,
  }
}

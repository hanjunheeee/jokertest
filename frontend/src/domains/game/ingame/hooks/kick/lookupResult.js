// 지난 추방 요청 결과 조회: 응답에 따라 성공·실패·모름으로 두고, 모르면 소속 다시 확인
// 추방 요청 훅(useKickPlayerRequest)이 사용 (ctx = 훅의 ref와 상태 바꾸기 묶음), 묻기는 socket/kick.js
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { KICK_REQUEST_STATUS } from "../../constants/ingameKick.js"
import { emitKickResult } from "../../socket/kick.js"
import { captureAckGuard } from "./guards.js"

// 결과 모름일 때: 소속 다시 확인 기다리는 중으로 두고, 확인되면 기다림을 풂
function awaitVerification(ctx, makeGuard) {
  ctx.needsVerificationRef.current = true
  ctx.setNeedsVerification(true)
  const isVerificationStillCurrent = makeGuard()
  let verification
  try {
    verification = ctx.verifyMembership()
  } catch {
    return
  }
  Promise.resolve(verification)
    .then((ok) => {
      if (!isVerificationStillCurrent()) return
      if (ok === false) return
      ctx.needsVerificationRef.current = false
      ctx.setNeedsVerification(false)
    })
    .catch(() => {})
}

export function lookupKickResult(ctx) {
  const receipt = ctx.lastReceiptRef.current
  if (!receipt) return
  const socket = getSocket()
  if (!socket) {
    ctx.applyStatus(KICK_REQUEST_STATUS.FAILED)
    ctx.setErrorCode("NOT_CONNECTED")
    return
  }
  const generation = ctx.generationRef.current
  ctx.requestGenerationRef.current += 1
  const requestGeneration = ctx.requestGenerationRef.current
  const scopeId = ctx.getMembershipScopeId()
  const makeGuard = () => captureAckGuard({
    socket,
    scopeId,
    requestGeneration,
    generation,
    refs: { mountedRef: ctx.mountedRef, generationRef: ctx.generationRef, requestGenerationRef: ctx.requestGenerationRef },
    getMembershipScopeId: ctx.getMembershipScopeId,
  })
  const isStillCurrent = makeGuard()

  emitKickResult(socket, receipt.bootEpoch, receipt.requestId, (response) => {
    if (!isStillCurrent()) return

    // 서버가 아직 결정 못 했으면 실패로만 두고 잠금은 그대로
    const decided = response?.ok === true || response?.replayed === true
    if (!decided) {
      ctx.applyStatus(KICK_REQUEST_STATUS.FAILED)
      ctx.setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
      return
    }

    ctx.sendLockRef.current = false
    ctx.setPendingTarget(null)
    if (response && response.ok === true && response.status === "KICKED") {
      ctx.applyStatus(KICK_REQUEST_STATUS.SUCCEEDED)
      ctx.setErrorCode(null)
      ctx.settleVerification()
      return
    }
    if (response && response.ok === true && response.status === "UNKNOWN") {
      ctx.applyStatus(KICK_REQUEST_STATUS.UNKNOWN)
      ctx.setErrorCode(null)
      if (typeof ctx.verifyMembership !== "function") return
      awaitVerification(ctx, makeGuard)
      return
    }
    ctx.applyStatus(KICK_REQUEST_STATUS.FAILED)
    ctx.setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
    ctx.settleVerification()
  })
}

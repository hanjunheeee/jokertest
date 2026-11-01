// 추방 요청 훅: 대상 확인 → 보내기 → 결과(성공·실패·모름) 상태, 결과 다시 묻기
// 카드 추방 훅(useInGameKickFromCard)이 사용, 보내기는 socket/kick.js (응답 확인·결과 조회는 hooks/kick/)
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { KICK_REQUEST_STATUS } from "../constants/ingameKick.js"
import { emitKick } from "../socket/kick.js"
import { captureAckGuard, nextRequestId } from "./kick/guards.js"
import { lookupKickResult } from "./kick/lookupResult.js"

export { KICK_EVENTS } from "../socket/kick.js"
export { KICK_REQUEST_STATUS } from "../constants/ingameKick.js"

export function useKickPlayerRequest({
  scope,
  buildRequest,
  getMembershipScopeId = () => null,
  verifyMembership = null,
}) {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const [pendingTarget, setPendingTarget] = useState(null)
  const [status, setStatus] = useState(KICK_REQUEST_STATUS.IDLE)
  const [errorCode, setErrorCode] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [hasReceipt, setHasReceipt] = useState(false)

  const generationRef = useRef(0)
  const requestGenerationRef = useRef(0)
  const lastReceiptRef = useRef(null)
  const mountedRef = useRef(true)
  const sendLockRef = useRef(false)
  const statusRef = useRef(KICK_REQUEST_STATUS.IDLE)
  statusRef.current = status
  const needsVerificationRef = useRef(false)

  // 상태는 ref에도 바로 적음 (같은 틱 안의 다음 판단이 새 값을 보게)
  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const settleVerification = useCallback(() => {
    needsVerificationRef.current = false
    setNeedsVerification(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 계정이 바뀌면 진행 중인 추방·영수증을 모두 버림
  useEffect(() => {
    generationRef.current += 1
    requestGenerationRef.current += 1
    lastReceiptRef.current = null
    sendLockRef.current = false
    needsVerificationRef.current = false
    setNeedsVerification(false)
    setHasReceipt(false)
    setPendingTarget(null)
    applyStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [authUuid, applyStatus])

  // 대상 고르기: 보내는 중·소속 확인 기다리는 중이면 막기
  const requestConfirm = useCallback((target) => {
    if (!target || typeof target.uuid !== "string" || !target.uuid) return
    if (typeof target.membershipId !== "string" || !target.membershipId) return
    if (sendLockRef.current) return
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return
    if (needsVerificationRef.current) return
    setPendingTarget({
      uuid: target.uuid,
      membershipId: target.membershipId,
      nickname: typeof target.nickname === "string" ? target.nickname : "",
      scopeId: getMembershipScopeId(),
    })
    setErrorCode(null)
    applyStatus(KICK_REQUEST_STATUS.CONFIRMING)
  }, [getMembershipScopeId, applyStatus])

  const cancelConfirm = useCallback(() => {
    setPendingTarget(null)
    if (statusRef.current === KICK_REQUEST_STATUS.CONFIRMING) applyStatus(KICK_REQUEST_STATUS.IDLE)
  }, [applyStatus])

  // 추방 보내기: 고른 뒤 내 소속·대상 소속이 그대로일 때만
  const confirmKick = useCallback((currentTargets = null) => {
    const target = pendingTarget
    if (!target) return
    if (sendLockRef.current) return
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return

    const fail = (code) => {
      setPendingTarget(null)
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(code)
    }

    if (target.scopeId !== getMembershipScopeId()) {
      fail("STALE_MEMBERSHIP")
      return
    }
    if (Array.isArray(currentTargets)) {
      const seated = currentTargets.find((entry) => entry?.uuid === target.uuid)
      if (!seated || seated.membershipId !== target.membershipId) {
        fail("STALE_MEMBERSHIP")
        return
      }
    }

    const socket = getSocket()
    if (!socket) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }

    const requestId = nextRequestId()
    const request = buildRequest({ target, requestId })
    if (!request) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_READY")
      return
    }

    // 보내기 전에 잠그고 영수증을 남김 (응답을 못 받아도 나중에 결과를 물을 수 있게)
    sendLockRef.current = true
    lastReceiptRef.current = { bootEpoch: request.bootEpoch, requestId, socket }
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    const scopeId = target.scopeId
    statusRef.current = KICK_REQUEST_STATUS.SENDING
    setHasReceipt(true)
    setStatus(KICK_REQUEST_STATUS.SENDING)
    setErrorCode(null)

    const isStillCurrent = captureAckGuard({
      socket,
      scopeId,
      requestGeneration,
      generation,
      refs: { mountedRef, generationRef, requestGenerationRef },
      getMembershipScopeId,
    })

    emitKick(socket, scope, request, (response) => {
      if (!isStillCurrent()) return

      sendLockRef.current = false
      setPendingTarget(null)
      if (response && response.ok === true) {
        applyStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        return
      }
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
    })
  }, [pendingTarget, buildRequest, getMembershipScopeId, scope, applyStatus])

  // 결과 조회에 넘길 ref·상태 바꾸기 묶음
  const lookupCtx = useMemo(() => ({
    mountedRef, generationRef, requestGenerationRef, lastReceiptRef, sendLockRef, needsVerificationRef,
    applyStatus, setErrorCode, setPendingTarget, setNeedsVerification,
    settleVerification, getMembershipScopeId, verifyMembership,
  }), [applyStatus, getMembershipScopeId, verifyMembership, settleVerification])

  const lookupResult = useCallback(() => lookupKickResult(lookupCtx), [lookupCtx])

  const reset = useCallback(() => {
    requestGenerationRef.current += 1
    setPendingTarget(null)
    applyStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [applyStatus])

  return {
    pendingTarget,
    status,
    errorCode,
    isSending: status === KICK_REQUEST_STATUS.SENDING,
    canLookupResult: hasReceipt,
    isAwaitingResolution: needsVerification,
    requestConfirm,
    cancelConfirm,
    confirmKick,
    lookupResult,
    reset,
  }
}

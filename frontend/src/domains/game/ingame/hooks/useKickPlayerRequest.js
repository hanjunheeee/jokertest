// 추방 요청 훅: 대상 확인 → 보내기 → 결과(성공·실패·모름) 상태, 결과 다시 묻기
// 판 추방 훅(useInGameKickFromCard)·대기방 추방 훅(useMatchingRoomKick)이 사용, 보내기는 socket/kick.js (확인·조회는 hooks/kick/)
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { KICK_REQUEST_STATUS } from "../constants/ingameKick.js"
import { emitKick } from "../socket/kick.js"
import { captureAckGuard, nextRequestId } from "./kick/guards.js"
import { lookupKickResult } from "./kick/lookupResult.js"

// 사건 이름·상태 이름은 시험이 이 경로로 가져감
export { KICK_EVENTS } from "../socket/kick.js"
export { KICK_REQUEST_STATUS } from "../constants/ingameKick.js"

// 추방 진행 상태와 고르기·보내기·결과 조회 함수 (scope = GAME 판·ROOM 방)
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

  // 훅 세대·요청 세대·마지막 영수증·화면 살아 있음·보내기 잠금·상태 (콜백이 바로 읽음)
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

  // 소속 다시 확인 기다림 풀기
  const settleVerification = useCallback(() => {
    needsVerificationRef.current = false
    setNeedsVerification(false)
  }, [])

  // 화면 빠진 뒤엔 응답 반영 안 하게 표시
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
    // 대상 uuid·소속 id가 없으면 안 받음
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

  // 고르기 취소 (확인 중이었으면 처음으로)
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

    // 대상 비우고 실패로
    const fail = (code) => {
      setPendingTarget(null)
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(code)
    }

    // 고른 뒤 내 소속 범위나 대상 소속이 바뀌었으면 실패
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

    // 소켓이 없으면 실패
    const socket = getSocket()
    if (!socket) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }

    // 요청 내용을 못 만들면(방·소속 정보 모자람) 실패
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

    // 응답 때 화면·세대·계정·소켓·범위가 그대로인지
    const isStillCurrent = captureAckGuard({
      socket,
      scopeId,
      requestGeneration,
      generation,
      refs: { mountedRef, generationRef, requestGenerationRef },
      getMembershipScopeId,
    })

    // 옛 응답은 버림, 성공이면 성공, 아니면 서버 코드로 실패 (잠금 풂)
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

  // 지난 요청 결과 다시 묻기 (본체는 hooks/kick/lookupResult.js)
  const lookupResult = useCallback(() => lookupKickResult(lookupCtx), [lookupCtx])

  // 진행 중 응답 버리고 처음으로 (보내기 잠금·영수증은 그대로 둠)
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

import { useCallback, useEffect, useRef, useState } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"

export const KICK_EVENTS = Object.freeze({
  ROOM: "kick_room_player",
  GAME: "kick_game_player",
  RESULT: "get_kick_result",
})

export const KICK_REQUEST_STATUS = Object.freeze({
  IDLE: "IDLE",
  CONFIRMING: "CONFIRMING",
  SENDING: "SENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
})

export function captureVerificationGuard({ socket, getMembershipScopeId, getRevision }) {
  const readScopeId = () => (typeof getMembershipScopeId === "function" ? getMembershipScopeId() : null)
  const readRevision = () => (typeof getRevision === "function" ? getRevision() : null)

  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null
  const scopeId = readScopeId()
  const revision = readRevision()

  return function isStillCurrent() {
    if (!authUuid || !socketId || !scopeId) return false
    if (!Number.isInteger(revision)) return false

    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    if (socket.id !== socketId) return false
    if (readScopeId() !== scopeId) return false
    if (readRevision() !== revision) return false
    return true
  }
}

function captureAckGuard({ socket, scopeId, requestGeneration, generation, refs, getMembershipScopeId }) {
  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null

  return function isStillCurrent() {
    if (!refs.mountedRef.current) return false
    if (generation !== refs.generationRef.current) return false
    if (requestGeneration !== refs.requestGenerationRef.current) return false
    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    if (socketId === null || socket.id !== socketId) return false
    if (scopeId !== getMembershipScopeId()) return false
    return true
  }
}

let requestSeq = 0
function nextRequestId() {
  requestSeq += 1
  return `kick-${requestSeq}-${Math.random().toString(36).slice(2, 10)}`
}

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

    socket.emit(scope === "GAME" ? KICK_EVENTS.GAME : KICK_EVENTS.ROOM, request, (response) => {
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

  const lookupResult = useCallback(() => {
    const receipt = lastReceiptRef.current
    if (!receipt) return
    const socket = getSocket()
    if (!socket) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    const scopeId = getMembershipScopeId()
    const isStillCurrent = captureAckGuard({
      socket,
      scopeId,
      requestGeneration,
      generation,
      refs: { mountedRef, generationRef, requestGenerationRef },
      getMembershipScopeId,
    })

    socket.emit(KICK_EVENTS.RESULT, { bootEpoch: receipt.bootEpoch, requestId: receipt.requestId }, (response) => {
      if (!isStillCurrent()) return

      const decided = response?.ok === true || response?.replayed === true
      if (!decided) {
        applyStatus(KICK_REQUEST_STATUS.FAILED)
        setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
        return
      }

      sendLockRef.current = false
      setPendingTarget(null)
      if (response && response.ok === true && response.status === "KICKED") {
        applyStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        settleVerification()
        return
      }
      if (response && response.ok === true && response.status === "UNKNOWN") {
        applyStatus(KICK_REQUEST_STATUS.UNKNOWN)
        setErrorCode(null)
        if (typeof verifyMembership !== "function") return
        needsVerificationRef.current = true
        setNeedsVerification(true)
        const isVerificationStillCurrent = captureAckGuard({
          socket,
          scopeId,
          requestGeneration,
          generation,
          refs: { mountedRef, generationRef, requestGenerationRef },
          getMembershipScopeId,
        })
        let verification
        try {
          verification = verifyMembership()
        } catch {
          return // 재확인을 시작조차 못 했다 — 잠긴 채로 둔다.
        }
        Promise.resolve(verification)
          .then((ok) => {
            if (!isVerificationStillCurrent()) return
            if (ok === false) return // 실패하면 잠긴 채로 둔다 — 사용자가 다시 시도한다.
            needsVerificationRef.current = false
            setNeedsVerification(false)
          })
          .catch(() => { /* 재확인 실패는 잠금을 유지한다(모르는 상태를 풀지 않는다) */ })
        return
      }
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
      settleVerification()
    })
  }, [applyStatus, getMembershipScopeId, verifyMembership, settleVerification])

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

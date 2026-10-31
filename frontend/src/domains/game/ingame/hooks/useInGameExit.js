import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useBlocker, useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import {
  getInGameIdentityScopeVersion,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createLeaveGameSessionRequest } from "../utils/createLeaveGameSessionRequest.js"
import { createExitConfirmController } from "../utils/createExitConfirmController.js"
import { isPopNavigationBlocked } from "../utils/isPopNavigationBlocked.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export const IN_GAME_EXIT_ACK_TIMEOUT_MS = 8000

const EXIT_STATUS = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
  FAILED: "failed",
  UNRESOLVED: "unresolved",
})

function readExitScopeNow() {
  const auth = useAuthStore.getState()
  return readInGameReceiptScope({
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  })
}

function isExitRequestScopeCurrent(requestScope) {
  const now = readExitScopeNow()
  return now.membershipId === requestScope.membershipId
    && now.membershipEpoch === requestScope.membershipEpoch
    && now.socketEpoch === requestScope.socketEpoch
}

export function useInGameExit() {
  const navigate = useNavigate()
  const blocker = useBlocker(isPopNavigationBlocked)
  const [exitStatus, setExitStatus] = useState(EXIT_STATUS.IDLE)
  const [exitErrorCode, setExitErrorCode] = useState(null)

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const mountedRef = useRef(true)
  const settledRef = useRef(false)
  const timerRef = useRef(null)
  const pendingRef = useRef(false)
  const requestTokenRef = useRef(0)
  const [exitAttemptId, setExitAttemptId] = useState(0)

  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const scopeKey = `${identityScopeVersion}|${authUuid}|${identityGeneration}`
  const scopeKeyRef = useRef(scopeKey)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      requestTokenRef.current += 1
      pendingRef.current = false
    }
  }, [])

  const setStatus = useCallback((status, code = null) => {
    if (!mountedRef.current) return
    setExitStatus(status)
    setExitErrorCode(code)
  }, [])

  const bumpAttempt = useCallback(() => {
    requestTokenRef.current += 1
    if (mountedRef.current) setExitAttemptId(requestTokenRef.current)
    return requestTokenRef.current
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const settle = useCallback(() => {
    if (!mountedRef.current) return
    if (settledRef.current) return
    settledRef.current = true
    pendingRef.current = false
    clearTimer()
    createSessionEndFinalizer({
      clearGame: () => useInGameStore.getState().clearGame(),
      clearRoom: () => useMatchingStore.getState().clearRoom(),
      navigate: (...args) => navigateRef.current(...args),
    })()
  }, [clearTimer])

  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return
    scopeKeyRef.current = scopeKey
    bumpAttempt()
    clearTimer()
    pendingRef.current = false
    settledRef.current = false
    setStatus(EXIT_STATUS.IDLE)
  }, [scopeKey, bumpAttempt, clearTimer, setStatus])

  const buildLeaveRequest = useCallback((requestToken, requestScope) => createLeaveGameSessionRequest({
    getSocket,
    getCurrentGameId: () => useInGameStore.getState().gameId,
    getCurrentAccountId: () => useAuthStore.getState().user?.uuid ?? null,
    getIdentityGeneration: () => useAuthStore.getState().identityGeneration ?? null,
    getCurrentMembershipId: () => {
      const { state } = useInGameStore.getState()
      const me = useAuthStore.getState().user?.uuid ?? null
      if (!state || !me) return null
      return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
    },
    finalize: () => {
      if (!mountedRef.current) return
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      settle()
    },
    onFailure: (response) => {
      if (!mountedRef.current) return
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      pendingRef.current = false
      clearTimer()
      setStatus(EXIT_STATUS.FAILED, response?.code ?? "UNKNOWN")
    },
  }), [clearTimer, setStatus, settle])

  const sendLeave = useCallback(() => {
    if (pendingRef.current || settledRef.current) return false
    const requestToken = bumpAttempt()
    const requestScope = readExitScopeNow()

    pendingRef.current = true
    setStatus(EXIT_STATUS.PENDING)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!mountedRef.current || settledRef.current) return
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      pendingRef.current = false
      setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
      bumpAttempt()
    }, IN_GAME_EXIT_ACK_TIMEOUT_MS)

    let sent = false
    try {
      sent = buildLeaveRequest(requestToken, requestScope)()
    } catch {
      sent = false
    }
    if (sent) return true
    if (requestTokenRef.current !== requestToken || settledRef.current) return false
    pendingRef.current = false
    clearTimer()
    setStatus(EXIT_STATUS.FAILED, "OFFLINE")
    return false
  }, [buildLeaveRequest, bumpAttempt, clearTimer, setStatus])

  const requestExit = useCallback(() => {
    if (pendingRef.current || settledRef.current) return false
    return createExitConfirmController({
      confirm: window.confirm,
      requestLeave: sendLeave,
      onDecision: (kind) => dispatchUiSfx(kind),
    })()
  }, [sendLeave])

  const retryExit = useCallback(() => sendLeave(), [sendLeave])

  const resolveExitOutcome = useCallback(() => {
    if (settledRef.current || pendingRef.current) return false
    const socket = getSocket()
    const gameId = useInGameStore.getState().gameId
    if (!socket || socket.connected === false || !gameId) {
      setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
      return false
    }
    const requestToken = bumpAttempt()
    const requestedGameId = gameId
    const requestedAccountId = useAuthStore.getState().user?.uuid ?? null
    const requestedIdentityGeneration = useAuthStore.getState().identityGeneration ?? null
    const requestedSocketId = socket?.id ?? null
    const requestedScope = readInGameReceiptScope({
      accountId: requestedAccountId, identityGeneration: requestedIdentityGeneration,
    })

    const isThisAttempt = () =>
      mountedRef.current
      && !settledRef.current
      && requestTokenRef.current === requestToken
      && isExitRequestScopeCurrent(requestedScope)

    pendingRef.current = true
    setStatus(EXIT_STATUS.PENDING)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!isThisAttempt()) return
      pendingRef.current = false
      setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
      bumpAttempt()
    }, IN_GAME_EXIT_ACK_TIMEOUT_MS)

    let sent = false
    try {
      socket.emit("get_session_snapshot", { gameId: requestedGameId }, (response) => {
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

        pendingRef.current = false
        clearTimer()
        if (response?.ok === false && response?.code === "FORFEITED_FROM_SESSION") {
          settle()
          return
        }
        if (response?.ok === true) {
          setStatus(EXIT_STATUS.FAILED, "STILL_PARTICIPATING")
          return
        }
        setStatus(EXIT_STATUS.UNRESOLVED, response?.code ?? "NO_ACK")
      })
      sent = true
    } catch {
      sent = false
    }
    if (sent) return true
    if (!isThisAttempt()) return false
    pendingRef.current = false
    clearTimer()
    setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
    return false
  }, [bumpAttempt, clearTimer, setStatus, settle])

  useEffect(() => {
    if (blocker.state !== "blocked") return
    requestExit()
    blocker.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  return {
    requestExit,
    retryExit,
    resolveExitOutcome,
    exitStatus,
    exitErrorCode,
    exitAttemptId,
    isExitPending: exitStatus === EXIT_STATUS.PENDING,
    isExitUnresolved: exitStatus === EXIT_STATUS.UNRESOLVED,
  }
}

export { EXIT_STATUS as IN_GAME_EXIT_STATUS }

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { isStaleSessionSnapshotAckResponse } from "../utils/isStaleSessionSnapshotAckResponse.js"
import { parseNightTurnStartedPayload } from "../utils/parseNightTurnStartedPayload.js"

const SESSION_SNAPSHOT_TIMEOUT_MS = 5000

const SNAPSHOT_RETRY_DELAY_MS = 250
const SNAPSHOT_RETRY_BUDGET_MS = 5000
const SNAPSHOT_MAX_ATTEMPTS = 20
const SESSION_ROUTING_PENDING_CODE = "SESSION_ROUTING_PENDING"

let identityRebindPending = false
const identityRebindListeners = new Set()

function setIdentityRebindPending(next) {
  if (identityRebindPending === next) return
  identityRebindPending = next
  for (const listener of [...identityRebindListeners]) listener()
}

export function getInGameSnapshotRebindPending() {
  return identityRebindPending
}

export function subscribeInGameSnapshotRebindPending(listener) {
  identityRebindListeners.add(listener)
  return () => identityRebindListeners.delete(listener)
}

export function useInGameSnapshotRebindPending() {
  return useSyncExternalStore(
    subscribeInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
  )
}

function readCurrentMembershipId() {
  const { state } = useInGameStore.getState()
  const me = useAuthStore.getState().user?.uuid ?? null
  if (!state || !me) return null
  return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
}

function nightObservationKey(gameId, nightDayIndex) {
  return `${gameId}|${nightDayIndex}`
}

function readWaitObservationTarget(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (Object.keys(payload).length !== 3) return null
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return null
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
  if (typeof payload.waiting !== "boolean") return null
  return nightObservationKey(payload.gameId, payload.nightDayIndex)
}

function readTurnStartObservationTarget(payload) {
  const parsed = parseNightTurnStartedPayload({
    payload, gameId: payload?.gameId, dayIndex: payload?.dayIndex,
  })
  if (!parsed) return null
  return nightObservationKey(parsed.gameId, parsed.dayIndex)
}

function readCurrentAuthScope() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  }
}

export function useInGameSessionSnapshotSync() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const [bootstrapStatus, setBootstrapStatus] = useState(gameId ? "ready" : "checking")

  const mountedRef = useRef(true)
  const epochVersionRef = useRef(0)
  const epochBaseRef = useRef({
    socket: undefined, gameId: undefined, authUuid: undefined,
    identityGeneration: undefined, identityScopeVersion: undefined,
  })
  const requestedVersionRef = useRef(-1)
  const observedBaseRef = useRef(false)
  const fulfilledRef = useRef(null)
  const retryRef = useRef({ epoch: -1, attempts: 0, deadline: 0, timerId: null })
  const nightObservationsRef = useRef(new Map())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setIdentityRebindPending(false)
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }
  }, [])

  useEffect(() => {
    if (!socket || !authUuid) return

    const base = epochBaseRef.current
    const isFirstRun = !observedBaseRef.current
    observedBaseRef.current = true
    const fulfilled = fulfilledRef.current
    const isSelfCommitted = fulfilled !== null
      && fulfilled.socket === socket
      && fulfilled.gameId === gameId
      && fulfilled.authUuid === authUuid
      && fulfilled.identityGeneration === identityGeneration
      && fulfilled.identityScopeVersion === identityScopeVersion
    const changed = base.socket !== socket || base.gameId !== gameId || base.authUuid !== authUuid
      || base.identityGeneration !== identityGeneration
      || base.identityScopeVersion !== identityScopeVersion
    epochBaseRef.current = { socket, gameId, authUuid, identityGeneration, identityScopeVersion }
    if (changed && !isSelfCommitted) {
      epochVersionRef.current += 1
      if (!isFirstRun && gameId && socket.connected) setIdentityRebindPending(true)
    }

    const isObservableNow = () =>
      mountedRef.current && getSocket() === socket
      && (useAuthStore.getState().user?.uuid ?? null) === authUuid

    const noteNightObservation = (key) => {
      if (key === null) return
      const book = nightObservationsRef.current
      book.set(key, (book.get(key) ?? 0) + 1)
    }

    const observeWaitNotice = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readWaitObservationTarget(payload))
    }
    const observeTurnStart = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readTurnStartObservationTarget(payload))
    }
    socket.on("night_presentation_wait", observeWaitNotice)
    socket.on("night_turn_started", observeTurnStart)

    const cancelScheduledRetry = () => {
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }

    const requestSnapshot = ({ retry = false } = {}) => {
      const requestEpochVersion = epochVersionRef.current
      if (!retry) {
        if (requestedVersionRef.current === requestEpochVersion) return
        requestedVersionRef.current = requestEpochVersion
        cancelScheduledRetry()
        retryRef.current = {
          epoch: requestEpochVersion,
          attempts: 0,
          deadline: Date.now() + SNAPSHOT_RETRY_BUDGET_MS,
          timerId: null,
        }
      }
      const attemptBudget = retryRef.current
      if (attemptBudget.epoch !== requestEpochVersion) return
      attemptBudget.attempts += 1
      const ackTimeoutMs = Math.max(
        1, Math.min(SESSION_SNAPSHOT_TIMEOUT_MS, attemptBudget.deadline - Date.now()),
      )

      const requestSocket = socket
      const requestGameId = gameId
      const requestAuthUuid = authUuid
      const requestIdentityGeneration = identityGeneration
      const requestMembershipId = readCurrentMembershipId()
      const requestSocketId = requestSocket?.id ?? null
      const receiptContext = readInGameReceiptScope({
        accountId: requestAuthUuid, identityGeneration: requestIdentityGeneration,
      })
      const observationsAtRequest = new Map(nightObservationsRef.current)

      const hasConflictingNightObservation = (response) => {
        const responseGameId = typeof response?.gameId === "string" && response.gameId.length > 0
          ? response.gameId
          : requestGameId
        if (!responseGameId) return false
        const keys = response?.phase === "NIGHT" && Number.isInteger(response?.dayIndex)
          ? [nightObservationKey(responseGameId, response.dayIndex)]
          : [...nightObservationsRef.current.keys()].filter((key) => key.startsWith(`${responseGameId}|`))
        return keys.some((key) =>
          (nightObservationsRef.current.get(key) ?? 0) !== (observationsAtRequest.get(key) ?? 0))
      }

      const readScopeNow = () => readInGameReceiptScope(readCurrentAuthScope())

      const ownsCurrentScope = (scopeAtDecision) =>
        epochVersionRef.current === requestEpochVersion
        && isSameInGameReceiptScope(receiptContext, scopeAtDecision)

      const finishRebindApplied = (scopeAtDecision) => {
        if (!ownsCurrentScope(scopeAtDecision)) return
        setIdentityRebindPending(false)
      }

      const finishRebindUnapplied = (scopeAtDecision) => {
        if (!ownsCurrentScope(scopeAtDecision)) return
        if (!getInGameSnapshotRebindPending()) return
        useInGameStore.getState().invalidateUnconfirmedTerminalResult(scopeAtDecision)
        setIdentityRebindPending(false)
      }

      const settleUnapplied = () => {
        const scopeNow = readScopeNow()
        const stale = isStaleNow()
        finishRebindUnapplied(scopeNow)
        if (stale) return
        if (!requestGameId) setBootstrapStatus("failed")
      }

      const isStaleNow = () => {
        const auth = readCurrentAuthScope()
        const currentScope = readInGameReceiptScope(auth)
        return isStaleSessionSnapshotAckResponse({
          mounted: mountedRef.current,
          requestEpochVersion,
          currentEpochVersion: epochVersionRef.current,
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

      const ownsRetrySlot = () =>
        mountedRef.current
        && epochVersionRef.current === requestEpochVersion
        && retryRef.current === attemptBudget
        && attemptBudget.epoch === requestEpochVersion
      const hasAttemptsLeft = () => attemptBudget.attempts < SNAPSHOT_MAX_ATTEMPTS
      const retryBudgetLeftMs = () => attemptBudget.deadline - Date.now()

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
          requestSnapshot({ retry: true })
        }, SNAPSHOT_RETRY_DELAY_MS)
        return true
      }

      const isRoutingPending = (response) =>
        response !== null && typeof response === "object"
        && response.ok !== true && response.code === SESSION_ROUTING_PENDING_CODE

      const rememberFulfilled = () => {
        const auth = readCurrentAuthScope()
        fulfilledRef.current = {
          socket: getSocket(),
          gameId: useInGameStore.getState().gameId,
          authUuid: auth.accountId,
          identityGeneration: auth.identityGeneration,
          identityScopeVersion: getInGameIdentityScopeVersion(),
        }
      }

      let ackPromise = null
      try {
        ackPromise = requestSocket
          .timeout(ackTimeoutMs)
          .emitWithAck("get_session_snapshot", requestGameId ? { gameId: requestGameId } : {})
      } catch {
        if (!isStaleNow() && scheduleRetry()) return
        settleUnapplied()
        return
      }

      ackPromise
        .then((response) => {
          const scopeOnArrival = readScopeNow()
          if (isStaleNow()) {
            finishRebindUnapplied(scopeOnArrival)
            return
          }
          if (isRoutingPending(response) && scheduleRetry()) return
          if (hasConflictingNightObservation(response)) {
            if (scheduleRetry()) return
            settleUnapplied()
            return
          }
          if (!requestGameId) {
            if (response?.ok !== true) {
              finishRebindUnapplied(scopeOnArrival)
              setBootstrapStatus("missing")
              return
            }
            useInGameStore.getState().bootstrapSessionSnapshot(response, receiptContext)
            const recovered = Boolean(useInGameStore.getState().gameId)
            if (recovered) {
              rememberFulfilled()
              finishRebindApplied(scopeOnArrival)
            } else {
              finishRebindUnapplied(scopeOnArrival)
            }
            setBootstrapStatus(recovered ? "recovered" : "missing")
            return
          }
          const seqBefore = useInGameStore.getState().snapshotSeq
          useInGameStore.getState().applySessionSnapshot(response, receiptContext)
          if (useInGameStore.getState().snapshotSeq !== seqBefore) {
            rememberFulfilled()
            finishRebindApplied(scopeOnArrival)
            return
          }
          finishRebindUnapplied(scopeOnArrival)
        })
        .catch(() => {
          if (!isStaleNow() && scheduleRetry()) return
          settleUnapplied()
        })
    }

    const handleConnect = () => {
      epochVersionRef.current += 1
      if (useInGameStore.getState().gameId) setIdentityRebindPending(true)
      cancelScheduledRetry()

      const scheduledEpochVersion = epochVersionRef.current
      const scheduledSocket = socket
      queueMicrotask(() => {
        if (!mountedRef.current) return
        if (epochVersionRef.current !== scheduledEpochVersion) return
        if (getSocket() !== scheduledSocket) return
        requestSnapshot()
      })
    }

    socket.on("connect", handleConnect)

    if (socket.connected) {
      requestSnapshot()
    }

    return () => {
      socket.off("connect", handleConnect)
      socket.off("night_presentation_wait", observeWaitNotice)
      socket.off("night_turn_started", observeTurnStart)
      nightObservationsRef.current = new Map()
      cancelScheduledRetry()
    }
  }, [socket, gameId, authUuid, identityGeneration, identityScopeVersion])

  return bootstrapStatus
}

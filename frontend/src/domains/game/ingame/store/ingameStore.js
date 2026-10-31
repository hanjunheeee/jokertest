import { create } from "zustand"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { applyTribunalResolvedPure } from "./applyTribunalResolved.js"
import { applyPlayerEliminatedPure } from "./applyPlayerEliminated.js"
import {
  applySessionSnapshotPure,
  bootstrapSessionSnapshotPure,
  normalizeRoomSettingsSourceForStore,
} from "./applySessionSnapshot.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../utils/dayVoteRound.js"

const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

const CLEARED_NIGHT_PRIVATE_RESULT = Object.freeze({ nightPrivateResult: null })

function clearNightPrivateResultOnNightEntry(current) {
  return current.state?.phase === "NIGHT" ? null : CLEARED_NIGHT_PRIVATE_RESULT
}

function readSelfMembershipId(state) {
  const me = state?.self?.uuid ?? null
  if (!me) return null
  return (state?.players ?? []).find((player) => player?.uuid === me)?.membershipId ?? null
}

const EMPTY_NIGHT_SUCCESS_QUEUE = Object.freeze([])
const nightSuccessRecords = new Map()
let nightSuccessStoreApi = null

function cancelNightSuccessRecords() {
  if (nightSuccessRecords.size > 0) nightSuccessRecords.clear()
  if (!nightSuccessStoreApi) return
  nightSuccessStoreApi.setState((current) => {
    const patch = {}
    if (current.nightSuccessQueue.length !== 0) patch.nightSuccessQueue = EMPTY_NIGHT_SUCCESS_QUEUE
    if (current.nightPresentationWait !== null) patch.nightPresentationWait = null
    return Object.keys(patch).length === 0 ? current : patch
  })
}

let membershipEpoch = 0
let observedGameId
let observedSelfUuid
let observedMembershipId

let identityScopeVersion = 0
const identityScopeListeners = new Set()

function adoptIdentityScope(gameId, state) {
  const selfUuid = state?.self?.uuid ?? null
  const membershipId = readSelfMembershipId(state)
  if (observedGameId === gameId && observedSelfUuid === selfUuid && observedMembershipId === membershipId) {
    return membershipEpoch
  }
  observedGameId = gameId
  observedSelfUuid = selfUuid
  observedMembershipId = membershipId
  membershipEpoch += 1
  identityScopeVersion += 1
  for (const listener of [...identityScopeListeners]) listener()
  return membershipEpoch
}

export function getInGameIdentityScopeVersion() {
  return identityScopeVersion
}

export function subscribeInGameIdentityScope(listener) {
  identityScopeListeners.add(listener)
  return () => identityScopeListeners.delete(listener)
}

const NO_SOCKET_OBSERVED = Symbol("no-socket-observed")
let socketEpoch = 0
let observedSocket = NO_SOCKET_OBSERVED

function rebindConnectionScope() {
  const next = getSocket() ?? null
  if (observedSocket === next) return
  observedSocket = next
  socketEpoch += 1
  cancelNightSuccessRecords()
}

subscribeSocket(rebindConnectionScope)
rebindConnectionScope()

export function noteInGameConnectionRebound() {
  socketEpoch += 1
  cancelNightSuccessRecords()
}

export function readInGameReceiptScope({ accountId = null, identityGeneration = null } = {}) {
  const { gameId, state } = useInGameStore.getState()
  const socket = getSocket()
  return {
    accountId,
    identityGeneration,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch,
    socketId: socket?.id ?? null,
    socketConnected: socket?.connected === true,
  }
}

export function isSameInGameReceiptScope(a, b) {
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false
  return a.accountId === b.accountId
    && a.identityGeneration === b.identityGeneration
    && a.gameId === b.gameId
    && a.membershipId === b.membershipId
    && a.membershipEpoch === b.membershipEpoch
    && a.socketEpoch === b.socketEpoch
    && a.socketId === b.socketId
    && a.socketConnected === b.socketConnected
}

function isReceiptScopeCurrent(receipt, current) {
  if (receipt === null || typeof receipt !== "object") return false
  if (receipt.gameId !== (current.gameId ?? null)) return false
  if (receipt.membershipId !== readSelfMembershipId(current.state)) return false
  if (receipt.membershipEpoch !== membershipEpoch) return false
  if (receipt.socketEpoch !== socketEpoch) return false
  if (receipt.socketId !== (getSocket()?.id ?? null)) return false
  if (receipt.socketConnected !== (getSocket()?.connected === true)) return false
  return true
}

function claimsForeignMembership(current, nextState) {
  const currentMembershipId = readSelfMembershipId(current.state)
  if (currentMembershipId === null) return false
  const nextMembershipId = readSelfMembershipId(nextState)
  if (nextMembershipId === null) return false
  return nextMembershipId !== currentMembershipId
}

function buildSnapshotResultOwner(receipt, gameId, state, snapshotSeq) {
  if (receipt === null || typeof receipt !== "object") return null
  if (!state?.nightResult) return null
  return Object.freeze({
    accountId: receipt.accountId ?? null,
    identityGeneration: receipt.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch: receipt.socketEpoch,
    socketId: receipt.socketId,
    socketConnected: receipt.socketConnected,
    snapshotSeq,
  })
}

let terminalResultScope = null
let observedWinResult = null

let commitReceiptScope = null

function commitWithReceipt(receipt, set, updater) {
  const previous = commitReceiptScope
  commitReceiptScope = receipt ?? null
  try {
    return set((current) => {
      if (receipt !== null && receipt !== undefined && !isReceiptScopeCurrent(receipt, current)) return current
      return updater(current)
    })
  } finally {
    commitReceiptScope = previous
  }
}

function buildTerminalResultScope(receipt, gameId, state) {
  const socket = getSocket()
  return Object.freeze({
    accountId: receipt?.accountId ?? null,
    identityGeneration: receipt?.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch,
    socketId: socket?.id ?? null,
    socketConnected: socket?.connected === true,
  })
}

function isTerminalResultScopeCurrent(recorded, currentScope, current) {
  if (recorded === null || typeof recorded !== "object") return false
  if (recorded.accountId === null || recorded.identityGeneration === null) return false
  if (!isSameInGameReceiptScope(recorded, currentScope)) return false
  return isReceiptScopeCurrent(recorded, current)
}

export function isTerminalResultFromOtherAccount(currentScope) {
  const winResult = useInGameStore.getState().state?.winResult ?? null
  if (!winResult) return false
  if (winResult !== observedWinResult) return false
  if (terminalResultScope === null) return false
  if (terminalResultScope.accountId === null || terminalResultScope.identityGeneration === null) return false
  if (currentScope === null || typeof currentScope !== "object") return false
  return terminalResultScope.accountId !== currentScope.accountId
    || terminalResultScope.identityGeneration !== currentScope.identityGeneration
}

const SELF_SUBMISSION_KEYS = Object.freeze([
  "hasAcknowledgedRoleReveal",
  "isDayVoteReady",
  "hasSubmittedDayVote",
  "dayVoteTargetUuid",
  "dayVoteRound",
  "hasSubmittedTribunalVote",
])

function isPublicProgressShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.kind !== "string" || value.kind.length === 0) return false
  const okCount = (n) => n === null || (Number.isInteger(n) && n >= 0)
  return okCount(value.doneCount) && okCount(value.requiredCount)
}

export function isCurrentGameKickEvent(store, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  const sameId = (mine, theirs) =>
    typeof mine === "string" && mine.length > 0 && mine === theirs

  if (!sameId(payload.gameId, store?.gameId)) return false

  const state = store?.state ?? null
  if (!sameId(payload.roomInstanceId, state?.roomInstanceId)) return false
  if (!sameId(payload.bootEpoch, state?.bootEpoch)) return false

  const seated = (state?.players ?? []).find((player) => player?.uuid === payload.targetUuid)
  if (!seated) return false
  return sameId(payload.targetMembershipId, seated.membershipId)
}

const NIGHT_SUCCESS_TYPES = new Set(["KILL", "HEAL", "INVESTIGATE", "CONFIRM"])
const NIGHT_SUCCESS_PERSPECTIVES = new Set(["USER", "TARGET"])
const NIGHT_SUCCESS_OUTCOMES = new Set(["COMPLETED", "ERROR", "SKIPPED"])

function isValidNightSuccessPayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return false
  if (typeof payload.eventId !== "string" || payload.eventId.length === 0) return false
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return false
  if (!NIGHT_SUCCESS_TYPES.has(payload.type)) return false
  if (!Array.isArray(payload.perspectives) || payload.perspectives.length === 0) return false
  const seenPerspectives = new Set()
  for (const perspective of payload.perspectives) {
    if (!NIGHT_SUCCESS_PERSPECTIVES.has(perspective)) return false
    if (seenPerspectives.has(perspective)) return false
    seenPerspectives.add(perspective)
  }
  if (payload.perspectives.includes("USER")) {
    if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return false
  }
  return true
}

function buildNightSuccessQueueEntry(payload) {
  const entry = {
    eventId: payload.eventId,
    gameId: payload.gameId,
    nightDayIndex: payload.nightDayIndex,
    type: payload.type,
    perspectives: [...payload.perspectives],
  }
  if (payload.perspectives.includes("USER")) entry.targetId = payload.targetId
  return Object.freeze(entry)
}

function clearNightSuccessQueue() {
  nightSuccessRecords.clear()
  return { nightSuccessQueue: EMPTY_NIGHT_SUCCESS_QUEUE }
}

function shouldClearNightSuccessOnNightEntry(beforeState, afterState) {
  if (afterState?.phase !== "NIGHT") return false
  if (beforeState?.phase === "NIGHT" && beforeState?.dayIndex === afterState?.dayIndex) return false
  return true
}

function clearNightSuccessOnNightEntry(beforeState, afterState) {
  if (!shouldClearNightSuccessOnNightEntry(beforeState, afterState)) return {}
  return clearNightSuccessQueue()
}

const NIGHT_SUCCESS_RESTORE_CONTEXT = Object.freeze({ mode: "RESTORE" })

function isNightSuccessWindowOpen(state, nightDayIndex, restore) {
  const phase = state?.phase ?? null
  const dayIndex = state?.dayIndex ?? null
  if (phase === "NIGHT") return dayIndex === nightDayIndex
  if (restore === null) return false
  if (phase === "DAY" || phase === "TRIBUNAL") return dayIndex === nightDayIndex + 1
  return false
}

function prepareNightSuccessReception(candidate, payload, receiptScope, records, restore = null) {
  if (!isValidNightSuccessPayload(payload)) return { status: "REJECT" }
  if (!candidate?.gameId || !candidate?.state) return { status: "REJECT" }
  if (payload.gameId !== candidate.gameId) return { status: "REJECT" }
  if (!isNightSuccessWindowOpen(candidate.state, payload.nightDayIndex, restore)) return { status: "REJECT" }
  if (receiptScope === null || typeof receiptScope !== "object") return { status: "REJECT" }
  const selfUuid = candidate.state.self?.uuid ?? null
  if (receiptScope.accountId === null || receiptScope.accountId !== selfUuid) return { status: "REJECT" }
  if (receiptScope.gameId !== candidate.gameId) return { status: "REJECT" }
  if (receiptScope.membershipId !== readSelfMembershipId(candidate.state)) return { status: "REJECT" }
  if (restore === null) {
    if (!isReceiptScopeCurrent(receiptScope, candidate)) return { status: "REJECT" }
  }
  if (records.has(payload.eventId)) return { status: "DUPLICATE" }

  const entry = buildNightSuccessQueueEntry(payload)
  return {
    status: "ACCEPT",
    entry,
    record: { scope: receiptScope, entry, completed: false, ackStatus: "pending" },
  }
}

function planNightSuccessRecovery(response, candidate, receiptScope, knownEventIds) {
  if (!Object.hasOwn(response ?? {}, "nightSuccessRecovery")) return { ok: true, entries: [] }
  const raw = response.nightSuccessRecovery
  if (!Array.isArray(raw)) return { ok: false }
  if (raw.length === 0) return { ok: true, entries: [] }
  if (receiptScope === null || typeof receiptScope !== "object") return { ok: false }

  const seen = new Set(knownEventIds)
  const entries = []
  for (const payload of raw) {
    const prepared = prepareNightSuccessReception(
      candidate, payload, receiptScope, seen, NIGHT_SUCCESS_RESTORE_CONTEXT,
    )
    if (prepared.status === "REJECT") return { ok: false }
    if (prepared.status === "DUPLICATE") continue
    seen.add(prepared.entry.eventId)
    entries.push(prepared.entry)
  }
  return { ok: true, entries }
}

function commitNightSuccessRecovery(entries, ownerScope, baseQueue) {
  if (entries.length === 0) return {}
  for (const entry of entries) {
    nightSuccessRecords.set(entry.eventId, {
      scope: ownerScope, entry, completed: false, ackStatus: "pending",
    })
  }
  return { nightSuccessQueue: [...baseQueue, ...entries] }
}

function buildFollowUpReceiptScope(receipt, gameId, state) {
  return Object.freeze({
    accountId: receipt?.accountId ?? null,
    identityGeneration: receipt?.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch,
    socketId: receipt?.socketId ?? null,
    socketConnected: receipt?.socketConnected ?? false,
  })
}

export function readNightSuccessReceiptScope(entry) {
  if (entry === null || typeof entry !== "object") return null
  const eventId = entry.eventId
  if (typeof eventId !== "string" || eventId.length === 0) return null
  const record = nightSuccessRecords.get(eventId)
  if (!record || record.completed === true) return null
  if (record.entry !== entry) return null
  const scope = record.scope
  if (scope === null || typeof scope !== "object") return null
  return Object.freeze({ ...scope })
}

function isValidNightPresentationWaitPayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  const keys = Object.keys(payload)
  if (keys.length !== 3) return false
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return false
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return false
  if (typeof payload.waiting !== "boolean") return false
  return true
}

function isNightPresentationWaitLive(wait, gameId, state) {
  if (wait === null || typeof wait !== "object") return false
  if (!gameId || wait.gameId !== gameId) return false
  if (state?.phase !== "NIGHT") return false
  return state?.dayIndex === wait.nightDayIndex
}

function planNightPresentationWaitRestore(response, candidate, ownerScope, previousWait) {
  const hasKey = Object.hasOwn(response ?? {}, "presentationWaiting")
  if (!hasKey) {
    if (!isNightPresentationWaitLive(previousWait, candidate?.gameId ?? null, candidate?.state ?? null)) {
      return { ok: true, waiting: false }
    }
    if (!isSameInGameReceiptScope(previousWait.scope, ownerScope)) return { ok: true, waiting: false }
    return { ok: true, waiting: true }
  }
  const waiting = response.presentationWaiting
  if (typeof waiting !== "boolean") return { ok: false }
  if (!waiting) return { ok: true, waiting: false }
  if (ownerScope === null || typeof ownerScope !== "object") return { ok: false }
  if (!candidate?.gameId || !candidate?.state) return { ok: false }
  if (candidate.state.phase !== "NIGHT") return { ok: false }
  if (!Number.isInteger(candidate.state.dayIndex) || candidate.state.dayIndex < 0) return { ok: false }
  if (ownerScope.accountId === null || ownerScope.accountId !== (candidate.state.self?.uuid ?? null)) {
    return { ok: false }
  }
  if (ownerScope.gameId !== candidate.gameId) return { ok: false }
  return { ok: true, waiting: true }
}

function commitNightPresentationWait(waiting, ownerScope, gameId, state) {
  if (!waiting) return { nightPresentationWait: null }
  return {
    nightPresentationWait: Object.freeze({
      gameId: gameId ?? null,
      nightDayIndex: state?.dayIndex ?? null,
      scope: ownerScope,
    }),
  }
}

export const useInGameStore = create((set) => ({
  gameId: null,
  state: null,
  error: null,

  hostUuid: null,

  snapshotSeq: 0,

  snapshotResultOwner: null,

  nightSuccessQueue: EMPTY_NIGHT_SUCCESS_QUEUE,

  nightPresentationWait: null,

  nightPrivateResult: null,

  setGamePayload: ({ gameId, state, hostUuid }) =>
    set((current) => {
      const nextGameId = gameId ?? state?.id ?? null
      const serverHostUuid = typeof state?.hostUuid === "string" && state.hostUuid.trim().length > 0
        ? state.hostUuid
        : null
      return {
        gameId: nextGameId,
      state: state
          ? {
              ...state,
              roomCode: typeof state.roomCode === "string" && state.roomCode.length > 0
                ? state.roomCode
        : null,
              roomSettingsSource: normalizeRoomSettingsSourceForStore(state.roomSettingsSource),
              players: Array.isArray(state.players)
                ? state.players.map((p) => ({
                    ...p,
                    alive: typeof p?.isAlive === "boolean" ? p.isAlive : p?.alive !== false,
                    isParticipating: p?.isParticipating !== false,
                  }))
                : state.players,
            }
          : null,
        hostUuid: serverHostUuid
          ?? (typeof hostUuid === "string" && hostUuid.trim().length > 0 ? hostUuid : null),
      error: null,
        snapshotResultOwner: null,
        ...(nextGameId !== current.gameId
          ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...clearNightSuccessQueue(), nightPresentationWait: null }
          : {}),
      }
    }),

  applyPhaseChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      const isFirstDay = payload.phase === "DAY" && payload.dayIndex === 1
      const isLegacyFirstNight = payload.phase === "NIGHT" && payload.dayIndex === 0
      if (!isFirstDay && !isLegacyFirstNight) return current

      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: isFirstDay ? "DAY_DISCUSSION" : null,
        },
        ...(isLegacyFirstNight ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...clearNightSuccessQueue() } : {}),
      }
    }),

  applyPlayerEliminated: (parsed, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => applyPlayerEliminatedPure(current, parsed)),

  applyParticipationChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      if (payload.participationRevision <= (current.state.participationRevision ?? 0)) return current
      if (!Array.isArray(payload.players) || payload.players.length === 0) return current

      const participationByUuid = new Map()
      for (const entry of payload.players) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return current
        if (typeof entry.uuid !== "string" || entry.uuid.length === 0) return current
        if (typeof entry.isParticipating !== "boolean") return current
        if (participationByUuid.has(entry.uuid)) return current
        participationByUuid.set(entry.uuid, entry.isParticipating)
      }
      const canonicalUuids = new Set((current.state.players ?? []).map((p) => p.uuid))
      if (participationByUuid.size !== canonicalUuids.size) return current
      for (const uuid of participationByUuid.keys()) {
        if (!canonicalUuids.has(uuid)) return current
      }

      const nextHostUuid = typeof payload.hostUuid === "string" && payload.hostUuid.length > 0
        ? payload.hostUuid
        : current.hostUuid

      return {
        hostUuid: nextHostUuid,
        state: {
          ...current.state,
          hostUuid: nextHostUuid,
          participationRevision: payload.participationRevision,
          players: (current.state.players ?? []).map((p) => ({
            ...p,
            isParticipating: participationByUuid.get(p.uuid),
          })),
          ...(isPublicProgressShape(payload.progress)
            ? { progress: { ...payload.progress } }
            : {}),
        },
      }
    }),

  applySelfProgress: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      if (payload.participationRevision < (current.state.participationRevision ?? 0)) return current
      if (payload.self === null || typeof payload.self !== "object" || Array.isArray(payload.self)) return current

      const appliedSeq = current.state.selfProgressSeq ?? 0
      const incomingSeq = payload.selfProgressSeq
      if (Number.isInteger(incomingSeq)) {
        if (incomingSeq <= appliedSeq) return current
      } else if (appliedSeq > 0) {
        return current
      }

      const nextSelf = { ...current.state.self }
      for (const key of SELF_SUBMISSION_KEYS) {
        if (Object.hasOwn(payload.self, key)) nextSelf[key] = payload.self[key]
      }

      return {
        state: {
          ...current.state,
          self: nextSelf,
          ...(Number.isInteger(incomingSeq) ? { selfProgressSeq: incomingSeq } : {}),
          ...(isPublicProgressShape(payload.progress) ? { progress: { ...payload.progress } } : {}),
        },
      }
    }),

  applyNightResultAppliedPayload: (payload, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase === "ENDED") return current

      if (payload.phase === "ENDED") {
        if (!Number.isInteger(payload.dayIndex)) return current
        if (!Array.isArray(payload.players)) return current
        if (payload.dayIndex < current.state.dayIndex) return current

        const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.isAlive]))
        const nextPlayers = current.state.players.map((p) =>
          aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
        )

        return {
          state: {
            ...current.state,
            phase: "ENDED",
            dayIndex: payload.dayIndex,
            dayPhase: null,
            ...CLEARED_NIGHT_TURN,
            players: nextPlayers,
            ...(payload.winResult ? { winResult: payload.winResult } : {}),
          },
        }
      }

      if (payload.phase !== "DAY") return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!Array.isArray(payload.players)) return current
      if (payload.dayIndex <= current.state.dayIndex) return current

      const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.alive]))
      const nextPlayers = current.state.players.map((p) =>
        aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
      )

      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: "DAY_DISCUSSION",
          dayVoteRound: 1,
          dayVoteExcludedUuids: [],
          dayVoteResolution: null,
          ...CLEARED_NIGHT_TURN,
          players: nextPlayers,
        },
      }
    }),

  applyNightTurnStarted: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role.length === 0) return current
      if (!Number.isFinite(parsed.deadline) || parsed.deadline <= 0) return current
      if (current.state.nightTurnRole === parsed.role && current.state.nightTurnDeadline === parsed.deadline) {
        return current
      }

      return {
        state: { ...current.state, nightTurnRole: parsed.role, nightTurnDeadline: parsed.deadline },
        ...(current.nightPresentationWait !== null ? { nightPresentationWait: null } : {}),
      }
    }),

  applyNightTurnEnded: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state || parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role !== current.state.nightTurnRole) return current

      return { state: { ...current.state, ...CLEARED_NIGHT_TURN } }
    }),

  applyDayPhaseChanged: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (parsed.dayPhase !== "DAY_VOTE") return current
      if (current.state.dayPhase === "DAY_VOTE") return current

      return { state: { ...current.state, dayPhase: "DAY_VOTE" } }
    }),

  applyDayVoteResolvedToPhase: (gameId, dayIndex, resolution = {}) =>
    set((current) => {
      const { outcome, defendantUuid, round = 1 } = resolution
      if (typeof gameId !== "string" || gameId.trim().length === 0) return current
      if (!Number.isInteger(dayIndex)) return current
      if (!current.gameId || !current.state) return current
      if (gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (dayIndex !== current.state.dayIndex) return current
      if (round !== getDayVoteRound(current.state)) return current
      const rosterIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const roundFields = parseDayVoteRoundFields(resolution, rosterIds)
      if (!roundFields) return current
      const dayVoteResolution = {
        outcome,
        tribunalTargetUuid: outcome === "TRIBUNAL" ? defendantUuid : null,
        ...roundFields,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
      }

      if (outcome === "REVOTE") {
        if (current.state.dayPhase !== "DAY_VOTE") return current
        return { state: {
          ...current.state,
          dayVoteRound: round + 1,
          dayVoteExcludedUuids: [...roundFields.revoteExcludedUuids],
          dayVoteResolution,
          tribunal: null,
          self: { ...current.state.self, hasActedThisPhase: false },
        } }
      }

      if (outcome === "TRIBUNAL") {
        if (typeof defendantUuid !== "string" || defendantUuid.length === 0) return current
        return { state: { ...current.state, phase: "TRIBUNAL", dayPhase: null, dayVoteResolution, tribunal: { defendantUuid } } }
      }
      if (outcome === "TIE" || outcome === "ABSTAINED") {
        return {
          state: { ...current.state, phase: "NIGHT", dayPhase: null, dayVoteResolution, ...CLEARED_NIGHT_TURN },
          ...CLEARED_NIGHT_PRIVATE_RESULT,
          ...clearNightSuccessQueue(),
        }
      }
      return current
    }),

  applyTribunalResolved: (payload, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => {
      const patch = applyTribunalResolvedPure(current, payload)
      if (patch === current) return current
      if (patch.state?.phase !== "NIGHT") return patch
      return {
        ...patch,
        ...clearNightPrivateResultOnNightEntry(current),
        ...clearNightSuccessOnNightEntry(current.state, patch.state),
      }
    }),

  applySessionSnapshot: (response, receiptContext = null) =>
    commitWithReceipt(receiptContext, set, (current) => {
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      if (claimsForeignMembership(current, patch.state)) return current
      const willClearNightSuccess = shouldClearNightSuccessOnNightEntry(current.state, patch.state)
      const recovery = planNightSuccessRecovery(
        response,
        { gameId: current.gameId ?? null, state: patch.state },
        buildFollowUpReceiptScope(receiptContext, current.gameId ?? null, patch.state),
        willClearNightSuccess ? [] : nightSuccessRecords.keys(),
      )
      if (!recovery.ok) return current
      const waitPlan = planNightPresentationWaitRestore(
        response,
        { gameId: current.gameId ?? null, state: patch.state },
        buildFollowUpReceiptScope(receiptContext, current.gameId ?? null, patch.state),
        current.nightPresentationWait,
      )
      if (!waitPlan.ok) return current
      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(current.gameId ?? null, patch.state)
      const nightEntryPatch = clearNightSuccessOnNightEntry(current.state, patch.state)
      return {
        ...patch,
        ...nightEntryPatch,
        ...commitNightSuccessRecovery(
          recovery.entries,
          buildFollowUpReceiptScope(receiptContext, current.gameId ?? null, patch.state),
          willClearNightSuccess ? EMPTY_NIGHT_SUCCESS_QUEUE : current.nightSuccessQueue,
        ),
        ...commitNightPresentationWait(
          waitPlan.waiting,
          buildFollowUpReceiptScope(receiptContext, current.gameId ?? null, patch.state),
          current.gameId ?? null,
          patch.state,
        ),
        snapshotSeq,
        snapshotResultOwner: buildSnapshotResultOwner(receiptContext, current.gameId ?? null, patch.state, snapshotSeq),
      }
    }),

  bootstrapSessionSnapshot: (response, receiptContext = null) =>
    commitWithReceipt(receiptContext, set, (current) => {
      if (current.gameId || current.state) return current
      if (receiptContext !== null) {
        if (receiptContext.accountId !== null && response?.self?.uuid !== receiptContext.accountId) return current
      }
      const patch = bootstrapSessionSnapshotPure(response)
      if (!patch) return current
      const recovery = planNightSuccessRecovery(
        response,
        { gameId: patch.gameId ?? null, state: patch.state },
        buildFollowUpReceiptScope(receiptContext, patch.gameId ?? null, patch.state),
        [],
      )
      if (!recovery.ok) return current
      const waitPlan = planNightPresentationWaitRestore(
        response,
        { gameId: patch.gameId ?? null, state: patch.state },
        buildFollowUpReceiptScope(receiptContext, patch.gameId ?? null, patch.state),
        null,
      )
      if (!waitPlan.ok) return current
      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(patch.gameId ?? null, patch.state)
      return {
        ...patch,
        error: null,
        snapshotSeq,
        snapshotResultOwner: buildSnapshotResultOwner(receiptContext, patch.gameId ?? null, patch.state, snapshotSeq),
        ...CLEARED_NIGHT_PRIVATE_RESULT,
        ...clearNightSuccessQueue(),
        ...commitNightSuccessRecovery(
          recovery.entries,
          buildFollowUpReceiptScope(receiptContext, patch.gameId ?? null, patch.state),
          EMPTY_NIGHT_SUCCESS_QUEUE,
        ),
        ...commitNightPresentationWait(
          waitPlan.waiting,
          buildFollowUpReceiptScope(receiptContext, patch.gameId ?? null, patch.state),
          patch.gameId ?? null,
          patch.state,
        ),
      }
    }),

  invalidateUnconfirmedTerminalResult: (currentScope = null) =>
    set((current) => {
      if (!current.gameId || !current.state) return current
      if (current.state.phase !== "ENDED") return current
      if (!current.state.winResult) return current
      if (current.state.winResult === observedWinResult
        && isTerminalResultScopeCurrent(terminalResultScope, currentScope, current)) return current
      return { state: { ...current.state, winResult: null } }
    }),

  setNightPrivateResult: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (!current.gameId || parsed.gameId !== current.gameId) return current
      return { nightPrivateResult: parsed }
    }),

  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : CLEARED_NIGHT_PRIVATE_RESULT)),

  receiveNightSuccess: (payload, receiptScope = null) =>
    set((current) => {
      const prepared = prepareNightSuccessReception(current, payload, receiptScope, nightSuccessRecords)
      if (prepared.status !== "ACCEPT") return current

      nightSuccessRecords.set(prepared.entry.eventId, prepared.record)
      return { nightSuccessQueue: [...current.nightSuccessQueue, prepared.entry] }
    }),

  receiveNightPresentationWait: (payload, receiptScope = null) =>
    set((current) => {
      if (!isValidNightPresentationWaitPayload(payload)) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (current.state.dayIndex !== payload.nightDayIndex) return current
      if (receiptScope === null || typeof receiptScope !== "object") return current
      if (receiptScope.accountId === null || receiptScope.accountId !== (current.state.self?.uuid ?? null)) {
        return current
      }
      if (receiptScope.gameId !== current.gameId) return current
      if (receiptScope.membershipId !== readSelfMembershipId(current.state)) return current
      if (!isReceiptScopeCurrent(receiptScope, current)) return current

      if (!payload.waiting) {
        return current.nightPresentationWait === null ? current : { nightPresentationWait: null }
      }
      const existing = current.nightPresentationWait
      if (existing !== null
        && existing.gameId === payload.gameId
        && existing.nightDayIndex === payload.nightDayIndex
        && isSameInGameReceiptScope(existing.scope, receiptScope)) {
        return current
      }
      return {
        nightPresentationWait: Object.freeze({
          gameId: payload.gameId,
          nightDayIndex: payload.nightDayIndex,
          scope: receiptScope,
        }),
      }
    }),

  completeNightSuccess: (eventId, receiptScope = null, outcome = "COMPLETED") => {
    if (!NIGHT_SUCCESS_OUTCOMES.has(outcome)) return { status: "noop" }
    const record = nightSuccessRecords.get(eventId)
    if (!record || record.completed) return { status: "noop" }
    if (receiptScope === null || typeof receiptScope !== "object") return { status: "noop" }
    if (!isSameInGameReceiptScope(record.scope, receiptScope)) return { status: "noop" }

    let removed = false
    set((current) => {
      if (!isReceiptScopeCurrent(receiptScope, current)) return current
      const filtered = current.nightSuccessQueue.filter((item) => item.eventId !== eventId)
      if (filtered.length === current.nightSuccessQueue.length) return current
      removed = true
      return { nightSuccessQueue: filtered.length === 0 ? EMPTY_NIGHT_SUCCESS_QUEUE : filtered }
    })
    if (!removed) return { status: "noop" }
    if (nightSuccessRecords.get(eventId) !== record) return { status: "noop" }

    record.completed = true

    const socket = getSocket()
    if (!socket || typeof socket.emit !== "function") {
      record.ackStatus = "send_failed"
      return { status: "send_failed" }
    }
    try {
      socket.emit(
        "acknowledge_night_action_success",
        {
          gameId: record.entry.gameId,
          nightDayIndex: record.entry.nightDayIndex,
          eventId: record.entry.eventId,
          ...(outcome === "ERROR" || outcome === "SKIPPED" ? { outcome } : {}),
        },
        (response) => {
          if (nightSuccessRecords.get(eventId) !== record) return
          record.ackStatus = response && typeof response === "object" && response.ok === true ? "accepted" : "rejected"
        },
      )
    } catch (err) {
      record.ackStatus = "send_failed"
      return { status: "send_failed" }
    }
    return { status: "sent" }
  },

  setGameError: (error) => set({ error }),

  clearGame: () =>
    set({
      gameId: null, state: null, hostUuid: null, error: null,
      snapshotResultOwner: null,
      ...CLEARED_NIGHT_PRIVATE_RESULT,
      ...clearNightSuccessQueue(),
      nightPresentationWait: null,
    }),
}))

nightSuccessStoreApi = useInGameStore

adoptIdentityScope(null, null)

useInGameStore.subscribe((next) => {
  const membershipEpochBeforeAdopt = membershipEpoch
  adoptIdentityScope(next.gameId ?? null, next.state ?? null)
  if (membershipEpoch !== membershipEpochBeforeAdopt) cancelNightSuccessRecords()

  if (next.nightPresentationWait !== null
    && !isNightPresentationWaitLive(next.nightPresentationWait, next.gameId ?? null, next.state ?? null)) {
    useInGameStore.setState({ nightPresentationWait: null })
  }

  const nextWinResult = next.state?.winResult ?? null
  if (nextWinResult === observedWinResult) return
  observedWinResult = nextWinResult
  terminalResultScope = nextWinResult
    ? buildTerminalResultScope(commitReceiptScope, next.gameId ?? null, next.state ?? null)
    : null
})

let observedAuthIdentityGeneration = useAuthStore.getState().identityGeneration ?? null
useAuthStore.subscribe((state) => {
  const nextGeneration = state.identityGeneration ?? null
  if (nextGeneration === observedAuthIdentityGeneration) return
  observedAuthIdentityGeneration = nextGeneration
  cancelNightSuccessRecords()
})

export const selectInGameState = (store) => store.state

export const selectNightSuccessQueue = (store) => store.nightSuccessQueue

export const selectNightPresentationWait = (store) => store.nightPresentationWait

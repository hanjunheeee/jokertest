const { randomUUID } = require('node:crypto')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('./matchmaking')
const gameResultRepository = require('../repositories/gameResult.repositories')
const voteParticipationRepository = require('../repositories/voteParticipation.repositories')
const achievementService = require('../services/achievementService')
const kickReceiptStore = require('./kickReceiptStore')
const channelMembership = require('./channelMembership')

let recordVoteParticipationImpl = voteParticipationRepository.recordValidDayVoteParticipation

let evaluateAchievementsImpl = achievementService.evaluateAndGrantForUser

function evaluateAchievementsForUsers(userIds, gameId) {
    const settled = []
    for (const userId of userIds) {
        if (typeof userId !== 'string' || !userId) continue
        settled.push(
            Promise.resolve(evaluateAchievementsImpl(userId))
                .catch(() => {
                    console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId, userId })
                }),
        )
    }
    return Promise.all(settled)
}

const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

const JOKER_CHAT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'INVALID_CLOCK_VALUE'])

const GAME_CHAT_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'INVALID_CLOCK_VALUE',
    'INVALID_CHAT_CHANNEL',
    'ID_GENERATION_ERROR',
    'INVALID_MESSAGE_ID',
])

const GAME_CHAT_COMMIT_PUBLIC_CODES = new Set(['GAME_ALREADY_ENDED'])

const CHAT_EVENT_BY_CHANNEL = Object.freeze({
    DAY: 'day_chat_message_received',
    DEAD: 'dead_chat_message_received',
})

const RESOLVE_NIGHT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

const RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

const CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'TRIBUNAL_STATE_NOT_FOUND',
    'TRIBUNAL_CONTEXT_MISMATCH',
    'TRIBUNAL_RESOLUTION_MISMATCH',
])

const RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TRIBUNAL_STATE_NOT_FOUND'])

let onlineUsersRegistry = null

let registryGeneration = 0

const connectionOwnershipBySocket = new WeakMap()
const connectionOwnershipByUuid = new Map()

function setOnlineUsersRegistry(registry) {
    onlineUsersRegistry = registry
    registryGeneration += 1
    connectionOwnershipByUuid.clear()
}

function namespaceRegistryFor(socket, io = null) {
    const fromIo = io?.sockets?.sockets
    if (fromIo && typeof fromIo.get === 'function') return fromIo
    const fromSocket = socket?.nsp?.sockets
    if (fromSocket && typeof fromSocket.get === 'function') return fromSocket
    return null
}

function recordConnectionOwnership(io, socket, uuid) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return null
    if (typeof uuid !== 'string' || uuid.length === 0) return null
    if (socket.data?.user?.uuid !== uuid) return null
    if (!(onlineUsersRegistry instanceof Map)) return null
    if (onlineUsersRegistry.get(uuid) !== socket.id) return null
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace || namespace.get(socket.id) !== socket) return null

    const record = {
        socket,
        socketId: socket.id,
        uuid,
        registry: onlineUsersRegistry,
        generation: registryGeneration,
    }
    connectionOwnershipBySocket.set(socket, record)
    connectionOwnershipByUuid.set(uuid, record)
    return record
}

function canProcessDisconnectFor(io, socket, uuid) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if (socket.data?.user?.uuid !== uuid) return false
    if (!(onlineUsersRegistry instanceof Map)) return false

    const namespace = namespaceRegistryFor(socket, io)
    const present = namespace ? namespace.get(socket.id) : undefined
    if (present !== undefined) {
        return present === socket && onlineUsersRegistry.get(uuid) === socket.id
    }

    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return false
    if (owned.socket !== socket || owned.socketId !== socket.id || owned.uuid !== uuid) return false
    if (owned.registry !== onlineUsersRegistry || owned.generation !== registryGeneration) return false
    if (connectionOwnershipByUuid.get(uuid) !== owned) return false
    if (socket.connected !== false) return false
    if (onlineUsersRegistry.get(uuid) !== owned.socketId) return false
    return true
}

function consumeConnectionOwnership(socket, uuid) {
    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return
    connectionOwnershipBySocket.delete(socket)
    if (connectionOwnershipByUuid.get(uuid) === owned) connectionOwnershipByUuid.delete(uuid)
}

let emitToUserImpl = null

function setEmitToUser(emit) {
    emitToUserImpl = typeof emit === 'function' ? emit : null
}

function isCurrentSocketForUuid(uuid, socket, io = null) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if (socket.data?.user?.uuid !== undefined && socket.data.user.uuid !== uuid) return false
    if (!(onlineUsersRegistry instanceof Map)) return false
    if (onlineUsersRegistry.get(uuid) !== socket.id) return false
    if (socket.connected !== true) return false
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace) return false
    return namespace.get(socket.id) === socket
}

function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, logFields, ownership)
}

function isEligibleSessionRecipient(session, socket, uuid, endContext = null) {
    if (!session || !socket) return false
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if (!gameSessionCore.isParticipatingInSession(session, uuid)) return false
    if (endContext && !isEligibleSessionEndRecipient(session, uuid, endContext)) return false
    if (socket.connected !== true) return false
    if (onlineUsersRegistry instanceof Map && !isCurrentSocketForUuid(uuid, socket)) return false
    if (!socket.rooms?.has?.(session.channelId)) return false
    if (typeof socket.id === 'string'
        && channelMembership.isSocketExcludedFromChannel(session.channelId, socket.id)) {
        return false
    }
    return true
}

function stillEligibleForDelivery(session, recipientSocket) {
    return isEligibleSessionRecipient(session, recipientSocket, recipientSocket?.data?.user?.uuid ?? null)
}

function hasMembershipOutsideSession(session, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId !== session.id) return true
    try {
        if (matchmaking.hasRoomMembership(uuid) === true) return true
    } catch (err) {
    }
    return false
}

function isEligibleSessionEndRecipient(session, uuid, endContext) {
    if (endContext.gameId !== session.id) return false
    if (!endContext.allowed.has(uuid)) return false
    if (endContext.preExcluded.has(uuid)) return false
    if (hasMembershipOutsideSession(session, uuid)) return false
    return true
}

function buildSessionEndContext(session, leftUuid, cleanupUuids) {
    const allowed = new Set()
    const preExcluded = new Set()
    for (const candidate of cleanupUuids ?? []) {
        if (typeof candidate !== 'string' || candidate.length === 0) continue
        if (candidate === leftUuid) continue
        if (!gameSessionCore.isParticipatingInSession(session, candidate)) continue
        if (hasMembershipOutsideSession(session, candidate)) {
            preExcluded.add(candidate)
            continue
        }
        allowed.add(candidate)
    }
    return { gameId: session.id, channelId: session.channelId, allowed, preExcluded }
}

function collectIneligibleChannelSocketIds(io, session, endContext = null) {
    const ineligible = []
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return ineligible
    for (const s of [...registry.values()]) {
        if (typeof s?.id !== 'string') continue
        if (!s.rooms?.has?.(session.channelId)) continue
        if (isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)) continue
        ineligible.push(s.id)
    }
    return ineligible
}

function emitToGameChannel(io, session, event, payload, endContext = null) {
    if (!session || typeof session !== 'object') {
        console.error('[게임 방송 폐기 · 세션 문맥 없음]', { code: 'GAME_EMIT_NO_SESSION_CONTEXT', event })
        return
    }
    const channelId = session.channelId
    if (typeof channelId !== 'string' || channelId.length === 0) return
    const exceptSocketIds = collectIneligibleChannelSocketIds(io, session, endContext)
    const options = {}
    if (exceptSocketIds.length > 0) options.exceptSocketIds = exceptSocketIds
    if (endContext) {
        options.recipientFilter = (s) =>
            isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)
    }
    channelMembership.emitToChannel(
        io, channelId, event, payload,
        Object.keys(options).length > 0 ? options : null,
    )
}

function ownsSessionChannelNow(socket, uuid, channelId) {
    const routing = liveSessionRoutingFor(socket, uuid)
    return routing !== null && routing.channelId === channelId
}

function liveSessionRoutingFor(socket, uuid) {
    if (!isCurrentSocketForUuid(uuid, socket)) return null
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return null
    return gameSessionCore.isForfeitedFromSession(routing.gameId, uuid) ? null : routing
}

function socketHasLiveMembership(socket, uuid) {
    if (liveSessionRoutingFor(socket, uuid) !== null) return true
    if (!isCurrentSocketForUuid(uuid, socket)) return false
    try {
        return matchmaking.hasRoomMembership(uuid) === true
    } catch (err) {
        return false
    }
}

let sessionRoutingWorkSeq = 0
const sessionRoutingWorkBySocket = new WeakMap()
const activeGameIdOwnerBySocket = new WeakMap()

function resyncSessionRouting(socket, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return Promise.resolve()

    if (gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)) return Promise.resolve()

    if (onlineUsersRegistry instanceof Map && !isCurrentSocketForUuid(uuid, socket)) return Promise.resolve()

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId) ?? null
    const membershipId = session?.players?.get(uuid)?.membershipId ?? null
    const socketId = socket?.id ?? null
    const scopeKey = `${routing.gameId} ${routing.channelId} ${uuid} ${socketId ?? ''} ${membershipId ?? ''}`

    const inFlight = sessionRoutingWorkBySocket.get(socket)
    if (inFlight && inFlight.scopeKey === scopeKey) return inFlight.promise

    sessionRoutingWorkSeq += 1
    const token = {
        id: sessionRoutingWorkSeq, scopeKey, socket, socketId, uuid, routing, session, membershipId, ready: false,
    }

    const run = async () => {
    cancelDisconnectGrace(routing.gameId, uuid)

    socket.data.activeGameId = routing.gameId
    activeGameIdOwnerBySocket.set(socket, token)
    if (!socket.rooms.has(routing.channelId)) {
        await socket.join(routing.channelId)

        const current = gameSessionCore.getActiveSessionRoutingInfo(uuid)
        const stillLatest = sessionRoutingWorkBySocket.get(socket)?.token === token
        const stillSameSession =
            gameSessionCore.getActiveSessionForDeparture(uuid, routing.gameId) === token.session
        const stillMine = stillLatest
            && stillSameSession
            && current !== null
            && current.gameId === routing.gameId
            && current.channelId === routing.channelId
            && !gameSessionCore.isForfeitedFromSession(routing.gameId, uuid)
            && isCurrentSocketForUuid(uuid, socket)
            && socket.id === token.socketId
            && (token.session?.players?.get(uuid)?.membershipId ?? null) === token.membershipId
        if (stillMine) {
            token.ready = true
            return
        }

        if (!stillLatest) return

        detachSocketFromChannel(
            socket, routing.channelId, '\x1b[31m[세션 채널 정리 실패]\x1b[0m', { gameId: routing.gameId },
            {
                ownsChannel: () => ownsSessionChannelNow(socket, uuid, routing.channelId),
                keepsConnection: () => socketHasLiveMembership(socket, uuid),
            },
        )
        if (socket.data.activeGameId === routing.gameId && activeGameIdOwnerBySocket.get(socket) === token) {
            socket.data.activeGameId = current !== null ? current.gameId : null
            activeGameIdOwnerBySocket.delete(socket)
        }
        return
    }
    token.ready = true
    }

    const promise = run().finally(() => {
        const current = sessionRoutingWorkBySocket.get(socket)
        if (current && current.token === token) sessionRoutingWorkBySocket.delete(socket)
    })
    sessionRoutingWorkBySocket.set(socket, { scopeKey, token, promise })
    return promise
}

function __resetStateForTests() {
    onlineUsersRegistry = null
    registryGeneration += 1
    connectionOwnershipByUuid.clear()
    emitToUserImpl = null
    kickReceiptStore.__resetKickReceiptsForTests()
    departureResolveMarks.clear()
    nightFinalizeInFlight.clear()
    nightSuccessReceiptsBySession = new WeakMap()
    for (const gameId of [...nightTurnRuns.keys()]) stopNightTurnSequence(gameId)
    for (const gameId of [...dayPhaseRuns.keys()]) stopDayPhaseTimer(gameId)
    for (const [gameId, pending] of [...disconnectGraceRuns]) {
        for (const [uuid, run] of [...pending]) detachDisconnectGraceRun(gameId, uuid, run)
    }
    for (const run of [...terminalPersistRuns.values()]) {
        if (run.timerId !== null) terminalPersistClearTimeout(run.timerId)
        run.timerId = null
    }
    terminalPersistRuns.clear()
    terminalPersistConfirmed.clear()
    terminalPersistBySession = new WeakMap()
    __setTerminalPersistTimersForTests()
}

function persistTerminalSession(session, { completed, disconnectedUuid } = {}) {
    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return
    if (terminalPersistRuns.has(gameId)) return
    if (terminalPersistBySession.get(session)) return
    if (terminalPersistConfirmed.has(gameId)) return

    let record
    let participantUuids
    try {
        record = gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid })
        participantUuids = session?.players instanceof Map
            ? [...session.players.values()].map((p) => p.uuid)
            : []
    } catch (err) {
        console.error('[전적 저장 실패]', { code: 'RECORD_BUILD_ERROR', gameId })
        return
    }

    const run = { gameId, record: deepFreezeRecord(record), participantUuids, attempt: 0, timerId: null }
    terminalPersistRuns.set(gameId, run)
    terminalPersistBySession.set(session, run)
    attemptTerminalPersist(run)
}

function deepFreezeRecord(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreezeRecord(nested)
    return value
}

const terminalPersistRuns = new Map()

const terminalPersistConfirmed = new Set()
const TERMINAL_PERSIST_CONFIRMED_MAX = 4096

let terminalPersistBySession = new WeakMap()

const TERMINAL_PERSIST_RETRY_DELAYS_MS = [1_000, 5_000, 30_000]
const TERMINAL_PERSIST_MAX_DELAY_MS = 60_000

let terminalPersistSetTimeout = setTimeout
let terminalPersistClearTimeout = clearTimeout

function __setTerminalPersistTimersForTests({ setTimeoutFn, clearTimeoutFn } = {}) {
    terminalPersistSetTimeout = setTimeoutFn ?? setTimeout
    terminalPersistClearTimeout = clearTimeoutFn ?? clearTimeout
}

function attemptTerminalPersist(run) {
    run.attempt += 1
    let pending
    try {
        pending = Promise.resolve(gameResultRepository.persistGameResultRecord(run.record))
    } catch (err) {
        pending = Promise.reject(err)
    }
    pending
        .then(() => finishTerminalPersist(run))
        .catch(() => {
            console.error('[전적 저장 실패]', { code: 'PERSIST_ERROR', gameId: run.gameId, attempt: run.attempt })
            scheduleTerminalPersistRetry(run)
        })
}

function scheduleTerminalPersistRetry(run) {
    if (terminalPersistRuns.get(run.gameId) !== run) return
    const delay = TERMINAL_PERSIST_RETRY_DELAYS_MS[run.attempt - 1] ?? TERMINAL_PERSIST_MAX_DELAY_MS
    run.timerId = terminalPersistSetTimeout(() => {
        run.timerId = null
        if (terminalPersistRuns.get(run.gameId) !== run) return
        attemptTerminalPersist(run)
    }, delay)
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
}

function finishTerminalPersist(run) {
    if (terminalPersistRuns.get(run.gameId) === run) terminalPersistRuns.delete(run.gameId)
    terminalPersistConfirmed.add(run.gameId)
    if (terminalPersistConfirmed.size > TERMINAL_PERSIST_CONFIRMED_MAX) {
        terminalPersistConfirmed.delete(terminalPersistConfirmed.values().next().value)
    }
    if (run.timerId !== null) {
        terminalPersistClearTimeout(run.timerId)
        run.timerId = null
    }

    invalidateAccountCaches(run.participantUuids, run.gameId, ['profile'])
    Promise.resolve(evaluateAchievementsForUsers(run.participantUuids, run.gameId))
        .then(() => invalidateAccountCaches(run.participantUuids, run.gameId, ['economy', 'achievements']))
        .catch(() => {
            console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId: run.gameId })
        })
}

function invalidateAccountCaches(uuids, gameId, scopes) {
    const emit = emitToUserImpl
    if (typeof emit !== 'function') return
    for (const uuid of uuids) {
        if (typeof uuid !== 'string' || !uuid) continue
        try {
            emit(uuid, 'account_cache_invalidated', { gameId, scopes: [...scopes] })
        } catch (err) {
            console.error('[캐시 무효화 전달 실패]', { code: 'INVALIDATION_DELIVERY_ERROR', gameId })
        }
    }
}

function __getOnlineUsersRegistryForTests() {
    return onlineUsersRegistry
}

function respond(callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[ack 전달 실패]', err)
    }
}

function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeRoleReveal(uuid, gameId)
    } catch (err) {
        console.error('[역할 확인 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[역할 확인 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respond(callback, { ok: true })

    if (result.transitioned) {
        try {
            emitToGameChannel(io, result.session,'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session))
        } catch (err) {
            console.error('[phase 변경 알림 전송 실패]', err)
        }
        try {
            startDayPhaseTimer(io, result.session)
        } catch (err) {
            console.error('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: result.session.id })
        }
    }
}

function handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeDayVoteReady(uuid, gameId)
    } catch (err) {
        console.error('[낮 투표 준비 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[낮 투표 준비 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    try {
        emitSelfSubmissionProgress(io, result.session, uuid)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_READY', gameId })
    }

    respond(callback, { ok: true, readyCount: result.readyCount, requiredCount: result.requiredCount })

    if (result.transitioned) {
        try {
            emitToGameChannel(io, result.session,
                'day_phase_changed',
                gameSessionCore.buildDayPhaseChangedPayload(result.session),
            )
        } catch (err) {
            console.error('[낮 하위 페이즈 변경 알림 전송 실패]', err)
        }
        try {
            startDayPhaseTimer(io, result.session)
        } catch (err) {
            console.error('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: result.session.id })
        }
    }
}

function respondNightAction(uuid, trustedGameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 제출 ack 전달 실패]', { code: 'CALLBACK_ERROR', uuid, gameId: trustedGameId })
    }
}

const nightTurnRuns = new Map()

let nightSuccessReceiptsBySession = new WeakMap()

const NIGHT_TURN_STAGES = Object.freeze({
    IDLE: 'IDLE',
    SUBMITTING: 'SUBMITTING',
    PRESENTATION_WAIT: 'PRESENTATION_WAIT',
    STOPPED: 'STOPPED',
})

const NIGHT_PRESENTATION_WAIT_DEFAULT_TIMEOUT_MS = 12000
const NIGHT_PRESENTATION_WAIT_MAX_TIMEOUT_MS = 2147483647

function resolveNightPresentationWaitTimeoutMs(deps) {
    const isValidTimeout = (value) =>
        Number.isInteger(value) && value > 0 && value <= NIGHT_PRESENTATION_WAIT_MAX_TIMEOUT_MS

    const injected = deps?.presentationWaitTimeoutMs
    if (isValidTimeout(injected)) return injected

    const fromEnv = Number(process.env.NIGHT_PRESENTATION_WAIT_TIMEOUT_MS)
    if (isValidTimeout(fromEnv)) return fromEnv

    return NIGHT_PRESENTATION_WAIT_DEFAULT_TIMEOUT_MS
}

const NIGHT_PRESENTATION_CONTRACT_VERSION = 1

const NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE = Object.freeze({
    JOKER: 'KILL',
    DOCTOR: 'HEAL',
    GUARD: 'INVESTIGATE',
    WITCH_HUNTER: 'CONFIRM',
})

const NIGHT_PRESENTATION_PERSPECTIVES = Object.freeze(['USER', 'TARGET'])

function computeEmptyTurnDelayMs(durationMs, randomFn = Math.random) {
    const raw = Number(randomFn())
    const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0
    return Math.floor(durationMs * (0.2 + bounded * 0.4))
}

function resolveNightTurnDurationMs(run, role) {
    if (run.durationMs !== null) return run.durationMs

    const timerSettings = run.session.timerSettings
    const roleSeconds = timerSettings?.roleNightActionTimes?.[role]
    if (Number.isInteger(roleSeconds) && roleSeconds > 0) return roleSeconds * 1000

    const fallbackSeconds = timerSettings?.nightActionTime
    if (Number.isInteger(fallbackSeconds) && fallbackSeconds > 0) return fallbackSeconds * 1000

    return gameSessionCore.NIGHT_TURN_DURATION_MS
}

function emitNightTurnEvent(run, event, payload) {
    try {
        emitToGameChannel(run.io, run.session, event, payload)
    } catch (err) {
        console.error('[밤 턴 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id })
    }
}

function advanceNightTurn(run) {
    const { session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.phase !== 'NIGHT') return
    if (session.dayIndex !== run.nightDayIndex) return
    run.index += 1
    const activeTurnOrder = gameSessionCore.getNightTurnOrder(session)
    while (run.index < gameSessionCore.NIGHT_TURN_ORDER.length
        && !activeTurnOrder.includes(gameSessionCore.NIGHT_TURN_ORDER[run.index])) {
        const absentRole = gameSessionCore.NIGHT_TURN_ORDER[run.index]
        let completed
        try {
            completed = gameSessionCore.completeNightRole(session, absentRole)
        } catch (err) {
            completed = { ok: false, code: 'ROLE_COMPLETE_UNEXPECTED_ERROR' }
        }
        if (!completed.ok) {
            console.error('[밤 부재 역할 확정 실패]', { code: completed.code, role: absentRole, gameId: session.id })
            return
        }
        run.index += 1
    }
    if (run.index >= gameSessionCore.NIGHT_TURN_ORDER.length) {
        stopNightTurnSequence(session.id)
        finalizeNightForSession(run.io, session)
        return
    }

    const role = gameSessionCore.NIGHT_TURN_ORDER[run.index]
    session.nightTurnRole = role
    run.stage = NIGHT_TURN_STAGES.SUBMITTING
    const durationMs = resolveNightTurnDurationMs(run, role)
    const deadline = run.nowFn() + durationMs
    run.deadline = deadline
    emitNightTurnEvent(run, 'night_turn_started', gameSessionCore.buildNightTurnStartedPayload(session, role, deadline))

    if (gameSessionCore.getAliveActorUuidsForRole(session, role).length === 0) {
        run.timerId = run.setTimeoutFn(() => endNightTurn(run, role), computeEmptyTurnDelayMs(durationMs, run.randomFn))
        return
    }

    run.timerId = run.setTimeoutFn(() => expireNightTurnWithAbstentions(run, role), durationMs)
    maybeEndNightTurnOnCompletion(session.id)
}

function expireNightTurnWithAbstentions(run, role) {
    const { session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return
    if (run.stage !== NIGHT_TURN_STAGES.SUBMITTING) return

    for (const graceRun of [...(disconnectGraceRuns.get(session.id)?.values() ?? [])]) {
        if (session.players.get(graceRun.uuid)?.role !== role) continue
        expireDisconnectGrace(graceRun)
    }
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return

    for (const actorUuid of gameSessionCore.getAliveActorUuidsForRole(session, role)) {
        if (session.nightActions.has(actorUuid)) continue
        try {
            gameSessionCore.submitNightAction(actorUuid, session.id, null)
        } catch (err) {
            console.error('[밤 턴 만료 기권 기록 실패]', { code: 'ABSTAIN_ERROR', uuid: actorUuid, gameId: session.id })
        }
    }

    endNightTurn(run, role)
}

function cloneNightPresentationContract(contract) {
    return {
        version: contract.version,
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        role: contract.role,
        revision: contract.revision,
        step: { ...contract.step },
        healingClosed: contract.healingClosed,
        events: contract.events.map((event) => ({
            eventId: event.eventId,
            type: event.type,
            targetId: event.targetId,
            actorUuids: [...event.actorUuids],
            recipients: event.recipients.map((recipient) => ({
                uuid: recipient.uuid,
                membershipId: recipient.membershipId,
                socketId: recipient.socketId,
                perspectives: [...recipient.perspectives],
            })),
        })),
        recoveryStates: { ...contract.recoveryStates },
    }
}

function buildNightPresentationRecipients(session, deliverableSocketIdByUuid, actorUuids, targetId) {
    const wanted = new Map()
    for (const uuid of actorUuids) {
        if (typeof uuid !== 'string' || uuid.length === 0) continue
        wanted.set(uuid, new Set(['USER']))
    }
    if (typeof targetId === 'string' && targetId.length > 0) {
        const perspectives = wanted.get(targetId) ?? new Set()
        perspectives.add('TARGET')
        wanted.set(targetId, perspectives)
    }

    const recipients = []
    for (const [uuid, perspectives] of wanted) {
        if (!deliverableSocketIdByUuid.has(uuid)) continue
        recipients.push({
            uuid,
            membershipId: session.players.get(uuid)?.membershipId ?? null,
            socketId: deliverableSocketIdByUuid.get(uuid),
            perspectives: NIGHT_PRESENTATION_PERSPECTIVES.filter((perspective) => perspectives.has(perspective)),
        })
    }
    return recipients
}

function buildNightPresentationContract(run, completed) {
    const { io, session } = run
    const role = completed?.role ?? null
    const revision = completed?.revision ?? null

    const stored = run.contracts.get(role)
    if (stored && stored.revision === revision) return cloneNightPresentationContract(stored)

    const progress = gameSessionCore.getNightProgress(session)
    const step = { ...(completed?.step ?? {}) }

    const recoveryStates = {}
    for (const [uuid, state] of progress?.recoveryStates ?? []) recoveryStates[uuid] = state

    const eventType = NIGHT_PRESENTATION_EVENT_TYPE_BY_ROLE[role] ?? null
    const descriptors = []
    if (eventType === 'KILL' || eventType === 'HEAL') {
        for (const event of progress?.events ?? []) {
            if (event?.type !== eventType) continue
            descriptors.push({ type: event.type, targetId: event.targetId ?? null })
        }
    } else if (eventType !== null && step.status === 'RESOLVED' && typeof step.targetId === 'string') {
        descriptors.push({ type: eventType, targetId: step.targetId })
    }

    const actorUuids = []
    if (descriptors.length > 0) {
        let submissions = []
        try {
            submissions = gameSessionCore.collectRoleNightSubmissions(session, role)
        } catch (err) {
            console.error('[밤 연출 계약 오류]', { code: 'ACTOR_COLLECT_ERROR', role, gameId: session.id })
        }
        const states = gameSessionCore.NIGHT_RECOVERY_STATES
        for (const submission of submissions) {
            if ((submission?.target ?? null) === null) continue
            if (role !== 'DOCTOR') {
                const state = progress?.recoveryStates?.get(submission.actorUuid)
                if (state === states.PENDING_RECOVERY || state === states.DEATH_CANDIDATE) continue
            }
            if (!actorUuids.includes(submission.actorUuid)) actorUuids.push(submission.actorUuid)
        }
    }

    const deliverableSocketIdByUuid = new Map()
    if (descriptors.length > 0) {
        let candidates = []
        try {
            candidates = resolveSessionParticipantSockets(io, session)
        } catch (err) {
            console.error('[밤 연출 계약 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', role, gameId: session.id })
        }
        for (const candidate of candidates) {
            const uuid = candidate?.data?.user?.uuid ?? null
            if (typeof uuid !== 'string' || uuid.length === 0) continue
            if (deliverableSocketIdByUuid.has(uuid)) continue
            if (!stillEligibleForDelivery(session, candidate)) continue
            if (hasMembershipOutsideSession(session, uuid)) continue
            deliverableSocketIdByUuid.set(uuid, typeof candidate.id === 'string' ? candidate.id : null)
        }
    }

    const contract = {
        version: NIGHT_PRESENTATION_CONTRACT_VERSION,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role,
        revision,
        step,
        healingClosed: completed?.healingClosed === true,
        events: descriptors.map((descriptor, index) => ({
            eventId: `night-presentation:${session.id}:${run.nightDayIndex}:${role}:${revision}:${index}`,
            type: descriptor.type,
            targetId: descriptor.targetId,
            actorUuids: [...actorUuids],
            recipients: buildNightPresentationRecipients(session, deliverableSocketIdByUuid, actorUuids, descriptor.targetId),
        })),
        recoveryStates,
    }
    run.contracts.set(role, contract)
    return cloneNightPresentationContract(contract)
}

function buildNightSuccessPayload(contract, event, recipient) {
    const payload = {
        gameId: contract.gameId,
        nightDayIndex: contract.nightDayIndex,
        eventId: event.eventId,
        type: event.type,
        perspectives: [...recipient.perspectives],
    }
    if (recipient.perspectives.includes('USER')) payload.targetId = event.targetId
    return payload
}

function copyNightSuccessPayload(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
    if (typeof payload.gameId !== 'string' || payload.gameId.length === 0) return null
    if (typeof payload.eventId !== 'string' || payload.eventId.length === 0) return null
    if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
    if (typeof payload.type !== 'string' || payload.type.length === 0) return null
    if (!Array.isArray(payload.perspectives) || payload.perspectives.length === 0) return null
    const copy = {
        gameId: payload.gameId,
        nightDayIndex: payload.nightDayIndex,
        eventId: payload.eventId,
        type: payload.type,
        perspectives: [...payload.perspectives],
    }
    if (payload.perspectives.includes('USER')) {
        if (typeof payload.targetId !== 'string' || payload.targetId.length === 0) return null
        copy.targetId = payload.targetId
    }
    return copy
}

function recordNightSuccessReceipt(session, event, recipient, socket, payload = null) {
    const store = nightSuccessReceiptsBySession.get(session)
    if (!store) return { record: null, created: false, refused: false }
    let byUuid = store.byEvent.get(event.eventId)
    if (!byUuid) {
        byUuid = new Map()
        store.byEvent.set(event.eventId, byUuid)
    }
    const existing = byUuid.get(recipient.uuid)
    if (existing) {
        if (existing.membershipId !== recipient.membershipId) {
            return { record: null, created: false, refused: true }
        }
        if (existing.completed !== true && socket) {
            existing.socket = socket
            existing.socketId = typeof socket.id === 'string' ? socket.id : recipient.socketId
        }
        return { record: existing, created: false, refused: false }
    }
    const record = {
        membershipId: recipient.membershipId,
        socketId: recipient.socketId,
        socket,
        completed: false,
        payload: copyNightSuccessPayload(payload),
    }
    byUuid.set(recipient.uuid, record)
    return { record, created: true, refused: false }
}

function discardNightSuccessReceiptIfUncompleted(session, eventId, uuid, failedSocket = null, failedSocketId = null) {
    const byUuid = nightSuccessReceiptsBySession.get(session)?.byEvent.get(eventId)
    const record = byUuid?.get(uuid)
    if (!record || record.completed === true) return
    if (record.socket !== failedSocket) return
    if (record.socketId !== failedSocketId) return
    record.socket = null
    record.socketId = null
}

function emitNightSuccessEvents(run, contract) {
    if (!contract || !Array.isArray(contract.events) || contract.events.length === 0) return
    const { io, session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.id !== contract.gameId) return
    if (session.dayIndex !== contract.nightDayIndex) return

    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.get !== 'function') return

    const deliveredEventSocketPairs = new Set()

    for (const event of contract.events) {
        for (const recipient of event.recipients ?? []) {
            const dedupeKey = `${event.eventId}:${recipient.socketId}`
            if (deliveredEventSocketPairs.has(dedupeKey)) continue

            if (typeof recipient.socketId !== 'string' || recipient.socketId.length === 0) continue
            const recipientSocket = registry.get(recipient.socketId)
            if (!recipientSocket) continue
            if (recipientSocket.data?.user?.uuid !== recipient.uuid) continue
            if (!isCurrentSocketForUuid(recipient.uuid, recipientSocket, io)) continue
            if ((session.players.get(recipient.uuid)?.membershipId ?? null) !== recipient.membershipId) continue
            if (!stillEligibleForDelivery(session, recipientSocket)) continue
            if (hasMembershipOutsideSession(session, recipient.uuid)) continue

            const payload = buildNightSuccessPayload(contract, event, recipient)
            const { record, refused } = recordNightSuccessReceipt(session, event, recipient, recipientSocket, payload)
            if (refused) continue
            if (record && record.completed === true) continue

            deliveredEventSocketPairs.add(dedupeKey)

            const boundSocketId = record ? record.socketId : null
            try {
                recipientSocket.emit('night_action_success', payload)
            } catch (err) {
                console.error('[밤 성공 사건 전달 실패]', { code: 'DELIVERY_ERROR', eventId: event.eventId, gameId: session.id })
                discardNightSuccessReceiptIfUncompleted(session, event.eventId, recipient.uuid, recipientSocket, boundSocketId)
            }
        }
    }
}

function beginNightPresentationWait(run, completed, contract) {
    const { session } = run
    run.waitSeq += 1
    const token = {
        run,
        session,
        gameId: session.id,
        nightDayIndex: run.nightDayIndex,
        role: completed.role,
        revision: completed.revision ?? null,
        waitId: `${session.id}:${run.nightDayIndex}:${completed.role}:${completed.revision}:${run.waitSeq}`,
        contract,
        active: false,
        timerId: null,
        waiting: null,
        notifyTargets: null,
    }
    run.stage = NIGHT_TURN_STAGES.PRESENTATION_WAIT
    run.wait = token
    session.nightTurnRole = null
    return token
}

function releaseNightPresentationWait(run, token) {
    if (!run || !token) return false
    if (token.run !== run) return false
    const { session } = run
    if (token.session !== session) return false
    if (nightTurnRuns.get(session.id) !== run) return false
    if (token.gameId !== session.id) return false
    if (token.nightDayIndex !== run.nightDayIndex) return false
    if (session.phase !== 'NIGHT') return false
    if (session.dayIndex !== run.nightDayIndex) return false
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return false
    if (run.wait !== token) return false

    if (token.timerId !== null && token.timerId !== undefined) {
        run.clearTimeoutFn(token.timerId)
    }
    token.timerId = null
    token.active = false

    run.wait = null
    run.stage = NIGHT_TURN_STAGES.IDLE

    try {
        emitNightPresentationWait(run, token, false)
    } catch (err) {
        console.error('[연출 대기 해제 통지 오류]', { code: 'RELEASE_NOTIFY_ERROR', gameId: session.id })
    }

    advanceNightTurn(run)
    return true
}

function isNightPresentationWaitActive(gameId) {
    const run = nightTurnRuns.get(gameId)
    return !!run && run.stage === NIGHT_TURN_STAGES.PRESENTATION_WAIT
}

function isAccountCurrentlyEligibleForWait(run, session, uuid, membershipId) {
    if (typeof uuid !== 'string' || uuid.length === 0) return false
    if ((session.players.get(uuid)?.membershipId ?? null) !== membershipId) return false
    const socket = getCurrentSocketForUuid(run.io, uuid)
    if (!socket) return false
    if (!isEligibleSessionRecipient(session, socket, uuid)) return false
    if (hasMembershipOutsideSession(session, uuid)) return false
    return true
}

function emitNightPresentationWait(run, token, waiting) {
    const { session } = run
    const targets = token.notifyTargets ?? []
    if (targets.length === 0) return
    const registry = run.io?.sockets?.sockets
    if (!registry || typeof registry.get !== 'function') return

    for (const target of targets) {
        const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(target.uuid) : undefined
        if (typeof socketId !== 'string' || socketId.length === 0) continue
        const targetSocket = registry.get(socketId)
        if (!targetSocket) continue
        if (targetSocket.data?.user?.uuid !== target.uuid) continue
        if (!isCurrentSocketForUuid(target.uuid, targetSocket, run.io)) continue
        if ((session.players.get(target.uuid)?.membershipId ?? null) !== target.membershipId) continue
        if (!stillEligibleForDelivery(session, targetSocket)) continue
        if (hasMembershipOutsideSession(session, target.uuid)) continue

        try {
            targetSocket.emit('night_presentation_wait', {
                gameId: session.id,
                nightDayIndex: token.nightDayIndex,
                waiting,
            })
        } catch (err) {
            console.error('[연출 대기 알림 전송 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
        }
    }
}

function activateNightPresentationWait(run, token) {
    if (!run || !token) return
    if (token.run !== run) return
    const { session } = run
    if (token.session !== session) return
    if (nightTurnRuns.get(session.id) !== run) return
    if (token.gameId !== session.id) return
    if (token.nightDayIndex !== run.nightDayIndex) return
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return
    if (run.wait !== token) return

    const contract = token.contract
    const waiting = new Map()
    let hasEvents = false
    let anyCurrentlyEligible = false
    if (contract && Array.isArray(contract.events)) {
        for (const event of contract.events) {
            for (const recipient of event.recipients ?? []) {
                if (typeof recipient.uuid !== 'string' || recipient.uuid.length === 0) continue
                hasEvents = true
                let byUuid = waiting.get(event.eventId)
                if (!byUuid) {
                    byUuid = new Map()
                    waiting.set(event.eventId, byUuid)
                }
                const membershipId = recipient.membershipId ?? null
                byUuid.set(recipient.uuid, membershipId)
                if (!anyCurrentlyEligible && isAccountCurrentlyEligibleForWait(run, session, recipient.uuid, membershipId)) {
                    anyCurrentlyEligible = true
                }
            }
        }
    }

    token.waiting = waiting

    if (!hasEvents || !anyCurrentlyEligible) {
        releaseNightPresentationWait(run, token)
        return
    }

    const waitingUuids = new Set()
    for (const byUuid of waiting.values()) {
        for (const uuid of byUuid.keys()) waitingUuids.add(uuid)
    }

    const notifyTargets = []
    try {
        const candidates = resolveSessionParticipantSockets(run.io, session)
        for (const candidate of candidates) {
            const uuid = candidate?.data?.user?.uuid ?? null
            if (typeof uuid !== 'string' || uuid.length === 0) continue
            if (waitingUuids.has(uuid)) continue
            if (!stillEligibleForDelivery(session, candidate)) continue
            if (hasMembershipOutsideSession(session, uuid)) continue
            notifyTargets.push({ uuid, membershipId: session.players.get(uuid)?.membershipId ?? null })
        }
    } catch (err) {
        console.error('[연출 대기 통지 대상 계산 오류]', { code: 'NOTIFY_TARGET_ERROR', gameId: session.id })
    }
    token.notifyTargets = notifyTargets

    try {
        emitNightPresentationWait(run, token, true)
    } catch (err) {
        console.error('[연출 대기 통지 오류]', { code: 'ACTIVATE_NOTIFY_ERROR', gameId: session.id })
    }

    token.active = true
    token.timerId = run.setTimeoutFn(() => {
        if (run.wait !== token) return
        releaseNightPresentationWait(run, token)
    }, run.presentationWaitTimeoutMs)

    reevaluateNightPresentationWait(run, token)
}

function reevaluateNightPresentationWait(run, token) {
    if (!run || !token) return
    if (token.run !== run) return
    const { session } = run
    if (token.session !== session) return
    if (nightTurnRuns.get(session.id) !== run) return
    if (token.gameId !== session.id) return
    if (token.nightDayIndex !== run.nightDayIndex) return
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return
    if (run.wait !== token) return
    if (token.active !== true) return

    const waiting = token.waiting
    if (!waiting) return

    for (const [eventId, byUuid] of [...waiting]) {
        for (const [uuid, membershipId] of [...byUuid]) {
            if (!isAccountCurrentlyEligibleForWait(run, session, uuid, membershipId)) {
                byUuid.delete(uuid)
            }
        }
        if (byUuid.size === 0) waiting.delete(eventId)
    }

    const store = nightSuccessReceiptsBySession.get(session)
    for (const [eventId, byUuid] of waiting) {
        const eventRecords = store?.byEvent.get(eventId)
        for (const uuid of byUuid.keys()) {
            const record = eventRecords?.get(uuid)
            if (!record || record.completed !== true) return
        }
    }

    releaseNightPresentationWait(run, token)
}

function endNightTurn(run, role) {
    const { session } = run
    if (nightTurnRuns.get(session.id) !== run) return
    if (session.nightTurnRole !== role) return
    if (run.stage !== NIGHT_TURN_STAGES.SUBMITTING) return

    let completed
    try {
        completed = gameSessionCore.completeNightRole(session, role)
    } catch (err) {
        completed = { ok: false, code: 'ROLE_COMPLETE_UNEXPECTED_ERROR' }
    }
    if (!completed.ok) {
        console.error('[밤 역할 확정 실패]', { code: completed.code, role, gameId: session.id })
        return
    }

    let contract = null
    try {
        contract = buildNightPresentationContract(run, completed)
    } catch (err) {
        console.error('[밤 연출 계약 오류]', { code: 'CONTRACT_BUILD_ERROR', role, gameId: session.id })
    }

    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    run.deadline = null

    const wait = beginNightPresentationWait(run, completed, contract)
    if (contract) {
        try {
            emitNightSuccessEvents(run, contract)
        } catch (err) {
            console.error('[밤 성공 사건 전달 오류]', { code: 'SUCCESS_EVENT_ERROR', role, gameId: session.id })
        }
    }
    emitNightTurnEvent(run, 'night_turn_ended', gameSessionCore.buildNightTurnEndedPayload(session, role))
    activateNightPresentationWait(run, wait)
}

function maybeEndNightTurnOnCompletion(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    const role = gameSessionCore.getCurrentNightTurnRole(run.session)
    if (role === null) return
    if (gameSessionCore.getAliveActorUuidsForRole(run.session, role).length === 0) return
    if (!gameSessionCore.isRoleTurnComplete(run.session, role)) return
    endNightTurn(run, role)
}

function startNightTurnSequence(io, session, deps = {}) {
    if (!session || session.phase !== 'NIGHT') return null
    expireDisconnectGracesAtPhaseBoundary(session)
    if (session.phase !== 'NIGHT') return null
    const existing = nightTurnRuns.get(session.id)
    if (existing) return existing

    const storedReceipts = nightSuccessReceiptsBySession.get(session)
    if (!storedReceipts || storedReceipts.nightDayIndex !== session.dayIndex) {
        nightSuccessReceiptsBySession.set(session, { nightDayIndex: session.dayIndex, byEvent: new Map() })
    }

    const run = {
        io,
        session,
        index: -1,
        timerId: null,
        deadline: null,
        nightDayIndex: session.dayIndex,
        stage: NIGHT_TURN_STAGES.IDLE,
        wait: null,
        waitSeq: 0,
        contracts: new Map(),
        randomFn: deps.randomFn ?? Math.random,
        nowFn: deps.nowFn ?? Date.now,
        setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
        clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
        durationMs: deps.turnDurationMs ?? null,
        presentationWaitTimeoutMs: resolveNightPresentationWaitTimeoutMs(deps),
    }
    nightTurnRuns.set(session.id, run)
    gameSessionCore.markNightSequenced(session)
    advanceNightTurn(run)
    return run
}

function stopNightTurnSequence(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    run.deadline = null
    if (run.wait) {
        if (run.wait.timerId !== null && run.wait.timerId !== undefined) {
            run.clearTimeoutFn(run.wait.timerId)
        }
        run.wait.timerId = null
        run.wait.active = false
    }
    run.wait = null
    run.stage = NIGHT_TURN_STAGES.STOPPED
    nightTurnRuns.delete(gameId)
    delete run.session.nightTurnRole
}

const dayPhaseRuns = new Map()

function emitDayPhaseEvent(run, event, payload) {
    try {
        emitToGameChannel(run.io, run.session, event, payload)
    } catch (err) {
        console.error('[낮 페이즈 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id })
    }
}

function matchesScheduledDayState(run) {
    const { session } = run
    if (session.phase !== 'DAY') return false
    if (session.dayIndex !== run.scheduledFor.dayIndex) return false
    if (gameSessionCore.getDayPhase(session) !== run.scheduledFor.dayPhase) return false
    return gameSessionCore.getDayVoteRound(session) === run.scheduledFor.round
}

function scheduleDayPhaseTimer(run) {
    const { session } = run
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return
    }

    const dayPhase = gameSessionCore.getDayPhase(session)
    const isVote = dayPhase === gameSessionCore.DAY_PHASES.VOTE
    const durationMs = isVote ? run.voteDurationMs : run.discussionDurationMs
    run.scheduledFor = {
        dayIndex: session.dayIndex,
        dayPhase,
        round: gameSessionCore.getDayVoteRound(session),
    }
    run.deadline = run.nowFn() + durationMs
    run.timerId = run.setTimeoutFn(
        isVote ? () => expireDayVoteWithAbstentions(run) : () => expireDayDiscussion(run),
        durationMs,
    )
}

function expireDayDiscussion(run) {
    const { session } = run
    if (dayPhaseRuns.get(session.id) !== run) return
    if (!matchesScheduledDayState(run)) return

    try {
        gameSessionCore.enterDayVotePhase(session)
    } catch (err) {
        console.error('[낮 토론 만료 처리 실패]', { code: 'TRANSITION_ERROR', gameId: session.id })
        return
    }

    emitDayPhaseEvent(run, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
    scheduleDayPhaseTimer(run)
}

function expireDayVoteWithAbstentions(run) {
    const { session } = run
    if (dayPhaseRuns.get(session.id) !== run) return
    if (!matchesScheduledDayState(run)) return

    for (const voterUuid of gameSessionCore.getEligibleDayVoterUuids(session)) {
        if (session.dayVotes.has(voterUuid)) continue
        try {
            gameSessionCore.submitDayVote(voterUuid, session.id, null)
        } catch (err) {
            console.error('[낮 투표 만료 기권 기록 실패]', { code: 'ABSTAIN_ERROR', uuid: voterUuid, gameId: session.id })
        }
    }

    const requesterUuid = session.players.keys().next().value
    let prepared
    try {
        prepared = gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'PREPARE_UNEXPECTED_ERROR', gameId: session.id })
        return
    }
    if (!prepared.ok) {
        console.error('[낮 투표 만료 판정 실패]', { code: prepared.code, gameId: session.id })
        return
    }
    if (prepared.alreadyResolved) {
        scheduleDayPhaseTimer(run)
        return
    }

    let committed
    try {
        committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'COMMIT_ERROR', gameId: session.id })
        return
    }
    if (!committed.ok) {
        console.error('[낮 투표 만료 판정 실패]', { code: committed.code, gameId: session.id })
        return
    }

    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(run.io, session)
    } catch (err) {
        console.error('[낮 투표 만료 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', resolvedPayload)
        } catch (err) {
            console.error('[낮 투표 만료 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
        }
    }

    syncSessionPhaseTimers(run.io, session)
}

function startDayPhaseTimer(io, session, deps = {}) {
    if (!session) return null
    expireDisconnectGracesAtPhaseBoundary(session)
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return null
    }

    let run = dayPhaseRuns.get(session.id)
    if (!run) {
        const timerSettings = session.timerSettings
        const secondsToMs = (seconds, fallbackMs) =>
            Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
        run = {
            io,
            session,
            timerId: null,
            deadline: null,
            scheduledFor: null,
            nowFn: deps.nowFn ?? Date.now,
            setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
            clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
            discussionDurationMs:
                deps.discussionDurationMs ??
                secondsToMs(timerSettings?.dayDiscussionTime, gameSessionCore.DAY_DISCUSSION_DURATION_MS),
            voteDurationMs:
                deps.voteDurationMs ?? secondsToMs(timerSettings?.dayVoteTime, gameSessionCore.DAY_VOTE_DURATION_MS),
        }
        dayPhaseRuns.set(session.id, run)
    }

    scheduleDayPhaseTimer(run)
    return dayPhaseRuns.get(session.id) ?? null
}

function stopDayPhaseTimer(gameId) {
    const run = dayPhaseRuns.get(gameId)
    if (!run) return
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    dayPhaseRuns.delete(gameId)
}

function syncSessionPhaseTimers(io, session) {
    if (!session) return null
    expireDisconnectGracesAtPhaseBoundary(session)

    if (session.phase === 'DAY') {
        stopNightTurnSequence(session.id)
        return startDayPhaseTimer(io, session)
    }

    stopDayPhaseTimer(session.id)
    if (session.phase === 'NIGHT') {
        return startNightTurnSequence(io, session)
    }

    stopNightTurnSequence(session.id)
    return null
}

const disconnectGraceRuns = new Map()

function getDisconnectGraceRun(gameId, uuid) {
    return disconnectGraceRuns.get(gameId)?.get(uuid)
}

function detachDisconnectGraceRun(gameId, uuid, run) {
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
    const pending = disconnectGraceRuns.get(gameId)
    if (!pending) return
    pending.delete(uuid)
    if (pending.size === 0) disconnectGraceRuns.delete(gameId)
}

function beginDisconnectGrace(io, session, uuid, deps = {}) {
    const existing = getDisconnectGraceRun(session.id, uuid)
    if (existing) return existing

    const nightRun = nightTurnRuns.get(session.id)
    const currentRole = gameSessionCore.getCurrentNightTurnRole(session)
    const playerRole = session.players.get(uuid)?.role
    const isOwnNightTurn =
        session.phase === 'NIGHT' &&
        currentRole !== null &&
        currentRole === playerRole &&
        nightRun?.deadline !== null &&
        nightRun?.deadline !== undefined
    const nowFn = deps.nowFn ?? nightRun?.nowFn ?? Date.now

    const run = {
        io,
        session,
        uuid,
        timerId: null,
        phaseAtDisconnect: session.phase,
        deadline: isOwnNightTurn ? nightRun.deadline : null,
        nowFn,
        setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
        clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
    }
    let pending = disconnectGraceRuns.get(session.id)
    if (!pending) {
        pending = new Map()
        disconnectGraceRuns.set(session.id, pending)
    }
    pending.set(uuid, run)
    if (isOwnNightTurn) {
        const remainingMs = Math.max(0, run.deadline - run.nowFn())
        run.timerId = run.setTimeoutFn(() => expireDisconnectGrace(run), remainingMs)
    }
    return run
}

function expireDisconnectGracesAtPhaseBoundary(session) {
    const pending = disconnectGraceRuns.get(session.id)
    if (!pending) return
    for (const run of [...pending.values()]) {
        if (run.phaseAtDisconnect === session.phase) continue
        expireDisconnectGrace(run)
    }
}

function cancelDisconnectGrace(gameId, uuid) {
    const run = getDisconnectGraceRun(gameId, uuid)
    if (!run) return false
    detachDisconnectGraceRun(gameId, uuid, run)
    return true
}

function expireDisconnectGrace(run) {
    const { io, session, uuid } = run
    if (getDisconnectGraceRun(session.id, uuid) !== run) return
    detachDisconnectGraceRun(session.id, uuid, run)

    if (isUuidConnected(io, uuid)) return
    const target = gameSessionCore.getDisconnectGraceTarget(uuid, session.id)
    if (!target || target.session !== session) return

    applyParticipantDeparture(io, session, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' })
}

function emitSelfSubmissionProgress(io, session, onlyUuid = null) {
    if (!session || !(session.players instanceof Map)) return
    let seq = null
    let progress = null
    try {
        seq = gameSessionCore.bumpSelfProgressSeq(session)
        progress = gameSessionCore.buildPublicPhaseProgress(session)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', {
            code: 'SELF_PROGRESS_BUILD_ERROR', gameId: session.id,
        })
        return
    }
    const participationRevision = Number.isSafeInteger(session.participationRevision)
        ? session.participationRevision
        : 0

    for (const player of session.players.values()) {
        if (onlyUuid !== null && player.uuid !== onlyUuid) continue
        if (player.isParticipating === false) continue
        const targetSocket = getSocketForUuid(io, player.uuid)
        if (!targetSocket) continue
        if (!isEligibleSessionRecipient(session, targetSocket, player.uuid)) continue
        try {
            targetSocket.emit('session_self_progress', {
                gameId: session.id,
                phase: session.phase,
                dayIndex: session.dayIndex,
                participationRevision,
                selfProgressSeq: seq,
                progress,
                self: gameSessionCore.buildSelfSubmissionFields(session, player.uuid),
            })
        } catch (err) {
            console.error('[개인 진행 상태 전송 실패]', {
                code: 'SELF_PROGRESS_DELIVERY_ERROR', uuid: player.uuid, gameId: session.id,
            })
        }
    }
}

function applyParticipantDeparture(io, session, uuid, { reason = 'PARTICIPANT_LEFT', onCommitted = null } = {}) {
    let applied
    try {
        applied = gameSessionCore.commitParticipantDeparture(session, uuid, { reason })
    } catch (err) {
        console.error('[참가자 이탈 처리 실패]', { code: 'COMMIT_ERROR', uuid, gameId: session?.id })
        return { ok: false, code: 'INTERNAL_ERROR' }
    }
    if (!applied.ok) return applied

    if (typeof onCommitted === 'function') {
        try {
            onCommitted(applied)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'COMMIT_HOOK_ERROR', uuid, gameId: session.id })
        }
    }

    if (!applied.terminal) markDepartureResolvePending(session)

    try {
        cancelDisconnectGrace(session.id, uuid)
    } catch (err) {
        console.error('[참가자 이탈 처리 실패]', { code: 'GRACE_CANCEL_ERROR', uuid, gameId: session.id })
    }

    if (applied.eliminated) {
        let payload = null
        try {
            payload = gameSessionCore.buildDisconnectEliminationPayload(session, applied.victimUuid)
            if (applied.terminal) {
                payload = { ...payload, ...gameSessionCore.buildTerminalFields(session) }
            }
            payload = {
                ...payload,
                sfxEvent: {
                    eventId: `game:${session.id}:day:${session.dayIndex}:victim:${applied.victimUuid}:eliminated`,
                    gameId: session.id,
                    origin: 'live',
                },
            }
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: session.id })
        }
        if (payload) {
            try {
                emitToGameChannel(io, session,'player_eliminated', payload)
            } catch (err) {
                console.error('[참가자 이탈 처리 실패]', { code: 'DELIVERY_ERROR', uuid, gameId: session.id })
            }
        }
    }

    let participationPayload = null
    try {
        participationPayload = gameSessionCore.buildParticipationChangedPayload(session, applied.victimUuid)
    } catch (err) {
        console.error('[참가자 이탈 처리 실패]', {
            code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId: session.id,
        })
    }
    if (participationPayload) {
        try {
            emitToGameChannel(io, session, 'session_participation_changed', participationPayload)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'PARTICIPATION_DELIVERY_ERROR', uuid, gameId: session.id })
        }
    }

    emitSelfSubmissionProgress(io, session)

    if (applied.tribunalCancelled) {
        try {
            emitToGameChannel(io, session,
                'tribunal_vote_resolved',
                gameSessionCore.buildTribunalVoteResolvedPayload(session),
            )
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'TRIBUNAL_CANCEL_ERROR', uuid, gameId: session.id })
        }
    }

    if (applied.terminal) {
        clearDepartureResolveMark(session.id)
        persistTerminalSession(session, { completed: true })
        try {
            syncSessionPhaseTimers(io, session)
        } catch (err) {
            console.error('[참가자 이탈 처리 실패]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: session.id })
        }
        return applied
    }

    advancePhaseAfterDeparture(io, session, applied)
    return applied
}

function advancePhaseAfterDeparture(io, session, applied) {
    if (applied.tribunalCancelled) {
        try {
            syncSessionPhaseTimers(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
        }
        return
    }

    let advanced = { transitioned: null }
    try {
        advanced = gameSessionCore.advanceStalledPhaseAfterDeparture(session)
    } catch (err) {
        console.error('[이탈 후 단계 진행 실패]', { code: 'ADVANCE_ERROR', gameId: session.id })
    }

    if (advanced.transitioned === 'DAY') {
        try {
            emitToGameChannel(io, session,'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(session))
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'PHASE_DELIVERY_ERROR', gameId: session.id })
        }
        try {
            startDayPhaseTimer(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_START_ERROR', gameId: session.id })
        }
        return
    }

    if (advanced.transitioned === 'DAY_VOTE') {
        try {
            emitToGameChannel(io, session,'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'DAY_PHASE_DELIVERY_ERROR', gameId: session.id })
        }
        try {
            startDayPhaseTimer(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TIMER_START_ERROR', gameId: session.id })
        }
        return
    }

    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        try {
            maybeResolveDayVoteAfterDeparture(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'DAY_VOTE_RESOLVE_ERROR', gameId: session.id })
        }
        return
    }

    if (session.phase === 'TRIBUNAL') {
        try {
            maybeResolveTribunalVoteAfterDeparture(io, session)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TRIBUNAL_RESOLVE_ERROR', gameId: session.id })
        }
        return
    }

    if (session.phase === 'NIGHT') {
        const run = nightTurnRuns.get(session.id)
        if (run && run.stage === NIGHT_TURN_STAGES.PRESENTATION_WAIT && run.wait) {
            try {
                reevaluateNightPresentationWait(run, run.wait)
            } catch (err) {
                console.error('[이탈 후 단계 진행 실패]', { code: 'WAIT_REEVALUATE_ERROR', gameId: session.id })
            }
            return
        }
        try {
            maybeEndNightTurnOnCompletion(session.id)
        } catch (err) {
            console.error('[이탈 후 단계 진행 실패]', { code: 'TURN_COMPLETION_ERROR', gameId: session.id })
        }
    }
}

const departureResolveMarks = new Map()

function departureResolveCoordinate(session) {
    if (!session) return null
    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        return `DAY_VOTE:${session.dayIndex}:${gameSessionCore.getSessionDayVoteRound(session.id)}`
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal && session.tribunal.resolved !== true) {
        return `TRIBUNAL:${session.dayIndex}:${session.tribunal.candidateId}`
    }
    return null
}

function markDepartureResolvePending(session) {
    const coordinate = departureResolveCoordinate(session)
    if (coordinate === null) return
    departureResolveMarks.set(session.id, coordinate)
}

function clearDepartureResolveMark(gameId) {
    departureResolveMarks.delete(gameId)
}

function hasDepartureResolveMark(session) {
    const coordinate = departureResolveCoordinate(session)
    return coordinate !== null && departureResolveMarks.get(session.id) === coordinate
}

function resolveAfterDepartureOnSubmit(io, uuid, gameId) {
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !hasDepartureResolveMark(session)) return
    if (session.phase === 'DAY') {
        maybeResolveDayVoteAfterDeparture(io, session)
        return
    }
    if (session.phase === 'TRIBUNAL') maybeResolveTribunalVoteAfterDeparture(io, session)
}

function pickResolutionRequesterUuid(session) {
    for (const player of session.players.values()) {
        if (!gameSessionCore.isParticipatingInSession(session, player.uuid)) continue
        if (gameSessionCore.getActiveSessionForDeparture(player.uuid, session.id) !== session) continue
        return player.uuid
    }
    return null
}

function maybeResolveDayVoteAfterDeparture(io, session) {
    const requesterUuid = pickResolutionRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok || prepared.alreadyResolved) return

    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    clearDepartureResolveMark(session.id)

    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(io, session)
    } catch (err) {
        console.error('[이탈 후 낮 투표 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', resolvedPayload)
        } catch (err) {
            console.error('[이탈 후 낮 투표 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
        }
    }

    try {
        syncSessionPhaseTimers(io, session)
    } catch (err) {
        console.error('[이탈 후 낮 투표 판정 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
    }
}

function maybeResolveTribunalVoteAfterDeparture(io, session) {
    const requesterUuid = pickResolutionRequesterUuid(session)
    if (!requesterUuid) return

    const prepared = gameSessionCore.prepareTribunalVoteResolution(requesterUuid, session.id, session.dayIndex)
    if (!prepared.ok) return

    const committed = gameSessionCore.commitTribunalVoteResolution(prepared.session, prepared.resolution)
    if (!committed.ok) return

    clearDepartureResolveMark(session.id)

    let resolvedPayload = null
    try {
        resolvedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'PAYLOAD_BUILD_ERROR', gameId: session.id })
    }
    let broadcastPayload = resolvedPayload
    if (committed.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(session)
            broadcastPayload = resolvedPayload ? { ...resolvedPayload, ...terminalFields } : terminalFields
        } catch (err) {
            console.error('[이탈 후 재판 판정 실패]', { code: 'TERMINAL_BUILD_ERROR', gameId: session.id })
        }
        persistTerminalSession(session, { completed: true })
    }

    let recipients = []
    try {
        recipients = resolveSessionParticipantSockets(io, session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'RECIPIENT_RESOLVE_ERROR', gameId: session.id })
    }
    if (broadcastPayload) {
        for (const recipientSocket of recipients) {
            if (!stillEligibleForDelivery(session, recipientSocket)) continue
            try {
                recipientSocket.emit('tribunal_vote_resolved', broadcastPayload)
            } catch (err) {
                console.error('[이탈 후 재판 판정 실패]', { code: 'DELIVERY_ERROR', gameId: session.id })
            }
        }
    }

    try {
        syncSessionPhaseTimers(io, session)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { code: 'TIMER_SYNC_ERROR', gameId: session.id })
    }
}

function handleSubmitNightAction(socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId === gameId && isNightPresentationWaitActive(routing.gameId)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitNightAction(uuid, gameId, targetId)
    } catch (err) {
        console.error('[밤 행동 제출 처리 에러]', { code: 'UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondNightAction(uuid, undefined, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[밤 행동 제출 registry 불일치]', { code: result.code, uuid, gameId: undefined })
            respondNightAction(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondNightAction(uuid, undefined, callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respondNightAction(uuid, result.gameId, callback, { ok: true })

    try {
        maybeEndNightTurnOnCompletion(result.gameId)
    } catch (err) {
        console.error('[밤 턴 종료 처리 에러]', { code: 'TURN_ADVANCE_ERROR', uuid, gameId: result.gameId })
    }
}

function respondJokerChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

function resolveChatRecipientSockets(io, session, channel) {
    const eligibleUuids = new Set(gameSessionCore.getChatRecipientUuids(session, channel))
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        const uuid = s.data?.user?.uuid ?? null
        if (!isEligibleSessionRecipient(session, s, uuid)) continue
        if (!eligibleUuids.has(uuid)) continue
        sockets.push(s)
    }
    return sockets
}

function resolveJokerTeammateSockets(io, session, channel = gameSessionCore.CHAT_CHANNELS.JOKER) {
    return resolveChatRecipientSockets(io, session, channel)
}

function resolveSessionParticipantSockets(io, session) {
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        if (!isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null)) continue
        sockets.push(s)
    }
    return sockets
}

function handleSubmitJokerChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareJokerChatMessage
    const commit = deps.commit ?? gameSessionCore.commitJokerChatMessage
    const resolveTeammateSockets = deps.resolveTeammateSockets ?? resolveJokerTeammateSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (JOKER_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[조커 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondJokerChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let teammateSockets
    try {
        teammateSockets = resolveTeammateSockets(
            io,
            prepared.session,
            prepared.channel ?? gameSessionCore.CHAT_CHANNELS.JOKER,
        )
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = teammateSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[조커 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let rawMessageId
    try {
        rawMessageId = idFn()
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'ID_GENERATION_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        console.error('[조커 채팅 오류]', { code: 'INVALID_MESSAGE_ID', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    const messageId = rawMessageId.trim()

    let committed
    try {
        committed = commit(prepared.session, uuid, prepared.sentAt)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respondJokerChat(uuid, prepared.session.id, callback, { ok: true })

    for (const teammateSocket of teammateSockets) {
        if (!stillEligibleForDelivery(prepared.session, teammateSocket)) continue
        try {
            teammateSocket.emit('joker_chat_message', {
                gameId: prepared.session.id,
                senderUuid: prepared.actorUuid,
                text: prepared.sanitizedText,
                messageId,
                sentAt: prepared.sentAt,
            })
        } catch (err) {
            console.error('[조커 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: prepared.actorUuid, gameId: prepared.session.id })
        }
    }
}

function respondGameChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

function handleSubmitGameChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareGameChatMessage
    const commit = deps.commit ?? gameSessionCore.commitGameChatMessage
    const resolveRecipientSockets = deps.resolveRecipientSockets ?? resolveChatRecipientSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text, { idFn })
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (GAME_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[게임 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondGameChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let recipientSockets
    try {
        recipientSockets = resolveRecipientSockets(io, prepared.session, prepared.channel)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = recipientSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[게임 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const eventName = CHAT_EVENT_BY_CHANNEL[prepared.channel]
    if (typeof eventName !== 'string') {
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_CHANNEL', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let committed
    try {
        committed = commit(prepared)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        if (!GAME_CHAT_COMMIT_PUBLIC_CODES.has(committed.code)) {
            console.error('[게임 채팅 오류]', { code: committed.code, uuid, gameId: prepared.session.id })
            respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    const outbound = committed.message
    if (typeof outbound !== 'object' || outbound === null) {
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_MESSAGE', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondGameChat(uuid, prepared.session.id, callback, { ok: true })

    for (const recipientSocket of recipientSockets) {
        if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
        try {
            recipientSocket.emit(eventName, {
                gameId: outbound.gameId,
                messageId: outbound.messageId,
                senderUuid: outbound.senderUuid,
                nickname: outbound.nickname,
                text: outbound.text,
                sentAt: outbound.sentAt,
                dayIndex: outbound.dayIndex,
            })
        } catch (err) {
            console.error('[게임 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: outbound.senderUuid, gameId: outbound.gameId })
        }
    }
}

function respondResolveNight(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

const NIGHT_COMMIT_INTERNAL_ONLY_CODES = new Set([
    'UNKNOWN_RESOLUTION_SOURCE',
    'STALE_RESOLUTION',
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
])

const nightFinalizeInFlight = new Set()

function finalizeNightForSession(io, session, { prepared = null, deps = {}, onResult = null } = {}) {
    const prepareForSession = deps.prepareForSession ?? gameSessionCore.prepareNightResolutionForSession
    const commit = deps.commit ?? gameSessionCore.commitNightResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (isNightPresentationWaitActive(gameId)) return { ok: false, code: 'ACTIONS_PENDING' }
    if (nightFinalizeInFlight.has(gameId)) return { ok: false, code: 'NIGHT_FINALIZE_IN_PROGRESS' }

    nightFinalizeInFlight.add(gameId)
    try {
        let resolvedPrepared = prepared
        if (!resolvedPrepared) {
            try {
                resolvedPrepared = prepareForSession(session)
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid: undefined, gameId })
                return { ok: false, code: 'INTERNAL_ERROR' }
            }
        }
        if (!resolvedPrepared || resolvedPrepared.ok !== true) {
            return { ok: false, code: resolvedPrepared?.code ?? 'INTERNAL_ERROR' }
        }

        const targetSession = resolvedPrepared.session ?? session
        const resolution = resolvedPrepared.resolution

        let applied
        try {
            applied = commit(targetSession, resolution)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'COMMIT_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            if (onResult) onResult({ ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return { ok: false, code: 'INTERNAL_ERROR' }
        }

        if (!applied.ok) {
            if (NIGHT_COMMIT_INTERNAL_ONLY_CODES.has(applied.code)) {
                console.error('[밤 행동 판정 오류]', { code: 'COMMIT_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                if (onResult) onResult({ ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
                return { ok: false, code: 'INTERNAL_ERROR' }
            }
            if (onResult) onResult({ ok: false, code: applied.code, message: '요청을 처리할 수 없습니다.' })
            return { ok: false, code: applied.code }
        }

        let nightResultAppliedPayload = null
        try {
            nightResultAppliedPayload = gameSessionCore.buildNightResultAppliedPayload(
                targetSession,
                applied.victimUuid,
                resolution.publicDeathReveals,
            )
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
        }

        if (applied.terminal) {
            try {
                const terminalFields = gameSessionCore.buildTerminalFields(targetSession)
                nightResultAppliedPayload = nightResultAppliedPayload
                    ? { ...nightResultAppliedPayload, ...terminalFields }
                    : terminalFields
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            }
            persistTerminalSession(targetSession, { completed: true })
        }

        if (onResult) {
            onResult(nightResultAppliedPayload
                ? { ok: true }
                : { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        }

        try {
            stopNightTurnSequence(targetSession.id)
            startDayPhaseTimer(io, targetSession)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
        }

        let recipients
        try {
            recipients = resolveParticipantSockets(io, targetSession)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            return { ok: true, victimUuid: applied.victimUuid, terminal: applied.terminal ?? null }
        }

        for (const recipientSocket of recipients) {
            if (!stillEligibleForDelivery(targetSession, recipientSocket)) continue
            const recipientUuid = recipientSocket.data?.user?.uuid ?? null
            if (recipientUuid !== null && hasMembershipOutsideSession(targetSession, recipientUuid)) continue

            try {
                recipientSocket.emit('night_actions_resolved', { gameId: targetSession.id, dayIndex: resolution.dayIndex })
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
            }

            const privateResult = resolution.privateResults?.get(recipientUuid)
            if (privateResult !== undefined) {
                try {
                    recipientSocket.emit('night_action_result', {
                        gameId: targetSession.id,
                        dayIndex: resolution.dayIndex,
                        ...privateResult,
                        sfxEvent: {
                            eventId: `game:${targetSession.id}:night:${resolution.dayIndex}:${privateResult.actionType}`,
                            accountId: recipientUuid,
                            gameId: targetSession.id,
                            origin: 'live',
                        },
                    })
                } catch (err) {
                    console.error('[밤 행동 판정 오류]', { code: 'PRIVATE_DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                }
            }

            if (nightResultAppliedPayload) {
                try {
                    recipientSocket.emit('night_result_applied', nightResultAppliedPayload)
                } catch (err) {
                    console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid: onResult?.uuid, gameId: targetSession.id })
                }
            }
        }

        return { ok: true, victimUuid: applied.victimUuid, terminal: applied.terminal ?? null }
    } finally {
        nightFinalizeInFlight.delete(gameId)
    }
}

function handleResolveNight(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareNightResolution

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId === gameId && isNightPresentationWaitActive(routing.gameId)) {
        respondResolveNight(uuid, routing.gameId, callback, { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_NIGHT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[밤 행동 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveNight(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let answered = false
    const onResult = (response) => {
        answered = true
        respondResolveNight(uuid, prepared.session.id, callback, response)
    }
    onResult.uuid = uuid

    const outcome = finalizeNightForSession(io, prepared.session, { prepared, deps, onResult })
    if (!answered) {
        respondResolveNight(uuid, prepared.session.id, callback, outcome?.ok
            ? { ok: true }
            : { ok: false, code: 'NIGHT_ALREADY_RESOLVED', message: '요청을 처리할 수 없습니다.' })
    }
}

function buildDayVoteSubmitSfxEvent(uuid, gameId) {
    let record
    try {
        record = gameSessionCore.readDayVoteSubmitSfxEvent(uuid, gameId)
    } catch (err) {
        return null
    }
    if (record === null) return null
    return {
        kind: 'day-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        round: record.round,
        origin: 'live',
    }
}

function buildTribunalVoteSubmitSfxEvent(uuid, gameId) {
    let record
    try {
        record = gameSessionCore.readTribunalVoteSubmitSfxEvent(uuid, gameId)
    } catch (err) {
        return null
    }
    if (record === null) return null
    return {
        kind: 'tribunal-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        origin: 'live',
    }
}

async function handleSubmitDayVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitDayVote(uuid, gameId, targetId)
    } catch (err) {
        console.error('[낮 투표 제출 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[낮 투표 제출 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    const sfxEvent = buildDayVoteSubmitSfxEvent(uuid, gameId)

    const ackThenResolve = (ackPayload) => {
        try {
            const committed = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
            if (committed) emitSelfSubmissionProgress(io, committed, uuid)
        } catch (err) {
            console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_SUBMIT', gameId })
        }
        respond(callback, ackPayload)
        try {
            resolveAfterDepartureOnSubmit(io, uuid, gameId)
        } catch (err) {
            console.error('[이탈 후 낮 투표 판정 실패]', { code: 'SUBMIT_RESOLVE_ERROR', gameId })
        }
    }

    if (targetId === null) {
        ackThenResolve({ ok: true, sfxEvent })
        return
    }

    if (gameSessionCore.getSessionDayVoteRound(gameId) !== 1) {
        ackThenResolve({ ok: true, sfxEvent })
        return
    }

    const dayIndex = gameSessionCore.getSessionDayIndex(gameId)
    try {
        await recordVoteParticipationImpl({ gameId, dayIndex, userId: uuid })
    } catch (err) {
        console.error('[투표 참여 사건 저장 실패]', { code: 'VOTE_PERSIST_ERROR', uuid, gameId })
        ackThenResolve({
            ok: false,
            code: 'VOTE_PERSIST_FAILED',
            message: '투표 저장에 실패했습니다. 다시 시도해 주세요.',
        })
        return
    }

    ackThenResolve({ ok: true, sfxEvent })
    evaluateAchievementsForUsers([uuid], gameId)
}

function respondResolveDayVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

function handleResolveDayVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareDayVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitDayVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[낮 투표 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (prepared.alreadyResolved) {
        respondResolveDayVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: prepared.resolution.gameId,
            dayIndex: prepared.resolution.dayIndex,
            outcome: prepared.resolution.outcome,
            tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
        })
        return
    }

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respondResolveDayVote(uuid, prepared.session.id, callback, {
        ok: true,
        gameId: prepared.resolution.gameId,
        dayIndex: prepared.resolution.dayIndex,
        outcome: prepared.resolution.outcome,
        tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
    })

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        recipients = []
    }

    const dayVoteResolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(prepared.session, prepared.resolution)

    for (const recipientSocket of recipients) {
        if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
        try {
            recipientSocket.emit('day_vote_resolved', dayVoteResolvedPayload)
        } catch (err) {
            console.error('[낮 투표 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
        }
    }

    try {
        syncSessionPhaseTimers(io, prepared.session)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: prepared.session.id })
    }
}

function respondCastTribunalVote(gameId, dayIndex, requesterUuid, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid, internalCode: 'CALLBACK_ERROR' })
    }
}

function handleCastTribunalVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'STALE_SOCKET',
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    const { gameId, dayIndex, vote } = payload
    if (typeof gameId !== 'string') {
        respondCastTribunalVote(undefined, dayIndex, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondCastTribunalVote(gameId, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }

    let result
    try {
        result = gameSessionCore.submitTribunalVote(uuid, gameId, dayIndex, vote)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: 'UNEXPECTED_ERROR' })
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: result.code })
            respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
                ok: false,
                code: 'INTERNAL_ERROR',
                message: '요청을 처리하지 못했습니다.',
            })
            return
        }
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: result.code,
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }

    respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
        ok: true,
        gameId: result.gameId,
        dayIndex: result.dayIndex,
        vote: result.vote,
        sfxEvent: buildTribunalVoteSubmitSfxEvent(uuid, gameId),
    })

    try {
        const committed = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
        if (committed) emitSelfSubmissionProgress(io, committed, uuid)
    } catch (err) {
        console.error('[개인 진행 상태 전송 실패]', { code: 'SELF_PROGRESS_AFTER_TRIBUNAL_VOTE', gameId })
    }

    try {
        resolveAfterDepartureOnSubmit(io, uuid, gameId)
    } catch (err) {
        console.error('[이탈 후 재판 판정 실패]', { gameId, dayIndex, requesterUuid: uuid, internalCode: 'SUBMIT_RESOLVE_ERROR' })
    }
}

function respondResolveTribunalVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

function handleResolveTribunalVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareTribunalVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitTribunalVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[재판 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let resolvedPayload = null
    try {
        resolvedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: prepared.session.id })
    }

    let broadcastPayload = resolvedPayload
    if (committed.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(prepared.session)
            broadcastPayload = resolvedPayload ? { ...resolvedPayload, ...terminalFields } : terminalFields
        } catch (err) {
            console.error('[재판 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid, gameId: prepared.session.id })
        }
        persistTerminalSession(prepared.session, { completed: true })
    }

    if (!resolvedPayload) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    } else {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: resolvedPayload.gameId,
            dayIndex: resolvedPayload.dayIndex,
            outcome: resolvedPayload.outcome,
            counts: resolvedPayload.counts,
            executedUuid: resolvedPayload.executedUuid,
        })
    }

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        recipients = []
    }

    if (broadcastPayload) {
        for (const recipientSocket of recipients) {
            if (!stillEligibleForDelivery(prepared.session, recipientSocket)) continue
            try {
                recipientSocket.emit('tribunal_vote_resolved', broadcastPayload)
            } catch (err) {
                console.error('[재판 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
            }
        }
    }

    try {
        syncSessionPhaseTimers(io, prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'TIMER_SYNC_ERROR', uuid, gameId: prepared.session.id })
    }
}

function finalizeGameSessionEnd(io, session, reason, leftUuid, cleanupUuids) {
    nightSuccessReceiptsBySession.delete(session)

    let endContext = null
    try {
        endContext = buildSessionEndContext(session, leftUuid, cleanupUuids)
    } catch (err) {
        console.error('[GameSession 종료 수신 문맥 구성 실패]', { code: 'END_CONTEXT_ERROR', gameId: session?.id })
    }

    try {
        const completed = session.phase === 'ENDED' && !!session.winResult
        persistTerminalSession(session, {
            completed,
            disconnectedUuid: completed ? undefined : leftUuid,
        })
    } catch (err) {
        console.error('[GameSession 종료 시 전적 저장 실패]', err)
    }

    try {
        stopNightTurnSequence(session.id)
        stopDayPhaseTimer(session.id)
        clearDepartureResolveMark(session.id)
        for (const [uuid, run] of [...(disconnectGraceRuns.get(session.id) ?? [])]) {
            detachDisconnectGraceRun(session.id, uuid, run)
        }
    } catch (err) {
        console.error('[GameSession 종료 시 타이머 정리 실패]', err)
    }

    try {
        matchmaking.cleanupRoomStateForSessionParticipants(io, cleanupUuids)
    } catch (err) {
        console.error('[GameSession 종료 시 matchmaking 정리 실패]', err)
    }

    try {
        if (endContext) {
            emitToGameChannel(io, session, 'game_ended', { gameId: session.id, reason }, endContext)
        } else {
            console.error('[GameSession 종료 알림 폐기]', { code: 'END_EMIT_DROPPED', gameId: session?.id })
        }
    } catch (err) {
        console.error('[GameSession 종료 알림 전송 실패]', err)
    }

    try {
        const registry = io?.sockets?.sockets
        if (registry && typeof registry.values === 'function') {
            for (const member of [...registry.values()]) {
                if (!member?.rooms?.has?.(session.channelId)) continue
                const memberUuid = member.data?.user?.uuid ?? null
                if (typeof memberUuid !== 'string') continue
                detachSocketFromChannel(
                    member, session.channelId, '[GameSession channel 정리 실패]', { gameId: session.id },
                    {
                        ownsChannel: () => ownsSessionChannelNow(member, memberUuid, session.channelId),
                        keepsConnection: () => socketHasLiveMembership(member, memberUuid),
                    },
                )
            }
        }
    } catch (err) {
        console.error('[GameSession channel 정리 실패]', err)
    }

}

const IDEMPOTENT_DEPARTURE_CODES = new Set(['ALREADY_LEFT', 'NOT_A_PARTICIPANT'])

function handleLeaveGameSession(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const normalizedGameId = gameId.trim()
    if (!normalizedGameId) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    const activeSession = gameSessionCore.getActiveSessionForDeparture(uuid, normalizedGameId)
    if (activeSession && activeSession.phase !== 'ENDED') {
        const departed = applyParticipantDeparture(io, activeSession, uuid, { reason: 'PLAYER_LEFT' })
        if (departed.ok || IDEMPOTENT_DEPARTURE_CODES.has(departed.code)) {
            respond(callback, { ok: true })
        } else {
            respond(callback, {
                ok: false,
                code: departed.code ?? 'INTERNAL_ERROR',
                message: '요청을 처리하지 못했습니다.',
            })
        }
        if (departed.ok) {
            detachSocketFromChannel(
                socket, activeSession.channelId, '[게임 이탈 채널 정리 실패]', { gameId: activeSession.id },
                {
                    ownsChannel: () => ownsSessionChannelNow(socket, uuid, activeSession.channelId),
                    keepsConnection: () => socketHasLiveMembership(socket, uuid),
                },
            )
            try {
                matchmaking.cleanupRoomStateForSessionParticipants(io, [uuid])
            } catch (err) {
                console.error('[게임 이탈 시 matchmaking 정리 실패]', err)
            }
        }
        return
    }

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PLAYER_LEFT', normalizedGameId)
    } catch (err) {
        console.error('[게임 이탈 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        respond(callback, { ok: true })
        return
    }

    respond(callback, { ok: true })
    if (result.sessionDeleted) {
        finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
        return
    }
    try {
        matchmaking.cleanupRoomStateForSessionParticipants(io, [uuid])
    } catch (err) {
        console.error('[ENDED 게임 이탈 시 matchmaking 정리 실패]', err)
    }
}

function isUuidConnected(io, uuid) {
    return getSocketForUuid(io, uuid) !== null
}

function getSocketForUuid(io, uuid) {
    const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(uuid) : undefined
    if (!socketId) return null
    const socket = io?.sockets?.sockets?.get(socketId)
    return socket?.connected === true ? socket : null
}

function resolveNightPresentationWaitingForSnapshot(session, uuid) {
    const run = nightTurnRuns.get(session.id)
    if (!run) return false
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return false
    const token = run.wait
    if (!token || token.active !== true) return false
    if (token.run !== run) return false
    if (token.session !== session) return false
    if (token.gameId !== session.id) return false
    if (session.phase !== 'NIGHT') return false
    if (token.nightDayIndex !== run.nightDayIndex) return false
    if (session.dayIndex !== run.nightDayIndex) return false

    const membershipId = session.players.get(uuid)?.membershipId ?? null
    if (!isAccountCurrentlyEligibleForWait(run, session, uuid, membershipId)) return false

    const contract = token.contract
    if (contract && Array.isArray(contract.events)) {
        for (const event of contract.events) {
            for (const recipient of event.recipients ?? []) {
                if (recipient?.uuid === uuid) return false
            }
        }
    }

    if (Array.isArray(token.notifyTargets)) {
        const already = token.notifyTargets.some(
            (target) => target.uuid === uuid && target.membershipId === membershipId,
        )
        if (!already) token.notifyTargets.push({ uuid, membershipId })
    }
    return true
}

function handleGetSessionSnapshot(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (gameId !== undefined && typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.getSessionSnapshotForPlayer(uuid, gameId)
    } catch (err) {
        console.error('[세션 스냅샷 조회 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[세션 스냅샷 조회 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        if (result.code === 'FORFEITED_FROM_SESSION') {
            respond(callback, {
                ok: false,
                code: result.code,
                message: '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.',
            })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    cancelDisconnectGrace(result.snapshot.gameId, uuid)

    const players = result.snapshot.players.map((player) => ({
        ...player,
        isConnected: isUuidConnected(io, player.uuid),
    }))

    const recoverySession = gameSessionCore.getActiveSessionForDeparture(uuid, result.snapshot.gameId)
    const nightSuccessRecovery = []
    let presentationWaiting = false
    if (recoverySession) {
        if (!isEligibleSessionRecipient(recoverySession, socket, uuid)
            && !socket.rooms?.has?.(recoverySession.channelId)
            && gameSessionCore.getActiveSessionRoutingInfo(uuid)?.channelId === recoverySession.channelId) {
            resyncSessionRouting(socket, uuid).catch((err) => {
                console.error('\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m', err)
            })
            respond(callback, {
                ok: false,
                code: 'SESSION_ROUTING_PENDING',
                message: '게임 정보를 다시 불러오는 중입니다.',
            })
            return
        }

        const receiptStore = nightSuccessReceiptsBySession.get(recoverySession)
        if (receiptStore
            && recoverySession.phase !== 'ENDED'
            && isNightSuccessCompletionWindowOpen(recoverySession, receiptStore.nightDayIndex)) {
            const membershipId = recoverySession.players.get(uuid)?.membershipId ?? null
            const pending = collectPendingNightSuccessRecords(receiptStore, uuid, membershipId)
            if (pending.length > 0
                && isCurrentSocketForUuid(uuid, socket, io)
                && isEligibleSessionRecipient(recoverySession, socket, uuid)
                && !hasMembershipOutsideSession(recoverySession, uuid)) {
                for (const record of pending) {
                    record.socket = socket
                    record.socketId = socket.id
                    nightSuccessRecovery.push(copyNightSuccessPayload(record.payload))
                }
            }
        }

        presentationWaiting = resolveNightPresentationWaitingForSnapshot(recoverySession, uuid)
    }

    respond(callback, {
        ok: true,
        ...result.snapshot,
        players,
        nightSuccessRecovery,
        presentationWaiting,
    })
}

function collectPendingNightSuccessRecords(store, uuid, membershipId) {
    const pending = []
    for (const byUuid of store.byEvent.values()) {
        const record = byUuid.get(uuid)
        if (!record) continue
        if (record.completed === true) continue
        if (record.membershipId !== membershipId) continue
        if (copyNightSuccessPayload(record.payload) === null) continue
        pending.push(record)
    }
    return pending
}

function handleKickGamePlayer(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    const reject = (code, message) => respond(callback, { ok: false, code, message })

    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.GAME)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.GAME, input)

    if (!isCurrentSocketForUuid(uuid, socket)) {
        reject(CODES.STALE_SOCKET, '요청을 처리할 수 없습니다.')
        return
    }

    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond(callback, { ...recorded.result, replayed: true })
        return
    }

    if (input.bootEpoch !== kickReceiptStore.BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 게임 정보를 다시 불러와주세요.')
        return
    }
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.GAME,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, input.gameId)
    if (!session) {
        decideReject(CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }
    if (session.phase === 'ENDED') {
        decideReject(CODES.GAME_ALREADY_ENDED, '이미 종료된 게임입니다.')
        return
    }
    if ((session.roomInstanceId ?? session.roomId) !== input.roomInstanceId || session.roomId !== input.roomId) {
        decideReject(CODES.SESSION_NOT_FOUND, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }

    const requester = session.players.get(uuid)
    if (!requester) {
        decideReject(CODES.NOT_A_PARTICIPANT, '참여 중인 게임을 찾을 수 없습니다.')
        return
    }
    if ((requester.membershipId ?? null) !== input.requesterMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '게임 정보가 변경되었습니다. 다시 불러와주세요.')
        return
    }
    if (session.hostUuid !== uuid) {
        decideReject(CODES.NOT_HOST, '방장만 추방할 수 있습니다.')
        return
    }

    const target = session.players.get(input.targetUuid)
    if (!target) {
        decideReject(CODES.NOT_A_PARTICIPANT, '이 게임의 참가자가 아닙니다.')
        return
    }
    if (!gameSessionCore.isParticipatingInSession(session, input.targetUuid)) {
        decideReject(CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.')
        return
    }
    if ((target.membershipId ?? null) !== input.targetMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.')
        return
    }

    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    const kickedEvent = {
        gameId: session.id,
        roomId: session.roomId,
        roomInstanceId: session.roomInstanceId ?? session.roomId,
        bootEpoch: kickReceiptStore.BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId ?? null,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    const targetSocket = getCurrentSocketForUuid(io, input.targetUuid)

    const result = {
        ok: true,
        status: 'KICKED',
        gameId: session.id,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }

    const departed = applyParticipantDeparture(io, session, input.targetUuid, {
        reason: 'KICKED_BY_HOST',
        onCommitted: () => {
            kickReceiptStore.recordKickReceipt(receiptKey, {
                command: kickReceiptStore.KICK_COMMANDS.GAME,
                fingerprint,
                result,
            })
            detachSocketFromChannel(
                targetSocket, session.channelId, '[추방 채널 이탈 실패]', { gameId: session.id },
                {
                    ownsChannel: () => ownsSessionChannelNow(targetSocket, input.targetUuid, session.channelId),
                    keepsConnection: () => socketHasLiveMembership(targetSocket, input.targetUuid),
                },
            )
        },
    })
    if (!departed.ok) {
        if (departed.code === 'ALREADY_LEFT') {
            decideReject(CODES.ALREADY_LEFT, '이미 게임에서 나간 참가자입니다.')
        } else {
            reject(CODES.INTERNAL_ERROR, '요청을 처리하지 못했습니다.')
        }
        return
    }

    respond(callback, result)
    if (targetSocket) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.GAME_KICKED, kickedEvent)
        } catch (err) {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', gameId: session.id })
        }
    }
    try {
        matchmaking.cleanupRoomStateForSessionParticipants(io, [input.targetUuid])
    } catch (err) {
        console.error('[추방 시 matchmaking 정리 실패]', err)
    }
}

function handleGetKickResult(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: CODES.STALE_SOCKET, message: '요청을 처리할 수 없습니다.' })
        return
    }

    const validated = kickReceiptStore.validateKickResultQuery(payload)
    if (!validated.ok) {
        respond(callback, { ok: false, code: validated.code, message: validated.message })
        return
    }
    const { bootEpoch, requestId } = validated.value

    const recorded = kickReceiptStore.lookupKickReceipt(
        kickReceiptStore.kickReceiptKey(bootEpoch, uuid, requestId),
    )
    if (!recorded) {
        respond(callback, { ok: true, status: 'UNKNOWN', bootEpoch, requestId })
        return
    }
    respond(callback, { ...recorded.result, replayed: true, bootEpoch, requestId })
}

function getCurrentSocketForUuid(io, uuid) {
    const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(uuid) : undefined
    if (!socketId) return null
    const socket = io?.sockets?.sockets?.get(socketId)
    return socket?.connected === true ? socket : null
}

const NIGHT_SUCCESS_ACK_ALLOWED_KEYS = new Set(['gameId', 'nightDayIndex', 'eventId', 'outcome'])
const NIGHT_SUCCESS_OUTCOMES = new Set(['COMPLETED', 'ERROR', 'SKIPPED'])

function isNightSuccessCompletionWindowOpen(session, nightDayIndex) {
    if (session.phase === 'NIGHT') return session.dayIndex === nightDayIndex
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return session.dayIndex === nightDayIndex + 1
    if (session.phase === 'ENDED') return session.dayIndex === nightDayIndex || session.dayIndex === nightDayIndex + 1
    return false
}

function handleAcknowledgeNightActionSuccess(io, socket, uuid, payload, callback) {
    const reply = typeof callback === 'function' ? (result) => respond(callback, result) : () => {}

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const payloadKeys = Object.keys(payload)
    if (payloadKeys.some((key) => !NIGHT_SUCCESS_ACK_ALLOWED_KEYS.has(key))) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, nightDayIndex, eventId } = payload
    if (typeof gameId !== 'string' || gameId.length === 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(nightDayIndex) || nightDayIndex < 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (typeof eventId !== 'string' || eventId.length === 0) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const outcome = 'outcome' in payload ? payload.outcome : 'COMPLETED'
    if (!NIGHT_SUCCESS_OUTCOMES.has(outcome)) {
        reply({ ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    if (!isCurrentSocketForUuid(uuid, socket, io)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (!isNightSuccessCompletionWindowOpen(session, nightDayIndex)) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }

    const store = nightSuccessReceiptsBySession.get(session)
    if (!store || store.nightDayIndex !== nightDayIndex) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }
    const byUuid = store.byEvent.get(eventId)
    if (!byUuid) {
        reply({ ok: false, code: 'STALE_EVENT', message: '더 이상 유효하지 않은 사건입니다.' })
        return
    }
    const record = byUuid.get(uuid)
    if (!record) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (record.socket !== socket || record.socketId !== socket.id) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if ((session.players.get(uuid)?.membershipId ?? null) !== record.membershipId) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (!isEligibleSessionRecipient(session, socket, uuid)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (hasMembershipOutsideSession(session, uuid)) {
        reply({ ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (record.completed) {
        reply({ ok: true, duplicate: true })
        return
    }
    record.completed = true
    record.outcome = outcome
    reply({ ok: true, duplicate: false })

    const run = nightTurnRuns.get(session.id)
    if (run && run.wait && run.wait.waiting && run.wait.waiting.has(eventId)) {
        try {
            reevaluateNightPresentationWait(run, run.wait)
        } catch (err) {
            console.error('[밤 성공 완료 처리 오류]', { code: 'WAIT_REEVALUATE_ERROR', gameId: session.id })
        }
    }
}

function handleSendEmoji(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const reject = (code) => respond(callback, { ok: false, code, message: '요청을 처리할 수 없습니다.' })

    if (!isCurrentSocketForUuid(uuid, socket)) {
        reject('STALE_SOCKET')
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        reject('INVALID_PAYLOAD')
        return
    }
    const { gameId, itemId } = payload
    if (typeof gameId !== 'string' || gameId.length === 0
        || typeof itemId !== 'string' || itemId.length === 0) {
        reject('INVALID_PAYLOAD')
        return
    }

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !isEligibleSessionRecipient(session, socket, uuid)) {
        reject('NOT_PARTICIPANT')
        return
    }

    if (!gameSessionCore.assertSessionNotEnded(session).ok) {
        reject('GAME_ENDED')
        return
    }

    const sentAt = Date.now()
    const rateLimit = session.emojiRateLimit instanceof Map ? session.emojiRateLimit : null
    const lastSentAt = rateLimit?.get(uuid)
    if (typeof lastSentAt === 'number' && sentAt - lastSentAt < gameSessionCore.EMOJI_MIN_INTERVAL_MS) {
        reject('RATE_LIMITED')
        return
    }

    const palette = session.emojiPaletteByUuid instanceof Map
        ? session.emojiPaletteByUuid.get(uuid)
        : null
    if (!Array.isArray(palette?.owned) || !palette.owned.includes(itemId)) {
        reject('NOT_OWNED')
        return
    }
    if (!Array.isArray(palette.slots) || !palette.slots.includes(itemId)) {
        reject('NOT_IN_PALETTE')
        return
    }

    rateLimit?.set(uuid, sentAt)
    emitToGameChannel(io, session, 'emoji_shown', { gameId: session.id, uuid, itemId, sentAt })
    respond(callback, { ok: true, sentAt })
}

function registerGameHandlers(io, socket, uuid) {
    recordConnectionOwnership(io, socket, uuid)
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
    socket.on('ready_for_day_vote', (payload, callback) => handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback))
    socket.on('submit_night_action', (payload, callback) => handleSubmitNightAction(socket, uuid, payload, callback))
    socket.on('submit_joker_chat_message', (payload, callback) => handleSubmitJokerChatMessage(io, socket, uuid, payload, callback))
    socket.on('submit_game_chat_message', (payload, callback) => handleSubmitGameChatMessage(io, socket, uuid, payload, callback))
    socket.on('resolve_night', (payload, callback) => handleResolveNight(io, socket, uuid, payload, callback))
    socket.on('cast_day_vote', (payload, callback) => handleSubmitDayVote(io, socket, uuid, payload, callback))
    socket.on('resolve_day_vote', (payload, callback) => handleResolveDayVote(io, socket, uuid, payload, callback))
    socket.on('cast_tribunal_vote', (payload, callback) => handleCastTribunalVote(io, socket, uuid, payload, callback))
    socket.on('resolve_tribunal_vote', (payload, callback) => handleResolveTribunalVote(io, socket, uuid, payload, callback))
    socket.on('send_emoji', (payload, callback) => handleSendEmoji(io, socket, uuid, payload, callback))
    socket.on('leave_game_session', (payload, callback) => handleLeaveGameSession(io, socket, uuid, payload, callback))
    socket.on('get_session_snapshot', (payload, callback) => handleGetSessionSnapshot(io, socket, uuid, payload, callback))
    socket.on('acknowledge_night_action_success', (payload, callback) =>
        handleAcknowledgeNightActionSuccess(io, socket, uuid, payload, callback))
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_GAME_PLAYER, (payload, callback) =>
        handleKickGamePlayer(io, socket, uuid, payload, callback))
    socket.on(kickReceiptStore.KICK_EVENTS.GET_KICK_RESULT, (payload, callback) =>
        handleGetKickResult(io, socket, uuid, payload, callback))
}

async function onDisconnect(io, socket, uuid) {
    if (!canProcessDisconnectFor(io, socket, uuid)) return
    consumeConnectionOwnership(socket, uuid)

    const expectedGameId = socket?.data?.activeGameId
    if (expectedGameId === undefined) return

    const graceTarget = gameSessionCore.getDisconnectGraceTarget(uuid, expectedGameId)
    if (graceTarget) {
        beginDisconnectGrace(io, graceTarget.session, uuid)
        const graceRun = nightTurnRuns.get(graceTarget.session.id)
        if (graceRun && graceRun.wait) {
            try {
                reevaluateNightPresentationWait(graceRun, graceRun.wait)
            } catch (err) {
                console.error('[연결 종료 처리 실패]', { code: 'WAIT_REEVALUATE_ERROR', gameId: graceTarget.session.id })
            }
        }
        return
    }

    const reconnectState = gameSessionCore.getSessionSnapshotForPlayer(uuid, expectedGameId)
    if (reconnectState.ok && ['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(reconnectState.snapshot.phase)) {
        const survivingRun = nightTurnRuns.get(expectedGameId)
        if (survivingRun && survivingRun.wait) {
            try {
                reevaluateNightPresentationWait(survivingRun, survivingRun.wait)
            } catch (err) {
                console.error('[연결 종료 처리 실패]', { code: 'WAIT_REEVALUATE_ERROR', gameId: expectedGameId })
            }
        }
        return
    }

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PARTICIPANT_LEFT', expectedGameId)
    } catch (err) {
        console.error('[GameSession 종료 처리 에러]', err)
        return
    }
    if (!result.ok) return
    if (!result.sessionDeleted) return

    finalizeGameSessionEnd(io, result.session, result.reason, uuid, result.cleanupUuids)
}

function getActiveGamePresenceSnapshot() {
    return gameSessionCore.getActiveGamePresenceSnapshot()
}

module.exports = {
    registerGameHandlers,
    onDisconnect,
    setOnlineUsersRegistry,
    setEmitToUser,
    isCurrentSocketForUuid,
    resyncSessionRouting,
    getActiveGamePresenceSnapshot,
    KICK_EVENTS: kickReceiptStore.KICK_EVENTS,
    KICK_ERROR_CODES: kickReceiptStore.KICK_ERROR_CODES,
    __resetStateForTests,
    __getOnlineUsersRegistryForTests,
    __testables: {
        handleAcknowledgeRoleReveal,
        handleAcknowledgeDayVoteReady,
        handleSubmitNightAction,
        handleSubmitJokerChatMessage,
        handleSubmitGameChatMessage,
        handleResolveNight,
        finalizeNightForSession,
        endNightTurn,
        handleSubmitDayVote,
        handleResolveDayVote,
        handleCastTribunalVote,
        handleResolveTribunalVote,
        handleLeaveGameSession,
        handleGetSessionSnapshot,
        handleSendEmoji,
        handleKickGamePlayer,
        handleGetKickResult,
        applyParticipantDeparture,
        finalizeGameSessionEnd,
        persistTerminalSession,
        detachSocketFromChannel,
        __getTerminalPersistRunsForTests: () => [...terminalPersistRuns.values()],
        __setTerminalPersistTimersForTests,
        resolveJokerTeammateSockets,
        resolveChatRecipientSockets,
        resolveSessionParticipantSockets,
        emitToGameChannel,
        isEligibleSessionRecipient,
        buildSessionEndContext,
        canProcessDisconnectFor,
        recordConnectionOwnership,
        startNightTurnSequence,
        stopNightTurnSequence,
        buildNightPresentationContract,
        beginNightPresentationWait,
        releaseNightPresentationWait,
        isNightPresentationWaitActive,
        NIGHT_TURN_STAGES,
        activateNightPresentationWait,
        reevaluateNightPresentationWait,
        emitNightPresentationWait,
        resolveNightPresentationWaitTimeoutMs,
        __getNightTurnRunForTests: (gameId) => nightTurnRuns.get(gameId) ?? null,
        buildNightSuccessPayload,
        emitNightSuccessEvents,
        handleAcknowledgeNightActionSuccess,
        __getNightSuccessReceiptsForTests: (session) => nightSuccessReceiptsBySession.get(session) ?? null,
        computeEmptyTurnDelayMs,
        resolveNightTurnDurationMs,
        startDayPhaseTimer,
        stopDayPhaseTimer,
        beginDisconnectGrace,
        cancelDisconnectGrace,
        expireDisconnectGrace,
        getDisconnectGraceRun,
        __setRecordVoteParticipationForTests(fn) {
            recordVoteParticipationImpl = fn ?? voteParticipationRepository.recordValidDayVoteParticipation
        },
        __setEvaluateAchievementsForTests(fn) {
            evaluateAchievementsImpl = fn ?? achievementService.evaluateAndGrantForUser
        },
    },
}

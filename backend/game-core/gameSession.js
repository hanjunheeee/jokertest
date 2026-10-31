const crypto = require('crypto')

const {
    computeRoleComposition,
    getSpecialRoleBudget,
    resolveRoleComposition,
    validateResolvedComposition,
} = require('./roleComposition')
const { buildRoomSettingsView } = require('../utils/updateRoomSettingsValidation')

const ROLE_DEFINITIONS = Object.freeze({
    JOKER: Object.freeze({ team: 'JOKER', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    CITIZEN: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: null, targetMustBeAlive: true }),
    DOCTOR: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    GUARD: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }),
    WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 2, targetMustBeAlive: false }),
})

const GAME_ROLES = Object.freeze(
    Object.fromEntries(Object.keys(ROLE_DEFINITIONS).map((role) => [role, role])),
)
const ROLE_TEAMS = Object.freeze(
    Object.fromEntries(Object.entries(ROLE_DEFINITIONS).map(([role, def]) => [role, def.team])),
)

const ROLE_TO_SKIN_JOB_ID = Object.freeze({
    CITIZEN: 'noble',
    JOKER: 'clown',
    DOCTOR: 'doctor',
    GUARD: 'guard',
    WITCH_HUNTER: 'witchHunter',
})

const MIN_SUPPORTED_PLAYERS = 2
const MAX_SUPPORTED_PLAYERS = 10

const PLAYER_THEME_PALETTE_SIZE = 10

const INITIAL_GAME_PHASE = 'ROLE_REVEAL'
const INITIAL_DAY_INDEX = 0

const DAY_PHASES = Object.freeze({ DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })

const CHAT_MAX_LENGTH = 150
const CHAT_MIN_INTERVAL_MS = 500

const EMOJI_MIN_INTERVAL_MS = 1000

const CHAT_COMMIT_MAX_AGE_MS = 5000

const CHAT_FORBIDDEN_CHARS_PATTERN =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

function sanitizeChatText(rawText) {
    if (typeof rawText !== 'string') return { ok: false, code: 'INVALID_CHARACTERS' }
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (CHAT_FORBIDDEN_CHARS_PATTERN.test(normalized)) {
        return { ok: false, code: 'INVALID_CHARACTERS' }
    }
    const trimmed = normalized.trim()
    if (trimmed.length === 0) return { ok: false, code: 'EMPTY_MESSAGE' }
    if (trimmed.length > CHAT_MAX_LENGTH) return { ok: false, code: 'MESSAGE_TOO_LONG' }
    return { ok: true, text: trimmed }
}

const CHAT_CHANNELS = Object.freeze({
    DAY: 'DAY',
    DEAD: 'DEAD',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, role])),
})

const CHAT_RATE_LIMIT_FIELD_BY_CHANNEL = Object.freeze({
    DAY: 'dayChatRateLimit',
    DEAD: 'deadChatRateLimit',
    ...Object.fromEntries(Object.values(GAME_ROLES).map((role) => [role, 'jokerChatRateLimit'])),
})

function getChatRateLimitMap(session, channel) {
    const field = CHAT_RATE_LIMIT_FIELD_BY_CHANNEL[channel]
    return field ? session[field] : undefined
}

const preparedGameChatCapabilities = new WeakMap()

function createGameChatMessageId(idFn) {
    let rawMessageId
    try {
        rawMessageId = idFn()
    } catch (err) {
        return { ok: false, code: 'ID_GENERATION_ERROR' }
    }
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        return { ok: false, code: 'INVALID_MESSAGE_ID' }
    }
    return { ok: true, messageId: rawMessageId.trim() }
}

function matchesPreparedGameChatCapability(prepared, capability) {
    if (
        prepared.ok !== true ||
        prepared.session !== capability.session ||
        prepared.channel !== capability.channel ||
        prepared.actorUuid !== capability.actorUuid ||
        prepared.nickname !== capability.nickname ||
        prepared.sanitizedText !== capability.text ||
        prepared.sentAt !== capability.sentAt ||
        prepared.dayIndex !== capability.dayIndex
    ) {
        return false
    }

    const message = prepared.message
    if (typeof message !== 'object' || message === null) return false
    const canonical = capability.message
    return (
        message.gameId === canonical.gameId &&
        message.messageId === canonical.messageId &&
        message.senderUuid === canonical.senderUuid &&
        message.nickname === canonical.nickname &&
        message.text === canonical.text &&
        message.sentAt === canonical.sentAt &&
        message.dayIndex === canonical.dayIndex
    )
}

function resolveGameChatChannel(session, actor) {
    if (actor.alive !== true) return { ok: false, code: 'NOT_ELIGIBLE' }
    if (session.phase !== 'DAY' && session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }
    return { ok: true, channel: CHAT_CHANNELS.DAY }
}

function getChatRecipientUuids(session, channel) {
    const uuids = []
    const roleChannel = Object.values(GAME_ROLES).includes(channel)
    for (const player of session.players.values()) {
        if (channel === CHAT_CHANNELS.DAY) {
            uuids.push(player.uuid)
        } else if (roleChannel && player.role === channel) {
            if (player.alive === true || channel === CHAT_CHANNELS.JOKER) uuids.push(player.uuid)
        }
    }
    return uuids
}

const gameSessions = new Map()
const playerSession = new Map()
const roomGameSession = new Map()

function evaluateWinCondition(session) {
    let aliveJokerCount = 0
    let aliveNonJokerCount = 0
    for (const player of session.players.values()) {
        if (!player.alive) continue
        if (player.role === 'JOKER') aliveJokerCount += 1
        else aliveNonJokerCount += 1
    }
    if (aliveJokerCount === 0) return { winner: 'CITIZEN' }
    if (aliveJokerCount >= aliveNonJokerCount) return { winner: 'JOKER' }
    return null
}

let nightCommitObserver = null
let nightCommitObserverBusy = false

function observeNightCommit(event, detail) {
    if (typeof nightCommitObserver !== 'function') return
    nightCommitObserverBusy = true
    try {
        nightCommitObserver(event, detail)
    } catch (err) {
    } finally {
        nightCommitObserverBusy = false
    }
}

function finalizeGameSession(session, winResult) {
    session.phase = 'ENDED'
    session.winResult = winResult
    session.endedAt = Date.now()
    observeNightCommit('GAME_FINALIZED', { gameId: session.id, winner: winResult?.winner ?? null })
}

function assertSessionNotEnded(session) {
    if (session.phase === 'ENDED') return { ok: false, code: 'GAME_ALREADY_ENDED' }
    return { ok: true }
}

function buildTerminalFields(session) {
    const fields = {
        phase: session.phase,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, isAlive: alive })),
    }
    if (session.winResult) fields.winResult = buildPublicWinResult(session)
    return fields
}

function buildPublicWinResult(session) {
    return { ...session.winResult, reveals: buildRoleReveals(session) }
}

function buildRoleReveals(session) {
    return [...session.players.values()].map((player) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        role: player.role,
        team: ROLE_DEFINITIONS[player.role]?.team ?? null,
        alive: player.alive,
        deathReason: player.alive ? null : (player.deathReason ?? null),
    }))
}

const ABORTED_WINNER = 'NONE'
const ABORTED_WIN_REASON = 'ABORTED'

const WIN_REASON_BY_WINNER = Object.freeze({
    CITIZEN: 'ALL_JOKERS_ELIMINATED',
    JOKER: 'JOKER_PARITY_REACHED',
})

const DEATH_REASONS = Object.freeze({
    ASSASSINATION: 'ASSASSINATION',
    EXECUTION: 'EXECUTION',
    DISCONNECT: 'DISCONNECT',
})

function resolveGameSource() {
    if (process.env.GAME_SOURCE_OVERRIDE === 'production') return 'production'
    return process.env.NODE_ENV === 'test' ? 'test' : 'production'
}

function buildGameResultRecord(session, {
    completed = session.phase === 'ENDED' && !!session.winResult,
    disconnectedUuid,
    endedAt = Date.now(),
} = {}) {
    observeNightCommit('RESULT_RECORD_BUILD_STARTED', { gameId: session?.id ?? null, completed })

    const winner = completed ? session.winResult.winner : ABORTED_WINNER
    const resolvedEndedAt = new Date(completed ? session.endedAt ?? endedAt : endedAt)

    const players = []
    const stats = []
    for (const player of session.players.values()) {
        const interruptedLeaver = !completed && player.uuid === disconnectedUuid
        const isAlive = interruptedLeaver ? false : player.alive === true
        const deathReason = isAlive
            ? null
            : interruptedLeaver
                ? DEATH_REASONS.DISCONNECT
                : player.deathReason ?? null
        const team = player.team ?? ROLE_TEAMS[player.role] ?? null
        const won = completed ? team === winner : interruptedLeaver ? false : null

        players.push({
            game_id: session.id,
            user_id: player.uuid,
            nickname_snapshot: player.nickname,
            role: player.role,
            team,
            won,
            is_alive: isAlive,
            death_reason: deathReason,
        })

        if (won === null) continue
        stats.push({
            user_id: player.uuid,
            total_games: 1,
            survival_count: isAlive ? 1 : 0,
            execution_count: deathReason === DEATH_REASONS.EXECUTION ? 1 : 0,
        })
    }

    return {
        result: {
            id: session.id,
            room_id: session.roomId ?? null,
            started_at: new Date(session.startedAt ?? resolvedEndedAt.getTime()),
            ended_at: resolvedEndedAt,
            winner,
            win_reason: completed ? (WIN_REASON_BY_WINNER[winner] ?? null) : ABORTED_WIN_REASON,
            day_index: session.dayIndex,
            player_count: session.players.size,
            settings: {
                jokerCount: session.jokerCount ?? null,
                roleComposition: { ...(session.roleComposition ?? {}) },
                timerSettings: {
                    ...(session.timerSettings ?? {}),
                    roleNightActionTimes: { ...(session.timerSettings?.roleNightActionTimes ?? {}) },
                },
                gameSource: { v: 1, value: session.gameSource ?? resolveGameSource() },
            },
            completed,
        },
        players,
        stats,
    }
}

function getActiveSessionRoutingInfo(uuid) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    return { gameId: session.id, channelId: session.channelId }
}

function isParticipantBlockedFromMatchmaking(uuid) {
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return false
    const session = gameSessions.get(routing.gameId)
    if (!session) return false
    return session.phase !== 'ENDED'
}

function getEndedSessionPartyBroadcastContext(hostUuid) {
    const routing = getActiveSessionRoutingInfo(hostUuid)
    if (!routing) return null
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    if (session.hostUuid !== hostUuid) return null
    const participantUuids = []
    for (const uuid of session.players.keys()) {
        if (uuid === hostUuid) continue
        if (isForfeitedFromSession(session.id, uuid)) continue
        participantUuids.push(uuid)
    }
    return { gameId: session.id, channelId: session.channelId, participantUuids }
}

function getEndedSessionGameIdForParticipant(uuid) {
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return null
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    return session.id
}

function canLookupPartyMatchingRoom(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return false
    if (isForfeitedFromSession(gameId, uuid)) return false
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return false
    return session.players.has(uuid)
}

function getEndedSessionParticipantUuids(gameId, { excludeUuid = null } = {}) {
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return []
    const uuids = []
    for (const uuid of session.players.keys()) {
        if (uuid === excludeUuid) continue
        if (isForfeitedFromSession(gameId, uuid)) continue
        uuids.push(uuid)
    }
    return uuids
}

function getRoomCodeSessionState({ roomCode, roomId } = {}) {
    const normalizedCode = typeof roomCode === 'string' ? roomCode.trim() : ''
    if (!normalizedCode) return null
    const expectedRoomId = typeof roomId === 'string' && roomId ? roomId : null

    for (const session of gameSessions.values()) {
        if (session?.roomCode !== normalizedCode) continue
        if (expectedRoomId !== null && session.roomId !== expectedRoomId) continue
        return { gameId: session.id, roomId: session.roomId ?? null, phase: session.phase }
    }
    return null
}

function isForfeitedFromSession(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session) return false
    return session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)
}

function isParticipatingInSession(session, uuid) {
    const player = session?.players?.get(uuid)
    if (!player) return false
    if (player.isParticipating === false) return false
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) return false
    return true
}

function getDisconnectGraceTarget(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null

    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(session.phase)) return null

    const player = session.players.get(uuid)
    if (!player || player.alive !== true) return null
    if (isForfeitedFromSession(gameId, uuid)) return null

    return { session }
}

function getActiveSessionForDeparture(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!isParticipatingInSession(session, uuid)) return null
    return session
}

function fisherYatesShuffle(items, randomFn) {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

function assignRoles(players, jokerCountOrComposition, randomFn = Math.random) {
    const shuffled = fisherYatesShuffle(players, randomFn)
    const composition =
        typeof jokerCountOrComposition === 'number'
            ? computeRoleComposition(players.length, jokerCountOrComposition)
            : jokerCountOrComposition
    const roles = [
        ...Array(composition.JOKER).fill(GAME_ROLES.JOKER),
        ...Array(composition.DOCTOR).fill(GAME_ROLES.DOCTOR),
        ...Array(composition.GUARD).fill(GAME_ROLES.GUARD),
        ...Array(composition.WITCH_HUNTER).fill(GAME_ROLES.WITCH_HUNTER),
        ...Array(composition.CITIZEN).fill(GAME_ROLES.CITIZEN),
    ]
    return shuffled.map((player, index) => ({ ...player, role: roles[index], alive: true }))
}

function validateSessionInput(players, jokerCount) {
    if (!Array.isArray(players) || players.length === 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'EMPTY_PLAYERS' }
    }
    if (players.length < MIN_SUPPORTED_PLAYERS || players.length > MAX_SUPPORTED_PLAYERS) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'PLAYER_COUNT_OUT_OF_RANGE' }
    }
    const seenUuids = new Set()
    for (const player of players) {
        if (!player || typeof player.uuid !== 'string' || player.uuid.length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_UUID' }
        }
        if (typeof player.nickname !== 'string' || player.nickname.trim().length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_NICKNAME' }
        }
        if (seenUuids.has(player.uuid)) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'DUPLICATE_UUID' }
        }
        seenUuids.add(player.uuid)
    }
    if (!Number.isInteger(jokerCount) || jokerCount < 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_JOKER_COUNT' }
    }
    if (jokerCount >= players.length) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    return { ok: true }
}

function buildTimerSettings(settings) {
    const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : null)

    const rawRoleTimes = settings?.roleNightActionTimes
    const roleNightActionTimes = {}
    if (rawRoleTimes && typeof rawRoleTimes === 'object' && !Array.isArray(rawRoleTimes)) {
        for (const role of NIGHT_TURN_ORDER) {
            const seconds = positiveInt(rawRoleTimes[role])
            if (seconds !== null) roleNightActionTimes[role] = seconds
        }
    }

    return {
        dayDiscussionTime: positiveInt(settings?.dayDiscussionTime),
        dayVoteTime: positiveInt(settings?.dayVoteTime),
        nightActionTime: positiveInt(settings?.nightActionTime),
        roleNightActionTimes,
    }
}

function buildRoomSettingsSource(room) {
    const accessType = room?.accessType === 'open' || room?.accessType === 'code' ? room.accessType : null
    const settingsVersion = Number.isInteger(room?.settingsVersion) ? room.settingsVersion : null
    return { accessType, settingsVersion, settings: buildRoomSettingsView(room?.settings) }
}

function buildSessionCandidate(room, { randomFn, gameIdFn = crypto.randomUUID } = {}) {
    const players = [...room.players.values()]
    const jokerCount = room.settings?.jokerCount ?? 0

    const validation = validateSessionInput(players, jokerCount)
    if (!validation.ok) return validation

    const resolved = resolveRoleComposition(room.settings, players.length)
    if (!resolved.ok) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: `INVALID_ROLE_COMPOSITION:${resolved.reason}` }
    }

    const assigned = assignRoles(players, resolved.composition, randomFn)
    for (const player of assigned) player.isParticipating = true
    const session = {
        id: gameIdFn(),
        startedAt: Date.now(),
        roomId: room.id,
        roomCode: typeof room.code === 'string' && room.code ? room.code : null,
        roomSettingsSource: buildRoomSettingsSource(room),
        channelId: room.id,
        hostUuid: room.hostUuid ?? null,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: room.bootEpoch ?? null,
        participationRevision: 0,
        selfProgressSeq: 0,
        phase: INITIAL_GAME_PHASE,
        dayIndex: INITIAL_DAY_INDEX,
        jokerCount: resolved.composition.JOKER,
        gameSource: resolveGameSource(),
        roleComposition: { ...resolved.composition },
        players: new Map(assigned.map((p) => [p.uuid, p])),
        roleRevealAcks: new Set(),
        nightActions: new Map(),
        jokerChatRateLimit: new Map(),
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
        nightResolution: null,
        nightProgress: null,
        dayVotes: new Map(),
        dayPhase: null,
        dayVoteReadyUuids: new Set(),
        dayVoteRound: 1,
        dayVoteExcludedUuids: new Set(),
        dayVoteResolution: null,
        tribunal: null,
        dayVoteSfx: new Map(),
        timerSettings: buildTimerSettings(room.settings),
    }
    return { ok: true, session }
}

function checkGameSessionPreconditions(room) {
    if (roomGameSession.has(room.id)) {
        return { ok: false, code: 'DUPLICATE_ROOM_SESSION' }
    }
    for (const uuid of room.players.keys()) {
        if (isParticipantBlockedFromMatchmaking(uuid)) {
            return { ok: false, code: 'PLAYER_ALREADY_IN_SESSION' }
        }
    }
    return { ok: true }
}

function prepareGameSession(room, opts) {
    const precondition = checkGameSessionPreconditions(room)
    if (!precondition.ok) return precondition
    return buildSessionCandidate(room, opts)
}

function assertValidSessionForCommit(session) {
    if (!session || typeof session.id !== 'string' || session.id.length === 0) {
        throw new Error('commitGameSession: 잘못된 session.id')
    }
    if (typeof session.roomId !== 'string' || session.roomId.length === 0) {
        throw new Error('commitGameSession: 잘못된 session.roomId')
    }
    if (!(session.players instanceof Map) || session.players.size === 0) {
        throw new Error('commitGameSession: session.players가 비어있거나 Map이 아님')
    }
    if (session.players.size < MIN_SUPPORTED_PLAYERS || session.players.size > MAX_SUPPORTED_PLAYERS) {
        throw new Error(`commitGameSession: 지원하지 않는 인원(${session.players.size})`)
    }
    if (!(session.roleRevealAcks instanceof Set)) {
        throw new Error('commitGameSession: session.roleRevealAcks가 Set이 아님')
    }
    if (session.roleRevealAcks.size !== 0) {
        throw new Error(`commitGameSession: session.roleRevealAcks가 비어있지 않음(size=${session.roleRevealAcks.size})`)
    }
    if (!(session.nightActions instanceof Map)) {
        throw new Error('commitGameSession: session.nightActions가 Map이 아님')
    }
    if (session.nightActions.size !== 0) {
        throw new Error(`commitGameSession: session.nightActions가 비어있지 않음(size=${session.nightActions.size})`)
    }
    for (const field of Object.values(CHAT_RATE_LIMIT_FIELD_BY_CHANNEL)) {
        if (!(session[field] instanceof Map)) {
            throw new Error(`commitGameSession: session.${field}이 Map이 아님`)
        }
        if (session[field].size !== 0) {
            throw new Error(`commitGameSession: session.${field}이 비어있지 않음(size=${session[field].size})`)
        }
    }
    if (session.nightResolution !== null) {
        throw new Error('commitGameSession: session.nightResolution이 null이 아님')
    }
    if (!(session.dayVotes instanceof Map)) {
        throw new Error('commitGameSession: session.dayVotes가 Map이 아님')
    }
    if (session.dayVotes.size !== 0) {
        throw new Error(`commitGameSession: session.dayVotes가 비어있지 않음(size=${session.dayVotes.size})`)
    }
    if (session.dayVoteRound !== 1) {
        throw new Error(`commitGameSession: 잘못된 session.dayVoteRound(${session.dayVoteRound})`)
    }
    if (!(session.dayVoteExcludedUuids instanceof Set)) {
        throw new Error('commitGameSession: session.dayVoteExcludedUuids가 Set이 아님')
    }
    if (session.dayVoteExcludedUuids.size !== 0) {
        throw new Error(
            `commitGameSession: session.dayVoteExcludedUuids가 비어있지 않음(size=${session.dayVoteExcludedUuids.size})`,
        )
    }
    if (session.channelId !== session.roomId) {
        throw new Error('commitGameSession: channelId가 roomId와 일치하지 않음')
    }
    if (session.phase !== INITIAL_GAME_PHASE) {
        throw new Error(`commitGameSession: 잘못된 phase(${session.phase})`)
    }
    if (session.dayIndex !== INITIAL_DAY_INDEX) {
        throw new Error(`commitGameSession: 잘못된 dayIndex(${session.dayIndex})`)
    }
    if (!Number.isInteger(session.jokerCount) || session.jokerCount < 0 || session.jokerCount >= session.players.size) {
        throw new Error(`commitGameSession: 잘못된 session.jokerCount(${session.jokerCount})`)
    }
    const actualCounts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const [key, player] of session.players) {
        if (!player || typeof player.uuid !== 'string' || player.uuid.length === 0) {
            throw new Error('commitGameSession: 잘못된 player.uuid')
        }
        if (key !== player.uuid) {
            throw new Error(`commitGameSession: players Map key(${key})와 player.uuid(${player.uuid}) 불일치`)
        }
        if (typeof player.nickname !== 'string' || player.nickname.trim().length === 0) {
            throw new Error('commitGameSession: 잘못된 player.nickname')
        }
        if (!Object.values(GAME_ROLES).includes(player.role)) {
            throw new Error(`commitGameSession: 허용되지 않은 role(${player.role})`)
        }
        if (player.alive !== true) {
            throw new Error('commitGameSession: 잘못된 player.alive(신규 세션은 전원 생존 상태여야 함)')
        }
        actualCounts[player.role] += 1
    }
    let expected
    if (session.roleComposition === undefined) {
        expected = computeRoleComposition(session.players.size, session.jokerCount)
    } else {
        const compositionCheck = validateResolvedComposition(
            session.roleComposition, session.players.size, session.jokerCount,
        )
        if (!compositionCheck.ok) {
            throw new Error(`commitGameSession: 잘못된 session.roleComposition(${compositionCheck.reason})`)
        }
        expected = session.roleComposition
    }
    const mismatchedRoles = Object.keys(GAME_ROLES).filter((role) => actualCounts[role] !== expected[role])
    if (mismatchedRoles.length > 0) {
        const detail = mismatchedRoles
            .map((role) => `실제 ${role} 수(${actualCounts[role]})가 기대값(${expected[role]})과 불일치`)
            .join(', ')
        throw new Error(`commitGameSession: ${detail}`)
    }
}

function commitGameSession(session) {
    assertValidSessionForCommit(session)

    if (gameSessions.has(session.id)) {
        throw new Error(`GameSession id 충돌: ${session.id}`)
    }
    if (roomGameSession.has(session.roomId)) {
        throw new Error(`Room에 이미 활성 GameSession 존재: ${session.roomId}`)
    }
    for (const uuid of session.players.keys()) {
        const existingGameId = playerSession.get(uuid)
        if (existingGameId && existingGameId !== session.id) {
            const existingSession = gameSessions.get(existingGameId)
            if (existingSession?.phase === 'ENDED') {
                endGameSessionForPlayer(uuid, 'SUPERSEDED_BY_NEW_GAME', existingGameId)
            } else if (isParticipantBlockedFromMatchmaking(uuid)) {
                throw new Error(`참가자가 이미 다른 GameSession에 속함: ${uuid}`)
            }
        }
    }
    gameSessions.set(session.id, session)
    roomGameSession.set(session.roomId, session.id)
    session.players.forEach((_, uuid) => playerSession.set(uuid, session.id))
}

function buildViewerRoleFields(session, viewer) {
    if (!viewer) return null
    const skinJobId = ROLE_TO_SKIN_JOB_ID[viewer.role]
    const accountSkinsByJob = Object.hasOwn(viewer, 'accountSkinsByJob') ? viewer.accountSkinsByJob : null
    const hasAccountSkin = Boolean(skinJobId) && Object.hasOwn(accountSkinsByJob ?? {}, skinJobId)
    return {
        uuid: viewer.uuid,
        nickname: viewer.nickname,
        role: viewer.role,
        team: ROLE_TEAMS[viewer.role],
        ...(hasAccountSkin ? { accountSkinId: accountSkinsByJob[skinJobId] } : {}),
        ...(viewer.role === 'JOKER'
            ? {
                  allies: [...session.players.values()]
                      .filter((p) => p.role === 'JOKER' && p.uuid !== viewer.uuid)
                      .map((p) => p.uuid),
              }
            : {}),
    }
}

function enterDayPhase(session) {
    session.phase = 'DAY'
    session.dayIndex += 1
    session.dayPhase = DAY_PHASES.DISCUSSION
    session.dayVoteReadyUuids = new Set()
    session.dayVotes = new Map()
    session.dayVoteRound = 1
    session.dayVoteExcludedUuids = new Set()
    session.dayVoteSfx = new Map()
}

function getDayPhase(session) {
    return session.dayPhase === DAY_PHASES.VOTE || session.dayPhase === DAY_PHASES.DISCUSSION
        ? session.dayPhase
        : DAY_PHASES.DISCUSSION
}

function enterDayVotePhase(session) {
    session.dayPhase = DAY_PHASES.VOTE
    session.dayVoteReadyUuids = new Set()
}

function getDayVoteRound(session) {
    return Number.isInteger(session.dayVoteRound) && session.dayVoteRound >= 1 ? session.dayVoteRound : 1
}

function getDayVoteExcludedUuids(session) {
    return session.dayVoteExcludedUuids instanceof Set ? session.dayVoteExcludedUuids : new Set()
}

function getResolutionRound(resolution) {
    return Number.isInteger(resolution?.round) && resolution.round >= 1 ? resolution.round : 1
}

function buildPlayerThemeIndices(session) {
    const id = typeof session?.id === 'string' ? session.id : ''
    let seed = 0x811c9dc5
    for (let i = 0; i < id.length; i += 1) {
        seed ^= id.charCodeAt(i)
        seed = Math.imul(seed, 0x01000193) >>> 0
    }

    const nextRandom = () => {
        seed = (seed + 0x6d2b79f5) >>> 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const indices = Array.from({ length: PLAYER_THEME_PALETTE_SIZE }, (_, index) => index)
    for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextRandom() * (i + 1))
        const swap = indices[i]
        indices[i] = indices[j]
        indices[j] = swap
    }
    return indices
}

function buildPlayerAccountProfileFields(player) {
    return {
        ...(Object.hasOwn(player, 'accountProfilePhotoId') ? { accountProfilePhotoId: player.accountProfilePhotoId } : {}),
        ...(Object.hasOwn(player, 'accountProfileBorderId') ? { accountProfileBorderId: player.accountProfileBorderId } : {}),
        ...(Object.hasOwn(player, 'accountCardFrameId') ? { accountCardFrameId: player.accountCardFrameId } : {}),
        ...(Object.hasOwn(player, 'accountTotalGames') ? { accountTotalGames: player.accountTotalGames } : {}),
        ...(Object.hasOwn(player, 'accountWinRate') ? { accountWinRate: player.accountWinRate } : {}),
    }
}

function buildRoomSettingsSourceFields(session) {
    const source = session?.roomSettingsSource
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return {}
    return {
        roomSettingsSource: {
            accessType: source.accessType ?? null,
            settingsVersion: Number.isInteger(source.settingsVersion) ? source.settingsVersion : null,
            settings: buildRoomSettingsView(source.settings),
        },
    }
}

function buildGameStartedPayload(session, viewerUuid) {
    const viewer = session.players.get(viewerUuid)
    const themeIndices = buildPlayerThemeIndices(session)
    return {
        gameId: session.id,
        state: {
            id: session.id,
            phase: session.phase,
            dayIndex: session.dayIndex,
            hostUuid: session.hostUuid ?? null,
            roomId: session.roomId ?? null,
            roomInstanceId: session.roomInstanceId ?? null,
            bootEpoch: session.bootEpoch ?? null,
            roomCode: session.roomCode ?? null,
            ...buildRoomSettingsSourceFields(session),
            participationRevision: session.participationRevision ?? 0,
            players: [...session.players.values()].map((player, index) => ({
                uuid: player.uuid,
                nickname: player.nickname,
                themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
                isAlive: player.alive === true,
                isParticipating: player.isParticipating !== false,
                membershipId: player.membershipId ?? null,
                ...buildPlayerAccountProfileFields(player),
            })),
            self: buildViewerRoleFields(session, viewer),
        },
    }
}

function acknowledgeRoleReveal(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'ROLE_REVEAL') return { ok: false, code: 'INVALID_PHASE' }

    if (session.roleRevealAcks.has(uuid)) return { ok: true, transitioned: false, session }

    session.roleRevealAcks.add(uuid)
    if (isRoleRevealComplete(session)) {
        enterDayPhase(session)
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

function isRoleRevealComplete(session) {
    const pending = [...session.players.values()].filter((player) => isParticipatingInSession(session, player.uuid))
    if (pending.length === 0) return false
    return pending.every((player) => session.roleRevealAcks.has(player.uuid))
}

function advanceStalledPhaseAfterDeparture(session) {
    if (session.phase === 'ROLE_REVEAL') {
        if (!isRoleRevealComplete(session)) return { transitioned: null }
        enterDayPhase(session)
        return { transitioned: 'DAY' }
    }
    if (session.phase === 'DAY' && getDayPhase(session) === DAY_PHASES.DISCUSSION) {
        const eligibleUuids = getEligibleDayVoterUuids(session)
        if (eligibleUuids.length === 0) return { transitioned: null }
        const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
        if (!eligibleUuids.every((uuid) => readyUuids.has(uuid))) return { transitioned: null }
        enterDayVotePhase(session)
        return { transitioned: 'DAY_VOTE' }
    }
    return { transitioned: null }
}

function buildPhaseChangedPayload(session) {
    return { gameId: session.id, phase: session.phase, dayIndex: session.dayIndex }
}

function isEligibleForNightAction(role, dayIndex) {
    const minDayIndex = ROLE_DEFINITIONS[role]?.nightActionMinDayIndex
    return minDayIndex !== null && minDayIndex !== undefined && dayIndex >= minDayIndex
}

function requiresAliveTarget(role) {
    return ROLE_DEFINITIONS[role]?.targetMustBeAlive !== false
}

function getEligibleNightActorUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        if (isEligibleForNightAction(player.role, session.dayIndex)) uuids.push(player.uuid)
    }
    return uuids
}

const NIGHT_TURN_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

function getNightTurnOrder(session) {
    const composition = session?.roleComposition
    if (!composition || typeof composition !== 'object') return NIGHT_TURN_ORDER
    const order = NIGHT_TURN_ORDER.filter((role) => Number.isInteger(composition[role]) && composition[role] > 0)
    return order.length > 0 ? Object.freeze(order) : NIGHT_TURN_ORDER
}

const NIGHT_TURN_DURATION_MS = 30_000

const DAY_DISCUSSION_DURATION_MS = 60_000
const DAY_VOTE_DURATION_MS = 60_000

function buildNightTurnStartedPayload(session, role, deadline) {
    return { gameId: session.id, dayIndex: session.dayIndex, role, deadline }
}

function buildNightTurnEndedPayload(session, role) {
    return { gameId: session.id, dayIndex: session.dayIndex, role }
}

function getAliveActorUuidsForRole(session, role) {
    return getEligibleNightActorUuids(session).filter((uuid) => session.players.get(uuid)?.role === role)
}

function isRoleTurnComplete(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        if (!session.nightActions.has(actorUuid)) return false
    }
    return true
}

function getCurrentNightTurnRole(session) {
    return session.nightTurnRole ?? null
}

const NIGHT_ACTION_RESOLUTION_POLICY = Object.freeze({
    JOKER: 'PLURALITY',
    DOCTOR: 'UNANIMOUS',
    GUARD: 'UNANIMOUS',
    WITCH_HUNTER: 'UNANIMOUS',
})

function collectRoleNightSubmissions(session, role, excludedActorUuids = new Set()) {
    return getAliveActorUuidsForRole(session, role)
        .filter((actorUuid) => !excludedActorUuids.has(actorUuid))
        .map((actorUuid) => ({
            actorUuid,
            target: session.nightActions.get(actorUuid) ?? null,
        }))
}

function resolveRoleNightAction(session, role, excludedActorUuids = new Set()) {
    const targets = collectRoleNightSubmissions(session, role, excludedActorUuids)
        .map((submission) => submission.target)
        .filter((target) => target !== null)
    if (targets.length === 0) return null

    if (NIGHT_ACTION_RESOLUTION_POLICY[role] !== 'PLURALITY') {
        return targets.every((target) => target === targets[0]) ? targets[0] : null
    }

    const voteCounts = new Map()
    for (const target of targets) voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1)

    let winner = null
    let winnerVotes = 0
    let tie = false
    for (const [target, votes] of voteCounts) {
        if (votes > winnerVotes) {
            winner = target
            winnerVotes = votes
            tie = false
        } else if (votes === winnerVotes) {
            tie = true
        }
    }
    return tie ? null : winner
}

const NIGHT_RECOVERY_STATES = Object.freeze({
    PENDING_RECOVERY: 'PENDING_RECOVERY',
    RECOVERED: 'RECOVERED',
    DEATH_CANDIDATE: 'DEATH_CANDIDATE',
})

function isRecoveryBlockedState(state) {
    return state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY || state === NIGHT_RECOVERY_STATES.DEATH_CANDIDATE
}

const EMPTY_COMPLETED_ROLES = Object.freeze(new Set())

function createNightProgress(session, { sequenced = false } = {}) {
    return {
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        revision: 0,
        sequenced,
        completedRoles: new Set(),
        roleSteps: [],
        events: [],
        recoveryStates: new Map(),
        roleTargets: new Map(),
        healingClosed: false,
    }
}

function matchesCurrentNight(session, progress) {
    return !!progress
        && progress.gameId === session.id
        && progress.nightDayIndex === session.dayIndex
}

function getNightProgress(session) {
    return matchesCurrentNight(session, session?.nightProgress) ? session.nightProgress : null
}

function ensureNightProgress(session, { sequenced = false } = {}) {
    let progress = getNightProgress(session)
    if (!progress) {
        progress = createNightProgress(session, { sequenced })
        session.nightProgress = progress
    }
    if (sequenced) progress.sequenced = true
    return progress
}

function computeNightRoleStep(session, progress, role) {
    const hasRoleInGame = [...session.players.values()].some((player) => player.role === role)
    if (!hasRoleInGame) return { role, targetId: null, status: 'NO_ROLE' }

    const actors = getAliveActorUuidsForRole(session, role)
    if (actors.length === 0) {
        return { role, targetId: null, status: 'NO_ACTOR' }
    }

    const excludedActorUuids = role === 'DOCTOR'
        ? new Set()
        : new Set(actors.filter((actorUuid) => isRecoveryBlockedState(progress.recoveryStates.get(actorUuid))))

    const targetId = resolveRoleNightAction(session, role, excludedActorUuids)
    if (targetId === null) {
        return { role, targetId: null, status: excludedActorUuids.size > 0 ? 'RECOVERY_BLOCKED' : 'NO_RESULT' }
    }
    return { role, targetId, status: 'RESOLVED' }
}

function closeNightHealing(progress) {
    if (progress.healingClosed) return
    progress.healingClosed = true
    for (const [uuid, state] of progress.recoveryStates) {
        if (state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
            progress.recoveryStates.set(uuid, NIGHT_RECOVERY_STATES.DEATH_CANDIDATE)
        }
    }
}

function applyNightRoleStep(progress, step) {
    progress.roleSteps.push(step)
    progress.roleTargets.set(step.role, step.targetId)

    if (step.status === 'RESOLVED') {
        if (step.role === 'JOKER') {
            progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.PENDING_RECOVERY)
            progress.events.push({ type: 'KILL', targetId: step.targetId })
        } else if (step.role === 'DOCTOR') {
            if (progress.recoveryStates.get(step.targetId) === NIGHT_RECOVERY_STATES.PENDING_RECOVERY) {
                progress.recoveryStates.set(step.targetId, NIGHT_RECOVERY_STATES.RECOVERED)
                progress.events.push({ type: 'HEAL', targetId: step.targetId })
            }
        }
    }

    if (step.role === 'DOCTOR') closeNightHealing(progress)

    progress.completedRoles.add(step.role)
    progress.revision += 1
}

function findInvalidRoleSubmission(session, role) {
    for (const actorUuid of getAliveActorUuidsForRole(session, role)) {
        const target = session.nightActions.get(actorUuid)
        if (target === null || target === undefined) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer) return actorUuid
        const targetStateOk = requiresAliveTarget(role) ? targetPlayer.alive === true : targetPlayer.alive !== true
        if (!targetStateOk) return actorUuid
    }
    return null
}

function completeNightRole(session, role) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!NIGHT_TURN_ORDER.includes(role)) return { ok: false, code: 'INVALID_ROLE' }

    const completedRoles = getNightProgress(session)?.completedRoles ?? EMPTY_COMPLETED_ROLES
    if (completedRoles.has(role)) return { ok: false, code: 'ROLE_ALREADY_COMPLETED' }
    for (const earlierRole of NIGHT_TURN_ORDER) {
        if (earlierRole === role) break
        if (!completedRoles.has(earlierRole)) return { ok: false, code: 'ROLE_OUT_OF_ORDER' }
    }
    if (!isRoleTurnComplete(session, role)) return { ok: false, code: 'ACTIONS_PENDING' }

    if (findInvalidRoleSubmission(session, role) !== null) {
        return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
    }

    const progress = ensureNightProgress(session, { sequenced: true })
    const step = computeNightRoleStep(session, progress, role)
    applyNightRoleStep(progress, step)

    return {
        ok: true,
        role,
        alreadyCompleted: false,
        step: { ...step },
        revision: progress.revision,
        healingClosed: progress.healingClosed,
    }
}

function markNightSequenced(session) {
    if (!session || typeof session.id !== 'string') return false
    if (gameSessions.get(session.id) !== session) return false
    if (session.phase !== 'NIGHT') return false
    if (session.nightResolution !== null) return false
    ensureNightProgress(session, { sequenced: true })
    return true
}

function isNightRoleCompleted(session, role) {
    const progress = getNightProgress(session)
    return !!progress && progress.sequenced && progress.completedRoles.has(role)
}

function buildAssassinationFailureNotice() {
    return { actionType: 'ASSASSINATE', success: false }
}

const SELF_TARGET_ALLOWED_ROLES = new Set(['DOCTOR'])

function submitNightAction(uuid, gameId, targetId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
    if (!isEligibleForNightAction(actor.role, session.dayIndex)) {
        return { ok: false, code: 'NOT_ELIGIBLE' }
    }
    const currentTurnRole = getCurrentNightTurnRole(session)
    if (currentTurnRole !== null && currentTurnRole !== actor.role) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }
    if (isNightRoleCompleted(session, actor.role)) {
        return { ok: false, code: 'NOT_YOUR_TURN' }
    }

    if (targetId !== null) {
        const targetPlayer = session.players.get(targetId)
        if (!targetPlayer) return { ok: false, code: 'INVALID_TARGET' }
        if (requiresAliveTarget(actor.role)) {
            if (!targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        } else if (targetPlayer.alive) {
            return { ok: false, code: 'TARGET_NOT_DEAD' }
        }

        if (actor.role === 'JOKER' && ROLE_TEAMS[targetPlayer.role] === 'JOKER') {
            return { ok: true, gameId: session.id }
        }

        if (targetId === uuid && !SELF_TARGET_ALLOWED_ROLES.has(actor.role)) {
            return { ok: false, code: 'INVALID_TARGET' }
        }
    }

    session.nightActions.set(uuid, targetId)
    return { ok: true, gameId: session.id }
}

function prepareNightResolution(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    return prepareNightResolutionForSession(session)
}

function prepareNightResolutionForSession(session) {
    if (!session || typeof session.id !== 'string') return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }

    const endedCheck1 = assertSessionNotEnded(session)
    if (!endedCheck1.ok) return endedCheck1

    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }

    const sequencedProgress = getNightProgress(session)?.sequenced === true ? getNightProgress(session) : null

    let progress
    if (sequencedProgress) {
        for (const role of NIGHT_TURN_ORDER) {
            if (!sequencedProgress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
        if (!sequencedProgress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        progress = sequencedProgress
    } else {
        const eligibleActorUuids = getEligibleNightActorUuids(session)
        for (const actorUuid of eligibleActorUuids) {
            if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
        }

        for (const actorUuid of eligibleActorUuids) {
            const target = session.nightActions.get(actorUuid)
            if (target !== null) {
                const targetPlayer = session.players.get(target)
                if (!targetPlayer) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
                const actorRole = session.players.get(actorUuid)?.role
                const targetStateOk = requiresAliveTarget(actorRole) ? targetPlayer.alive === true : targetPlayer.alive !== true
                if (!targetStateOk) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }

        progress = createNightProgress(session, { sequenced: false })
        for (const role of NIGHT_TURN_ORDER) {
            applyNightRoleStep(progress, computeNightRoleStep(session, progress, role))
        }
        closeNightHealing(progress)
    }

    const assassinationTargetId = progress.roleTargets.get('JOKER') ?? null
    const protectionTargetId = progress.roleTargets.get('DOCTOR') ?? null
    const investigationTargetId = progress.roleTargets.get('GUARD') ?? null
    const confirmationTargetId = progress.roleTargets.get('WITCH_HUNTER') ?? null

    const protectedTargetIds = new Set(protectionTargetId === null ? [] : [protectionTargetId])
    const assassinationBlocked =
        assassinationTargetId !== null && protectedTargetIds.has(assassinationTargetId)

    let pendingEliminationTargetId = assassinationBlocked ? null : assassinationTargetId
    if (pendingEliminationTargetId !== null) {
        const candidate = session.players.get(pendingEliminationTargetId)
        if (!candidate || candidate.alive !== true || !isParticipatingInSession(session, pendingEliminationTargetId)) {
            pendingEliminationTargetId = null
        }
    }

    const privateResultBuilderByRole = new Map()
    if (investigationTargetId !== null && session.players.has(investigationTargetId)) {
        const role = session.players.get(investigationTargetId).role
        privateResultBuilderByRole.set('GUARD', () => ({
            actionType: 'INVESTIGATE',
            targetId: investigationTargetId,
            role,
        }))
    }
    if (confirmationTargetId !== null && session.players.has(confirmationTargetId)) {
        const role = session.players.get(confirmationTargetId).role
        privateResultBuilderByRole.set('WITCH_HUNTER', () => ({
            actionType: 'CONFIRM',
            targetId: confirmationTargetId,
            role,
        }))
    }
    if (assassinationBlocked) {
        privateResultBuilderByRole.set('JOKER', buildAssassinationFailureNotice)
    }

    const privateResults = new Map()
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        const buildResult = privateResultBuilderByRole.get(player.role)
        if (buildResult !== undefined) privateResults.set(player.uuid, buildResult())
    }

    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        assassinationTargetId,
        protectedTargetIds,
        pendingEliminationTargetId,
        privateResults,
        roleSteps: progress.roleSteps.map((step) => ({ ...step })),
        events: progress.events.map((event) => ({ ...event })),
        recoveryStates: new Map(progress.recoveryStates),
        resolved: true,
    }

    registerNightPreparation(session, resolution, {
        sequenced: progress.sequenced === true,
        progressRevision: progress.revision,
    })

    return { ok: true, session, resolution }
}

const nightPreparations = new WeakMap()

function computeNightInputFingerprint(session) {
    const submissions = []
    for (const [actorUuid, target] of session.nightActions ?? []) {
        submissions.push(`${actorUuid}>${target === null || target === undefined ? 'SKIP' : target}`)
    }
    submissions.sort()

    const progress = getNightProgress(session)
    const progressPart = progress
        ? [
            progress.sequenced ? 'SEQ' : 'DIRECT',
            progress.revision,
            progress.healingClosed ? 'HEAL_CLOSED' : 'HEAL_OPEN',
            NIGHT_TURN_ORDER.filter((role) => progress.completedRoles.has(role)).join('+'),
        ].join('#')
        : 'NO_PROGRESS'

    return `${session.id}@${session.dayIndex}|${progressPart}|${submissions.join(',')}`
}

function cloneNightPreparationValue(value) {
    if (value instanceof Map) {
        const copy = new Map()
        for (const [key, nested] of value) copy.set(key, cloneNightPreparationValue(nested))
        return copy
    }
    if (value instanceof Set) return new Set(value)
    if (Array.isArray(value)) return value.map((item) => cloneNightPreparationValue(item))
    if (value !== null && typeof value === 'object') {
        const copy = {}
        for (const [key, nested] of Object.entries(value)) copy[key] = cloneNightPreparationValue(nested)
        return copy
    }
    return value
}

function snapshotNightPreparation(resolution) {
    const snapshot = new Map()
    for (const key of Object.keys(resolution)) snapshot.set(key, cloneNightPreparationValue(resolution[key]))
    return snapshot
}

function restoreNightPreparation(resolution, snapshot) {
    for (const key of Object.keys(resolution)) {
        if (!snapshot.has(key)) delete resolution[key]
    }
    for (const [key, value] of snapshot) resolution[key] = cloneNightPreparationValue(value)
}

function registerNightPreparation(session, resolution, { sequenced, progressRevision }) {
    nightPreparations.set(resolution, {
        session,
        gameId: session.id,
        nightDayIndex: session.dayIndex,
        participationRevision: Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0,
        sequenced,
        progressRevision,
        inputFingerprint: computeNightInputFingerprint(session),
        pendingEliminationTargetId: resolution.pendingEliminationTargetId ?? null,
        prepared: snapshotNightPreparation(resolution),
        consumed: false,
    })
    return resolution
}

const PUBLIC_NIGHT_DEATH_SOURCES = Object.freeze({
    JOKER: 'JOKER',
    WITCH_HUNTER: 'WITCH_HUNTER',
    UNKNOWN_NIGHT: 'UNKNOWN_NIGHT',
})

function resolveNightDeathSource(resolution, victimUuid) {
    const attributions = []
    if (resolution?.assassinationTargetId === victimUuid) attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.JOKER)
    if (resolution?.witchHunterExecutionTargetId === victimUuid) {
        attributions.push(PUBLIC_NIGHT_DEATH_SOURCES.WITCH_HUNTER)
    }
    return attributions.length === 1 ? attributions[0] : PUBLIC_NIGHT_DEATH_SOURCES.UNKNOWN_NIGHT
}

function buildNightDeathReveals(resolution, victimUuids) {
    const reveals = []
    const seen = new Set()
    for (const victimUuid of victimUuids) {
        if (typeof victimUuid !== 'string' || victimUuid.length === 0) continue
        if (seen.has(victimUuid)) continue
        seen.add(victimUuid)
        reveals.push({ victimUuid, source: resolveNightDeathSource(resolution, victimUuid) })
    }
    return reveals
}

function expireDeadPlayerNightEffects(session, deadUuids) {
    const expired = []
    for (const uuid of deadUuids) {
        if (!session.nightActions.has(uuid)) continue
        session.nightActions.delete(uuid)
        expired.push(uuid)
    }
    return expired
}

function commitNightResolution(session, resolution) {
    if (nightCommitObserverBusy) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const record = (resolution !== null && typeof resolution === 'object')
        ? nightPreparations.get(resolution)
        : undefined
    if (!record) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.session !== session) return { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' }
    if (record.consumed) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (record.gameId !== session.id) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (record.nightDayIndex !== session.dayIndex) return { ok: false, code: 'STALE_RESOLUTION' }
    if (session.nightResolution !== null) return { ok: false, code: 'NIGHT_ALREADY_RESOLVED' }
    const currentParticipationRevision =
        Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0
    if (currentParticipationRevision !== record.participationRevision) return { ok: false, code: 'STALE_RESOLUTION' }

    if (record.inputFingerprint !== computeNightInputFingerprint(session)) {
        return { ok: false, code: 'STALE_RESOLUTION' }
    }

    if (record.sequenced) {
        const progress = getNightProgress(session)
        if (!progress || progress.sequenced !== true) return { ok: false, code: 'STALE_RESOLUTION' }
        if (progress.revision !== record.progressRevision) return { ok: false, code: 'STALE_RESOLUTION' }
        if (!progress.healingClosed) return { ok: false, code: 'ACTIONS_PENDING' }
        for (const role of NIGHT_TURN_ORDER) {
            if (!progress.completedRoles.has(role)) return { ok: false, code: 'ACTIONS_PENDING' }
        }
    }

    let victimUuid = record.pendingEliminationTargetId ?? null
    if (victimUuid !== null && session.players.has(victimUuid) && !isParticipatingInSession(session, victimUuid)) {
        victimUuid = null
    }

    let victim = null
    if (victimUuid !== null) {
        victim = session.players.get(victimUuid)
        if (!victim) throw new Error(`commitNightResolution: victim(${victimUuid})이 참가자가 아님`)
        if (victim.alive !== true) throw new Error(`commitNightResolution: victim(${victimUuid})이 이미 사망 상태`)
    }
    restoreNightPreparation(resolution, record.prepared)
    resolution.pendingEliminationTargetId = victimUuid
    record.consumed = true
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    if (victim) {
        victim.alive = false
        victim.deathReason = DEATH_REASONS.ASSASSINATION
        observeNightCommit('NIGHT_DEATH_FINALIZED', { gameId: session.id, victimUuid, reason: DEATH_REASONS.ASSASSINATION })
    }
    expireDeadPlayerNightEffects(session, victimUuid === null ? [] : [victimUuid])

    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'NIGHT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid, terminal: { winner: winResult.winner } }
    }

    enterDayPhase(session)
    return { ok: true, victimUuid, terminal: null }
}

function commitDisconnectElimination(session, uuid) {
    if (nightCommitObserverBusy) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const victim = session.players.get(uuid)
    if (!victim) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (victim.alive !== true) return { ok: false, code: 'ALREADY_ELIMINATED' }

    victim.alive = false
    victim.deathReason = DEATH_REASONS.DISCONNECT
    observeNightCommit('DISCONNECT_DEATH_FINALIZED', { gameId: session.id, victimUuid: uuid, reason: DEATH_REASONS.DISCONNECT })
    expireDeadPlayerNightEffects(session, [uuid])

    if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
    session.forfeitedUuids.add(uuid)
    if (!session.detachedUuids) session.detachedUuids = new Set()
    session.detachedUuids.add(uuid)

    const winResult = evaluateWinCondition(session)
    observeNightCommit('WIN_EVALUATED', { gameId: session.id, source: 'DISCONNECT', winner: winResult?.winner ?? null })
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, victimUuid: uuid, terminal: { winner: winResult.winner } }
    }

    return { ok: true, victimUuid: uuid, terminal: null }
}

function commitParticipantDeparture(session, uuid, { reason = 'PARTICIPANT_LEFT' } = {}) {
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const player = session.players.get(uuid)
    if (!player) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (player.isParticipating === false) return { ok: false, code: 'ALREADY_LEFT' }
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) {
        return { ok: false, code: 'ALREADY_LEFT' }
    }

    const wasAlive = player.alive === true
    const phaseAtDeparture = session.phase
    const wasDefendant = session.phase === 'TRIBUNAL'
        && session.tribunal?.defendantUuid === uuid
        && session.tribunal?.resolved !== true

    let eliminated = false
    let terminal = null
    if (wasAlive) {
        const applied = commitDisconnectElimination(session, uuid)
        if (!applied.ok) return applied
        eliminated = true
        terminal = applied.terminal
    } else {
        if (!session.forfeitedUuids) session.forfeitedUuids = new Set()
        session.forfeitedUuids.add(uuid)
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
    }

    player.isParticipating = false
    session.participationRevision =
        (Number.isSafeInteger(session.participationRevision) ? session.participationRevision : 0) + 1

    const released = playerSession.get(uuid) === session.id
    if (released) playerSession.delete(uuid)

    let hostChanged = false
    let newHostUuid = session.hostUuid ?? null
    if (session.hostUuid === uuid) {
        newHostUuid = null
        for (const candidate of session.players.values()) {
            if (candidate.uuid === uuid) continue
            if (candidate.isParticipating === false) continue
            newHostUuid = candidate.uuid
            break
        }
        session.hostUuid = newHostUuid
        hostChanged = true
    }

    const cleanup = {
        removedRoleRevealAck: false,
        removedDayVoteReady: false,
        removedDayVote: false,
        normalizedVoterUuids: [],
        removedTribunalVote: false,
    }
    let tribunalCancelled = false

    if (!terminal) {
        if (session.roleRevealAcks instanceof Set) {
            cleanup.removedRoleRevealAck = session.roleRevealAcks.delete(uuid)
        }
        if (session.dayVoteReadyUuids instanceof Set) {
            cleanup.removedDayVoteReady = session.dayVoteReadyUuids.delete(uuid)
        }
        if (session.dayVotes instanceof Map) {
            cleanup.removedDayVote = session.dayVotes.delete(uuid)
            for (const [voterUuid, targetUuid] of session.dayVotes) {
                if (targetUuid !== uuid) continue
                session.dayVotes.set(voterUuid, null)
                cleanup.normalizedVoterUuids.push(voterUuid)
            }
        }
        if (session.nightActions instanceof Map) {
            session.nightActions.delete(uuid)
            for (const [actorUuid, targetId] of session.nightActions) {
                if (targetId === uuid) session.nightActions.set(actorUuid, null)
            }
        }

        if (session.tribunal && session.tribunal.resolved !== true) {
            if (session.tribunal.votes instanceof Map) {
                cleanup.removedTribunalVote = session.tribunal.votes.delete(uuid)
            }
            if (wasDefendant) {
                TRIBUNAL_PENDING.delete(session)
                const counts = tallyTribunalBallots(
                    buildTribunalBallotSnapshot(session, session.tribunal),
                    session.tribunal.defendantUuid,
                ).counts
                session.tribunal.outcome = TRIBUNAL_CANCELLED_OUTCOME
                session.tribunal.cancelReason = TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT
                session.tribunal.counts = { guilty: counts.guilty, notGuilty: counts.notGuilty }
                session.tribunal.executedUuid = null
                session.tribunal.resolved = true
                session.phase = 'NIGHT'
                session.nightActions = new Map()
                session.nightResolution = null
                session.nightProgress = null
                tribunalCancelled = true
            }
        }
    }

    return {
        ok: true,
        reason,
        victimUuid: uuid,
        eliminated,
        terminal,
        wasAlive,
        phaseAtDeparture,
        hostChanged,
        newHostUuid,
        participationRevision: session.participationRevision,
        released,
        tribunalCancelled,
        cleanup,
    }
}

const TRIBUNAL_CANCELLED_OUTCOME = 'CANCELLED'

const TRIBUNAL_CANCEL_REASONS = Object.freeze({
    DEFENDANT_LEFT: 'DEFENDANT_LEFT',
})

function buildParticipationChangedPayload(session, departedUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        participationRevision: session.participationRevision ?? 0,
        departedUuid,
        players: [...session.players.values()].map((player) => ({
            uuid: player.uuid,
            membershipId: player.membershipId ?? null,
            alive: player.alive === true,
            isParticipating: player.isParticipating !== false,
        })),
        progress: buildPublicPhaseProgress(session),
    }
}

function buildPublicPhaseProgress(session) {
    if (session.phase === 'ROLE_REVEAL') {
        const pending = [...session.players.values()].filter((p) => p.isParticipating !== false)
        const acks = session.roleRevealAcks instanceof Set ? session.roleRevealAcks : new Set()
        return {
            kind: 'ROLE_REVEAL',
            doneCount: pending.filter((p) => acks.has(p.uuid)).length,
            requiredCount: pending.length,
        }
    }
    if (session.phase === 'DAY') {
        const eligible = getEligibleDayVoterUuids(session)
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            const ready = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
            return {
                kind: 'DAY_DISCUSSION',
                doneCount: eligible.filter((uuid) => ready.has(uuid)).length,
                requiredCount: eligible.length,
            }
        }
        return {
            kind: 'DAY_VOTE',
            doneCount: eligible.filter((uuid) => session.dayVotes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        const eligible = getEligibleTribunalVoterUuids(session, session.tribunal.defendantUuid)
        const votes = session.tribunal.votes instanceof Map ? session.tribunal.votes : new Map()
        return {
            kind: 'TRIBUNAL',
            doneCount: eligible.filter((uuid) => votes.has(uuid)).length,
            requiredCount: eligible.length,
        }
    }
    return { kind: session.phase === 'NIGHT' ? 'NIGHT' : 'NONE', doneCount: null, requiredCount: null }
}

function bumpSelfProgressSeq(session) {
    const next = (Number.isSafeInteger(session.selfProgressSeq) ? session.selfProgressSeq : 0) + 1
    session.selfProgressSeq = next
    return next
}

function buildSelfSubmissionFields(session, uuid) {
    const fields = {}
    if (session.phase === 'ROLE_REVEAL') {
        fields.hasAcknowledgedRoleReveal = session.roleRevealAcks instanceof Set
            && session.roleRevealAcks.has(uuid)
        return fields
    }
    if (session.phase === 'DAY') {
        if (getDayPhase(session) === DAY_PHASES.DISCUSSION) {
            fields.isDayVoteReady = session.dayVoteReadyUuids instanceof Set
                && session.dayVoteReadyUuids.has(uuid)
            return fields
        }
        const submitted = session.dayVotes.has(uuid)
        fields.hasSubmittedDayVote = submitted
        const target = submitted ? session.dayVotes.get(uuid) : null
        fields.dayVoteTargetUuid = target === undefined ? null : target
        fields.dayVoteRound = getDayVoteRound(session)
        return fields
    }
    if (session.phase === 'TRIBUNAL' && session.tribunal) {
        fields.hasSubmittedTribunalVote = session.tribunal.votes instanceof Map
            && session.tribunal.votes.has(uuid)
        return fields
    }
    return fields
}

function buildDisconnectEliminationPayload(session, victimUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
    }
}

function buildNightResultAppliedPayload(session, victimUuid, deathReveals = []) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
        deathReveals: (Array.isArray(deathReveals) ? deathReveals : []).map(({ victimUuid: v, source }) => ({
            victimUuid: v,
            source,
        })),
    }
}

function submitDayVote(uuid, gameId, targetId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, code: 'INVALID_GAME_ID' }
    if (targetId !== null && (typeof targetId !== 'string' || targetId.length === 0)) {
        return { ok: false, code: 'INVALID_TARGET' }
    }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== gameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === session.dayIndex &&
        getResolutionRound(session.dayVoteResolution) === getDayVoteRound(session)
    ) {
        return { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' }
    }
    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    if (targetId !== null) {
        const target = session.players.get(targetId)
        if (!target) return { ok: false, code: 'INVALID_TARGET' }
        if (!target.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
        if (targetId === uuid) return { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' }
        if (getDayVoteExcludedUuids(session).has(targetId)) {
            return { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' }
        }
    }

    const isFirstSubmission = !session.dayVotes.has(uuid)
    session.dayVotes.set(uuid, targetId)
    advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission)
    return { ok: true }
}

function advanceDayVoteSfx(session, uuid, targetId, isFirstSubmission) {
    const dayIndex = session.dayIndex
    const round = getDayVoteRound(session)
    const previous = session.dayVoteSfx instanceof Map ? session.dayVoteSfx.get(uuid) : undefined
    const inSameScope =
        previous !== undefined && previous.dayIndex === dayIndex && previous.round === round

    if (inSameScope && !isFirstSubmission && previous.targetId === targetId) return

    const revision = inSameScope ? previous.revision + 1 : 1
    if (!(session.dayVoteSfx instanceof Map)) session.dayVoteSfx = new Map()
    session.dayVoteSfx.set(
        uuid,
        Object.freeze({
            dayIndex,
            round,
            targetId,
            revision,
            eventId: `game:${session.id}:day:${dayIndex}:round:${round}:actor:${uuid}:vote:${revision}`,
        }),
    )
}

function readDayVoteSubmitSfxEvent(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return null
    const session = gameSessions.get(gameId)
    if (!session || !(session.dayVoteSfx instanceof Map)) return null
    const record = session.dayVoteSfx.get(uuid)
    if (record === undefined) return null
    return Object.freeze({
        dayIndex: record.dayIndex,
        round: record.round,
        revision: record.revision,
        eventId: record.eventId,
    })
}

function getSessionDayIndex(gameId) {
    const session = gameSessions.get(gameId)
    return session ? session.dayIndex : null
}

function getSessionDayVoteRound(gameId) {
    const session = gameSessions.get(gameId)
    return session ? getDayVoteRound(session) : null
}

function getEligibleDayVoterUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive) uuids.push(player.uuid)
    }
    return uuids
}

function acknowledgeDayVoteReady(uuid, gameId) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.DISCUSSION) return { ok: false, code: 'INVALID_DAY_PHASE' }
    if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }

    const eligibleUuids = getEligibleDayVoterUuids(session)
    const readyUuids = session.dayVoteReadyUuids instanceof Set ? session.dayVoteReadyUuids : new Set()
    session.dayVoteReadyUuids = readyUuids
    const countReady = () => eligibleUuids.filter((eligibleUuid) => readyUuids.has(eligibleUuid)).length

    if (readyUuids.has(uuid)) {
        return { ok: true, transitioned: false, session, readyCount: countReady(), requiredCount: eligibleUuids.length }
    }

    readyUuids.add(uuid)
    const readyCount = countReady()
    if (readyCount === eligibleUuids.length) {
        enterDayVotePhase(session)
        return { ok: true, transitioned: true, session, readyCount, requiredCount: eligibleUuids.length }
    }
    return { ok: true, transitioned: false, session, readyCount, requiredCount: eligibleUuids.length }
}

function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
    }
}

function uuidListsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false
    }
    return true
}

function tallyDayVoteOutcome(session) {
    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    const excludedUuids = getDayVoteExcludedUuids(session)
    const voteCounts = new Map()
    let abstainCount = 0
    for (const voterUuid of eligibleVoterUuids) {
        const targetId = session.dayVotes.get(voterUuid)
        if (targetId === null || targetId === undefined || excludedUuids.has(targetId)) {
            abstainCount += 1
            continue
        }
        voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1)
    }
    const publicVoteCount = eligibleVoterUuids.length
    const publicAbstainCount = abstainCount

    if (voteCounts.size === 0) {
        return { outcome: 'ABSTAINED', tribunalTargetUuid: null, tiedTargetUuids: [], publicVoteCount, publicAbstainCount }
    }

    let winnerVotes = 0
    for (const votes of voteCounts.values()) {
        if (votes > winnerVotes) winnerVotes = votes
    }
    const topTargetUuids = [...voteCounts.entries()]
        .filter(([, votes]) => votes === winnerVotes)
        .map(([target]) => target)
        .sort()

    if (topTargetUuids.length > 1) {
        return {
            outcome: 'TIE',
            tribunalTargetUuid: null,
            tiedTargetUuids: topTargetUuids,
            publicVoteCount,
            publicAbstainCount,
        }
    }
    return {
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: topTargetUuids[0],
        tiedTargetUuids: [],
        publicVoteCount,
        publicAbstainCount,
    }
}

function buildDayVoteBallotSnapshot(session) {
    const ballots = getEligibleDayVoterUuids(session)
        .slice()
        .sort()
        .map((voterUuid) => {
            const target = session.dayVotes.get(voterUuid)
            return Object.freeze([voterUuid, target === undefined ? null : target])
        })
    return Object.freeze(ballots)
}

function dayVoteBallotSnapshotsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false
    }
    return true
}

function prepareDayVoteResolution(uuid, gameId, dayIndex) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    const currentRound = getDayVoteRound(session)
    if (
        session.dayVoteResolution !== null &&
        session.dayVoteResolution.dayIndex === dayIndex &&
        getResolutionRound(session.dayVoteResolution) === currentRound
    ) {
        return { ok: true, alreadyResolved: true, session, resolution: session.dayVoteResolution }
    }

    if (session.phase !== 'DAY') return { ok: false, code: 'INVALID_PHASE' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'INVALID_DAY_PHASE' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
    }

    for (const voterUuid of eligibleVoterUuids) {
        const target = session.dayVotes.get(voterUuid)
        if (target !== null) {
            const targetPlayer = session.players.get(target)
            if (!targetPlayer || !targetPlayer.alive) {
                return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
            }
        }
    }

    const tally = tallyDayVoteOutcome(session)
    const isRevote = tally.outcome === 'TIE' && currentRound === 1
    return {
        ok: true,
        session,
        resolution: {
            gameId: session.id,
            dayIndex: session.dayIndex,
            round: currentRound,
            outcome: isRevote ? 'REVOTE' : tally.outcome,
            tribunalTargetUuid: tally.tribunalTargetUuid,
            publicVoteCount: tally.publicVoteCount,
            publicAbstainCount: tally.publicAbstainCount,
            excludedUuids: Object.freeze([...getDayVoteExcludedUuids(session)].sort()),
            revoteExcludedUuids: Object.freeze(isRevote ? [...tally.tiedTargetUuids] : []),
            ballotSnapshot: buildDayVoteBallotSnapshot(session),
        },
    }
}

function commitDayVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (resolution.dayIndex !== session.dayIndex || getResolutionRound(resolution) !== getDayVoteRound(session)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    if (gameSessions.get(session.id) !== session) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (session.phase !== 'DAY') return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    if (getDayPhase(session) !== DAY_PHASES.VOTE) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }

    const eligibleVoterUuids = getEligibleDayVoterUuids(session)
    for (const voterUuid of eligibleVoterUuids) {
        if (!session.dayVotes.has(voterUuid)) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
        const target = session.dayVotes.get(voterUuid)
        if (target === null) continue
        const targetPlayer = session.players.get(target)
        if (!targetPlayer || !targetPlayer.alive) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    const recheck = tallyDayVoteOutcome(session)
    const recheckOutcome = recheck.outcome === 'TIE' && getDayVoteRound(session) === 1 ? 'REVOTE' : recheck.outcome
    if (
        recheckOutcome !== resolution.outcome ||
        recheck.tribunalTargetUuid !== resolution.tribunalTargetUuid ||
        recheck.publicVoteCount !== resolution.publicVoteCount ||
        recheck.publicAbstainCount !== resolution.publicAbstainCount
    ) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    const recheckRevoteExcluded = recheckOutcome === 'REVOTE' ? [...recheck.tiedTargetUuids].sort() : []
    if (!uuidListsEqual(recheckRevoteExcluded, resolution.revoteExcludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (!uuidListsEqual([...getDayVoteExcludedUuids(session)].sort(), resolution.excludedUuids ?? [])) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (!dayVoteBallotSnapshotsEqual(buildDayVoteBallotSnapshot(session), resolution.ballotSnapshot)) {
        return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }
    if (resolution.outcome === 'TRIBUNAL') {
        const defendant = session.players.get(resolution.tribunalTargetUuid)
        if (!defendant || defendant.alive !== true) return { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' }
    }

    session.dayVoteResolution = resolution
    if (resolution.outcome === 'TRIBUNAL') {
        session.phase = 'TRIBUNAL'
        session.tribunal = {
            candidateId: resolution.tribunalTargetUuid,
            dayIndex: session.dayIndex,
            defendantUuid: resolution.tribunalTargetUuid,
            votes: new Map(),
        }
    } else if (resolution.outcome === 'REVOTE') {
        session.tribunal = null
        session.dayVoteRound = getResolutionRound(resolution) + 1
        session.dayVoteExcludedUuids = new Set(resolution.revoteExcludedUuids ?? [])
        session.dayVotes = new Map()
        session.dayVoteSfx = new Map()
    } else {
        session.tribunal = null
        session.phase = 'NIGHT'
        session.nightActions = new Map()
        session.nightResolution = null
        session.nightProgress = null
    }
    return { ok: true }
}

function buildDayVoteResolvedPayload(session, resolution) {
    return {
        gameId: session.id,
        dayIndex: resolution.dayIndex,
        phase: session.phase,
        round: getResolutionRound(resolution),
        outcome: resolution.outcome,
        tribunalTargetUuid: resolution.tribunalTargetUuid,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
        revoteExcludedUuids: [...(resolution.revoteExcludedUuids ?? [])],
    }
}

function submitTribunalVote(uuid, gameId, dayIndex, vote) {
    if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== gameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }
    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }

    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    const tribunal = session.tribunal
    if (!tribunal) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    if (tribunal.dayIndex !== session.dayIndex) return { ok: false, code: 'TRIBUNAL_CONTEXT_MISMATCH' }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const resolution = session.dayVoteResolution
    if (!resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.outcome !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (resolution.dayIndex !== session.dayIndex || resolution.dayIndex !== tribunal.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (resolution.tribunalTargetUuid !== tribunal.defendantUuid) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    const defendantUuid = tribunal.defendantUuid
    if (typeof defendantUuid !== 'string' || defendantUuid.length === 0) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    const defendant = session.players.get(defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }

    if (!actor.alive) return { ok: false, code: 'PLAYER_NOT_ALIVE' }
    if (uuid === defendantUuid) return { ok: false, code: 'DEFENDANT_CANNOT_VOTE' }

    if (vote !== 'GUILTY' && vote !== 'NOT_GUILTY') return { ok: false, code: 'INVALID_TRIBUNAL_VOTE' }

    if (tribunal.votes.has(uuid)) return { ok: false, code: 'TRIBUNAL_VOTE_ALREADY_SUBMITTED' }

    tribunal.votes.set(uuid, vote)
    return { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: tribunal.votes.get(uuid) }
}

function readTribunalVoteSubmitSfxEvent(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    const tribunal = session.tribunal
    if (!tribunal || !(tribunal.votes instanceof Map)) return null
    if (!tribunal.votes.has(uuid)) return null
    const dayIndex = tribunal.dayIndex
    if (!Number.isInteger(dayIndex)) return null
    return Object.freeze({
        dayIndex,
        eventId: `game:${session.id}:day:${dayIndex}:actor:${uuid}:tribunal-submitted`,
    })
}

const TRIBUNAL_PENDING = new WeakMap()

function getEligibleTribunalVoterUuids(session, defendantUuid) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive && player.uuid !== defendantUuid) uuids.push(player.uuid)
    }
    return uuids
}

function buildTribunalBallotSnapshot(session, tribunal) {
    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    const snapshot = eligibleVoterUuids.map((voterUuid) => ({ voterUuid, choice: tribunal.votes.get(voterUuid) }))
    snapshot.sort((a, b) => {
        if (a.voterUuid < b.voterUuid) return -1
        if (a.voterUuid > b.voterUuid) return 1
        return 0
    })
    return snapshot
}

function tallyTribunalBallots(ballotSnapshot, defendantUuid) {
    let guilty = 0
    let notGuilty = 0
    for (const { choice } of ballotSnapshot) {
        if (choice === 'GUILTY') guilty += 1
        else if (choice === 'NOT_GUILTY') notGuilty += 1
    }
    const outcome = guilty > notGuilty ? 'GUILTY' : 'NOT_GUILTY'
    return { counts: { guilty, notGuilty }, outcome, executedUuid: outcome === 'GUILTY' ? defendantUuid : null }
}

function tribunalBallotSnapshotsEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i].voterUuid !== b[i].voterUuid || a[i].choice !== b[i].choice) return false
    }
    return true
}

function prepareTribunalVoteResolution(uuid, gameId, dayIndex) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }
    if (!Number.isInteger(dayIndex)) return { ok: false, code: 'INVALID_DAY_INDEX' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (dayIndex !== session.dayIndex) return { ok: false, code: 'STALE_DAY_INDEX' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'INVALID_PHASE' }

    const tribunal = session.tribunal
    if (
        !tribunal ||
        typeof tribunal.candidateId !== 'string' ||
        tribunal.candidateId.length === 0 ||
        typeof tribunal.defendantUuid !== 'string' ||
        tribunal.defendantUuid.length === 0
    ) {
        return { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    for (const voterUuid of eligibleVoterUuids) {
        if (!tribunal.votes.has(voterUuid)) return { ok: false, code: 'TRIBUNAL_VOTES_INCOMPLETE' }
    }

    const ballotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    for (const entry of ballotSnapshot) Object.freeze(entry)
    Object.freeze(ballotSnapshot)

    const tally = tallyTribunalBallots(ballotSnapshot, tribunal.defendantUuid)
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        defendantUuid: tribunal.defendantUuid,
        outcome: tally.outcome,
        counts: Object.freeze({ guilty: tally.counts.guilty, notGuilty: tally.counts.notGuilty }),
        executedUuid: tally.executedUuid,
        ballotSnapshot,
    }
    Object.freeze(resolution)

    TRIBUNAL_PENDING.set(session, { resolution, ballotSnapshot })

    return { ok: true, session, resolution }
}

function commitTribunalVoteResolution(session, resolution) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const canonicalSession = gameSessions.get(session.id)
    if (canonicalSession !== session) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.phase !== 'TRIBUNAL') return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    if (session.dayIndex !== resolution.dayIndex) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const tribunal = session.tribunal
    if (!tribunal || tribunal.defendantUuid !== resolution.defendantUuid || tribunal.dayIndex !== resolution.dayIndex) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }
    if (tribunal.resolved === true) return { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED' }

    const defendant = session.players.get(resolution.defendantUuid)
    if (!defendant || !defendant.alive) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const record = TRIBUNAL_PENDING.get(session)
    if (!record || record.resolution !== resolution) return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }

    const currentBallotSnapshot = buildTribunalBallotSnapshot(session, tribunal)
    if (!tribunalBallotSnapshotsEqual(currentBallotSnapshot, record.ballotSnapshot)) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    const tally = tallyTribunalBallots(currentBallotSnapshot, tribunal.defendantUuid)
    if (
        tally.outcome !== resolution.outcome ||
        tally.counts.guilty !== resolution.counts.guilty ||
        tally.counts.notGuilty !== resolution.counts.notGuilty ||
        tally.executedUuid !== resolution.executedUuid
    ) {
        return { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }
    }

    if (resolution.outcome === 'GUILTY') {
        defendant.alive = false
        defendant.deathReason = DEATH_REASONS.EXECUTION
    }
    tribunal.outcome = resolution.outcome
    tribunal.counts = { guilty: resolution.counts.guilty, notGuilty: resolution.counts.notGuilty }
    tribunal.executedUuid = resolution.executedUuid
    tribunal.resolved = true

    TRIBUNAL_PENDING.delete(session)

    const winResult = evaluateWinCondition(session)
    if (winResult) {
        finalizeGameSession(session, winResult)
        return { ok: true, terminal: { winner: winResult.winner } }
    }

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    session.nightProgress = null
    return { ok: true, terminal: null }
}

function buildTribunalVoteResolvedPayload(session) {
    const tribunal = session.tribunal
    const executedUuid = tribunal.executedUuid
    return {
        ...(tribunal.outcome === TRIBUNAL_CANCELLED_OUTCOME
            ? { reason: tribunal.cancelReason ?? TRIBUNAL_CANCEL_REASONS.DEFENDANT_LEFT }
            : {}),
        gameId: session.id,
        dayIndex: tribunal.dayIndex,
        phase: session.phase,
        defendantUuid: tribunal.defendantUuid,
        outcome: tribunal.outcome,
        counts: { guilty: tribunal.counts.guilty, notGuilty: tribunal.counts.notGuilty },
        executedUuid,
        executedRole: executedUuid ? session.players.get(executedUuid)?.role ?? null : null,
    }
}

function computeHasActedThisPhase(session, uuid) {
    switch (session.phase) {
        case 'ROLE_REVEAL':
            return session.roleRevealAcks.has(uuid)
        case 'NIGHT':
            return session.nightActions.has(uuid)
        case 'DAY':
            if (getDayPhase(session) === DAY_PHASES.VOTE) return session.dayVotes.has(uuid)
            return session.dayVoteReadyUuids instanceof Set && session.dayVoteReadyUuids.has(uuid)
        case 'TRIBUNAL':
            return session.tribunal ? session.tribunal.votes.has(uuid) : false
        default:
            return false
    }
}

function canIncludeDayTribunalFields(session) {
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return true
    if (session.phase === 'ENDED') {
        return session.nightResolution !== null && session.nightResolution.dayIndex !== session.dayIndex
    }
    return false
}

function buildSessionSnapshot(session, uuid) {
    const viewer = session.players.get(uuid)
    const themeIndices = buildPlayerThemeIndices(session)
    const fields = {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        roomId: session.roomId ?? null,
        roomInstanceId: session.roomInstanceId ?? null,
        bootEpoch: session.bootEpoch ?? null,
        roomCode: session.roomCode ?? null,
        ...buildRoomSettingsSourceFields(session),
        participationRevision: session.participationRevision ?? 0,
        selfProgressSeq: session.selfProgressSeq ?? 0,
        ...(session.phase === 'DAY' ? { dayPhase: getDayPhase(session) } : {}),
        players: [...session.players.values()].map((player, index) => ({
            uuid: player.uuid,
            nickname: player.nickname,
            isAlive: player.alive,
            isParticipating: player.isParticipating !== false,
            membershipId: player.membershipId ?? null,
            themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
            ...buildPlayerAccountProfileFields(player),
        })),
        self: {
            ...buildViewerRoleFields(session, viewer),
            hasActedThisPhase: computeHasActedThisPhase(session, uuid),
            ...buildSelfSubmissionFields(session, uuid),
        },
        progress: buildPublicPhaseProgress(session),
    }

    if (session.nightResolution) {
        const { dayIndex, victimUuid, deathReveals } = buildNightResultAppliedPayload(
            session,
            session.nightResolution.pendingEliminationTargetId,
            session.nightResolution.publicDeathReveals,
        )
        fields.nightResult = { dayIndex, victimUuid, deathReveals }
    }

    if (canIncludeDayTribunalFields(session)) {
        if (session.dayVoteResolution && session.dayVoteResolution.dayIndex === session.dayIndex) {
            const { round, outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount, revoteExcludedUuids } =
                buildDayVoteResolvedPayload(session, session.dayVoteResolution)
            fields.dayVoteResolution = {
                round,
                outcome,
                tribunalTargetUuid,
                publicVoteCount,
                publicAbstainCount,
                revoteExcludedUuids,
            }
        }

        if (session.tribunal && session.tribunal.dayIndex === session.dayIndex) {
            if (session.tribunal.resolved) {
                const { defendantUuid, outcome, counts, executedUuid } = buildTribunalVoteResolvedPayload(session)
                fields.tribunal = { defendantUuid, resolved: true, outcome, counts: { ...counts }, executedUuid }
            } else {
                fields.tribunal = { defendantUuid: session.tribunal.defendantUuid, resolved: false }
            }
        }
    }

    if (session.winResult) fields.winResult = buildPublicWinResult(session)

    return fields
}

function getSessionSnapshotForPlayer(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) {
        const normalized = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (normalized && isForfeitedFromSession(normalized, uuid)) {
            return { ok: false, code: 'FORFEITED_FROM_SESSION' }
        }
        return { ok: false, code: 'NOT_A_PARTICIPANT' }
    }

    const session = gameSessions.get(gameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (isForfeitedFromSession(gameId, uuid)) return { ok: false, code: 'FORFEITED_FROM_SESSION' }

    if (expectedGameId !== undefined) {
        const normalizedExpected = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (!normalizedExpected || normalizedExpected !== session.id) {
            return { ok: false, code: 'GAME_ID_MISMATCH' }
        }
    }

    return { ok: true, snapshot: buildSessionSnapshot(session, uuid) }
}

function prepareJokerChatMessage(uuid, gameId, text, { now = Date.now } = {}) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const channel = actor.role
    const lastSentAt = getChatRateLimitMap(session, channel).get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    return { ok: true, session, channel, actorUuid: uuid, sanitizedText: sanitized.text, sentAt }
}

function commitJokerChatMessage(session, uuid, sentAt) {
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    const rateLimitMap = getChatRateLimitMap(session, actor.role)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    rateLimitMap.set(uuid, sentAt)
    return { ok: true }
}

function prepareGameChatMessage(uuid, gameId, text, { now = Date.now, idFn = () => crypto.randomUUID() } = {}) {
    const normalizedGameId = typeof gameId === 'string' ? gameId.trim() : ''
    if (!normalizedGameId) return { ok: false, code: 'INVALID_GAME_ID' }

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (currentGameId !== normalizedGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const session = gameSessions.get(currentGameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed

    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    const sentAt = now()
    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }

    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    const created = createGameChatMessageId(idFn)
    if (!created.ok) return created

    const message = {
        gameId: session.id,
        messageId: created.messageId,
        senderUuid: uuid,
        nickname: actor.nickname,
        text: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
    }

    const prepared = {
        ok: true,
        session,
        channel: routed.channel,
        actorUuid: uuid,
        nickname: actor.nickname,
        sanitizedText: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
        message: { ...message },
    }

    preparedGameChatCapabilities.set(
        prepared,
        Object.freeze({
            session,
            gameId: session.id,
            channel: routed.channel,
            actorUuid: uuid,
            nickname: actor.nickname,
            text: sanitized.text,
            sentAt,
            dayIndex: session.dayIndex,
            messageId: created.messageId,
            message: Object.freeze({ ...message }),
        }),
    )

    return prepared
}

function commitGameChatMessage(prepared, { now = Date.now } = {}) {
    if (typeof prepared !== 'object' || prepared === null) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const capability = preparedGameChatCapabilities.get(prepared)
    if (!capability) return { ok: false, code: 'STALE_CHAT_REQUEST' }
    if (!matchesPreparedGameChatCapability(prepared, capability)) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const { session, actorUuid: uuid, sentAt } = capability

    const currentGameId = playerSession.get(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    const currentSession = gameSessions.get(currentGameId)
    if (!currentSession) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (currentSession !== session) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (session.id !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (capability.gameId !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.uuid !== uuid) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.nickname !== capability.nickname) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed
    if (routed.channel !== capability.channel) return { ok: false, code: 'STALE_CHAT_CHANNEL' }
    if (session.dayIndex !== capability.dayIndex) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    if (!Number.isFinite(sentAt) || !Number.isInteger(sentAt) || sentAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }
    if (capability.message.sentAt !== sentAt) return { ok: false, code: 'INVALID_CLOCK_VALUE' }

    const committedAt = now()
    if (!Number.isFinite(committedAt) || !Number.isInteger(committedAt) || committedAt < 0) {
        return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    }
    if (sentAt > committedAt) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    if (committedAt - sentAt > CHAT_COMMIT_MAX_AGE_MS) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }

    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }

    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    }

    preparedGameChatCapabilities.delete(prepared)
    rateLimitMap.set(uuid, sentAt)
    return { ok: true, gameId: session.id, channel: routed.channel, message: { ...capability.message } }
}

function clearSessionEmojiState(session) {
    if (session?.emojiRateLimit instanceof Map) session.emojiRateLimit.clear()
    if (session?.emojiPaletteByUuid instanceof Map) session.emojiPaletteByUuid.clear()
}

function endGameSessionForPlayer(uuid, reason, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (expectedGameId !== undefined && gameId !== expectedGameId) {
        return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    }

    const session = gameSessions.get(gameId)

    if (session.phase === 'ENDED') {
        const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
        playerSession.delete(uuid)

        const sessionDeleted = session.detachedUuids.size >= session.players.size
        if (sessionDeleted) {
            gameSessions.delete(gameId)
            if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
            cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
            clearSessionEmojiState(session)
        }
        return { ok: true, session, reason, sessionDeleted, cleanupUuids }
    }

    const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
    gameSessions.delete(gameId)
    if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
    cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
    clearSessionEmojiState(session)

    return { ok: true, session, reason, sessionDeleted: true, cleanupUuids }
}

function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
    nightCommitObserver = null
    nightCommitObserverBusy = false
}

function getActiveGamePresenceSnapshot() {
    const participantUuids = new Set()
    for (const session of gameSessions.values()) {
        for (const uuid of session.players.keys()) participantUuids.add(uuid)
    }
    return { room_count: gameSessions.size, participantUuids }
}

function __getStateSnapshotForTests() {
    return {
        gameSessions: [...gameSessions.entries()].map(([id, s]) => [id, { ...s, players: [...s.players.entries()] }]),
        playerSession: [...playerSession.entries()],
        roomGameSession: [...roomGameSession.entries()],
    }
}

function __deleteGameSessionOnlyForTests(gameId) {
    gameSessions.delete(gameId)
}

module.exports = {
    GAME_ROLES,
    ROLE_DEFINITIONS,
    ROLE_TEAMS,
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    endGameSessionForPlayer,
    acknowledgeRoleReveal,
    buildPhaseChangedPayload,
    DAY_PHASES,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
    getDayPhase,
    getDayVoteRound,
    enterDayVotePhase,
    getEligibleDayVoterUuids,
    submitNightAction,
    NIGHT_TURN_ORDER,
    getNightTurnOrder,
    NIGHT_TURN_DURATION_MS,
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    getAliveActorUuidsForRole,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
    submitDayVote,
    getSessionDayIndex,
    getSessionDayVoteRound,
    readDayVoteSubmitSfxEvent,
    readTribunalVoteSubmitSfxEvent,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    CHAT_CHANNELS,
    prepareNightResolution,
    prepareNightResolutionForSession,
    completeNightRole,
    isNightRoleCompleted,
    markNightSequenced,
    getNightProgress,
    collectRoleNightSubmissions,
    NIGHT_RECOVERY_STATES,
    commitNightResolution,
    commitDisconnectElimination,
    buildDisconnectEliminationPayload,
    commitParticipantDeparture,
    buildParticipationChangedPayload,
    buildPublicPhaseProgress,
    buildSelfSubmissionFields,
    bumpSelfProgressSeq,
    advanceStalledPhaseAfterDeparture,
    isParticipatingInSession,
    getActiveSessionForDeparture,
    TRIBUNAL_CANCELLED_OUTCOME,
    TRIBUNAL_CANCEL_REASONS,
    getDisconnectGraceTarget,
    isForfeitedFromSession,
    buildNightResultAppliedPayload,
    PUBLIC_NIGHT_DEATH_SOURCES,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
    JOKER_CHAT_MAX_LENGTH: CHAT_MAX_LENGTH,
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    EMOJI_MIN_INTERVAL_MS,
    assertSessionNotEnded,
    buildTerminalFields,
    buildGameResultRecord,
    DEATH_REASONS,
    getSessionSnapshotForPlayer,
    buildSessionSnapshot,
    getActiveSessionRoutingInfo,
    isParticipantBlockedFromMatchmaking,
    getEndedSessionPartyBroadcastContext,
    getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom,
    getEndedSessionParticipantUuids,
    getRoomCodeSessionState,
    getActiveGamePresenceSnapshot,
    __resetStateForTests,
    __getStateSnapshotForTests,
    __setNightCommitObserverForTests(observer = null) {
        nightCommitObserver = typeof observer === 'function' ? observer : null
        nightCommitObserverBusy = false
    },
    __registerNightPreparationForTests(session, resolution, options = {}) {
        const progress = getNightProgress(session)
        return registerNightPreparation(session, resolution, {
            sequenced: options.sequenced ?? (progress?.sequenced === true),
            progressRevision: options.progressRevision ?? (progress?.revision ?? 0),
        })
    },
    __testables: {
        evaluateWinCondition,
        finalizeGameSession,
        assertSessionNotEnded,
        assignRoles,
        enterDayPhase,
        enterDayVotePhase,
        getDayPhase,
        validateSessionInput,
        buildTimerSettings,
        buildSessionCandidate,
        buildRoomSettingsSource,
        resolveGameSource,
        checkGameSessionPreconditions,
        assertValidSessionForCommit,
        getSpecialRoleBudget,
        computeRoleComposition,
        isEligibleForNightAction,
        requiresAliveTarget,
        getDayVoteRound,
        getDayVoteExcludedUuids,
        sanitizeChatText,
        sanitizeJokerChatText: sanitizeChatText,
        resolveGameChatChannel,
        getChatRateLimitMap,
        getEligibleNightActorUuids,
        NIGHT_ACTION_RESOLUTION_POLICY,
        NIGHT_RECOVERY_STATES,
        getNightProgress,
        computeNightRoleStep,
        closeNightHealing,
        collectRoleNightSubmissions,
        resolveRoleNightAction,
        buildAssassinationFailureNotice,
        expireDeadPlayerNightEffects,
        resolveNightDeathSource,
        buildNightDeathReveals,
        getEligibleDayVoterUuids,
        tallyDayVoteOutcome,
        buildDayVoteBallotSnapshot,
        dayVoteBallotSnapshotsEqual,
        __deleteGameSessionOnlyForTests,
    },
}

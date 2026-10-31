const crypto = require('crypto')
const { gameSessions, playerSession, roomGameSession } = require('./core/state')
const { ROLE_DEFINITIONS, GAME_ROLES, ROLE_TEAMS } = require('./core/roles')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('./core/terminal')
const { observeNightCommit, isObserverBusy, setObserver } = require('./core/observer')
const { DEATH_REASONS, resolveGameSource, buildGameResultRecord, buildTerminalFields, buildPublicWinResult, } = require('./result')
// 재판은 phase/tribunal
const {
    TRIBUNAL_CANCELLED_OUTCOME,
    TRIBUNAL_CANCEL_REASONS,
    TRIBUNAL_PENDING,
    getEligibleTribunalVoterUuids,
    buildTribunalBallotSnapshot,
    tallyTribunalBallots,
    submitTribunalVote,
    readTribunalVoteSubmitSfxEvent,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
} = require('./phase/tribunal')
// 판 조회는 queries
const {
    getActiveSessionRoutingInfo,
    isParticipantBlockedFromMatchmaking,
    getRoomCodeSessionState,
    isForfeitedFromSession,
    isParticipatingInSession,
    getDisconnectGraceTarget,
    getActiveSessionForDeparture,
    getEndedSessionPartyBroadcastContext,
    getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom,
    getEndedSessionParticipantUuids,
} = require('./queries')
const {
    CHAT_MAX_LENGTH, 
    CHAT_MIN_INTERVAL_MS, 
    EMOJI_MIN_INTERVAL_MS, 
    CHAT_COMMIT_MAX_AGE_MS,
    CHAT_CHANNELS, 
    RATE_FIELD,
    sanitizeChatText, 
    getChatRateLimitMap, 
    resolveGameChatChannel, 
    getChatRecipientUuids,
    prepareJokerChatMessage, 
    commitJokerChatMessage, 
    prepareGameChatMessage, 
    commitGameChatMessage,
    clearEmoji,
} = require('./chat')

const {
    computeRoleComposition,
    getSpecialRoleBudget,
    resolveRoleComposition,
    validateResolvedComposition,
} = require('./roleComposition')
const { buildRoomSettingsView } = require('../utils/updateRoomSettingsValidation')
// 낮은 phase/day
const {
    DAY_PHASES,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
    enterDayPhase,
    getDayPhase,
    enterDayVotePhase,
    getDayVoteRound,
    getDayVoteExcludedUuids,
    getEligibleDayVoterUuids,
    tallyDayVoteOutcome,
    buildDayVoteBallotSnapshot,
    dayVoteBallotSnapshotsEqual,
    submitDayVote,
    readDayVoteSubmitSfxEvent,
    getSessionDayIndex,
    getSessionDayVoteRound,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
} = require('./phase/day')
// 판 정리는 core/cleanup
const {
    endGameSessionForPlayer,
} = require('./core/cleanup')
// 밤은 phase/night
const {
    NIGHT_TURN_ORDER,
    NIGHT_TURN_DURATION_MS,
    NIGHT_ACTION_RESOLUTION_POLICY,
    NIGHT_RECOVERY_STATES,
    EMPTY_COMPLETED_ROLES,
    SELF_TARGET_ALLOWED_ROLES,
    PUBLIC_NIGHT_DEATH_SOURCES,
} = require('./phase/night')
// 판 만들기·역할 공개는 setup
const {
    PLAYER_THEME_PALETTE_SIZE,
    assignRoles,
    validateSessionInput,
    buildTimerSettings,
    buildRoomSettingsSource,
    buildSessionCandidate,
    checkGameSessionPreconditions,
    prepareGameSession,
    assertValidSessionForCommit,
    commitGameSession,
    buildViewerRoleFields,
    buildPlayerThemeIndices,
    buildPlayerAccountProfileFields,
    buildRoomSettingsSourceFields,
    buildGameStartedPayload,
    acknowledgeRoleReveal,
    isRoleRevealComplete,
} = require('./setup')



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

function getNightTurnOrder(session) {
    const composition = session?.roleComposition
    if (!composition || typeof composition !== 'object') return NIGHT_TURN_ORDER
    const order = NIGHT_TURN_ORDER.filter((role) => Number.isInteger(composition[role]) && composition[role] > 0)
    return order.length > 0 ? Object.freeze(order) : NIGHT_TURN_ORDER
}

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

function isRecoveryBlockedState(state) {
    return state === NIGHT_RECOVERY_STATES.PENDING_RECOVERY || state === NIGHT_RECOVERY_STATES.DEATH_CANDIDATE
}

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
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
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
    if (isObserverBusy()) return { ok: false, code: 'NIGHT_COMMIT_REENTERED' }
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



function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
     setObserver(null)
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
        setObserver(observer)
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

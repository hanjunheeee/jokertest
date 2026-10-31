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
// 끊김 탈락·나가기는 departure
const {
    commitDisconnectElimination,
    buildDisconnectEliminationPayload,
    commitParticipantDeparture,
    advanceStalledPhaseAfterDeparture,
} = require('./departure')
// 진행 표시·스냅샷은 snapshot
const {
    buildPublicPhaseProgress,
    bumpSelfProgressSeq,
    buildSelfSubmissionFields,
    buildSessionSnapshot,
    getSessionSnapshotForPlayer,
    buildPhaseChangedPayload,
    buildParticipationChangedPayload,
} = require('./snapshot')
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
// 밤은 phase/night
const {
    isEligibleForNightAction,
    requiresAliveTarget,
    getEligibleNightActorUuids,
    getAliveActorUuidsForRole,
    getNightTurnOrder,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
    getNightProgress,
    markNightSequenced,
    isNightRoleCompleted,
    collectRoleNightSubmissions,
    resolveRoleNightAction,
    computeNightRoleStep,
    closeNightHealing,
    completeNightRole,
    submitNightAction,
    registerNightPreparation,
    prepareNightResolution,
    prepareNightResolutionForSession,
    resolveNightDeathSource,
    buildNightDeathReveals,
    expireDeadPlayerNightEffects,
    commitNightResolution,
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    buildAssassinationFailureNotice,
    buildNightResultAppliedPayload,
} = require('./phase/night')



 
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

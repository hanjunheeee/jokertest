// game-core 입구 파일, 폴더별로 나눈 함수 모아서 내보냄
// socket 쪽(gameSession·matchmaking)이 이 파일 require 해서 사용
// 판 장부·역할·판 끝내기·관찰자는 core (registry·rules·tools)
const crypto = require('crypto')
const { ROLE_DEFINITIONS, GAME_ROLES, ROLE_TEAMS } = require('./core/rules/roles')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('./core/rules/terminal')
const { observeNightCommit, isObserverBusy, setObserver } = require('./core/tools/observer')
// 시험 전용 장부 손잡이는 core/tools/testing (장부 직접 만지는 건 core·queries만)
const { __resetStateForTests, __getStateSnapshotForTests, __deleteGameSessionOnlyForTests } = require('./core/tools/testing')
// 죽은 이유·전적 기록·결과 공개는 result
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
    getActiveGamePresenceSnapshot,
} = require('./queries')
// 채팅·이모티콘은 chat
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
} = require('./chat')

// 역할 구성 계산은 core/rules/roleComposition (예전엔 game-core 바로 밑에 있던 파일)
const {
    computeRoleComposition,
    getSpecialRoleBudget,
    resolveRoleComposition,
    validateResolvedComposition,
} = require('./core/rules/roleComposition')
// 방 설정 화면용 모양 만들기는 game-core 밖 utils
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
// 판 정리는 core/registry/write
const {
    endGameSessionForPlayer,
} = require('./core/registry/write')
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


// 밖으로 내보내는 것 (socket 쪽이 쓰는 이름 그대로)
module.exports = {
    // 역할 정의
    GAME_ROLES,
    ROLE_DEFINITIONS,
    ROLE_TEAMS,
    // 판 만들기·판 정리·역할 공개
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    endGameSessionForPlayer,
    acknowledgeRoleReveal,
    buildPhaseChangedPayload,
    // 낮 단계·투표
    DAY_PHASES,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
    DAY_DISCUSSION_DURATION_MS,
    DAY_VOTE_DURATION_MS,
    getDayPhase,
    getDayVoteRound,
    enterDayVotePhase,
    getEligibleDayVoterUuids,
    // 밤 행동·턴
    submitNightAction,
    NIGHT_TURN_ORDER,
    getNightTurnOrder,
    NIGHT_TURN_DURATION_MS,
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    getAliveActorUuidsForRole,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
    // 낮 표 받기·투표 효과음
    submitDayVote,
    getSessionDayIndex,
    getSessionDayVoteRound,
    readDayVoteSubmitSfxEvent,
    readTribunalVoteSubmitSfxEvent,
    // 채팅 보내기·받는 사람
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    CHAT_CHANNELS,
    // 밤 판정·진행 기록
    prepareNightResolution,
    prepareNightResolutionForSession,
    completeNightRole,
    isNightRoleCompleted,
    markNightSequenced,
    getNightProgress,
    collectRoleNightSubmissions,
    NIGHT_RECOVERY_STATES,
    commitNightResolution,
    // 끊김 탈락·나가기·참여 변경 방송
    commitDisconnectElimination,
    buildDisconnectEliminationPayload,
    commitParticipantDeparture,
    buildParticipationChangedPayload,
    // 진행 표시
    buildPublicPhaseProgress,
    buildSelfSubmissionFields,
    bumpSelfProgressSeq,
    // 나간 뒤 멈춘 단계 넘기기·참여 확인
    advanceStalledPhaseAfterDeparture,
    isParticipatingInSession,
    getActiveSessionForDeparture,
    // 재판 취소 이름
    TRIBUNAL_CANCELLED_OUTCOME,
    TRIBUNAL_CANCEL_REASONS,
    // 끊김 유예 대상·기권 확인
    getDisconnectGraceTarget,
    isForfeitedFromSession,
    // 밤 결과 공개 방송
    buildNightResultAppliedPayload,
    PUBLIC_NIGHT_DEATH_SOURCES,
    // 낮 투표 판정·재판 표·재판 판정
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
    // 채팅 상수 (JOKER_CHAT_MAX_LENGTH는 옛 이름, 같은 값)
    JOKER_CHAT_MAX_LENGTH: CHAT_MAX_LENGTH,
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    EMOJI_MIN_INTERVAL_MS,
    // 끝난 판 막기·결과·전적 기록
    assertSessionNotEnded,
    buildTerminalFields,
    buildGameResultRecord,
    DEATH_REASONS,
    // 새로고침 복구용 스냅샷
    getSessionSnapshotForPlayer,
    buildSessionSnapshot,
    // 판 찾기 (매칭·끝난 판 파티·방 코드·접속 현황)
    getActiveSessionRoutingInfo,
    isParticipantBlockedFromMatchmaking,
    getEndedSessionPartyBroadcastContext,
    getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom,
    getEndedSessionParticipantUuids,
    getRoomCodeSessionState,
    getActiveGamePresenceSnapshot,
    // 여기부터 시험 전용 (운영 코드는 안 씀)
    __resetStateForTests,
    __getStateSnapshotForTests,
    // 밤 확정 관찰자 끼우기 (null이면 뺌)
    __setNightCommitObserverForTests(observer = null) {
        setObserver(observer)
    },
    // 밤 판정 준비 기록을 시험이 직접 넣기 (안 준 값은 지금 진행 기록에서 채움)
    __registerNightPreparationForTests(session, resolution, options = {}) {
        const progress = getNightProgress(session)
        return registerNightPreparation(session, resolution, {
            sequenced: options.sequenced ?? (progress?.sequenced === true),
            progressRevision: options.progressRevision ?? (progress?.revision ?? 0),
        })
    },
    // 안쪽 함수 직접 시험하는 묶음 (옛 이름 sanitizeJokerChatText도 같은 함수)
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

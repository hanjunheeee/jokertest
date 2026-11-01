// game-core 입구 파일, 폴더별로 나눈 함수 모아서 내보냄
// socket 쪽(gameSession·matchmaking)·전적 저장이 require 해서 사용
// 판 장부·역할·판 끝내기·관찰자는 core (registry·rules·tools)
const { ROLE_DEFINITIONS, GAME_ROLES, ROLE_TEAMS } = require('./core/rules/roles')
const { assertSessionNotEnded, evaluateWinCondition, finalizeGameSession } = require('./core/rules/terminal')
const { setObserver } = require('./core/tools/observer')
// 시험 전용 장부 손잡이는 core/tools/testing (장부는 core·queries만 만짐)
const { __resetStateForTests, __getStateSnapshotForTests, __deleteGameSessionOnlyForTests } = require('./core/tools/testing')
// 죽은 이유·전적 기록·결과 공개는 result
const { DEATH_REASONS } = require('./result/constants')
const { resolveGameSource, buildGameResultRecord } = require('./result/record')
const { buildTerminalFields } = require('./result/winReveal')
// 재판은 phase/tribunal
const { TRIBUNAL_CANCELLED, TRIBUNAL_CANCEL_REASONS } = require('./phase/tribunal/constants')
const { submitTribunalVote, readTribunalVoteSfx } = require('./phase/tribunal/vote')
const { prepareTribunalVoteResolution, commitTribunalVoteResolution, buildTribunalVoteResolvedPayload } = require('./phase/tribunal/resolve')
// 판 조회는 queries
const {
    getActiveSessionRoutingInfo,
    isMatchmakingBlocked,
    getRoomCodeSessionState,
    getDisconnectGraceTarget,
    getActiveSessionForDeparture,
    getActiveGamePresenceSnapshot,
} = require('./queries/live')
const { isForfeitedFromSession, isParticipatingInSession } = require('./queries/participation')
const {
    getEndedPartyContext,
    getEndedGameId,
    canLookupPartyRoom,
    getEndedPlayerUuids,
} = require('./queries/ended')
// 채팅·이모티콘은 chat
const {
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    EMOJI_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    CHAT_CHANNELS,
} = require('./chat/constants')
const {
    sanitizeChatText,
    getChatRateLimitMap,
    resolveGameChatChannel,
    getChatRecipientUuids,
} = require('./chat/rules')
const {
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
} = require('./chat/messages')

// 역할 구성 계산은 core/rules/roleComposition (밖도 이 자리로 바로 부름)
const {
    computeRoleComposition,
    getSpecialRoleBudget,
} = require('./core/rules/roleComposition')
// 낮은 phase/day
const { DAY_PHASES, DAY_DISCUSSION_DURATION_MS, DAY_VOTE_DURATION_MS } = require('./phase/day/constants')
const {
    enterDayPhase,
    getDayPhase,
    enterDayVotePhase,
    getDayVoteRound,
    getDayVoteExcludedUuids,
} = require('./phase/day/state')
const {
    getDayVoterUuids,
    tallyDayVoteOutcome,
    buildDayBallotSnap,
    dayBallotSnapsEqual,
} = require('./phase/day/ballots')
const { submitDayVote, readDayVoteSfx } = require('./phase/day/vote')
const { getSessionDayIndex, getSessionVoteRound, acknowledgeDayVoteReady } = require('./phase/day/ready')
const { buildDayPhaseChangedPayload, buildDayVoteResolvedPayload } = require('./phase/day/payloads')
const { prepareDayVoteResolution, commitDayVoteResolution } = require('./phase/day/resolve')
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
    PUBLIC_NIGHT_DEATH_SOURCES,
} = require('./phase/night/constants')
// 끊김 탈락·나가기는 departure
const { commitDisconnectElimination, buildDisconnectPayload } = require('./departure/eliminate')
const { commitParticipantDeparture, advanceStalledPhase } = require('./departure/leave')
// 진행 표시·스냅샷은 snapshot
const { buildPublicProgress, bumpSelfProgressSeq, buildSelfFields } = require('./snapshot/progress')
const { buildSessionSnapshot, getSessionSnapshotForPlayer } = require('./snapshot/session')
const { buildPhaseChangedPayload, buildParticipationChangedPayload } = require('./snapshot/payloads')
// 판 만들기·역할 공개는 setup
const { assignRoles } = require('./setup/assign')
const { validateSessionInput, buildTimerSettings, buildRoomSettingsSource } = require('./setup/input')
const { buildSessionCandidate, checkGameSessionPreconditions, prepareGameSession } = require('./setup/create')
const { assertValidSessionForCommit, commitGameSession } = require('./setup/commit')
const {
    buildGameStartedPayload,
} = require('./setup/startPayload')
const { acknowledgeRoleReveal } = require('./setup/roleAck')
// 밤은 phase/night
const {
    isEligibleForNightAction,
    requiresAliveTarget,
    getEligibleNightActorUuids,
    getAliveActorUuidsForRole,
    getNightTurnOrder,
    isRoleTurnComplete,
    getCurrentNightTurnRole,
} = require('./phase/night/actors')
const { getNightProgress, markNightSequenced, isNightRoleCompleted } = require('./phase/night/progress')
const {
    collectRoleNightSubmissions,
    resolveRoleNightAction,
    computeNightRoleStep,
    closeNightHealing,
    completeNightRole,
} = require('./phase/night/roleStep')
const { submitNightAction } = require('./phase/night/submit')
const { registerNightPreparation } = require('./phase/night/ledger')
const { prepareNightResolution, prepareNightResolutionForSession } = require('./phase/night/prepare')
const {
    resolveNightDeathSource,
    buildNightDeathReveals,
    buildNightTurnStartedPayload,
    buildNightTurnEndedPayload,
    buildAssassinFailNotice,
    buildNightResultAppliedPayload,
} = require('./phase/night/payloads')
const { expireDeadPlayerNightEffects, commitNightResolution } = require('./phase/night/commit')


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
    getDayVoterUuids,
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
    getSessionVoteRound,
    readDayVoteSfx,
    readTribunalVoteSfx,
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
    buildDisconnectPayload,
    commitParticipantDeparture,
    buildParticipationChangedPayload,
    // 진행 표시
    buildPublicProgress,
    buildSelfFields,
    bumpSelfProgressSeq,
    // 나간 뒤 멈춘 단계 넘기기·참여 확인
    advanceStalledPhase,
    isParticipatingInSession,
    getActiveSessionForDeparture,
    // 재판 취소 이름
    TRIBUNAL_CANCELLED,
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
    isMatchmakingBlocked,
    getEndedPartyContext,
    getEndedGameId,
    canLookupPartyRoom,
    getEndedPlayerUuids,
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
        buildAssassinFailNotice,
        expireDeadPlayerNightEffects,
        resolveNightDeathSource,
        buildNightDeathReveals,
        getDayVoterUuids,
        tallyDayVoteOutcome,
        buildDayBallotSnap,
        dayBallotSnapsEqual,
        __deleteGameSessionOnlyForTests,
    },
}

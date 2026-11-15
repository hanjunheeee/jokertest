// socket gameSession 입구 파일
// gameSession/ 폴더의 핸들러·타이머를 모아 내보냄 + 아래 파일이 부를 위층 함수 잇기, socket.js·시험이 씀
// 전적 저장·업적 평가는 service가 맡음 (socket은 부르기만, 시험 주입구 이름은 그대로 내보냄)
const gameRecordService = require('../services/game/record')
const { persistTerminalSession, setEmitToUser } = gameRecordService
const gameAchievementService = require('../services/game/achievementHooks')
const kickReceiptStore = require('./kickReceiptStore')
const { deps: matchmakingDeps } = require('./matchmaking/core/deps')
const { isolate } = require('./common/isolate')
const { NIGHT_TURN_STAGES } = require('./gameSession/core/constants')
const { nightTurnRuns, roleRevealRuns, tribunalRuns, setPhaseHooks } = require('./gameSession/core/state')
const {
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
} = require('./gameSession/core/timers')
const {
    setOnlineUsersRegistry,
    recordOwnership,
    canProcessDisconnectFor,
    isCurrentSocketForUuid,
} = require('./gameSession/connection/ownership')
const {
    getDisconnectGraceRun,
    beginDisconnectGrace,
    cancelDisconnectGrace,
    expireDisconnectGrace,
} = require('./gameSession/connection/grace')
const { resyncSessionRouting } = require('./gameSession/connection/routing')
const { isEligibleRecipient, buildSessionEndContext } = require('./gameSession/delivery/eligibility')
const {
    detachSocketFromChannel,
    detachFromGameChannel,
    emitToGameChannel,
    resolveSessionSockets,
    resolveChatRecipientSockets,
    resolveJokerTeammateSockets,
} = require('./gameSession/delivery/broadcast')
const {
    endNightTurn,
    settleNightTurnIfComplete,
    startNightTurnSequence,
    stopNightTurnSequence,
} = require('./gameSession/phase/night/turn')
const {
    startDayPhaseTimer,
    stopDayPhaseTimer,
    syncSessionPhaseTimers,
    settleDayVoteIfComplete,
} = require('./gameSession/phase/day')
const { ensureRoleRevealTimer, stopRoleRevealTimer } = require('./gameSession/phase/roleReveal')
const { startTribunalTimer, stopTribunalTimer, settleTribunalIfComplete } = require('./gameSession/phase/tribunal')
const { SETTLE_DELAY_MS } = require('./gameSession/phase/settle')
const { maybeResolveTribunal } = require('./gameSession/departure/autoResolve')
const { finalizeNightForSession } = require('./gameSession/phase/night/finalize')
const { finalizeGameSessionEnd, leaveEndedSession } = require('./gameSession/departure/end')
const { applyParticipantDeparture, announceSupersededDepartures } = require('./gameSession/departure/apply')
const { handleAcknowledgeRoleReveal, handleAcknowledgeDayVoteReady } = require('./gameSession/handlers/ready')
const { handleSubmitNightAction } = require('./gameSession/handlers/night')
const {
    handleSubmitJokerChatMessage,
    handleSubmitGameChatMessage,
} = require('./gameSession/handlers/chat')
const { handleSendEmoji } = require('./gameSession/handlers/emoji')
const { handleSubmitDayVote } = require('./gameSession/handlers/dayVote')
const { handleCastTribunalVote } = require('./gameSession/handlers/tribunal')
const { handleLeaveGameSession, onDisconnect } = require('./gameSession/handlers/leave')
const { handleGetSessionSnapshot } = require('./gameSession/handlers/snapshot')
const { handleGetKickResult } = require('./gameSession/handlers/kickResult')
const { setLobbyEntryHooks } = require('./matchmaking/room/lobbyEntry')
const {
    registerGameHandlers,
    getActiveGamePresenceSnapshot,
    __resetStateForTests,
    __getRegistryForTests,
} = require('./gameSession/handlers/register')

// 아래 파일이 부를 위층 함수 잇기 (require 고리 막기)
setPhaseHooks({
    applyParticipantDeparture,
    finalizeNightForSession,
    resolveTribunalNow: maybeResolveTribunal,
})
// 로비 입장 정리가 부를 판 쪽 함수 (죽은 사람 판 풀기·끝난 판 빼기·판 채널 떼기)
setLobbyEntryHooks({ applyParticipantDeparture, leaveEndedSession, detachFromGameChannel })

// 판 시작 직후 역할 공개 10초 마감 걸기: matchmaking 시작 처리가 부름, 던져도 시작 답은 그대로 (사용자 결정 2026-11-09)
matchmakingDeps.onGameStarted = (io, session) => isolate('[역할 공개 마감 시작 실패]', { code: 'TIMER_START_ERROR', gameId: session?.id },
    () => ensureRoleRevealTimer(io, session))

// 새 판 시작 때 옛 판에서 뺀 죽은 사람 알리기·옛 판 채널 떼기: matchmaking 시작 처리가 부름, 던져도 시작 답은 그대로
matchmakingDeps.onLiveSeatsReleased = (io, released, socketsByUuid) => isolate('[새 판 시작 옛 판 정리 실패]', { code: 'SUPERSEDED_NOTICE_ERROR' },
    () => announceSupersededDepartures(io, released, socketsByUuid))

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
    __getRegistryForTests,
    __testables: {
        handleAcknowledgeRoleReveal,
        handleAcknowledgeDayVoteReady,
        handleSubmitNightAction,
        handleSubmitJokerChatMessage,
        handleSubmitGameChatMessage,
        finalizeNightForSession,
        endNightTurn,
        handleSubmitDayVote,
        handleCastTribunalVote,
        handleLeaveGameSession,
        handleGetSessionSnapshot,
        handleSendEmoji,
        handleGetKickResult,
        applyParticipantDeparture,
        finalizeGameSessionEnd,
        persistTerminalSession,
        detachSocketFromChannel,
        __getTerminalPersistRunsForTests: gameRecordService.__getTerminalPersistRunsForTests,
        __setTerminalPersistTimersForTests: gameRecordService.__setTerminalPersistTimersForTests,
        __setGameResultPersistForTests: gameRecordService.__setGameResultPersistForTests,
        resolveJokerTeammateSockets,
        resolveChatRecipientSockets,
        resolveSessionSockets,
        emitToGameChannel,
        isEligibleRecipient,
        buildSessionEndContext,
        canProcessDisconnectFor,
        recordOwnership,
        startNightTurnSequence,
        stopNightTurnSequence,
        NIGHT_TURN_STAGES,
        __getNightTurnRunForTests: (gameId) => nightTurnRuns.get(gameId) ?? null,
        computeEmptyTurnDelayMs,
        resolveNightTurnDurationMs,
        startDayPhaseTimer,
        stopDayPhaseTimer,
        syncSessionPhaseTimers,
        ensureRoleRevealTimer,
        stopRoleRevealTimer,
        __getRoleRevealRunForTests: (gameId) => roleRevealRuns.get(gameId) ?? null,
        startTribunalTimer,
        stopTribunalTimer,
        __getTribunalRunForTests: (gameId) => tribunalRuns.get(gameId) ?? null,
        // 다 차면 5초 뒤 판정: 마감 당기기 셋 + 5초 값
        settleDayVoteIfComplete,
        settleTribunalIfComplete,
        settleNightTurnIfComplete,
        SETTLE_DELAY_MS,
        beginDisconnectGrace,
        cancelDisconnectGrace,
        expireDisconnectGrace,
        getDisconnectGraceRun,
        __setRecordVoteParticipationForTests: gameAchievementService.__setRecordVoteParticipationForTests,
        __setEvaluateAchievementsForTests: gameAchievementService.__setEvaluateAchievementsForTests,
    },
}

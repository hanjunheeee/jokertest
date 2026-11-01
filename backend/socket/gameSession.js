// socket gameSession 입구 파일
// gameSession/ 폴더의 핸들러·타이머를 모아 내보냄 + 아래 파일이 부를 위층 함수 잇기, socket.js·시험이 씀
// 전적 저장·업적 평가는 service가 맡음 (socket은 부르기만, 시험 주입구 이름은 그대로 내보냄)
const gameRecordService = require('../services/game/record')
const { persistTerminalSession, setEmitToUser } = gameRecordService
const gameAchievementService = require('../services/game/achievementHooks')
const kickReceiptStore = require('./kickReceiptStore')
const { NIGHT_TURN_STAGES } = require('./gameSession/core/constants')
const { nightTurnRuns, setPhaseHooks } = require('./gameSession/core/state')
const {
    resolveNightPresentationWaitTimeoutMs,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
} = require('./gameSession/core/timers')
const {
    setOnlineUsersRegistry,
    recordConnectionOwnership,
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
const { isEligibleSessionRecipient, buildSessionEndContext } = require('./gameSession/delivery/eligibility')
const {
    detachSocketFromChannel,
    emitToGameChannel,
    resolveSessionParticipantSockets,
    resolveChatRecipientSockets,
    resolveJokerTeammateSockets,
} = require('./gameSession/delivery/broadcast')
const {
    buildNightPresentationContract,
    buildNightSuccessPayload,
} = require('./gameSession/phase/night/contract')
const { getNightSuccessReceipts } = require('./gameSession/phase/night/receipts')
const { emitNightSuccessEvents, emitNightPresentationWait } = require('./gameSession/phase/night/notify')
const {
    beginNightPresentationWait,
    releaseNightPresentationWait,
    isNightPresentationWaitActive,
    activateNightPresentationWait,
    reevaluateNightPresentationWait,
} = require('./gameSession/phase/night/wait')
const {
    advanceNightTurn,
    endNightTurn,
    startNightTurnSequence,
    stopNightTurnSequence,
} = require('./gameSession/phase/night/turn')
const { startDayPhaseTimer, stopDayPhaseTimer } = require('./gameSession/phase/day')
const { finalizeNightForSession } = require('./gameSession/phase/night/finalize')
const { finalizeGameSessionEnd } = require('./gameSession/departure/end')
const { applyParticipantDeparture } = require('./gameSession/departure/apply')
const { handleAcknowledgeRoleReveal, handleAcknowledgeDayVoteReady } = require('./gameSession/handlers/ready')
const {
    handleSubmitNightAction,
    handleResolveNight,
    handleAcknowledgeNightActionSuccess,
} = require('./gameSession/handlers/night')
const {
    handleSubmitJokerChatMessage,
    handleSubmitGameChatMessage,
    handleSendEmoji,
} = require('./gameSession/handlers/chat')
const { handleSubmitDayVote, handleResolveDayVote } = require('./gameSession/handlers/dayVote')
const { handleCastTribunalVote, handleResolveTribunalVote } = require('./gameSession/handlers/tribunal')
const { handleLeaveGameSession, onDisconnect } = require('./gameSession/handlers/leave')
const { handleGetSessionSnapshot } = require('./gameSession/handlers/snapshot')
const { handleKickGamePlayer, handleGetKickResult } = require('./gameSession/handlers/kick')
const {
    registerGameHandlers,
    getActiveGamePresenceSnapshot,
    __resetStateForTests,
    __getOnlineUsersRegistryForTests,
} = require('./gameSession/handlers/register')

// 아래 파일이 부를 위층 함수 잇기 (require 고리 막기)
setPhaseHooks({
    applyParticipantDeparture,
    finalizeNightForSession,
    advanceNightTurn,
})

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
        __getTerminalPersistRunsForTests: gameRecordService.__getTerminalPersistRunsForTests,
        __setTerminalPersistTimersForTests: gameRecordService.__setTerminalPersistTimersForTests,
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
        __getNightSuccessReceiptsForTests: (session) => getNightSuccessReceipts(session) ?? null,
        computeEmptyTurnDelayMs,
        resolveNightTurnDurationMs,
        startDayPhaseTimer,
        stopDayPhaseTimer,
        beginDisconnectGrace,
        cancelDisconnectGrace,
        expireDisconnectGrace,
        getDisconnectGraceRun,
        __setRecordVoteParticipationForTests: gameAchievementService.__setRecordVoteParticipationForTests,
        __setEvaluateAchievementsForTests: gameAchievementService.__setEvaluateAchievementsForTests,
    },
}

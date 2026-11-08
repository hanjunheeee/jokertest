// socket gameSession 입구 파일
// gameSession/ 폴더의 핸들러·타이머를 모아 내보냄 + 아래 파일이 부를 위층 함수 잇기, socket.js·시험이 씀
// 전적 저장·업적 평가는 service가 맡음 (socket은 부르기만, 시험 주입구 이름은 그대로 내보냄)
const gameRecordService = require('../services/game/record')
const { persistTerminalSession, setEmitToUser } = gameRecordService
const gameAchievementService = require('../services/game/achievementHooks')
const kickReceiptStore = require('./kickReceiptStore')
const { NIGHT_TURN_STAGES } = require('./gameSession/core/constants')
const { nightTurnRuns, roleRevealRuns, tribunalRuns, setPhaseHooks } = require('./gameSession/core/state')
const {
    resolveNightWaitMs,
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
    emitToGameChannel,
    resolveSessionSockets,
    resolveChatRecipientSockets,
    resolveJokerTeammateSockets,
} = require('./gameSession/delivery/broadcast')
const {
    buildNightPresentationContract,
    buildNightPayload,
} = require('./gameSession/phase/night/contract')
const { getNightSuccessReceipts } = require('./gameSession/phase/night/receipts')
const { emitNightSuccessEvents, emitNightWait } = require('./gameSession/phase/night/notify')
const {
    beginNightWait,
    releaseNightPresentationWait,
    isNightPresentationWaitActive,
    activateNightWait,
    reevaluateNightWait,
} = require('./gameSession/phase/night/wait')
const {
    advanceNightTurn,
    endNightTurn,
    startNightTurnSequence,
    stopNightTurnSequence,
} = require('./gameSession/phase/night/turn')
const { startDayPhaseTimer, stopDayPhaseTimer, syncSessionPhaseTimers } = require('./gameSession/phase/day')
const { ensureRoleRevealTimer, stopRoleRevealTimer } = require('./gameSession/phase/roleReveal')
const { startTribunalTimer, stopTribunalTimer } = require('./gameSession/phase/tribunal')
const { maybeResolveTribunal } = require('./gameSession/departure/autoResolve')
const { finalizeNightForSession } = require('./gameSession/phase/night/finalize')
const { finalizeGameSessionEnd } = require('./gameSession/departure/end')
const { applyParticipantDeparture } = require('./gameSession/departure/apply')
const { handleAcknowledgeRoleReveal, handleAcknowledgeDayVoteReady } = require('./gameSession/handlers/ready')
const {
    handleSubmitNightAction,
    handleResolveNight,
    handleAckNightSuccess,
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
const { handleGetKickResult } = require('./gameSession/handlers/kickResult')
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
    advanceNightTurn,
    resolveTribunalNow: maybeResolveTribunal,
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
    __getRegistryForTests,
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
        buildNightPresentationContract,
        beginNightWait,
        releaseNightPresentationWait,
        isNightPresentationWaitActive,
        NIGHT_TURN_STAGES,
        activateNightWait,
        reevaluateNightWait,
        emitNightWait,
        resolveNightWaitMs,
        __getNightTurnRunForTests: (gameId) => nightTurnRuns.get(gameId) ?? null,
        buildNightPayload,
        emitNightSuccessEvents,
        handleAckNightSuccess,
        __getNightSuccessReceiptsForTests: (session) => getNightSuccessReceipts(session) ?? null,
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
        beginDisconnectGrace,
        cancelDisconnectGrace,
        expireDisconnectGrace,
        getDisconnectGraceRun,
        __setRecordVoteParticipationForTests: gameAchievementService.__setRecordVoteParticipationForTests,
        __setEvaluateAchievementsForTests: gameAchievementService.__setEvaluateAchievementsForTests,
    },
}

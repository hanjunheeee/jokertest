// 핸들러 등록 파일
// 게임 이벤트 핸들러 등록·접속 현황 + 시험용 상태 초기화, 입구 gameSession.js가 내보내고 socket.js가 연결마다 부름
const gameSessionCore = require('../../../game-core/gameSession')
const gameRecordService = require('../../../services/game/record')
const kickReceiptStore = require('../../kickReceiptStore')
const {
    nightTurnRuns,
    dayPhaseRuns,
    disconnectGraceRuns,
    departureResolveMarks,
    nightFinalizeInFlight,
} = require('../core/state')
const {
    setOnlineUsersRegistry,
    getOnlineUsersRegistry,
    recordOwnership,
} = require('../connection/ownership')
const { detachAllGraces } = require('../connection/grace')
const { resetNightReceipts } = require('../phase/night/receipts')
const { stopNightTurnSequence } = require('../phase/night/turn')
const { stopDayPhaseTimer } = require('../phase/day')
const { handleAcknowledgeRoleReveal, handleAcknowledgeDayVoteReady } = require('./ready')
const {
    handleSubmitNightAction,
    handleResolveNight,
    handleAckNightSuccess,
} = require('./night')
const { handleSubmitJokerChatMessage, handleSubmitGameChatMessage, handleSendEmoji } = require('./chat')
const { handleSubmitDayVote, handleResolveDayVote } = require('./dayVote')
const { handleCastTribunalVote, handleResolveTribunalVote } = require('./tribunal')
const { handleLeaveGameSession } = require('./leave')
const { handleGetSessionSnapshot } = require('./snapshot')
const { handleKickGamePlayer, handleGetKickResult } = require('./kick')

// 게임 이벤트 핸들러 등록, 등록 때 이 소켓의 연결 소유권도 기록 (disconnect 판정용)
function registerGameHandlers(io, socket, uuid) {
    recordOwnership(io, socket, uuid)
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
        handleAckNightSuccess(io, socket, uuid, payload, callback))
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_GAME_PLAYER, (payload, callback) =>
        handleKickGamePlayer(io, socket, uuid, payload, callback))
    socket.on(kickReceiptStore.KICK_EVENTS.GET_KICK_RESULT, (payload, callback) =>
        handleGetKickResult(io, socket, uuid, payload, callback))
}

// 동시 접속 집계용 진행 중 판 현황 (core에 맡김)
function getActiveGamePresenceSnapshot() {
    return gameSessionCore.getActiveGamePresenceSnapshot()
}

// 시험용 초기화: 접속 목록·사용자 전송·추방 영수증·표식·밤 기록 비우고 타이머 run 4종 전부 끔
function __resetStateForTests() {
    setOnlineUsersRegistry(null)
    gameRecordService.setEmitToUser(null)
    kickReceiptStore.__resetKickReceiptsForTests()
    departureResolveMarks.clear()
    nightFinalizeInFlight.clear()
    resetNightReceipts()
    // 타이머 run 끄기 (끄면서 보관함에서 지우니 키 먼저 복사), 마지막은 전적 재시도
    for (const gameId of [...nightTurnRuns.keys()]) stopNightTurnSequence(gameId)
    for (const gameId of [...dayPhaseRuns.keys()]) stopDayPhaseTimer(gameId)
    for (const gameId of [...disconnectGraceRuns.keys()]) detachAllGraces(gameId)
    gameRecordService.__resetTerminalPersistForTests()
}

// 시험용: 지금 넣어 둔 접속 목록 꺼내기
function __getRegistryForTests() {
    return getOnlineUsersRegistry()
}

module.exports = {
    registerGameHandlers,
    getActiveGamePresenceSnapshot,
    __resetStateForTests,
    __getRegistryForTests,
}

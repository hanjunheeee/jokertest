// 핸들러 등록 파일
// 게임 이벤트 핸들러 등록·접속 현황 + 시험용 상태 초기화, 입구 gameSession.js가 내보내고 socket.js가 연결마다 부름
const gameSessionCore = require('../../../game-core/gameSession')
const gameRecordService = require('../../../services/game/record')
const kickReceiptStore = require('../../kickReceiptStore')
const {
    nightTurnRuns,
    dayPhaseRuns,
    roleRevealRuns,
    tribunalRuns,
    disconnectGraceRuns,
    endedSweepRuns,
    nightFinalizeInFlight,
} = require('../core/state')
const {
    setOnlineUsersRegistry,
    getOnlineUsersRegistry,
    recordOwnership,
} = require('../connection/ownership')
const { detachAllGraces } = require('../connection/grace')
const { stopNightTurnSequence } = require('../phase/night/turn')
const { stopDayPhaseTimer } = require('../phase/day')
const { stopRoleRevealTimer } = require('../phase/roleReveal')
const { stopTribunalTimer } = require('../phase/tribunal')
const { cancelEndedSweep } = require('../departure/end')
const { __resetReturnRoomsForTests } = require('../../matchmaking/room/returnRoom')
const { __resetRoomDirectoryForTests } = require('../../matchmaking/cluster/roomDirectory')
const { handleAcknowledgeRoleReveal, handleAcknowledgeDayVoteReady } = require('./ready')
const { handleSubmitNightAction } = require('./night')
const { handleSubmitJokerChatMessage, handleSubmitGameChatMessage } = require('./chat')
const { handleSendEmoji } = require('./emoji')
const { handleSubmitDayVote, handleWithdrawDayVote } = require('./dayVote')
const { handleCastTribunalVote } = require('./tribunal')
const { handleLeaveGameSession } = require('./leave')
const { handleGetSessionSnapshot } = require('./snapshot')
const { handleGetKickResult } = require('./kickResult')

// 게임 이벤트 핸들러 등록, 등록 때 이 소켓의 연결 소유권도 기록 (disconnect 판정용)
// 낮 집계·재판 판정·밤 종료 요청은 받지 않음: 표가 다 차면 서버가 5초 뒤 스스로 판정
function registerGameHandlers(io, socket, uuid) {
    recordOwnership(io, socket, uuid)
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
    socket.on('ready_for_day_vote', (payload, callback) => handleAcknowledgeDayVoteReady(io, socket, uuid, payload, callback))
    socket.on('submit_night_action', (payload, callback) => handleSubmitNightAction(socket, uuid, payload, callback))
    socket.on('submit_joker_chat_message', (payload, callback) => handleSubmitJokerChatMessage(io, socket, uuid, payload, callback))
    socket.on('submit_game_chat_message', (payload, callback) => handleSubmitGameChatMessage(io, socket, uuid, payload, callback))
    socket.on('cast_day_vote', (payload, callback) => handleSubmitDayVote(io, socket, uuid, payload, callback))
    // 낮 표 거두기("투표취소"): 기권(cast_day_vote 대상 null)과 달리 안 낸 사람으로 돌림 (사용자 결정 2026-11-18)
    socket.on('withdraw_day_vote', (payload, callback) => handleWithdrawDayVote(io, socket, uuid, payload, callback))
    socket.on('cast_tribunal_vote', (payload, callback) => handleCastTribunalVote(io, socket, uuid, payload, callback))
    socket.on('send_emoji', (payload, callback) => handleSendEmoji(io, socket, uuid, payload, callback))
    socket.on('leave_game_session', (payload, callback) => handleLeaveGameSession(io, socket, uuid, payload, callback))
    socket.on('get_session_snapshot', (payload, callback) => handleGetSessionSnapshot(io, socket, uuid, payload, callback))
    // 게임 중 추방(kick_game_player)은 없앰, 결과 조회는 대기방 추방 화면이 씀
    socket.on(kickReceiptStore.KICK_EVENTS.GET_KICK_RESULT, (payload, callback) =>
        handleGetKickResult(io, socket, uuid, payload, callback))
}

// 동시 접속 집계용 진행 중 판 현황 (core에 맡김)
function getActiveGamePresenceSnapshot() {
    return gameSessionCore.getActiveGamePresenceSnapshot()
}

// 시험용 초기화: 접속 목록·사용자 전송·추방 영수증 비우고 타이머 run·180초 시계·끊김 유예 전부 끔
function __resetStateForTests() {
    setOnlineUsersRegistry(null)
    gameRecordService.setEmitToUser(null)
    kickReceiptStore.__resetKickReceiptsForTests()
    for (const gameId of [...endedSweepRuns.keys()]) cancelEndedSweep(gameId)
    nightFinalizeInFlight.clear()
    // 타이머 run 끄기 (끄면서 보관함에서 지우니 키 먼저 복사), 마지막은 전적 재시도
    for (const gameId of [...nightTurnRuns.keys()]) stopNightTurnSequence(gameId)
    for (const gameId of [...dayPhaseRuns.keys()]) stopDayPhaseTimer(gameId)
    for (const gameId of [...roleRevealRuns.keys()]) stopRoleRevealTimer(gameId)
    for (const gameId of [...tribunalRuns.keys()]) stopTribunalTimer(gameId)
    for (const gameId of [...disconnectGraceRuns.keys()]) detachAllGraces(gameId)
    gameRecordService.__resetTerminalPersistForTests()
    // 판 끝 뒤 다시 연 방 기록·판 동안 잡아 둔 방 코드도 비움 (180초 시계를 껐으니 남으면 다음 시험에 샘)
    __resetReturnRoomsForTests()
    __resetRoomDirectoryForTests()
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

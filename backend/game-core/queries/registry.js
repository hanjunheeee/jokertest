// 판 장부 읽기 파일
// 장부 Map 3개 읽기 + 장부에 있는 그 판인지, core·queries 밖 파일이 장부 직접 안 만지게 사용
const { gameSessions, playerSession, roomGameSession } = require('../core/state')

// 판 id → 판 (없으면 undefined)
function getSessionById(gameId) {
    return gameSessions.get(gameId)
}

// 판 id가 장부에 있는지
function hasSessionId(gameId) {
    return gameSessions.has(gameId)
}

// 사람 uuid → 지금 판 id (없으면 undefined)
function getPlayerGameId(uuid) {
    return playerSession.get(uuid)
}

// 이 방에 열린 판이 있는지
function hasRoomSession(roomId) {
    return roomGameSession.has(roomId)
}

// 받은 판이 진짜 장부에 있는 그 판인지 (지운 판·밖에서 만든 판 거절)
function isRegisteredSession(session) {
    return !!session && typeof session.id === 'string' && gameSessions.get(session.id) === session
}

module.exports = {
    getSessionById,
    hasSessionId,
    getPlayerGameId,
    hasRoomSession,
    isRegisteredSession,
}

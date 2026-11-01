// 판 등록 파일
// 판 장부 3개에 판 넣기, 판 열기(setup/commit.js)가 검사 다 끝낸 뒤 부름
// 장부 쓰기는 core에서만 (빼기는 core/cleanup.js)
const { gameSessions, playerSession, roomGameSession } = require('./state')

// 장부 3개에 같이 넣음 = 판 생김 (하나만 넣으면 장부끼리 안 맞음)
function registerGameSession(session) {
    gameSessions.set(session.id, session)
    roomGameSession.set(session.roomId, session.id)
    session.players.forEach((_, uuid) => playerSession.set(uuid, session.id))
}

module.exports = { registerGameSession }

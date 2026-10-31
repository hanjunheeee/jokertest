// 판 정리 파일
// 판 장부에서 사람·판 빼기, 나가기·새 판 시작·socket 종료 정리가 사용
const { playerSession, gameSessions, roomGameSession } = require('./state')
const { clearEmoji } = require('../chat')

// 사람 하나를 판에서 뺌
// 끝난 판이면 그 사람만 빼고 다 나가면 판 지움, 진행 중 판이면 판째로 지움
function endGameSessionForPlayer(uuid, reason, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return { ok: false, code: 'NOT_IN_SESSION' }
    if (expectedGameId !== undefined && gameId !== expectedGameId) {
        return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    }

    const session = gameSessions.get(gameId)

    if (session.phase === 'ENDED') {
        const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
        playerSession.delete(uuid)

        const sessionDeleted = session.detachedUuids.size >= session.players.size
        if (sessionDeleted) {
            gameSessions.delete(gameId)
            if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
            cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
            clearEmoji(session)
        }
        return { ok: true, session, reason, sessionDeleted, cleanupUuids }
    }

    const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
    gameSessions.delete(gameId)
    if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
    cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
    clearEmoji(session)

    return { ok: true, session, reason, sessionDeleted: true, cleanupUuids }
}

module.exports = {
    endGameSessionForPlayer,
}
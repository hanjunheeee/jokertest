// 판 장부 쓰기 파일
// 장부에 판 넣기 + 사람·판 빼기, 판 열기·나가기·새 판 시작·socket 종료 정리가 사용
// 장부 쓰기는 여기서만, 이모티콘 비우기도 여기 둠 (core가 chat 부르는 거꾸로 된 require 막기)
const { playerSession, gameSessions, roomGameSession } = require('./state')

// 장부 3개에 같이 넣음 = 판 생김 (하나만 넣으면 장부끼리 안 맞음)
// 판 열기(setup/commit.js)가 검사 다 끝낸 뒤 부름
function registerGameSession(session) {
    gameSessions.set(session.id, session)
    roomGameSession.set(session.roomId, session.id)
    session.players.forEach((_, uuid) => playerSession.set(uuid, session.id))
}

// 판 닫을 때 이모티콘 기록 비움
// 이모티콘 간격 기록 + 사람별 이모티콘 목록, endGameSessionForPlayer가 부름
function clearEmoji(session) {
    if (session?.emojiRateLimit instanceof Map) session.emojiRateLimit.clear()
    if (session?.emojiPaletteByUuid instanceof Map) session.emojiPaletteByUuid.clear()
}

// 사람 하나의 내 판 기록 지움, 그 기록이 이 판일 때만 (다른 판 기록 안 건드림)
// 지웠으면 true, 게임 중 나가기가 사용
function releasePlayerSession(uuid, gameId) {
    const released = playerSession.get(uuid) === gameId
    if (released) playerSession.delete(uuid)
    return released
}

// 사람 하나를 판에서 뺌
// 끝난 판이면 그 사람만 빼고 다 나가면 판 지움, 진행 중 판이면 판째로 지움
function endGameSessionForPlayer(uuid, reason, expectedGameId) {
    // 판에 없는 사람이면 거절
    const gameId = playerSession.get(uuid)
    if (!gameId) return { ok: false, code: 'NOT_IN_SESSION' }
    // 부른 쪽이 생각한 판이 지금 판이 아니면 거절 (새 판을 잘못 지우는 것 막기)
    if (expectedGameId !== undefined && gameId !== expectedGameId) {
        return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    }

    const session = gameSessions.get(gameId)

    // 끝난 판: 결과 화면 닫은 사람만 하나씩 뺌
    if (session.phase === 'ENDED') {
        // 아직 이 판에 묶여 있는 사람 목록 (판 지울 때 같이 풀기)
        const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
        // 여기부터 진짜 바뀜: 나간 사람 표시하고 내 판 기록 지움
        if (!session.detachedUuids) session.detachedUuids = new Set()
        session.detachedUuids.add(uuid)
        playerSession.delete(uuid)

        // 다 나갔으면 판 장부 3개에서 판째로 지움
        const sessionDeleted = session.detachedUuids.size >= session.players.size
        if (sessionDeleted) {
            gameSessions.delete(gameId)
            if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
            cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
            clearEmoji(session)
        }
        return { ok: true, session, reason, sessionDeleted, cleanupUuids }
    }

    // 진행 중 판: 판째로 지우고 묶인 사람 전부 풀어 줌
    const cleanupUuids = [...session.players.keys()].filter((playerUuid) => playerSession.get(playerUuid) === gameId)
    // 여기부터 진짜 바뀜: 장부 3개에서 판 지움 (방 기록은 이 판일 때만)
    gameSessions.delete(gameId)
    if (roomGameSession.get(session.roomId) === gameId) roomGameSession.delete(session.roomId)
    cleanupUuids.forEach((playerUuid) => playerSession.delete(playerUuid))
    clearEmoji(session)

    return { ok: true, session, reason, sessionDeleted: true, cleanupUuids }
}

module.exports = {
    registerGameSession,
    clearEmoji,
    releasePlayerSession,
    endGameSessionForPlayer,
}
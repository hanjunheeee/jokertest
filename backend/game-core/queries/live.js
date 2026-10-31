// 진행 중 판 찾기 파일
// 누가 어느 판인지·참여 중인지·유예 대상인지, socket 쪽이 gameSession.js 통해서 사용
const { gameSessions, playerSession } = require('../core/state')

// 사람 → 지금 판 id·채널
function getActiveSessionRoutingInfo(uuid) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    return { gameId: session.id, channelId: session.channelId }
}

// 게임 중이라 매칭 못 들어가는지 (기권한 사람은 풀어 줌)
function isParticipantBlockedFromMatchmaking(uuid) {
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return false
    const session = gameSessions.get(routing.gameId)
    if (!session) return false
    return session.phase !== 'ENDED'
}

// 방 코드로 판 상태 찾기 ("이미 시작" 구분용)
function getRoomCodeSessionState({ roomCode, roomId } = {}) {
    const normalizedCode = typeof roomCode === 'string' ? roomCode.trim() : ''
    if (!normalizedCode) return null
    const expectedRoomId = typeof roomId === 'string' && roomId ? roomId : null

    for (const session of gameSessions.values()) {
        if (session?.roomCode !== normalizedCode) continue
        if (expectedRoomId !== null && session.roomId !== expectedRoomId) continue
        return { gameId: session.id, roomId: session.roomId ?? null, phase: session.phase }
    }
    return null
}

// 기권한 사람인지
function isForfeitedFromSession(gameId, uuid) {
    const session = gameSessions.get(gameId)
    if (!session) return false
    return session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)
}

// 아직 판에 참여 중인지 (빠졌거나 기권했으면 아님)
function isParticipatingInSession(session, uuid) {
    const player = session?.players?.get(uuid)
    if (!player) return false
    if (player.isParticipating === false) return false
    if (session.forfeitedUuids instanceof Set && session.forfeitedUuids.has(uuid)) return false
    return true
}

// 끊김 유예 걸 대상인지 (진행 중 단계, 산 사람, 기권 안 한 사람만)
function getDisconnectGraceTarget(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null

    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL'].includes(session.phase)) return null

    const player = session.players.get(uuid)
    if (!player || player.alive !== true) return null
    if (isForfeitedFromSession(gameId, uuid)) return null

    return { session }
}

// 나가기 처리할 판 찾기 (참여 중인 사람만)
function getActiveSessionForDeparture(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    if (!isParticipatingInSession(session, uuid)) return null
    return session
}

module.exports = {
    getActiveSessionRoutingInfo,
    isParticipantBlockedFromMatchmaking,
    getRoomCodeSessionState,
    isForfeitedFromSession,
    isParticipatingInSession,
    getDisconnectGraceTarget,
    getActiveSessionForDeparture,
}
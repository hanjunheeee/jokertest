// 진행 중 판 찾기 파일
// 누가 어느 판인지·유예 대상·접속 현황, socket 쪽·판 준비가 사용
// 기권·참여 중 확인은 queries/participation.js
const { gameSessions, playerSession } = require('../core/registry/state')
const { DISCONNECT_GRACE_PHASES } = require('./constants')
const { hasForfeited, isForfeitedFromSession, isParticipatingInSession } = require('./participation')

// 사람 → 지금 판 id·채널
function getActiveSessionRoutingInfo(uuid) {
    // 사람 → 판 id → 판, 어느 장부에서든 없으면 null
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    const session = gameSessions.get(gameId)
    if (!session) return null
    return { gameId: session.id, channelId: session.channelId }
}

// 게임 중이라 매칭 못 들어가는지 (기권한 사람은 풀어 줌)
function isParticipantBlockedFromMatchmaking(uuid) {
    // 판에 없거나 기권했으면 매칭 가능
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return false
    // 끝난 판에 남은 건 막지 않음, 진행 중 판만 막음
    const session = gameSessions.get(routing.gameId)
    if (!session) return false
    return session.phase !== 'ENDED'
}

// 방 코드로 판 상태 찾기 ("이미 시작" 구분용)
function getRoomCodeSessionState({ roomCode, roomId } = {}) {
    // 코드 없으면 찾을 것 없음, 방 id는 있을 때만 같이 맞춤
    const normalizedCode = typeof roomCode === 'string' ? roomCode.trim() : ''
    if (!normalizedCode) return null
    const expectedRoomId = typeof roomId === 'string' && roomId ? roomId : null

    // 모든 판 돌면서 코드(+방 id) 맞는 첫 판
    for (const session of gameSessions.values()) {
        if (session?.roomCode !== normalizedCode) continue
        if (expectedRoomId !== null && session.roomId !== expectedRoomId) continue
        return { gameId: session.id, roomId: session.roomId ?? null, phase: session.phase }
    }
    return null
}

// 사람 → 지금 판, 부른 쪽이 생각한 판이 아니면 null
// 끊김 유예·나가기가 같이 쓰는 앞부분
function findExpectedSession(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) return null
    if (expectedGameId !== undefined && gameId !== expectedGameId) return null
    return gameSessions.get(gameId) ?? null
}

// 끊김 유예 걸 대상인지 (진행 중 단계, 산 사람, 기권 안 한 사람만)
function getDisconnectGraceTarget(uuid, expectedGameId) {
    // 판에 있는지, 부른 쪽이 생각한 판이 맞는지
    const session = findExpectedSession(uuid, expectedGameId)
    if (!session) return null

    // 끝난 판은 유예 걸 일 없음
    if (!DISCONNECT_GRACE_PHASES.includes(session.phase)) return null

    // 이미 죽었거나 기권한 사람은 더 죽일 게 없음
    const player = session.players.get(uuid)
    if (!player || player.alive !== true) return null
    if (hasForfeited(session, uuid)) return null

    return { session }
}

// 나가기 처리할 판 찾기 (참여 중인 사람만)
function getActiveSessionForDeparture(uuid, expectedGameId) {
    // 옛 판 id로 온 나가기가 새 판을 건드리지 않게 (지도 12-⑤)
    const session = findExpectedSession(uuid, expectedGameId)
    if (!session) return null
    // 이미 빠진 사람이면 나가기 처리 안 탐
    if (!isParticipatingInSession(session, uuid)) return null
    return session
}

// 지금 열린 판 수 + 판에 있는 사람 전부 (끝났지만 아직 남은 판 포함)
// gameSession.js에 있던 것, 장부 읽기라 queries로 옮김
function getActiveGamePresenceSnapshot() {
    // 같은 사람 두 번 안 세게 Set에 모음
    const participantUuids = new Set()
    for (const session of gameSessions.values()) {
        for (const uuid of session.players.keys()) participantUuids.add(uuid)
    }
    return { room_count: gameSessions.size, participantUuids }
}

module.exports = {
    getActiveSessionRoutingInfo,
    isParticipantBlockedFromMatchmaking,
    getRoomCodeSessionState,
    findExpectedSession,
    getDisconnectGraceTarget,
    getActiveSessionForDeparture,
    getActiveGamePresenceSnapshot,
}

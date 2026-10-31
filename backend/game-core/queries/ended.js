// 끝난 판 파티 찾기 파일
// 끝난 판 남은 사람·다음 방 우편함 자격, 매칭 쪽이 사용
const { gameSessions } = require('../core/state')
const { getActiveSessionRoutingInfo, isForfeitedFromSession } = require('./live')

// 끝난 판 방장이 다음 방 알릴 사람 목록 (방장·기권한 사람 빼고)
function getEndedSessionPartyBroadcastContext(hostUuid) {
    const routing = getActiveSessionRoutingInfo(hostUuid)
    if (!routing) return null
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    if (session.hostUuid !== hostUuid) return null
    const participantUuids = []
    for (const uuid of session.players.keys()) {
        if (uuid === hostUuid) continue
        if (isForfeitedFromSession(session.id, uuid)) continue
        participantUuids.push(uuid)
    }
    return { gameId: session.id, channelId: session.channelId, participantUuids }
}

// 끝난 판에 아직 남아 있는 사람의 판 id
function getEndedSessionGameIdForParticipant(uuid) {
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return null
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    return session.id
}

// 다음 방 우편함 볼 자격 있는지 (끝난 판 참가자, 기권 안 한 사람)
function canLookupPartyMatchingRoom(uuid, gameId) {
    if (typeof gameId !== 'string' || gameId.length === 0) return false
    if (isForfeitedFromSession(gameId, uuid)) return false
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return false
    return session.players.has(uuid)
}

// 끝난 판 남은 사람 목록 (기권한 사람 빼고)
function getEndedSessionParticipantUuids(gameId, { excludeUuid = null } = {}) {
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return []
    const uuids = []
    for (const uuid of session.players.keys()) {
        if (uuid === excludeUuid) continue
        if (isForfeitedFromSession(gameId, uuid)) continue
        uuids.push(uuid)
    }
    return uuids
}

module.exports = {
    getEndedSessionPartyBroadcastContext,
    getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom,
    getEndedSessionParticipantUuids,
}
// 끝난 판 파티 찾기 파일
// 끝난 판 남은 사람·다음 방 우편함 자격, 매칭 쪽이 사용
const { gameSessions } = require('../core/registry/state')
const { normalizeGameId } = require('../core/registry/lookup')
const { getActiveSessionRoutingInfo } = require('./live')
const { isForfeitedFromSession } = require('./participation')

// 끝난 판 방장이 다음 방 알릴 사람 목록 (방장·기권한 사람 빼고)
function getEndedSessionPartyBroadcastContext(hostUuid) {
    // 방장이 끝난 판에 있고 그 판 방장이 맞을 때만
    const routing = getActiveSessionRoutingInfo(hostUuid)
    if (!routing) return null
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    if (session.hostUuid !== hostUuid) return null
    // 받을 사람 모으기 (방장 본인·기권한 사람 건너뜀)
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
    // 판에 없거나 기권했으면 없음
    const routing = getActiveSessionRoutingInfo(uuid)
    if (!routing || isForfeitedFromSession(routing.gameId, uuid)) return null
    // 끝난 판일 때만 (진행 중 판은 아님)
    const session = gameSessions.get(routing.gameId)
    if (!session || session.phase !== 'ENDED') return null
    return session.id
}

// 다음 방 우편함 볼 자격 있는지 (끝난 판 참가자, 기권 안 한 사람)
function canLookupPartyMatchingRoom(uuid, gameId) {
    // 판 id 모양 확인, 기권한 사람은 거절
    if (!normalizeGameId(gameId, { trim: false })) return false
    if (isForfeitedFromSession(gameId, uuid)) return false
    // 끝난 판이고 그 판 참가자였는지
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return false
    return session.players.has(uuid)
}

// 끝난 판 남은 사람 목록 (기권한 사람 빼고)
function getEndedSessionParticipantUuids(gameId, { excludeUuid = null } = {}) {
    // 끝난 판 아니면 빈 목록
    const session = gameSessions.get(gameId)
    if (!session || session.phase !== 'ENDED') return []
    // 뺄 사람(excludeUuid)·기권한 사람 건너뛰고 모음
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
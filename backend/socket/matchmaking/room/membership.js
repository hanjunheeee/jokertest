// 방 자리·소켓 확인 파일
// 방에 진짜 앉아 있는지·이 소켓이 주인인지 확인 + 소켓 찾기·채널 떼기
const channelMembership = require('../../channelMembership')
const gameSession = require('../../../game-core/gameSession')
const { deps } = require('../core/deps')
const { playerRoom, gameRooms } = require('../core/state')

// 이 방 자리를 다른 소켓이 갖고 있는지 (새 탭 교체 확인)
function isOwnedByOtherSocket(io, roomId, uuid, socket) {
    const sockets = io?.sockets?.sockets
    if (!sockets || typeof sockets.values !== 'function') return false
    for (const other of sockets.values()) {
        if (!other || other === socket || other.id === socket.id) continue
        if (other.connected === false) continue
        if (other.data?.user?.uuid !== uuid) continue
        if (other.rooms?.has?.(roomId) || other.data?.activeRoomId === roomId) return true
    }
    return false
}

// 이 소켓이 계정의 진짜 소켓인지 (옛 소켓 거르기)
function isCanonicalSocket(io, uuid, socket, roomId) {
    if (!socket) return false
    const canonicalId = deps.onlineUsersRegistry?.get?.(uuid)
    if (typeof canonicalId === 'string') return canonicalId === socket.id
    return !isOwnedByOtherSocket(io, roomId, uuid, socket)
}

// 접속 목록 있을 때만 진짜 소켓인지 봄, 없으면 통과
function isCanonicalOrUnknown(io, uuid, socket, roomId) {
    if (!(deps.onlineUsersRegistry instanceof Map)) return true
    return isCanonicalSocket(io, uuid, socket, roomId)
}

// 계정이 이 방 명단에 있는지
function isSeatedInRoom(uuid, roomId) {
    if (playerRoom.get(uuid) !== roomId) return false
    return gameRooms.get(roomId)?.players.has(uuid) === true
}

// 명단에 있고 그 방 소속인지
function hasRoomMembership(uuid) {
    const roomId = playerRoom.get(uuid)
    return typeof roomId === 'string' ? isSeatedInRoom(uuid, roomId) : false
}

// 진행 중 게임 채널에 들어가 있는지
function hasLiveGameMembership(uuid) {
    return gameSession.isParticipantBlockedFromMatchmaking(uuid)
}

// 소켓을 방 채널에서 뗌
function detachSocketFromChannel(socket, channelId, logLabel, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, { channelId }, ownership)
}

// 채널 떼다 터져도 무시 (끊긴 소켓 대비)
async function leaveSocketRoomSafely(socket, roomId, logLabel) {
    try {
        await socket.leave(roomId)
    } catch (cleanupError) {
        console.error(logLabel, cleanupError)
    }
}

// 계정의 지금 연결된 소켓 하나 찾기
function findLiveSocket(io, uuid) {
    for (const candidate of io?.sockets?.sockets?.values?.() ?? []) {
        if (candidate?.data?.user?.uuid !== uuid) continue
        if (candidate.connected === false) continue
        return candidate
    }
    return null
}

// 계정의 연결된 소켓 전부 찾기
function findAllLiveSockets(io, uuid) {
    const found = []
    for (const candidate of io?.sockets?.sockets?.values?.() ?? []) {
        if (candidate?.data?.user?.uuid !== uuid) continue
        if (candidate.connected === false) continue
        found.push(candidate)
    }
    return found
}

// 방 사람들 중 진짜 앉아 있는 사람 소켓만 모으기
function resolveParticipantSockets(io, uuids, roomId) {
    const targets = new Set(uuids)
    const map = new Map()
    for (const s of io.sockets.sockets.values()) {
        const u = s.data?.user?.uuid
        if (!u || !targets.has(u)) continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(roomId)) continue
        if (!isSeatedInRoom(u, roomId)) continue
        if (typeof s.id === 'string'
            && channelMembership.isSocketExcludedFromChannel(roomId, s.id)) continue
        if (deps.onlineUsersRegistry instanceof Map
            && !isCanonicalSocket(io, u, s, roomId)) continue
        if (!map.has(u)) map.set(u, [])
        map.get(u).push(s)
    }
    return map
}

module.exports = {
    isOwnedByOtherSocket,
    isCanonicalSocket,
    isCanonicalOrUnknown,
    isSeatedInRoom,
    hasRoomMembership,
    hasLiveGameMembership,
    detachSocketFromChannel,
    leaveSocketRoomSafely,
    findLiveSocket,
    findAllLiveSockets,
    resolveParticipantSockets,
}

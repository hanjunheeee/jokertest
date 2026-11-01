// 방 자리·소켓 확인 파일
// 방에 진짜 앉아 있는지·이 소켓이 주인인지 확인 + 소켓 찾기·채널 떼기, matchmaking 안 파일 대부분이 사용
// 판 쪽은 matchmaking.js 거쳐 hasRoomMembership만 씀
const channelMembership = require('../../channelMembership')
const gameSession = require('../../../game-core/gameSession')
const { deps } = require('../core/deps')
const { playerRoom, gameRooms } = require('../core/state')

// 이 방 자리를 다른 소켓이 갖고 있는지 (새 탭 교체 확인)
function isOwnedByOtherSocket(io, roomId, uuid, socket) {
    // 소켓 목록 못 읽으면 다른 주인 없다고 봄
    const sockets = io?.sockets?.sockets
    if (!sockets || typeof sockets.values !== 'function') return false
    // 같은 계정의 연결된 다른 소켓이 이 방 채널에 있거나 이 방을 지금 방으로 들고 있으면 그쪽이 주인
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
    // 접속 목록에 적힌 소켓 id가 기준, 목록에 없으면 이 방을 다른 소켓이 안 들고 있을 때만 진짜
    const canonicalId = deps.onlineUsersRegistry?.get?.(uuid)
    if (typeof canonicalId === 'string') return canonicalId === socket.id
    return !isOwnedByOtherSocket(io, roomId, uuid, socket)
}

// 접속 목록 있을 때만 진짜 소켓인지 봄, 없으면 통과 (목록 안 넣은 시험)
function isCanonicalOrUnknown(io, uuid, socket, roomId) {
    if (!(deps.onlineUsersRegistry instanceof Map)) return true
    return isCanonicalSocket(io, uuid, socket, roomId)
}

// 소속 장부·방 명단 둘 다 이 방이어야 앉은 것 (한쪽만 남은 흔적은 안 셈)
function isSeatedInRoom(uuid, roomId) {
    if (playerRoom.get(uuid) !== roomId) return false
    return gameRooms.get(roomId)?.players.has(uuid) === true
}

// 명단에 있고 그 방 소속인지
function hasRoomMembership(uuid) {
    const roomId = playerRoom.get(uuid)
    return typeof roomId === 'string' ? isSeatedInRoom(uuid, roomId) : false
}

// 진행 중 판에 아직 참가 중인지 (기권했거나 끝난 판이면 아님)
function hasLiveGameMembership(uuid) {
    return gameSession.isMatchmakingBlocked(uuid)
}

// 소켓을 방 채널에서 뗌
function detachSocketFromChannel(socket, channelId, logLabel, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, { channelId }, ownership)
}

// 채널 떼다 터져도 로그만 남기고 계속 (끊긴 소켓 대비)
async function leaveSocketRoomSafely(socket, roomId, logLabel) {
    try {
        await socket.leave(roomId)
    } catch (cleanupError) {
        console.error(logLabel, cleanupError)
    }
}

// 계정의 연결된 소켓 하나 찾기 (처음 나온 것, 진짜 소켓인지는 안 봄)
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
    // 연결됨·이 방 채널 안·명단에 앉음·전달 제외 아님·진짜 소켓인 것만 (옛 탭·떼는 중 소켓 빼기)
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

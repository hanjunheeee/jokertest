// 다른 Node 방 찾기 파일, 내 Node에 없는 방·코드·초대 방·끝난 판이 어느 Node에 있는지 디렉터리로 보고 거절 답을 만듦
// join/join·join/publicRooms·join/create·admission/accept·join/party가 부름, 단일 모드(REDIS_URL 없음)면 늘 null (지금과 같음)
const cluster = require('../../../cluster')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { ROUTABLE_NODE_ID } = require('../../connection/nodeRouting')
const { gameRooms } = require('../core/state')
const { describeVanishedRoom, emitRoomJoinFailed } = require('../join/guards')

const { ROOM_ON_OTHER_NODE, NODE_UNAVAILABLE, CLUSTER_UNAVAILABLE } = ROOM_JOIN_ERROR_CODES

// 거절 문구 (화면은 code로 나누고, 없으면 이 문구)
const MESSAGES = Object.freeze({
    [ROOM_ON_OTHER_NODE]: '방이 있는 서버로 옮겨 다시 시도합니다.',
    [NODE_UNAVAILABLE]: '방을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.',
    [CLUSTER_UNAVAILABLE]: '지금은 방 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
})

const keys = () => cluster.directory.keys()
const isRoutable = (node) => typeof node === 'string' && ROUTABLE_NODE_ID.test(node)

// 거절 모양 { code, message, node? }, node는 화면이 따라갈 수 있는 모양일 때만 (조각 5 약속)
function nodeFailure(code, node = null) {
    const failure = { code, message: MESSAGES[code] }
    if (isRoutable(node)) failure.node = node
    return failure
}

// 다른 Node 방: 따라갈 수 있는 이름이면 그리로, 아니면 못 찾음
const onOtherNode = (node) => (isRoutable(node) ? nodeFailure(ROOM_ON_OTHER_NODE, node) : nodeFailure(NODE_UNAVAILABLE))

// 방 id로 주인 찾기 → { state:'unavailable'|'missing'|'self'|'dead'|'remote', node, value }
async function locateRoom(roomId) {
    const found = await cluster.directory.locate(keys().room(roomId))
    if (!found.available) return { state: 'unavailable' }
    if (!found.node) return { state: 'missing' }
    if (found.self) return { state: 'self', node: found.node, value: found.value }
    return { state: found.alive ? 'remote' : 'dead', node: found.node, value: found.value }
}

// 죽은 Node 방 흔적 지우기 (값이 그대로일 때만, MN-110)
async function forgetDeadRoom(roomId, value) {
    await cluster.directory.removeIfValue(keys().room(roomId), value)
    if (typeof value?.code === 'string') await cluster.directory.removeIfValue(keys().roomcode(value.code), roomId)
}

// 다른 Node에서 시작된 방 코드 → 거절 또는 null (판이 살아 있으면 "이미 시작", 없으면 "이미 끝남", MN-015)
async function describeRemoteStarted(roomCode) {
    const { value } = await cluster.directory.read(keys().startedcode(roomCode))
    if (!value || typeof value !== 'object' || value.node === cluster.serverId()) return null
    const game = typeof value.gameId === 'string' ? await cluster.directory.locate(keys().game(value.gameId)) : null
    if (game?.alive) return { code: ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, message: '이미 게임이 시작된 방입니다.' }
    return { code: ROOM_JOIN_ERROR_CODES.SESSION_ENDED, message: '이미 끝난 게임의 방입니다.' }
}

// 코드·공개 방 입장: 내 Node에 없는 방 → 거절, 또는 null (내 Node 답 그대로: 방 없음·코드 틀림, MN-014)
// - typed: 사람이 친 코드만 보냄 → 죽은 Node 방이면 흔적 지우고 "방 없음"(MN-110)
// - 목록에서 고른 방(roomId 있음)의 주인이 죽었으면 NODE_UNAVAILABLE (MN-023)
// - Redis 못 쓰면 CLUSTER_UNAVAILABLE (MN-096)
async function findRemoteRoom({ roomCode = null, roomId = null }) {
    if (!cluster.isEnabled()) return null
    if (!cluster.isShared()) return nodeFailure(CLUSTER_UNAVAILABLE)
    const typed = !roomId
    const id = roomId ?? (roomCode ? (await cluster.directory.read(keys().roomcode(roomCode))).value : null)
    if (typeof id === 'string' && id) {
        const where = await locateRoom(id)
        if (where.state === 'unavailable') return nodeFailure(CLUSTER_UNAVAILABLE)
        if (where.state === 'remote') return onOtherNode(where.node)
        if (where.state === 'dead') {
            await forgetDeadRoom(id, where.value)
            if (!typed) return nodeFailure(NODE_UNAVAILABLE)
        }
        // 방 키 없이 코드만 남은 흔적 지우기
        if (where.state === 'missing' && typed) await cluster.directory.removeIfValue(keys().roomcode(roomCode), id)
    }
    return roomCode ? describeRemoteStarted(roomCode) : null
}

// 내 Node가 답할 수 있는지: 방이 있거나, 시작·끝난 이유를 앎 (아니면 Node 여러 개일 때 다른 Node를 봄)
function hasLocalAnswer(normalizedCode, expectedRoom) {
    if (expectedRoom?.accessType === 'code') {
        return gameRooms.has(expectedRoom.roomId)
            || describeVanishedRoom({ roomCode: normalizedCode, roomId: expectedRoom.roomId }) !== null
    }
    if ([...gameRooms.values()].some((room) => room.code === normalizedCode)) return true
    return describeVanishedRoom({ roomCode: normalizedCode }) !== null
}

// Node 여러 개: 다른 Node 방이면 그리로 옮기라고 알림 (code·node, 조각 5 약속) → 알렸으면 true
async function rejectIfRoomOnOtherNode(socket, normalizedCode, expectedRoom) {
    if (hasLocalAnswer(normalizedCode, expectedRoom)) return false
    const remote = await findRemoteRoom({ roomCode: normalizedCode, roomId: expectedRoom?.roomId ?? null })
    if (!remote) return false
    const { code, message, ...details } = remote
    emitRoomJoinFailed(socket, code, message, details)
    return true
}

// 초대 수락: 초대한 방이 다른 Node면 그 Node로 (DB는 안 건드림) → 거절 또는 null (내 Node가 답함)
// localEpoch = 이 Node 부팅 값, 초대 행 bootEpoch가 같으면 내 방이었음
async function findInviteRoomOwner(peek, localEpoch) {
    if (!cluster.isEnabled()) return null
    const mine = peek?.bootEpoch === localEpoch
    if (!cluster.isShared()) return mine ? null : nodeFailure(CLUSTER_UNAVAILABLE)
    const where = await locateRoom(peek.roomId)
    if (where.state === 'unavailable') return mine ? null : nodeFailure(CLUSTER_UNAVAILABLE)
    // 그 방(같은 부팅·같은 인스턴스)이 살아 있는 다른 Node에 있음
    if (where.state === 'remote' && where.value?.bootEpoch === peek.bootEpoch && where.value?.instanceId === peek.roomInstanceId) {
        return onOtherNode(where.node)
    }
    // 방 주인 Node가 죽음 (MN-111)
    if (where.state === 'dead' && where.value?.bootEpoch === peek.bootEpoch) {
        await forgetDeadRoom(peek.roomId, where.value)
        return nodeFailure(NODE_UNAVAILABLE)
    }
    return null
}

// 다음 방 묻기: 끝난 판이 살아 있는 다른 Node에 있으면 그리로 → 거절 또는 null (MN-011)
async function findPartyGameOwner(gameId) {
    if (!cluster.isShared() || typeof gameId !== 'string' || !gameId) return null
    const found = await cluster.directory.locate(keys().game(gameId))
    if (!found.available || !found.node || found.self || !found.alive) return null
    return onOtherNode(found.node)
}

// Node 여러 개인지 (아니면 부르는 쪽이 기다림 없이 예전 그대로 감)
const isRoomRoutingEnabled = () => cluster.isEnabled()

module.exports = {
    isRoomRoutingEnabled,
    nodeFailure,
    findRemoteRoom,
    rejectIfRoomOnOtherNode,
    findInviteRoomOwner,
    findPartyGameOwner,
    ROOM_NODE_MESSAGES: MESSAGES,
}

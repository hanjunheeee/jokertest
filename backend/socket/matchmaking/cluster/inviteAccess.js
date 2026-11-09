// 초대 방 접근자 파일, 초대 서비스가 보내는 사람 방·받는 사람 상태를 읽는 길 (이 Node 장부 먼저, 다른 Node는 RPC)
// socket/matchmaking.js가 만들어 초대 서비스에 넣음, RPC room.describeForInvite·user.roomIdOf·user.availability 처리기도 여기서 등록
const cluster = require('../../../cluster')
const { createError } = require('../../../utils/appError')

// RPC로 받는 id 모양 (uuid·방 id, 길이만 봄)
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 64

// 다른 Node에 묻기: 그 Node가 없어졌으면 null(방·사람 없음으로 봄), 시간 초과·Redis 못 씀이면 503 (확인 못 하면 거절)
async function ask(node, method, args) {
    try {
        return await cluster.rpc.call(node, method, args)
    } catch (error) {
        if (error?.code === cluster.CODES.NODE_UNAVAILABLE) return null
        throw createError('방 위치를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 503, cluster.CODES.CLUSTER_UNAVAILABLE)
    }
}

// 키의 주인 Node (나·없음·죽음·Redis 못 씀이면 null)
async function remoteOwner(key) {
    const found = await cluster.directory.locate(key)
    if (!found.available || !found.node || found.self || !found.alive) return null
    return found.node
}

// 보내는 사람이 다른 Node 방에 있으면 그 방 id (loc:<uuid> 주인 Node에 확인)
async function remoteRoomIdOf(uuid) {
    if (!cluster.isShared()) return null
    const node = await remoteOwner(cluster.directory.keys().loc(uuid))
    if (!node) return null
    const reply = await ask(node, 'user.roomIdOf', { uuid })
    return isId(reply?.roomId) ? reply.roomId : null
}

// 다른 Node 방 정보 (방 Node의 bootEpoch 포함 → 초대 행에 그 값을 씀, 위험 #18)
async function remoteDescribe(roomId) {
    if (!cluster.isShared()) return null
    const node = await remoteOwner(cluster.directory.keys().room(roomId))
    if (!node) return null
    const reply = await ask(node, 'room.describeForInvite', { roomId })
    const room = reply?.found === true ? reply.room : null
    if (!room || room.roomId !== roomId || !isId(room.roomInstanceId) || typeof room.bootEpoch !== 'string') return null
    return { ...room, node }
}

// 받는 사람 상태를 그 사람 방·판 Node와 접속 Node에 물음 (둘 중 하나라도 못 받으면 못 받음)
async function remoteAvailability(uuid) {
    const keys = cluster.directory.keys()
    const nodes = new Set()
    for (const key of [keys.loc(uuid), keys.conn(uuid)]) {
        const node = await remoteOwner(key)
        if (node) nodes.add(node)
    }
    for (const node of nodes) {
        const reply = await ask(node, 'user.availability', { uuid })
        if (reply && reply.available === false) {
            return { available: false, code: typeof reply.code === 'string' ? reply.code : 'RECEIVER_TRANSITIONING' }
        }
    }
    return { available: true, code: null }
}

// 다른 Node가 묻는 것 등록 (이 Node 장부로 답함)
function registerHandlers(local) {
    cluster.rpc.register('room.describeForInvite', (args) => {
        const room = isId(args?.roomId) ? local.describeRoomForInvite(args.roomId) : null
        return room ? { found: true, room: { ...room, bootEpoch: local.bootEpoch } } : { found: false }
    })
    cluster.rpc.register('user.roomIdOf', (args) => ({ roomId: isId(args?.uuid) ? local.getRoomIdForUser(args.uuid) ?? null : null }))
    cluster.rpc.register('user.availability', (args) => (isId(args?.uuid)
        ? local.describeReceiverAvailability(args.uuid)
        : { available: false, code: 'INVALID_REQUEST' }))
}

// 접근자 만들기: local = 이 Node 장부만 보는 함수 묶음 (동기)
// 단일 모드(REDIS_URL 없음)는 local 그대로 (값도 동기), Node 여러 개면 내 Node에 없을 때만 Promise로 다른 Node를 봄
function createInviteAccess(local) {
    registerHandlers(local)
    return {
        bootEpoch: local.bootEpoch,
        getRoomIdForUser(uuid) {
            const mine = local.getRoomIdForUser(uuid)
            if (mine || !cluster.isEnabled()) return mine
            return remoteRoomIdOf(uuid)
        },
        // 방 정보에 방 Node bootEpoch를 같이 실음 (내 방이면 내 값)
        describeRoomForInvite(roomId) {
            const mine = local.describeRoomForInvite(roomId)
            if (mine || !cluster.isEnabled()) return mine && { ...mine, bootEpoch: local.bootEpoch }
            return remoteDescribe(roomId)
        },
        describeReceiverAvailability(uuid) {
            const mine = local.describeReceiverAvailability(uuid)
            if (!mine.available || !cluster.isShared()) return mine
            return remoteAvailability(uuid)
        },
    }
}

module.exports = { createInviteAccess }

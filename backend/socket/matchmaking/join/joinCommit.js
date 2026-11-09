// 코드 입장 채널·확정 파일
// 확정 전 방송 제외·실패 때 채널 떼기 + 명단 추가 확정·알림, join/join.js가 부름
const kickReceiptStore = require('../../kickReceiptStore')
const channelMembership = require('../../channelMembership')
const { playerRoom } = require('../core/state')
const { detachSocketFromChannel, isSeatedInRoom, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership } = require('../room/membership')
const { buildRoomPayload, computeCanStart, emitPublicRoomList } = require('../room/view')
const { markPartyOriginObject } = require('./partyOrigin')

// 이 입장 하나의 채널 다루기 묶음: 방송 제외 걸기·풀기, 채널 떼기
function createJoinChannelGuard(io, socket, uuid) {
    const owner = channelMembership.createChannelExclusionOwner('join-by-code')
    let exclusionChannelId = null
    let exclusionSocketId = null
    return {
        // 채널 넣기 전에 방송 제외 걸기, 확정 전엔 방 방송 못 받게 (지도 01-⑥)
        exclude(roomId) {
            exclusionChannelId = roomId
            exclusionSocketId = socket.id
            channelMembership.excludeSocketFromChannel(roomId, socket.id, owner)
        },
        // 방송 제외 풀기, 건 적 있을 때 한 번만
        release() {
            if (exclusionChannelId === null || exclusionSocketId === null) return
            channelMembership.releaseChannelExclusion(exclusionChannelId, exclusionSocketId, owner)
            exclusionChannelId = null
            exclusionSocketId = null
        },
        // 채널 떼기, 그사이 정식으로 앉았거나 다른 소속 남았으면 떼기 쪽이 알아서 맞춤 (지도 01-⑦)
        detach(channelId) {
            detachSocketFromChannel(socket, channelId, '[코드 참가 정리 실패]', {
                ownsChannel: () =>
                    isSeatedInRoom(uuid, channelId)
                    && isCanonicalSocket(io, uuid, socket, channelId),
                keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
            })
        },
    }
}

// 명단 추가 = 입장 확정, 그 뒤 방송 제외 풀고 알림
function commitJoinedPlayer(io, socket, uuid, room, { user, accountProfile }, { autoJoin, channel, progress }) {
    const player = {
        uuid,
        nickname: user.nickname,
        isReady: false,
        membershipId: kickReceiptStore.nextMembershipId(),
        ...accountProfile,
    }
    room.players.set(uuid, player)
    playerRoom.set(uuid, room.id)
    progress.committed = true
    if (!autoJoin) markPartyOriginObject(uuid, player)
    socket.data.activeRoomId = room.id

    // 확정 뒤에야 방송 제외 풂 (지도 01-⑥)
    channel.release()

    // 나한테 방 정보, 방 사람들한테 (나 빼고) 새 사람, 목록 갱신
    // 확정 뒤라 알림마다 따로 잡음 (하나 던져도 나머지 보내고, 화면엔 실패 대신 입장이 감)
    try {
        socket.emit('room_joined', buildRoomPayload(room))
    } catch (emitErr) {
        console.error('[코드 참가 입장 알림 실패]', emitErr)
    }
    try {
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...player }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
    } catch (emitErr) {
        console.error('[코드 참가 방송 실패]', emitErr)
    }
    emitPublicRoomList(io)
}

module.exports = {
    createJoinChannelGuard,
    commitJoinedPlayer,
}

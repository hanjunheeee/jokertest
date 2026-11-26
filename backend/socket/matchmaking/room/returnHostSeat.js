// 복귀 대기방 예약 방장 자리·방송 도우미 파일
// returnRoom·join·admission 쪽이 방장 자리 남김·착석·되돌리기·알림에 같이 씀
const gameSession = require('../../../game-core/gameSession')
const channelMembership = require('../../channelMembership')
const { BOOT_EPOCH } = require('../core/constants')
const { getSettingsVersion } = require('../settings/receipts')
const { computeCanStart, emitPublicRoomList } = require('./view')

// 방장 자리를 남겨 두는 중인지 (원래 방장이 아직 안 들어왔고 180초 안)
function isHostReserved(room) {
    return typeof room?.returnHold?.reservedHostUuid === 'string'
}

// 정원에서 더 빼 둘 자리 수: 방장 자리를 남겨 두는 중이면 원래 방장 말고는 1칸 덜 들어옴 (결정 [임시] 3)
// 예: 정원 7·5명 앉음·방장 자리 남김 → 다른 사람은 5 + 1 >= 7 아니라 들어옴, 6명 앉으면 막힘
function reservedSeatsFor(room, uuid) {
    return isHostReserved(room) && room.returnHold.reservedHostUuid !== uuid ? 1 : 0
}

// 방장이 빠진 뒤 다음 방장: 방장 자리를 남겨 두는 중이면 비워 둠(null), 아니면 먼저 들어온 사람, 아무도 없으면 null
function nextHostAfterLeave(room) {
    if (isHostReserved(room)) return null
    return room.players.keys().next().value ?? null
}

// 방장 칸 채우기: 남겨 둔 원래 방장이 오면 예약 비우고 방장, 방장 칸 비고 남긴 자리도 없으면 처음 온 사람이 방장
function claimHostIfVacant(room, uuid) {
    if (room?.returnHold?.reservedHostUuid === uuid) {
        room.returnHold.reservedHostUuid = null
        room.hostUuid = uuid
        return true
    }
    if (room.hostUuid != null || isHostReserved(room)) return false
    room.hostUuid = uuid
    return true
}

// 초대 수락 되돌리기 때 원래 방장이 아직 그 끝난 판에 남아 있으면 예약 방장 되돌림
function restoreReservedHostIfEnded(room, uuid) {
    if (!room?.returnHold || room.returnHold.reservedHostUuid != null) return false
    if (gameSession.getEndedGameId(uuid) !== room.returnHold.gameId) return false
    room.returnHold.reservedHostUuid = uuid
    if (room.hostUuid === uuid) room.hostUuid = null
    return true
}

// 방장 바뀜·남겨 둔 방장 자리 끝 알림 (방 사람들에게, 실패는 로그만)
function emitHostChanged(io, room) {
    const { id: roomId, hostUuid } = room
    const reservedHostUuid = room.returnHold?.reservedHostUuid ?? null
    try {
        channelMembership.emitToChannel(io, roomId, 'host_changed', {
            hostUuid, reservedHostUuid, canStart: computeCanStart(room), roomId,
            roomInstanceId: room.instanceId ?? null, bootEpoch: BOOT_EPOCH, settingsVersion: getSettingsVersion(room),
        })
    } catch (err) {
        console.error('[방장 변경 방송 실패]', err)
    }
}

// 남겨 둔 방장 자리 끝내기: 방장 칸이 비었으면 먼저 들어온 사람이 방장, 아무도 없으면 다음에 들어오는 사람이 방장
function endHostReservation(io, room) {
    if (!isHostReserved(room)) return false
    room.returnHold.reservedHostUuid = null
    if (room.players.size === 0) return true
    if (room.hostUuid == null) room.hostUuid = room.players.keys().next().value
    emitHostChanged(io, room)
    emitPublicRoomList(io)
    return true
}

module.exports = {
    isHostReserved,
    reservedSeatsFor,
    nextHostAfterLeave,
    claimHostIfVacant,
    restoreReservedHostIfEnded,
    emitHostChanged,
    endHostReservation,
}

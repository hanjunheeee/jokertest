// 점검 대기방 닫기 파일, 점검 시작 시각에 이 Node 대기방 전부 닫고 방 사람들을 로비로
// 점검 시계(services/ops/maintenanceClock.js)가 부름, 방장 방 지우기(host.js handleDeleteRoom)와 같은 정리 + room_deleted에 code·message만 더함
const channelMembership = require('../../channelMembership')
const { playerRoom, gameRooms } = require('../core/state')
const { cancelRoomRetention } = require('./leave')
const { disposeRoom } = require('./dispose')
const { emitPublicRoomList } = require('./view')

const MAINTENANCE_CODE = 'MAINTENANCE'
const DEFAULT_MESSAGE = '서버 점검으로 방이 닫혔어요.'

// 방 하나 닫기: 먼저 알리고 → 소속·방·입장 시도·초대 정리 → 남은 소켓 채널 떼기
function closeRoom(io, roomId, room, payload) {
    channelMembership.emitToChannel(io, roomId, 'room_deleted', payload)

    const memberUuids = [...room.players.keys()]
    for (const uuid of memberUuids) {
        // 다른 방으로 이미 옮긴 사람 기록은 안 지움
        if (playerRoom.get(uuid) === roomId) playerRoom.delete(uuid)
        cancelRoomRetention(uuid)
    }
    disposeRoom(roomId, MAINTENANCE_CODE)

    // 없어진 방 방송·끊김 처리가 남지 않게 채널·지금 방 표시 떼기 (하나 실패해도 계속)
    const memberSet = new Set(memberUuids)
    for (const s of io?.sockets?.sockets?.values?.() ?? []) {
        if (!memberSet.has(s?.data?.user?.uuid)) continue
        if (s.data.activeRoomId === roomId) delete s.data.activeRoomId
        if (!s.rooms?.has?.(roomId)) continue
        try {
            s.leave(roomId)
        } catch (err) {
            console.error('[점검 방 닫기 채널 정리 실패]', err?.name ?? 'Error')
        }
    }
}

// 이 Node 대기방 전부 닫음 → 닫은 방 수 (방 하나가 던져도 나머지는 계속)
function closeRoomsForMaintenance(io, message) {
    const payload = { code: MAINTENANCE_CODE, message: typeof message === 'string' && message ? message : DEFAULT_MESSAGE }
    let count = 0
    for (const [roomId, room] of [...gameRooms]) {
        try {
            closeRoom(io, roomId, room, payload)
            count += 1
        } catch (err) {
            console.error('[점검 방 닫기 실패]', { code: 'MAINTENANCE_CLOSE_ERROR', roomId, error: err?.name })
        }
    }
    if (count > 0) emitPublicRoomList(io)
    return count
}

module.exports = {
    closeRoomsForMaintenance,
}

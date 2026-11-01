// 준비 버튼 파일
// 대기방 준비·준비 취소 받기, 방 사람들한테 알림 (지도 02)
const channelMembership = require('../../channelMembership')
const { ROOM_SETTINGS_ERROR_CODES } = require('../../../utils/updateRoomSettingsValidation')
const { getAdmissionAttempt } = require('../admission/attempts')
const { playerRoom, gameRooms } = require('../core/state')
const { getSettingsVersion } = require('../settings/receipts')
const { computeCanStart } = require('./view')

// 준비·준비 취소 받기 (입장 중인 사람 있으면 막음, 시작 가능 여부 다시 계산)
function handleSetReady(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        callback({ ok: false, message: '잘못된 요청입니다.' })
        return
    }
    const { isReady, roomId: expectedRoomId, expectedSettingsVersion } = payload
    if (typeof isReady !== 'boolean') {
        callback({ ok: false, message: '잘못된 요청입니다.' })
        return
    }
    if (typeof expectedRoomId !== 'string' || expectedRoomId.length === 0) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    if (getAdmissionAttempt(uuid)) {
        callback({ ok: false, message: '입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const player = room?.players.get(uuid)
    if (!room || !player) {
        callback({ ok: false, message: '참여 중인 방이 없습니다.' })
        return
    }

    if (expectedRoomId !== roomId || expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT,
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }

    if (player.isReady === isReady) {
        callback({
            ok: true,
            isReady: player.isReady,
            canStart: computeCanStart(room),
            roomId,
            settingsVersion: getSettingsVersion(room),
            readyRevision: Number.isInteger(player.readyRevision) ? player.readyRevision : 0,
        })
        return
    }

    player.isReady = isReady
    player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    const canStart = computeCanStart(room)
    const sfxEvent = {
        eventId: `room:${roomId}:ready:${uuid}:${player.readyRevision}`,
        roomId,
        origin: 'live',
    }
    const readyEnvelope = {
        roomId,
        settingsVersion: getSettingsVersion(room),
        readyRevision: player.readyRevision,
    }
    channelMembership.emitToChannel(
        io, roomId, 'player_ready_changed',
        { uuid, isReady, canStart, sfxEvent, ...readyEnvelope },
        { senderSocket: socket },
    )
    callback({ ok: true, isReady, canStart, sfxEvent, ...readyEnvelope })
}

module.exports = {
    handleSetReady,
}

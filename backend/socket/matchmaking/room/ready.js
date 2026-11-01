// 준비 버튼 파일
// 대기방 준비·준비 취소 받기, 방 사람들한테 알림, matchmaking.js가 사건 받아 부름 (지도 02)
const channelMembership = require('../../channelMembership')
const { ROOM_SETTINGS_ERROR_CODES } = require('../../../validations/room/updateSettings')
const { getAdmissionAttempt } = require('../admission/attempts')
const { playerRoom, gameRooms } = require('../core/state')
const { getSettingsVersion } = require('../settings/receipts')
const { computeCanStart } = require('./view')

// 준비·준비 취소 받기 (내 입장 처리 중이면 막음, 시작 가능 여부 다시 계산)
function handleSetReady(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    // 요청 모양: 준비 값·방 id·내가 본 설정 버전
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

    // 내 초대 입장이 아직 확정 전이면 거절
    if (getAdmissionAttempt(uuid)) {
        callback({ ok: false, message: '입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    // 지금 방에 앉아 있어야 함
    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const player = room?.players.get(uuid)
    if (!room || !player) {
        callback({ ok: false, message: '참여 중인 방이 없습니다.' })
        return
    }

    // 다른 방·옛 설정 보고 누른 준비면 거절, 최신 버전 같이 줌 (설정 바뀌면 준비 풀림)
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

    // 이미 그 상태면 안 바꾸고 지금 값만 답 (두 번 눌러도 순번·알림 안 늘게)
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

    // 여기부터 진짜 바뀜: 준비 값 바꾸고 순번 올림 (화면이 늦게 온 옛 알림 거르는 기준)
    player.isReady = isReady
    player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    const canStart = computeCanStart(room)
    // 효과음 한 번만 울리게 사건 id (사람·준비 순번마다 하나)
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
    // 보낸 소켓은 빼고 방송, 본인은 ack로 같은 내용 받음
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

// 방 설정 저장 파일
// 방장 설정 저장 받기·방송 + 저장 결과 다시 묻기 (지도 11-②③)
const { getAdmissionAttempt, countRoomOccupancy } = require('../admission/attempts')
const { resolveParticipantSockets } = require('../room/membership')
const { getSettingsVersion, pruneSettingsUpdateResults, settingsUpdateResultKey, recordSettingsUpdateResult, SETTINGS_UPDATE_RESULT_TTL_MS } = require('./receipts')
const { buildRoomSettingsView, ROOM_SETTINGS_EVENTS, validateUpdateRoomSettingsPayload, fingerprintUpdateRequest, fingerprintUpdateSettings, ROOM_SETTINGS_ERROR_CODES, buildEditableSettingsView, settingsContainNonAllowlistedKeys, PRESERVED_ROOM_SETTING_KEYS, isRoomSettingsIdentifier } = require('../../../utils/updateRoomSettingsValidation')
const { computeCanStart, buildRoomPayload, emitPublicRoomList } = require('../room/view')
const { roomSettingsUpdateResults, playerRoom, gameRooms } = require('../core/state')
const { rejectIfInActiveGame } = require('../join/guards')

// 바뀐 설정을 방 사람들한테 방송
function emitRoomSettingsUpdated(io, room) {
    const confirmedUuids = [...room.players.keys()].filter((playerUuid) => !getAdmissionAttempt(playerUuid))
    let sockets
    try {
        sockets = resolveParticipantSockets(io, confirmedUuids, room.id)
    } catch (err) {
        console.error('[설정 변경 수신자 조회 실패]', err)
        return
    }

    const payload = {
        roomId: room.id,
        settingsVersion: getSettingsVersion(room),
        accessType: room.accessType ?? null,
        settings: buildRoomSettingsView(room.settings),
        hostUuid: room.hostUuid,
        players: [...room.players.values()],
        canStart: computeCanStart(room),
    }

    for (const uuid of confirmedUuids) {
        for (const s of sockets.get(uuid) ?? []) {
            try {
                s.emit(ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED, payload)
            } catch (err) {
                console.error('[설정 변경 전달 실패]', err)
            }
        }
    }
}

// 방장 설정 저장 받기 (버전 맞는지·인원 넘지 않는지 보고 저장)
function handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[설정 변경 ack 실패]', ackErr)
        }
    }
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    const validated = validateUpdateRoomSettingsPayload(payload)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const { roomId, requestId, expectedSettingsVersion, accessType, settings } = validated.value
    const fingerprint = fingerprintUpdateRequest(expectedSettingsVersion, accessType, settings)
    const settingsFingerprint = fingerprintUpdateSettings(accessType, settings)

    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    pruneSettingsUpdateResults()
    const resultKey = settingsUpdateResultKey(uuid, roomId, requestId)
    const recorded = roomSettingsUpdateResults.get(resultKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond({
            ok: true,
            replayed: true,
            changed: recorded.changed,
            roomId,
            requestId,
            settingsVersion: recorded.settingsVersion,
        })
        return
    }

    if (rejectIfInActiveGame(uuid, ({ message }) =>
        reject(ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME, message)
    )) return

    if (getAdmissionAttempt(uuid)) {
        reject(ROOM_SETTINGS_ERROR_CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) {
        reject(ROOM_SETTINGS_ERROR_CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (currentRoomId !== roomId) {
        reject(ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) {
        reject(ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    if (room.hostUuid !== uuid) {
        reject(ROOM_SETTINGS_ERROR_CODES.NOT_HOST, '방장만 설정을 변경할 수 있습니다.')
        return
    }

    const currentVersion = getSettingsVersion(room)
    if (expectedSettingsVersion !== currentVersion) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT,
            '설정이 이미 변경되었습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.',
            { room: buildRoomPayload(room) },
        )
        return
    }

    const occupancy = countRoomOccupancy(room)
    if (settings.maxPlayers < occupancy) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY,
            `현재 인원(${occupancy}명)보다 적은 정원으로는 변경할 수 없습니다.`,
            { occupancy, room: buildRoomPayload(room) },
        )
        return
    }

    const currentFingerprint = fingerprintUpdateSettings(
        room.accessType, buildEditableSettingsView(room.settings),
    )
    const changed = currentFingerprint !== settingsFingerprint

    if (!changed) {
        if (settingsContainNonAllowlistedKeys(room.settings)) {
            room.settings = buildRoomSettingsView(room.settings)
        }
        recordSettingsUpdateResult(resultKey, {
            roomId, fingerprint, changed: false, settingsVersion: currentVersion,
            expiresAt: Date.now() + SETTINGS_UPDATE_RESULT_TTL_MS,
        })
        respond({ ok: true, changed: false, roomId, requestId, settingsVersion: currentVersion })
        return
    }

    const nextSettings = { ...settings }
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (room.settings?.[key] !== undefined) nextSettings[key] = room.settings[key]
    }
    room.settings = nextSettings
    room.accessType = accessType

    for (const player of room.players.values()) {
        if (player.isReady !== true) continue
        player.isReady = false
        player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    }

    room.settingsVersion = currentVersion + 1
    recordSettingsUpdateResult(resultKey, {
        roomId,
        fingerprint,
        changed: true,
        settingsVersion: room.settingsVersion,
        expiresAt: Date.now() + SETTINGS_UPDATE_RESULT_TTL_MS,
    })

    emitRoomSettingsUpdated(io, room)
    emitPublicRoomList(io)

    respond({ ok: true, changed: true, roomId, requestId, settingsVersion: room.settingsVersion })
}

// 저장 결과 ack 잃었을 때 영수증으로 결과 다시 알려 주기
function handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[설정 변경 결과 조회 ack 실패]', ackErr)
        }
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    const { roomId, requestId } = payload
    if (!isRoomSettingsIdentifier(roomId) || !isRoomSettingsIdentifier(requestId)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    if (socket && (socket.data?.user?.uuid !== uuid || socket.connected === false)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }
    if (socket && typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }

    pruneSettingsUpdateResults()
    const recorded = roomSettingsUpdateResults.get(settingsUpdateResultKey(uuid, roomId, requestId))

    const currentRoomId = playerRoom.get(uuid)
    const currentRoom = currentRoomId ? gameRooms.get(currentRoomId) : null
    const isConfirmedMember = !getAdmissionAttempt(uuid)
        && currentRoomId === roomId
        && !!currentRoom
        && currentRoom.players.has(uuid)

    if (!recorded) {
        respond({
            ok: true,
            status: 'UNKNOWN',
            roomId,
            requestId,
            room: isConfirmedMember ? buildRoomPayload(currentRoom) : null,
        })
        return
    }

    respond({
        ok: true,
        status: recorded.changed ? 'APPLIED' : 'NO_CHANGE',
        changed: recorded.changed,
        settingsVersion: recorded.settingsVersion,
        roomId,
        requestId,
        room: isConfirmedMember ? buildRoomPayload(currentRoom) : null,
    })
}

module.exports = {
    emitRoomSettingsUpdated,
    handleUpdateRoomSettings,
    handleGetRoomSettingsUpdateResult,
}

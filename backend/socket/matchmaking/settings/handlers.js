// 방 설정 저장 파일
// 방장 설정 저장 받기·방송 + 저장 결과 다시 묻기, matchmaking.js가 사건 받아 부름 (지도 11-②③)
const { getAdmissionAttempt, countRoomOccupancy } = require('../admission/attempts')
const { resolveParticipantSockets } = require('../room/membership')
const { getSettingsVersion, pruneSettingsResults, settingsUpdateResultKey, recordSettingsResult, SETTINGS_RESULT_TTL_MS } = require('./receipts')
const { buildRoomSettingsView, ROOM_SETTINGS_EVENTS, validateUpdateRoomSettingsPayload, fingerprintRequest, fingerprintUpdateSettings, ROOM_SETTINGS_ERROR_CODES, buildEditableSettingsView, hasDisallowedKeys, PRESERVED_ROOM_SETTING_KEYS, isSettingsIdentifier } = require('../../../validations/room/updateSettings')
const { computeCanStart, buildRoomPayload, emitPublicRoomList } = require('../room/view')
const { roomSettingsUpdateResults, playerRoom, gameRooms } = require('../core/state')
const { rejectIfInGame } = require('../join/guards')

// 바뀐 설정을 방 사람들한테 보냄 (채널 방송 대신 확정된 사람 소켓에 하나씩)
function emitRoomSettingsUpdated(io, room) {
    // 초대 입장 확정 전인 사람은 뺌, 받을 소켓 못 찾으면 보내기 포기 (저장은 이미 끝남)
    const confirmedUuids = [...room.players.keys()].filter((playerUuid) => !getAdmissionAttempt(playerUuid))
    let sockets
    try {
        sockets = resolveParticipantSockets(io, confirmedUuids, room.id)
    } catch (err) {
        console.error('[설정 변경 수신자 조회 실패]', err)
        return
    }

    // 화면이 방을 통째로 다시 그리게 명단·방장·설정·시작 가능 다 실음 (준비도 풀린 상태로)
    const payload = {
        roomId: room.id,
        settingsVersion: getSettingsVersion(room),
        accessType: room.accessType ?? null,
        settings: buildRoomSettingsView(room.settings),
        hostUuid: room.hostUuid,
        players: [...room.players.values()],
        canStart: computeCanStart(room),
    }

    // 하나 실패해도 나머지는 보냄
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

// 방장 설정 저장 받기 (내가 본 버전 맞는지·정원이 지금 인원보다 작지 않은지 보고 저장)
function handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    // ack 보내다 터져도 처리기는 계속 (로그만)
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[설정 변경 ack 실패]', ackErr)
        }
    }
    // 거절 답 모양 하나로 (영수증 안 남김)
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    // 모양 먼저 (지문 만들려면 필요)
    // 지문 둘: 요청 전체(버전 포함)는 같은 요청인지, 설정 내용만은 실제로 바뀌는지 볼 때 씀
    const validated = validateUpdateRoomSettingsPayload(payload)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const { roomId, requestId, expectedSettingsVersion, accessType, settings } = validated.value
    const fingerprint = fingerprintRequest(expectedSettingsVersion, accessType, settings)
    const settingsFingerprint = fingerprintUpdateSettings(accessType, settings)

    // 끊긴 소켓·새 탭에 밀린 옛 소켓 요청은 거절
    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    // 같은 요청 id 다시 오면 저장된 결과 그대로 (내용 다르면 재사용 거절), 기한 지난 건 먼저 지움
    pruneSettingsResults()
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

    // 게임 중·내 입장 처리 중이면 거절
    if (rejectIfInGame(uuid, ({ message }) =>
        reject(ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME, message)
    )) return

    if (getAdmissionAttempt(uuid)) {
        reject(ROOM_SETTINGS_ERROR_CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    // 요청한 방이 지금 내 방이고 내가 방장인지
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

    // 옛 버전 보고 고친 설정이면 거절, 최신 방 정보 같이 줌 (남이 먼저 바꾼 걸 덮지 않게)
    const currentVersion = getSettingsVersion(room)
    if (expectedSettingsVersion !== currentVersion) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT,
            '설정이 이미 변경되었습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.',
            { room: buildRoomPayload(room) },
        )
        return
    }

    // 정원을 지금 인원(입장 중 자리 포함)보다 줄이면 거절
    const occupancy = countRoomOccupancy(room)
    if (settings.maxPlayers < occupancy) {
        reject(
            ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY,
            `현재 인원(${occupancy}명)보다 적은 정원으로는 변경할 수 없습니다.`,
            { occupancy, room: buildRoomPayload(room) },
        )
        return
    }

    // 지금 설정과 내용 비교
    const currentFingerprint = fingerprintUpdateSettings(
        room.accessType, buildEditableSettingsView(room.settings),
    )
    const changed = currentFingerprint !== settingsFingerprint

    // 내용 같으면 버전 안 올리고 '안 바뀜' 영수증만 (모르는 칸 섞였으면 그것만 걸러 냄, 방송 없음)
    if (!changed) {
        if (hasDisallowedKeys(room.settings)) {
            room.settings = buildRoomSettingsView(room.settings)
        }
        recordSettingsResult(resultKey, {
            roomId, fingerprint, changed: false, settingsVersion: currentVersion,
            expiresAt: Date.now() + SETTINGS_RESULT_TTL_MS,
        })
        respond({ ok: true, changed: false, roomId, requestId, settingsVersion: currentVersion })
        return
    }

    // 여기부터 진짜 바뀜: 새 설정 넣음, 요청으로 못 바꾸는 칸은 옛 값 유지
    const nextSettings = { ...settings }
    for (const key of PRESERVED_ROOM_SETTING_KEYS) {
        if (room.settings?.[key] !== undefined) nextSettings[key] = room.settings[key]
    }
    room.settings = nextSettings
    room.accessType = accessType

    // 전원 준비 풀고 준비 순번 올림 (옛 설정 보고 한 준비는 무효)
    for (const player of room.players.values()) {
        if (player.isReady !== true) continue
        player.isReady = false
        player.readyRevision = (Number.isInteger(player.readyRevision) ? player.readyRevision : 0) + 1
    }

    // 버전 올리고 영수증 남김, 그다음 방 사람들·공개 목록에 알림
    room.settingsVersion = currentVersion + 1
    recordSettingsResult(resultKey, {
        roomId,
        fingerprint,
        changed: true,
        settingsVersion: room.settingsVersion,
        expiresAt: Date.now() + SETTINGS_RESULT_TTL_MS,
    })

    emitRoomSettingsUpdated(io, room)
    emitPublicRoomList(io)

    respond({ ok: true, changed: true, roomId, requestId, settingsVersion: room.settingsVersion })
}

// 저장 결과 ack 잃었을 때 영수증으로 결과 다시 알려 주기
function handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    // ack 보내다 터져도 처리기는 계속 (로그만)
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[설정 변경 결과 조회 ack 실패]', ackErr)
        }
    }

    // 요청 모양: 방 id·요청 id
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    const { roomId, requestId } = payload
    if (!isSettingsIdentifier(roomId) || !isSettingsIdentifier(requestId)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    // 끊긴 소켓·옛 소켓이면 거절 (소켓 없이 부르면 건너뜀)
    if (socket && (socket.data?.user?.uuid !== uuid || socket.connected === false)) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }
    if (socket && typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        respond({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다.' })
        return
    }

    // 기한 지난 건 지우고 내 영수증 찾기 (열쇠에 내 uuid가 들어가 남의 결과는 못 봄)
    pruneSettingsResults()
    const recorded = roomSettingsUpdateResults.get(settingsUpdateResultKey(uuid, roomId, requestId))

    // 지금도 그 방에 확정으로 앉아 있을 때만 최신 방 정보 실어 줌
    const currentRoomId = playerRoom.get(uuid)
    const currentRoom = currentRoomId ? gameRooms.get(currentRoomId) : null
    const isConfirmedMember = !getAdmissionAttempt(uuid)
        && currentRoomId === roomId
        && !!currentRoom
        && currentRoom.players.has(uuid)

    // 영수증 없으면 결과 모름 (UNKNOWN), 있으면 적용됨·안 바뀜
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

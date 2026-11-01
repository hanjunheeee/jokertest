// 게임 시작 파일
// 방장 게임 시작 요청 + 시작 직전 프로필 잡기 (지도 02)
const gameSession = require('../../../game-core/gameSession')
const { playerRoom, gameRooms } = require('../core/state')
const { getSettingsVersion, forgetSettingsResults } = require('../settings/receipts')
const { deps } = require('../core/deps')
const { BOOT_EPOCH } = require('../core/constants')
const { ROOM_SETTINGS_ERROR_CODES } = require('../../../validations/room/updateSettings')
const { getMinPlayers } = require('../core/config')
const { resolveRoleComposition } = require('../../../game-core/roleComposition')
const { hasPendingAdmission, invalidateRoomAttempts } = require('../admission/attempts')
const { resolveParticipantSockets } = require('./membership')
const { cancelRoomInvitesAsync } = require('../admission/release')
const { rememberStartedRoom } = require('../join/startedMarks')
const { emitPublicRoomList } = require('./view')

// 기다리는 사이 방·방장·인원·준비가 그대로인지
function isStartStillValid(room, hostUuid, playersAtCapture, versionAtCapture) {
    if (room.hostUuid !== hostUuid) return false
    if (room.players.size !== playersAtCapture.size) return false
    for (const [u, player] of playersAtCapture) {
        if (room.players.get(u) !== player) return false
        if (playerRoom.get(u) !== room.id) return false
        if (player.membershipId !== room.players.get(u)?.membershipId) return false
        if (player.isReady !== true) return false
    }
    if (versionAtCapture !== undefined && versionAtCapture !== getSettingsVersion(room)) {
        return false
    }
    return true
}

// 시작 직전 참가자 프로필 읽기 (그사이 방 바뀌면 멈춤)
async function captureStartProfiles(room, hostUuid, playersAtCapture, versionAtCapture) {
    const uuids = [...playersAtCapture.keys()]
    const [loadouts, recordSummaries, emojiPaletteEntries] = await Promise.all([
        deps.economyService.getGameStartLoadouts(uuids),
        Promise.resolve()
            .then(() => deps.gameResultRepository.getAccountRecordSummaries(uuids))
            .then((summaries) => (summaries instanceof Map ? summaries : new Map()))
            .catch((error) => {
                console.error('[matchmaking] 계정 전적 조회 실패 — 전적 없이 게임을 시작합니다', error)
                return new Map()
            }),
        Promise.all(uuids.map((uuid) => Promise.resolve()
            .then(() => deps.economyService.getEmojiPalette(uuid))
            .then((palette) => [uuid, {
                slots: Array.isArray(palette?.slots) ? [...palette.slots] : [],
                owned: Array.isArray(palette?.owned) ? [...palette.owned] : [],
            }])
            .catch((error) => {
                console.error('[matchmaking] 이모지 팔레트 조회 실패 — 팔레트 없이 게임을 시작합니다', error)
                return [uuid, { slots: [], owned: [] }]
            }))),
    ])

    if (!isStartStillValid(room, hostUuid, playersAtCapture, versionAtCapture)) {
        return { ok: false, code: 'ROOM_STATE_CHANGED' }
    }

    const players = new Map(uuids.map((uuid) => {
        const loadout = loadouts[uuid] ?? {}
        const record = recordSummaries.get(uuid)
        const hasRecord = Number.isInteger(record?.totalGames) && Number.isInteger(record?.winRate)
        return [uuid, {
            ...room.players.get(uuid),
            accountProfilePhotoId: loadout.profilePhotoId ?? null,
            accountProfileBorderId: loadout.profileBorderId ?? null,
            accountCardFrameId: loadout.cardFrameId ?? null,
            ...(hasRecord
                ? { accountTotalGames: record.totalGames, accountWinRate: record.winRate }
                : {}),
            accountSkinsByJob: { ...(loadout.skinsByJob
                ?? { noble: null, clown: null, guard: null, doctor: null, witchHunter: null }) },
        }]
    }))
    const settings = {
        ...room.settings,
        ...(room.settings?.roleCounts ? { roleCounts: { ...room.settings.roleCounts } } : {}),
        ...(room.settings?.roleNightActionTimes
            ? { roleNightActionTimes: { ...room.settings.roleNightActionTimes } }
            : {}),
    }
    return {
        ok: true,
        room: { ...room, players, settings, bootEpoch: BOOT_EPOCH },
        emojiPaletteByUuid: new Map(emojiPaletteEntries),
    }
}

// 방장 게임 시작: 검사 → 프로필 → 판 만들기 → 방 지우기 → 시작 방송
async function handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const isCanonicalSocket = () =>
        typeof getCurrentSocketId !== 'function' || getCurrentSocketId(uuid) === socket?.id
    if (!isCanonicalSocket()) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET,
            message: '연결이 만료되었습니다. 다시 시도해주세요.',
        })
        return
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    const { roomId: expectedRoomId, expectedSettingsVersion } = payload
    if (typeof expectedRoomId !== 'string' || expectedRoomId.length === 0) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) {
        callback({ ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    if (!room) {
        callback({ ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' })
        return
    }
    if (expectedRoomId !== roomId) {
        callback({ ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' })
        return
    }
    if (room.hostUuid !== uuid) {
        callback({ ok: false, code: 'NOT_HOST', message: '방장만 게임을 시작할 수 있습니다.' })
        return
    }
    if (expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: 'ROOM_STATE_CHANGED',
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }

    const players = [...room.players.values()]
    const configuredMinimum = getMinPlayers()
    const roomCapacity = room.settings?.maxPlayers ?? configuredMinimum
    const requiredPlayers = Math.min(configuredMinimum, roomCapacity)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers || players.length <= jokerCount) {
        callback({
            ok: false,
            code: 'MIN_PLAYERS_NOT_MET',
            message: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.',
        })
        return
    }
    if (!resolveRoleComposition(room.settings, players.length).ok) {
        callback({
            ok: false,
            code: 'INVALID_ROLE_COMPOSITION',
            message: '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.',
        })
        return
    }
    if (!players.every((player) => player.isReady === true)) {
        callback({
            ok: false,
            code: 'PLAYERS_NOT_READY',
            message: '아직 준비하지 않은 참가자가 있습니다.',
        })
        return
    }
    if (hasPendingAdmission(roomId)) {
        callback({
            ok: false,
            code: 'ADMISSION_IN_PROGRESS',
            message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.',
        })
        return
    }

    const versionAtRequest = expectedSettingsVersion
    const playersAtCapture = new Map(players.map((player) => [player.uuid, player]))
    let captured
    try {
        captured = await captureStartProfiles(room, uuid, playersAtCapture, versionAtRequest)
    } catch (err) {
        console.error('[게임 시작 계정 외형 조회 에러]', err)
        callback({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    if (!captured.ok) {
        callback({ ok: false, code: captured.code, message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    if (gameRooms.get(roomId) !== room || playerRoom.get(uuid) !== roomId || socket?.connected === false) {
        callback({ ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    if (!isCanonicalSocket()) {
        callback({
            ok: false,
            code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET,
            message: '연결이 만료되었습니다. 다시 시도해주세요.',
        })
        return
    }
    if (expectedSettingsVersion !== getSettingsVersion(room)) {
        callback({
            ok: false,
            code: 'ROOM_STATE_CHANGED',
            roomId,
            settingsVersion: getSettingsVersion(room),
            message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
        })
        return
    }
    if (!isStartStillValid(room, uuid, playersAtCapture, expectedSettingsVersion)) {
        callback({ ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    if (hasPendingAdmission(roomId)) {
        callback({
            ok: false,
            code: 'ADMISSION_IN_PROGRESS',
            message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.',
        })
        return
    }

    let callbackCalled = false
    const respond = (payload) => {
        if (callbackCalled) return
        callbackCalled = true
        try {
            callback(payload)
        } catch (ackErr) {
            console.error('[게임 시작 ack 실패]', ackErr)
        }
    }

    let prepared
    try {
        prepared = gameSession.prepareGameSession(captured.room)
    } catch (err) {
        console.error('[GameSession prepare 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    if (!prepared.ok) {
        respond({ ok: false, code: prepared.code, message: '게임을 시작할 수 없습니다.' })
        return
    }

    let uuidToSockets
    try {
        uuidToSockets = resolveParticipantSockets(io, prepared.session.players.keys(), roomId)
    } catch (err) {
        console.error('[게임 시작 소켓 조회 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    const missingUuid = [...prepared.session.players.keys()].find((u) => !uuidToSockets.get(u)?.length)
    if (missingUuid) {
        respond({ ok: false, code: 'PARTICIPANT_UNAVAILABLE', message: '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    let payloadsByUuid
    try {
        payloadsByUuid = new Map()
        for (const u of prepared.session.players.keys()) {
            payloadsByUuid.set(u, gameSession.buildGameStartedPayload(prepared.session, u))
        }
    } catch (err) {
        console.error('[game_started payload 생성 에러]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }

    try {
        gameSession.commitGameSession(prepared.session)
        prepared.session.emojiPaletteByUuid = captured.emojiPaletteByUuid instanceof Map
            ? captured.emojiPaletteByUuid
            : new Map()
        prepared.session.emojiRateLimit = new Map()
        room.players.forEach((_, u) => playerRoom.delete(u))
        gameRooms.delete(roomId)
        invalidateRoomAttempts(roomId, 'ROOM_STARTED')
        forgetSettingsResults(roomId)
        cancelRoomInvitesAsync(roomId, 'ROOM_STARTED')
        rememberStartedRoom(room)
    } catch (err) {
        console.error('[GameSession commit 에러 — 상태가 부분 반영됐을 수 있음]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임 시작 처리 중 오류가 발생했습니다.' })
        return
    }

    for (const sockets of uuidToSockets.values()) {
        for (const s of sockets) {
            s.data.activeGameId = prepared.session.id
        }
    }

    prepared.session.players.forEach((_, u) => {
        const payload = payloadsByUuid.get(u)
        for (const s of uuidToSockets.get(u) ?? []) {
            try {
                s.emit('game_started', payload)
            } catch (err) {
                console.error('[game_started 전달 실패]', err)
            }
        }
    })
    emitPublicRoomList(io)

    respond({ ok: true, gameId: prepared.session.id })
}

module.exports = {
    isStartStillValid,
    captureStartProfiles,
    handleStartGame,
}

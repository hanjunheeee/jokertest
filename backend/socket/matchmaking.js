const crypto = require('crypto')
const userRepository = require('../repositories/user.repositories')
const economyService = require('../service/economy.service')
const gameResultRepository = require('../repositories/gameResult.repositories')
const { generateRoomCode, generateUniqueRoomCode } = require('../utils/roomCode')
const { validateCreateRoomPayload } = require('../utils/createRoomValidation')
const {
    validateUpdateRoomSettingsPayload,
    buildEditableSettingsView,
    buildRoomSettingsView,
    settingsContainNonAllowlistedKeys,
    fingerprintUpdateSettings,
    fingerprintUpdateRequest,
    isRoomSettingsIdentifier,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    PRESERVED_ROOM_SETTING_KEYS,
} = require('../utils/updateRoomSettingsValidation')
const { ROOM_JOIN_ERROR_CODES } = require('./roomJoinErrors')
const gameSession = require('../game-core/gameSession')
const {
    validateCreateRoomRoleComposition,
    resolveRoleComposition,
} = require('../game-core/roleComposition')
const gameInviteModule = require('../service/gameInvite.service')
const kickReceiptStore = require('./kickReceiptStore')
const channelMembership = require('./channelMembership')

let onlineUsersRegistry = null

function setOnlineUsersRegistry(registry) {
    onlineUsersRegistry = registry
}

let gameInviteService = gameInviteModule

function __setGameInviteServiceForTests(fakeService) {
    gameInviteService = fakeService ?? gameInviteModule
}

let userRepositoryRef = userRepository

function __setUserRepositoryForTests(fakeRepository) {
    userRepositoryRef = fakeRepository ?? userRepository
}

let economyServiceRef = economyService

function __setEconomyServiceForTests(fakeEconomyService) {
    economyServiceRef = fakeEconomyService ?? economyService
}

let gameResultRepositoryRef = gameResultRepository

function __setGameResultRepositoryForTests(fakeRepository) {
    gameResultRepositoryRef = fakeRepository ?? gameResultRepository
}

const OFFICIAL_MIN_PLAYERS = 5
const OFFICIAL_ROOM_SIZES = [10, 8, 6, 5]
const DEVELOPMENT_ROOM_SIZES = [10, 8, 6, 5, 2, 1]

const RANDOM_MATCHMAKING_ENABLED = false

let randomMatchmakingEnabledOverride = null

function isRandomMatchmakingEnabled() {
    return randomMatchmakingEnabledOverride ?? RANDOM_MATCHMAKING_ENABLED
}

function __setRandomMatchmakingEnabledForTests(value) {
    randomMatchmakingEnabledOverride = value ?? null
}

function isDevelopmentMatchmaking() {
    return process.env.NODE_ENV !== 'production'
}

function getMinPlayers() {
    if (!isDevelopmentMatchmaking()) return OFFICIAL_MIN_PLAYERS
    const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)
    return Number.isInteger(configured) && configured > 0 ? configured : 1
}

function getSupportedRoomSizes() {
    return isDevelopmentMatchmaking() ? DEVELOPMENT_ROOM_SIZES : OFFICIAL_ROOM_SIZES
}

const matchmakingQueue = new Map()

const gameRooms = new Map()

const playerRoom = new Map()

const partyMatchingRoomByGameId = new Map()
const PARTY_MATCHING_ROOM_TTL_MS = 30 * 60 * 1000

const pendingRoomTransitions = new Map()

let roomTransitionTokenSeq = 0

function acquireRoomTransition(uuid) {
    if (pendingRoomTransitions.has(uuid)) return null
    roomTransitionTokenSeq += 1
    const token = `rt-${roomTransitionTokenSeq}`
    pendingRoomTransitions.set(uuid, token)
    return token
}

function releaseRoomTransition(uuid, token) {
    if (pendingRoomTransitions.get(uuid) === token) pendingRoomTransitions.delete(uuid)
}

const BOOT_EPOCH = kickReceiptStore.BOOT_EPOCH

const roomAdmissionAttempts = new Map()

const ADMISSION_DEFAULT_STEP_TIMEOUT_MS = 5 * 1000
const ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS = 15 * 1000
let ADMISSION_STEP_TIMEOUT_MS = ADMISSION_DEFAULT_STEP_TIMEOUT_MS
let ADMISSION_TOTAL_TIMEOUT_MS = ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS

function __setAdmissionTimeoutsForTests({ step, total } = {}) {
    ADMISSION_STEP_TIMEOUT_MS = Number.isFinite(step) ? step : ADMISSION_DEFAULT_STEP_TIMEOUT_MS
    ADMISSION_TOTAL_TIMEOUT_MS = Number.isFinite(total) ? total : ADMISSION_DEFAULT_TOTAL_TIMEOUT_MS
}

let admissionAttemptSeq = 0

function nextAttemptId() {
    admissionAttemptSeq += 1
    return `adm-${BOOT_EPOCH.slice(0, 8)}-${admissionAttemptSeq}`
}

const publishedAdmissions = new Map()

function releasePublishedAdmission(attempt) {
    if (attempt && publishedAdmissions.get(attempt.accountUuid) === attempt) {
        publishedAdmissions.delete(attempt.accountUuid)
    }
}

function getAdmissionAttempt(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    if (attempt.phase !== 'published' && attempt.expiresAt <= Date.now()) {
        roomAdmissionAttempts.delete(uuid)
        return null
    }
    return attempt
}

function invalidateAdmissionAttempt(uuid, reason) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (!attempt) return null
    roomAdmissionAttempts.delete(uuid)
    attempt.invalidated = reason ?? 'INVALIDATED'
    return attempt
}

function compensateInvalidatedAttempt(attempt, reason) {
    if (!attempt || typeof attempt.inviteId !== 'string') return

    const settled = attempt.decisionSettled === true || !attempt.decisionPromise
    const waitForDecision = settled
        ? Promise.resolve()
        : Promise.resolve(attempt.decisionPromise).then(() => null, () => null)

    waitForDecision
        .then(() => gameInviteService.recordEntryInterrupted({
            inviteId: attempt.inviteId, attemptId: attempt.attemptId, reason,
        }))
        .catch((err) => console.error('[초대 입장 보상 실패]', err))
}

function removePublishedAdmission(io, socket, attempt) {
    if (!attempt || attempt.phase !== 'published') return
    const room = gameRooms.get(attempt.roomId)

    const ownsPublication = publishedAdmissions.get(attempt.accountUuid) === attempt
    const seatedMembershipId = room?.players.get(attempt.accountUuid)?.membershipId
    const stillMine = ownsPublication
        && room === attempt.room
        && room?.instanceId === attempt.roomInstanceId
        && playerRoom.get(attempt.accountUuid) === attempt.roomId
        && (attempt.publicationMembershipId === undefined
            || seatedMembershipId === attempt.publicationMembershipId)
    if (stillMine) {
        releasePublishedAdmission(attempt)
        room.players.delete(attempt.accountUuid)
        playerRoom.delete(attempt.accountUuid)
    }

    const accountStillSeated = isAccountSeatedInRoom(attempt.accountUuid, attempt.roomId)
    if (socket && typeof socket.leave === 'function' && socket.id === attempt.socketId
        && (stillMine || !accountStillSeated)) {
        detachSocketFromChannel(socket, attempt.roomId, '[초대 입장 채널 정리 실패]', {
            ownsChannel: () =>
                isAccountSeatedInRoom(attempt.accountUuid, attempt.roomId)
                && isCanonicalSocketForAccount(io, attempt.accountUuid, socket, attempt.roomId),
            keepsConnection: () =>
                hasRoomMembership(attempt.accountUuid) || hasLiveGameMembership(attempt.accountUuid),
        })
    }
    if (!stillMine || !room) return
    if (room.players.size === 0) {
        gameRooms.delete(attempt.roomId)
        forgetSettingsUpdateResultsForRoom(attempt.roomId)
        emitPublicRoomList(io)
        return
    }
    if (!room.players.has(room.hostUuid)) {
        room.hostUuid = room.players.keys().next().value
        try {
            channelMembership.emitToChannel(io, attempt.roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                roomId: attempt.roomId,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    }
    try {
        channelMembership.emitToChannel(io, attempt.roomId, 'player_left_room', {
            uuid: attempt.accountUuid,
            membershipId: attempt.publicationMembershipId ?? null,
            roomId: attempt.roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    emitPublicRoomList(io)
}

function isRoomOwnedByAnotherSocket(io, roomId, uuid, socket) {
    const sockets = io?.sockets?.sockets
    if (!sockets || typeof sockets.values !== 'function') return false
    for (const other of sockets.values()) {
        if (!other || other === socket || other.id === socket.id) continue
        if (other.connected === false) continue
        if (other.data?.user?.uuid !== uuid) continue
        if (other.rooms?.has?.(roomId) || other.data?.activeRoomId === roomId) return true
    }
    return false
}

function scheduleLateJoinCleanup(io, socket, roomId, uuid, attempt, joinPromise) {
    if (!joinPromise || typeof joinPromise.then !== 'function') return
    joinPromise.then(() => {
        if (!socket || typeof socket.leave !== 'function') return
        if (socket.id !== attempt.socketId) return
        const leaveNow = () => {
            detachSocketFromChannel(socket, roomId, '[늦은 초대 채널 정리 실패]', {
                ownsChannel: () =>
                    isAccountSeatedInRoom(uuid, roomId)
                    && isCanonicalSocketForAccount(io, uuid, socket, roomId),
                keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
            })
        }
        if (isRoomOwnedByAnotherSocket(io, roomId, uuid, socket)) { leaveNow(); return }
        if (playerRoom.get(uuid) === roomId) return
        const current = roomAdmissionAttempts.get(uuid)
        if (current && current !== attempt && current.roomId === roomId && current.socketId === socket.id) return
        leaveNow()
    }, () => {})
}

function invalidateAdmissionAttemptsForRoom(roomId, reason) {
    for (const [uuid, attempt] of [...roomAdmissionAttempts]) {
        if (attempt.roomId !== roomId) continue
        roomAdmissionAttempts.delete(uuid)
        compensateInvalidatedAttempt(attempt, reason)
    }
}

function hasPendingAdmissionForRoom(roomId) {
    for (const [uuid] of roomAdmissionAttempts) {
        const attempt = getAdmissionAttempt(uuid)
        if (attempt && attempt.roomId === roomId) return true
    }
    return false
}

function countRoomOccupancy(room, excludeUuid = null) {
    let count = 0
    for (const uuid of room.players.keys()) {
        if (uuid !== excludeUuid) count += 1
    }
    for (const [uuid] of roomAdmissionAttempts) {
        if (uuid === excludeUuid) continue
        const attempt = getAdmissionAttempt(uuid)
        if (!attempt || attempt.roomId !== room.id) continue
        if (attempt.phase === 'reserved') count += 1
    }
    return count
}

const INITIAL_SETTINGS_VERSION = 1

function getSettingsVersion(room) {
    const version = room?.settingsVersion
    return Number.isSafeInteger(version) && version > 0 ? version : INITIAL_SETTINGS_VERSION
}

const roomSettingsUpdateResults = new Map()

const SETTINGS_UPDATE_RESULT_TTL_MS = 10 * 60 * 1000
const SETTINGS_UPDATE_RESULT_MAX_ENTRIES = 500

function settingsUpdateResultKey(uuid, roomId, requestId) {
    return JSON.stringify([uuid, roomId, requestId])
}

function pruneSettingsUpdateResults(now = Date.now()) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.expiresAt <= now) roomSettingsUpdateResults.delete(key)
    }
    enforceSettingsUpdateResultCapacity()
}

function enforceSettingsUpdateResultCapacity() {
    while (roomSettingsUpdateResults.size > SETTINGS_UPDATE_RESULT_MAX_ENTRIES) {
        const oldest = roomSettingsUpdateResults.keys().next().value
        if (oldest === undefined) break
        roomSettingsUpdateResults.delete(oldest)
    }
}

function recordSettingsUpdateResult(key, entry) {
    roomSettingsUpdateResults.set(key, entry)
    enforceSettingsUpdateResultCapacity()
}

function forgetSettingsUpdateResultsForRoom(roomId) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.roomId === roomId) roomSettingsUpdateResults.delete(key)
    }
}

const roomTransitionGeneration = new Map()

function getRoomTransitionGeneration(uuid) {
    return roomTransitionGeneration.get(uuid) ?? 0
}

function bumpRoomTransitionGeneration(uuid) {
    roomTransitionGeneration.set(uuid, getRoomTransitionGeneration(uuid) + 1)
}

const startedRoomMarks = new Map()

const STARTED_ROOM_MARK_TTL_MS = 30 * 60 * 1000

function pruneStartedRoomMarks(now) {
    const threshold = now - STARTED_ROOM_MARK_TTL_MS
    for (const [mark, startedAt] of startedRoomMarks) {
        if (startedAt <= threshold) startedRoomMarks.delete(mark)
    }
}

function rememberStartedRoom(room) {
    const now = Date.now()
    pruneStartedRoomMarks(now)
    if (typeof room?.code === 'string' && room.code) startedRoomMarks.set(`code:${room.code}`, now)
    if (typeof room?.id === 'string' && room.id) startedRoomMarks.set(`id:${room.id}`, now)
}

function __resetStartedRoomMarksForTests() {
    startedRoomMarks.clear()
}

function isStartedRoomMark(mark) {
    const startedAt = startedRoomMarks.get(mark)
    if (startedAt === undefined) return false
    if (startedAt <= Date.now() - STARTED_ROOM_MARK_TTL_MS) {
        startedRoomMarks.delete(mark)
        return false
    }
    return true
}

function emitRoomJoinFailed(socket, code, message, details = {}) {
    socket.emit('room_join_failed', { code, message, ...details })
}

const ALREADY_IN_GAME_MESSAGE = '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.'

function rejectIfInActiveGame(uuid, respond) {
    if (!gameSession.isParticipantBlockedFromMatchmaking(uuid)) return false
    const routing = gameSession.getActiveSessionRoutingInfo(uuid)
    if (!routing) return false
    respond({
        code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME,
        message: ALREADY_IN_GAME_MESSAGE,
        gameId: routing.gameId,
    })
    return true
}

const JOIN_ROOM_BY_CODE_TOP_LEVEL_KEYS = Object.freeze(['roomCode', 'roomId'])

const JOIN_REQUEST_INVALID_MESSAGE = '잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.'

function validateJoinRoomByCodeRequest(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            ok: false,
            code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
            message: JOIN_REQUEST_INVALID_MESSAGE,
        }
    }
    for (const key of Object.keys(payload)) {
        if (!JOIN_ROOM_BY_CODE_TOP_LEVEL_KEYS.includes(key)) {
            return {
                ok: false,
                code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
                message: JOIN_REQUEST_INVALID_MESSAGE,
            }
        }
    }
    if (Object.hasOwn(payload, 'roomId')) {
        if (typeof payload.roomId !== 'string' || payload.roomId.length === 0) {
            return {
                ok: false,
                code: ROOM_JOIN_ERROR_CODES.INVALID_REQUEST,
                message: JOIN_REQUEST_INVALID_MESSAGE,
            }
        }
    }
    return { ok: true, roomCode: payload.roomCode, roomId: payload.roomId ?? null }
}

function describeStartedRoomJoinFailure(phase) {
    if (phase === 'ENDED') {
        return [ROOM_JOIN_ERROR_CODES.SESSION_ENDED, '이미 끝난 게임의 방입니다.']
    }
    return [ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.']
}

function isRoomCodeReserved(code) {
    if (gameSession.getRoomCodeSessionState({ roomCode: code }) !== null) return true
    return isStartedRoomMark(`code:${code}`)
}

function registerMatchmakingHandlers(io, socket, uuid, { getCurrentSocketId } = {}) {
    socket.on('join_matchmaking', () =>
        handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    )
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    socket.on('join_room_by_code', (payload) => {
        const validated = validateJoinRoomByCodeRequest(payload)
        if (!validated.ok) {
            emitRoomJoinFailed(socket, validated.code, validated.message)
            return undefined
        }
        const { roomCode, roomId } = validated
        return handleJoinRoomByCode(
            io,
            socket,
            uuid,
            roomCode,
            roomId ? { roomId, accessType: 'code' } : null,
        ).catch((err) =>
            console.error('\x1b[31m[방 코드 참가 에러]\x1b[0m', err)
        )
    })
    socket.on('create_room', (payload, callback) => handleCreateRoom(io, socket, uuid, payload, callback))
    socket.on('get_current_room', (payload, callback) => handleGetCurrentRoom(uuid, callback))
    socket.on('get_party_matching_room', (payload, callback) =>
        handleGetPartyMatchingRoom(uuid, payload, callback))
    socket.on('get_public_rooms', (payload, callback) => handleGetPublicRooms(callback))
    socket.on('join_public_room', (payload) =>
        handleJoinPublicRoom(io, socket, uuid, payload).catch((err) =>
            console.error('\x1b[31m[공개 방 참가 에러]\x1b[0m', err)
        )
    )
    socket.on('delete_room',       () => handleDeleteRoom(io, uuid))
    socket.on('start_game', (payload, callback) =>
        handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    )
    socket.on('set_ready', (payload, callback) => handleSetReady(io, socket, uuid, payload, callback))
    socket.on(ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, (payload, callback) =>
        handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on(ROOM_SETTINGS_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, (payload, callback) =>
        handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_ROOM_PLAYER, (payload, callback) =>
        handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on('accept_game_invite', (payload, callback) =>
        handleAcceptGameInvite(io, socket, uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 수락 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'INTERNAL_ERROR', message: '초대를 처리하지 못했습니다.' }) } catch {}
            }
        })
    )
    socket.on('get_game_invite_result', (payload, callback) =>
        handleGetGameInviteResult(uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 결과 조회 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'UNKNOWN' }) } catch {}
            }
        })
    )
}

const ROOM_RECONNECT_GRACE_MS = 15 * 1000

const pendingRoomRemovals = new Map()

let roomPresenceTick = 0
const roomPresenceConfirmedTick = new Map()

function markRoomPresenceConfirmed(uuid) {
    roomPresenceTick += 1
    roomPresenceConfirmedTick.set(uuid, roomPresenceTick)
}

function cancelRoomRetention(uuid) {
    const pending = pendingRoomRemovals.get(uuid)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRoomRemovals.delete(uuid)
}

function findLiveSocketForUuid(io, uuid) {
    for (const candidate of io?.sockets?.sockets?.values?.() ?? []) {
        if (candidate?.data?.user?.uuid !== uuid) continue
        if (candidate.connected === false) continue
        return candidate
    }
    return null
}

function findAllLiveSocketsForUuid(io, uuid) {
    const found = []
    for (const candidate of io?.sockets?.sockets?.values?.() ?? []) {
        if (candidate?.data?.user?.uuid !== uuid) continue
        if (candidate.connected === false) continue
        found.push(candidate)
    }
    return found
}

function readPartyMatchingRoomForGame(gameId) {
    const entry = partyMatchingRoomByGameId.get(gameId)
    if (!entry) return null
    if (Date.now() - entry.createdAt > PARTY_MATCHING_ROOM_TTL_MS) {
        partyMatchingRoomByGameId.delete(gameId)
        return null
    }
    return entry.room
}

function scheduleRoomRetentionOnDisconnect(io, socket, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    cancelRoomRetention(uuid)
    const scheduledTick = roomPresenceTick

    const run = () => {
        pendingRoomRemovals.delete(uuid)
        if ((roomPresenceConfirmedTick.get(uuid) ?? -1) > scheduledTick) return
        if (playerRoom.get(uuid) !== roomId) return
        removeFromRoom(io, findLiveSocketForUuid(io, uuid), uuid)
    }

    const timer = setTimeout(run, ROOM_RECONNECT_GRACE_MS)
    if (typeof timer.unref === 'function') timer.unref()

    pendingRoomRemovals.set(uuid, { roomId, timer, run })
}

async function resyncRoomChannelOnReconnect(socket, uuid) {
    if (!socket) return

    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt && attempt.socketId !== socket.id) {
        invalidateAdmissionAttempt(uuid, 'CANONICAL_SOCKET_REPLACED')
        removePublishedAdmission(socket.server ?? null, null, attempt)
        compensateInvalidatedAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) return

    const seatAtCapture = room.players.get(uuid)
    const capturedMembershipId = seatAtCapture?.membershipId ?? null
    const capturedInstanceId = room.instanceId ?? room.id
    const capturedBootEpoch = kickReceiptStore.BOOT_EPOCH
    const io = socket.server ?? null

    const stillOwnsCapturedSeat = () => {
        if (playerRoom.get(uuid) !== roomId) return false
        const current = gameRooms.get(roomId)
        if (current !== room) return false
        if ((current.instanceId ?? current.id) !== capturedInstanceId) return false
        if (kickReceiptStore.BOOT_EPOCH !== capturedBootEpoch) return false
        const seat = current.players.get(uuid)
        if (!seat) return false
        if (capturedMembershipId !== null && (seat.membershipId ?? null) !== capturedMembershipId) return false
        return isCanonicalSocketForAccount(io, uuid, socket, roomId)
    }

    if (!stillOwnsCapturedSeat()) return

    if (socket.data) socket.data.activeRoomId = roomId

    try {
        await socket.join(roomId)
    } catch (err) {
        console.error('\x1b[31m[방 채널 재가입 실패]\x1b[0m', err)
        return
    }

    if (stillOwnsCapturedSeat()) return

    detachSocketFromChannel(
        socket, roomId, '[방 채널 재가입 보상 실패]',
        {
            ownsChannel: () =>
                isAccountSeatedInRoom(uuid, roomId)
                && isCanonicalSocketForAccount(io, uuid, socket, roomId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        },
    )
}

function onDisconnect(io, socket, uuid) {
    if (typeof socket?.id === 'string') channelMembership.releaseSocketFromAllChannels(socket.id)
    const queuedEntry = matchmakingQueue.get(uuid)
    if (queuedEntry && queuedEntry.socketId === socket?.id) {
        matchmakingQueue.delete(uuid)
    }

    const ownAttempt = roomAdmissionAttempts.get(uuid)
    if (ownAttempt && (socket?.id === undefined || ownAttempt.socketId === socket.id)) {
        const invalidated = invalidateAdmissionAttempt(uuid, 'DISCONNECTED')
        if (invalidated?.phase === 'published') removePublishedAdmission(io, socket, invalidated)
        compensateInvalidatedAttempt(invalidated, 'DISCONNECTED')
    }

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) return

    const expectedRoomId = socket?.data?.activeRoomId
    if (expectedRoomId !== undefined && expectedRoomId !== currentRoomId) return

    scheduleRoomRetentionOnDisconnect(io, socket, uuid)
}

async function handleJoinMatchmaking(io, socket, uuid) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    if (!isRandomMatchmakingEnabled()) {
        socket.emit('matchmaking_disabled', { message: '현재 빠른 매칭은 지원하지 않습니다.' })
        return
    }

    if (playerRoom.has(uuid)) return
    if (getAdmissionAttempt(uuid)) return

    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) return

    let user
    try {
        user = await userRepositoryRef.findByUuid(uuid)
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }
    if (!user) return
    if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return
    if (playerRoom.has(uuid) || getAdmissionAttempt(uuid)) return

    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id, generation: generationAtRequest })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    if (matchmakingQueue.size < getMinPlayers()) return

    const queuedPlayers = [...matchmakingQueue.values()].filter(
        (entry) => getRoomTransitionGeneration(entry.uuid) === entry.generation
    )
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    const players = queuedPlayers.slice(0, roomSize)
    players.forEach((player) => matchmakingQueue.delete(player.uuid))

    const roomId     = crypto.randomUUID()
    const roomCode   = generateRoomCode()
    const hostUuid   = players[0].uuid
    const playersMap = new Map(players.map((p) => [p.uuid, {
        uuid: p.uuid,
        nickname: p.nickname,
        isReady: false,
        membershipId: kickReceiptStore.nextMembershipId(),
    }]))

    const room = { id: roomId, instanceId: crypto.randomUUID(), code: roomCode, hostUuid, players: playersMap }
    gameRooms.set(roomId, room)
    players.forEach((p) => playerRoom.set(p.uuid, roomId))

    const payload = buildRoomPayload(room)

    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        s.data.activeRoomId = roomId
        s.emit('match_found', { ...payload, players: payload.players.map((p) => ({ ...p })) })
    })
}

function computeCanStart(room) {
    const players = [...room.players.values()]
    const configuredMinimum = getMinPlayers()
    const roomCapacity = room.settings?.maxPlayers ?? configuredMinimum
    const requiredPlayers = Math.min(configuredMinimum, roomCapacity)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers) return false
    if (players.length <= jokerCount) return false
    if (!resolveRoleComposition(room.settings, players.length).ok) return false
    if (hasPendingAdmissionForRoom(room.id)) return false
    return players.every((player) => player.isReady === true)
}

function buildRoomPayload(room) {
    return {
        roomId: room.id,
        roomCode: room.code,
        players: [...room.players.values()].map((player) => ({ ...player })),
        hostUuid: room.hostUuid,
        roomInstanceId: room.instanceId ?? null,
        bootEpoch: BOOT_EPOCH,
        canStart: computeCanStart(room),
        accessType: room.accessType ?? null,
        settingsVersion: getSettingsVersion(room),
        settings: buildRoomSettingsView(room.settings),
    }
}

async function loadRoomParticipantProfile(uuid) {
    const loadouts = await economyServiceRef.getPublicProfileLoadouts([uuid])
    const loadout = loadouts[uuid] ?? { profilePhotoId: null, profileBorderId: null }
    return {
        accountProfilePhotoId: loadout.profilePhotoId,
        accountProfileBorderId: loadout.profileBorderId,
    }
}

function isStartRequestStillValid(room, hostUuid, playersAtCapture, settingsVersionAtCapture) {
    if (room.hostUuid !== hostUuid) return false
    if (room.players.size !== playersAtCapture.size) return false
    for (const [u, player] of playersAtCapture) {
        if (room.players.get(u) !== player) return false
        if (playerRoom.get(u) !== room.id) return false
        if (player.membershipId !== room.players.get(u)?.membershipId) return false
        if (player.isReady !== true) return false
    }
    if (settingsVersionAtCapture !== undefined && settingsVersionAtCapture !== getSettingsVersion(room)) {
        return false
    }
    return true
}

async function captureRoomStartProfiles(room, hostUuid, playersAtCapture, settingsVersionAtCapture) {
    const uuids = [...playersAtCapture.keys()]
    const [loadouts, recordSummaries, emojiPaletteEntries] = await Promise.all([
        economyServiceRef.getGameStartLoadouts(uuids),
        Promise.resolve()
            .then(() => gameResultRepositoryRef.getAccountRecordSummaries(uuids))
            .then((summaries) => (summaries instanceof Map ? summaries : new Map()))
            .catch((error) => {
                console.error('[matchmaking] 계정 전적 조회 실패 — 전적 없이 게임을 시작합니다', error)
                return new Map()
            }),
        Promise.all(uuids.map((uuid) => Promise.resolve()
            .then(() => economyServiceRef.getEmojiPalette(uuid))
            .then((palette) => [uuid, {
                slots: Array.isArray(palette?.slots) ? [...palette.slots] : [],
                owned: Array.isArray(palette?.owned) ? [...palette.owned] : [],
            }])
            .catch((error) => {
                console.error('[matchmaking] 이모지 팔레트 조회 실패 — 팔레트 없이 게임을 시작합니다', error)
                return [uuid, { slots: [], owned: [] }]
            }))),
    ])

    if (!isStartRequestStillValid(room, hostUuid, playersAtCapture, settingsVersionAtCapture)) {
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

function buildPublicRoomList() {
    return [...gameRooms.values()]
        .filter((room) => room.accessType === 'open' || room.accessType === 'code')
        .map((room) => ({
            id: room.id,
            current: room.players.size,
            max: room.settings.maxPlayers,
            title: room.title,
            accessType: room.accessType,
            status: room.players.size >= room.settings.maxPlayers ? 'full' : 'waiting',
            settingsVersion: getSettingsVersion(room),
            settings: buildEditableSettingsView(room.settings),
        }))
}

function emitPublicRoomList(io) {
    if (typeof io?.emit !== 'function') return

    try {
        io.emit('public_rooms_updated', { rooms: buildPublicRoomList() })
    } catch (error) {
        console.error('[공개방 목록 알림 실패]', error)
    }
}

function handleGetPublicRooms(callback) {
    if (typeof callback !== 'function') return
    callback({ ok: true, rooms: buildPublicRoomList() })
}

async function leaveSocketRoomSafely(socket, roomId, logLabel) {
    try {
        await socket.leave(roomId)
    } catch (cleanupError) {
        console.error(logLabel, cleanupError)
    }
}

function handleCreateRoom(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    if (rejectIfInActiveGame(uuid, (error) => callback({ ok: false, ...error }))) return

    if (playerRoom.has(uuid)) {
        callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        callback({ ok: false, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }

    const validation = validateCreateRoomPayload(payload)
    if (!validation.ok) {
        callback({ ok: false, message: validation.message })
        return
    }

    const roleComposition = validateCreateRoomRoleComposition(payload, validation.value.settings)
    if (!roleComposition.ok) {
        callback({ ok: false, message: roleComposition.message })
        return
    }
    const validatedValue = {
        accessType: validation.value.accessType,
        settings: { ...validation.value.settings, ...roleComposition.value },
    }

    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        callback({ ok: false, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const generationAtReservation = getRoomTransitionGeneration(uuid)

    handleCreateRoomAfterReservation(io, socket, uuid, validatedValue, callback, generationAtReservation, transitionToken)
}

async function handleCreateRoomAfterReservation(io, socket, uuid, { accessType, settings }, callback, generationAtReservation, transitionToken) {
    let roomId = null
    let joined = false
    let room = null

    try {
        const [user, accountProfile] = await Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ])
        if (!user) {
            callback({ ok: false, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }

        if (playerRoom.has(uuid)) {
            callback({ ok: false, message: '이미 참여 중인 방이 있습니다.' })
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        if (!socket.connected) {
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        roomId = crypto.randomUUID()
        room = {
            id: roomId,
            instanceId: crypto.randomUUID(),
            code: null,
            hostUuid: uuid,
            title: `${user.nickname}의 방`,
            accessType,
            players: new Map([[uuid, { uuid, nickname: user.nickname, isReady: false, ...accountProfile }]]),
            settings,
            settingsVersion: INITIAL_SETTINGS_VERSION,
        }

        await socket.join(roomId)
        joined = true

        if (!socket.connected) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '연결이 끊어져 방을 생성하지 못했습니다.' })
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.' })
            return
        }

        const code = generateUniqueRoomCode(gameRooms, { isReserved: isRoomCodeReserved })
        if (!code) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
            joined = false
            callback({ ok: false, message: '방 코드를 생성하지 못했습니다. 다시 시도해주세요.' })
            return
        }
        room.code = code

        room.players.get(uuid).membershipId = kickReceiptStore.nextMembershipId()
        gameRooms.set(roomId, room)
        playerRoom.set(uuid, roomId)
        socket.data.activeRoomId = roomId
        emitPublicRoomList(io)
    } catch (err) {
        console.error('[방 생성 에러]', err)
        if (joined && roomId) {
            await leaveSocketRoomSafely(socket, roomId, '[방 생성 정리 실패]')
        }
        callback({ ok: false, message: '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }

    try {
        callback({ ok: true, room: buildRoomPayload(room) })
        notifyEndedSessionPartyOfMatchingRoom(io, uuid, room)
    } catch (ackError) {
        console.error('[방 생성 ack 실패]', ackError)
    }
    try {
        await autoJoinEndedSessionPartyToRoom(io, uuid, room)
    } catch (err) {
        console.error('[종료된 판 파티 자동 재입장 일괄 실패]', err)
    }
}

async function handleJoinPublicRoom(io, socket, uuid, payload) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }
    const { roomId } = payload
    if (typeof roomId !== 'string' || !roomId) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }

    const room = gameRooms.get(roomId)
    if (!room) {
        if (isStartedRoomMark(`id:${roomId}`)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
            return
        }
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return
    }
    if (room.accessType !== 'open') {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '이 방은 입장 코드가 필요합니다.')
        return
    }

    await handleJoinRoomByCode(io, socket, uuid, room.code, { roomId: room.id, accessType: room.accessType })
}

async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null) {
    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED, '방 코드를 입력해주세요.')
        return
    }

    if (playerRoom.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
        return
    }
    if (pendingRoomTransitions.has(uuid)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return
    }
    if (matchmakingQueue.has(uuid)) {
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE,
            '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.',
        )
        return
    }

    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return
    }
    const generationAtReservation = getRoomTransitionGeneration(uuid)

    let joinedRoomId = null
    let committed = false

    const joinExclusionOwner = channelMembership.createChannelExclusionOwner('join-by-code')
    let joinExclusionChannelId = null
    let joinExclusionSocketId = null
    const releaseJoinExclusion = () => {
        if (joinExclusionChannelId === null || joinExclusionSocketId === null) return
        channelMembership.releaseChannelExclusion(
            joinExclusionChannelId, joinExclusionSocketId, joinExclusionOwner,
        )
        joinExclusionChannelId = null
        joinExclusionSocketId = null
    }
    const socketIdAtRequest = socket.id
    const detachJoinedRoomChannel = (channelId) => {
        detachSocketFromChannel(socket, channelId, '[코드 참가 정리 실패]', {
            ownsChannel: () =>
                isAccountSeatedInRoom(uuid, channelId)
                && isCanonicalSocketForAccount(io, uuid, socket, channelId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        })
    }

    try {
        const [user, accountProfile] = await Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ])
        if (!user) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, '사용자 정보를 찾을 수 없습니다.')
            return
        }

        if (playerRoom.has(uuid)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            emitRoomJoinFailed(
                socket,
                ROOM_JOIN_ERROR_CODES.SESSION_ENDED,
                '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.',
            )
            return
        }

        let room
        if (expectedRoom?.accessType === 'code') {
            room = gameRooms.get(expectedRoom.roomId)
            if (!room) {
                const sessionState = gameSession.getRoomCodeSessionState({
                    roomCode: normalizedCode,
                    roomId: expectedRoom.roomId,
                })
                if (sessionState !== null) {
                    emitRoomJoinFailed(socket, ...describeStartedRoomJoinFailure(sessionState.phase))
                } else if (isStartedRoomMark(`id:${expectedRoom.roomId}`)) {
                    emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.SESSION_ENDED, '이미 끝난 게임의 방입니다.')
                } else {
                    emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
                }
                return
            }
            if (room.accessType !== 'code') {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '비밀 방을 찾을 수 없습니다.')
                return
            }
            if (room.code !== normalizedCode) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드가 올바르지 않습니다.')
                return
            }
        } else {
            room = [...gameRooms.values()].find((candidate) => candidate.code === normalizedCode)
        }
        if (!room) {
            const sessionState = gameSession.getRoomCodeSessionState({ roomCode: normalizedCode })
            if (sessionState !== null) {
                emitRoomJoinFailed(socket, ...describeStartedRoomJoinFailure(sessionState.phase))
                return
            }
            if (isStartedRoomMark(`code:${normalizedCode}`)) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.SESSION_ENDED, '이미 끝난 게임의 방입니다.')
                return
            }
            if (expectedRoom) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
                return
            }
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '입장 코드와 일치하는 방이 없습니다.')
            return
        }

        joinExclusionChannelId = room.id
        joinExclusionSocketId = socket.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, joinExclusionOwner)
        await socket.join(room.id)
        joinedRoomId = room.id

        if (!socket.connected) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
            return
        }

        if (socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !isCanonicalSocketWhenObservable(io, uuid, socket, room.id)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
            return
        }

        if (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id)) {
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR, '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.')
            return
        }

        if (gameRooms.get(room.id) !== room) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            if (isStartedRoomMark(`id:${room.id}`)) {
                emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
                return
            }
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '방을 찾을 수 없습니다.')
            return
        }

        if (expectedRoom && (room.id !== expectedRoom.roomId || room.accessType !== expectedRoom.accessType)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
            return
        }

        if (playerRoom.has(uuid)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
            return
        }

        if (getRoomTransitionGeneration(uuid) !== generationAtReservation) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(
                socket,
                ROOM_JOIN_ERROR_CODES.SESSION_ENDED,
                '게임 세션이 종료되어 요청을 처리하지 못했습니다. 다시 시도해주세요.',
            )
            return
        }

        const maxRoomSize = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        if (countRoomOccupancy(room, uuid) >= maxRoomSize) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_FULL, '방이 가득 찼습니다.')
            return
        }

        const player = {
            uuid,
            nickname: user.nickname,
            isReady: false,
            membershipId: kickReceiptStore.nextMembershipId(),
            ...accountProfile,
        }
        room.players.set(uuid, player)
        playerRoom.set(uuid, room.id)
        committed = true
        socket.data.activeRoomId = room.id

        releaseJoinExclusion()

        socket.emit('room_joined', buildRoomPayload(room))
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...player }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
    } catch (err) {
        console.error('[코드 참가 에러]', err)
        if (joinedRoomId && !committed) {
            detachJoinedRoomChannel(joinedRoomId)
        }
        emitRoomJoinFailed(
            socket,
            ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR,
            '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.',
        )
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        releaseJoinExclusion()
    }
}

function handleGetCurrentRoom(uuid, callback) {
    if (typeof callback !== 'function') return

    const attempt = getAdmissionAttempt(uuid)
    if (attempt) {
        callback({ ok: true, room: null, pending: true })
        return
    }

    const roomId = playerRoom.get(uuid)

    if (!roomId) {
        if (pendingRoomTransitions.has(uuid)) {
            callback({ ok: true, room: null, pending: true })
            return
        }
        callback({ ok: true, room: null })
        return
    }

    const room = gameRooms.get(roomId)

    if (!room || !room.players.has(uuid)) {
        playerRoom.delete(uuid)
        cancelRoomRetention(uuid)
        callback({ ok: true, room: null })
        return
    }

    markRoomPresenceConfirmed(uuid)
    cancelRoomRetention(uuid)

    callback({ ok: true, room: buildRoomPayload(room) })
}

function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    channelMembership.emitToChannel(io, roomId, 'room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
    invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_DELETED')
    forgetSettingsUpdateResultsForRoom(roomId)
    cancelInvitesForRoomAsync(roomId, 'ROOM_DELETED')
    emitPublicRoomList(io)
}

function cancelInvitesForRoomAsync(roomId, reason) {
    Promise.resolve()
        .then(() => gameInviteService.cancelPendingInvitesForRoom(roomId, reason))
        .catch((err) => console.error('[방 소멸 초대 정리 실패]', err))
}

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
    if (hasPendingAdmissionForRoom(roomId)) {
        callback({
            ok: false,
            code: 'ADMISSION_IN_PROGRESS',
            message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.',
        })
        return
    }

    const settingsVersionAtRequest = expectedSettingsVersion
    const playersAtCapture = new Map(players.map((player) => [player.uuid, player]))
    let captured
    try {
        captured = await captureRoomStartProfiles(room, uuid, playersAtCapture, settingsVersionAtRequest)
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
    if (!isStartRequestStillValid(room, uuid, playersAtCapture, expectedSettingsVersion)) {
        callback({ ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' })
        return
    }
    if (hasPendingAdmissionForRoom(roomId)) {
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
        invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_STARTED')
        forgetSettingsUpdateResultsForRoom(roomId)
        cancelInvitesForRoomAsync(roomId, 'ROOM_STARTED')
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

function resolveParticipantSockets(io, uuids, roomId) {
    const targets = new Set(uuids)
    const map = new Map()
    for (const s of io.sockets.sockets.values()) {
        const u = s.data?.user?.uuid
        if (!u || !targets.has(u)) continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(roomId)) continue
        if (!isAccountSeatedInRoom(u, roomId)) continue
        if (typeof s.id === 'string'
            && channelMembership.isSocketExcludedFromChannel(roomId, s.id)) continue
        if (onlineUsersRegistry instanceof Map
            && !isCanonicalSocketForAccount(io, u, s, roomId)) continue
        if (!map.has(u)) map.set(u, [])
        map.get(u).push(s)
    }
    return map
}

function commitRoomDeparture(io, socket, uuid, reason) {
    cancelRoomRetention(uuid)

    const ownAttempt = invalidateAdmissionAttempt(uuid, reason)
    if (ownAttempt) {
        removePublishedAdmission(io, socket, ownAttempt)
        compensateInvalidatedAttempt(ownAttempt, reason)
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return { removed: false }

    const room = gameRooms.get(roomId)
    if (!room) return { removed: false }

    const removedPlayer = room.players.get(uuid)
    room.players.delete(uuid)
    playerRoom.delete(uuid)

    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_GONE')
        forgetSettingsUpdateResultsForRoom(roomId)
        cancelInvitesForRoomAsync(roomId, 'ROOM_GONE')
        return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: true, hostChanged: false }
    }

    let hostChanged = false
    if (room.hostUuid === uuid) {
        room.hostUuid = room.players.keys().next().value
        hostChanged = true
    }
    return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: false, hostChanged }
}

function detachSocketFromChannel(socket, channelId, logLabel, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, { channelId }, ownership)
}

function isCanonicalSocketWhenObservable(io, uuid, socket, roomId) {
    if (!(onlineUsersRegistry instanceof Map)) return true
    return isCanonicalSocketForAccount(io, uuid, socket, roomId)
}

function isCanonicalSocketForAccount(io, uuid, socket, roomId) {
    if (!socket) return false
    const canonicalId = onlineUsersRegistry?.get?.(uuid)
    if (typeof canonicalId === 'string') return canonicalId === socket.id
    return !isRoomOwnedByAnotherSocket(io, roomId, uuid, socket)
}

function isAccountSeatedInRoom(uuid, roomId) {
    if (playerRoom.get(uuid) !== roomId) return false
    return gameRooms.get(roomId)?.players.has(uuid) === true
}

function hasRoomMembership(uuid) {
    const roomId = playerRoom.get(uuid)
    return typeof roomId === 'string' ? isAccountSeatedInRoom(uuid, roomId) : false
}

function hasLiveGameMembership(uuid) {
    return gameSession.isParticipantBlockedFromMatchmaking(uuid)
}

function notifyEndedSessionPartyOfMatchingRoom(io, hostUuid, room) {
    const ctx = gameSession.getEndedSessionPartyBroadcastContext(hostUuid)
    const gameId = ctx?.gameId ?? gameSession.getEndedSessionGameIdForParticipant(hostUuid)
    if (!gameId) return
    const payload = {
        gameId,
        room: buildRoomPayload(room),
    }
    partyMatchingRoomByGameId.set(gameId, { room: payload.room, createdAt: Date.now() })
    try {
        if (ctx) {
            io.to(ctx.channelId).emit('party_matching_room_ready', payload)
        }
        const participantUuids = ctx?.participantUuids
            ?? gameSession.getEndedSessionParticipantUuids(gameId, { excludeUuid: hostUuid })
        for (const participantUuid of participantUuids) {
            for (const participantSocket of findAllLiveSocketsForUuid(io, participantUuid)) {
                participantSocket.emit('party_matching_room_ready', payload)
            }
        }
    } catch (err) {
        console.error('[종료된 판 파티 매칭 방 알림 실패]', err)
    }
}

async function autoJoinEndedSessionPartyToRoom(io, hostUuid, room) {
    const gameId = gameSession.getEndedSessionGameIdForParticipant(hostUuid)
    if (!gameId || typeof room?.code !== 'string' || room.code.length === 0) return
    const participantUuids = gameSession.getEndedSessionParticipantUuids(gameId, { excludeUuid: hostUuid })
    for (const participantUuid of participantUuids) {
        if (playerRoom.has(participantUuid)) continue
        if (pendingRoomTransitions.has(participantUuid)) continue
        if (matchmakingQueue.has(participantUuid)) continue
        const participantSocket = findLiveSocketForUuid(io, participantUuid)
        if (!participantSocket) continue
        try {
            await handleJoinRoomByCode(
                io,
                participantSocket,
                participantUuid,
                room.code,
                { roomId: room.id, accessType: room.accessType ?? 'code' },
            )
        } catch (err) {
            console.error('[종료된 판 파티 자동 재입장 실패]', { participantUuid, gameId, err })
        }
    }
}

function handleGetPartyMatchingRoom(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const gameId = typeof payload?.gameId === 'string' && payload.gameId.length > 0
        ? payload.gameId
        : gameSession.getEndedSessionGameIdForParticipant(uuid)
    if (!gameId) {
        callback({ ok: true, gameId: null, room: null })
        return
    }
    if (!gameSession.canLookupPartyMatchingRoom(uuid, gameId)) {
        callback({ ok: true, gameId, room: null })
        return
    }
    callback({ ok: true, gameId, room: readPartyMatchingRoomForGame(gameId) })
}

function notifyRoomDeparture(io, outcome, departingSockets = []) {
    if (!outcome.removed) return
    const { roomId, room, roomDeleted, hostChanged } = outcome

    for (const departing of departingSockets) {
        detachSocketFromChannel(
            departing, roomId, '[대기방 채널 이탈 실패]',
            {
                ownsChannel: () =>
                    isAccountSeatedInRoom(outcome.uuid, roomId)
                    && isCanonicalSocketForAccount(io, outcome.uuid, departing, roomId),
                keepsConnection: () =>
                    hasRoomMembership(outcome.uuid) || hasLiveGameMembership(outcome.uuid),
            },
        )
    }

    if (roomDeleted) {
        try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
        return
    }

    if (hostChanged) {
        try {
            channelMembership.emitToChannel(io, roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomId,
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) {
            console.error('[방장 변경 방송 실패]', err)
        }
    }

    try {
        channelMembership.emitToChannel(io, roomId, 'player_left_room', {
            uuid: outcome.uuid,
            membershipId: outcome.removedPlayer?.membershipId ?? null,
            roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) {
        console.error('[참가자 이탈 방송 실패]', err)
    }

    try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
}

function removeFromRoom(io, socket, uuid) {
    const outcome = commitRoomDeparture(io, socket, uuid, 'LEFT_ROOM')
    notifyRoomDeparture(io, outcome, socket ? [socket] : [])
}

function handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[추방 ack 실패]', ackErr)
        }
    }
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.ROOM)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.ROOM, input)

    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond({ ...recorded.result, replayed: true })
        return
    }

    if (input.bootEpoch !== BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 방 정보를 다시 불러와주세요.')
        return
    }
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.ROOM,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }
    if (getAdmissionAttempt(uuid)) {
        decideReject(CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }
    if (rejectIfInActiveGame(uuid, ({ message }) => decideReject(CODES.ALREADY_IN_GAME, message))) return

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (currentRoomId !== input.roomId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const room = gameRooms.get(input.roomId)
    if (!room) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    if ((room.instanceId ?? room.id) !== input.roomInstanceId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const requester = room.players.get(uuid)
    if (!requester) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (requester.membershipId !== input.requesterMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '방 정보가 변경되었습니다. 다시 불러와주세요.')
        return
    }
    if (room.hostUuid !== uuid) {
        decideReject(CODES.NOT_HOST, '방장만 추방할 수 있습니다.')
        return
    }

    const target = room.players.get(input.targetUuid)
    if (!target || playerRoom.get(input.targetUuid) !== room.id) {
        decideReject(CODES.ALREADY_LEFT, '이미 방에서 나간 참가자입니다.')
        return
    }
    if (target.membershipId !== input.targetMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.')
        return
    }
    if (getAdmissionAttempt(input.targetUuid)) {
        decideReject(CODES.ADMISSION_PENDING, '상대의 입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    const kickedEvent = {
        roomId: room.id,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    const targetSockets = resolveParticipantSockets(io, [input.targetUuid], room.id).get(input.targetUuid) ?? []
    const outcome = commitRoomDeparture(io, null, input.targetUuid, 'KICKED_FROM_ROOM')
    const result = {
        ok: true,
        status: 'KICKED',
        roomId: input.roomId,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }
    kickReceiptStore.recordKickReceipt(receiptKey, {
        command: kickReceiptStore.KICK_COMMANDS.ROOM,
        fingerprint,
        result,
    })

    respond(result)
    for (const targetSocket of targetSockets) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.ROOM_KICKED, kickedEvent)
        } catch (err) {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', roomId: room.id })
        }
    }
    notifyRoomDeparture(io, outcome, targetSockets)
}

function cleanupRoomStateForSessionParticipants(io, uuids) {
    for (const uuid of uuids) {
        bumpRoomTransitionGeneration(uuid)
        const attempt = invalidateAdmissionAttempt(uuid, 'SESSION_ENDED')
        if (attempt) {
            removePublishedAdmission(io, null, attempt)
            compensateInvalidatedAttempt(attempt, 'SESSION_ENDED')
        }
    }

    const affected = []
    for (const uuid of uuids) {
        matchmakingQueue.delete(uuid)

        const roomId = playerRoom.get(uuid)
        if (!roomId) continue
        const room = gameRooms.get(roomId)
        if (!room || !room.players.has(uuid)) {
            playerRoom.delete(uuid)
            continue
        }

        const ownedSockets = []
        for (const s of io.sockets.sockets.values()) {
            if (s.data?.user?.uuid !== uuid) continue
            if (!s.rooms?.has(roomId)) continue
            ownedSockets.push(s)
        }

        affected.push({ uuid, roomId, room, ownedSockets })
    }

    for (const entry of affected) {
        entry.room.players.delete(entry.uuid)
        playerRoom.delete(entry.uuid)
    }

    for (const entry of affected) {
        for (const s of entry.ownedSockets) {
            try {
                s.leave(entry.roomId)
            } catch (err) {
                console.error('[세션 종료 Room 소켓 정리 실패]', err)
            }
        }
    }

    const removedUuidsByRoomId = new Map()
    for (const entry of affected) {
        if (!removedUuidsByRoomId.has(entry.roomId)) removedUuidsByRoomId.set(entry.roomId, [])
        removedUuidsByRoomId.get(entry.roomId).push(entry.uuid)
    }

    const processedRoomIds = new Set()
    for (const entry of affected) {
        if (processedRoomIds.has(entry.roomId)) continue
        processedRoomIds.add(entry.roomId)

        const room = entry.room
        try {
            if (room.players.size === 0) {
                gameRooms.delete(entry.roomId)
                forgetSettingsUpdateResultsForRoom(entry.roomId)
                emitPublicRoomList(io)
                continue
            }
            if (!room.players.has(room.hostUuid)) {
                room.hostUuid = room.players.keys().next().value
                channelMembership.emitToChannel(io, entry.roomId, 'host_changed', {
                    hostUuid: room.hostUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                    settingsVersion: getSettingsVersion(room),
                })
            }
        } catch (err) {
            console.error('[세션 종료 Room 정리 실패]', err)
        }

        for (const removedUuid of removedUuidsByRoomId.get(entry.roomId) ?? []) {
            try {
                channelMembership.emitToChannel(io, entry.roomId, 'player_left_room', {
                    uuid: removedUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                })
            } catch (err) {
                console.error('[세션 종료 Room 정리 실패]', err)
            }
        }

        emitPublicRoomList(io)
    }
}

gameInviteModule.__setRoomAccessForRuntime({
    bootEpoch: BOOT_EPOCH,

    getRoomIdForUser: (uuid) => playerRoom.get(uuid) ?? null,

    describeRoomForInvite: (roomId) => {
        const room = gameRooms.get(roomId)
        if (!room) return null
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        return {
            roomId: room.id,
            roomInstanceId: room.instanceId ?? room.id,
            hostUuid: room.hostUuid,
            occupancy: countRoomOccupancy(room),
            maxPlayers,
            isFull: countRoomOccupancy(room) >= maxPlayers,
        }
    },

    describeReceiverAvailability: (uuid) => {
        const routing = gameSession.getActiveSessionRoutingInfo(uuid)
        if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
            return { available: false, code: 'RECEIVER_IN_GAME' }
        }
        if (playerRoom.has(uuid)) return { available: false, code: 'RECEIVER_IN_ROOM' }
        if (matchmakingQueue.has(uuid)) return { available: false, code: 'RECEIVER_IN_QUEUE' }
        if (pendingRoomTransitions.has(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        if (getAdmissionAttempt(uuid)) return { available: false, code: 'RECEIVER_TRANSITIONING' }
        return { available: true, code: null }
    },
})

function withAdmissionTimeout(promise, ms, code) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error(code), { admissionTimeout: code })), ms)
        if (typeof timer.unref === 'function') timer.unref()
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (error) => { clearTimeout(timer); reject(error) },
        )
    })
}

async function handleAcceptGameInvite(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return

    let answered = false
    const respond = (result) => {
        if (answered) return
        answered = true
        try { callback(result) } catch (ackError) { console.error('[초대 수락 ack 실패]', ackError) }
    }

    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        respond({ ok: false, code: 'INVALID_REQUEST', message: '잘못된 요청입니다.' })
        return
    }

    if (rejectIfInActiveGame(uuid, ({ code, message, gameId }) => respond({ ok: false, code, message, gameId }))) return
    if (playerRoom.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, message: '이미 참여 중인 방이 있습니다.' })
        return
    }
    if (matchmakingQueue.has(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.IN_MATCHMAKING_QUEUE, message: '매칭 대기열에 남아있는 요청이 있습니다. 먼저 취소해주세요.' })
        return
    }
    if (getAdmissionAttempt(uuid)) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, message: '이미 처리 중인 요청이 있습니다.' })
        return
    }

    const generationAtRequest = getRoomTransitionGeneration(uuid)
    const attemptId = nextAttemptId()
    const startedAt = Date.now()
    const remaining = () => Math.max(0, ADMISSION_TOTAL_TIMEOUT_MS - (Date.now() - startedAt))
    const step = (promise, code) => withAdmissionTimeout(
        promise, Math.min(ADMISSION_STEP_TIMEOUT_MS, remaining() || 1), code,
    )

    let attempt = null
    let joinedRoomId = null
    const admissionExclusionOwner = channelMembership.createChannelExclusionOwner('admission')
    let admissionExclusionChannelId = null
    let admissionExclusionSocketId = null
    const releaseAdmissionExclusion = () => {
        if (admissionExclusionChannelId === null || admissionExclusionSocketId === null) return
        channelMembership.releaseChannelExclusion(
            admissionExclusionChannelId, admissionExclusionSocketId, admissionExclusionOwner,
        )
        admissionExclusionChannelId = null
        admissionExclusionSocketId = null
    }
    const socketIdAtRequest = socket.id

    try {
        const peek = await step(
            gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId }), 'PEEK_TIMEOUT',
        )
        if (!peek.known) {
            respond({ ok: false, code: 'INVITE_NOT_FOUND', message: '초대를 찾을 수 없습니다.' })
            return
        }
        if (peek.bootEpoch !== BOOT_EPOCH) {
            respond({ ok: false, code: 'SERVER_RESTARTED', message: '초대가 더 이상 유효하지 않습니다.' })
            return
        }

        const room = gameRooms.get(peek.roomId)
        if (!room || (room.instanceId ?? room.id) !== peek.roomInstanceId) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, message: '방을 찾을 수 없습니다.' })
            return
        }
        const maxPlayers = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        if (countRoomOccupancy(room, uuid) >= maxPlayers) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL, message: '방이 가득 찼습니다.' })
            return
        }
        attempt = {
            attemptId,
            accountUuid: uuid,
            inviteId,
            roomId: room.id,
            room,
            roomInstanceId: room.instanceId ?? room.id,
            bootEpoch: BOOT_EPOCH,
            generation: generationAtRequest,
            socketId: socket.id,
            phase: 'reserved',
            expiresAt: startedAt + ADMISSION_TOTAL_TIMEOUT_MS,
        }
        roomAdmissionAttempts.set(uuid, attempt)

        attempt.decisionPromise = Promise.resolve(
            gameInviteService.recordAcceptDecision({ receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH }),
        ).then(
            (value) => { attempt.decisionSettled = true; return value },
            (error) => { attempt.decisionSettled = true; throw error },
        )
        attempt.decisionPromise.catch(() => {})
        await step(attempt.decisionPromise, 'DECISION_TIMEOUT')
        if (getAdmissionAttempt(uuid) !== attempt) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        const [user, accountProfile] = await step(Promise.all([
            userRepositoryRef.findByUuid(uuid),
            loadRoomParticipantProfile(uuid),
        ]), 'PROFILE_TIMEOUT')
        if (!user) {
            respond({ ok: false, code: ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, message: '사용자 정보를 찾을 수 없습니다.' })
            return
        }
        if (getAdmissionAttempt(uuid) !== attempt || !socket.connected) {
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        admissionExclusionChannelId = room.id
        admissionExclusionSocketId = socket.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, admissionExclusionOwner)
        const joinPromise = Promise.resolve(socket.join(room.id))
        try {
            await step(joinPromise, 'JOIN_TIMEOUT')
            joinedRoomId = room.id
        } catch (joinError) {
            scheduleLateJoinCleanup(io, socket, room.id, uuid, attempt, joinPromise)
            throw joinError
        }

        if (socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !isCanonicalSocketWhenObservable(io, uuid, socket, room.id)) {
            if (!isAccountSeatedInRoom(uuid, room.id)) {
                detachSocketFromChannel(socket, room.id, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isAccountSeatedInRoom(uuid, room.id)
                        && isCanonicalSocketForAccount(io, uuid, socket, room.id),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            compensateInvalidatedAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
            respond({ ok: false, code: 'INTERRUPTED', message: '입장이 중단되었습니다.' })
            return
        }

        const player = { uuid, nickname: user.nickname, isReady: false, ...accountProfile }

        const publish = () => {
            if (getAdmissionAttempt(uuid) !== attempt) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.invalidated) return { ok: false, code: 'INTERRUPTED' }
            if (attempt.bootEpoch !== BOOT_EPOCH) return { ok: false, code: 'SERVER_RESTARTED' }
            if (getRoomTransitionGeneration(uuid) !== generationAtRequest) return { ok: false, code: 'SESSION_ENDED' }
            if (!socket.connected || attempt.socketId !== socket.id || socket.id !== socketIdAtRequest) {
                return { ok: false, code: 'DISCONNECTED' }
            }
            if (socket.data?.user?.uuid !== uuid) return { ok: false, code: 'DISCONNECTED' }
            if (!isCanonicalSocketWhenObservable(io, uuid, socket, room.id)) return { ok: false, code: 'DISCONNECTED' }
            if (socket.rooms && !socket.rooms.has(room.id)) return { ok: false, code: 'CHANNEL_LOST' }
            const current = gameRooms.get(attempt.roomId)
            if (current !== room || (current.instanceId ?? current.id) !== attempt.roomInstanceId) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND }
            }
            if (playerRoom.has(uuid)) return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM }
            const routing = gameSession.getActiveSessionRoutingInfo(uuid)
            if (routing && !gameSession.isForfeitedFromSession(routing.gameId, uuid)) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ALREADY_IN_GAME }
            }
            if (countRoomOccupancy(current, uuid) >= (current.settings?.maxPlayers ?? getSupportedRoomSizes()[0])) {
                return { ok: false, code: ROOM_JOIN_ERROR_CODES.ROOM_FULL }
            }
            player.membershipId = kickReceiptStore.nextMembershipId()
            attempt.publicationMembershipId = player.membershipId
            current.players.set(uuid, player)
            playerRoom.set(uuid, current.id)
            attempt.phase = 'published'
            publishedAdmissions.set(uuid, attempt)
            socket.data.activeRoomId = current.id
            return { ok: true }
        }
        const unpublish = () => removePublishedAdmission(io, socket, attempt)

        const finalized = await withAdmissionTimeout(
            gameInviteService.finalizeAcceptedEntry({
                receiverId: uuid, inviteId, attemptId, bootEpoch: BOOT_EPOCH, publish, unpublish,
            }),
            Math.max(1, remaining()),
            'RECEIPT_TIMEOUT',
        )

        if (!finalized.ok) {
            if (attempt.phase === 'published') removePublishedAdmission(io, socket, attempt)
            roomAdmissionAttempts.delete(uuid)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isAccountSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({
                ok: false,
                code: finalized.code,
                unknown: finalized.unknown === true,
                message: finalized.unknown === true
                    ? '입장 결과를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'
                    : '방에 입장하지 못했습니다.',
            })
            return
        }

        const current = gameRooms.get(attempt.roomId)
        const seated = room.players.get(uuid)
        const stillCurrentAttempt = roomAdmissionAttempts.get(uuid) === attempt && !attempt.invalidated
        const stillOwnsPublication = publishedAdmissions.get(uuid) === attempt
        if (!stillCurrentAttempt || !stillOwnsPublication
            || socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !socket.connected
            || !isCanonicalSocketWhenObservable(io, uuid, socket, room.id)
            || (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id))
            || current !== room || playerRoom.get(uuid) !== room.id || !seated
            || (attempt.publicationMembershipId !== undefined
                && seated.membershipId !== attempt.publicationMembershipId)) {
            if (attempt.phase === 'published') removePublishedAdmission(io, socket, attempt)
            if (roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
            releasePublishedAdmission(attempt)
            if (joinedRoomId) {
                const cleanupChannelId = joinedRoomId
                if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                    detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                        ownsChannel: () =>
                            isAccountSeatedInRoom(uuid, cleanupChannelId)
                            && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                        keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                    })
                }
                joinedRoomId = null
            }
            respond({ ok: false, code: 'UNKNOWN', unknown: true, message: '입장 결과를 확인하지 못했습니다.' })
            return
        }

        roomAdmissionAttempts.delete(uuid)
        releasePublishedAdmission(attempt)
        releaseAdmissionExclusion()

        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...seated }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
        respond({ ok: true, room: buildRoomPayload(room), inviteId, attemptId })
    } catch (error) {
        const timedOut = typeof error?.admissionTimeout === 'string'
        if (!timedOut) console.error('[초대 수락 처리 실패]', error)

        const registered = roomAdmissionAttempts.get(uuid) === attempt
        const own = registered || (attempt && !attempt.invalidated) ? attempt : null
        if (own) {
            if (registered) roomAdmissionAttempts.delete(uuid)
            if (own.phase === 'published') removePublishedAdmission(io, socket, own)
            compensateInvalidatedAttempt(own, timedOut ? error.admissionTimeout : 'ACCEPT_FAILED')
        }
        if (joinedRoomId) {
            const cleanupChannelId = joinedRoomId
            if (!isAccountSeatedInRoom(uuid, cleanupChannelId)) {
                detachSocketFromChannel(socket, cleanupChannelId, '[초대 입장 정리 실패]', {
                    ownsChannel: () =>
                        isAccountSeatedInRoom(uuid, cleanupChannelId)
                        && isCanonicalSocketForAccount(io, uuid, socket, cleanupChannelId),
                    keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
                })
            }
            joinedRoomId = null
        }
        respond({
            ok: false,
            code: timedOut ? 'UNKNOWN' : (error?.code ?? 'INTERNAL_ERROR'),
            unknown: timedOut,
            message: error?.status && error?.message ? error.message : '방에 입장하지 못했습니다.',
        })
    } finally {
        releaseRoomTransition(uuid, transitionToken)
        if (attempt && roomAdmissionAttempts.get(uuid) === attempt) roomAdmissionAttempts.delete(uuid)
        releaseAdmissionExclusion()
    }
}

async function handleGetGameInviteResult(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const inviteId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.inviteId : null
    const attemptId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.attemptId : undefined
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        callback({ ok: false, code: 'INVALID_REQUEST' })
        return
    }

    if (getAdmissionAttempt(uuid)) {
        callback({ ok: true, pending: true, entered: false })
        return
    }

    const outcome = await gameInviteService.getAttemptOutcome({ receiverId: uuid, inviteId, attemptId })
    if (!outcome.known) {
        callback({ ok: false, code: 'INVITE_NOT_FOUND' })
        return
    }
    if (outcome.staleAttempt) {
        callback({ ok: true, entered: false, invite: outcome.invite, staleAttempt: true })
        return
    }

    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    const entered = outcome.entryOutcome === 'PUBLISHED'
        && outcome.bootEpoch === BOOT_EPOCH
        && room !== null && room !== undefined
        && room.id === outcome.roomId
        && (room.instanceId ?? room.id) === outcome.roomInstanceId
        && room.players.has(uuid)

    callback({
        ok: true,
        entered,
        invite: outcome.invite,
        room: entered ? buildRoomPayload(room) : null,
    })
}

function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
    roomAdmissionAttempts.clear()
    publishedAdmissions.clear()
    startedRoomMarks.clear()
    roomSettingsUpdateResults.clear()
    partyMatchingRoomByGameId.clear()
    kickReceiptStore.__resetKickReceiptsForTests()
    channelMembership.__resetChannelExclusionsForTests()
    for (const pending of pendingRoomRemovals.values()) clearTimeout(pending.timer)
    pendingRoomRemovals.clear()
    roomPresenceConfirmedTick.clear()
    roomPresenceTick = 0
}

function __flushRoomRetentionForTests() {
    for (const pending of [...pendingRoomRemovals.values()]) {
        clearTimeout(pending.timer)
        pending.run()
    }
}

function __getPendingRoomRemovalsForTests() {
    return [...pendingRoomRemovals.entries()].map(([uuid, { roomId }]) => [uuid, roomId])
}

function __getStateSnapshotForTests() {
    return {
        matchmakingQueue: [...matchmakingQueue.entries()],
        gameRooms: [...gameRooms.entries()].map(([id, room]) => [
            id,
            {
                ...room,
                players: [...room.players.entries()],
                settings: room.settings === undefined || room.settings === null
                    ? room.settings
                    : JSON.parse(JSON.stringify(room.settings)),
            },
        ]),
        playerRoom: [...playerRoom.entries()],
        roomSettingsUpdateResults: [...roomSettingsUpdateResults.entries()].map(([key, entry]) => [key, {
            roomId: entry.roomId,
            changed: entry.changed,
            settingsVersion: entry.settingsVersion,
        }]),
        pendingRoomTransitions: [...pendingRoomTransitions.keys()],
        roomAdmissionAttempts: [...roomAdmissionAttempts.entries()].map(([uuid, attempt]) => [uuid, {
            attemptId: attempt.attemptId,
            inviteId: attempt.inviteId,
            roomId: attempt.roomId,
            roomInstanceId: attempt.roomInstanceId,
            phase: attempt.phase,
            socketId: attempt.socketId,
        }]),
        bootEpoch: BOOT_EPOCH,
    }
}

function __seedMatchmakingQueueForTests(uuid, entry) {
    matchmakingQueue.set(uuid, entry)
}

function __seedRoomForTests(room) {
    gameRooms.set(room.id, room)
}

function __seedPlayerRoomForTests(uuid, roomId) {
    playerRoom.set(uuid, roomId)
}

function __removeRoomForTests(roomId) {
    const room = gameRooms.get(roomId)
    if (room) {
        room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    }
    gameRooms.delete(roomId)
    invalidateAdmissionAttemptsForRoom(roomId, 'ROOM_GONE')
    forgetSettingsUpdateResultsForRoom(roomId)
}

function __getBootEpochForTests() {
    return BOOT_EPOCH
}

function __seedAdmissionAttemptForTests(uuid, attempt) {
    const seeded = {
        attemptId: attempt.attemptId ?? nextAttemptId(),
        accountUuid: uuid,
        inviteId: attempt.inviteId ?? null,
        roomId: attempt.roomId,
        room: gameRooms.get(attempt.roomId) ?? null,
        roomInstanceId: attempt.roomInstanceId ?? gameRooms.get(attempt.roomId)?.instanceId ?? attempt.roomId,
        bootEpoch: BOOT_EPOCH,
        generation: getRoomTransitionGeneration(uuid),
        socketId: attempt.socketId ?? null,
        phase: attempt.phase ?? 'reserved',
        expiresAt: Date.now() + ADMISSION_TOTAL_TIMEOUT_MS,
    }
    roomAdmissionAttempts.set(uuid, seeded)
    if (seeded.phase === 'published') publishedAdmissions.set(uuid, seeded)
}

function __expireAdmissionAttemptForTests(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt) attempt.expiresAt = Date.now() - 1
}

module.exports = {
    registerMatchmakingHandlers,
    setOnlineUsersRegistry,
    onDisconnect,
    resyncRoomChannelOnReconnect,
    cleanupRoomStateForSessionParticipants,
    hasRoomMembership,
    ROOM_RECONNECT_GRACE_MS,
    __resetStateForTests,
    __flushRoomRetentionForTests,
    __getPendingRoomRemovalsForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __getBootEpochForTests,
    __seedAdmissionAttemptForTests,
    __expireAdmissionAttemptForTests,
    __resetStartedRoomMarksForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
    __setGameInviteServiceForTests,
    __setAdmissionTimeoutsForTests,
    __setRandomMatchmakingEnabledForTests,
    ALREADY_IN_GAME_MESSAGE,
    ROOM_SETTINGS_EVENTS,
    ROOM_SETTINGS_ERROR_CODES,
    JOIN_REQUEST_INVALID_MESSAGE,
    KICK_EVENTS: kickReceiptStore.KICK_EVENTS,
    KICK_ERROR_CODES: kickReceiptStore.KICK_ERROR_CODES,
    __testables: {
        handleCreateRoom,
        handleJoinRoomByCode,
        validateJoinRoomByCodeRequest,
        isRoomCodeReserved,
        isStartedRoomMark,
        handleGetCurrentRoom,
        handleGetPartyMatchingRoom,
        handleGetPublicRooms,
        handleJoinPublicRoom,
        handleJoinMatchmaking,
        handleDeleteRoom,
        handleStartGame,
        handleSetReady,
        handleUpdateRoomSettings,
        handleGetRoomSettingsUpdateResult,
        leaveSocketRoomSafely,
        handleAcceptGameInvite,
        handleGetGameInviteResult,
        countRoomOccupancy,
        hasPendingAdmissionForRoom,
        removeFromRoom,
        handleKickRoomPlayer,
        commitRoomDeparture,
        notifyRoomDeparture,
    },
}

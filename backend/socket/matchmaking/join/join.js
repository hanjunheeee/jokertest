// 방 입장 파일
// 코드·공개방 입장 + 끝난 판 사람 자동 입장 + 공개 방 목록 (지도 01·09)
const kickReceiptStore = require('../../kickReceiptStore')
const gameSession = require('../../../game-core/gameSession')
const channelMembership = require('../../channelMembership')
const { rejectIfInGame, emitRoomJoinFailed, describeJoinFailure } = require('./guards')
const { ROOM_JOIN_ERROR_CODES } = require('../../roomJoinErrors')
const { playerRoom, pendingRoomTransitions, matchmakingQueue, gameRooms } = require('../core/state')
const { acquireRoomTransition, getGeneration, releaseRoomTransition } = require('./transition')
const { detachSocketFromChannel, isSeatedInRoom, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership, isCanonicalOrUnknown, findLiveSocket } = require('../room/membership')
const { deps } = require('../core/deps')
const { loadPlayerProfile, buildRoomPayload, computeCanStart, emitPublicRoomList, buildPublicRoomList } = require('../room/view')
const { isStartedRoomMark } = require('./startedMarks')
const { getSupportedRoomSizes } = require('../core/config')
const { countRoomOccupancy } = require('../admission/attempts')

// 코드로 방 입장: 검사 → 잠금 → 프로필 → 방 찾기 → 채널 → 명단 추가 확정 → 알림
async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null) {
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
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
    const generationAtReservation = getGeneration(uuid)

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
                isSeatedInRoom(uuid, channelId)
                && isCanonicalSocket(io, uuid, socket, channelId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        })
    }

    try {
        const [user, accountProfile] = await Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadPlayerProfile(uuid),
        ])
        if (!user) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, '사용자 정보를 찾을 수 없습니다.')
            return
        }

        if (playerRoom.has(uuid)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM, '이미 참여 중인 방이 있습니다.')
            return
        }

        if (getGeneration(uuid) !== generationAtReservation) {
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
                    emitRoomJoinFailed(socket, ...describeJoinFailure(sessionState.phase))
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
                emitRoomJoinFailed(socket, ...describeJoinFailure(sessionState.phase))
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
            || !isCanonicalOrUnknown(io, uuid, socket, room.id)) {
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

        if (getGeneration(uuid) !== generationAtReservation) {
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

// 공개방 고르기 입장 (코드 입장 흐름 그대로 씀)
async function handleJoinPublicRoom(io, socket, uuid, payload) {
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
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

// 끝난 판 사람을 방장이 만든 다음 방에 자동 입장
async function autoJoinPartyToRoom(io, hostUuid, room) {
    const gameId = gameSession.getEndedSessionGameIdForParticipant(hostUuid)
    if (!gameId || typeof room?.code !== 'string' || room.code.length === 0) return
    const participantUuids = gameSession.getEndedSessionParticipantUuids(gameId, { excludeUuid: hostUuid })
    for (const participantUuid of participantUuids) {
        if (playerRoom.has(participantUuid)) continue
        if (pendingRoomTransitions.has(participantUuid)) continue
        if (matchmakingQueue.has(participantUuid)) continue
        const participantSocket = findLiveSocket(io, participantUuid)
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

// 공개 방 목록 보내 주기
function handleGetPublicRooms(callback) {
    if (typeof callback !== 'function') return
    callback({ ok: true, rooms: buildPublicRoomList() })
}

module.exports = {
    handleJoinRoomByCode,
    handleJoinPublicRoom,
    autoJoinPartyToRoom,
    handleGetPublicRooms,
}

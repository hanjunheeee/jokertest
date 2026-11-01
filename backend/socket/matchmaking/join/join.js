// 방 입장 파일
// 코드·공개방 입장 + 끝난 판 사람 자동 입장 + 공개 방 목록 (지도 01·09)
// matchmaking.js가 join_room_by_code 등 사건 셋에 붙임, 자동 입장은 join/create가 부름
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
// expectedRoom 있으면 그 방 id·종류만 받음 (목록에서 고른 방·자동 입장·방 id 같이 보낸 요청)
async function handleJoinRoomByCode(io, socket, uuid, roomCode, expectedRoom = null) {
    // 게임 중이면 거절 (지도 01-②)
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    // 코드 앞뒤 공백 다듬고 비었으면 거절
    const normalizedCode = String(roomCode ?? '').trim()
    if (!normalizedCode) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED, '방 코드를 입력해주세요.')
        return
    }

    // 이미 방·처리 중·줄에 있으면 거절 (지도 01-②)
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

    // 첫 await 전에 처리 중 토큰 꽂고 세대 번호 기억 (지도 01-③④)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.REQUEST_IN_PROGRESS, '이미 처리 중인 요청이 있습니다.')
        return
    }
    const generationAtReservation = getGeneration(uuid)

    // 채널 붙은 방·명단 확정 여부 (실패 때 채널 뗄지 판단)
    let joinedRoomId = null
    let committed = false

    const joinExclusionOwner = channelMembership.createChannelExclusionOwner('join-by-code')
    let joinExclusionChannelId = null
    let joinExclusionSocketId = null
    // 방송 제외 풀기, 건 적 있을 때 한 번만
    const releaseJoinExclusion = () => {
        if (joinExclusionChannelId === null || joinExclusionSocketId === null) return
        channelMembership.releaseChannelExclusion(
            joinExclusionChannelId, joinExclusionSocketId, joinExclusionOwner,
        )
        joinExclusionChannelId = null
        joinExclusionSocketId = null
    }
    // 요청 받은 소켓 id 기억 (그사이 새 탭이 소켓 바꾸면 거절용)
    const socketIdAtRequest = socket.id
    // 채널 떼기, 그사이 정식으로 앉았거나 다른 소속 남았으면 떼기 쪽이 알아서 맞춤 (지도 01-⑦)
    const detachJoinedRoomChannel = (channelId) => {
        detachSocketFromChannel(socket, channelId, '[코드 참가 정리 실패]', {
            ownsChannel: () =>
                isSeatedInRoom(uuid, channelId)
                && isCanonicalSocket(io, uuid, socket, channelId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        })
    }

    try {
        // 계정·프로필 읽기, 계정 없으면 거절
        const [user, accountProfile] = await Promise.all([
            deps.userRepository.findByUuid(uuid),
            loadPlayerProfile(uuid),
        ])
        if (!user) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.USER_NOT_FOUND, '사용자 정보를 찾을 수 없습니다.')
            return
        }

        // 기다린 사이 다른 방 들어갔거나 판 끝 정리됐으면 거절 (지도 01-④)
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

        // 방 찾기: 코드 방 id 받은 요청이면 그 방만 (종류·코드도 맞아야 함), 아니면 코드로 찾음
        let room
        if (expectedRoom?.accessType === 'code') {
            room = gameRooms.get(expectedRoom.roomId)
            // 그 방이 없으면 판 상태·시작 표시로 이유 고름 (지도 01-⑤)
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
        // 못 찾으면 이유 고르기 (지도 01-⑤): 판 있음 → 시작됨·끝남, 시작 표시만 → 끝남
        // 공개방 고른 요청 → 방 없음, 직접 친 코드 → 코드 틀림
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

        // 채널 넣기 전에 방송 제외 걸기, 확정 전엔 방 방송 못 받게 (지도 01-⑥)
        joinExclusionChannelId = room.id
        joinExclusionSocketId = socket.id
        channelMembership.excludeSocketFromChannel(room.id, socket.id, joinExclusionOwner)
        await socket.join(room.id)
        joinedRoomId = room.id

        // join 기다린 사이 끊겼으면 채널 떼고 거절 (지도 01-⑦)
        if (!socket.connected) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
            return
        }

        // 소켓 바뀜·신원 바뀜·새 탭이 주인이면 거절
        if (socket.id !== socketIdAtRequest
            || socket.data?.user?.uuid !== uuid
            || !isCanonicalOrUnknown(io, uuid, socket, room.id)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.DISCONNECTED, '연결이 끊어져 방에 참여하지 못했습니다.')
            return
        }

        // join 끝났는데 채널에 없으면 거절, 붙은 게 없으니 뗄 것도 없음
        if (socket.rooms && typeof socket.rooms.has === 'function' && !socket.rooms.has(room.id)) {
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR, '방에 참여하지 못했습니다. 잠시 후 다시 시도해주세요.')
            return
        }

        // 그사이 방이 사라졌으면 (시작·삭제·빈 방) 이유 골라 거절
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

        // 고른 방 그대로인지 (같은 id·같은 공개 종류, 그사이 종류 바뀌면 거절)
        if (expectedRoom && (room.id !== expectedRoom.roomId || room.accessType !== expectedRoom.accessType)) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
            return
        }

        // join도 기다렸으니 다른 방·판 끝 정리 다시 확인
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

        // 자리 남았는지 (초대로 자리 잡은 사람도 셈), 여기서 명단 추가까지 await 없음 (지도 01-⑧)
        const maxRoomSize = room.settings?.maxPlayers ?? getSupportedRoomSizes()[0]
        if (countRoomOccupancy(room, uuid) >= maxRoomSize) {
            detachJoinedRoomChannel(room.id)
            joinedRoomId = null
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_FULL, '방이 가득 찼습니다.')
            return
        }

        // 여기부터 진짜 바뀜: 명단 추가 = 입장 확정
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

        // 확정 뒤에야 방송 제외 풂 (지도 01-⑥)
        releaseJoinExclusion()

        // 나한테 방 정보, 방 사람들한테 (나 빼고) 새 사람, 목록 갱신
        socket.emit('room_joined', buildRoomPayload(room))
        channelMembership.emitToChannel(
            io, room.id, 'player_joined_room',
            { player: { ...player }, canStart: computeCanStart(room) },
            { senderSocket: socket },
        )
        emitPublicRoomList(io)
    } catch (err) {
        // 확정 전 실패면 붙은 채널 떼고 실패 알림 (확정 뒤면 명단 그대로)
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
        // 어느 길로 끝나든 토큰·방송 제외 정리
        releaseRoomTransition(uuid, transitionToken)
        releaseJoinExclusion()
    }
}

// 공개방 고르기 입장 (코드 입장 흐름 그대로 씀)
async function handleJoinPublicRoom(io, socket, uuid, payload) {
    // 게임 중이면 요청 모양보다 먼저 거절
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    // 요청 모양: 방 id 글자만
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }
    const { roomId } = payload
    if (typeof roomId !== 'string' || !roomId) {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.INVALID_REQUEST, '잘못된 요청입니다.')
        return
    }

    // 방 없으면 시작 표시로 이유 고름
    const room = gameRooms.get(roomId)
    if (!room) {
        if (isStartedRoomMark(`id:${roomId}`)) {
            emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED, '이미 게임이 시작된 방입니다.')
            return
        }
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND, '공개 방을 찾을 수 없습니다.')
        return
    }
    // 코드 없이는 open 방만, code 방은 코드 쳐야 함
    if (room.accessType !== 'open') {
        emitRoomJoinFailed(socket, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH, '이 방은 입장 코드가 필요합니다.')
        return
    }

    // 그 방 코드로 코드 입장 흐름 탐, 고른 방 id·종류 같이 넘겨 다른 방 못 들어가게
    await handleJoinRoomByCode(io, socket, uuid, room.code, { roomId: room.id, accessType: room.accessType })
}

// 끝난 판 사람을 방장이 만든 다음 방에 자동 입장
async function autoJoinPartyToRoom(io, hostUuid, room) {
    // 방 만든 사람이 끝난 판에 남아 있고 방 코드 있을 때만
    const gameId = gameSession.getEndedGameId(hostUuid)
    if (!gameId || typeof room?.code !== 'string' || room.code.length === 0) return
    const participantUuids = gameSession.getEndedPlayerUuids(gameId, { excludeUuid: hostUuid })
    for (const participantUuid of participantUuids) {
        // 이미 방·처리 중·줄에 있거나 연결 없으면 조용히 건너뜀 (실패 알림 안 뜨게)
        if (playerRoom.has(participantUuid)) continue
        if (pendingRoomTransitions.has(participantUuid)) continue
        if (matchmakingQueue.has(participantUuid)) continue
        const participantSocket = findLiveSocket(io, participantUuid)
        if (!participantSocket) continue
        // 한 사람씩 코드 입장 흐름으로, 한 사람 실패가 나머지 안 막음
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

// 공개 방 목록 보내 주기 (답 받을 곳 없으면 안 함)
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

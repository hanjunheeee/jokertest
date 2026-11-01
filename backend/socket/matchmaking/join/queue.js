// 자동 매칭 줄 파일
// 자동 매칭 줄 서기 + 줄에서 빠지기 (지도 10)
// matchmaking.js가 join_matchmaking·leave_matchmaking에 붙임, 지금은 스위치 꺼져 있음
const kickReceiptStore = require('../../kickReceiptStore')
const crypto = require('crypto')
const { rejectIfInGame, emitRoomJoinFailed } = require('./guards')
const { isRandomMatchEnabled, getMinPlayers, getSupportedRoomSizes } = require('../core/config')
const { playerRoom, matchmakingQueue, gameRooms } = require('../core/state')
const { getAdmissionAttempt } = require('../admission/attempts')
const { getGeneration, acquireRoomTransition, releaseRoomTransition } = require('./transition')
const { deps } = require('../core/deps')
const { generateRoomCode } = require('../../../utils/roomCode')
const { buildRoomPayload } = require('../room/view')

// 자동 매칭 줄 서기, 인원 차면 방 만들어 넣음 (게임 중·방 안이면 거절)
async function handleJoinMatchmaking(io, socket, uuid) {
    // 게임 중이면 스위치보다 먼저 거절 (지도 10-①)
    if (rejectIfInGame(uuid, ({ code, message, gameId }) =>
        emitRoomJoinFailed(socket, code, message, { gameId })
    )) return

    // 스위치 꺼졌으면 조용히 무시 말고 꺼짐 알림 (화면 막힘만 믿지 않음, 지도 10-②)
    if (!isRandomMatchEnabled()) {
        socket.emit('matchmaking_disabled', { message: '현재 빠른 매칭은 지원하지 않습니다.' })
        return
    }

    // 이미 방에 있거나 초대 입장 중이면 말없이 무시
    if (playerRoom.has(uuid)) return
    if (getAdmissionAttempt(uuid)) return

    // 세대 번호 기억, 계정 읽는 동안만 처리 중 토큰 꽂음
    const generationAtRequest = getGeneration(uuid)
    const transitionToken = acquireRoomTransition(uuid)
    if (transitionToken === null) return

    let user
    try {
        user = await deps.userRepository.findByUuid(uuid)
    } finally {
        releaseRoomTransition(uuid, transitionToken)
    }
    // 기다린 사이 판 끝 정리됐거나 방·초대 입장이 생겼으면 줄에 안 넣음
    if (!user) return
    if (getGeneration(uuid) !== generationAtRequest) return
    if (playerRoom.has(uuid) || getAdmissionAttempt(uuid)) return

    // 줄에 넣고 순번 알림
    matchmakingQueue.set(uuid, { uuid, nickname: user.nickname, socketId: socket.id, generation: generationAtRequest })
    socket.emit('matchmaking_queued', { position: matchmakingQueue.size })

    // 최소 인원 안 되면 더 기다림
    if (matchmakingQueue.size < getMinPlayers()) return

    // 판 끝 정리 전에 줄 선 사람은 뺌, 남은 수로 들어가는 가장 큰 방 크기 고름
    const queuedPlayers = [...matchmakingQueue.values()].filter(
        (entry) => getGeneration(entry.uuid) === entry.generation
    )
    const roomSize = getSupportedRoomSizes().find((size) => queuedPlayers.length >= size)
    if (!roomSize) return

    // 여기부터 진짜 바뀜: 먼저 선 사람부터 줄에서 빼고 방 만들어 등록, 첫 사람이 방장
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

    // 줄 설 때 소켓을 채널에 넣고 match_found 알림 (그 소켓 없으면 건너뜀)
    players.forEach(({ socketId }) => {
        const s = io.sockets.sockets.get(socketId)
        if (!s) return
        s.join(roomId)
        s.data.activeRoomId = roomId
        s.emit('match_found', { ...payload, players: payload.players.map((p) => ({ ...p })) })
    })
}

// 자동 매칭 줄에서 빠지기
function handleLeaveMatchmaking(uuid) {
    matchmakingQueue.delete(uuid)
}

module.exports = {
    handleJoinMatchmaking,
    handleLeaveMatchmaking,
}

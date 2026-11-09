// 대기방·매칭 사건 등록 파일
// 방 밖(줄·코드·만들기·목록) + 방 안·초대 사건 받기 등록, matchmaking.js의 registerMatchmakingHandlers가 차례로 부름
const { ROOM_SETTINGS_EVENTS } = require('../../validations/room/updateSettings')
const kickReceiptStore = require('../kickReceiptStore')
const { emitRoomJoinFailed, validateJoinRoomByCodeRequest } = require('./join/guards')
const { handleJoinMatchmaking, handleLeaveMatchmaking } = require('./join/queue')
const { handleUpdateRoomSettings, handleGetRoomSettingsUpdateResult } = require('./settings/handlers')
const { handleSetReady } = require('./room/ready')
const { handleStartGame } = require('./room/start')
const { handleGetPartyMatchingRoom } = require('./join/party')
const { removeFromRoom } = require('./room/leave')
const { handleKickRoomPlayer, handleDeleteRoom } = require('./room/host')
const { handleGetCurrentRoom } = require('./room/reconnect')
const { handleJoinRoomByCode } = require('./join/join')
const { handleJoinPublicRoom, handleGetPublicRooms } = require('./join/publicRooms')
const { handleCreateRoom } = require('./join/create')
const { handleAcceptGameInvite } = require('./admission/accept')
const { handleGetGameInviteResult } = require('./admission/result')
// 점검 중 거절 (방 만들기·시작·코드 입장·자동 매칭만)
const { rejectDuringMaintenance } = require('./join/maintenanceGate')

// 방 지우기 답 함수: 답 함수만 보낸 요청도 받음 (payload 자리에 함수)
function pickDeleteRoomCallback(payload, callback) {
    if (typeof callback === 'function') return callback
    if (typeof payload === 'function') return payload
    return null
}

// 방 밖 사건: 자동 매칭 줄, 코드 입장, 방 만들기·지금 방·다음 방·공개 방 목록·공개 방 입장
// async 처리기는 catch로 에러만 남김 (처리 안 된 거절 막기)
function registerLobbyEvents(io, socket, uuid) {
    // 자동 매칭 줄 서기·빠지기
    socket.on('join_matchmaking', () => {
        if (rejectDuringMaintenance(socket, null)) return undefined
        return handleJoinMatchmaking(io, socket, uuid).catch((err) =>
            console.error('\x1b[31m[매칭 진입 에러]\x1b[0m', err)
        )
    })
    socket.on('leave_matchmaking', () => handleLeaveMatchmaking(uuid))
    // 코드 입장: 요청 모양 틀리면 실패 알림만 보내고 끝 (ack 없는 사건)
    socket.on('join_room_by_code', (payload) => {
        if (rejectDuringMaintenance(socket, null)) return undefined
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
    socket.on('create_room', (payload, callback) => {
        if (rejectDuringMaintenance(socket, typeof callback === 'function' ? callback : () => {})) return undefined
        return handleCreateRoom(io, socket, uuid, payload, callback)
    })
    socket.on('get_current_room', (payload, callback) => handleGetCurrentRoom(uuid, callback))
    socket.on('get_party_matching_room', (payload, callback) =>
        handleGetPartyMatchingRoom(uuid, payload, callback))
    socket.on('get_public_rooms', (payload, callback) => handleGetPublicRooms(callback))
    socket.on('join_public_room', (payload) =>
        handleJoinPublicRoom(io, socket, uuid, payload).catch((err) =>
            console.error('\x1b[31m[공개 방 참가 에러]\x1b[0m', err)
        )
    )
}

// 방 안 행동: 방장 지우기·시작, 준비, 설정 저장·결과 묻기, 나가기, 강퇴
// getCurrentSocketId = 계정의 지금 소켓 id, 옛 탭 요청 거르려고 방장 행동·설정·시작에 넘김
function registerRoomEvents(io, socket, uuid, getCurrentSocketId) {
    socket.on('delete_room', (payload, callback) =>
        handleDeleteRoom(io, uuid, {
            socket,
            callback: pickDeleteRoomCallback(payload, callback),
            getCurrentSocketId,
        }))
    socket.on('start_game', (payload, callback) => {
        if (rejectDuringMaintenance(socket, typeof callback === 'function' ? callback : () => {})) return undefined
        return handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId).catch((err) =>
            console.error('\x1b[31m[게임 시작 에러]\x1b[0m', err)
        )
    })
    socket.on('set_ready', (payload, callback) => handleSetReady(io, socket, uuid, payload, callback))
    socket.on(ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, (payload, callback) =>
        handleUpdateRoomSettings(io, socket, uuid, payload, callback, getCurrentSocketId))
    socket.on(ROOM_SETTINGS_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, (payload, callback) =>
        handleGetRoomSettingsUpdateResult(uuid, payload, callback, socket, getCurrentSocketId))
    socket.on('leave_room',        () => removeFromRoom(io, socket, uuid))
    socket.on(kickReceiptStore.KICK_EVENTS.KICK_ROOM_PLAYER, (payload, callback) =>
        handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId))
}

// 초대 수락·결과 묻기: 터지면 ack로 실패 답 (안 하면 화면이 답을 계속 기다림)
function registerInviteEvents(io, socket, uuid) {
    socket.on('accept_game_invite', (payload, callback) =>
        handleAcceptGameInvite(io, socket, uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 수락 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'INTERNAL_ERROR', message: '초대를 처리하지 못했습니다.' }) } catch { /* 응답 보내기 실패는 무시 (에러는 위에서 남김) */ }
            }
        })
    )
    socket.on('get_game_invite_result', (payload, callback) =>
        handleGetGameInviteResult(uuid, payload, callback).catch((err) => {
            console.error('\x1b[31m[초대 결과 조회 에러]\x1b[0m', err)
            if (typeof callback === 'function') {
                try { callback({ ok: false, code: 'UNKNOWN' }) } catch { /* 응답 보내기 실패는 무시 (에러는 위에서 남김) */ }
            }
        })
    )
}

module.exports = {
    registerLobbyEvents,
    registerRoomEvents,
    registerInviteEvents,
}

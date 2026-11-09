// 판 띄우기 파일
// 검사 끝난 방으로 판 만들기 → 방 지우기 → 시작 방송, start.js handleStartGame이 부름 (지도 02)
const gameSession = require('../../../game-core/gameSession')
const { playerRoom } = require('../core/state')
const { deps } = require('../core/deps')
const { resolveParticipantSockets } = require('./membership')
const { disposeRoom } = require('./dispose')
const { rememberStartedRoom } = require('../join/startedMarks')
const { emitPublicRoomList } = require('./view')
const e2eGameHooks = require('../../e2e/gameHooks')

// 준비 단계 실패 답 (부를 때마다 새 객체)
const internalErrorResponse = () => ({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })

// 판 띄우기: 준비 → 장부에 넣기 → 방송 → 방장 ack (기다림 없음, 순서 그대로 한 번에)
function launchGame(io, room, roomId, captured, callback) {
    const respond = respondOnce(callback)
    const ready = prepareLaunch(io, roomId, captured, respond)
    if (!ready) return
    if (!commitLaunch(room, roomId, captured, ready.session, respond)) return
    broadcastStart(io, ready)
    respond({ ok: true, gameId: ready.session.id })
}

// 여기부터는 ack 한 번만, 보내다 터져도 처리기는 계속
function respondOnce(callback) {
    let callbackCalled = false
    return (payload) => {
        if (callbackCalled) return
        callbackCalled = true
        try {
            callback(payload)
        } catch (ackErr) {
            console.error('[게임 시작 ack 실패]', ackErr)
        }
    }
}

// 판 넣기 전 준비: 판 만들기 → 받을 소켓 → 사람마다 시작 내용, 하나라도 안 되면 실패 답하고 null
// 판 장부에 넣기 전이라 실패해도 되돌릴 것 없음
function prepareLaunch(io, roomId, captured, respond) {
    let prepared
    try {
        prepared = gameSession.prepareGameSession(captured.room)
    } catch (err) {
        console.error('[GameSession prepare 에러]', err)
        respond(internalErrorResponse())
        return null
    }
    if (!prepared.ok) {
        respond({ ok: false, code: prepared.code, message: '게임을 시작할 수 없습니다.' })
        return null
    }
    // 브라우저 시험(E2E_HOOKS=1, 운영 아님)만: 미리 정한 역할로 바꿔 끼움 (역할별 인원은 그대로, 꺼져 있으면 아무것도 안 함)
    e2eGameHooks.applyRolePresets(prepared.session)

    const uuidToSockets = findParticipantSockets(io, prepared.session, roomId, respond)
    if (!uuidToSockets) return null
    const payloadsByUuid = buildStartPayloads(prepared.session, respond)
    if (!payloadsByUuid) return null
    return { session: prepared.session, uuidToSockets, payloadsByUuid }
}

// 참가자 전원 받을 소켓 있는지 (한 명이라도 없으면 시작 안 함)
function findParticipantSockets(io, session, roomId, respond) {
    let uuidToSockets
    try {
        uuidToSockets = resolveParticipantSockets(io, session.players.keys(), roomId)
    } catch (err) {
        console.error('[게임 시작 소켓 조회 에러]', err)
        respond(internalErrorResponse())
        return null
    }
    const missingUuid = [...session.players.keys()].find((u) => !uuidToSockets.get(u)?.length)
    if (missingUuid) {
        respond({ ok: false, code: 'PARTICIPANT_UNAVAILABLE', message: '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' })
        return null
    }
    return uuidToSockets
}

// 사람마다 시작 내용 미리 만들기 (판 넣은 뒤 터지면 되돌릴 길 없음)
function buildStartPayloads(session, respond) {
    try {
        const payloadsByUuid = new Map()
        for (const u of session.players.keys()) {
            payloadsByUuid.set(u, gameSession.buildGameStartedPayload(session, u))
        }
        return payloadsByUuid
    } catch (err) {
        console.error('[game_started payload 생성 에러]', err)
        respond(internalErrorResponse())
        return null
    }
}

// 여기부터 진짜 바뀜: 판 장부에 넣고 이모지 상태 붙임
// 공통 정리로 방·입장 시도·영수증·우편함·초대 지우고 시작 표시 남김 (터지면 되돌리지 않고 실패만 답함)
function commitLaunch(room, roomId, captured, session, respond) {
    try {
        gameSession.commitGameSession(session)
        session.emojiPaletteByUuid = captured.emojiPaletteByUuid instanceof Map
            ? captured.emojiPaletteByUuid
            : new Map()
        session.emojiRateLimit = new Map()
        room.players.forEach((_, u) => playerRoom.delete(u))
        disposeRoom(roomId, 'ROOM_STARTED')
        rememberStartedRoom(room, session.id)
        return true
    } catch (err) {
        console.error('[GameSession commit 에러 — 상태가 부분 반영됐을 수 있음]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임 시작 처리 중 오류가 발생했습니다.' })
        return false
    }
}

// 소켓에 판 id 적기 → 사람마다 시작 내용 보냄 → 역할 공개 마감 → 공개 목록 새로
function broadcastStart(io, { session, uuidToSockets, payloadsByUuid }) {
    // 소켓에 지금 판 id 적어 둠 (끊김 처리가 어느 판 소켓인지 이걸로 앎)
    for (const sockets of uuidToSockets.values()) {
        for (const s of sockets) {
            s.data.activeGameId = session.id
        }
    }

    // 사람마다 자기 시작 내용 보냄 (하나 실패해도 계속)
    session.players.forEach((_, u) => {
        const payload = payloadsByUuid.get(u)
        for (const s of uuidToSockets.get(u) ?? []) {
            try {
                s.emit('game_started', payload)
            } catch (err) {
                console.error('[game_started 전달 실패]', err)
            }
        }
    })
    // 역할 공개 10초 마감 바로 걸기, 확인 안 기다림 (사용자 결정 2026-11-09, 거는 함수는 gameSession.js가 넣어 줌)
    deps.onGameStarted?.(io, session)
    emitPublicRoomList(io)
}

module.exports = {
    launchGame,
}

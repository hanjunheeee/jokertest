// 판 띄우기 파일
// 검사 끝난 방으로 판 만들기(판 골드 값·추방 횟수 옮겨 담음) → 방 지우기(코드 키는 판 동안 잡아 둠) → 시작 방송 → 옛 판에서 뺀 죽은 사람 알리기, start.js handleStartGame이 부름 (지도 02)
const gameSession = require('../../../game-core/gameSession')
const { playerRoom } = require('../core/state')
const { deps } = require('../core/deps')
const { resolveParticipantSockets } = require('./membership')
const { disposeRoom } = require('./dispose')
const { rememberStartedRoom } = require('../join/startedMarks')
const { copyRoomKicks } = require('./kickLimit')
const { holdRoomCodeForGame } = require('../cluster/roomDirectory')
const { emitPublicRoomList } = require('./view')
const e2eGameHooks = require('../../e2e/gameHooks')
const gameSettings = require('../../../services/ops/gameSettings')
const { logMatchingFlow } = require('../debug/matchingFlowLog')

// 준비 단계 실패 답 (부를 때마다 새 객체)
const internalErrorResponse = () => ({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })

// 판 띄우기: 준비 → 장부에 넣기 → 방송 → 방장 ack (기다림 없음, 순서 그대로 한 번에)
function launchGame(io, room, roomId, captured, callback) {
    logMatchingFlow('launch_game_begin', { roomId, playerCount: room?.players?.size })
    const respond = respondOnce(callback)
    const ready = prepareLaunch(io, roomId, captured, respond)
    if (!ready) {
        logMatchingFlow('launch_game_prepare_failed', { roomId })
        return
    }
    const released = commitLaunch(room, roomId, captured, ready.session, respond)
    if (!released) {
        logMatchingFlow('launch_game_commit_failed', { roomId })
        return
    }
    broadcastStart(io, ready)
    logMatchingFlow('launch_game_broadcast_done', { roomId, gameId: ready.session.id })
    announceReleasedSeats(io, released, ready.uuidToSockets)
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
    // 이 판 끝에 줄 골드를 지금 값으로 적어 둠 (메모리 값이라 DB 안 부름, 판 중에 관리자가 바꿔도 이 판은 그대로)
    prepared.session.goldReward = gameSettings.getGameGoldReward()

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
// 추방 횟수는 판에 옮겨 담음 (방 객체에 묶여 방과 같이 사라짐, 판 끝 뒤 같은 방에서 "추방 3번 기록은 남음")
// 공통 정리로 방·입장 시도·영수증·초대 지우고 시작 표시 남김 (터지면 되돌리지 않고 실패만 답함)
// Node 여러 개면 방 코드 키는 판 동안 잡아 둠 (판 끝에 같은 코드로 방을 다시 열고, 그동안 다른 Node가 그 코드를 못 뽑게)
// 돌려줌: 진행 중 옛 판에서 뺀 죽은 사람 목록 (없으면 []), 실패면 null
function commitLaunch(room, roomId, captured, session, respond) {
    try {
        const released = gameSession.commitGameSession(session)
        session.emojiPaletteByUuid = captured.emojiPaletteByUuid instanceof Map
            ? captured.emojiPaletteByUuid
            : new Map()
        session.emojiRateLimit = new Map()
        if (session.returnRoomSource) session.returnRoomSource.kickCounts = copyRoomKicks(room)
        room.players.forEach((_, u) => playerRoom.delete(u))
        holdRoomCodeForGame(room)
        disposeRoom(roomId, 'ROOM_STARTED')
        rememberStartedRoom(room, session.id)
        return Array.isArray(released) ? released : []
    } catch (err) {
        console.error('[GameSession commit 에러 — 상태가 부분 반영됐을 수 있음]', err)
        respond({ ok: false, code: 'INTERNAL_ERROR', message: '게임 시작 처리 중 오류가 발생했습니다.' })
        return null
    }
}

// 진행 중 옛 판에서 뺀 죽은 사람: 옛 판 사람들에게 참여 변경(방장 넘김 포함)·그 사람 옛 판 채널 떼기
// 판 쪽 방송 함수라 socket/gameSession.js가 넣어 줌 (여기서 require 하면 matchmaking ↔ 판 고리), 던져도 시작 답은 그대로
// 예: released = [{ uuid: 'u3', gameId: 'g-old', departure }] → 옛 판 g-old 채널에 session_participation_changed
function announceReleasedSeats(io, released, uuidToSockets) {
    if (released.length === 0) return
    try {
        deps.onLiveSeatsReleased?.(io, released, uuidToSockets)
    } catch (err) {
        console.error('[새 판 시작 옛 판 정리 실패]', err)
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
                logMatchingFlow('emit_game_started', {
                    gameId: session.id,
                    uuid: u,
                    socketId: s.id,
                })
                s.emit('game_started', payload)
            } catch (err) {
                console.error('[game_started 전달 실패]', err)
                logMatchingFlow('emit_game_started_failed', {
                    gameId: session.id,
                    uuid: u,
                    socketId: s.id,
                    message: err instanceof Error ? err.message : String(err),
                })
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

// 로비 입장 정리 파일 (enter_lobby)
// 로비·방 목록·모드·설정 화면이 들어올 때 그 사람의 끝난 판·대기방 자리·입장 중 표시·매칭 줄을 지움, registerEvents가 붙임 (계획 2-2)
// 진행 중 판의 산 사람은 안 지우고 판 화면으로 돌려보냄, 죽은 사람은 판에서 풀어 줌 (골드는 판 끝에 그대로 받음)
const gameSession = require('../../../game-core/gameSession')
const { deps } = require('../core/deps')
const { pendingRoomTransitions } = require('../core/state')
const { bumpGeneration } = require('../join/transition')
const { handleLeaveMatchmaking } = require('../join/queue')
const { findAllLiveSockets } = require('./membership')
const { commitRoomDeparture, notifyRoomDeparture } = require('./leave')
const { cleanupRoomStateForSessionParticipants } = require('./sessionCleanup')

// 판 쪽 정리 함수 (socket/gameSession 쪽이 넣어 줌, 여기서 require 하면 matchmaking ↔ 판 고리가 생겨서)
// applyParticipantDeparture = 판에서 나가기 반영·방송, leaveEndedSession = 끝난 판에서 빼기, detachFromGameChannel = 판 채널 떼기
const gameHooks = { applyParticipantDeparture: null, leaveEndedSession: null, detachFromGameChannel: null }
let missingHookWarned = false

// 판 쪽 정리 함수 넣기 (socket/gameSession.js가 불러올 때 한 번)
function setLobbyEntryHooks(hooks) {
    Object.assign(gameHooks, hooks)
}

// 판 쪽 함수가 안 들어왔으면 처음 한 번만 로그 (판 정리만 건너뛰고 대기방 정리는 계속)
function hasGameHook(name) {
    if (typeof gameHooks[name] === 'function') return true
    if (!missingHookWarned) {
        missingHookWarned = true
        console.error('[로비 입장 정리] 판 쪽 정리 함수가 안 들어옴, 판 정리는 건너뜀', { hook: name })
    }
    return false
}

// 밀린 옛 창이 새 창 자리를 지우지 않게 계정의 지금 소켓일 때만 (접속 목록 없는 시험은 통과)
function isCurrentSocket(socket, uuid) {
    const registry = deps.onlineUsersRegistry
    if (!(registry instanceof Map)) return true
    return typeof socket?.id === 'string' && registry.get(uuid) === socket.id
}

// 진행 중 판에서 이 사람 모습: { session, alive } 또는 진행 중 판에 참여 중이 아니면 null
// 끝난 판·기권·이미 나간 사람은 null (끝난 판은 아래 따로 정리)
function findLiveSeat(uuid) {
    const session = gameSession.getActiveSessionForDeparture(uuid)
    if (!session || session.phase === 'ENDED') return null
    return { session, alive: session.players.get(uuid)?.alive === true }
}

// 죽은 사람 판에서 풀기: 죽은 뒤 나가기와 같은 처리(기권 명단만, 편 결과·골드 그대로) → 판 채널 떼기 → 남겨 둔 방장 자리 정리
function releaseDeadSeat(io, socket, uuid, session) {
    if (!hasGameHook('applyParticipantDeparture')) return false
    const departed = gameHooks.applyParticipantDeparture(io, session, uuid, { reason: 'PLAYER_LEFT' })
    if (!departed?.ok) return false
    if (hasGameHook('detachFromGameChannel')) {
        gameHooks.detachFromGameChannel(socket, uuid, session.channelId, '[로비 입장 판 채널 떼기 실패]', { gameId: session.id })
    }
    cleanupRoomStateForSessionParticipants(io, [uuid])
    return true
}

// 끝난 판 묶임 풀기 (결과 화면에 남은 채 로비로 옴), 남겨 둔 방장 자리면 다음 사람에게 넘어감
function leaveEndedSeat(io, socket, uuid) {
    const endedGameId = gameSession.getEndedGameId(uuid)
    if (!endedGameId || !hasGameHook('leaveEndedSession')) return false
    return gameHooks.leaveEndedSession(io, uuid, 'LOBBY_ENTERED', endedGameId, { socket })?.ok === true
}

// 처리 중 요청 되돌리기: 세대 번호 올려 먼저 보낸 방 만들기·입장·초대 수락·매칭이 확정 못 하게, 매칭 줄에서도 뺌
// 로비에 온 뒤 보낸 요청은 새 세대 번호로 시작해서 안 막힘 (같은 소켓은 보낸 차례대로 받음)
function cancelPendingEntries(uuid) {
    const hadPending = pendingRoomTransitions.has(uuid)
    bumpGeneration(uuid)
    handleLeaveMatchmaking(uuid)
    return hadPending
}

// 대기방 자리·초대 입장 시도 빼기 ("방 나가기"와 같음, 15초 유예 없음), 방장이면 다음 사람이 방장, 혼자면 방 없어짐
// 이 Node의 내 소켓 전부 방 채널에서 뗌 (새 탭은 접속 때 옛 탭 방 채널에 다시 붙어 있음)
function leaveRoomSeat(io, socket, uuid) {
    const outcome = commitRoomDeparture(io, socket, uuid, 'LOBBY_ENTERED')
    const sockets = findAllLiveSockets(io, uuid)
    if (socket && !sockets.includes(socket)) sockets.push(socket)
    notifyRoomDeparture(io, outcome, sockets)
    return outcome.removed === true
}

// 한 단계가 던져도 다음 단계는 계속 (로그만), 통과면 그 단계 결과
function runStep(label, run) {
    try {
        return run() === true
    } catch (err) {
        console.error(label, err)
        return false
    }
}

// 로비 입장 (enter_lobby, 보내는 값 없음): 몇 번 불러도 결과 같음 (지울 것이 없으면 아무것도 안 씀), DB 안 부름
// 답: { ok:true, redirect:'INGAME', gameId } 산 채로 진행 중 판 / { ok:true, redirect:null, gameId:null, cleared } 정리 끝
//     { ok:false, code:'NOT_CURRENT_SOCKET' } 밀린 옛 창
// cleared 예: { liveGame:false, endedGame:true, room:false, pending:false } → 끝난 판에서만 빠짐
function handleEnterLobby(io, socket, uuid, callback) {
    const respond = (body) => {
        if (typeof callback !== 'function') return
        try { callback(body) } catch (err) { console.error('[로비 입장 ack 실패]', err) }
    }
    if (!isCurrentSocket(socket, uuid)) {
        respond({ ok: false, code: 'NOT_CURRENT_SOCKET' })
        return
    }

    // 산 채로 진행 중 판: 아무것도 안 지우고 판 화면으로 (실수로 로비 주소·뒤로 가기 → 탈주 막기)
    const live = findLiveSeat(uuid)
    if (live?.alive) {
        respond({ ok: true, redirect: 'INGAME', gameId: live.session.id })
        return
    }

    const cleared = {
        liveGame: live ? runStep('[로비 입장 죽은 사람 판 풀기 실패]', () => releaseDeadSeat(io, socket, uuid, live.session)) : false,
        endedGame: runStep('[로비 입장 끝난 판 빼기 실패]', () => leaveEndedSeat(io, socket, uuid)),
        pending: runStep('[로비 입장 처리 중 요청 되돌리기 실패]', () => cancelPendingEntries(uuid)),
        room: runStep('[로비 입장 대기방 빼기 실패]', () => leaveRoomSeat(io, socket, uuid)),
    }
    respond({ ok: true, redirect: null, gameId: null, cleared })
}

module.exports = {
    setLobbyEntryHooks,
    handleEnterLobby,
}

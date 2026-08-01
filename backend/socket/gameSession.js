const { randomUUID } = require('node:crypto')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('./matchmaking')

// game-core가 내부 진단용으로만 반환하는 코드다(registry 불일치 등, 정상 경로에서는
// 발생하지 않아야 함). 클라이언트에는 내부 상태를 노출하지 않고 항상 INTERNAL_ERROR로
// 정규화해 응답한다.
const INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT'])

// JOKER 채팅 전용 internal-only 코드. 기존 INTERNAL_ONLY_CODES(모든 handleX가 공유하는
// registry-불일치 코드)와 의미가 섞이지 않도록 별도 상수로 둔다 — INVALID_CLOCK_VALUE는
// 기존 두 핸들러가 반환하지 않는 코드다.
const JOKER_CHAT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'INVALID_CLOCK_VALUE'])

// resolve_night 전용 internal-only 코드. 기존 두 상수와 마찬가지로 의미가 다른 내부 코드
// 집합을 공용 INTERNAL_ONLY_CODES와 섞지 않기 위해 별도로 둔다 — TARGET_NOT_A_PARTICIPANT는
// 다른 핸들러가 반환하지 않는 이 이벤트만의 코드다.
const RESOLVE_NIGHT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

// resolve_day_vote 전용 internal-only 코드. RESOLVE_NIGHT_INTERNAL_ONLY_CODES와 동일한 3개
// registry-불일치 코드를 쓴다(별도 상수로 두는 이유도 동일 — 의미가 다른 내부 코드 집합을
// 공용 INTERNAL_ONLY_CODES와 섞지 않기 위함).
const RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

/**
 * callback을 항상 안전하게 호출한다 — callback 자체가 던지는 예외가 이후 로직(방송 등)을
 * 막지 않게 한다. acknowledge_role_reveal과 leave_game_session이 공유한다(둘 다 비밀 역할
 * 데이터를 다루지 않으므로 raw Error를 그대로 로그해도 안전하다 — submit_night_action/
 * submit_joker_chat_message는 그렇지 않아 별도의 고정 구조 로거를 쓴다).
 */
function respond(callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[ack 전달 실패]', err)
    }
}

/**
 * ROLE_REVEAL 역할 확인 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * 전원이 확인하면(game-core가 transitioned:true를 돌려주면) NIGHT 전이를 참가자 전체
 * channel에 한 번만 방송합니다. callback과 broadcast는 서로 독립적인 best-effort 통지라
 * respond()가 callback의 예외를 삼켜, 콜백이 던지더라도 아래 broadcast는 항상 실행됩니다
 * (onDisconnect의 "알림 전송과 channel 정리를 분리된 try 블록에 둔다"는 기존 관례와 동일한
 * 이유).
 */
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.acknowledgeRoleReveal(uuid, gameId)
    } catch (err) {
        console.error('[역할 확인 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            // 원본 코드와 uuid/gameId만 서버 로그에 남기고, role 등 비밀 정보는 이 함수
            // 어디에서도 로그로 남기지 않는다(result.session 자체를 로그에 넘기지 않음).
            console.error('[역할 확인 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respond(callback, { ok: true })

    if (result.transitioned) {
        try {
            io.to(result.session.channelId).emit('game_phase_changed', gameSessionCore.buildPhaseChangedPayload(result.session))
        } catch (err) {
            console.error('[phase 변경 알림 전송 실패]', err)
        }
    }
}

/**
 * submit_night_action 전용 ack 전달 헬퍼. 공용 respond()(위)는 acknowledge_role_reveal에서만
 * 쓰고 여기서는 재사용하지 않는다 — respond()는 callback이 throw할 때 원본 Error를 그대로
 * 로그하는데, 이 이벤트는 밤 행동이라는 비밀 데이터를 다루므로 그보다 엄격한 고정 구조 로그를
 * 쓴다. trustedGameId는 client가 보낸 원본 payload.gameId가 아니라 game-core가 registry
 * 조회로 직접 확인한 session.id(성공 경로)이거나 undefined(그 외 모든 경로)여야 한다 — 이
 * 함수 자체는 그 값이 어디서 왔는지 모르고 그대로 로그에 쓰기만 한다.
 */
function respondNightAction(uuid, trustedGameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 제출 ack 전달 실패]', { code: 'CALLBACK_ERROR', uuid, gameId: trustedGameId })
    }
}

/**
 * NIGHT 밤 행동 제출 요청을 처리합니다(Socket.IO acknowledgement 방식). acknowledge_role_reveal과
 * 달리 phase 전환을 일으키지 않으므로 브로드캐스트가 전혀 없습니다 — 제출자 본인에게만 ack를
 * 돌려줍니다.
 *
 * 로그의 gameId는 client가 보낸 원본 문자열을 절대 쓰지 않습니다. game-core가 성공
 * ({ ok:true, gameId: session.id })을 반환한 경로에서만 그 canonical session.id를 로그
 * 컨텍스트로 쓰고, 그 외 모든 경로(payload 검증 실패·일반 예외·registry 불일치를 포함한 모든
 * 실패)는 gameId: undefined로 고정합니다 — client가 trim으로 검증은 통과시키면서 앞뒤에
 * 개행·공백을 두른 문자열을 보내도 그 원본이 로그에 실리지 않게 하기 위함입니다.
 */
function handleSubmitNightAction(uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitNightAction(uuid, gameId, targetId)
    } catch (err) {
        console.error('[밤 행동 제출 처리 에러]', { code: 'UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondNightAction(uuid, undefined, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[밤 행동 제출 registry 불일치]', { code: result.code, uuid, gameId: undefined })
            respondNightAction(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondNightAction(uuid, undefined, callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 성공 — result.gameId는 game-core가 registry에서 조회한 canonical session.id다(client
    // 원본 payload.gameId가 아님). client에게 보내는 payload에는 포함하지 않는다.
    respondNightAction(uuid, result.gameId, callback, { ok: true })
}

/**
 * submit_joker_chat_message 전용 ack 전달 헬퍼. respondNightAction과 동일한 이유로 고정
 * 구조 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondJokerChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * 특정 GameSession에서 "지금 실제로 메시지를 받을 수 있는" JOKER 팀 소켓만 골라 반환합니다.
 * matchmaking.js의 resolveParticipantSockets와 동일한 3조건(참가자 소속·connected===true·
 * 대상 channel 가입)을 쓰지만, 대상 uuid 집합을 role(JOKER 진영)로 걸러야 하므로 session.players
 * 에서 직접 유도합니다 — 전용 room이 없으므로 매 전송마다 재계산합니다(세션 최대 10명이라
 * 성능 문제가 없습니다).
 */
function resolveJokerTeammateSockets(io, session) {
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        const uuid = s.data?.user?.uuid
        if (!uuid) continue
        const player = session.players.get(uuid)
        if (!player) continue
        if (gameSessionCore.ROLE_TEAMS[player.role] !== 'JOKER') continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(session.channelId)) continue
        sockets.push(s)
    }
    return sockets
}

/**
 * 특정 GameSession의 "지금 실제로 메시지를 받을 수 있는" 참가자 전체 소켓을 반환합니다.
 * resolveJokerTeammateSockets와 동일한 3조건(참가자 소속·connected===true·대상 channel
 * 가입)을 쓰지만, JOKER team 필터가 없다는 점만 다릅니다(전체 참가자 대상 안전 이벤트용).
 */
function resolveSessionParticipantSockets(io, session) {
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        const uuid = s.data?.user?.uuid
        if (!uuid) continue
        if (!session.players.has(uuid)) continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(session.channelId)) continue
        sockets.push(s)
    }
    return sockets
}

/**
 * NIGHT 단계 JOKER 전용 채팅 메시지 제출을 처리합니다(Socket.IO acknowledgement 방식).
 * deps.prepare/deps.commit/deps.resolveTeammateSockets/deps.idFn을 주입할 수 있습니다 —
 * production 기본값은 각각 game-core의 prepareJokerChatMessage/commitJokerChatMessage,
 * 이 파일의 resolveJokerTeammateSockets, node:crypto의 randomUUID입니다.
 *
 * 순서: payload 구조 검증 → prepare(어떤 상태도 바꾸지 않음) → 실패 시 internal-only 코드만
 * INTERNAL_ERROR로 정규화 → resolveTeammateSockets → 발신자 포함 확인(참조 동일성) → idFn
 * 호출(resolver·발신자 포함 확인을 전부 통과한 뒤에만 — 실패할 요청이 메시지 ID를 낭비하지
 * 않음) → messageId trim 검증 → commit(유일한 mutation) → ack → 수신자 각각에 개별 emit
 * (하나가 던져도 나머지는 계속 전달).
 *
 * 로그는 예외 없이 console.error('[조커 채팅 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다.
 * err 객체, 사용자가 보낸 텍스트 원문, role/team/nickname, 지목 대상 정보는 로그에 절대
 * 포함하지 않습니다.
 */
function handleSubmitJokerChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareJokerChatMessage
    const commit = deps.commit ?? gameSessionCore.commitJokerChatMessage
    const resolveTeammateSockets = deps.resolveTeammateSockets ?? resolveJokerTeammateSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (JOKER_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            // registry 불일치·시계 이상값은 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[조커 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondJokerChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        // 클라이언트 입력값 검증 실패는 서버 버그가 아니므로 로그하지 않는다(기존 관례와 동일).
        respondJokerChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let teammateSockets
    try {
        teammateSockets = resolveTeammateSockets(io, prepared.session)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = teammateSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[조커 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let rawMessageId
    try {
        rawMessageId = idFn()
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'ID_GENERATION_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        console.error('[조커 채팅 오류]', { code: 'INVALID_MESSAGE_ID', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }
    const messageId = rawMessageId.trim()

    try {
        commit(prepared.session, uuid, prepared.sentAt)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondJokerChat(uuid, prepared.session.id, callback, { ok: true })

    for (const teammateSocket of teammateSockets) {
        try {
            teammateSocket.emit('joker_chat_message', {
                gameId: prepared.session.id,
                senderUuid: prepared.actorUuid,
                text: prepared.sanitizedText,
                messageId,
                sentAt: prepared.sentAt,
            })
        } catch (err) {
            console.error('[조커 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: prepared.actorUuid, gameId: prepared.session.id })
        }
    }
}

/**
 * resolve_night 전용 ack 전달 헬퍼. respondNightAction/respondJokerChat과 동일한 이유로
 * 고정 구조 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveNight(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * NIGHT 행동 결과 판정 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * deps.prepare/deps.commit/deps.resolveParticipantSockets를 주입할 수 있습니다 — production
 * 기본값은 각각 game-core의 prepareNightResolution/commitNightResolution, 이 파일의
 * resolveSessionParticipantSockets입니다.
 *
 * 순서: payload 구조 검증 → prepare(어떤 상태도 바꾸지 않음) → 실패 시 internal-only 코드만
 * INTERNAL_ERROR로 정규화 → commit(유일한 mutation) → ack({ok:true}) → 참가자 전체에게
 * night_actions_resolved 개별 emit → 같은 루프에서 GUARD/WITCH_HUNTER 본인에게만
 * night_action_result 개별 emit. commit 이후의 모든 단계는 ack를 이미 보낸 뒤이므로 실패해도
 * rollback하지 않고 추가 응답도 만들지 않는다(로그만 남긴다).
 *
 * 로그는 예외 없이 console.error('[밤 행동 판정 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다. raw
 * Error, 판정 결과(암살 후보·보호 대상·개인 결과 등), nightActions는 로그에 절대 포함하지
 * 않습니다.
 */
function handleResolveNight(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareNightResolution
    const commit = deps.commit ?? gameSessionCore.commitNightResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_NIGHT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[밤 행동 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveNight(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveNight(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let applied
    try {
        applied = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveNight(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondResolveNight(uuid, prepared.session.id, callback, { ok: true })

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        return
    }

    // commit(=commitNightResolution)이 이미 phase/dayIndex를 갱신한 뒤의 session을 받는다 —
    // recipient마다 동일한 payload이므로 루프 밖에서 한 번만 만들어 재사용한다.
    const nightResultAppliedPayload = gameSessionCore.buildNightResultAppliedPayload(prepared.session, applied.victimUuid)

    for (const recipientSocket of recipients) {
        try {
            recipientSocket.emit('night_actions_resolved', { gameId: prepared.session.id, dayIndex: prepared.resolution.dayIndex })
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
        }

        const recipientUuid = recipientSocket.data?.user?.uuid
        const privateResult = prepared.resolution.privateResults.get(recipientUuid)
        if (privateResult !== undefined) {
            try {
                recipientSocket.emit('night_action_result', {
                    gameId: prepared.session.id,
                    dayIndex: prepared.resolution.dayIndex,
                    ...privateResult,
                })
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'PRIVATE_DELIVERY_ERROR', uuid, gameId: prepared.session.id })
            }
        }

        try {
            recipientSocket.emit('night_result_applied', nightResultAppliedPayload)
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
        }
    }
}

/**
 * DAY 투표/기권 제출 요청을 처리합니다(Socket.IO acknowledgement 방식). handleAcknowledgeRoleReveal과
 * 동일한 골격(payload 검증 → core 호출 try/catch → internal-only 코드 정규화 → respond())을
 * 따르되, 이번 슬라이스는 집계·전이가 없으므로 broadcast 블록 없이 ack만으로 끝납니다.
 *
 * uuid는 인증된 socket에서 전달받은 값만 쓰고, payload의 uuid/role/alive/phase는 아예 읽지
 * 않습니다(core가 registry 기준으로 다시 전부 검증합니다).
 */
function handleSubmitDayVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, targetId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (targetId !== null && typeof targetId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.submitDayVote(uuid, gameId, targetId)
    } catch (err) {
        console.error('[낮 투표 제출 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[낮 투표 제출 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    respond(callback, { ok: true })
}

/**
 * resolve_day_vote 전용 ack 전달 헬퍼. respondResolveNight과 동일한 이유로 고정 구조 로그를
 * 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveDayVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * DAY 투표 판정 요청을 처리합니다(Socket.IO acknowledgement 방식). handleResolveNight과 동일한
 * 골격(payload 검증 → prepare → internal-only 코드 정규화 → commit → ack → 참가자 전체 방송)을
 * 따르되, 이미 판정된 dayIndex의 재요청(prepared.alreadyResolved)은 재commit·재방송 없이
 * ack만 돌려준다는 점이 다르다.
 *
 * 로그는 예외 없이 console.error('[낮 투표 판정 오류]', {code, uuid, gameId}) 3키만 쓰고,
 * canonical session.id를 아직 모르는 실패는 gameId: undefined를 명시적으로 포함합니다. raw
 * Error, 판정 결과(투표자별 대상 등), dayVotes는 로그에 절대 포함하지 않습니다.
 */
function handleResolveDayVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareDayVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitDayVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[낮 투표 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    if (prepared.alreadyResolved) {
        // 이미 판정된 dayIndex에 대한 재요청 — 멱등하게 ack만 돌려주고 재commit·재방송하지 않는다.
        respondResolveDayVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: prepared.resolution.gameId,
            dayIndex: prepared.resolution.dayIndex,
            outcome: prepared.resolution.outcome,
            tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
        })
        return
    }

    try {
        commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondResolveDayVote(uuid, prepared.session.id, callback, {
        ok: true,
        gameId: prepared.resolution.gameId,
        dayIndex: prepared.resolution.dayIndex,
        outcome: prepared.resolution.outcome,
        tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
    })

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        return
    }

    const dayVoteResolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(prepared.session, prepared.resolution)

    for (const recipientSocket of recipients) {
        try {
            recipientSocket.emit('day_vote_resolved', dayVoteResolvedPayload)
        } catch (err) {
            console.error('[낮 투표 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
        }
    }
}

/**
 * GameSession 종료 core(endGameSessionForPlayer)가 성공한 직후 공통으로 수행하는 뒷정리.
 * disconnect·명시적 이탈 두 경로가 모두 이 함수 하나만 거치므로 "종료·방송은 한 번뿐"이라는
 * 계약이 자연히 지켜진다.
 *
 * 세 단계(matchmaking 정리 → game_ended 방송 → channel 정리)는 서로 독립적인 best-effort
 * 작업이라 각각 분리된 try 블록에 둔다 — 하나가 던져도 나머지 정리가 막히지 않아야 한다
 * (알림 emit 또는 channel 정리가 실패해도 registry 정리는 이미 끝난 채로 남는다).
 *
 * matchmaking 정리는 종료 core 호출과 동일한 동기 구간에서 실행돼야 하므로(중간에 다른
 * 요청이 gameRooms/playerRoom을 건드릴 수 없어야 함), 호출자는 이 함수를
 * endGameSessionForPlayer 성공 직후 await 없이 즉시 호출해야 한다.
 */
function finalizeGameSessionEnd(io, session, reason) {
    try {
        matchmaking.cleanupRoomStateForSessionParticipants(io, [...session.players.keys()])
    } catch (err) {
        console.error('[GameSession 종료 시 matchmaking 정리 실패]', err)
    }

    try {
        io.to(session.channelId).emit('game_ended', { gameId: session.id, reason })
    } catch (err) {
        console.error('[GameSession 종료 알림 전송 실패]', err)
    }

    try {
        // 명시적 이탈의 경우 이탈한 소켓 자신도 아직 channel에 남아있어 이 호출로 함께
        // 정리된다. disconnect의 경우 그 소켓은 Socket.IO가 이미 자동으로 모든 room에서
        // 내보낸 뒤라 이 호출과 무관하다 — 두 경로 모두 아직 channel에 남아있는 나머지
        // 참가자들의 소켓을 명시적으로 내보내 승계했던 channel 멤버십을 정리한다.
        io.in(session.channelId).socketsLeave(session.channelId)
    } catch (err) {
        console.error('[GameSession channel 정리 실패]', err)
    }
}

/**
 * leave_game_session 명시적 이탈 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * UUID는 socket.data.user.uuid(인증된 신원)만 쓰고, payload에서는 gameId만 읽습니다 —
 * roomId/role/team/nickname 등 다른 필드는 신뢰하지 않고 아예 읽지 않습니다.
 *
 * game-core(endGameSessionForPlayer)가 이미 registry 기준으로 ABA를 방지하므로(요청
 * gameId가 uuid의 현재 활성 세션과 다르면 STALE_SESSION_MISMATCH), 이 함수는 실패 코드가
 * NOT_IN_SESSION/STALE_SESSION_MISMATCH일 때 둘 다 "이미 그 게임에서는 나가 있음"과
 * 동치로 보고 멱등하게 성공 응답한다 — 다른(어쩌면 새로 시작된) 세션을 여기서 잘못
 * 건드리지 않는다.
 */
function handleLeaveGameSession(io, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const normalizedGameId = gameId.trim()
    if (!normalizedGameId) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PLAYER_LEFT', normalizedGameId)
    } catch (err) {
        console.error('[게임 이탈 처리 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        respond(callback, { ok: true })
        return
    }

    respond(callback, { ok: true })
    finalizeGameSessionEnd(io, result.session, result.reason)
}

/** ROLE_REVEAL 확인·NIGHT 행동 제출·JOKER 채팅·명시적 이탈 이벤트 배선을 담당합니다(턴/페이즈 등 이후 동기화는 다음 슬라이스의 몫). */
function registerGameHandlers(io, socket, uuid) {
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
    socket.on('submit_night_action', (payload, callback) => handleSubmitNightAction(uuid, payload, callback))
    socket.on('submit_joker_chat_message', (payload, callback) => handleSubmitJokerChatMessage(io, socket, uuid, payload, callback))
    socket.on('resolve_night', (payload, callback) => handleResolveNight(io, socket, uuid, payload, callback))
    socket.on('cast_day_vote', (payload, callback) => handleSubmitDayVote(io, socket, uuid, payload, callback))
    socket.on('resolve_day_vote', (payload, callback) => handleResolveDayVote(io, socket, uuid, payload, callback))
    socket.on('leave_game_session', (payload, callback) => handleLeaveGameSession(io, uuid, payload, callback))
}

/**
 * 참가자 disconnect에 따른 GameSession 정리를 처리합니다.
 * 정책(사용자 확정): 참가자 한 명의 disconnect만으로 그 GameSession 전체를 즉시
 * 종료합니다 — 부분 유지나 재접속 유예는 이번 슬라이스에 없습니다.
 *
 * ABA 방지: 게임 시작 시 참가자 Socket에 결합해 둔 canonical gameId(socket.data.activeGameId,
 * matchmaking.js의 handleStartGame이 설정)를 expectedGameId로 종료 core에 전달한다. 결합이
 * 없는 Socket(한 번도 게임에 참여한 적 없는 Socket)의 disconnect는 애초에 종료 core를
 * 호출하지 않는다 — 세션 A를 명시적으로 종료한 뒤에도 이 결합은 지워지지 않고 A를 가리킨
 * 채로 남으므로(handleLeaveGameSession 참고), 같은 uuid가 다른 Socket으로 세션 B를 새로
 * 시작한 뒤 도착하는 이 Socket의 지연 disconnect는 STALE_SESSION_MISMATCH로 조용히
 * no-op된다. 같은 Socket이 이후 새 세션을 시작하면 결합값이 그 세션으로 갱신되므로(다시
 * matchmaking.js의 handleStartGame), 그 이후의 disconnect는 정상적으로 새 세션을 종료한다.
 *
 * game_ended payload는 { gameId, reason }만 담습니다. 수신자에 따라 달라지는 값이
 * 없으므로(참가자 uuid/nickname/role 등 어떤 식별 정보도 없음) game_started처럼
 * 참가자별로 다른 payload를 개별 전달할 필요가 없습니다 — 이미 남은 참가자들이 전부
 * 가입해 있는 기존 channel(session.channelId)에 한 번만 방송하면 충분하고, 이 편이
 * 더 단순하고 정확합니다.
 */
async function onDisconnect(io, socket, uuid) {
    const expectedGameId = socket?.data?.activeGameId
    if (expectedGameId === undefined) return

    let result
    try {
        result = gameSessionCore.endGameSessionForPlayer(uuid, 'PARTICIPANT_LEFT', expectedGameId)
    } catch (err) {
        console.error('[GameSession 종료 처리 에러]', err)
        return
    }
    if (!result.ok) return

    finalizeGameSessionEnd(io, result.session, result.reason)
}

module.exports = {
    registerGameHandlers,
    onDisconnect,
    // 테스트에서 socket.on 배선 없이 핸들러를 직접 호출하기 위한 통로입니다(matchmaking.js의
    // __testables 관례와 동일). 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        handleAcknowledgeRoleReveal,
        handleSubmitNightAction,
        handleSubmitJokerChatMessage,
        handleResolveNight,
        handleSubmitDayVote,
        handleResolveDayVote,
        handleLeaveGameSession,
        resolveJokerTeammateSockets,
        resolveSessionParticipantSockets,
    },
}

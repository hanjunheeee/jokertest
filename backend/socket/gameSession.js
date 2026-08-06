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

// submit_game_chat_message(공개 DAY / 사망자 전용) 전용 internal-only 코드. JOKER 채팅의 3개에
// INVALID_CHAT_CHANNEL을 더한다 — 채널은 서버가 canonical 상태에서만 유도하므로, 알 수 없는
// 채널이 나왔다는 것은 클라이언트 입력이 아니라 서버 내부 상태 손상 신호다. 메시지 ID 생성
// 실패(ID_GENERATION_ERROR/INVALID_MESSAGE_ID)도 같은 이유로 내부 신호다 — 클라이언트 입력이
// 닿지 않는 서버 자체의 ID 생성기 문제이므로 코드를 그대로 노출하지 않는다.
const GAME_CHAT_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'INVALID_CLOCK_VALUE',
    'INVALID_CHAT_CHANNEL',
    'ID_GENERATION_ERROR',
    'INVALID_MESSAGE_ID',
])

// commitGameChatMessage 실패 시 클라이언트에 그대로 알려도 되는 코드. commit은 prepare가 방금
// 통과시킨 요청을 canonical 상태에서 처음부터 다시 검증하므로, 정상 경로에서 실패하는 유일한
// 이유는 "그 사이 게임이 끝났다"뿐이다 — UI가 이 상황에는 반응해야 하므로 그대로 전달한다.
// 그 외 모든 commit 실패(세션 동일성·멤버십·채널 라우팅·타임스탬프 재검증 실패)는 경쟁 상태이거나
// prepared 데이터 변조 신호이므로 내부 코드를 노출하지 않고 INTERNAL_ERROR로 정규화한다.
const GAME_CHAT_COMMIT_PUBLIC_CODES = new Set(['GAME_ALREADY_ENDED'])

// 채널 → 수신 이벤트명. 클라이언트가 고른 값이 아니라 game-core가 유도한 채널로만 인덱싱된다.
const CHAT_EVENT_BY_CHANNEL = Object.freeze({
    DAY: 'day_chat_message_received',
    DEAD: 'dead_chat_message_received',
})

// resolve_night 전용 internal-only 코드. 기존 두 상수와 마찬가지로 의미가 다른 내부 코드
// 집합을 공용 INTERNAL_ONLY_CODES와 섞지 않기 위해 별도로 둔다 — TARGET_NOT_A_PARTICIPANT는
// 다른 핸들러가 반환하지 않는 이 이벤트만의 코드다.
const RESOLVE_NIGHT_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

// resolve_day_vote 전용 internal-only 코드. RESOLVE_NIGHT_INTERNAL_ONLY_CODES와 동일한 3개
// registry-불일치 코드를 쓴다(별도 상수로 두는 이유도 동일 — 의미가 다른 내부 코드 집합을
// 공용 INTERNAL_ONLY_CODES와 섞지 않기 위함).
const RESOLVE_DAY_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TARGET_NOT_A_PARTICIPANT'])

// cast_tribunal_vote 전용 internal-only 코드. 앞의 세 상수와 동일한 이유로 별도 상수로 둔다 —
// TRIBUNAL_STATE_NOT_FOUND/TRIBUNAL_CONTEXT_MISMATCH/TRIBUNAL_RESOLUTION_MISMATCH는 서버 내부
// 상태 손상(DAY 판정↔session.tribunal 불일치)에서만 발생하고 클라이언트 입력만으로는 도달할 수
// 없다 — 다른 핸들러가 반환하지 않는 이 이벤트만의 코드다.
const CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set([
    'SESSION_NOT_FOUND',
    'NOT_A_PARTICIPANT',
    'TRIBUNAL_STATE_NOT_FOUND',
    'TRIBUNAL_CONTEXT_MISMATCH',
    'TRIBUNAL_RESOLUTION_MISMATCH',
])

// resolve_tribunal_vote 전용 internal-only 코드. TRIBUNAL_ALREADY_RESOLVED·
// TRIBUNAL_RESOLUTION_MISMATCH·TRIBUNAL_VOTES_INCOMPLETE는 클라이언트가 정상적으로 마주칠 수
// 있는 안정된 공개 코드라 여기서 제외한다(각각 "이미 판정됨", "재검증 실패", "미완료 투표"를
// 그대로 알려줘야 UI가 반응할 수 있다) — SESSION_NOT_FOUND/NOT_A_PARTICIPANT/
// TRIBUNAL_STATE_NOT_FOUND만 서버 내부 상태 손상 신호다.
const RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES = new Set(['SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'TRIBUNAL_STATE_NOT_FOUND'])

// uuid → 현재 canonical socket.id를 담는 socket.js의 onlineUsers Map을 그대로 참조한다(복제하지
// 않음). setOnlineUsersRegistry로 모듈 초기화 시 한 번 주입되며, 그 전까지는 null이라
// isCurrentSocketForUuid가 fail-closed로 항상 false를 반환한다. 이 파일은 이 Map을 절대 쓰지
// 않는다(읽기 전용) — 쓰기는 socket.js(연결/해제 처리)의 책임이다.
let onlineUsersRegistry = null

/** 런타임 진입점(socket.js의 모듈 초기화)에서 onlineUsers registry를 주입한다. */
function setOnlineUsersRegistry(registry) {
    onlineUsersRegistry = registry
}

/**
 * mutation·disconnect 권한을 판정하는 유일한 canonical predicate다. registry에 uuid가
 * 매핑돼 있고 그 값이 정확히 이 socket의 id와 같을 때만 true다 — registry가 아직 주입되지
 * 않았거나(null) Map이 아니거나 socket이 undefined여도 절대 throw하지 않고 항상 false로
 * fail-closed한다. forcedLogout 플래그는 이 predicate의 입력이 아니다(socket.js의
 * handleDisconnect 자체 presence/logout 정리에서만 쓰인다).
 */
function isCurrentSocketForUuid(uuid, socket) {
    return onlineUsersRegistry instanceof Map && onlineUsersRegistry.get(uuid) === socket?.id
}

/**
 * 연결 시점에 socket.data.activeGameId를 registry 기준으로 재바인딩하고, 활성 세션의 channel에
 * 아직 가입돼 있지 않으면 재가입시킨다. 라우팅 정보만 동기화할 뿐 어떤 권한도 부여하지
 * 않는다 — mutation·disconnect 권한은 오직 isCurrentSocketForUuid만 판정한다. 활성 세션이
 * 없으면 아무 것도 하지 않는다(no-op). 이미 가입된 channel에는 다시 join하지 않으므로
 * 동일 socket에 대해 여러 번 호출해도 멱등하다.
 */
async function resyncSessionRouting(socket, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return

    socket.data.activeGameId = routing.gameId
    if (!socket.rooms.has(routing.channelId)) {
        socket.join(routing.channelId)
    }
}

/** 테스트 전용: onlineUsersRegistry를 초기 상태(null)로 되돌립니다. 런타임 코드에서는 호출하지 마세요. */
function __resetStateForTests() {
    onlineUsersRegistry = null
}

/** 테스트 전용: 현재 onlineUsersRegistry 참조를 읽기 전용으로 반환합니다(변형하지 않습니다). */
function __getOnlineUsersRegistryForTests() {
    return onlineUsersRegistry
}

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
 * 전원이 확인하면(game-core가 transitioned:true를 돌려주면) 첫 DAY 전이를 참가자 전체
 * channel에 한 번만 방송합니다 — 방송 대상 channel에는 마지막으로 확인한 본인의 socket도
 * 포함되므로 발신자와 나머지 참가자가 같은 phase 갱신을 정확히 한 번씩 받습니다. 중복·
 * 재요청·늦게 도착한 확인은 game-core가 transitioned:false 또는 INVALID_PHASE로 되돌려
 * 이 분기에 아예 도달하지 않습니다(두 번째 canonical 전이 방송이 없습니다).
 * callback과 broadcast는 서로 독립적인 best-effort 통지라
 * respond()가 callback의 예외를 삼켜, 콜백이 던지더라도 아래 broadcast는 항상 실행됩니다
 * (onDisconnect의 "알림 전송과 channel 정리를 분리된 try 블록에 둔다"는 기존 관례와 동일한
 * 이유).
 */
function handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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
function handleSubmitNightAction(socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondNightAction(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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
 * 특정 GameSession에서 "지금 실제로 그 채널의 메시지를 받을 수 있는" 소켓만 골라 반환합니다.
 * matchmaking.js의 resolveParticipantSockets와 동일한 3조건(참가자 소속·connected===true·
 * 대상 channel 가입)에 더해, 수신 자격 자체(생존/사망/생존한 JOKER 진영)는 game-core의
 * getChatRecipientUuids가 canonical session.players에서 직접 유도한 uuid 집합으로만 판정합니다
 * — 이 함수는 role/alive를 스스로 해석하지 않습니다. 전용 room이 없으므로 매 전송마다
 * 재계산합니다(세션 최대 10명이라 성능 문제가 없습니다).
 *
 * io.sockets.sockets 전체를 순회하지만 session.channelId 가입 여부를 반드시 확인하므로,
 * 다른 GameSession의 소켓이나 채널 밖 소켓은 절대 포함되지 않습니다(io 전역 브로드캐스트 없음).
 */
function resolveChatRecipientSockets(io, session, channel) {
    const eligibleUuids = new Set(gameSessionCore.getChatRecipientUuids(session, channel))
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        const uuid = s.data?.user?.uuid
        if (!uuid) continue
        if (!eligibleUuids.has(uuid)) continue
        if (s.connected !== true) continue
        if (!s.rooms?.has(session.channelId)) continue
        sockets.push(s)
    }
    return sockets
}

/**
 * JOKER 비밀 채팅의 수신자 해석 — 생존한 JOKER 진영 소켓만 반환합니다(사망한 JOKER는
 * getChatRecipientUuids의 JOKER 채널에서 이미 제외되므로 여기서도 절대 포함되지 않습니다).
 */
function resolveJokerTeammateSockets(io, session) {
    return resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.JOKER)
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
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondJokerChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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

    let committed
    try {
        committed = commit(prepared.session, uuid, prepared.sentAt)
    } catch (err) {
        console.error('[조커 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // prepare~commit 사이 다른 이벤트로 세션이 ENDED로 전이됐을 수 있다(신뢰 경계 재검증 실패).
        respondJokerChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
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
 * submit_game_chat_message 전용 ack 전달 헬퍼. respondJokerChat과 동일한 이유로 고정 구조
 * 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다. 채널(생존/사망)은 로그에도 남기지 않는다
 * — 그 자체가 발신자의 생존 여부를 드러내는 canonical 세션 상태이기 때문이다.
 */
function respondGameChat(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * 공개 DAY 채팅과 사망자 전용 채팅의 단일 제출 진입점입니다(Socket.IO acknowledgement 방식).
 * 클라이언트는 { gameId, text }만 보내며 채널을 고르지 않습니다 — 라우팅은 전적으로 game-core의
 * prepareGameChatMessage가 인증 uuid의 canonical 생존 상태와 session.phase에서 유도합니다
 * (생존+DAY → 공개, 사망+NIGHT/DAY/TRIBUNAL → 사망자 전용, 그 외 전부 거부).
 *
 * deps.prepare/deps.commit/deps.resolveRecipientSockets/deps.idFn을 주입할 수 있습니다 —
 * production 기본값은 각각 game-core의 prepareGameChatMessage/commitGameChatMessage,
 * 이 파일의 resolveChatRecipientSockets, node:crypto의 randomUUID입니다. idFn은 이 핸들러가
 * 직접 호출하지 않고 prepare에 그대로 넘깁니다 — messageId는 commit이 대조하는 단일 사용
 * 능력(capability)에 함께 묶여야 하므로 game-core가 만드는 canonical 값입니다.
 *
 * 순서(handleSubmitJokerChatMessage와 동일한 원자성 계약): payload 구조 검증 → prepare(어떤
 * 상태도 바꾸지 않음 — 여기서 sentAt·messageId·공개 메시지가 canonical 값으로 확정되고 능력이
 * 발급된다) → 실패 시 internal-only 코드만 INTERNAL_ERROR로 정규화 → 수신자 해석 → 발신자
 * 포함 확인(참조 동일성) → 이벤트명 해석 → commit(유일한 mutation, prepared 능력 하나만 받아
 * canonical 상태를 처음부터 다시 검증하고 여기서 처음으로 rate limit이 소비된다) → ack
 * → 수신자 각각에 개별 emit(하나가 던져도 나머지는 계속 전달). 즉 검증·수신자 해석이 전부
 * 끝나기 전에는 rate limit이 소비되지 않습니다.
 *
 * 바깥으로 나가는 payload는 commit이 사설 능력 기록에서 돌려준 canonical 메시지를 매 수신자마다
 * 새로 복사한 방어적 객체이고, 키는 정확히
 * {gameId, messageId, senderUuid, nickname, text, sentAt, dayIndex} 7개뿐입니다 — role/team/
 * alive/allies/votes/actions/targets/socket id/rate limit/Room 내부 값은 어디에도 없습니다.
 * 모든 식별·시각·인덱스 값은 canonical 서버 상태에서 왔고 클라이언트 payload에서 오지 않습니다
 * (핸들러가 들고 있는 prepared 번들조차 출처가 아닙니다).
 */
function handleSubmitGameChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareGameChatMessage
    const commit = deps.commit ?? gameSessionCore.commitGameChatMessage
    const resolveRecipientSockets = deps.resolveRecipientSockets ?? resolveChatRecipientSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, text } = payload
    if (typeof gameId !== 'string' || typeof text !== 'string') {
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, text, { idFn })
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (GAME_CHAT_INTERNAL_ONLY_CODES.has(prepared.code)) {
            // registry 불일치·시계 이상값·알 수 없는 채널은 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[게임 채팅 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondGameChat(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        // 클라이언트 입력값 검증 실패는 서버 버그가 아니므로 로그하지 않는다(기존 관례와 동일).
        respondGameChat(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let recipientSockets
    try {
        recipientSockets = resolveRecipientSockets(io, prepared.session, prepared.channel)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const senderIncluded = recipientSockets.some((s) => s === socket)
    if (!senderIncluded) {
        console.error('[게임 채팅 오류]', { code: 'SENDER_NOT_IN_RECIPIENTS', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    const eventName = CHAT_EVENT_BY_CHANNEL[prepared.channel]
    if (typeof eventName !== 'string') {
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_CHANNEL', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    let committed
    try {
        // prepared는 값 가방이 아니라 prepare가 이 요청 하나에만 발급한 단일 사용 능력이다 —
        // 이 핸들러는 그 객체를 만들지도 고치지도 않고 그대로 넘기기만 하고, commit이 모듈
        // 사설 기록과 대조해 정확히 한 번 소모한다(요청 단위 바인딩).
        committed = commit(prepared)
    } catch (err) {
        console.error('[게임 채팅 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // commit이 canonical 상태에서 다시 검증한 결과다 — prepare~commit 사이의 phase 전이·사망·
        // 세션 종료/이탈, 또는 prepared 데이터 변조로 실패할 수 있다. 어느 쪽이든 rate limit Map은
        // 하나도 바뀌지 않은 상태이므로(원자성), 여기서 되돌릴 것은 없고 emit도 하지 않는다.
        if (!GAME_CHAT_COMMIT_PUBLIC_CODES.has(committed.code)) {
            console.error('[게임 채팅 오류]', { code: committed.code, uuid, gameId: prepared.session.id })
            respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 내보낼 값의 유일한 출처는 commit이 사설 능력 기록에서 돌려준 canonical 메시지다 —
    // 핸들러가 들고 있는 prepared의 노출 필드는 쓰지 않는다(그 사이 변조됐다면 commit이 이미
    // 거부했겠지만, 출처를 하나로 묶어 두면 애초에 변조된 값이 나갈 경로 자체가 없다).
    const outbound = committed.message
    if (typeof outbound !== 'object' || outbound === null) {
        // production commit은 성공 시 반드시 canonical 메시지를 돌려주므로 도달하지 않는다.
        console.error('[게임 채팅 오류]', { code: 'INVALID_CHAT_MESSAGE', uuid, gameId: prepared.session.id })
        respondGameChat(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    respondGameChat(uuid, prepared.session.id, callback, { ok: true })

    for (const recipientSocket of recipientSockets) {
        try {
            // 수신자마다 새 객체를 만든다 — 한 수신자가 받은 payload를 변형해도 다른 수신자나
            // canonical 세션 상태에 영향이 없다(방어적 payload).
            recipientSocket.emit(eventName, {
                gameId: outbound.gameId,
                messageId: outbound.messageId,
                senderUuid: outbound.senderUuid,
                nickname: outbound.nickname,
                text: outbound.text,
                sentAt: outbound.sentAt,
                dayIndex: outbound.dayIndex,
            })
        } catch (err) {
            console.error('[게임 채팅 오류]', { code: 'DELIVERY_ERROR', uuid: outbound.senderUuid, gameId: outbound.gameId })
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
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveNight(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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

    if (!applied.ok) {
        // prepare~commit 사이 다른 이벤트로 세션이 ENDED로 전이됐을 수 있다(신뢰 경계 재검증 실패).
        respondResolveNight(uuid, prepared.session.id, callback, { ok: false, code: applied.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // commit(=commitNightResolution)이 이미 phase/dayIndex를 갱신한 뒤의 session을 받는다 —
    // recipient마다 동일한 payload이므로 루프 밖에서 한 번만 만들어 재사용한다. 기존 필드 조립과
    // terminal 필드 병합은 별도 try 블록이다 — 기존 조립이 실패해도 terminal이 있으면 최소
    // payload({phase,winResult,players})는 반드시 broadcast하고, 요청자에게는 INTERNAL_ERROR ACK를 보낸다.
    let nightResultAppliedPayload = null
    try {
        // 공개 사망 reveal은 commit이 canonical resolution에 채워 넣은 목록(실제로 alive→dead로
        // 바뀐 참가자만)을 그대로 실어 나른다 — 소켓 계층은 목록을 만들지도, 고치지도 않는다.
        nightResultAppliedPayload = gameSessionCore.buildNightResultAppliedPayload(
            prepared.session,
            applied.victimUuid,
            prepared.resolution.publicDeathReveals,
        )
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: prepared.session.id })
    }

    if (applied.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(prepared.session)
            nightResultAppliedPayload = nightResultAppliedPayload
                ? { ...nightResultAppliedPayload, ...terminalFields }
                : terminalFields
        } catch (err) {
            console.error('[밤 행동 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid, gameId: prepared.session.id })
        }
    }

    if (!nightResultAppliedPayload) {
        respondResolveNight(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    } else {
        respondResolveNight(uuid, prepared.session.id, callback, { ok: true })
    }

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[밤 행동 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        return
    }

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

        if (nightResultAppliedPayload) {
            try {
                recipientSocket.emit('night_result_applied', nightResultAppliedPayload)
            } catch (err) {
                console.error('[밤 행동 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
            }
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
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveDayVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[낮 투표 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        // prepare~commit 사이 다른 이벤트로 세션이 ENDED로 전이됐을 수 있다(신뢰 경계 재검증 실패).
        respondResolveDayVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
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
 * cast_tribunal_vote 전용 ack 전달 헬퍼. callback이 던져도 예외가 바깥으로 새지 않고, 로그는
 * 항상 {gameId, dayIndex, requesterUuid, internalCode:'CALLBACK_ERROR'} 4필드만 쓴다 — 공용
 * respond()나 다른 이벤트 전용 로거를 재사용하지 않는다(raw Error/session을 로그하지 않기 위함).
 */
function respondCastTribunalVote(gameId, dayIndex, requesterUuid, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid, internalCode: 'CALLBACK_ERROR' })
    }
}

/**
 * TRIBUNAL 유죄/무죄 투표 제출 요청을 처리합니다(Socket.IO acknowledgement 방식).
 * handleSubmitDayVote와 동일한 골격(payload 검증 → core 호출 try/catch → internal-only 코드
 * 정규화 → respond())을 따르되, 로그는 {gameId, dayIndex, requesterUuid, internalCode} 4필드
 * 고정 구조를 쓴다(raw Error/session 없음). 성공 이후 broadcast는 없다(본인에게만 ack).
 *
 * uuid는 registerGameHandlers가 이미 들고 있는 인증된 클로저 값만 쓰고, payload의 uuid류
 * 필드는 아예 읽지 않는다.
 */
function handleCastTribunalVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'STALE_SOCKET',
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondCastTribunalVote(undefined, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    const { gameId, dayIndex, vote } = payload
    if (typeof gameId !== 'string') {
        respondCastTribunalVote(undefined, dayIndex, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondCastTribunalVote(gameId, undefined, uuid, callback, {
            ok: false,
            code: 'INVALID_PAYLOAD',
            message: '잘못된 요청입니다.',
        })
        return
    }

    let result
    try {
        result = gameSessionCore.submitTribunalVote(uuid, gameId, dayIndex, vote)
    } catch (err) {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: 'UNEXPECTED_ERROR' })
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '요청을 처리하지 못했습니다.',
        })
        return
    }

    if (!result.ok) {
        if (CAST_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(result.code)) {
            console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid: uuid, internalCode: result.code })
            respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
                ok: false,
                code: 'INTERNAL_ERROR',
                message: '요청을 처리하지 못했습니다.',
            })
            return
        }
        respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
            ok: false,
            code: result.code,
            message: '요청을 처리할 수 없습니다.',
        })
        return
    }

    respondCastTribunalVote(gameId, dayIndex, uuid, callback, {
        ok: true,
        gameId: result.gameId,
        dayIndex: result.dayIndex,
        vote: result.vote,
    })
}

/**
 * resolve_tribunal_vote 전용 ack 전달 헬퍼. respondResolveDayVote와 동일한 이유로 고정 구조
 * 로그를 쓴다 — callback이 던져도 예외가 바깥으로 새지 않고, 로그는 항상
 * {code:'CALLBACK_ERROR', uuid, gameId} 3키뿐이다.
 */
function respondResolveTribunalVote(uuid, gameId, callback, payload) {
    try {
        callback(payload)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'CALLBACK_ERROR', uuid, gameId })
    }
}

/**
 * TRIBUNAL 판정 요청을 처리합니다(Socket.IO acknowledgement 방식). handleResolveDayVote와
 * 동일한 골격(payload 검증 → prepare → internal-only 코드 정규화 → commit → ack → 참가자
 * 전체 방송)을 따르되, alreadyResolved 멱등 단축 분기는 없다(TRIBUNAL_ALREADY_RESOLVED로 그대로
 * 거부한다) — 그리고 commit 자체가 { ok:false, code }를 반환할 수 있어(신뢰 경계 재검증 실패),
 * 그 경우도 실패 ack로 그대로 이어지고 payload 빌드·broadcast가 없다.
 *
 * deps.prepare/deps.commit/deps.resolveParticipantSockets를 주입할 수 있습니다 — production
 * 기본값은 각각 game-core의 prepareTribunalVoteResolution/commitTribunalVoteResolution, 이
 * 파일의 resolveSessionParticipantSockets입니다.
 */
function handleResolveTribunalVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareTribunalVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitTribunalVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionParticipantSockets

    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId, dayIndex } = payload
    if (typeof gameId !== 'string') {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    if (!Number.isInteger(dayIndex)) {
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let prepared
    try {
        prepared = prepare(uuid, gameId, dayIndex)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined })
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!prepared.ok) {
        if (RESOLVE_TRIBUNAL_VOTE_INTERNAL_ONLY_CODES.has(prepared.code)) {
            console.error('[재판 판정 오류]', { code: prepared.code, uuid, gameId: undefined })
            respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        respondResolveTribunalVote(uuid, undefined, callback, { ok: false, code: prepared.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    let committed
    try {
        committed = commit(prepared.session, prepared.resolution)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'COMMIT_ERROR', uuid, gameId: prepared.session.id })
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!committed.ok) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: committed.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // 기존 필드 조립과 terminal 필드 병합은 별도 try 블록이다 — 기존 조립이 실패해도 terminal이
    // 있으면 최소 payload({phase,winResult,players})는 반드시 broadcast하고, 요청자에게는
    // INTERNAL_ERROR ACK를 보낸다(handleResolveNight과 동일한 정책).
    let resolvedPayload = null
    try {
        resolvedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'PAYLOAD_BUILD_ERROR', uuid, gameId: prepared.session.id })
    }

    let broadcastPayload = resolvedPayload
    if (committed.terminal) {
        try {
            const terminalFields = gameSessionCore.buildTerminalFields(prepared.session)
            broadcastPayload = resolvedPayload ? { ...resolvedPayload, ...terminalFields } : terminalFields
        } catch (err) {
            console.error('[재판 판정 오류]', { code: 'TERMINAL_BUILD_ERROR', uuid, gameId: prepared.session.id })
        }
    }

    if (!resolvedPayload) {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    } else {
        respondResolveTribunalVote(uuid, prepared.session.id, callback, {
            ok: true,
            gameId: resolvedPayload.gameId,
            dayIndex: resolvedPayload.dayIndex,
            outcome: resolvedPayload.outcome,
            counts: resolvedPayload.counts,
            executedUuid: resolvedPayload.executedUuid,
        })
    }

    let recipients
    try {
        recipients = resolveParticipantSockets(io, prepared.session)
    } catch (err) {
        console.error('[재판 판정 오류]', { code: 'RECIPIENT_RESOLVE_ERROR', uuid, gameId: prepared.session.id })
        return
    }

    if (broadcastPayload) {
        for (const recipientSocket of recipients) {
            try {
                recipientSocket.emit('tribunal_vote_resolved', broadcastPayload)
            } catch (err) {
                console.error('[재판 판정 오류]', { code: 'DELIVERY_ERROR', uuid, gameId: prepared.session.id })
            }
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
function handleLeaveGameSession(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
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
    // ENDED 세션은 마지막 참가자가 이탈할 때만(result.sessionDeleted===true) registry에서
    // 실제로 지워진다 — 그 전까지는 세션이 여전히 존재하므로 game_ended 재방송·channel 정리를
    // 하지 않는다(비-ENDED 경로는 core가 항상 sessionDeleted:true를 반환하므로 회귀가 없다).
    if (result.sessionDeleted) {
        finalizeGameSessionEnd(io, result.session, result.reason)
    }
}

/**
 * uuid가 지금 어떤 socket으로든 연결돼 있는지 확인한다(읽기 전용). isCurrentSocketForUuid와
 * 동일한 canonical uuid→socketId 원천(onlineUsersRegistry)을 재사용하지만, "이 socket이
 * uuid의 현재 canonical socket인지"가 아니라 "registry가 가리키는 그 socket이 지금 실제로
 * io에 연결돼 있는지"만 본다 — get_session_snapshot의 roster enrichment 전용이다.
 * resolveSessionParticipantSockets/resolveJokerTeammateSockets(채널 가입 여부까지 요구하는
 * delivery-target 개념)와는 다른 목적이라 재사용하지 않는다.
 */
function isUuidConnected(io, uuid) {
    const socketId = onlineUsersRegistry instanceof Map ? onlineUsersRegistry.get(uuid) : undefined
    if (!socketId) return false
    return io?.sockets?.sockets?.get(socketId)?.connected === true
}

/**
 * get_session_snapshot 요청-ACK 전용 조회 핸들러입니다. 다른 8개 핸들러와 달리
 * assertSessionNotEnded guard는 적용되지 않습니다 — ENDED 이후에도 최종 결과(phase/winResult/
 * players)를 조회할 수 있어야 합니다. 그러나 current-socket 권한(isCurrentSocketForUuid)은
 * 다른 모든 핸들러와 동일하게 최우선으로 검사합니다 — 읽기 전용이라도 재접속으로 교체된 낡은
 * socket이 스냅샷을 조회할 수는 없습니다. uuid는 인증된 socket에서 전달받은 값만 쓰고, payload는
 * 선택적 gameId만 읽습니다(생략 시 검증을 건너뛰고, 주어지면 canonical session.id와 일치해야
 * 합니다 — 공백/빈 문자열도 "생략"이 아니라 불일치로 취급됩니다).
 */
function handleGetSessionSnapshot(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    if (!isCurrentSocketForUuid(uuid, socket)) {
        respond(callback, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
        return
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }
    const { gameId } = payload
    if (gameId !== undefined && typeof gameId !== 'string') {
        respond(callback, { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
        return
    }

    let result
    try {
        result = gameSessionCore.getSessionSnapshotForPlayer(uuid, gameId)
    } catch (err) {
        console.error('[세션 스냅샷 조회 에러]', err)
        respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
        return
    }

    if (!result.ok) {
        if (INTERNAL_ONLY_CODES.has(result.code)) {
            // registry 불일치는 클라이언트에 내부 상태를 노출하지 않고 일반 오류로만 응답한다.
            console.error('[세션 스냅샷 조회 registry 불일치]', { code: result.code, uuid, gameId })
            respond(callback, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
            return
        }
        // GAME_ID_MISMATCH(공백/빈 문자열로 넘어온 경우 포함)는 클라이언트에 그대로 전달한다.
        respond(callback, { ok: false, code: result.code, message: '요청을 처리할 수 없습니다.' })
        return
    }

    // roster에 실시간 연결 여부만 덧붙인다 — canonical snapshot 자체(result.snapshot)는
    // 변형하지 않고 새 배열/객체로 다시 조립한다(defensive copy 유지).
    const players = result.snapshot.players.map((player) => ({
        ...player,
        isConnected: isUuidConnected(io, player.uuid),
    }))

    respond(callback, { ok: true, ...result.snapshot, players })
}

/** ROLE_REVEAL 확인·NIGHT 행동 제출·JOKER 비밀 채팅·공개 DAY/사망자 채팅·명시적 이탈 이벤트 배선을 담당합니다. */
function registerGameHandlers(io, socket, uuid) {
    socket.on('acknowledge_role_reveal', (payload, callback) => handleAcknowledgeRoleReveal(io, socket, uuid, payload, callback))
    socket.on('submit_night_action', (payload, callback) => handleSubmitNightAction(socket, uuid, payload, callback))
    socket.on('submit_joker_chat_message', (payload, callback) => handleSubmitJokerChatMessage(io, socket, uuid, payload, callback))
    socket.on('submit_game_chat_message', (payload, callback) => handleSubmitGameChatMessage(io, socket, uuid, payload, callback))
    socket.on('resolve_night', (payload, callback) => handleResolveNight(io, socket, uuid, payload, callback))
    socket.on('cast_day_vote', (payload, callback) => handleSubmitDayVote(io, socket, uuid, payload, callback))
    socket.on('resolve_day_vote', (payload, callback) => handleResolveDayVote(io, socket, uuid, payload, callback))
    socket.on('cast_tribunal_vote', (payload, callback) => handleCastTribunalVote(io, socket, uuid, payload, callback))
    socket.on('resolve_tribunal_vote', (payload, callback) => handleResolveTribunalVote(io, socket, uuid, payload, callback))
    socket.on('leave_game_session', (payload, callback) => handleLeaveGameSession(io, socket, uuid, payload, callback))
    socket.on('get_session_snapshot', (payload, callback) => handleGetSessionSnapshot(io, socket, uuid, payload, callback))
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
    if (!isCurrentSocketForUuid(uuid, socket)) return

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
    // handleLeaveGameSession과 동일한 이유로, 마지막 참가자 이탈일 때만 실제 정리를 수행한다.
    if (!result.sessionDeleted) return

    finalizeGameSessionEnd(io, result.session, result.reason)
}

module.exports = {
    registerGameHandlers,
    onDisconnect,
    setOnlineUsersRegistry,
    isCurrentSocketForUuid,
    resyncSessionRouting,
    __resetStateForTests,
    __getOnlineUsersRegistryForTests,
    // 테스트에서 socket.on 배선 없이 핸들러를 직접 호출하기 위한 통로입니다(matchmaking.js의
    // __testables 관례와 동일). 런타임 코드에서는 참조하지 않습니다.
    __testables: {
        handleAcknowledgeRoleReveal,
        handleSubmitNightAction,
        handleSubmitJokerChatMessage,
        handleSubmitGameChatMessage,
        handleResolveNight,
        handleSubmitDayVote,
        handleResolveDayVote,
        handleCastTribunalVote,
        handleResolveTribunalVote,
        handleLeaveGameSession,
        handleGetSessionSnapshot,
        resolveJokerTeammateSockets,
        resolveChatRecipientSockets,
        resolveSessionParticipantSockets,
    },
}

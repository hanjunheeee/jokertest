// 채팅 보내기 파일
// 채팅 prepare/commit (이모티콘 비우기는 판 정리라 core/cleanup.js로 옮김)
// prepare = 검사만 하고 기록 안 함, commit = 다시 확인하고 기록함 (실패한 요청이 간격을 안 먹게)
const crypto = require('crypto')
const { findActorSession } = require('../core/lookup')
const { getPlayerGameId, getSessionById } = require('../queries')
const { GAME_ROLES } = require('../core/roles')
const { assertSessionNotEnded } = require('../core/terminal')
const { CHAT_MIN_INTERVAL_MS, CHAT_COMMIT_MAX_AGE_MS } = require('./constants')
const { sanitizeChatText, isInvalidClockValue, getChatRateLimitMap, resolveGameChatChannel } = require('./rules')

// prepare가 만든 것만 commit 되게 기록, 밖에 안 내보냄
// 키 = prepare가 돌려준 객체, 값 = 그때 값 복사본 (얼려 둠)
// 밖에서 비슷한 객체 만들어 와도 키가 달라서 통과 못 함
const preparedChats = new WeakMap()

// 메시지 id 만들기, 실패·빈 값이면 거절
function makeMsgId(idFn) {
    let rawMessageId
    // id 만드는 함수가 터져도 서버는 안 죽게 잡음
    try {
        rawMessageId = idFn()
    } catch (err) {
        return { ok: false, code: 'ID_GENERATION_ERROR' }
    }
    // 문자열 아니거나 공백뿐이면 쓸 수 없는 id
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        return { ok: false, code: 'INVALID_MESSAGE_ID' }
    }
    return { ok: true, messageId: rawMessageId.trim() }
}

// commit 때 받은 게 prepare가 준 그대로인지 비교
function isSamePrepared(prepared, capability) {
    // 바깥 칸: 판·채널·보낸 사람·닉네임·글·시각·날짜 하나라도 바뀌면 거절
    if (
        prepared.ok !== true ||
        prepared.session !== capability.session ||
        prepared.channel !== capability.channel ||
        prepared.actorUuid !== capability.actorUuid ||
        prepared.nickname !== capability.nickname ||
        prepared.sanitizedText !== capability.text ||
        prepared.sentAt !== capability.sentAt ||
        prepared.dayIndex !== capability.dayIndex
    ) {
        return false
    }

    // 안쪽 message도 칸마다 비교 (객체 안만 몰래 바꾸는 것 막기)
    const message = prepared.message
    if (typeof message !== 'object' || message === null) return false
    const canonical = capability.message
    return (
        message.gameId === canonical.gameId &&
        message.messageId === canonical.messageId &&
        message.senderUuid === canonical.senderUuid &&
        message.nickname === canonical.nickname &&
        message.text === canonical.text &&
        message.sentAt === canonical.sentAt &&
        message.dayIndex === canonical.dayIndex
    )
}

// 밤 역할 채팅 검사, 죽은 광대도 가능
function prepareJokerChatMessage(uuid, gameId, text, { now = Date.now } = {}) {
    // 판 id 확인 + 내 판·판 안의 나 찾기, 끝난 판이면 거절 (옛 판 화면에서 보낸 것 거절)
    const found = findActorSession(uuid, gameId, { checkEnded: true })
    if (!found.ok) return found
    const { session, actor } = found

    // 밤에만, 산 사람만 (광대는 죽어도 됨)
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    // 글 검사
    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    // 시계 값이 정상 숫자인지 (시험에서 시계 바꿔 끼울 때 대비)
    const sentAt = now()
    if (isInvalidClockValue(sentAt)) return { ok: false, code: 'INVALID_CLOCK_VALUE' }

    // 채널 = 내 역할, 마지막으로 보낸 지 0.5초 안 됐으면 거절
    const channel = actor.role
    const lastSentAt = getChatRateLimitMap(session, channel).get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    // 아직 기록 안 함, 보낸 시각은 commit 때 기록
    return { ok: true, session, channel, actorUuid: uuid, sanitizedText: sanitized.text, sentAt }
}

// 밤 역할 채팅 보낸 시각 기록
function commitJokerChatMessage(session, uuid, sentAt) {
    // prepare 뒤에 판이 끝났을 수 있어서 다시 확인
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 그사이 밤이 끝났거나 자격 잃었으면 거절
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (session.phase !== 'NIGHT') return { ok: false, code: 'INVALID_PHASE' }
    if (actor.alive !== true && actor.role !== GAME_ROLES.JOKER) return { ok: false, code: 'NOT_ELIGIBLE' }

    // 보낸 시각 기록 = 다음 채팅 간격 계산 기준
    const rateLimitMap = getChatRateLimitMap(session, actor.role)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    rateLimitMap.set(uuid, sentAt)
    return { ok: true }
}

// 낮 채팅 검사 + 메시지 만들기, 아직 기록 안 함
function prepareGameChatMessage(uuid, gameId, text, { now = Date.now, idFn = () => crypto.randomUUID() } = {}) {
    // 판 id 확인 + 내 판·판 안의 나 찾기, 끝난 판이면 거절 (옛 판 화면에서 보낸 것 거절)
    const found = findActorSession(uuid, gameId, { checkEnded: true })
    if (!found.ok) return found
    const { session, actor } = found

    // 어느 채널로 갈지 (산 사람, 낮·재판 때만)
    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed

    // 글 검사
    const sanitized = sanitizeChatText(text)
    if (!sanitized.ok) return sanitized

    // 시계 값이 정상 숫자인지
    const sentAt = now()
    if (isInvalidClockValue(sentAt)) return { ok: false, code: 'INVALID_CLOCK_VALUE' }

    // 마지막으로 보낸 지 0.5초 안 됐으면 거절
    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }
    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'RATE_LIMITED' }
    }

    // 메시지 id 만들기
    const created = makeMsgId(idFn)
    if (!created.ok) return created

    // 방 사람들한테 보낼 메시지 본체
    const message = {
        gameId: session.id,
        messageId: created.messageId,
        senderUuid: uuid,
        nickname: actor.nickname,
        text: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
    }

    // socket 쪽에 돌려줄 값 (commit 때 이걸 그대로 다시 넘겨야 함)
    const prepared = {
        ok: true,
        session,
        channel: routed.channel,
        actorUuid: uuid,
        nickname: actor.nickname,
        sanitizedText: sanitized.text,
        sentAt,
        dayIndex: session.dayIndex,
        message: { ...message },
    }

    // 원본 값은 얼려서 따로 보관, commit 때 이거랑 비교
    preparedChats.set(
        prepared,
        Object.freeze({
            session,
            gameId: session.id,
            channel: routed.channel,
            actorUuid: uuid,
            nickname: actor.nickname,
            text: sanitized.text,
            sentAt,
            dayIndex: session.dayIndex,
            messageId: created.messageId,
            message: Object.freeze({ ...message }),
        }),
    )

    return prepared
}

// prepare 그대로인지·5초 안인지 다시 보고 기록
function commitGameChatMessage(prepared, { now = Date.now } = {}) {
    // prepare가 만든 객체인지 (보관함에 없으면 가짜거나 이미 쓴 것)
    if (typeof prepared !== 'object' || prepared === null) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    const capability = preparedChats.get(prepared)
    if (!capability) return { ok: false, code: 'STALE_CHAT_REQUEST' }
    if (!isSamePrepared(prepared, capability)) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    // 여기부터는 받은 값 말고 보관해 둔 원본만 사용
    const { session, actorUuid: uuid, sentAt } = capability

    // 그사이 다른 판으로 옮겼거나 판이 바뀌었으면 거절
    const currentGameId = getPlayerGameId(uuid)
    if (!currentGameId) return { ok: false, code: 'NOT_IN_SESSION' }
    const currentSession = getSessionById(currentGameId)
    if (!currentSession) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (currentSession !== session) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (session.id !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }
    if (capability.gameId !== currentGameId) return { ok: false, code: 'STALE_SESSION_MISMATCH' }

    // 그사이 판에서 빠졌거나 닉네임이 바뀌었으면 거절
    const actor = session.players.get(uuid)
    if (!actor) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.uuid !== uuid) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (actor.nickname !== capability.nickname) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    // 그사이 판이 끝났으면 거절
    const endedCheck = assertSessionNotEnded(session)
    if (!endedCheck.ok) return endedCheck

    // 그사이 죽었거나 단계·날짜가 넘어가서 채널이 달라졌으면 거절
    const routed = resolveGameChatChannel(session, actor)
    if (!routed.ok) return routed
    if (routed.channel !== capability.channel) return { ok: false, code: 'STALE_CHAT_CHANNEL' }
    if (session.dayIndex !== capability.dayIndex) return { ok: false, code: 'STALE_CHAT_REQUEST' }

    // 보낸 시각이 정상 숫자인지, 메시지 안 시각이랑 같은지
    if (isInvalidClockValue(sentAt)) return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    if (capability.message.sentAt !== sentAt) return { ok: false, code: 'INVALID_CLOCK_VALUE' }

    // 지금 시각 확인, 미래에서 왔거나 prepare 뒤 5초 넘었으면 거절
    const committedAt = now()
    if (isInvalidClockValue(committedAt)) return { ok: false, code: 'INVALID_CLOCK_VALUE' }
    if (sentAt > committedAt) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    if (committedAt - sentAt > CHAT_COMMIT_MAX_AGE_MS) return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }

    const rateLimitMap = getChatRateLimitMap(session, routed.channel)
    if (!(rateLimitMap instanceof Map)) return { ok: false, code: 'INVALID_CHAT_CHANNEL' }

    // prepare 뒤에 다른 채팅이 먼저 기록됐으면 간격 다시 확인
    const lastSentAt = rateLimitMap.get(uuid)
    if (lastSentAt !== undefined && sentAt - lastSentAt < CHAT_MIN_INTERVAL_MS) {
        return { ok: false, code: 'STALE_CHAT_TIMESTAMP' }
    }

    // 한 번 쓴 건 보관함에서 지움 (같은 걸로 두 번 commit 못 하게), 보낸 시각 기록
    preparedChats.delete(prepared)
    rateLimitMap.set(uuid, sentAt)
    return { ok: true, gameId: session.id, channel: routed.channel, message: { ...capability.message } }
}

module.exports = {
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
}
